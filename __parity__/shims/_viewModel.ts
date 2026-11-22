// Monaco ViewModel(测试里作为 withTestCodeEditor 回调的第二个参数)→ lite-monaco 编辑器实例的薄翻译。
// 这里只把 viewModel.type / paste / compositionType … 翻成 editor.trigger(handlerId, payload) / 公开 API;不实现任何行为。
import { Position, Selection } from '../../src/api/position'
import { OutgoingViewModelEventKind } from './viewModelEventDispatcher'

const toSel = (x: any) => x instanceof Selection ? x : new Selection(x.selectionStartLineNumber, x.selectionStartColumn, x.positionLineNumber, x.positionColumn)

export function makeViewModel(editor: any): any {
    const ext: Record<string, unknown> = {
        model: editor.getModel(),
        type: (text: string, source?: string) => editor.trigger(source, 'type', { text }), // Monaco:没给 source 就不是键盘输入(不走电子字符 / 回车缩进),别默认成 'keyboard'
        compositionType: (text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number, source?: string) =>
            editor.trigger(source ?? 'keyboard', 'compositionType', { text, replacePrevCharCnt, replaceNextCharCnt, positionDelta }),
        startComposition: () => editor.trigger('keyboard', 'compositionStart', {}),
        endComposition: (source?: string) => editor.trigger(source ?? 'keyboard', 'compositionEnd', {}),
        paste: (text: string, pasteOnNewLine: boolean, multicursorText?: string[] | null, source?: string) =>
            editor.trigger(source ?? 'keyboard', 'paste', { text, pasteOnNewLine, multicursorText }),
        cut: (source?: string) => editor.trigger(source ?? 'keyboard', 'cut', {}),
        setHasFocus: (_: boolean) => {},
        setSelections: (_source: string | null | undefined, selections: any[]) => editor.setSelections(selections),
        getSelections: () => editor.getSelections().map(toSel),
        getSelection: () => toSel(editor.getSelection()),
        getPosition: () => { const p = editor.getPosition(); return p instanceof Position ? p : new Position(p.lineNumber, p.column) },
        // viewState = 视图坐标(折行后的行号、含续行缩进的列)。投影由 src 的文本侧折行模型(EditorView.viewSelections)给;没折行时视图位置 = 模型位置。
        getCursorStates: () => {
            const view = editor.viewSelections?.() as { anchor: { lineNumber: number, column: number }, head: { lineNumber: number, column: number } }[] | null
            return editor.getSelections().map((s: any, i: number) => {
                const sel = toSel(s)
                const vs = view ? new Selection(view[i].anchor.lineNumber, view[i].anchor.column, view[i].head.lineNumber, view[i].head.column) : sel
                return { modelState: { position: sel.getPosition(), selection: sel }, viewState: { position: vs.getPosition(), selection: vs } }
            })
        },
        saveCursorState: () => editor.getSelections().map((s: any) => { const x = toSel(s); return { selectionStart: { lineNumber: x.selectionStartLineNumber, column: x.selectionStartColumn }, position: { lineNumber: x.positionLineNumber, column: x.positionColumn } } }),
        restoreCursorState: (states: any[]) => editor.setSelections(states.map(s => new Selection(s.selectionStart.lineNumber, s.selectionStart.column, s.position.lineNumber, s.position.column))),
        executeEdits: (source: string, edits: any[], computer: any, _editSource?: unknown) => editor.executeEdits(source, edits, computer),
        executeCommand: (cmd: any, source?: string) => editor.executeCommand(source ?? 'test', cmd),
        onEvent: (cb: (e: any) => void) => editor.onDidChangeCursorSelection((e: any) => cb({
            kind: OutgoingViewModelEventKind.CursorStateChanged,
            selections: [e.selection, ...(e.secondarySelections ?? [])].map(toSel),
            source: e.source, reason: e.reason,
        })),
    }
    return new Proxy(editor, { get(t, k) {
        if (typeof k === 'string' && k in ext) return ext[k]
        const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v
    } })
}
