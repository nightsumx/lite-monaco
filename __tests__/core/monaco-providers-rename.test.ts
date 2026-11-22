// languages.registerRenameProvider → F2 / editor.action.rename:RenameSkeleton 语义 + standalone 批量编辑。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerRenameProvider, registerNewSymbolNameProvider } from '../../src/lang/providerfeatures'
import { createModel } from '../../src/api/model'
import { Uri } from '../../src/api/uri'
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
function mount(doc: string, readOnly = false): V {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const v = liteMonaco({ parent: host, doc, lang: 'plaintext', highlighter: fakeHl(), features: QUIET as never, readOnly })
    views.push(v)
    return v
}
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 2000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }
const box = (v: V) => v.dom.querySelector<HTMLInputElement>('.cm-rename-input')
const message = (v: V) => v.dom.querySelector('.cm-editor-message')?.textContent ?? null
const commit = (v: V, name: string) => { const i = box(v)!; i.value = name; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
const edit = (uri: Uri, l: number, c1: number, c2: number, text: string, versionId?: number) =>
    ({ resource: uri, versionId, textEdit: { range: { startLineNumber: l, startColumn: c1, endLineNumber: l, endColumn: c2 }, text } })
const DOC = 'foo bar foo\nfoo'

describe('registerRenameProvider → F2', () => {
    it('光标在词上:弹出输入框,初值=光标下的词;确认后按 provider 给的编辑改文档', async () => {
        const v = mount(DOC)
        let asked: unknown
        disposables.push(registerRenameProvider('plaintext', {
            provideRenameEdits: (m, pos, newName) => {
                asked = [pos.lineNumber, pos.column, newName]
                return { edits: [edit(m.uri, 1, 1, 4, newName), edit(m.uri, 1, 9, 12, newName), edit(m.uri, 2, 1, 4, newName)] }
            },
        }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        expect(box(v)!.value).toBe('foo')
        commit(v, 'qux')
        await until(() => v.getValue() !== DOC)
        expect(v.getValue()).toBe('qux bar qux\nqux')
        expect(asked).toEqual([1, 2, 'qux'])
    })
    it('resolveRenameLocation 给的范围 / 文本决定输入框初值', async () => {
        const v = mount(DOC)
        disposables.push(registerRenameProvider('plaintext', {
            resolveRenameLocation: () => ({ range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 8 }, text: 'bar' }),
            provideRenameEdits: () => ({ edits: [] }),
        }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        expect(box(v)!.value).toBe('bar')
    })
    it('resolveRenameLocation 拒绝:不开框,显示 rejectReason', async () => {
        const v = mount(DOC)
        disposables.push(registerRenameProvider('plaintext', {
            resolveRenameLocation: () => ({ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 }, text: 'foo', rejectReason: 'You cannot rename this element.' }),
            provideRenameEdits: () => ({ edits: [] }),
        }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => message(v) !== null)
        expect(message(v)).toBe('You cannot rename this element.')
        expect(box(v)).toBeNull()
    })
    it('provideRenameEdits 链:没结果 / 拒绝就问下一个 provider(后注册的先问)', async () => {
        const v = mount(DOC)
        const order: string[] = []
        disposables.push(
            registerRenameProvider('plaintext', { provideRenameEdits: (m, _p, n) => { order.push('first'); return { edits: [edit(m.uri, 1, 1, 4, n)] } } }),
            registerRenameProvider('plaintext', { provideRenameEdits: () => { order.push('second'); return { edits: [], rejectReason: 'nope' } } }),
            registerRenameProvider('plaintext', { provideRenameEdits: () => { order.push('third'); return undefined } }),
        )
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'zzz')
        await until(() => v.getValue().startsWith('zzz'))
        expect(order).toEqual(['third', 'second', 'first'])
    })
    it('versionId 对不上:放弃,文档不变', async () => {
        const v = mount(DOC)
        const orig = console.error
        console.error = () => {}
        disposables.push(registerRenameProvider('plaintext', { provideRenameEdits: (m, _p, n) => ({ edits: [edit(m.uri, 1, 1, 4, n, m.getVersionId() + 7)] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'zzz')
        await wait(80)
        console.error = orig
        expect(v.getValue()).toBe(DOC)
    })
    it('文件编辑不被 standalone 支持:放弃,文档不变', async () => {
        const v = mount(DOC)
        const orig = console.error
        console.error = () => {}
        disposables.push(registerRenameProvider('plaintext', { provideRenameEdits: (m) => ({ edits: [{ oldResource: m.uri, newResource: Uri.parse('file:///x') }] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'zzz')
        await wait(80)
        console.error = orig
        expect(v.getValue()).toBe(DOC)
    })
    it('一次撤销撤回整次重命名', async () => {
        const v = mount(DOC)
        disposables.push(registerRenameProvider('plaintext', { provideRenameEdits: (m, _p, n) => ({ edits: [edit(m.uri, 1, 1, 4, n), edit(m.uri, 2, 1, 4, n)] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'qux')
        await until(() => v.getValue() !== DOC)
        v.trigger('keyboard', 'undo')
        expect(v.getValue()).toBe(DOC)
    })
    it('编辑可以落到别的 model(按 uri 找)', async () => {
        const v = mount(DOC)
        const other = createModel('foo!', 'plaintext', Uri.parse('file:///rename-other.txt'))
        disposables.push(other, registerRenameProvider('plaintext', { provideRenameEdits: (m, _p, n) => ({ edits: [edit(m.uri, 1, 1, 4, n), edit(other.uri, 1, 1, 4, n)] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'qux')
        await until(() => other.getValue() !== 'foo!')
        expect(other.getValue()).toBe('qux!')
        expect(v.getValue().startsWith('qux')).toBe(true)
    })
    it('F2 键位:有 provider 才吃键;只读不弹', async () => {
        const v = mount(DOC)
        const f2 = () => { const e = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }); v.contentDOM.dispatchEvent(e); return e.defaultPrevented }
        expect(f2()).toBe(false)
        disposables.push(registerRenameProvider('plaintext', { provideRenameEdits: () => ({ edits: [] }) }))
        v.setPosition({ lineNumber: 1, column: 2 })
        expect(f2()).toBe(true)
        await until(() => !!box(v))
        expect(box(v)).not.toBeNull()
        const ro = mount(DOC, true)
        ro.setPosition({ lineNumber: 1, column: 2 })
        ro.trigger('keyboard', 'editor.action.rename')
        await wait(40)
        expect(box(ro)).toBeNull()
    })
    it('没有 provider:editor.action.rename 不可用;注册 / 注销随时生效', () => {
        const v = mount(DOC)
        expect(v.getAction('editor.action.rename')?.isSupported() ?? false).toBe(false)
        const d = registerRenameProvider('plaintext', { provideRenameEdits: () => ({ edits: [] }) })
        expect(v.getAction('editor.action.rename')!.isSupported()).toBe(true)
        d.dispose()
        expect(v.getAction('editor.action.rename')?.isSupported() ?? false).toBe(false)
    })
    it('registerNewSymbolNameProvider:合法注册,不影响重命名流程', async () => {
        const v = mount(DOC)
        disposables.push(
            registerNewSymbolNameProvider('plaintext', { provideNewSymbolNames: () => [{ newSymbolName: 'suggested' }] }),
            registerRenameProvider('plaintext', { provideRenameEdits: (m, _p, n) => ({ edits: [edit(m.uri, 1, 1, 4, n)] }) }),
        )
        v.setPosition({ lineNumber: 1, column: 2 })
        v.trigger('keyboard', 'editor.action.rename')
        await until(() => !!box(v))
        commit(v, 'qux')
        await until(() => v.getValue().startsWith('qux'))
        expect(v.getValue().startsWith('qux')).toBe(true)
    })
})
