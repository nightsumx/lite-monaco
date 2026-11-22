// 第七轮:⌘.(Quick Fix)在没有诊断的位置。Monaco 0.52 对照页实测(/tmp/lc-hunt/r7/monaco-quickfix.ts):
// 标识符上、选中表达式、空行、关键字上都只弹编辑器消息「No code actions available」,贴在光标(选区的 head)处,
// 不弹列表。lite-monaco 另外给 TS 重构(VS Code 的 ⌘. 也有,Monaco 的 TS 没有 refactor provider),有重构时照样出列表;
// 修前:什么都没有时直接返回,没有任何反馈。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { collectCodeActionsAt, runCodeActionsMenu } from '../../src/lang/tscodeactions'

const SLOW = 60_000
const DOC = 'function f(a: number) {\n    const x = a + 1\n    return x * 2\n}\n'

function mount(sel: { anchor: number, head?: number }) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc: DOC, selection: sel }), parent })
    return { view, done: () => { view.destroy(); parent.remove() } }
}

describe('⌘. 没有可用操作', () => {
    it('空行上:不弹列表,光标处出 No code actions available', async () => {
        clearTSServiceCache()
        const at = DOC.indexOf('}\n') + 1
        const { view, done } = mount({ anchor: at })
        const opts = { lang: 'typescript' as const, fileName: '/qf-r7a.ts' }
        expect(await collectCodeActionsAt(view, opts)).toEqual([])
        await runCodeActionsMenu(view, opts)
        const msg = view.dom.querySelector('.cm-editor-message')
        expect(msg?.textContent).toBe('No code actions available')
        expect(document.querySelector('.cm-action-widget')).toBeNull()
        done()
    }, SLOW)

    it('只读编辑器:什么都不做', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [EditorState.readOnly.of(true)] }), parent })
        expect(await runCodeActionsMenu(view, { lang: 'typescript', fileName: '/qf-r7b.ts' })).toBe(false)
        expect(view.dom.querySelector('.cm-editor-message')).toBeNull()
        view.destroy(); parent.remove()
    }, SLOW)
})
