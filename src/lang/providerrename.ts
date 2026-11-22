// languages.registerRenameProvider 背后的 F2 重命名(Monaco rename/browser/rename.ts:RenameSkeleton + RenameController.run)。
//
// 流程:resolveRenameLocation(按 provider 顺序,undefined 跳过、rejectReason 收集)→ 退回光标下的词 →
// 内嵌输入框(复用 tsrename.renameInput)→ provideRenameEdits(链式:没结果 / 拒绝就问下一个 provider)→ 应用。
// 应用 = standalone 的 StandaloneBulkEditService:只认文本编辑,按 versionId 校验,每个 model 前后各一个撤销边界。
// NewSymbolNamesProvider:本实现的输入框没有候选列表 UI,provider 不会被问(注册本身合法)。
import type { EditorView } from '../core/view/editorview'
import type { ViewAction } from '../api/actions'
import type { ITextModel } from '../api/model'
import type * as T from '../monaco/languages-types'
import type { CancellationToken } from './providers'
import { languageFeatures, type LanguageFeatureRegistry } from './languagefeatures'
import { CancellationTokenSource } from './async'
import { renameInput, showEditorMessage } from './tsrename'
import { Range, Position, type IRange } from '../api/position'
import { getModel as getModelByUri } from '../api/model'
import { docOffset } from '../api/commands'
import { EditorSelection } from '../core/model/selection'

type RenameResult = T.RenameLocation & T.Rejection

export class RenameSkeleton {
    private readonly providers: T.RenameProvider[]
    private idx = 0
    constructor(private readonly model: ITextModel, private readonly position: Position, registry: LanguageFeatureRegistry<T.RenameProvider>) {
        this.providers = registry.ordered(model)
    }
    hasProvider(): boolean { return this.providers.length > 0 }

    async resolveRenameLocation(token: CancellationToken): Promise<RenameResult> {
        const rejects: string[] = []
        for (this.idx = 0; this.idx < this.providers.length; this.idx++) {
            const p = this.providers[this.idx]
            // 没实现 resolveRenameLocation 的 provider:后面的不再问,直接按光标下的词(Monaco 同)
            if (!p.resolveRenameLocation) break
            const res = await p.resolveRenameLocation(this.model, this.position, token)
            if (!res) continue
            if (res.rejectReason) { rejects.push(res.rejectReason); continue }
            return res
        }
        this.idx = 0
        const rejectReason = rejects.length ? rejects.join('\n') : undefined
        const word = this.model.getWordAtPosition(this.position)
        if (!word) return { range: Range.fromPositions(this.position), text: '', rejectReason }
        return { range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn), text: word.word, rejectReason }
    }

    provideRenameEdits(newName: string, token: CancellationToken): Promise<T.WorkspaceEdit & T.Rejection> {
        return this.chain(newName, this.idx, [], token)
    }
    private async chain(newName: string, i: number, rejects: string[], token: CancellationToken): Promise<T.WorkspaceEdit & T.Rejection> {
        const p = this.providers[i]
        if (!p) return { edits: [], rejectReason: rejects.join('\n') }
        const result = await p.provideRenameEdits(this.model, this.position, newName, token)
        if (!result) return this.chain(newName, i + 1, rejects.concat('No result.'), token)
        if (result.rejectReason) return this.chain(newName, i + 1, rejects.concat(result.rejectReason), token)
        return result
    }
}

/** Monaco StandaloneBulkEditService.apply */
export function applyWorkspaceEdit(model: ITextModel, edit: T.WorkspaceEdit): { totalEdits: number, totalFiles: number } {
    const byModel = new Map<ITextModel, { range: IRange, text: string, forceMoveMarkers: boolean }[]>()
    for (const e of edit.edits) {
        if (!('textEdit' in e)) throw new Error('bad edit - only text edits are supported')
        const target = getModelByUri(e.resource) ?? (e.resource.toString() === model.uri.toString() ? model : null)
        if (!target) throw new Error('bad edit - model not found')
        if (typeof e.versionId === 'number' && target.getVersionId() !== e.versionId) throw new Error('bad state - model changed in the meantime')
        const list = byModel.get(target) ?? []
        list.push({ range: e.textEdit.range, text: e.textEdit.text, forceMoveMarkers: true })
        byModel.set(target, list)
    }
    let totalEdits = 0
    for (const [m, ops] of byModel) {
        m.pushStackElement()
        m.pushEditOperations([], ops, () => [])
        m.pushStackElement()
        totalEdits += ops.length
    }
    return { totalEdits, totalFiles: byModel.size }
}

const modelOf = (view: EditorView): ITextModel | null => (view as unknown as { getModel?: () => ITextModel | null }).getModel?.() ?? null
const registry = () => languageFeatures.renameProvider as LanguageFeatureRegistry<T.RenameProvider>

/** Monaco RenameController.run */
export async function runProviderRename(view: EditorView): Promise<boolean> {
    const model = modelOf(view)
    if (!model || view.state.readOnly) return false
    const doc0 = view.state.doc
    const head = view.state.selection.main.head
    const line = doc0.lineAt(head)
    const position = new Position(line.number, head - line.from + 1)
    const skeleton = new RenameSkeleton(model, position, registry())
    if (!skeleton.hasProvider()) return false

    // 文档 / 光标在等待期间变了就放弃(EditorStateCancellationTokenSource)
    const cts = new CancellationTokenSource()
    const off = view.onTransaction(tr => { if (tr.docChanged || tr.selection) cts.cancel() })
    try {
        let loc: RenameResult
        try { loc = await skeleton.resolveRenameLocation(cts.token) } catch (e) {
            if (typeof e === 'string') showEditorMessage(view, head, e)
            else console.error(e)
            return false
        }
        if (cts.token.isCancellationRequested) return false
        if (loc.rejectReason) { showEditorMessage(view, head, loc.rejectReason); return false }

        const from = docOffset(view.state.doc, loc.range.startLineNumber, loc.range.startColumn)
        const to = docOffset(view.state.doc, loc.range.endLineNumber, loc.range.endColumn)
        const newName = await renameInput(view, { from, to, name: loc.text })
        if (newName == null) return false
        if (view.state.doc !== doc0) return false
        view.focus()

        let result: T.WorkspaceEdit & T.Rejection
        try { result = await skeleton.provideRenameEdits(newName, cts.token) } catch (e) { console.error('Rename failed to compute edits', e); return false }
        if (cts.token.isCancellationRequested || view.state.doc !== doc0) return false
        if (result.rejectReason) { console.info(result.rejectReason); return false }
        // 折叠选区到活动端
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.selection.main.head) }))
        try { applyWorkspaceEdit(model, result) } catch (e) { console.error('Rename failed to apply edits', e); return false }
        return true
    } finally {
        off()
        cts.cancel()
    }
}

export function providerRenameAction(): ViewAction {
    return {
        label: 'Rename Symbol',
        writable: true,
        supported: v => { const m = modelOf(v); return !!m && registry().has(m) },
        run: v => runProviderRename(v),
    }
}
