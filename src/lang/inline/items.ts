// 行内建议的项(移植自 inlineSuggestionItem.ts + provideInlineCompletions.ts 里的 InlineSuggestData / InlineSuggestionList)。
//
// 两种项:
//   · InlineCompletionItem:光标处的 ghost text。范围随用户编辑平移;用户照着打下去,它还「可见」。
//   · InlineEditItem:对文档若干处的改动(NES)。构造时 diff 成多段 StringReplacement,用户编辑逐段吸收,吸收完或冲突就丢弃。
// 项本身不可变:withEdit / withIdentity 返回新项,身份(identity)与引用计数跨版本保留。
import { Position, Range } from '../../api/position'
import type { IRange } from '../../api/position'
import { computeLineDiff } from '../../core/diff/linediff'
import { applyEditsToRanges, OffsetRange, StringEdit, StringReplacement } from './stringedit'
import { commonPrefixLength, commonSuffixLength, PositionOffsetTransformer, splitLines, TextEdit, TextReplacement } from './textedit'
import { singleTextRemoveCommonPrefix } from './ghosttext'
import type {
    InlineCompletion, InlineCompletionContextWithUuid, InlineCompletionEndOfLifeReason, InlineCompletionHint, InlineCompletions, InlineCompletionsDisposeReason,
    InlineCompletionsProvider, InlineSuggestRequestInfo, InlineModel, PartialAcceptInfo,
} from './types'
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from './types'

export interface SnippetInfo {
    snippet: string
    /** 可能和主范围不同 */
    range: Range
}
export type PartialAcceptance = { characters: number, count: number, ratio: number }
export type EditOp = { range: IRange, text: string | null }

// ───────────── 小工具 ─────────────

/** Monaco filters.matchesSubString 只当「是否子序列」用:word 的字符按序出现在 target 里(不分大小写) */
export function matchesSubString(word: string, target: string): boolean {
    word = word.toLowerCase()
    target = target.toLowerCase()
    let i = 0
    for (let j = 0; j < target.length && i < word.length; j++) if (word[i] === target[j]) i++
    return i === word.length
}

