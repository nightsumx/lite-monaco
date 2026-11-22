// TS 输入处理器(闭合标签 / 联动编辑 / 文档注释 / 输入时·粘贴时格式化)的测试地基。
// 这些处理器同步返回 false、结果异步到:测试走真实输入路径(DOM 变异 → inputHandler → 默认输入),
// 再用 drain 等「此前发出的请求都回来了」,不靠固定 sleep。

import { EditorState, type Extension } from '../../src/core/model/state'
import { EditorView, inputHandler, type InputHandler } from '../../src/core/view/editorview'
import { history } from '../../src/core/edit/history'
import { getTSService, type TSServiceOptions } from '../../src/lang/tsservice'

export const SLOW = 60_000

/** 记录处理器返回值的包装:断言「同步返回 false」用 */
export function spy(h: InputHandler): { ext: Extension, results: boolean[] } {
    const results: boolean[] = []
    return { results, ext: inputHandler.of((v, f, t, i) => { const r = h(v, f, t, i); results.push(r); return r }) }
}

export function mount(doc: string, extensions: Extension[] = [], selection?: { anchor: number }) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection, extensions: [history(), ...extensions] }),
        parent: host,
    })
    return { view, done: () => { view.destroy(); host.remove() } }
}

/**
 * 等此前发给语言服务的请求都回来、它们的 then 回调都跑完:请求按到达顺序处理、按序回包,
 * 所以再发一个新请求并等它,就等于等了前面所有的。
 */
export async function drain(opts: TSServiceOptions): Promise<void> {
    const s = getTSService(opts)
    await s.service().getSyntacticDiagnostics(s.fileName)
    await Promise.resolve()
}
