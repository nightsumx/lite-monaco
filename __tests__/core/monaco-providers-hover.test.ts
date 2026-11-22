// languages.registerHoverProvider → 真实编辑器的悬停卡(经 hoverSources facet,和诊断卡同一张)。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { showHover } from '../../src/core/feature/hover'
import { registerHoverProvider } from '../../src/lang/providerfeatures'
import { Range } from '../../src/api/position'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, tsDiagnostics: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const
const hosts: HTMLElement[] = []
const disposables: { dispose(): void }[] = []
afterEach(() => { while (disposables.length) disposables.pop()!.dispose(); while (hosts.length) hosts.pop()!.remove() })
function mount(doc: string, lang = 'plaintext', features: Record<string, unknown> = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    return liteMonaco({ parent: host, doc, lang, highlighter: fakeHl(), features: { ...QUIET, ...features } as never })
}
const card = (v: ReturnType<typeof mount>) => v.dom.querySelector('.cm-tooltip-hover')

describe('registerHoverProvider → 悬停卡', () => {
    it('光标处有 hover:卡里渲染 markdown;provider 收到 model + 1 起的 position', async () => {
        const v = mount('foo bar')
        let seen: { word?: string, line?: number, col?: number } = {}
        disposables.push(registerHoverProvider('plaintext', {
            provideHover: (model, pos) => { seen = { word: model.getWordAtPosition(pos)?.word, line: pos.lineNumber, col: pos.column }; return { contents: [{ value: '**doc** for foo' }] } },
        }))
        v.setPosition({ lineNumber: 1, column: 2 })
        expect(await showHover(v)).toBe(true)
        expect(seen).toEqual({ word: 'foo', line: 1, col: 2 })
        expect(card(v)!.textContent).toContain('doc for foo')
        expect(card(v)!.querySelector('strong')).not.toBeNull()
    })
    it('没注册 provider / selector 不匹配:不出卡', async () => {
        const v = mount('foo bar', 'plaintext')
        disposables.push(registerHoverProvider('json', { provideHover: () => ({ contents: [{ value: 'x' }] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        expect(await showHover(v)).toBe(false)
        expect(card(v)).toBeNull()
    })
    it('dispose 之后不再出卡', async () => {
        const v = mount('foo bar')
        const d = registerHoverProvider('plaintext', { provideHover: () => ({ contents: [{ value: 'x' }] }) })
        v.setPosition({ lineNumber: 1, column: 2 })
        d.dispose()
        expect(await showHover(v)).toBe(false)
    })
    it('多个 provider 的内容合成一张卡;空内容 / 没内容的丢弃', async () => {
        const v = mount('foo bar')
        disposables.push(
            registerHoverProvider('plaintext', { provideHover: () => ({ contents: [{ value: 'first-doc' }] }) }),
            registerHoverProvider('plaintext', { provideHover: () => ({ contents: [{ value: '' }] }) }),
            registerHoverProvider('plaintext', { provideHover: () => undefined }),
            registerHoverProvider('plaintext', { provideHover: async () => ({ contents: [{ value: 'second-doc' }] }) }),
        )
        v.setPosition({ lineNumber: 1, column: 2 })
        await showHover(v)
        expect(v.dom.querySelectorAll('.cm-tooltip-hover')).toHaveLength(1)
        const text = card(v)!.textContent!
        expect(text).toContain('first-doc')
        expect(text).toContain('second-doc')
    })
    it('provider 给的 range 不含光标:不出卡(Monaco 只收盖住锚点的 hover)', async () => {
        const v = mount('foo bar')
        disposables.push(registerHoverProvider('plaintext', { provideHover: () => ({ contents: [{ value: 'x' }], range: new Range(1, 5, 1, 8) }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        expect(await showHover(v)).toBe(false)
        v.setPosition({ lineNumber: 1, column: 6 })
        expect(await showHover(v)).toBe(true)
    })
    it('provider 抛错:吞掉,不影响别的 provider', async () => {
        const v = mount('foo bar')
        disposables.push(
            registerHoverProvider('plaintext', { provideHover: () => { throw new Error('boom') } }),
            registerHoverProvider('plaintext', { provideHover: () => ({ contents: [{ value: 'ok-doc' }] }) }),
        )
        v.setPosition({ lineNumber: 1, column: 2 })
        await showHover(v)
        expect(card(v)!.textContent).toContain('ok-doc')
    })
    it('features.hover=false:整个悬停关掉,provider 也不问', async () => {
        const v = mount('foo bar', 'plaintext', { hover: false })
        let called = 0
        disposables.push(registerHoverProvider('plaintext', { provideHover: () => { called++; return { contents: [{ value: 'x' }] } } }))
        v.setPosition({ lineNumber: 1, column: 2 })
        await showHover(v)
        expect(called).toBe(0)
    })
})