/** Monaco model.getLineIndentColumn:首个非空白列;整行空白 = 行尾列 */
export function lineIndentColumn(model: InlineModel, lineNumber: number): number {
    const text = model.getLineContent(lineNumber)
    let i = 0
    while (i < text.length && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++
    return i === text.length ? text.length + 1 : i + 1
}

export class Doc {
    readonly text: string
    readonly t: PositionOffsetTransformer
    constructor(model: InlineModel) {
        this.text = model.getValue()
        this.t = new PositionOffsetTransformer(this.text)
    }
    offsetRange(r: IRange): OffsetRange {
        return new OffsetRange(this.t.getOffset({ lineNumber: r.startLineNumber, column: r.startColumn }), this.t.getOffset({ lineNumber: r.endLineNumber, column: r.endColumn }))
    }
    textRepl(r: StringReplacement): TextReplacement { return new TextReplacement(this.t.getRange(r.replaceRange.start, r.replaceRange.endExclusive), r.newText) }
    range(r: OffsetRange): Range { return this.t.getRange(r.start, r.endExclusive) }
}

// ───────────── 提供方一次结果 ─────────────

/** 一次 provider 结果:引用计数,最后一个持有者放手时通知 provider 释放 */
export class InlineSuggestionList {
    private refCount = 0
    constructor(
        readonly inlineSuggestions: InlineCompletions,
        readonly inlineSuggestionsData: readonly InlineSuggestData[],
        readonly provider: InlineCompletionsProvider,
    ) { }
    addRef(): void { this.refCount++ }
    removeRef(reason: InlineCompletionsDisposeReason = { kind: 'other' }): void {
        this.refCount--
        if (this.refCount === 0) {
            // 还没上报过的项,在这里补报生命终结
            for (const item of this.inlineSuggestionsData) item.reportEndOfLife()
            this.provider.disposeInlineCompletions(this.inlineSuggestions, reason)
        }
    }
}

/** provider 返回的一项 + 请求上下文;上报显示/部分接受/生命终结给 provider */
export class InlineSuggestData {
    private _didShow = false
    private _didReportEndOfLife = false
    private _lastSetEndOfLifeReason: InlineCompletionEndOfLifeReason | undefined
    private _partiallyAcceptedCount = 0
    private _partiallyAcceptedSinceOriginal: PartialAcceptance = { characters: 0, ratio: 0, count: 0 }
    private _isPreceeded = false
    private _notShownReason: string | undefined

    constructor(
        readonly range: Range,
        readonly insertText: string,
        readonly snippetInfo: SnippetInfo | undefined,
        readonly uri: unknown,
        readonly hint: InlineCompletionHint | undefined,
        readonly additionalTextEdits: readonly EditOp[],
        readonly sourceInlineCompletion: InlineCompletion,
        readonly source: InlineSuggestionList,
        readonly context: InlineCompletionContextWithUuid,
        readonly isInlineEdit: boolean,
        private readonly _requestInfo: InlineSuggestRequestInfo,
        private readonly _providerRequestInfo: { startTime: number, endTime: number },
        private readonly _correlationId: string | undefined,
    ) { }

    get showInlineEditMenu(): boolean { return this.sourceInlineCompletion.showInlineEditMenu ?? false }
    get partialAccepts(): PartialAcceptance { return this._partiallyAcceptedSinceOriginal }

    reportShown(updatedInsertText: string): void {
        if (this._didShow) return
        this._didShow = true
        this.source.provider.handleItemDidShow?.(this.source.inlineSuggestions, this.sourceInlineCompletion, updatedInsertText)
    }

    reportPartialAccept(acceptedCharacters: number, info: PartialAcceptInfo, partialAcceptance: PartialAcceptance): void {
        this._partiallyAcceptedCount++
        const s = this._partiallyAcceptedSinceOriginal
        s.characters += partialAcceptance.characters
        s.ratio = Math.min(s.ratio + (1 - s.ratio) * partialAcceptance.ratio, 1)
        s.count += partialAcceptance.count
        this.source.provider.handlePartialAccept?.(this.source.inlineSuggestions, this.sourceInlineCompletion, acceptedCharacters, info)
    }

    /** 给 provider 报生命终结(只报一次);没给 reason 就用最近 set 的,再没有就当「被忽略」 */
    reportEndOfLife(reason?: InlineCompletionEndOfLifeReason): void {
        if (this._didReportEndOfLife) return
        this._didReportEndOfLife = true
        reason ??= this._lastSetEndOfLifeReason ?? { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: undefined }
        const p = this.source.provider
        if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected) p.handleRejection?.(this.source.inlineSuggestions, this.sourceInlineCompletion)
        p.handleEndOfLifetime?.(this.source.inlineSuggestions, this.sourceInlineCompletion, reason, {
            requestUuid: this.context.requestUuid,
            correlationId: this._correlationId,
            selectedSuggestionInfo: !!this.context.selectedSuggestionInfo,
            partiallyAccepted: this._partiallyAcceptedCount,
            partiallyAcceptedCountSinceOriginal: this._partiallyAcceptedSinceOriginal.count,
            partiallyAcceptedRatioSinceOriginal: this._partiallyAcceptedSinceOriginal.ratio,
            partiallyAcceptedCharactersSinceOriginal: this._partiallyAcceptedSinceOriginal.characters,
            shown: this._didShow,
            preceeded: this._isPreceeded,
            timeUntilProviderRequest: this._providerRequestInfo.startTime - this._requestInfo.startTime,
            timeUntilProviderResponse: this._providerRequestInfo.endTime - this._requestInfo.startTime,
            languageId: this._requestInfo.languageId,
            requestReason: this._requestInfo.reason,
            notShownReason: this._notShownReason,
        })
    }

    /** 只记 reason,等真正终结时再上报 */
    setEndOfLifeReason(reason: InlineCompletionEndOfLifeReason): void { this._lastSetEndOfLifeReason = reason }
    setIsPreceeded(partialAccepts: PartialAcceptance): void { this._isPreceeded = true; this._partiallyAcceptedSinceOriginal = partialAccepts }
    setNotShownReason(reason: string): void { this._notShownReason ??= reason }
}

// ───────────── 身份 ─────────────

