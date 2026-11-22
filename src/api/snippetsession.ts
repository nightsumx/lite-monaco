// 片段会话(移植自 VS Code editor/contrib/snippet/browser/snippetSession.ts)。
//
// OneSnippet = 一个光标上的一份片段(占位符装饰 + 前进/后退);SnippetSession = 所有光标的 OneSnippet + 嵌套合并。
// 和补全里的 `expandSnippet`(core/feature/snippet.ts,补全接受时就地展开)是两套独立实现:这套是 Monaco 的
// SnippetController2 会话模型,对外给 insertSnippet / 代码动作 / 外部宿主用;补全那套不动。
//
// 适配点(Monaco → lite-monaco):
//   - 占位符装饰走 `editor.changeDecorations`(lite-monaco 的装饰挂在编辑器上,不在 model 上)
//   - `executeEdits` 的 cursorStateComputer 拿到的逆操作带 identifier / textChange(commands.ts 已补齐)
//   - label / workspace 没有 DI,从 `snippetServices(editor)` 取(宿主 setSnippetServices 登记,没登记就用缺省)
import { Position, Range, Selection } from './position'
import type { IPosition } from './position'
import type { LiteMonacoEditor } from './types'
import type { IIdentifiedSingleEditOperation, IValidEditOperation } from './commands'
import { TrackedRangeStickiness, type IModelDecorationOptions } from './decorations'
import {
    Choice, Marker, Placeholder, SnippetParser, Text, TextmateSnippet,
} from '../core/feature/snippetparser'
import {
    ClipboardBasedVariableResolver, CommentBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver,
    RandomBasedVariableResolver, SelectionBasedVariableResolver, TimeBasedVariableResolver, WorkspaceBasedVariableResolver,
    defaultLanguageConfigurationService,
    type ILabelService, type ILanguageConfigurationService, type IOvertypingCapturer, type IWorkspaceContextService,
} from './snippetvariables'

type ITextModel = NonNullable<ReturnType<LiteMonacoEditor['getModel']>>

// ───────────── 编辑器服务(Monaco 里是 invokeWithinContext 取的) ─────────────

export interface ISnippetServices {
    labelService?: ILabelService
    workspaceService?: IWorkspaceContextService
}

const servicesOf = new WeakMap<object, ISnippetServices>()

/** 宿主给某个编辑器登记片段变量要用的服务(TM_DIRECTORY / TM_FILEPATH / WORKSPACE_* 用) */
export function setSnippetServices(editor: object, services: ISnippetServices | null): void {
    if (services) servicesOf.set(editor, services)
    else servicesOf.delete(editor)
}

const DEFAULT_LABEL: ILabelService = { getUriLabel: uri => uri.fsPath }

export function snippetServices(editor: object): Required<Pick<ISnippetServices, 'labelService'>> & ISnippetServices {
    const s = servicesOf.get(editor)
    return { labelService: DEFAULT_LABEL, ...s }
}

// ───────────── 小工具 ─────────────

const LF = 10
const CR = 13

function groupBy<T>(data: readonly T[], compare: (a: T, b: T) => number): T[][] {
    const result: T[][] = []
    let currentGroup: T[] | undefined
    for (const element of data.slice(0).sort(compare)) {
        if (!currentGroup || compare(currentGroup[0], element) !== 0) {
            currentGroup = [element]
            result.push(currentGroup)
        } else currentGroup.push(element)
    }
    return result
}

function getLeadingWhitespace(str: string, start = 0, end: number = str.length): string {
    for (let i = start; i < end; i++) {
        const c = str.charCodeAt(i)
        if (c !== 32 && c !== 9) return str.substring(start, i)
    }
    return str.substring(start, end)
}

const sel = (r: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }) =>
    new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)

const edit = (range: Range, text: string): IIdentifiedSingleEditOperation => ({ range, text }) // Monaco EditOperation.replace:不带 forceMoveMarkers

