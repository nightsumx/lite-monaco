// 输入后格式化 —— `;` / `}` 后问 getFormattingEditsAfterKeystroke;多行粘贴后问 getFormattingEditsForRange。
//
// 对齐 Monaco:formatOnType / formatOnPaste 默认关(liteMonaco() 的 features 开关打开才装)。
// 语言服务在 Worker 里,请求是异步的:处理器同步返回 false(原输入照常落地),格式化编辑回来后,
// 若文档、光标还是输入后的样子,再单独一个事务应用(带 apiEdit 并进原输入的撤销步,Ctrl+Z 一次撤两者);
// 回来前用户又动过文档/光标就丢弃(见 tsinputsync.ts)。
// 位置一律走 ChangeSet 映射,不按 insert.length 算 —— CRLF 进文档后 `\r\n` 只占一个换行,按字符串长度算会越界/偏移。
// 多选区不认领:落回默认路径,每个选区都照常插入(多光标按行分发归 clipboard)。

import type { InputHandler, EditorView } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { ChangeSet } from '../core/model/change'
import { EditorState } from '../core/model/state'
import { getTSService, type TSServiceOptions } from './tsservice'
import { tsFormatOptions } from './tsformatopts'
import { followUpGuard, joinPrevious } from './tsinputsync'

type TextEdit = { span: { start: number, length: number }, newText: string }

/** 格式化编辑(相对输入后的文档)→ 单独一个事务;光标落在原输入末尾 end(经格式化映射) */
function applyFormat(view: EditorView, end: number, edits: TextEdit[], userEvent: string): void {
    const newLen = view.state.doc.length
    const valid = edits.filter(e => e.span.start >= 0 && e.span.start + e.span.length <= newLen)
    if (!valid.length) return
    const sep = view.state.facet(EditorState.lineSeparator) || undefined
    const fmt = ChangeSet.of(
        valid.map(e => ({ from: e.span.start, to: e.span.start + e.span.length, insert: e.newText })),
        newLen,
        sep,
    )
    view.dispatch(view.state.update({
        changes: fmt,
        selection: EditorSelection.cursor(fmt.mapPos(end, 1)),
        scrollIntoView: true,
        userEvent,
        annotations: joinPrevious,
    }))
}

// 输入时 / 粘贴时格式化:Monaco 传 model.getFormattingOptions(),缩进按 indentSize(见 tsformatopts.ts)
function formatSettings(view: EditorView) {
    return tsFormatOptions(view.state, 'format')
}

export function formatOnTypeInput(opts: TSServiceOptions): InputHandler {
    const session = getTSService(opts)
    const begin = followUpGuard()
    return (view, from, to, insert) => {
        if (view.state.readOnly) return false
        if (insert !== ';' && insert !== '}') return false
        if (view.state.selection.ranges.length > 1) return false
        const first = view.state.changes({ from, to, insert })
        const next = first.apply(view.state.doc)
        session.update(next.toString())
        const pos = first.mapPos(to, 1)
        const valid = begin(view, next, pos)
        session.service().getFormattingEditsAfterKeystroke(session.fileName, pos, insert, formatSettings(view)).then(edits => {
            if (edits?.length && valid()) applyFormat(view, pos, edits, 'input.type')
        }, () => {})
        return false
    }
}

/** 粘贴多行后格式化插入区间。 */
export function formatOnPasteInput(opts: TSServiceOptions): InputHandler {
    const session = getTSService(opts)
    const begin = followUpGuard()
    return (view, from, to, insert) => {
        if (view.state.readOnly) return false
        if (insert.indexOf('\n') < 0 && insert.indexOf('\r') < 0) return false
        if (view.state.selection.ranges.length > 1) return false
        const first = view.state.changes({ from, to, insert })
        const next = first.apply(view.state.doc)
        session.update(next.toString())
        const end = first.mapPos(to, 1)
        const valid = begin(view, next, end)
        session.service().getFormattingEditsForRange(session.fileName, from, end, formatSettings(view)).then(edits => {
            if (edits?.length && valid()) applyFormat(view, end, edits, 'input.paste')
        }, () => {})
        return false
    }
}