/** 同一条建议跨版本(平移/换新结果)保持的身份 + 引用计数 */
export class InlineSuggestionIdentity {
    private static idCounter = 0
    readonly id = 'InlineCompletionIdentity' + InlineSuggestionIdentity.idCounter++
    private _refCount = 1
    private _jumpedTo = false
    get jumpedTo(): boolean { return this._jumpedTo }
    addRef(): void { this._refCount++ }
    removeRef(): void { this._refCount-- }
    setJumpTo(): void { this._jumpedTo = true }
}

/** 建议的「提示位置」(显示在别处的 inline edit),随编辑平移 */
export class InlineSuggestHint {
    static create(d: InlineCompletionHint): InlineSuggestHint { return new InlineSuggestHint(Range.lift(d.range), d.content, d.style, d.jumpToEdit) }
    private constructor(readonly range: Range, readonly content: string, readonly style: number, readonly jumpToEdit: boolean) { }
    withEdit(edit: StringEdit, doc: Doc): InlineSuggestHint | undefined {
        const r = applyEditsToRanges([doc.offsetRange(this.range)], edit)[0]
        return r ? new InlineSuggestHint(doc.range(r), this.content, this.style, this.jumpToEdit) : undefined
    }
}

// ───────────── 项的公共部分 ─────────────

abstract class ItemBase {
    constructor(protected readonly _data: InlineSuggestData, readonly identity: InlineSuggestionIdentity, readonly hint: InlineSuggestHint | undefined) { }
    get source(): InlineSuggestionList { return this._data.source }
    get isFromExplicitRequest(): boolean { return this._data.context.triggerKind === InlineCompletionTriggerKind.Explicit }
    get forwardStable(): boolean { return this.source.inlineSuggestions.enableForwardStability ?? false }
    get editRange(): Range { return this.getSingleTextEdit().range }
    get targetRange(): Range { return this.hint?.range && !this.hint.jumpToEdit ? this.hint.range : this.editRange }
    get insertText(): string { return this.getSingleTextEdit().text }
    get semanticId(): string { return this.hash }
    get command() { return this._data.sourceInlineCompletion.command }
    get warning() { return this._data.sourceInlineCompletion.warning }
    get showInlineEditMenu(): boolean { return !!this._data.sourceInlineCompletion.showInlineEditMenu }
    get hash(): string { return JSON.stringify([this.getSingleTextEdit().text, this.getSingleTextEdit().range.getStartPosition().toString()]) }
    get requestUuid(): string { return this._data.context.requestUuid }
    get partialAccepts(): PartialAcceptance { return this._data.partialAccepts }
    abstract getSingleTextEdit(): TextReplacement
    abstract withEdit(userEdit: StringEdit, model: InlineModel): InlineSuggestionItem | undefined
    abstract withIdentity(identity: InlineSuggestionIdentity): InlineSuggestionItem
    abstract canBeReused(model: InlineModel, position: Position): boolean

    addRef(): void { this.identity.addRef(); this.source.addRef() }
    removeRef(): void { this.identity.removeRef(); this.source.removeRef() }
    reportShown(): void { this._data.reportShown(this.insertText) }
    reportPartialAccept(acceptedCharacters: number, info: PartialAcceptInfo, p: PartialAcceptance): void { this._data.reportPartialAccept(acceptedCharacters, info, p) }
    reportEndOfLife(reason: InlineCompletionEndOfLifeReason): void { this._data.reportEndOfLife(reason) }
    setEndOfLifeReason(reason: InlineCompletionEndOfLifeReason): void { this._data.setEndOfLifeReason(reason) }
    setIsPreceeded(item: InlineSuggestionItem): void { this._data.setIsPreceeded(item.partialAccepts) }
    setNotShownReasonIfNotSet(reason: string): void { this._data.setNotShownReason(reason) }
    getSourceCompletion(): InlineCompletion { return this._data.sourceInlineCompletion }
}

export type InlineSuggestionItem = InlineEditItem | InlineCompletionItem

export const InlineSuggestionItem = {
    create(data: InlineSuggestData, model: InlineModel): InlineSuggestionItem {
        return !data.isInlineEdit && !data.uri ? InlineCompletionItem.create(data, model) : InlineEditItem.create(data, model)
    },
}

// ───────────── InlineCompletionItem ─────────────

