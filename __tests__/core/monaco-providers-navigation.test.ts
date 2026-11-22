// languages.registerImplementation/TypeDefinition/Declaration/ReferenceProvider → 真实编辑器的跳转 / Peek / 提示 / 备选命令。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { peekOpen, closePeek } from '../../src/lang/tspeek'
import {
    registerImplementationProvider, registerTypeDefinitionProvider, registerDeclarationProvider, registerReferenceProvider,
} from '../../src/lang/providerfeatures'
import { registerEditorOpener } from '../../src/api/openers'
import { Uri } from '../../src/api/uri'
import { getContextKeyService } from '../../src/api/contextkeys'
import type { ScopedShiki as ShikiLike } from '../../src/core/view/tokens'

const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, tsDiagnostics: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const
const hosts: HTMLElement[] = []
type V = ReturnType<typeof liteMonaco>
const views: V[] = []
const disposables: { dispose(): void }[] = []
afterEach(() => {
    while (disposables.length) disposables.pop()!.dispose()
    while (views.length) { const v = views.pop()!; closePeek(v); v.destroy() }
    while (hosts.length) hosts.pop()!.remove()
})
function mount(doc: string, options: Record<string, unknown> = {}): V {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const v = liteMonaco({ parent: host, doc, lang: 'plaintext', highlighter: fakeHl(), features: QUIET as never, options: options as never })
    views.push(v)
    return v
}
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 2000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }
const message = (v: V) => v.dom.querySelector('.cm-editor-message')?.textContent ?? null
const peekTitle = (v: V) => v.dom.querySelector('.cm-peek-title')?.textContent ?? ''
const here = (uri: Uri, l: number, c1: number, c2: number) => ({ uri, range: { startLineNumber: l, startColumn: c1, endLineNumber: l, endColumn: c2 } })
const DOC = 'foo bar\nbaz foo\nqux'

const CASES = [
    { name: 'Implementation', register: registerImplementationProvider, method: 'provideImplementation', go: 'editor.action.goToImplementation', peek: 'editor.action.peekImplementation', noun: 'implementation', title: 'Implementations', ctx: 'editorHasImplementationProvider' },
    { name: 'TypeDefinition', register: registerTypeDefinitionProvider, method: 'provideTypeDefinition', go: 'editor.action.goToTypeDefinition', peek: 'editor.action.peekTypeDefinition', noun: 'type definition', title: 'Type Definitions', ctx: 'editorHasTypeDefinitionProvider' },
    { name: 'Declaration', register: registerDeclarationProvider, method: 'provideDeclaration', go: 'editor.action.revealDeclaration', peek: 'editor.action.peekDeclaration', noun: 'declaration', title: 'Declarations', ctx: 'editorHasDeclarationProvider' },
] as const

