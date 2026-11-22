// languages.registerDocumentFormattingEditProvider / registerDocumentRangeFormattingEditProvider /
// registerOnTypeFormattingEditProvider 背后的编辑器贡献(Monaco editor/contrib/format)。
//
//   formatDocument   editor.action.formatDocument   文档 provider + 把范围 provider 当整文档 provider(getRealAndSyntheticDocumentFormattersOrdered);
//                                                   standalone 的 FormattingConflicts 选 formatter[0]
//   formatSelection  editor.action.formatSelection  范围 provider;空选区 = 它所在的整行;相交 / 相接的范围先合并
//   formatOnType     onDidType + autoFormatTriggerCharacters(formatOnType 选项,单个空选区)
//   formatOnPaste    onDidPaste(formatOnPaste 选项,单选区,Silent:不加撤销边界)
// 应用 = FormattingEdit.execute:pushUndoStop → executeEdits('formatEditsCommand') → pushUndoStop。
// computeMoreMinimalEdits 在 standalone 里是 worker 里的字符 diff:这里同算法同线程(lang/minimaledits.ts)。
import type { EditorView } from '../core/view/editorview'
import type { ViewAction } from '../api/actions'
import type { ITextModel } from '../api/model'
import type { LiteMonacoEditor } from '../api/types'
import type * as T from '../monaco/languages-types'
import { languageFeatures } from './languagefeatures'
import { computeMoreMinimalEdits } from './minimaledits'
import { CancellationTokenSource } from './async'
import { Range, type IRange } from '../api/position'
import { executeEdits, pushUndoStop } from '../api/commands'
import { getOption } from '../core/options'
import { KeyCode, KeyMod } from '../api/keycodes'
import { keyOS } from '../core/keyos'