export class InlineCompletionItem extends ItemBase {
    static create(data: InlineSuggestData, model: InlineModel): InlineCompletionItem {
        const doc = new Doc(model)
        const eol = model.getEOL()
        const insertText = data.insertText.replace(/\r\n|\r|\n/g, eol)
        const edit = reshapeInlineCompletion(new StringReplacement(doc.offsetRange(data.range), insertText), model, doc)
        const trimmedEdit = edit.removeCommonSuffixAndPrefix(doc.text)
        const textEdit = doc.textRepl(edit)
        const hint = data.hint ? InlineSuggestHint.create(data.hint) : undefined
        return new InlineCompletionItem(edit, trimmedEdit, textEdit, textEdit.range, data.snippetInfo, data.additionalTextEdits, data, new InlineSuggestionIdentity(), hint)
    }

    readonly isInlineEdit = false

    private constructor(
        private readonly _edit: StringReplacement,
        private readonly _trimmedEdit: StringReplacement,
        private readonly _textEdit: TextReplacement,
        private readonly _originalRange: Range,
        readonly snippetInfo: SnippetInfo | undefined,
        readonly additionalTextEdits: readonly EditOp[],
        data: InlineSuggestData,
        identity: InlineSuggestionIdentity,
        hint: InlineSuggestHint | undefined,
    ) { super(data, identity, hint) }

    override get hash(): string { return JSON.stringify(this._trimmedEdit.toJson()) }
    override getSingleTextEdit(): TextReplacement { return this._textEdit }

    override withIdentity(identity: InlineSuggestionIdentity): InlineCompletionItem {
        return new InlineCompletionItem(this._edit, this._trimmedEdit, this._textEdit, this._originalRange, this.snippetInfo, this.additionalTextEdits, this._data, identity, this.hint)
    }

    override withEdit(userEdit: StringEdit, model: InlineModel): InlineCompletionItem | undefined {
        const ranges = applyEditsToRanges([this._edit.replaceRange], userEdit)
        if (ranges.length === 0) return undefined
        const doc = new Doc(model)
        const newEdit = new StringReplacement(ranges[0], this._textEdit.text)
        let hint = this.hint
        if (hint) {
            hint = hint.withEdit(userEdit, doc)
            if (!hint) return undefined
        }
        return new InlineCompletionItem(newEdit, newEdit.removeCommonSuffixAndPrefix(doc.text), doc.textRepl(newEdit), this._originalRange, this.snippetInfo, this.additionalTextEdits, this._data, this.identity, hint)
    }

    override canBeReused(model: InlineModel, position: Position): boolean {
        const updated = this._textEdit.range
        return updated.containsPosition(position)
            && this.isVisible(model, position)
            && ofRangeGE(updated, this._originalRange)
    }

    isVisible(model: InlineModel, cursorPosition: Position): boolean {
        return inlineCompletionIsVisible(this.getSingleTextEdit(), this._originalRange, model, cursorPosition)
    }
}

/** TextLength.ofRange(a) >= TextLength.ofRange(b) */
function ofRangeGE(a: Range, b: Range): boolean {
    const la = a.startLineNumber === a.endLineNumber ? [0, a.endColumn - a.startColumn] : [a.endLineNumber - a.startLineNumber, a.endColumn - 1]
    const lb = b.startLineNumber === b.endLineNumber ? [0, b.endColumn - b.startColumn] : [b.endLineNumber - b.startLineNumber, b.endColumn - 1]
    return la[0] !== lb[0] ? la[0] > lb[0] : la[1] >= lb[1]
}