// ───────────── OneSnippet ─────────────

const DECOR: Record<'active' | 'inactive' | 'activeFinal' | 'inactiveFinal', IModelDecorationOptions> = {
    active: { description: 'snippet-placeholder-1', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
    inactive: { description: 'snippet-placeholder-2', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'snippet-placeholder' },
    activeFinal: { description: 'snippet-placeholder-3', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
    inactiveFinal: { description: 'snippet-placeholder-4', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'finish-snippet-placeholder' },
}

export class OneSnippet {

    private _placeholderDecorations?: Map<Placeholder, string>
    private _placeholderGroups: Placeholder[][]
    private _offset = -1
    _placeholderGroupsIdx: number
    _nestingLevel = 1

    constructor(
        private readonly _editor: LiteMonacoEditor,
        private readonly _snippet: TextmateSnippet,
        private readonly _snippetLineLeadingWhitespace: string,
    ) {
        this._placeholderGroups = groupBy(_snippet.placeholders, Placeholder.compareByIndex)
        this._placeholderGroupsIdx = -1
    }

    initialize(textChange: { newPosition: number }): void {
        this._offset = textChange.newPosition
    }

    dispose(): void {
        if (this._placeholderDecorations) this._editor.removeDecorations([...this._placeholderDecorations.values()])
        this._placeholderGroups.length = 0
    }

    private _initDecorations(): void {
        if (this._offset === -1) throw new Error(`Snippet not initialized!`)
        if (this._placeholderDecorations) return // already initialized

        this._placeholderDecorations = new Map<Placeholder, string>()
        const model = this._editor.getModel()!

        this._editor.changeDecorations(accessor => {
            // 每个占位符一条装饰
            for (const placeholder of this._snippet.placeholders) {
                const placeholderOffset = this._snippet.offset(placeholder)
                const placeholderLen = this._snippet.fullLen(placeholder)
                const range = Range.fromPositions(
                    model.getPositionAt(this._offset + placeholderOffset),
                    model.getPositionAt(this._offset + placeholderOffset + placeholderLen),
                )
                const options = placeholder.isFinalTabstop ? DECOR.inactiveFinal : DECOR.inactive
                this._placeholderDecorations!.set(placeholder, accessor.addDecoration(range, options))
            }
        })
    }

    move(fwd: boolean | undefined): Selection[] {
        const model = this._editor.getModel()
        if (!model) return []

        this._initDecorations()

        // 占位符带 transform:离开时把当前文本变换一下
        if (this._placeholderGroupsIdx >= 0) {
            const operations: IIdentifiedSingleEditOperation[] = []

            for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
                if (placeholder.transform) {
                    const id = this._placeholderDecorations!.get(placeholder)!
                    const range = model.getDecorationRange(id)!
                    const currentValue = model.getValueInRange(range)
                    const transformedValueLines = placeholder.transform.resolve(currentValue).split(/\r\n|\r|\n/)
                    // 变换出来的多行要补缩进
                    for (let i = 1; i < transformedValueLines.length; i++) {
                        transformedValueLines[i] = model.normalizeIndentation(this._snippetLineLeadingWhitespace + transformedValueLines[i])
                    }
                    operations.push(edit(range, transformedValueLines.join(model.getEOL())))
                }
            }
            if (operations.length > 0) this._editor.executeEdits('snippet.placeholderTransform', operations)
        }

        let couldSkipThisPlaceholder = false
        if (fwd === true && this._placeholderGroupsIdx < this._placeholderGroups.length - 1) {
            this._placeholderGroupsIdx += 1
            couldSkipThisPlaceholder = true
        } else if (fwd === false && this._placeholderGroupsIdx > 0) {
            this._placeholderGroupsIdx -= 1
            couldSkipThisPlaceholder = true
        }
        // else:当前占位符的选区可能不准了,原样恢复

        const newSelections = this._editor.changeDecorations(accessor => {

            const activePlaceholders = new Set<Placeholder>()

            // 当前 tabstop 的装饰在边上打字要往里长;特例:最终 tabstop、包着当前占位符的占位符
            const selections: Selection[] = []
            for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
                const id = this._placeholderDecorations!.get(placeholder)!
                const range = model.getDecorationRange(id)!
                selections.push(sel(range))

                // 空区间但创作时不空 = 占位符被删了;这一组全是这样才跳过
                couldSkipThisPlaceholder = couldSkipThisPlaceholder && this._hasPlaceholderBeenCollapsed(placeholder)

                accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? DECOR.activeFinal : DECOR.active)
                activePlaceholders.add(placeholder)

                for (const enclosingPlaceholder of this._snippet.enclosingPlaceholders(placeholder)) {
                    const eid = this._placeholderDecorations!.get(enclosingPlaceholder)!
                    accessor.changeDecorationOptions(eid, enclosingPlaceholder.isFinalTabstop ? DECOR.activeFinal : DECOR.active)
                    activePlaceholders.add(enclosingPlaceholder)
                }
            }

            // 不活跃的 tabstop 不再长
            for (const [placeholder, id] of this._placeholderDecorations!) {
                if (!activePlaceholders.has(placeholder)) {
                    accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? DECOR.inactiveFinal : DECOR.inactive)
                }
            }

            return selections
        })

        return !couldSkipThisPlaceholder ? newSelections ?? [] : this.move(fwd)
    }

    private _hasPlaceholderBeenCollapsed(placeholder: Placeholder): boolean {
        // 占位符创作时不空、装饰现在空 = 被删光了;它的所有祖先占位符同理
        let marker: Marker | undefined = placeholder
        while (marker) {
            if (marker instanceof Placeholder) {
                const id = this._placeholderDecorations!.get(marker)!
                const range = this._editor.getModel()!.getDecorationRange(id)!
                if (range.isEmpty() && marker.toString().length > 0) return true
            }
            marker = marker.parent
        }
        return false
    }

    get isAtFirstPlaceholder() {
        return this._placeholderGroupsIdx <= 0 || this._placeholderGroups.length === 0
    }

    get isAtLastPlaceholder() {
        return this._placeholderGroupsIdx === this._placeholderGroups.length - 1
    }

    get hasPlaceholder() {
        return this._snippet.placeholders.length > 0
    }

    /** 没有占位符,或只有处在最末尾的最终占位符 */
    get isTrivialSnippet(): boolean {
        if (this._snippet.placeholders.length === 0) return true
        if (this._snippet.placeholders.length === 1) {
            const [placeholder] = this._snippet.placeholders
            if (placeholder.isFinalTabstop && this._snippet.rightMostDescendant === placeholder) return true
        }
        return false
    }

    computePossibleSelections() {
        const result = new Map<number, Range[]>()
        for (const placeholdersWithEqualIndex of this._placeholderGroups) {
            let ranges: Range[] | undefined

            for (const placeholder of placeholdersWithEqualIndex) {
                if (placeholder.isFinalTabstop) break // 最终 tabstop 不算

                if (!ranges) {
                    ranges = []
                    result.set(placeholder.index, ranges)
                }

                const id = this._placeholderDecorations!.get(placeholder)!
                const range = this._editor.getModel()!.getDecorationRange(id)
                if (!range) {
                    // 有个占位符丢了装饰:当它(连同镜像)不存在
                    result.delete(placeholder.index)
                    break
                }
                ranges.push(range)
            }
        }
        return result
    }

    get activeChoice(): { choice: Choice, range: Range } | undefined {
        if (!this._placeholderDecorations) return undefined
        const placeholder = this._placeholderGroups[this._placeholderGroupsIdx][0]
        if (!placeholder?.choice) return undefined
        const id = this._placeholderDecorations.get(placeholder)
        if (!id) return undefined
        const range = this._editor.getModel()!.getDecorationRange(id)
        if (!range) return undefined
        return { range, choice: placeholder.choice }
    }

    get hasChoice(): boolean {
        let result = false
        this._snippet.walk(marker => {
            result = marker instanceof Choice
            return !result
        })
        return result
    }

    merge(others: OneSnippet[]): void {

        const model = this._editor.getModel()!
        this._nestingLevel *= 10

        this._editor.changeDecorations(accessor => {

            // 每个活跃占位符取一份嵌套片段合进去(`$1foo$1foo` 会有多个)。都按光标顺序排好了,从头 shift 即可
            for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
                const nested = others.shift()!
                console.assert(nested._offset !== -1)
                console.assert(!nested._placeholderDecorations)

                // 把嵌套片段的占位符序号挤到插入点之后,保证走的顺序对
                const indexLastPlaceholder = nested._snippet.placeholderInfo.last!.index

                for (const nestedPlaceholder of nested._snippet.placeholderInfo.all) {
                    if (nestedPlaceholder.isFinalTabstop) {
                        nestedPlaceholder.index = placeholder.index + ((indexLastPlaceholder + 1) / this._nestingLevel)
                    } else {
                        nestedPlaceholder.index = placeholder.index + (nestedPlaceholder.index / this._nestingLevel)
                    }
                }
                this._snippet.replace(placeholder, nested._snippet.children)

                // 被插入的那个占位符连同装饰一起删掉
                const id = this._placeholderDecorations!.get(placeholder)!
                accessor.removeDecoration(id)
                this._placeholderDecorations!.delete(placeholder)

                // 每个新占位符建一条装饰,盯着它怎么长/缩
                for (const np of nested._snippet.placeholders) {
                    const placeholderOffset = nested._snippet.offset(np)
                    const placeholderLen = nested._snippet.fullLen(np)
                    const range = Range.fromPositions(
                        model.getPositionAt(nested._offset + placeholderOffset),
                        model.getPositionAt(nested._offset + placeholderOffset + placeholderLen),
                    )
                    this._placeholderDecorations!.set(np, accessor.addDecoration(range, DECOR.inactive))
                }
            }

            // 最后按序号重新分组
            this._placeholderGroups = groupBy(this._snippet.placeholders, Placeholder.compareByIndex)
        })
    }

    getEnclosingRange(): Range | undefined {
        let result: Range | undefined
        const model = this._editor.getModel()!
        for (const decorationId of this._placeholderDecorations!.values()) {
            const placeholderRange = model.getDecorationRange(decorationId) ?? undefined
            result = !result ? placeholderRange : result.plusRange(placeholderRange!)
        }
        return result
    }
}

