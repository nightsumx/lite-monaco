// JSDoc 模板 —— `/*` 后再打 `*` 问 LS getDocCommentTemplateAtPosition，展开 @param。
// 语言服务在 Worker 里：处理器同步返回 false（`*` 照常打进去），模板回来后若文档、光标还是打完 `*` 的样子，
// 再把 `/**` 换成完整模板（并进刚才输入的撤销步）；否则丢弃。见 tsinputsync.ts。

import type { InputHandler } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { materializeDoc } from '../core/perf'
import { getTSService, type TSServiceOptions } from './tsservice'
import { followUpGuard, joinPrevious } from './tsinputsync'

export function applyDocComment(
    insert: string,
    template: string,
    caretOffset?: number,
): { insert: string, cursor: number } | null {
    if (insert !== '*' || !template) return null
    let text = template
    if (!text.startsWith('/**'))
        text = text.startsWith('*') ? '/**' + text.slice(1) : '/**' + text
    let cursor = 4
    if (caretOffset != null)
        cursor = Math.max(0, Math.min(text.length, caretOffset))
    return { insert: text, cursor }
}

function lineStartAt(text: string, pos: number): number {
    let i = pos
    while (i > 0 && text.charCodeAt(i - 1) !== 10) i--
    return i
}

export function docCommentInput(opts: TSServiceOptions): InputHandler {
    const session = getTSService(opts)
    const begin = followUpGuard()
    return (view, from, to, insert) => {
        if (view.state.readOnly) return false
        if (insert !== '*' || from < 2) return false
        if (view.state.selection.ranges.length > 1) return false
        const text = materializeDoc(view.state)
        const ls = lineStartAt(text, from)
        const line = text.slice(ls, from)
        let i = 0
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
        if (line.slice(i) !== '/*') return false
        let end = to
        if (text[end] === '\n') end++
        const virtual = text.slice(0, ls) + text.slice(end)
        session.update(virtual)
        const first = view.state.changes({ from, to, insert })
        // `*` 打进去之后：替换区间是 [ls + i, 原 to 映射后]（`/*` + 这颗 `*`）
        const after = first.mapPos(to, 1)
        const valid = begin(view, first.apply(view.state.doc), after)
        session.service().getDocCommentTemplateAtPosition(session.fileName, ls).then(res => {
            const spec = applyDocComment(insert, res?.newText ?? '', res?.caretOffset)
            if (!spec || !valid()) return
            // 只替换 `/*` + 这颗 `*`,原来的缩进和换行不动:TS 给的模板按它自己算的缩进排、末尾可能自带换行 + 缩进,
            // 去掉后每行改成本行缩进 + ` *…`,光标跟着换算
            const indent = line.slice(0, i)
            const src = spec.insert.split('\n')
            while (src.length > 1 && !src[src.length - 1].trim()) src.pop()
            let out = ''
            let cursor = -1
            let at = 0
            src.forEach((l, n) => {
                const lead = n === 0 ? 0 : l.length - l.trimStart().length
                const row = n === 0 ? l : indent + ' ' + l.slice(lead)
                out += n ? '\n' : ''
                if (cursor < 0 && spec.cursor <= at + l.length) cursor = out.length + Math.max(0, spec.cursor - at - lead + (n === 0 ? 0 : indent.length + 1))
                out += row
                at += l.length + 1
            })
            view.dispatch(view.state.update({
                changes: { from: ls + i, to: after, insert: out },
                selection: EditorSelection.cursor(ls + i + (cursor < 0 ? out.length : cursor)),
                userEvent: 'input.type',
                scrollIntoView: true,
                annotations: joinPrevious,
            }))
        }, () => {})
        return false
    }
}