/** 补全在光标处是否「可见」:去掉与文档的公共前缀后,光标之前的部分仍与已打的一致,之后的部分是子序列 */
export function inlineCompletionIsVisible(singleTextEdit: TextReplacement, originalRange: Range | undefined, model: InlineModel, cursorPosition: Position): boolean {
    const minimized = singleTextRemoveCommonPrefix(singleTextEdit, model)
    const editRange = singleTextEdit.range
    if (!editRange
        || (originalRange && !originalRange.getStartPosition().equals(editRange.getStartPosition()))
        || cursorPosition.lineNumber !== minimized.range.startLineNumber
        || minimized.isEmpty) return false

    const originalValue = model.getValueInRange(minimized.range, 1 /* LF */)
    const filterText = minimized.text
    const cursorPosIndex = Math.max(0, cursorPosition.column - minimized.range.startColumn)

    let filterTextBefore = filterText.substring(0, cursorPosIndex)
    let filterTextAfter = filterText.substring(cursorPosIndex)
    let originalValueBefore = originalValue.substring(0, cursorPosIndex)
    let originalValueAfter = originalValue.substring(cursorPosIndex)

    if (minimized.range.startColumn <= lineIndentColumn(model, minimized.range.startLineNumber)) {
        // 缩进内不比较缩进
        originalValueBefore = originalValueBefore.trimStart()
        if (originalValueBefore.length === 0) originalValueAfter = originalValueAfter.trimStart()
        filterTextBefore = filterTextBefore.trimStart()
        if (filterTextBefore.length === 0) filterTextAfter = filterTextAfter.trimStart()
    }
    return filterTextBefore.startsWith(originalValueBefore) && matchesSubString(originalValueAfter, filterTextAfter)
}

// ───────────── InlineEditItem ─────────────

export class InlineEditItem extends ItemBase {
    static create(data: InlineSuggestData, model: InlineModel): InlineEditItem {
        const doc = new Doc(model)
        const offsetEdit = getStringEdit(model, doc, data.range, data.insertText)
        const textRepls = offsetEdit.replacements.map(r => doc.textRepl(r))
        const singleTextEdit = offsetEdit.isEmpty() ? new TextReplacement(new Range(1, 1, 1, 1), '') : new TextEdit(textRepls).toReplacement(doc.text)
        const edits = offsetEdit.replacements.map(e => SingleUpdatedNextEdit.create(e, e.replaceRange.substring(doc.text)))
        const hint = data.hint ? InlineSuggestHint.create(data.hint) : undefined
        return new InlineEditItem(offsetEdit, singleTextEdit, data.uri, data, new InlineSuggestionIdentity(), edits, hint, false, model.getVersionId())
    }

    readonly snippetInfo: SnippetInfo | undefined = undefined
    readonly additionalTextEdits: readonly EditOp[] = []
    readonly isInlineEdit = true

    private constructor(
        private readonly _edit: StringEdit,
        private readonly _textEdit: TextReplacement,
        readonly uri: unknown,
        data: InlineSuggestData,
        identity: InlineSuggestionIdentity,
        private readonly _edits: readonly SingleUpdatedNextEdit[],
        hint: InlineSuggestHint | undefined,
        private readonly _lastChangePartOfInlineEdit = false,
        private readonly _inlineEditModelVersion: number,
    ) { super(data, identity, hint) }

    get updatedEditModelVersion(): number { return this._inlineEditModelVersion }
    get updatedEdit(): StringEdit { return this._edit }
    override getSingleTextEdit(): TextReplacement { return this._textEdit }

    override withIdentity(identity: InlineSuggestionIdentity): InlineEditItem {
        return new InlineEditItem(this._edit, this._textEdit, this.uri, this._data, identity, this._edits, this.hint, this._lastChangePartOfInlineEdit, this._inlineEditModelVersion)
    }

    override canBeReused(model: InlineModel): boolean {
        return this._lastChangePartOfInlineEdit && this.updatedEditModelVersion === model.getVersionId()
    }

    override withEdit(userEdit: StringEdit, model: InlineModel): InlineEditItem | undefined {
        let edits = this._edits.map(e => e.applyTextModelChanges(userEdit))
        if (edits.some(e => e.edit === undefined)) return undefined // 冲突:丢掉

        const newVersion = model.getVersionId()
        let editModelVersion = this._inlineEditModelVersion
        const lastChangePartOfInlineEdit = edits.some(e => e.lastChangeUpdatedEdit)
        if (lastChangePartOfInlineEdit) editModelVersion = newVersion
        if (editModelVersion + 20 < newVersion) return undefined // 忽略太久了

        edits = edits.filter(e => !e.edit!.isEmpty)
        if (edits.length === 0) return undefined // 已经被用户打完了

        const newEdit = new StringEdit(edits.map(e => e.edit!))
        const doc = new Doc(model)
        const newTextEdit = new TextEdit(newEdit.replacements.map(r => doc.textRepl(r))).toReplacement(doc.text)
        let hint = this.hint
        if (hint) {
            hint = hint.withEdit(userEdit, doc)
            if (!hint) return undefined
        }
        return new InlineEditItem(newEdit, newTextEdit, this.uri, this._data, this.identity, edits, hint, lastChangePartOfInlineEdit, editModelVersion)
    }
}

