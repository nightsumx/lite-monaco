// ModelService(Monaco common/services/modelService 里的对外语义,去掉 undoRedoService / 配置层):
//   - createModel(value, languageSelection, resource):按 `files.eol`(可按资源根覆盖)决定没有换行的文本用哪种 EOL
//   - destroyModel(resource):销毁;销毁时若有撤销栈且资源是文件类 scheme,留一份快照
//   - 同资源、同内容(含 EOL / BOM)再 createModel:撤销栈和 versionId / alternativeVersionId 原样接回(Monaco files.restoreUndoStack)
//   - ModelService._computeEdits(model, textBuffer):把 model 变成 textBuffer 内容所需的最小整行替换(setValue 的替代:保留撤销栈、装饰、光标)
//
// 注意:顶层 `createModel`(monaco.editor.createModel)保持老行为(不留快照);要 Monaco 的「关标签再开撤销还在」就经这个服务建 model。

import { createModel, DefaultEndOfLine, EndOfLinePreference, type IIdentifiedSingleEditOperation, type ITextModel, type TextModel } from './model'
import { Range } from './position'
import type { Uri } from './uri'
import { Emitter } from './context'
import { PLAINTEXT_LANGUAGE_ID } from './languagesregistry'
import type { ILanguageSelection } from './languagesregistry'

/** _computeEdits 对「目标文本缓冲」的最小要求 */
export interface ITextBufferLike {
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLineLength(lineNumber: number): number
    getEOL(): string
    getValueInRange(range: Range, eol?: EndOfLinePreference): string
}

export interface IModelServiceConfig {
    getValue<T = unknown>(section: string, overrides?: { resource?: unknown, overrideIdentifier?: string }): T
}

type HistorySnapshot = ReturnType<TextModel['_historySnapshot']>
interface Stash { snap: HistorySnapshot, text: string, eol: string }

/** 撤销栈会被留下来的 scheme(Monaco _schemaShouldMaintainUndoRedoElements) */
const MAINTAIN_SCHEMES = new Set(['file', 'vscode-remote', 'vscode-userdata', 'vscode-notebook-cell', 'fake-fs'])
const MAX_STASH = 20

export class ModelService {
    private readonly _models = new Map<string, TextModel>()
    private readonly _stash = new Map<string, Stash>()
    private readonly _onAdded = new Emitter<ITextModel>()
    private readonly _onRemoved = new Emitter<ITextModel>()
    /** Monaco IModelService.onModelAdded / onModelRemoved:经本服务建出 / 销毁的 model */
    readonly onModelAdded = this._onAdded.event
    readonly onModelRemoved = this._onRemoved.event

    constructor(private readonly _config?: IModelServiceConfig) {}

    private _eol(resource: Uri | undefined, language: string): DefaultEndOfLine {
        const v = this._config?.getValue<string>('files.eol', { overrideIdentifier: language, resource })
        if (v && v !== 'auto') return v === '\r\n' ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF
        const win = typeof navigator !== 'undefined' && /^Win/.test(navigator.platform ?? '')
        return win ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF
    }

    private _restoreUndo(): boolean {
        return this._config?.getValue<boolean>('files.restoreUndoStack') ?? true
    }

    createModel(value: string, languageSelection: ILanguageSelection | null, resource?: Uri, _isForSimpleWidget = false): TextModel {
        const language = languageSelection?.languageId ?? PLAINTEXT_LANGUAGE_ID
        const model = createModel(value, language, resource, { defaultEOL: this._eol(resource, language), history: true })
        const key = model.uri.toString()
        this._models.set(key, model)

        this._onAdded.fire(model)
        const stash = this._stash.get(key)
        if (stash) {
            this._stash.delete(key)
            if (this._restoreUndo() && stash.snap.bom === (value.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '')
                && stash.eol === model.getEOL() && stash.text === model.getValue()) {
                model._restoreHistory(stash.snap)
            }
        }

        model.onWillDispose(() => {
            this._models.delete(key)
            this._onRemoved.fire(model)
            if (!this._restoreUndo() || !MAINTAIN_SCHEMES.has(model.uri.scheme)) return
            if (!model.canUndo() && !model.canRedo()) return
            this._stash.delete(key)
            this._stash.set(key, { snap: model._historySnapshot(), text: model.getValue(), eol: model.getEOL() })
            // 只留最近 MAX_STASH 份(Monaco 按堆大小 20MB 限;这里按个数,最旧的先丢)
            while (this._stash.size > MAX_STASH) this._stash.delete(this._stash.keys().next().value as string)
        })
        return model
    }