const modelOf = (view: EditorView): ITextModel | null => (view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null
const fmtOptions = (m: ITextModel): T.FormattingOptions => { const o = m.getOptions(); return { tabSize: o.tabSize, insertSpaces: o.insertSpaces } }

/** Monaco getRealAndSyntheticDocumentFormattersOrdered:文档 provider 在前,范围 provider 包成整文档 provider 在后 */
export function documentFormatters(model: ITextModel): T.DocumentFormattingEditProvider[] {
    const real = languageFeatures.documentFormattingEditProvider.ordered(model)
    const synthetic = languageFeatures.documentRangeFormattingEditProvider.ordered(model).map((p): T.DocumentFormattingEditProvider => ({
        displayName: p.displayName,
        provideDocumentFormattingEdits: (m, options, token) => p.provideDocumentRangeFormattingEdits(m, m.getFullModelRange(), options, token),
    }))
    return [...real, ...synthetic]
}

/** Monaco EditorWorkerService.computeMoreMinimalEdits(lang/minimaledits.ts):相邻编辑合并 + 字符级 LcsDiff,只留真变了的几段 */
export function minimalEdits(model: ITextModel, edits: readonly T.TextEdit[] | null | undefined): T.TextEdit[] {
    if (!edits?.length) return []
    // 没有 range 又没有 eol 的脏数据丢掉(provider 乱返回);校验范围后交给 worker 算法
    const clean = edits.filter(e => (e.range && typeof e.text === 'string') || typeof e.eol === 'number')
        .map(e => e.range ? { ...e, range: model.validateRange(e.range) } : e)
    return computeMoreMinimalEdits(model, clean as never) as T.TextEdit[]
}

/** Monaco FormattingEdit.execute */
export function executeFormattingEdits(view: EditorView, edits: readonly T.TextEdit[], addUndoStops: boolean): void {
    if (!edits.length) return
    const model = modelOf(view)
    if (!model) return
    if (addUndoStops) pushUndoStop(view)
    let newEol: number | undefined
    const single: T.TextEdit[] = []
    for (const e of edits) {
        if (typeof e.eol === 'number') newEol = e.eol
        // 只改 EOL 的编辑(worker 给的是 0,0,0,0 的空范围 + 空文本)不是文本编辑
        if (e.range && typeof e.text === 'string' && !(e.range.startLineNumber < 1 && !e.text)) single.push(e)
    }
    if (newEol !== undefined) model.pushEOL(newEol)
    // 单条整文档替换:replace 语义(marker 不强推);否则 replaceMove
    const full = single.length === 1 && model.getFullModelRange().equalsRange(model.validateRange(single[0].range))
    executeEdits(view, 'formatEditsCommand', single.map(e => ({ range: e.range, text: e.text, forceMoveMarkers: !full })))
    if (addUndoStops) pushUndoStop(view)
}

/** Monaco EditorStateCancellationTokenSource(Value | Position):文档变了或光标挪了就取消 */
function stateToken(view: EditorView): { cts: CancellationTokenSource, dispose(): void } {
    const cts = new CancellationTokenSource()
    const off = view.onTransaction(tr => { if (tr.docChanged || tr.selection) cts.cancel() })
    return { cts, dispose: () => { off(); cts.dispose() } }
}

const reveal = (view: EditorView): void => {
    const ed = view as unknown as LiteMonacoEditor
    const p = ed.getPosition?.()
    if (p) ed.revealPositionInCenterIfOutsideViewport(p, 1 /* ScrollType.Immediate */)
}

/** Monaco formatDocumentWithProvider(mode Explicit) */
export async function formatDocument(view: EditorView, formatter?: T.DocumentFormattingEditProvider): Promise<boolean> {
    const model = modelOf(view)
    if (!model || view.state.readOnly) return false
    const provider = formatter ?? documentFormatters(model)[0]
    if (!provider) return false
    const t = stateToken(view)
    let edits: T.TextEdit[]
    try {
        const raw = await provider.provideDocumentFormattingEdits(model, fmtOptions(model), t.cts.token)
        edits = minimalEdits(model, raw)
        if (t.cts.token.isCancellationRequested) return true
    }
    catch (e) { console.error(e); return false }
    finally { t.dispose() }
    if (!edits.length) return false
    executeFormattingEdits(view, edits, true)
    reveal(view)
    return true
}

/** Monaco formatDocumentRangesWithProvider;silent = FormattingMode.Silent(粘贴后格式化,不加撤销边界) */
export async function formatRanges(view: EditorView, provider: T.DocumentRangeFormattingEditProvider, input: IRange | IRange[], silent = false): Promise<boolean> {
    const model = modelOf(view)
    if (!model || view.state.readOnly) return false
    const t = stateToken(view)
    const token = t.cts.token
    const ranges: Range[] = []
    for (const r of (Array.isArray(input) ? input : [input]).map(x => Range.lift(x)).sort(Range.compareRangesUsingStarts)) {
        const last = ranges[ranges.length - 1]
        if (last && Range.areIntersectingOrTouching(last, r)) ranges[ranges.length - 1] = Range.fromPositions(last.getStartPosition(), r.getEndPosition())
        else ranges.push(r)
    }
    const options = fmtOptions(model)
    const compute = async (range: Range): Promise<T.TextEdit[]> => (await provider.provideDocumentRangeFormattingEdits(model, range, options, token)) || []
    const intersects = (a: T.TextEdit[], b: T.TextEdit[]) => a.some(x => b.some(y => Range.intersectRanges(x.range, y.range)))
    const all: T.TextEdit[] = []
    try {
        const lists: T.TextEdit[][] = []
        if (typeof provider.provideDocumentRangesFormattingEdits === 'function') {
            lists.push((await provider.provideDocumentRangesFormattingEdits(model, ranges, options, token)) || [])
        }
        else {
            for (const r of ranges) {
                if (token.isCancellationRequested) return true
                lists.push(await compute(r))
            }
            // 不同范围算出的编辑相交 → 合并两个范围重算,从头再扫
            for (let i = 0; i < ranges.length; ++i) {
                for (let j = i + 1; j < ranges.length; ++j) {
                    if (token.isCancellationRequested) return true
                    if (!intersects(lists[i], lists[j])) continue
                    const merged = Range.plusRange(ranges[i], ranges[j])
                    const edits = await compute(merged)
                    ranges.splice(j, 1); ranges.splice(i, 1); ranges.push(merged)
                    lists.splice(j, 1); lists.splice(i, 1); lists.push(edits)
                    i = 0; j = 0
                }
            }
        }
        for (const l of lists) {
            if (token.isCancellationRequested) return true
            all.push(...minimalEdits(model, l))
        }
        if (token.isCancellationRequested) return true
    }
    catch (e) { console.error(e); return false }
    finally { t.dispose() }
    if (!all.length) return false
    executeFormattingEdits(view, all, !silent)
    reveal(view)
    return true
}

/** Monaco FormatSelectionAction:空选区 = 它所在的整行 */
export function formatSelection(view: EditorView): Promise<boolean> {
    const model = modelOf(view)
    const provider = model && languageFeatures.documentRangeFormattingEditProvider.ordered(model)[0]
    if (!model || !provider) return Promise.resolve(false)
    const sels = (view as unknown as LiteMonacoEditor).getSelections() ?? []
    return formatRanges(view, provider, sels.map(s => s.isEmpty() ? new Range(s.startLineNumber, 1, s.startLineNumber, model.getLineMaxColumn(s.startLineNumber)) : s))
}

const ownsModel = (kinds: ('documentFormattingEditProvider' | 'documentRangeFormattingEditProvider')[]) => (v: EditorView): boolean => {
    const m = modelOf(v)
    return !!m && kinds.some(k => languageFeatures[k].has(m))
}

/** Shift+Alt+F(Linux:Ctrl+Shift+I);Ctrl/Cmd+K Ctrl/Cmd+F */
export function providerFormatActions(): Record<string, ViewAction> {
    return {
        'editor.action.formatDocument': {
            label: 'Format Document',
            writable: true,
            keybindings: [keyOS === 'linux' ? KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI : KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF],
            supported: ownsModel(['documentFormattingEditProvider', 'documentRangeFormattingEditProvider']),
            run: v => formatDocument(v),
        },
        'editor.action.formatSelection': {
            label: 'Format Selection',
            writable: true,
            keybindings: [KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyF)],
            supported: ownsModel(['documentRangeFormattingEditProvider']),
            run: v => formatSelection(v),
        },
    }
}

