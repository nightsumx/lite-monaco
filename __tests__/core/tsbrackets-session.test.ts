// 括号跳过表的请求节奏:同时只飞一个、回来时文档又变了再发一个、销毁后回来的不处理。
// TS 服务换成可控的替身(请求由测试手动放行),区间表自己给,不依赖真 TypeScript。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorView as View } from '../../src/core/view/editorview'

const fake = vi.hoisted(() => {
    const calls: { resolve: (r: number[]) => void, reject: (e: unknown) => void }[] = []
    return {
        calls,
        session: {
            fileName: '/f.ts',
            update: () => {},
            ensure: async () => ({}),
            service: () => ({
                $skipRanges: () => new Promise<number[]>((resolve, reject) => { calls.push({ resolve, reject }) }),
            }),
        },
    }
})
vi.mock('../../src/lang/tsservice', () => ({ getTSService: () => fake.session }))

const { EditorState } = await import('../../src/core/model/state')
const { EditorView } = await import('../../src/core/view/editorview')
const { bracketSkip } = await import('../../src/core/edit/brackets')
const { tsBracketSkipField, tsBracketSkipSession } = await import('../../src/lang/tsbrackets')

const views: View[] = []
const offs: (() => void)[] = []
afterEach(() => {
    for (const off of offs.splice(0)) off()
    for (const v of views.splice(0)) v.destroy()
    fake.calls.length = 0
})
const mount = (doc: string) => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc, extensions: [tsBracketSkipField] }), parent })
    views.push(view)
    const off = tsBracketSkipSession(view, { lang: 'typescript' })
    offs.push(off)
    return { view, off }
}
const skip = (v: View, pos: number) => bracketSkip(v, v.state.doc)?.(pos)
const tick = (ms: number) => new Promise(r => setTimeout(r, ms))
const countRefresh = (v: View) => {
    const c = { n: 0 }
    v.onTransaction(tr => { if (!tr.docChanged && tr.effects.length) c.n++ })
    return c
}

describe('括号跳过表:请求节奏', () => {
    it('首次查询触发一次请求;飞行中改文档不再发;回来后映射着用,并再发一次拿精确表', async () => {
        const { view } = mount('f("a(b", c)')
        const c = countRefresh(view)
        expect(skip(view, 4)).toBeUndefined() // 没表:退回 shiki
        await vi.waitFor(() => expect(fake.calls.length).toBe(1))
        // 飞行中改了两次文档,等过防抖时间:仍然只有这一个请求
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x ' } }))
        view.dispatch(view.state.update({ changes: { from: 8, insert: 'zz' } })) // 闭引号之前
        await tick(120)
        expect(fake.calls.length).toBe(1)
        // 第一个请求回来(对应的是改动前的文档):收下、重画,查询走映射
        fake.calls[0].resolve([2, 7]) // "a(b" 在原文档的 [2, 7)... 原文 f("a(b", c): " 在 2,闭引号在 6 → 止 7
        await vi.waitFor(() => expect(c.n).toBe(1))
        // 回来时文档已不是请求时的:不用等有人来查,自己再发一个
        await vi.waitFor(() => expect(fake.calls.length).toBe(2))
        const text = view.state.doc.toString()
        expect(text).toBe('x f("a(bzz", c)')
        expect(skip(view, text.indexOf('(b'))).toBe(true) // 平移 + 伸缩后仍在字符串里
        expect(skip(view, text.indexOf('(b') - 3)).toBe(false) // f( 的括号
        fake.calls[1].resolve([4, 11])
        await vi.waitFor(() => expect(c.n).toBe(2))
        expect(skip(view, text.indexOf('(b'))).toBe(true)
        expect(skip(view, 3)).toBe(false)
        // 文档没再变:不会再发
        await tick(120)
        expect(fake.calls.length).toBe(2)
    })

    it('文档连续多次变化只在安静 50ms 后发一个请求', async () => {
        const { view } = mount('f("(")')
        skip(view, 3)
        await vi.waitFor(() => expect(fake.calls.length).toBe(1))
        fake.calls[0].resolve([2, 5])
        await vi.waitFor(() => expect(skip(view, 3)).toBe(true))
        for (let i = 0; i < 5; i++) {
            view.dispatch(view.state.update({ changes: { from: 4, insert: 'k' } }))
            await tick(10)
        }
        expect(fake.calls.length).toBe(1)
        await vi.waitFor(() => expect(fake.calls.length).toBe(2))
        await tick(100)
        expect(fake.calls.length).toBe(2)
    })

    it('销毁后回来的结果不处理', async () => {
        const { view, off } = mount('f("(")')
        const c = countRefresh(view)
        skip(view, 3)
        await vi.waitFor(() => expect(fake.calls.length).toBe(1))
        off()
        fake.calls[0].resolve([2, 5])
        await tick(50)
        expect(c.n).toBe(0)
        expect(skip(view, 3)).toBeUndefined() // 来源已撤
    })

    it('请求失败:不重试、不抛,查询仍退回 shiki', async () => {
        const { view } = mount('f("(")')
        skip(view, 3)
        await vi.waitFor(() => expect(fake.calls.length).toBe(1))
        fake.calls[0].reject(new Error('boom'))
        await tick(150)
        expect(fake.calls.length).toBe(1)
        expect(skip(view, 3)).toBeUndefined()
    })

    it('文档太大(L/XL)不请求,也不给表', async () => {
        const big = Array.from({ length: 30000 }, (_, i) => `const v${i} = f("(", ${i})`).join('\n')
        const { view } = mount(big)
        expect(skip(view, 3)).toBeUndefined()
        await tick(120)
        expect(fake.calls.length).toBe(0)
    })
})
