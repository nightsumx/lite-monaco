import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { applyDocComment, docCommentInput } from '../../src/lang/tsdoc'
import { undo, redo } from '../../src/core/edit/history'
import { typeText } from './input-harness'
import { SLOW, drain, mount, spy } from './tsinput-harness'

describe('applyDocComment', () => {
    it('/* 后再打 *：拼上完整 /** 模板，含 @param', () => {
        const spec = applyDocComment('*', '/**\n * \n * @param a\n */\n')
        expect(spec).not.toBeNull()
        expect(spec!.insert.startsWith('/**')).toBe(true)
        expect(spec!.insert).toContain('@param a')
        expect(spec!.cursor).toBeGreaterThan(0)
    })

    it('不是第二颗 * 或空模板 → null', () => {
        expect(applyDocComment('/', '*\n *')).toBeNull()
        expect(applyDocComment('*', '')).toBeNull()
    })
})

describe('docCommentInput', () => {
    const opts = { lang: 'typescript', fileName: '/main.ts' }
    const tail = '\nfunction foo(a: number) { return a }\n'
    const doc = '/*' + tail

    async function setup() {
        clearTSServiceCache()
        const session = getTSService(opts)
        session.update(doc)
        await session.ensure()
        const h = spy(docCommentInput(opts))
        return { ...mount(doc, [h.ext], { anchor: 2 }), h }
    }

    it('函数上 /* 再打 * 展开 @param:同步返回 false,`*` 先落地,模板随后到', async () => {
        const { view, done, h } = await setup()
        typeText(view, 2, '*')
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('/**' + tail)
        await drain(opts)
        expect(view.state.doc.toString()).toMatch(/@param a/)
        done()
    }, SLOW)

    it('回包前用户又输入 → 丢弃', async () => {
        const { view, done } = await setup()
        typeText(view, 2, '*')
        typeText(view, 3, 'x')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('/**x' + tail)
        done()
    }, SLOW)

    it('回包前光标挪走 → 丢弃', async () => {
        const { view, done } = await setup()
        typeText(view, 2, '*')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.length) }))
        await drain(opts)
        expect(view.state.doc.toString()).toBe('/**' + tail)
        done()
    }, SLOW)

    it('撤销:Ctrl+Z 一次撤掉 `*` 和展开的模板,重做一起回来', async () => {
        const { view, done } = await setup()
        typeText(view, 2, '*')
        await drain(opts)
        const expanded = view.state.doc.toString()
        expect(expanded).toMatch(/@param a/)
        undo(view)
        expect(view.state.doc.toString()).toBe(doc)
        redo(view)
        expect(view.state.doc.toString()).toBe(expanded)
        done()
    }, SLOW)

    it('不是 /* 后的 * :不动', async () => {
        const { view, done, h } = await setup()
        typeText(view, 0, '*')
        await drain(opts)
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('*' + doc)
        done()
    }, SLOW)
})