/** 把 provider 给的整段替换用行 diff 拆成多段小编辑 */
function getStringEdit(model: InlineModel, doc: Doc, editRange: Range, replaceText: string): StringEdit {
    const eol = model.getEOL()
    const originalText = model.getValueInRange(editRange)
    const modifiedText = replaceText.replace(/\r\n|\r|\n/g, eol)
    const origLF = splitLines(originalText).join('\n')
    const modLF = splitLines(modifiedText).join('\n')
    const diff = computeLineDiff(origLF, modLF, { ignoreTrimWhitespace: false, computeMoves: false, extendToSubwords: true, maxComputationTimeMs: 500 })
    const innerChanges = diff.changes.flatMap(c => c.innerChanges)

    const ot = new PositionOffsetTransformer(origLF)
    const start = editRange.getStartPosition()
    /** 编辑范围内的相对位置 → 文档里的绝对位置 */
    const abs = (p: Position): Position => p.lineNumber === 1 ? new Position(start.lineNumber, start.column + p.column - 1) : new Position(start.lineNumber + p.lineNumber - 1, p.column)

    return new StringEdit(innerChanges.map(c => {
        const rangeInModel = Range.fromPositions(abs(ot.getPosition(c.originalFrom)), abs(ot.getPosition(c.originalTo)))
        const originalRange = doc.offsetRange(rangeInModel)
        const replacement = modLF.substring(c.modifiedFrom, c.modifiedTo).replace(/\n/g, eol)
        const edit = new StringReplacement(originalRange, replacement)
        return reshapeInlineEdit(edit, model.getValueInRange(rangeInModel), innerChanges.length, model, doc)
    }))
}

/** 一段编辑的「用户打字吸收」状态:去掉公共前后缀后的新文本 + 前后缀长度,记着这次变更有没有吸收 */
class SingleUpdatedNextEdit {
    static create(edit: StringReplacement, replacedText: string): SingleUpdatedNextEdit {
        const prefixLength = commonPrefixLength(edit.newText, replacedText)
        const suffixLength = commonSuffixLength(edit.newText, replacedText)
        const trimmedNewText = edit.newText.substring(prefixLength, edit.newText.length - suffixLength)
        return new SingleUpdatedNextEdit(edit, trimmedNewText, prefixLength, suffixLength)
    }
    get edit(): StringReplacement | undefined { return this._edit }
    get lastChangeUpdatedEdit(): boolean { return this._lastChangeUpdatedEdit }
    constructor(
        private _edit: StringReplacement | undefined,
        private _trimmedNewText: string,
        private _prefixLength: number,
        private _suffixLength: number,
        private _lastChangeUpdatedEdit = false,
    ) { }

    applyTextModelChanges(changes: StringEdit): SingleUpdatedNextEdit {
        const c = new SingleUpdatedNextEdit(this._edit, this._trimmedNewText, this._prefixLength, this._suffixLength, this._lastChangeUpdatedEdit)
        c._applyTextModelChanges(changes)
        return c
    }

    private _applyTextModelChanges(changes: StringEdit): void {
        this._lastChangeUpdatedEdit = false
        if (!this._edit) throw new Error('UpdatedInnerEdits: No edit to apply changes to')
        const result = this._applyChanges(this._edit, changes)
        if (!result) { this._edit = undefined; return }
        this._edit = result.edit
        this._lastChangeUpdatedEdit = result.editHasChanged
    }

