// languages.registerDocumentFormattingEditProvider / RangeFormatting / OnTypeFormatting → 格式化动作与 formatOnType / formatOnPaste。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import { registerDocumentFormattingEditProvider, registerDocumentRangeFormattingEditProvider, registerOnTypeFormattingEditProvider } from '../../src/lang/providerfeatures'
import { getContextKeyService } from '../../src/api/contextkeys'
import { keyOS } from '../../src/core/keyos'
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
const upper = (m: { getValueInRange(r: never): string }, r: ReturnType<typeof rng>) => ({ range: r, text: m.getValueInRange(r as never).toUpperCase() })

describe('registerDocumentFormattingEditProvider → editor.action.formatDocument', () => {
    it('整文档编辑落到文档;options 带 tabSize / insertSpaces', async () => {
        const v = mount('a\nb')
        let opts: unknown
        disposables.push(registerDocumentFormattingEditProvider('plaintext', {
            provideDocumentFormattingEdits: (_m, o) => { opts = o; return [{ range: rng(1, 1, 2, 2), text: 'A\nB' }] },
        }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await until(() => v.getValue() === 'A\nB')
        expect(v.getValue()).toBe('A\nB')
        expect(opts).toEqual({ tabSize: v.getModel()!.getOptions().tabSize, insertSpaces: v.getModel()!.getOptions().insertSpaces })
    })
    it('一次撤销撤回整次格式化;edits 来源是 formatEditsCommand', async () => {
        const v = mount('a\nb')
        const sources: string[] = []
        v.onDidChangeModelContent(() => { sources.push('c') })
        disposables.push(registerDocumentFormattingEditProvider('plaintext', {
            provideDocumentFormattingEdits: (m) => [upper(m, rng(1, 1, 1, 2)), upper(m, rng(2, 1, 2, 2))],
        }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await until(() => v.getValue() === 'A\nB')
        v.trigger('keyboard', 'undo')
        expect(v.getValue()).toBe('a\nb')
        expect(sources.length).toBeGreaterThan(0)
    })
    it('只剪首尾相同:光标不被整文档替换冲走', async () => {
        const v = mount('foo bar baz')
        v.setPosition({ lineNumber: 1, column: 12 })
        disposables.push(registerDocumentFormattingEditProvider('plaintext', {
            provideDocumentFormattingEdits: () => [{ range: rng(1, 1, 1, 12), text: 'foo  bar baz' }],
        }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await until(() => v.getValue() === 'foo  bar baz')
        expect(v.getPosition()!.column).toBe(13)
    })
    it('返回空 / undefined:文档不变', async () => {
        const v = mount('a')
        disposables.push(registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => undefined }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await wait(40)
        expect(v.getValue()).toBe('a')
    })
    it('格式化期间文档变了:放弃', async () => {
        const v = mount('a')
        disposables.push(registerDocumentFormattingEditProvider('plaintext', {
            provideDocumentFormattingEdits: async () => { await wait(40); return [{ range: rng(1, 1, 1, 2), text: 'Z' }] },
        }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        v.executeEdits('t', [{ range: rng(1, 2, 1, 2), text: 'x' }])
        await wait(100)
        expect(v.getValue()).toBe('ax')
    })
    it('provider 抛错:不改文档', async () => {
        const v = mount('a')
        const orig = console.error
        console.error = () => {}
        disposables.push(registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => { throw new Error('x') } }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await wait(40)
        console.error = orig
        expect(v.getValue()).toBe('a')
    })
    it('只读不格式化', async () => {
        const v = mount('a', { readOnly: true })
        let called = 0
        disposables.push(registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => { called++; return [] } }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await wait(40)
        expect(called).toBe(0)
    })
    it('后注册的 provider 排前面(formatter[0])', async () => {
        const v = mount('a')
        disposables.push(
            registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => [{ range: rng(1, 1, 1, 2), text: 'old' }] }),
            registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => [{ range: rng(1, 1, 1, 2), text: 'new' }] }),
        )
        v.trigger('keyboard', 'editor.action.formatDocument')
        await until(() => v.getValue() !== 'a')
        expect(v.getValue()).toBe('new')
    })
    it('只有范围 provider:当作整文档 provider,范围 = 全文', async () => {
        const v = mount('a\nbb')
        let got: unknown
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            provideDocumentRangeFormattingEdits: (m, r) => { got = [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]; return [upper(m, rng(1, 1, 2, 3))] },
        }))
        v.trigger('keyboard', 'editor.action.formatDocument')
        await until(() => v.getValue() !== 'a\nbb')
        expect(got).toEqual([1, 1, 2, 3])
        expect(v.getValue()).toBe('A\nBB')
    })
    it('precondition 与键位:没 provider 不可用也不吃键;有了就吃 Shift+Alt+F', async () => {
        const v = mount('a')
        expect(v.getAction('editor.action.formatDocument')?.isSupported() ?? false).toBe(false)
        expect(getContextKeyService(v).getContextKeyValue('editorHasDocumentFormattingProvider')).toBe(false)
        const d = registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: (m) => [upper(m, rng(1, 1, 1, 2))] })
        expect(v.getAction('editor.action.formatDocument')!.isSupported()).toBe(true)
        expect(getContextKeyService(v).getContextKeyValue('editorHasDocumentFormattingProvider')).toBe(true)
        // 键位:Linux Ctrl+Shift+I,其余 Shift+Alt+F
        const linux = keyOS === 'linux'
        const ev = new KeyboardEvent('keydown', linux
            ? { key: 'I', code: 'KeyI', keyCode: 73, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }
            : { key: 'F', code: 'KeyF', keyCode: 70, shiftKey: true, altKey: true, bubbles: true, cancelable: true })
        v.contentDOM.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
        await until(() => v.getValue() === 'A')
        v.trigger('keyboard', 'undo')
        expect(v.getValue()).toBe('a')
        d.dispose()
        expect(v.getAction('editor.action.formatDocument')?.isSupported() ?? false).toBe(false)
    })
})

