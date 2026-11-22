// tsactions 迁到异步语言服务之后的行为:各动作照旧改文档;请求期间文档变了就放弃(不用旧位置改新文档)。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { createTSActions } from '../../src/lang/tsactions'

const SLOW = 60_000
let n = 0

function mount(doc: string, sel?: { from: number, to?: number }) {
    clearTSServiceCache()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: sel ? EditorSelection.single(sel.from, sel.to ?? sel.from) : undefined }),
        parent: host,
    })
    const actions = createTSActions({ lang: 'typescript', fileName: `/async-${n++}.ts` })
    return { view, actions, done: () => { view.destroy(); host.remove() } }
}

afterEach(() => clearTSServiceCache())

describe('tsactions 异步', () => {
    it('formatSelection:只格式化选中的行', async () => {
        const doc = 'function f() {\nreturn   1\n}\nlet   y = 2\n'
        const at = doc.indexOf('return')
        const { view, actions, done } = mount(doc, { from: at, to: at + 10 })
        expect(await actions.formatSelection(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('function f() {\n    return 1\n}\nlet   y = 2\n')
        done()
    }, SLOW)

    it('organizeImports / removeUnusedImports', async () => {
        const doc = "import { b, a } from './m'\nimport { unused } from './m'\nconsole.log(a, b)\n"
        const m = mount(doc)
        expect(await m.actions.removeUnusedImports(m.view)).toBe(true)
        expect(m.view.state.doc.toString()).not.toContain('unused')
        m.done()
        const o = mount("import { b, a } from './m'\nconsole.log(a, b)\n")
        expect(await o.actions.organizeImports(o.view)).toBe(true)
        expect(o.view.state.doc.toString()).toContain('import { a, b } from')
        o.done()
    }, SLOW)

    it('addTypeAnnotation:服务一侧算类型标注', async () => {
        const doc = 'const x = 1\n'
        const { view, actions, done } = mount(doc, { from: 7 })
        expect(await actions.addTypeAnnotation(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('const x: number = 1\n')
        done()
    }, SLOW)

    it('请求期间文档变了:结果丢弃,不用旧位置改新文档', async () => {
        const doc = 'function f() {\nreturn   1\n}\n'
        const { view, actions, done } = mount(doc)
        const p = actions.formatDocument(view)
        const typed = '// x\n' + doc
        view.dispatch(view.state.update({ changes: { from: 0, insert: '// x\n' } }))
        expect(await p).toBe(false)
        expect(view.state.doc.toString()).toBe(typed)
        // 重新来一次就成功
        expect(await actions.formatDocument(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('// x\nfunction f() {\n    return 1\n}\n')
        done()
    }, SLOW)

    it('请求期间文档变了:跳转静默放弃(不弹 No definition found)', async () => {
        const doc = 'const a = 1\na\n'
        const { view, actions, done } = mount(doc, { from: doc.length - 1 })
        const p = actions.goToDefinition(view)
        view.dispatch(view.state.update({ changes: { from: doc.length, insert: '\n' } }))
        expect(await p).toBe(false)
        expect(view.dom.querySelector('.cm-editor-message, .cm-message')).toBeNull()
        done()
    }, SLOW)

    it('hasDefinitionSync:没缓存先当有,后台问完后给出真实答案', async () => {
        const doc = 'const a = 1\na\n'
        const { view, actions, done } = mount(doc, { from: doc.length - 1 })
        expect(actions.hasDefinitionSync(view)).toBe(true)
        view.dispatch(view.state.update({ selection: EditorSelection.single(0) })) // 关键字 const 上没有定义
        actions.hasDefinitionSync(view)
        await vi.waitFor(() => expect(actions.hasDefinitionSync(view)).toBe(false))
        done()
    }, SLOW)
})
