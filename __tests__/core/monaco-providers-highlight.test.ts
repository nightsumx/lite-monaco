// languages.registerDocumentHighlightProvider → 非 TS 编辑器的同符号高亮(WordHighlighter 对 provider 那一支)。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerDocumentHighlightProvider } from '../../src/lang/providerfeatures'
import { highlightField } from '../../src/lang/tshighlight'
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
function mount(doc: string): V {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const v = liteMonaco({ parent: host, doc, lang: 'plaintext', highlighter: fakeHl(), features: QUIET as never })
    views.push(v)
    // jsdom 没有字形坐标 → 文本同词的盒子画不出来;桩 caretCoords,让每个范围画一个盒子
    ;(v as unknown as { caretCoords: unknown }).caretCoords = (pos: number) => ({ left: pos * 7, top: 0, bottom: 18, height: 18 })
    v.contentDOM.focus()
    return v
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const marks = (v: V) => v.state.field(highlightField).map(m => [m.from, m.to, !!m.write])
const at = async (v: V, pos: number) => {
    v.dispatch(v.state.update({ selection: { anchor: pos }, userEvent: 'select.pointer' }))
    await wait(420)
}
const rng = (s: number, e: number) => ({ startLineNumber: 1, startColumn: s, endLineNumber: 1, endColumn: e })
const DOC = 'foo bar foo // foo'

describe('registerDocumentHighlightProvider', () => {
    it('用户移动光标:问 provider,按它给的范围画;Write → Strong,其余 → Text', async () => {
        const v = mount(DOC)
        const seen: number[] = []
        disposables.push(registerDocumentHighlightProvider('plaintext', {
            provideDocumentHighlights: (_m, pos) => { seen.push(pos.column); return [{ range: rng(1, 4), kind: 2 }, { range: rng(9, 12), kind: 1 }] },
        }))
        await at(v, 1)
        expect(seen).toEqual([2])
        expect(marks(v)).toEqual([[0, 3, true], [8, 11, false]])
        expect(v.contentDOM.querySelectorAll('.cm-wordHighlightStrong').length).toBe(1)
        expect(v.contentDOM.querySelectorAll('.cm-wordHighlightText').length).toBe(1)
    })
    it('provider 管着时不再画文本同词(没给的 foo 不亮)', async () => {
        const v = mount(DOC)
        disposables.push(registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => [{ range: rng(1, 4) }] }))
        await at(v, 1)
        expect(v.contentDOM.querySelectorAll('.cm-wordHighlightText').length).toBe(1)
        expect(v.dom.querySelectorAll('.cm-wordHighlightTextBox').length).toBe(0)
    })
    it('空数组也算结果:什么都不画,也不退文本', async () => {
        const v = mount(DOC)
        disposables.push(registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => [] }))
        await at(v, 1)
        expect(marks(v)).toEqual([])
        expect(v.dom.querySelectorAll('.cm-wordHighlightTextBox').length).toBe(0)
    })
    it('返回 undefined / null:问下一个 provider;都没有 → 文本同词(整词,Text)', async () => {
        const v = mount(DOC)
        const order: string[] = []
        disposables.push(
            registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => { order.push('old'); return undefined } }),
            registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => { order.push('new'); return null } }),
        )
        await at(v, 1)
        expect(order).toEqual(['new', 'old'])
        expect(marks(v)).toEqual([[0, 3, false], [8, 11, false], [15, 18, false]])
    })
    it('provider 抛错:跳过它', async () => {
        const v = mount(DOC)
        const orig = console.error
        console.error = () => {}
        disposables.push(
            registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => [{ range: rng(5, 8) }] }),
            registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => { throw new Error('x') } }),
        )
        await at(v, 1)
        console.error = orig
        expect(marks(v)).toEqual([[4, 7, false]])
    })
    it('改文档立即清掉;程序设选区(非用户移动)不查', async () => {
        const v = mount(DOC)
        let n = 0
        disposables.push(registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => { n++; return [{ range: rng(1, 4) }] } }))
        await at(v, 1)
        expect(marks(v).length).toBe(1)
        v.dispatch(v.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(marks(v)).toEqual([])
        v.dispatch(v.state.update({ selection: { anchor: 6 } }))
        await wait(420)
        expect(n).toBe(1)
        expect(marks(v)).toEqual([])
    })
    it('没有 provider:行为不变(文本同词仍由 highlightLayer 画,field 恒空)', async () => {
        const v = mount(DOC)
        await at(v, 1)
        expect(marks(v)).toEqual([])
        expect(v.dom.querySelectorAll('.cm-wordHighlightTextBox').length).toBeGreaterThan(0)
    })
    it('注销后回到文本同词', async () => {
        const v = mount(DOC)
        const d = registerDocumentHighlightProvider('plaintext', { provideDocumentHighlights: () => [{ range: rng(1, 4) }] })
        d.dispose()
        await at(v, 1)
        expect(marks(v)).toEqual([])
    })
})