describe('registerDocumentRangeFormattingEditProvider → editor.action.formatSelection', () => {
    it('选区 = 给 provider 的范围;空选区 = 整行', async () => {
        const v = mount('aa\nbb\ncc')
        const asked: number[][] = []
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            provideDocumentRangeFormattingEdits: (m, r) => { asked.push([r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]); return [upper(m, r)] },
        }))
        v.setPosition({ lineNumber: 2, column: 2 })
        v.trigger('keyboard', 'editor.action.formatSelection')
        await until(() => v.getValue() === 'aa\nBB\ncc')
        expect(asked).toEqual([[2, 1, 2, 3]])
        v.setSelection(rng(1, 2, 1, 3))
        v.trigger('keyboard', 'editor.action.formatSelection')
        await until(() => v.getValue() === 'aA\nBB\ncc')
        expect(asked[1]).toEqual([1, 2, 1, 3])
    })
    it('相接的多个选区合并成一个范围;不相接各问一次', async () => {
        const v = mount('aa\nbb\ncc')
        const asked: number[][] = []
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            provideDocumentRangeFormattingEdits: (m, r) => { asked.push([r.startLineNumber, r.endLineNumber]); return [upper(m, r)] },
        }))
        v.setSelections([{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 3 }, { selectionStartLineNumber: 1, selectionStartColumn: 3, positionLineNumber: 2, positionColumn: 3 }, { selectionStartLineNumber: 3, selectionStartColumn: 1, positionLineNumber: 3, positionColumn: 2 }])
        v.trigger('keyboard', 'editor.action.formatSelection')
        await until(() => v.getValue() === 'AA\nBB\nCc')
        expect(asked).toEqual([[1, 2], [3, 3]])
    })
    it('provideDocumentRangesFormattingEdits 优先:一次问全部范围', async () => {
        const v = mount('aa\nbb\ncc')
        let n = 0
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            provideDocumentRangeFormattingEdits: () => { throw new Error('should not be called') },
            provideDocumentRangesFormattingEdits: (m, rs) => { n = rs.length; return rs.map(r => upper(m, r)) },
        }))
        v.setSelections([{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 3 }, { selectionStartLineNumber: 3, selectionStartColumn: 1, positionLineNumber: 3, positionColumn: 3 }])
        v.trigger('keyboard', 'editor.action.formatSelection')
        await until(() => v.getValue() === 'AA\nbb\nCC')
        expect(n).toBe(2)
    })
    it('编辑相交的两个范围:合并后重算一次', async () => {
        const v = mount('aa\nbb\ncc')
        const asked: number[][] = []
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            // provider 总是把两行都改(范围只是 hint)→ 两次结果相交
            provideDocumentRangeFormattingEdits: (m, r) => { asked.push([r.startLineNumber, r.endLineNumber]); return [upper(m, rng(1, 1, 3, 3))] },
        }))
        v.setSelections([{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 2 }, { selectionStartLineNumber: 3, selectionStartColumn: 1, positionLineNumber: 3, positionColumn: 2 }])
        v.trigger('keyboard', 'editor.action.formatSelection')
        await until(() => v.getValue() === 'AA\nBB\nCC')
        expect(asked).toEqual([[1, 1], [3, 3], [1, 3]])
    })
    it('没有范围 provider:formatSelection 不可用(即使有文档 provider)', () => {
        const v = mount('a')
        disposables.push(registerDocumentFormattingEditProvider('plaintext', { provideDocumentFormattingEdits: () => [] }))
        expect(v.getAction('editor.action.formatSelection')?.isSupported() ?? false).toBe(false)
        expect(getContextKeyService(v).getContextKeyValue('editorHasDocumentSelectionFormattingProvider')).toBe(false)
    })
})