// ───────────── SnippetSession ─────────────

export interface ISnippetSessionInsertOptions {
    overwriteBefore: number
    overwriteAfter: number
    adjustWhitespace: boolean
    clipboardText: string | undefined
    overtypingCapturer: IOvertypingCapturer | undefined
}

const _defaultOptions: ISnippetSessionInsertOptions = {
    overwriteBefore: 0,
    overwriteAfter: 0,
    adjustWhitespace: true,
    clipboardText: undefined,
    overtypingCapturer: undefined,
}

export interface ISnippetEdit {
    range: Range
    template: string
    keepWhitespace?: boolean
}

type SnippetEdits = { edits: IIdentifiedSingleEditOperation[], snippets: OneSnippet[] }

const selectionsOf = (editor: LiteMonacoEditor): Selection[] => editor.getSelections()!.map(s => Selection.liftSelection(s))

export class SnippetSession {

    static adjustWhitespace(model: ITextModel, position: IPosition, adjustIndentation: boolean, snippet: TextmateSnippet, filter?: Set<Marker>): string {
        const line = model.getLineContent(position.lineNumber)
        const lineLeadingWhitespace = getLeadingWhitespace(line, 0, position.column - 1)

        // 已经插入的片段文本
        let snippetTextString: string | undefined

        snippet.walk(marker => {
            // 只管不在 choice 里的文本节点
            if (!(marker instanceof Text) || marker.parent instanceof Choice) return true

            // 有 filter 时只管 filter 里的
            if (filter && !filter.has(marker)) return true

            const lines = marker.value.split(/\r\n|\r|\n/)

            if (adjustIndentation) {
                // 调缩进:片段开头不额外缩进只规整;第 N+1 行都额外缩进并规整;换行后的文本开头同样处理
                const offset = snippet.offset(marker)
                if (offset === 0) {
                    lines[0] = model.normalizeIndentation(lines[0])
                } else {
                    snippetTextString = snippetTextString ?? snippet.toString()
                    const prevChar = snippetTextString.charCodeAt(offset - 1)
                    if (prevChar === LF || prevChar === CR) {
                        lines[0] = model.normalizeIndentation(lineLeadingWhitespace + lines[0])
                    }
                }
                for (let i = 1; i < lines.length; i++) {
                    lines[i] = model.normalizeIndentation(lineLeadingWhitespace + lines[i])
                }
            }

            const newValue = lines.join(model.getEOL())
            if (newValue !== marker.value) {
                marker.parent.replace(marker, [new Text(newValue)])
                snippetTextString = undefined
            }
            return true
        })

        return lineLeadingWhitespace
    }