for (const c of CASES) {
    describe(`register${c.name}Provider → ${c.go}`, () => {
        const reg = (_v: V, fn: (m: never, p: never) => unknown) =>
            disposables.push((c.register as (s: string, p: unknown) => { dispose(): void })('plaintext', { [c.method]: fn }))

        it('唯一结果在本文件:跳到它(optionally targetSelectionRange 优先于 range)', async () => {
            const v = mount(DOC)
            reg(v, (m: { uri: Uri }) => ({ uri: m.uri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 }, targetSelectionRange: { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 3 } }))
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await until(() => v.getPosition()!.lineNumber === 3)
            expect(v.getPosition()).toMatchObject({ lineNumber: 3, column: 2 })
            expect(peekOpen(v)).toBe(false)
        })
        it('provider 收到 model 与 1 起的 position', async () => {
            const v = mount(DOC)
            let seen: unknown
            reg(v, (m: { getLanguageId(): string }, p: { lineNumber: number, column: number }) => { seen = [m.getLanguageId(), p.lineNumber, p.column]; return undefined })
            v.setPosition({ lineNumber: 2, column: 6 })
            v.trigger('keyboard', c.go)
            await until(() => seen !== undefined)
            expect(seen).toEqual(['plaintext', 2, 6])
        })
        it('没有结果:提示 "No <noun> found for \'word\'"', async () => {
            const v = mount(DOC)
            reg(v, () => undefined)
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await until(() => message(v) !== null)
            expect(message(v)).toBe(`No ${c.noun} found for 'foo'`)
        })
        it('多个结果(默认 peek):开 Peek,标题按种类,不跳', async () => {
            const v = mount(DOC)
            reg(v, (m: { uri: Uri }) => [here(m.uri, 2, 1, 4), here(m.uri, 3, 1, 4)])
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await until(() => peekOpen(v))
            expect(peekOpen(v)).toBe(true)
            expect(peekTitle(v)).toContain(c.title)
            expect(v.getPosition()).toMatchObject({ lineNumber: 1, column: 2 })
        })
        it('Peek 命令:一个结果也开 Peek', async () => {
            const v = mount(DOC)
            reg(v, (m: { uri: Uri }) => here(m.uri, 3, 1, 4))
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.peek)
            await until(() => peekOpen(v))
            expect(peekOpen(v)).toBe(true)
            expect(v.getPosition()).toMatchObject({ lineNumber: 1, column: 2 })
        })
        it('gotoLocation.multiple*=goto:跳到(排序后)第一处,不开 Peek', async () => {
            const key = { Implementation: 'multipleImplementations', TypeDefinition: 'multipleTypeDefinitions', Declaration: 'multipleDeclarations' }[c.name]
            const v = mount(DOC, { gotoLocation: { [key]: 'goto' } })
            reg(v, (m: { uri: Uri }) => [here(m.uri, 3, 1, 4), here(m.uri, 2, 1, 4)])
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await until(() => v.getPosition()!.lineNumber !== 1)
            expect(v.getPosition()).toMatchObject({ lineNumber: 2, column: 1 })
            expect(peekOpen(v)).toBe(false)
        })
        it('结果在别的文件:问 registerEditorOpener,带目标 uri 与范围', async () => {
            const v = mount(DOC)
            const target = Uri.parse('file:///other.txt')
            reg(v, () => here(target, 5, 2, 6))
            const got: { uri?: string, range?: unknown } = {}
            disposables.push(registerEditorOpener({ openCodeEditor: (_s, uri, range) => { got.uri = uri.toString(); got.range = range; return true } }))
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await until(() => got.uri !== undefined)
            expect(got.uri).toBe(target.toString())
            expect(got.range).toMatchObject({ startLineNumber: 5, startColumn: 2, endLineNumber: 5, endColumn: 6 })
        })
        it('provider 抛错当没结果,不影响别的 provider', async () => {
            const v = mount(DOC)
            reg(v, () => { throw new Error('boom') })
            disposables.push((c.register as (s: string, p: unknown) => { dispose(): void })('plaintext', { [c.method]: (m: { uri: Uri }) => here(m.uri, 3, 1, 4) }))
            v.setPosition({ lineNumber: 1, column: 2 })
            const orig = console.error
            console.error = () => {}
            try { v.trigger('keyboard', c.go); await until(() => v.getPosition()!.lineNumber === 3) } finally { console.error = orig }
            expect(v.getPosition()!.lineNumber).toBe(3)
        })
        it('context key / getAction 的 precondition 跟 provider 有无同步;dispose 后动作不可用', async () => {
            const v = mount(DOC)
            const d = (c.register as (s: string, p: unknown) => { dispose(): void })('plaintext', { [c.method]: () => undefined })
            expect(getContextKeyService(v).getContextKeyValue(c.ctx)).toBe(true)
            expect(v.getAction(c.go)!.isSupported()).toBe(true)
            d.dispose()
            expect(getContextKeyService(v).getContextKeyValue(c.ctx)).toBe(false)
            expect(v.getAction(c.go)?.isSupported() ?? false).toBe(false)
            v.setPosition({ lineNumber: 1, column: 2 })
            v.trigger('keyboard', c.go)
            await wait(40)
            expect(message(v)).toBeNull()
        })
    })
}