/** formatOnType / formatOnPaste:事件时现读选项(updateOptions 随时生效) */
export function installFormatOnTypeAndPaste(editor: LiteMonacoEditor): () => void {
    const view = editor as unknown as EditorView
    const offType = editor.onDidType(text => {
        const model = modelOf(view)
        if (!model || !getOption(view.state, 'formatOnType') || !text) return
        const support = languageFeatures.onTypeFormattingEditProvider.ordered(model)[0]
        const ch = text[text.length - 1]
        if (!support?.autoFormatTriggerCharacters?.includes(ch)) return
        const sels = editor.getSelections() ?? []
        if (sels.length !== 1 || !sels[0].isEmpty()) return
        const position = editor.getPosition()!
        const cts = new CancellationTokenSource()
        // 编辑发生在这一行或更靠前:位置已不对应,放弃
        const watch = editor.onDidChangeModelContent(e => {
            if (e.isFlush || e.changes.some(c => c.range.endLineNumber <= position.lineNumber)) { cts.cancel(); watch.dispose() }
        })
        void (async () => {
            try {
                const raw = await support.provideOnTypeFormattingEdits(model, position, ch, fmtOptions(model), cts.token)
                if (cts.token.isCancellationRequested) return
                const edits = minimalEdits(model, raw)
                if (edits.length) executeFormattingEdits(view, edits, true)
            }
            catch (e) { console.error(e) }
            finally { watch.dispose() }
        })()
    })
    const offPaste = editor.onDidPaste(({ range }) => {
        const model = modelOf(view)
        if (!model || !getOption(view.state, 'formatOnPaste')) return
        const provider = languageFeatures.documentRangeFormattingEditProvider.ordered(model)[0]
        if (!provider || (editor.getSelections()?.length ?? 0) > 1) return
        void formatRanges(view, provider, range, true)
    })
    return () => { offType.dispose(); offPaste.dispose() }
}