describe('registerOnTypeFormattingEditProvider → formatOnType', () => {
    const reg = (calls: unknown[][] = []) => registerOnTypeFormattingEditProvider('plaintext', {
        autoFormatTriggerCharacters: [';', '}'],
        provideOnTypeFormattingEdits: (m, pos, ch, _o) => {
            calls.push([pos.lineNumber, pos.column, ch])
            return [{ range: rng(pos.lineNumber, 1, pos.lineNumber, pos.column), text: m.getLineContent(pos.lineNumber).toUpperCase() }]
        },
    })
    it('formatOnType 关(默认):不问 provider', async () => {
        const v = mount('')
        const calls: unknown[][] = []
        disposables.push(reg(calls))
        v.trigger('keyboard', 'type', { text: 'a;' })
        await wait(40)
        expect(calls).toEqual([])
    })
    it('开着:触发字符打下去后,拿到编辑并应用;非触发字符不问', async () => {
        const v = mount('', { formatOnType: true })
        v.updateOptions({ formatOnType: true })
        const calls: unknown[][] = []
        disposables.push(reg(calls))
        v.trigger('keyboard', 'type', { text: 'a' })
        await wait(30)
        expect(calls).toEqual([])
        v.trigger('keyboard', 'type', { text: ';' })
        await until(() => v.getValue() === 'A;')
        expect(v.getValue()).toBe('A;')
        expect(calls).toEqual([[1, 3, ';']])
    })
    it('多光标 / 非空选区不触发', async () => {
        const v = mount('ab\ncd')
        v.updateOptions({ formatOnType: true })
        const calls: unknown[][] = []
        disposables.push(reg(calls))
        v.setSelections([{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 1 }, { selectionStartLineNumber: 2, selectionStartColumn: 1, positionLineNumber: 2, positionColumn: 1 }])
        v.trigger('keyboard', 'type', { text: ';' })
        await wait(40)
        expect(calls).toEqual([])
    })
    it('等待期间在这一行或更前面有编辑:放弃', async () => {
        const v = mount('')
        v.updateOptions({ formatOnType: true })
        disposables.push(registerOnTypeFormattingEditProvider('plaintext', {
            autoFormatTriggerCharacters: [';'],
            provideOnTypeFormattingEdits: async () => { await wait(40); return [{ range: rng(1, 1, 1, 2), text: 'Z' }] },
        }))
        v.trigger('keyboard', 'type', { text: ';' })
        v.executeEdits('t', [{ range: rng(1, 1, 1, 1), text: 'x' }])
        await wait(100)
        expect(v.getValue()).toBe('x;')
    })
})

describe('formatOnPaste(范围 provider)', () => {
    it('关(默认)不格式化;开了粘贴后格式化粘贴区,Silent 模式', async () => {
        const v = mount('')
        const asked: number[][] = []
        disposables.push(registerDocumentRangeFormattingEditProvider('plaintext', {
            provideDocumentRangeFormattingEdits: (m, r) => { asked.push([r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]); return [upper(m, r)] },
        }))
        v.trigger('test', 'paste', { text: 'ab' })
        await wait(40)
        expect(asked).toEqual([])
        expect(v.getValue()).toBe('ab')
        v.updateOptions({ formatOnPaste: true })
        v.setPosition({ lineNumber: 1, column: 3 })
        v.trigger('test', 'paste', { text: 'cd' })
        await until(() => v.getValue() === 'abCD')
        expect(asked).toEqual([[1, 3, 1, 5]])
    })
})