    static adjustSelection(model: ITextModel, selection: Selection, overwriteBefore: number, overwriteAfter: number): Selection {
        if (overwriteBefore !== 0 || overwriteAfter !== 0) {
            // overwrite[Before|After] 按光标位置算,所以围着位置调
            const { positionLineNumber, positionColumn } = selection
            const positionColumnBefore = positionColumn - overwriteBefore
            const positionColumnAfter = positionColumn + overwriteAfter

            const range = model.validateRange({
                startLineNumber: positionLineNumber,
                startColumn: positionColumnBefore,
                endLineNumber: positionLineNumber,
                endColumn: positionColumnAfter,
            })

            selection = Selection.createWithDirection(
                range.startLineNumber, range.startColumn,
                range.endLineNumber, range.endColumn,
                selection.getDirection(),
            )
        }
        return selection
    }

    static createEditsAndSnippetsFromSelections(editor: LiteMonacoEditor, template: string, overwriteBefore: number, overwriteAfter: number, enforceFinalTabstop: boolean, adjustWhitespace: boolean, clipboardText: string | undefined, overtypingCapturer: IOvertypingCapturer | undefined, languageConfigurationService: ILanguageConfigurationService): SnippetEdits {
        const edits: IIdentifiedSingleEditOperation[] = []
        const snippets: OneSnippet[] = []

        const model = editor.getModel()
        if (!model) return { edits, snippets }

        const { labelService, workspaceService } = snippetServices(editor)
        const modelBasedVariableResolver = new ModelBasedVariableResolver(labelService, model)
        const readClipboardText = () => clipboardText

        const primary = Selection.liftSelection(editor.getSelection()!)

        // 主光标 overwrite[Before|After] 选中的文本:只有副光标扩出来的也是同一段文本才跟着扩
        const firstBeforeText = model.getValueInRange(SnippetSession.adjustSelection(model, primary, overwriteBefore, 0))
        const firstAfterText = model.getValueInRange(SnippetSession.adjustSelection(model, primary, 0, overwriteAfter))

        // 记下主光标行第一个非空白列,用来决定副光标要不要无视 keepWhitespace
        const firstLineFirstNonWhitespace = model.getLineFirstNonWhitespaceColumn(primary.positionLineNumber)

        // 按起点排序但记住原序号:按偏移算选区时不改变主光标
        const indexedSelections = selectionsOf(editor)
            .map((selection, idx) => ({ selection, idx }))
            .sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection))

        for (const { selection, idx } of indexedSelections) {

            // 用 overwriteBefore / overwriteAfter 扩选区,扩出来的文本要和主光标一致才算数
            let extensionBefore = SnippetSession.adjustSelection(model, selection, overwriteBefore, 0)
            let extensionAfter = SnippetSession.adjustSelection(model, selection, 0, overwriteAfter)
            if (firstBeforeText !== model.getValueInRange(extensionBefore)) extensionBefore = selection
            if (firstAfterText !== model.getValueInRange(extensionAfter)) extensionAfter = selection

            // 前后扩展合成一个选区
            const snippetSelection = selection
                .setStartPosition(extensionBefore.startLineNumber, extensionBefore.startColumn)
                .setEndPosition(extensionAfter.endLineNumber, extensionAfter.endColumn)

            const snippet = new SnippetParser().parse(template, true, enforceFinalTabstop)

            // 按插入点的缩进 / 空白规则调模板(每个光标可能不同):被要求时,或者副光标行首空白不同
            const start = snippetSelection.getStartPosition()
            const snippetLineLeadingWhitespace = SnippetSession.adjustWhitespace(
                model, start,
                adjustWhitespace || (idx > 0 && firstLineFirstNonWhitespace !== model.getLineFirstNonWhitespaceColumn(selection.positionLineNumber)),
                snippet,
            )

            snippet.resolveVariables(new CompositeSnippetVariableResolver([
                modelBasedVariableResolver,
                new ClipboardBasedVariableResolver(readClipboardText, idx, indexedSelections.length, editor.getOption('multiCursorPaste' as never) === 'spread'),
                new SelectionBasedVariableResolver(model, selection, idx, overtypingCapturer),
                new CommentBasedVariableResolver(model, selection, languageConfigurationService),
                new TimeBasedVariableResolver,
                new WorkspaceBasedVariableResolver(workspaceService),
                new RandomBasedVariableResolver,
            ]))

            // 片段按原始选区序号存:主光标不因起点不是最小而变成副光标
            edits[idx] = edit(snippetSelection, snippet.toString())
            edits[idx].identifier = { major: idx, minor: 0 } // 标记,这样只用我们自己的逆操作算结束光标
            edits[idx]._isTracked = true
            snippets[idx] = new OneSnippet(editor, snippet, snippetLineLeadingWhitespace)
        }

        return { edits, snippets }
    }

    static createEditsAndSnippetsFromEdits(editor: LiteMonacoEditor, snippetEdits: ISnippetEdit[], enforceFinalTabstop: boolean, adjustWhitespace: boolean, clipboardText: string | undefined, overtypingCapturer: IOvertypingCapturer | undefined, languageConfigurationService: ILanguageConfigurationService): SnippetEdits {

        const model = editor.getModel()
        if (!model || snippetEdits.length === 0) return { edits: [], snippets: [] }

        const edits: IIdentifiedSingleEditOperation[] = []

        const parser = new SnippetParser()
        const snippet = new TextmateSnippet()

        const { labelService, workspaceService } = snippetServices(editor)
        const primary = Selection.liftSelection(editor.getSelection()!)

        // 片段变量
        const resolver = new CompositeSnippetVariableResolver([
            new ModelBasedVariableResolver(labelService, model),
            new ClipboardBasedVariableResolver(() => clipboardText, 0, editor.getSelections()!.length, editor.getOption('multiCursorPaste' as never) === 'spread'),
            new SelectionBasedVariableResolver(model, primary, 0, overtypingCapturer),
            new CommentBasedVariableResolver(model, primary, languageConfigurationService),
            new TimeBasedVariableResolver,
            new WorkspaceBasedVariableResolver(workspaceService),
            new RandomBasedVariableResolver,
        ])

        snippetEdits = snippetEdits.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range))
        let offset = 0
        for (let i = 0; i < snippetEdits.length; i++) {

            const { range, template, keepWhitespace } = snippetEdits[i]

            // 两个编辑之间的空档作为文本节点追加,占位符偏移才对得上
            if (i > 0) {
                const lastRange = snippetEdits[i - 1].range
                const textRange = Range.fromPositions(lastRange.getEndPosition(), range.getStartPosition())
                const textNode = new Text(model.getValueInRange(textRange))
                snippet.appendChild(textNode)
                offset += textNode.value.length
            }

            const newNodes = parser.parseFragment(template, snippet)
            SnippetSession.adjustWhitespace(model, range.getStartPosition(), keepWhitespace !== undefined ? !keepWhitespace : adjustWhitespace, snippet, new Set(newNodes))
            snippet.resolveVariables(resolver)

            const snippetText = snippet.toString()
            const snippetFragmentText = snippetText.slice(offset)
            offset = snippetText.length

            const e = edit(range, snippetFragmentText)
            e.identifier = { major: i, minor: 0 } // 标记,这样只用我们自己的逆操作算结束光标
            e._isTracked = true
            edits.push(e)
        }

        parser.ensureFinalTabstop(snippet, enforceFinalTabstop, true)

        return { edits, snippets: [new OneSnippet(editor, snippet, '')] }
    }

    private readonly _templateMerges: [number, number, string | ISnippetEdit[]][] = []
    private _snippets: OneSnippet[] = []

    constructor(
        private readonly _editor: LiteMonacoEditor,
        private readonly _template: string | ISnippetEdit[],
        private readonly _options: ISnippetSessionInsertOptions = _defaultOptions,
        private readonly _languageConfigurationService: ILanguageConfigurationService = defaultLanguageConfigurationService,
    ) { }

    dispose(): void {
        for (const s of this._snippets) s.dispose()
    }

    _logInfo(): string {
        return `template="${this._template}", merged_templates="${this._templateMerges.join(' -> ')}"`
    }

    insert(): void {
        if (!this._editor.getModel()) return

        // 做插入的编辑,从第一批选区开始
        const { edits, snippets } = typeof this._template === 'string'
            ? SnippetSession.createEditsAndSnippetsFromSelections(this._editor, this._template, this._options.overwriteBefore, this._options.overwriteAfter, false, this._options.adjustWhitespace, this._options.clipboardText, this._options.overtypingCapturer, this._languageConfigurationService)
            : SnippetSession.createEditsAndSnippetsFromEdits(this._editor, this._template, false, this._options.adjustWhitespace, this._options.clipboardText, this._options.overtypingCapturer, this._languageConfigurationService)

        this._snippets = snippets

        this._editor.executeEdits('snippet', edits, _undoEdits => {
            // 文本缓冲有时会自己抹掉自动空白,所以只看和我们有关的逆操作:我们的编辑有 identifier
            const undoEdits = _undoEdits.filter((e: IValidEditOperation) => !!e.identifier)
            for (let idx = 0; idx < snippets.length; idx++) snippets[idx].initialize(undoEdits[idx].textChange!)

            if (this._snippets[0].hasPlaceholder) return this._move(true)
            return undoEdits.map(e => Selection.fromPositions(e.range.getEndPosition()))
        })
        this._editor.revealRange(this._editor.getSelections()![0])
    }

    merge(template: string, options: ISnippetSessionInsertOptions = _defaultOptions): void {
        if (!this._editor.getModel()) return
        this._templateMerges.push([this._snippets[0]._nestingLevel, this._snippets[0]._placeholderGroupsIdx, template])
        const { edits, snippets } = SnippetSession.createEditsAndSnippetsFromSelections(this._editor, template, options.overwriteBefore, options.overwriteAfter, true, options.adjustWhitespace, options.clipboardText, options.overtypingCapturer, this._languageConfigurationService)

        this._editor.executeEdits('snippet', edits, _undoEdits => {
            const undoEdits = _undoEdits.filter((e: IValidEditOperation) => !!e.identifier)
            for (let idx = 0; idx < snippets.length; idx++) snippets[idx].initialize(undoEdits[idx].textChange!)

            // 平凡片段(没占位符或只有末尾的最终占位符)只是文本插入,不必并进现有片段
            const isTrivialSnippet = snippets[0].isTrivialSnippet
            if (!isTrivialSnippet) {
                for (const snippet of this._snippets) snippet.merge(snippets)
                console.assert(snippets.length === 0)
            }

            if (this._snippets[0].hasPlaceholder && !isTrivialSnippet) return this._move(undefined)
            return undoEdits.map(e => Selection.fromPositions(e.range.getEndPosition()))
        })
    }

    next(): void {
        const newSelections = this._move(true)
        this._editor.setSelections(newSelections)
        this._editor.revealPositionInCenterIfOutsideViewport(newSelections[0].getPosition() as Position)
    }

    prev(): void {
        const newSelections = this._move(false)
        this._editor.setSelections(newSelections)
        this._editor.revealPositionInCenterIfOutsideViewport(newSelections[0].getPosition() as Position)
    }

    private _move(fwd: boolean | undefined): Selection[] {
        const selections: Selection[] = []
        for (const snippet of this._snippets) selections.push(...snippet.move(fwd))
        return selections
    }

    get isAtFirstPlaceholder() { return this._snippets[0].isAtFirstPlaceholder }
    get isAtLastPlaceholder() { return this._snippets[0].isAtLastPlaceholder }
    get hasPlaceholder() { return this._snippets[0].hasPlaceholder }
    get hasChoice(): boolean { return this._snippets[0].hasChoice }
    get activeChoice(): { choice: Choice, range: Range } | undefined { return this._snippets[0].activeChoice }

    isSelectionWithinPlaceholders(): boolean {

        if (!this.hasPlaceholder) return false

        const selections = selectionsOf(this._editor)
        if (selections.length < this._snippets.length) {
            // 以 N 个选区进入片段模式、现在只剩 M < N 个:有片段没选区 → 取消
            return false
        }

        const allPossibleSelections = new Map<number, Range[]>()
        for (const snippet of this._snippets) {

            const possibleSelections = snippet.computePossibleSelections()

            // 第一个片段:找到包含至少一个选区的占位符(及其区间);其余片段必须用同一个占位符
            if (allPossibleSelections.size === 0) {
                for (const [index, ranges] of possibleSelections) {
                    ranges.sort(Range.compareRangesUsingStarts)
                    for (const selection of selections) {
                        if (ranges[0].containsRange(selection)) {
                            allPossibleSelections.set(index, [])
                            break
                        }
                    }
                }
            }

            // 第一个片段都没法和选区对上就返回 false
            if (allPossibleSelections.size === 0) return false

            // 把本片段这个占位符的区间都收进来
            allPossibleSelections.forEach((array, index) => {
                array.push(...possibleSelections.get(index)!)
            })
        }

        // 选区和占位符区间都排序,逐个检查区间包含对应选区
        selections.sort(Range.compareRangesUsingStarts as (a: Selection, b: Selection) => number)

        for (const [index, ranges] of allPossibleSelections) {
            if (ranges.length !== selections.length) {
                allPossibleSelections.delete(index)
                continue
            }

            ranges.sort(Range.compareRangesUsingStarts)

            for (let i = 0; i < ranges.length; i++) {
                if (!ranges[i].containsRange(selections[i])) {
                    allPossibleSelections.delete(index)
                    continue
                }
            }
        }

        // 对不上当前选区的都删了;一个不剩 = 选区已不在占位符里
        return allPossibleSelections.size > 0
    }

    public getEnclosingRange(): Range | undefined {
        let result: Range | undefined
        for (const snippet of this._snippets) {
            const snippetRange = snippet.getEnclosingRange()
            result = !result ? snippetRange : result.plusRange(snippetRange!)
        }
        return result
    }
}