describe('registerReferenceProvider', () => {
    const reg = (fn: (m: never, p: never, ctx: { includeDeclaration: boolean }) => unknown) =>
        disposables.push(registerReferenceProvider('plaintext', { provideReferences: fn } as never))

    it('Go to References:多个结果开 Peek,标题 References;去重 + 按位置排序', async () => {
        const v = mount(DOC)
        reg((m: { uri: Uri }) => [here(m.uri, 2, 5, 8), here(m.uri, 1, 1, 4), here(m.uri, 1, 1, 4)])
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.goToReferences')
        await until(() => peekOpen(v))
        expect(peekTitle(v)).toContain('References')
        expect(v.dom.querySelectorAll('.cm-peek-ref').length).toBe(2)
    })
    it('Go to References 的 compact:恰好两条且去掉声明后剩一条 → 用那一条(直接跳)', async () => {
        const v = mount(DOC)
        const calls: boolean[] = []
        reg((m: { uri: Uri }, _p: never, ctx) => {
            calls.push(ctx.includeDeclaration)
            return ctx.includeDeclaration ? [here(m.uri, 1, 1, 4), here(m.uri, 2, 5, 8)] : [here(m.uri, 2, 5, 8)]
        })
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.goToReferences')
        await until(() => v.getPosition()!.lineNumber === 2)
        expect(calls).toEqual([true, false])
        expect(v.getPosition()).toMatchObject({ lineNumber: 2, column: 5 })
        expect(peekOpen(v)).toBe(false)
    })
    it('Peek References 不 compact:只问 includeDeclaration=true 一次', async () => {
        const v = mount(DOC)
        const calls: boolean[] = []
        reg((m: { uri: Uri }, _p: never, ctx) => { calls.push(ctx.includeDeclaration); return [here(m.uri, 1, 1, 4), here(m.uri, 2, 5, 8)] })
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.referenceSearch.trigger')
        await until(() => peekOpen(v))
        expect(calls).toEqual([true])
        expect(peekOpen(v)).toBe(true)
    })
    it('没有引用:提示 "No references found for \'foo\'"', async () => {
        const v = mount(DOC)
        reg(() => [])
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.goToReferences')
        await until(() => message(v) !== null)
        expect(message(v)).toBe("No references found for 'foo'")
    })
    it('站在唯一结果上再按 Shift+F12:跑备选命令(alternativeReferenceCommand),默认空串则无', async () => {
        const v = mount(DOC, { gotoLocation: { alternativeReferenceCommand: 'editor.action.peekImplementation' } })
        reg((m: { uri: Uri }) => [here(m.uri, 1, 1, 4)])
        const impl = registerImplementationProvider('plaintext', { provideImplementation: (m: { uri: Uri }) => ({ uri: m.uri, range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 } }) } as never)
        disposables.push(impl)
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.goToReferences')
        await until(() => peekOpen(v))
        expect(peekOpen(v)).toBe(true)
    })
    it('备选命令设空串:站在唯一结果上不跑备选,原地不动', async () => {
        const v = mount(DOC, { gotoLocation: { alternativeReferenceCommand: '' } })
        reg((m: { uri: Uri }) => [here(m.uri, 1, 1, 4)])
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.goToReferences')
        await wait(60)
        expect(peekOpen(v)).toBe(false)
        expect(v.getPosition()).toMatchObject({ lineNumber: 1, column: 1 })
    })
    it('Shift+F12 / Ctrl+F12 键位:有 provider 才吃键', async () => {
        const v = mount(DOC)
        const key = (init: KeyboardEventInit) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); v.contentDOM.dispatchEvent(e); return e.defaultPrevented }
        expect(key({ key: 'F12', shiftKey: true })).toBe(false)
        reg((m: { uri: Uri }) => [here(m.uri, 2, 1, 4), here(m.uri, 3, 1, 4)])
        v.setPosition({ lineNumber: 1, column: 2 })
        expect(key({ key: 'F12', shiftKey: true })).toBe(true)
        await until(() => peekOpen(v))
        expect(peekOpen(v)).toBe(true)
    })
})
