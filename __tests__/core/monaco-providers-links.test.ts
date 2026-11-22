// languages.registerLinkProvider → 下划线 / hover / editor.action.openLink / 点击打开(Monaco LinkDetector)。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerLinkProvider } from '../../src/lang/providerfeatures'
import { linkAt, linkHoverSource, registerLinkOpener } from '../../src/core/feature/link'
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
const rng = (l1: number, c1: number, l2: number, c2: number) => ({ startLineNumber: l1, startColumn: c1, endLineNumber: l2, endColumn: c2 })
const underlined = (v: V) => [...v.contentDOM.querySelectorAll('.detected-link')].map(e => e.textContent)
const opened = (): string[] => {
    const urls: string[] = []
    disposables.push(registerLinkOpener({ open: u => { urls.push(u.toString()); return true } }))
    return urls
}
const DOC = 'see [[foo]] and [[bar]] here'
const wiki = (pre = 'wiki:') => registerLinkProvider('plaintext', {
    provideLinks: m => ({
        links: [...m.getValue().matchAll(/\[\[(\w+)\]\]/g)].map(x => ({
            range: rng(1, x.index! + 1, 1, x.index! + 1 + x[0].length),
            url: pre + x[1],
        })),
    }),
})

describe('registerLinkProvider', () => {
    it('provider 的链接画 detected-link 下划线;注销后消失', async () => {
        const v = mount(DOC)
        const d = wiki()
        disposables.push(d)
        await until(() => underlined(v).length > 0)
        expect(underlined(v)).toEqual(['[[foo]]', '[[bar]]'])
        d.dispose()
        await until(() => underlined(v).length === 0)
        expect(underlined(v)).toEqual([])
    })
    it('linkAt 命中 provider 的链接(两端含),带 url / tooltip', async () => {
        const v = mount(DOC)
        disposables.push(registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 5, 1, 12), url: 'wiki:foo', tooltip: 'Open note' }] }) }))
        await until(() => !!linkAt(v.state, 6))
        expect(linkAt(v.state, 6)).toMatchObject({ from: 4, to: 11, url: 'wiki:foo', tooltip: 'Open note' })
        expect(linkAt(v.state, 11)).not.toBeNull()
        expect(linkAt(v.state, 12)).toBeNull()
        expect(linkAt(v.state, 3)).toBeNull()
    })
    it('hover:默认 Follow link;有 tooltip 用 tooltip;没有 url 只出文字', async () => {
        const v = mount('aa bb cc')
        disposables.push(registerLinkProvider('plaintext', {
            provideLinks: () => ({ links: [{ range: rng(1, 1, 1, 3), url: 'wiki:a' }, { range: rng(1, 4, 1, 6), url: 'wiki:b', tooltip: 'Jump' }, { range: rng(1, 7, 1, 9) }] }),
            resolveLink: l => ({ ...l, url: 'wiki:c' }),
        }))
        await until(() => !!linkAt(v.state, 1))
        const card = (pos: number) => {
            const h = linkHoverSource(v.state, pos, 1, v) as { create(view?: unknown): HTMLElement } | null
            return h?.create(v)
        }
        expect(card(1)!.querySelector('a')!.textContent).toBe('Follow link')
        expect(card(5)!.querySelector('a')!.textContent).toBe('Jump')
        expect(card(8)!.querySelector('a')).toBeNull()
        expect(card(8)!.textContent).toMatch(/^Follow link \((ctrl|cmd|alt|option) \+ click\)$/)
    })
    it('url 缺失:openLink 时才 resolveLink', async () => {
        const v = mount('aa bb')
        const urls = opened()
        let resolved = 0
        disposables.push(registerLinkProvider('plaintext', {
            provideLinks: () => ({ links: [{ range: rng(1, 1, 1, 3) }] }),
            resolveLink: l => { resolved++; return { ...l, url: 'https://example.test/resolved' } },
        }))
        await until(() => !!linkAt(v.state, 1))
        expect(resolved).toBe(0)
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.openLink')
        await until(() => urls.length > 0)
        expect(urls).toEqual(['https://example.test/resolved'])
        expect(resolved).toBe(1)
    })
    it('openLink 走 opener 链:url 对象 / 字符串都行', async () => {
        const v = mount('aa')
        const urls = opened()
        disposables.push(registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 1, 1, 3), url: 'https://example.test/x?y=1' }] }) }))
        await until(() => !!linkAt(v.state, 1))
        v.setPosition({ lineNumber: 1, column: 1 })
        v.trigger('keyboard', 'editor.action.openLink')
        await until(() => urls.length > 0)
        expect(urls).toEqual(['https://example.test/x?y=1'])
    })
    it('没有 url 又没有 resolveLink:警告 target is missing,不打开', async () => {
        const v = mount('aa')
        const urls = opened()
        const warns: string[] = []
        const orig = console.warn
        console.warn = (m: string) => { warns.push(m) }
        disposables.push(registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 1, 1, 3) }] }) }))
        await until(() => !!linkAt(v.state, 1))
        v.setPosition({ lineNumber: 1, column: 1 })
        v.trigger('keyboard', 'editor.action.openLink')
        await wait(60)
        console.warn = orig
        expect(urls).toEqual([])
        expect(warns).toEqual(['Failed to open this link because its target is missing.'])
    })
    it('多个 provider:并起来;相交时后注册的留下;抛错的跳过', async () => {
        const v = mount('abcdef ghi')
        const orig = console.error
        console.error = () => {}
        disposables.push(
            registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 1, 1, 4), url: 'x:old' }, { range: rng(1, 8, 1, 11), url: 'x:ghi' }] }) }),
            registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 3, 1, 7), url: 'x:new' }] }) }),
            registerLinkProvider('plaintext', { provideLinks: () => { throw new Error('boom') } }),
        )
        await until(() => !!linkAt(v.state, 4))
        console.error = orig
        expect(linkAt(v.state, 4)!.url).toBe('x:new')
        expect(linkAt(v.state, 1)).toBeNull()
        expect(linkAt(v.state, 9)!.url).toBe('x:ghi')
    })
    it('provider 的链接盖住文本识别的 http 链接时,以 provider 为准', async () => {
        const v = mount('go https://a.test/p now')
        disposables.push(registerLinkProvider('plaintext', { provideLinks: () => ({ links: [{ range: rng(1, 4, 1, 20), url: 'custom:target' }] }) }))
        await until(() => linkAt(v.state, 6)?.url === 'custom:target')
        expect(linkAt(v.state, 6)!.url).toBe('custom:target')
    })
    it('改文档:链接随编辑移动,1s 防抖后重算', async () => {
        const v = mount('aa bb')
        let calls = 0
        disposables.push(registerLinkProvider('plaintext', {
            provideLinks: m => { calls++; const i = m.getValue().indexOf('bb'); return { links: [{ range: rng(1, i + 1, 1, i + 3), url: 'x:bb' }] } },
        }))
        await until(() => !!linkAt(v.state, 4))
        expect(calls).toBe(1)
        v.executeEdits('t', [{ range: rng(1, 1, 1, 1), text: 'zz ' }])
        expect(linkAt(v.state, 7)!.url).toBe('x:bb') // 立即跟着移动
        expect(calls).toBe(1)
        await until(() => calls === 2, 2500)
        expect(calls).toBe(2)
    })
    it('links 选项关:不画、不命中;打开后立即生效', async () => {
        const v = mount(DOC, { options: { links: false } })
        disposables.push(wiki())
        await wait(80)
        expect(underlined(v)).toEqual([])
        expect(linkAt(v.state, 6)).toBeNull()
        v.updateOptions({ links: true })
        await until(() => underlined(v).length > 0)
        expect(underlined(v)).toEqual(['[[foo]]', '[[bar]]'])
    })
})
