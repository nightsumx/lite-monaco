// 编辑器状态快照(Monaco contrib/editorState):异步操作(格式化 / 重命名 / 补全取回…)开始时拍一张快照,
// 回来后 validate(editor) 判断用户有没有动过 model / 光标 / 选区 / 滚动;动过就丢弃结果。
// 另有按同一组 flag 自动取消的 CancellationTokenSource。
// 与 Monaco 的差别:EditorStateCancellationTokenSource 不接 Escape 的 editor.cancelOperation(cancellableOperation 上下文键)。
import { CancellationTokenSource, type CancellationToken } from './async'
import type { IDisposable } from './providers'

export const enum CodeEditorStateFlag {
    Value = 1,
    Selection = 2,
    Position = 4,
    Scroll = 8,
}

interface PositionLike { lineNumber: number, column: number }
interface RangeLike { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
type Event<T> = (listener: (e: T) => unknown) => IDisposable

/** EditorState 要读的编辑器形态(ICodeEditor 的子集) */
export interface EditorStateSource {
    getModel(): { uri: { toString(): string }, getVersionId(): number } | null
    getPosition(): PositionLike | null | undefined
    getSelection(): RangeLike | null | undefined
    getScrollLeft(): number | undefined
    getScrollTop(): number | undefined
}

const samePos = (a: PositionLike, b: PositionLike): boolean => a.lineNumber === b.lineNumber && a.column === b.column
const sameRange = (a: RangeLike, b: RangeLike): boolean =>
    a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn

export class EditorState {
    private readonly position: PositionLike | null
    private readonly selection: RangeLike | null
    private readonly modelVersionId: string | null
    private readonly scrollLeft: number
    private readonly scrollTop: number

    constructor(editor: EditorStateSource, private readonly flags: number) {
        const model = flags & CodeEditorStateFlag.Value ? editor.getModel() : null
        this.modelVersionId = model ? `${model.uri.toString()}#${model.getVersionId()}` : null
        this.position = flags & CodeEditorStateFlag.Position ? editor.getPosition() ?? null : null
        this.selection = flags & CodeEditorStateFlag.Selection ? editor.getSelection() ?? null : null
        this.scrollLeft = flags & CodeEditorStateFlag.Scroll ? editor.getScrollLeft()! : -1
        this.scrollTop = flags & CodeEditorStateFlag.Scroll ? editor.getScrollTop()! : -1
    }

    private equals(o: EditorState): boolean {
        if (this.modelVersionId !== o.modelVersionId) return false
        if (this.scrollLeft !== o.scrollLeft || this.scrollTop !== o.scrollTop) return false
        if (!this.position !== !o.position || (this.position && o.position && !samePos(this.position, o.position))) return false
        if (!this.selection !== !o.selection || (this.selection && o.selection && !sameRange(this.selection, o.selection))) return false
        return true
    }

    /** 编辑器现在的状态(按同一组 flag)还和快照一致吗 */
    validate(editor: EditorStateSource): boolean { return this.equals(new EditorState(editor, this.flags)) }
}

const contains = (r: RangeLike, p: PositionLike): boolean =>
    !(p.lineNumber < r.startLineNumber || p.lineNumber > r.endLineNumber ||
        (p.lineNumber === r.startLineNumber && p.column < r.startColumn) || (p.lineNumber === r.endLineNumber && p.column > r.endColumn))
const containsRange = (r: RangeLike, s: RangeLike): boolean =>
    contains(r, { lineNumber: s.startLineNumber, column: s.startColumn }) && contains(r, { lineNumber: s.endLineNumber, column: s.endColumn })

/** 编辑器按 flag 声明的方面一变就取消的 token。range 给定时,落在 range 内的光标 / 选区变化不算 */
export interface CancellableEditor {
    onDidChangeCursorPosition: Event<{ position: PositionLike }>
    onDidChangeCursorSelection: Event<{ selection: RangeLike }>
    onDidScrollChange: Event<unknown>
    onDidChangeModel: Event<unknown>
    onDidChangeModelContent: Event<unknown>
}
export class EditorStateCancellationTokenSource extends CancellationTokenSource {
    private readonly listeners: IDisposable[] = []
    constructor(editor: CancellableEditor, flags: CodeEditorStateFlag, range?: RangeLike, parent?: CancellationToken) {
        super(parent)
        const cancel = () => this.cancel()
        if (flags & CodeEditorStateFlag.Position) this.listeners.push(editor.onDidChangeCursorPosition(e => { if (!range || !contains(range, e.position)) cancel() }))
        if (flags & CodeEditorStateFlag.Selection) this.listeners.push(editor.onDidChangeCursorSelection(e => { if (!range || !containsRange(range, e.selection)) cancel() }))
        if (flags & CodeEditorStateFlag.Scroll) this.listeners.push(editor.onDidScrollChange(cancel))
        if (flags & CodeEditorStateFlag.Value) {
            this.listeners.push(editor.onDidChangeModel(cancel))
            this.listeners.push(editor.onDidChangeModelContent(cancel))
        }
    }
    override dispose(cancel?: boolean): void {
        for (const l of this.listeners.splice(0)) l.dispose()
        super.dispose(cancel)
    }
}

/** model 内容一变就取消的 token */
export class TextModelCancellationTokenSource extends CancellationTokenSource {
    private readonly listener: IDisposable
    constructor(model: { onDidChangeContent: Event<unknown> }, parent?: CancellationToken) {
        super(parent)
        this.listener = model.onDidChangeContent(() => this.cancel())
    }
    override dispose(cancel?: boolean): void { this.listener.dispose(); super.dispose(cancel) }
}
