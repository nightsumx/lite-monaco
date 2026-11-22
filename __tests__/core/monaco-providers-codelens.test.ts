// languages.registerCodeLensProvider → 行上方的 CodeLens(view zone),懒 resolve,点击执行命令。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerCodeLensProvider } from '../../src/lang/providerfeatures'
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
const until = async (fn: () => boolean, ms = 2000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }
const rng = (l: number, c1 = 1, c2 = 2) => ({ startLineNumber: l, startColumn: c1, endLineNumber: l, endColumn: c2 })
const lenses = (v: V) => [...v.dom.querySelectorAll('.codelens-decoration')].map(e => e.textContent)
const DOC = 'fn a\nfn b\nplain'

describe('registerCodeLensProvider', () => {
    it('每行一个 view zone;同一行的 lens 合在一起用 " | " 隔开;没 command id 的是 span', async () => {
        const v = mount(DOC)
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: () => ({
                lenses: [
                    { range: rng(2), command: { id: 'x.run', title: 'Run' } },
                    { range: rng(1), command: { id: '', title: '2 refs' } },
                    { range: rng(2, 3), command: { id: 'x.debug', title: '$(bug) Debug', tooltip: 'dbg' } },
                ],
            }),
        }))
        await until(() => lenses(v).length === 2)
        expect(lenses(v)).toEqual(['2 refs', 'Run\u00a0|\u00a0Debug'])
        const second = v.dom.querySelectorAll('.codelens-decoration')[1]
        expect([...second.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Run', 'Debug'])
        expect(second.querySelectorAll('a')[1].title).toBe('dbg')
        expect(v.dom.querySelectorAll('.codelens-decoration')[0].querySelector('span')).not.toBeNull()
    })
    it('zone 占行上方的高度:codeLensFontSize 缺省 = fontSize*0.9', async () => {
        const v = mount(DOC, { options: { fontSize: 20, lineHeight: 30 } })
        disposables.push(registerCodeLensProvider('plaintext', { provideCodeLenses: () => ({ lenses: [{ range: rng(1), command: { id: 'a', title: 'A' } }] }) }))
        await until(() => lenses(v).length === 1)
        const node = v.dom.querySelector('.codelens-decoration') as HTMLElement
        expect(node.style.fontSize).toBe('18px')
        expect(node.style.lineHeight).toBe(`${(18 * Math.max(1.3, 30 / 20)) | 0}px`)
    })
    it('没 command 的 lens:resolveCodeLens 之后才有标题;有 command 的不 resolve', async () => {
        const v = mount(DOC)
        const resolved: number[] = []
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: () => ({ lenses: [{ range: rng(1) }, { range: rng(2), command: { id: 'k', title: 'ready' } }] }),
            resolveCodeLens: (_m, l) => { resolved.push(l.range.startLineNumber); return { ...l, command: { id: 'r', title: 'resolved' } } },
        }))
        await until(() => lenses(v).join() === 'resolved,ready')
        expect(lenses(v)).toEqual(['resolved', 'ready'])
        expect(resolved).toEqual([1])
    })
    it('resolve 回空:显示 no commands;回了没 command 的 lens:什么都不显示', async () => {
        const v = mount(DOC)
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: () => ({ lenses: [{ range: rng(1) }] }),
            resolveCodeLens: () => undefined,
        }))
        await until(() => lenses(v).join() === 'no commands')
        expect(lenses(v)).toEqual(['no commands'])
        disposables.pop()!.dispose()
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: () => ({ lenses: [{ range: rng(1) }] }),
            resolveCodeLens: (_m, l) => l,
        }))
        await until(() => lenses(v).join() === '')
        await wait(400)
        expect(lenses(v)).toEqual([''])
    })
    it('点击链接:执行命令(带 arguments)', async () => {
        const v = mount(DOC)
        const got: unknown[][] = []
        const id = v.addCommand(0, (_acc, ...args) => { got.push(args) })!
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: () => ({ lenses: [{ range: rng(1), command: { id, title: 'Go', arguments: [1, 'two'] } }] }),
        }))
        await until(() => lenses(v).length === 1)
        ;(v.dom.querySelector('.codelens-decoration a') as HTMLElement).click()
        await until(() => got.length > 0)
        expect(got).toEqual([[1, 'two']])
    })
    it('provider 的 onDidChange 触发重新提供;注销后 zone 消失', async () => {
        const v = mount(DOC)
        let n = 0
        const fire: { cb?: () => void } = {}
        const d = registerCodeLensProvider('plaintext', {
            onDidChange: (cb: (e: unknown) => unknown) => { fire.cb = () => cb(undefined); return { dispose() {} } },
            provideCodeLenses: () => ({ lenses: [{ range: rng(1), command: { id: 'a', title: `v${++n}` } }] }),
        } as never)
        await until(() => lenses(v).join() === 'v1')
        fire.cb!()
        await until(() => lenses(v).join() === 'v2')
        expect(lenses(v)).toEqual(['v2'])
        d.dispose()
        await until(() => lenses(v).length === 0)
        expect(lenses(v)).toEqual([])
    })
    it('改文档:250ms 防抖后重新问;lens 随行移动', async () => {
        const v = mount(DOC)
        let calls = 0
        disposables.push(registerCodeLensProvider('plaintext', {
            provideCodeLenses: m => { calls++; const l = m.getValue().split('\n').findIndex(x => x === 'plain') + 1; return { lenses: [{ range: rng(l), command: { id: 'a', title: `L${l}` } }] } },
        }))
        await until(() => lenses(v).join() === 'L3')
        v.executeEdits('t', [{ range: rng(1, 1, 1), text: 'new line\n' }])
        expect(calls).toBe(1)
        await until(() => lenses(v).join() === 'L4')
        expect(lenses(v)).toEqual(['L4'])
        expect(calls).toBe(2)
    })
    it('codeLens 选项关:不画;打开后出现', async () => {
        const v = mount(DOC, { options: { codeLens: false } })
        disposables.push(registerCodeLensProvider('plaintext', { provideCodeLenses: () => ({ lenses: [{ range: rng(1), command: { id: 'a', title: 'A' } }] }) }))
        await wait(400)
        expect(lenses(v)).toEqual([])
        v.updateOptions({ codeLens: true })
        await until(() => lenses(v).length === 1)
        expect(lenses(v)).toEqual(['A'])
    })
    it('provider 抛错 / 没 range 的 lens:跳过,别的照常;lens list 被 dispose', async () => {
        const v = mount(DOC)
        const orig = console.error
        console.error = () => {}
        let disposedLists = 0
        disposables.push(
            registerCodeLensProvider('plaintext', { provideCodeLenses: () => { throw new Error('x') } }),
            registerCodeLensProvider('plaintext', { provideCodeLenses: () => ({ lenses: [{ command: { id: 'a', title: 'bad' } } as never, { range: rng(1), command: { id: 'a', title: 'ok' } }], dispose: () => { disposedLists++ } }) }),
        )
        await until(() => lenses(v).length === 1)
        console.error = orig
        expect(lenses(v)).toEqual(['ok'])
        v.destroy()
        views.pop()
        expect(disposedLists).toBeGreaterThan(0)
    })
})
