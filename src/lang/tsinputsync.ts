// 输入处理器的异步跟进 —— 语言服务在 Worker 里,请求是异步的,inputHandler 又必须同步表态:
// 处理器同步返回 false(默认输入照常发生),同时发请求;结果回来时用这里的守卫确认「现场没变」,才补后续编辑。
//
// 守卫查四件事,任一不满足就丢弃(不用旧位置去改新文档):
//   1. 这个处理器在这个 view 上没有更新的一次触发(seq,连打 `>` 只处理最后一次);
//   2. view 没销毁;
//   3. 文档恰好是「默认输入发生后」的那一份(expected);
//   4. 单选区(处理器同步部分已排除多选区),需要时光标还在预期位置。
// 后续编辑带 apiEdit:撤销栈里并进刚才的输入(history.ts 对 apiEdit 只看「没被 pushUndoStop 关闭、期间光标没动过」,
// 不要求相邻 —— 联动改另一半标签、格式化编辑往往离刚打的字很远),Ctrl+Z 一次撤掉输入 + 后续编辑。

import type { EditorView } from '../core/view/editorview'
import type { Rope } from '../core/model/rope'
import { apiEdit } from '../core/edit/history'
import { materializeDoc } from '../core/perf'

/** 后续编辑要带的注解:并进上一个撤销步 */
export const joinPrevious = apiEdit.of(true)

const dead = new WeakSet<EditorView>()
const watched = new WeakSet<EditorView>()
function watch(view: EditorView) {
    if (watched.has(view)) return
    watched.add(view)
    view.onDestroy(() => dead.add(view))
}

/**
 * view 还活着、文档恰好是 expected、单选区(处理器同步部分已排除多选区),需要时光标还在 head。
 * 引用相同最便宜;否则退一步比长度,再比全文(materializeDoc 同一 state 只物化一次)。
 */
export function inputSettled(view: EditorView, expected: Rope, head?: number): boolean {
    if (dead.has(view)) return false
    const state = view.state
    const doc = state.doc
    if (doc !== expected && (doc.length !== expected.length || materializeDoc(state) !== expected.toString())) return false
    if (state.selection.ranges.length !== 1) return false
    if (head !== undefined) {
        const sel = state.selection.main
        if (!sel.empty || sel.head !== head) return false
    }
    return true
}

/** 处理器要在 view 上登记一次(让销毁能被守卫看到);begin 已经替你做了 */
export { watch as watchView }

/**
 * 每个处理器各建一个。begin() 在处理器里(同步)调用,返回的 valid() 在结果回来时调用。
 * expected:默认输入发生后的文档(用 `state.changes({from,to,insert}).apply(state.doc)` 算,不必 toString);
 * head:默认输入后光标应在的位置,不关心就不给。
 */
export function followUpGuard() {
    const latest = new WeakMap<EditorView, number>()
    return function begin(view: EditorView, expected: Rope, head?: number): () => boolean {
        const seq = (latest.get(view) ?? 0) + 1
        watch(view)
        latest.set(view, seq)
        return () => latest.get(view) === seq && inputSettled(view, expected, head)
    }
}