    destroyModel(resource: Uri): void {
        // 不是所有 model 都经本服务销毁(model.dispose() 也得行),所以没登记的直接忽略
        this._models.get(resource.toString())?.dispose()
    }
    getModels(): ITextModel[] { return [...this._models.values()] }
    getModel(resource: Uri): ITextModel | null { return this._models.get(resource.toString()) ?? null }

    private static _commonPrefix(a: ITextModel, aLen: number, aDelta: number, b: ITextBufferLike, bLen: number, bDelta: number): number {
        const max = Math.min(aLen, bLen)
        let r = 0
        for (let i = 0; i < max && a.getLineContent(aDelta + i) === b.getLineContent(bDelta + i); i++) r++
        return r
    }
    private static _commonSuffix(a: ITextModel, aLen: number, aDelta: number, b: ITextBufferLike, bLen: number, bDelta: number): number {
        const max = Math.min(aLen, bLen)
        let r = 0
        for (let i = 0; i < max && a.getLineContent(aDelta + aLen - i) === b.getLineContent(bDelta + bLen - i); i++) r++
        return r
    }

    /** 把 model 变成 textBuffer 内容所需的编辑:去掉公共行前缀 / 后缀,中间整段替换 */
    static _computeEdits(model: ITextModel, textBuffer: ITextBufferLike): IIdentifiedSingleEditOperation[] {
        const modelLines = model.getLineCount()
        const bufLines = textBuffer.getLineCount()
        const prefix = this._commonPrefix(model, modelLines, 1, textBuffer, bufLines, 1)
        if (modelLines === bufLines && prefix === modelLines) return [] // 相等(EOL 不算,由 pushEOL 另管)

        const suffix = this._commonSuffix(model, modelLines - prefix, prefix, textBuffer, bufLines - prefix, prefix)

        let oldRange: Range
        let newRange: Range
        if (suffix > 0) {
            oldRange = new Range(prefix + 1, 1, modelLines - suffix + 1, 1)
            newRange = new Range(prefix + 1, 1, bufLines - suffix + 1, 1)
        } else if (prefix > 0) {
            oldRange = new Range(prefix, model.getLineMaxColumn(prefix), modelLines, model.getLineMaxColumn(modelLines))
            newRange = new Range(prefix, 1 + textBuffer.getLineLength(prefix), bufLines, 1 + textBuffer.getLineLength(bufLines))
        } else {
            oldRange = new Range(1, 1, modelLines, model.getLineMaxColumn(modelLines))
            newRange = new Range(1, 1, bufLines, 1 + textBuffer.getLineLength(bufLines))
        }
        return [{ range: oldRange, text: textBuffer.getValueInRange(newRange, EndOfLinePreference.TextDefined), forceMoveMarkers: true }]
    }

    /** setValue 的替代(Monaco updateModel):EOL 对齐 + 最小编辑 + 收尾 stack element,撤销栈保留 */
    updateModel(model: TextModel, textBuffer: ITextBufferLike): void {
        model.pushStackElement()
        model.pushEOL(textBuffer.getEOL() === '\r\n' ? 1 /* EndOfLineSequence.CRLF */ : 0 /* LF */)
        model.pushEditOperations([], ModelService._computeEdits(model, textBuffer), () => [])
        model.pushStackElement()
    }
}
