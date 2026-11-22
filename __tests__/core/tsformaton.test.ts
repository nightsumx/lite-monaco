import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { formatOnTypeInput, formatOnPasteInput } from '../../src/lang/tsformaton'
import { pasteText } from '../../src/core/input/clipboard'
import { undo, redo } from '../../src/core/edit/history'
import { typeText } from './input-harness'
import { SLOW, drain, mount, spy } from './tsinput-harness'

describe('formatOnTypeInput', () => {
    const opts = { lang: 'typescript', fileName: '/fot.ts' }
    const doc = 'const x=1'
    async function setup() {
        clearTSServiceCache()
        const session = getTSService(opts)
        session.update(doc)
        await session.ensure()
        const h = spy(formatOnTypeInput(opts))
        return { ...mount(doc, [h.ext], { anchor: doc.length }), h }
    }

    it('打分号后补空格:同步返回 false,`;` 先落地,格式化随后到,光标在 `;` 后', async () => {
        const { view, done, h } = await setup()
        typeText(view, doc.length, ';')
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('const x=1;')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const x = 1;')
        expect(view.state.selection.main.head).toBe('const x = 1;'.length)
        done()
    }, SLOW)

    it('回包前用户又输入 → 丢弃(格式化编辑的位置是输入后那份文档的)', async () => {
        const { view, done } = await setup()
        typeText(view, doc.length, ';')
        typeText(view, doc.length + 1, 'y')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const x=1;y')
        done()
    }, SLOW)

    it('回包前光标挪走 → 丢弃', async () => {
        const { view, done } = await setup()
        typeText(view, doc.length, ';')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(0) }))
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const x=1;')
        done()
    }, SLOW)

    it('撤销:`;` 和格式化同一个撤销步,重做一起回来', async () => {
        const { view, done } = await setup()
        typeText(view, doc.length, ';')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const x = 1;')
        undo(view)
        expect(view.state.doc.toString()).toBe(doc)
        redo(view)
        expect(view.state.doc.toString()).toBe('const x = 1;')
        done()
    }, SLOW)

    it('不是 ; 或 } 不认领', () => {
        const { view, done } = mount('x')
        expect(formatOnTypeInput({ lang: 'typescript', fileName: '/fot2.ts' })(view, 1, 1, 'a')).toBe(false)
        done()
    })
})

describe('formatOnPasteInput', () => {
    const opts = { lang: 'typescript', fileName: '/fop.ts' }
    const doc = 'function f() {\n}'
    async function setup() {
        clearTSServiceCache()
        const session = getTSService(opts)
        session.update(doc)
        await session.ensure()
        const h = spy(formatOnPasteInput(opts))
        return { ...mount(doc, [h.ext], { anchor: 15 }), h }
    }

    it('粘贴多行后补空格:同步返回 false,粘贴先落地,格式化随后到', async () => {
        const { view, done, h } = await setup()
        pasteText(view, 'const x=1\n')
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('function f() {\nconst x=1\n}')
        await drain(opts)
        expect(view.state.doc.toString()).toMatch(/const x = 1/)
        done()
    }, SLOW)

    it('回包前用户又输入 → 丢弃', async () => {
        const { view, done } = await setup()
        pasteText(view, 'const x=1\n')
        typeText(view, 1, 'z')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('fzunction f() {\nconst x=1\n}')
        done()
    }, SLOW)

    it('撤销:粘贴与格式化同一个撤销步', async () => {
        const { view, done } = await setup()
        pasteText(view, 'const x=1\n')
        await drain(opts)
        expect(view.state.doc.toString()).toMatch(/const x = 1/)
        undo(view)
        expect(view.state.doc.toString()).toBe(doc)
        done()
    }, SLOW)

    it('单行不认领', () => {
        const { view, done } = mount('x')
        expect(formatOnPasteInput({ lang: 'typescript', fileName: '/fop2.ts' })(view, 1, 1, 'y')).toBe(false)
        done()
    })
})