    private _applyChanges(edit: StringReplacement, changes: StringEdit): { edit: StringReplacement, editHasChanged: boolean } | undefined {
        let editStart = edit.replaceRange.start
        let editEnd = edit.replaceRange.endExclusive
        let editReplaceText = edit.newText
        let editHasChanged = false
        const shouldPreserveEditShape = this._prefixLength > 0 || this._suffixLength > 0

        for (let i = changes.replacements.length - 1; i >= 0; i--) {
            const change = changes.replacements[i]

            // 插入(只支持插在编辑起点)
            const isInsertion = change.newText.length > 0 && change.replaceRange.isEmpty
            if (isInsertion && !shouldPreserveEditShape && change.replaceRange.start === editStart && editReplaceText.startsWith(change.newText)) {
                editStart += change.newText.length
                editReplaceText = editReplaceText.substring(change.newText.length)
                editEnd = Math.max(editStart, editEnd)
                editHasChanged = true
                continue
            }
            if (isInsertion && shouldPreserveEditShape && change.replaceRange.start === editStart + this._prefixLength && this._trimmedNewText.startsWith(change.newText)) {
                editEnd += change.newText.length
                editHasChanged = true
                this._prefixLength += change.newText.length
                this._trimmedNewText = this._trimmedNewText.substring(change.newText.length)
                continue
            }
            // 删除
            const isDeletion = change.newText.length === 0 && change.replaceRange.length > 0
            if (isDeletion && change.replaceRange.start >= editStart + this._prefixLength && change.replaceRange.endExclusive <= editEnd - this._suffixLength) {
                editEnd -= change.replaceRange.length
                editHasChanged = true
                continue
            }
            // 用户恰好做了这条编辑
            if (change.equals(edit)) {
                editHasChanged = true
                editStart = change.replaceRange.endExclusive
                editReplaceText = ''
                continue
            }
            // 平移
            if (change.replaceRange.start > editEnd) continue
            if (change.replaceRange.endExclusive < editStart) {
                editStart += change.newText.length - change.replaceRange.length
                editEnd += change.newText.length - change.replaceRange.length
                continue
            }
            // 与建议相交:丢弃
            return undefined
        }

        // 原文与新文相同:空操作
        if (this._trimmedNewText.length === 0 && editStart + this._prefixLength === editEnd - this._suffixLength) {
            return { edit: new StringReplacement(new OffsetRange(editStart + this._prefixLength, editStart + this._prefixLength), ''), editHasChanged: true }
        }
        return { edit: new StringReplacement(new OffsetRange(editStart, editEnd), editReplaceText), editHasChanged }
    }
}

function reshapeInlineCompletion(edit: StringReplacement, model: InlineModel, doc: Doc): StringReplacement {
    // 在下一行起点插入的多行文本:前移到上一行行尾,让多行插入从当前行开始
    if (edit.replaceRange.isEmpty && edit.newText.includes(model.getEOL())) edit = reshapeMultiLineInsertion(edit, model, doc)
    return edit
}

function reshapeInlineEdit(edit: StringReplacement, originalText: string, totalInnerEdits: number, model: InlineModel, doc: Doc): StringReplacement {
    const eol = model.getEOL()
    // diff 没修干净的行尾换行
    if (edit.newText.endsWith(eol) && originalText.endsWith(eol)) edit = new StringReplacement(edit.replaceRange.deltaEnd(-eol.length), edit.newText.slice(0, -eol.length))

    // 以换行结尾、插在有字的行首的单个插入:移到上一行尾
    if (totalInnerEdits === 1 && edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
        const startPosition = doc.t.getPosition(edit.replaceRange.start)
        if (model.getLineLength(startPosition.lineNumber) !== 0) edit = reshapeMultiLineInsertion(edit, model, doc)
    }

    // diff 把简单编辑扩成了整词:只插/只删时缩回去
    if (totalInnerEdits === 1) {
        const prefixLength = commonPrefixLength(originalText, edit.newText)
        const suffixLength = commonSuffixLength(originalText.slice(prefixLength), edit.newText.slice(prefixLength))
        if (prefixLength + suffixLength === originalText.length)
            return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), edit.newText.substring(prefixLength, edit.newText.length - suffixLength))
        if (prefixLength + suffixLength === edit.newText.length)
            return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), '')
    }
    return edit
}

function reshapeMultiLineInsertion(edit: StringReplacement, model: InlineModel, doc: Doc): StringReplacement {
    if (!edit.replaceRange.isEmpty) throw new Error('Unexpected original range')
    if (edit.replaceRange.start === 0) return edit
    const eol = model.getEOL()
    const p = doc.t.getPosition(edit.replaceRange.start)
    if (p.column === 1 && p.lineNumber > 1 && edit.newText.endsWith(eol) && !edit.newText.startsWith(eol))
        return new StringReplacement(edit.replaceRange.delta(-1), eol + edit.newText.slice(0, -eol.length))
    return edit
}
