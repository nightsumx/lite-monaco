// languages.registerColorProvider → 颜色标记 + hover 色卡(Monaco ColorDetector / ColorHoverParticipant)。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerColorProvider } from '../../src/lang/providerfeatures'
import { providerColorHoverSource, providerColorField } from '../../src/lang/providercolors'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, tsDiagnostics: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const
type V = ReturnType<typeof liteMonaco>
const hosts: HTMLElement[] = []
const views: V[] = []
const disposables: { dispose(): void }[] = []
afterEach(() => {
    while (disposables.length) disposables.pop()!.dispose()
    while (views.length) views.pop()!.destroy()
    while (hosts.length) hosts.pop()!.remove()
})
function mount(doc: string, extra: Record<string, unknown> = {}): V {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const v = liteMonaco({ parent: host, doc, lang: 'plaintext', highlighter: fakeHl(), features: QUIET as never, ...extra })
    views.push(v)
    return v
}
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 1500) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }
const rng = (c1: number, c2: number) => ({ startLineNumber: 1, startColumn: c1, endLineNumber: 1, endColumn: c2 })
const marks = (v: V) => [...v.contentDOM.querySelectorAll('.cm-providerColor')].map(e => [e.textContent, (e as HTMLElement).style.borderBottom])
const named = (v: V) => v.state.field(providerColorField).length
const reg = (calls: { n: number } = { n: 0 }) => registerColorProvider('plaintext', {
    provideDocumentColors: m => {
        calls.n++
        const out: { range: ReturnType<typeof rng>, color: { red: number, green: number, blue: number, alpha: number } }[] = []
        for (const x of m.getValue().matchAll(/\b(red|green)\b/g))
            out.push({ range: rng(x.index! + 1, x.index! + 1 + x[0].length), color: x[0] === 'red' ? { red: 1, green: 0, blue: 0, alpha: 1 } : { red: 0, green: 0.5, blue: 0, alpha: 0.5 } })
        return out
    },
    provideColorPresentations: (_m, info) => [{ label: info.color.red === 1 ? 'RED!' : 'GREEN!' }],
})

describe('registerColorProvider', () => {
    it('provider 给的颜色画标记(rgba 取自分量),注销后消失', async () => {
        const v = mount('red and green')
        const d = reg()
        disposables.push(d)
        await until(() => named(v) > 0)
        expect(named(v)).toBe(2)
        expect(marks(v).map(m => m[0])).toEqual(['red', 'green'])
        expect(v.state.field(providerColorField).map(c => c.css)).toEqual(['rgba(255, 0, 0, 1)', 'rgba(0, 128, 0, 0.5)'])
        d.dispose()
        await until(() => named(v) === 0)
        expect(named(v)).toBe(0)
    })
    it('colorDecorators=false:不画;打开后立即出来', async () => {
        const v = mount('red', { options: { colorDecorators: false } })
        disposables.push(reg())
        await wait(60)
        expect(marks(v)).toEqual([])
        v.updateOptions({ colorDecorators: true })
        await until(() => marks(v).length > 0)
        expect(marks(v).length).toBe(1)
    })
    it('colorDecoratorsLimit 截断', async () => {
        const v = mount('red red red red', { options: { colorDecoratorsLimit: 2 } })
        disposables.push(reg())
        await until(() => named(v) > 0)
        expect(named(v)).toBe(2)
    })
    it('改文档:颜色随编辑移动,250ms 防抖后重算', async () => {
        const v = mount('red')
        const calls = { n: 0 }
        disposables.push(reg(calls))
        await until(() => named(v) === 1)
        v.executeEdits('t', [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'xx ' }])
        expect(v.state.field(providerColorField)[0].from).toBe(3)
        expect(calls.n).toBe(1)
        await until(() => calls.n === 2)
        expect(calls.n).toBe(2)
    })
    it('hover:色块 + presentation 第一个 label;colorDecoratorsActivatedOn=click 时没有', async () => {
        const v = mount('red')
        disposables.push(reg())
        await until(() => named(v) === 1)
        const h = await providerColorHoverSource(v.state, 1, 1, v as never)
        const dom = h!.create()
        expect(dom.querySelector('.cm-color-hover-text')!.textContent).toBe('RED!')
        expect((dom.querySelector('.cm-color-hover-swatch') as HTMLElement).style.background).toContain('rgb(255, 0, 0)')
        v.updateOptions({ colorDecoratorsActivatedOn: 'click' })
        expect(providerColorHoverSource(v.state, 1, 1, v as never)).toBeNull()
    })
    it('provider 抛错:跳过它,别的 provider 照常', async () => {
        const v = mount('red')
        const orig = console.error
        console.error = () => {}
        disposables.push(reg(), registerColorProvider('plaintext', { provideDocumentColors: () => { throw new Error('x') }, provideColorPresentations: () => [] }))
        await until(() => named(v) === 1)
        console.error = orig
        expect(named(v)).toBe(1)
    })
})
