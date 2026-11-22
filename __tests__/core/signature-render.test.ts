// M1.3 signature help 渲染纯逻辑
import { describe, expect, it } from 'vitest'
import { renderSignatureHelp, signatureHelpFromItems, signatureHelpSession, triggerSignatureHelp, type SignatureHelpModel } from '../../src/lang/tssignature'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { mergeDiagnostics } from '../../src/lang/tsdiagnostics'
import type { Diagnostic } from '../../src/core/chrome/ruler'

describe('renderSignatureHelp', () => {
    it('高亮 activeParameter', () => {
        const model: SignatureHelpModel = {
            signatures: [{
                label: 'fn(a: number, b: string): void',
                parts: [],
                params: [
                    { label: 'a: number', parts: [] },
                    { label: 'b: string', parts: [] },
                ],
            }],
            activeSignature: 0,
            activeParameter: 1,
        }
        const el = renderSignatureHelp(model)
        expect(el.classList.contains('cm-signature-help')).toBe(true)
        const active = el.querySelector('.cm-signature-param-active')
        expect(active?.textContent).toBe('b: string')
        const all = el.querySelectorAll('.cm-signature-param')
        expect(all).toHaveLength(2)
    })

    it('空 signatures 不炸', () => {
        const el = renderSignatureHelp({
            signatures: [],
            activeSignature: 0,
            activeParameter: 0,
        })
        expect(el.textContent).toBe('')
    })

    it('多 overload 显示 meta', () => {
        const model: SignatureHelpModel = {
            signatures: [
                { label: 'a()', parts: [], params: [] },
                { label: 'b()', parts: [], params: [] },
            ],
            activeSignature: 1,
            activeParameter: 0,
        }
        const el = renderSignatureHelp(model)
        expect(el.querySelector('.cm-signature-meta')?.textContent).toBe('2/2')
    })
})

describe('signatureHelpFromItems', () => {
    it('从 TS items 抽 active index', () => {
        const items = {
            items: [{
                prefixDisplayParts: [{ text: 'fn(', kind: 'punctuation' }],
                suffixDisplayParts: [{ text: ')', kind: 'punctuation' }],
                separatorDisplayParts: [{ text: ', ', kind: 'punctuation' }],
                parameters: [
                    { displayParts: [{ text: 'x', kind: 'parameterName' }], documentation: [] },
                ],
                documentation: [],
                tags: [],
                isVariadic: false,
            }],
            applicableSpan: { start: 0, length: 1 },
            selectedItemIndex: 0,
            argumentIndex: 0,
            argumentCount: 1,
        } as unknown as import('typescript').SignatureHelpItems
        const m = signatureHelpFromItems(items)
        expect(m.signatures).toHaveLength(1)
        expect(m.signatures[0].params[0].label).toBe('x')
        expect(m.activeParameter).toBe(0)
    })
})

describe('mergeDiagnostics', () => {
    it('保留非 ts(含无 source),替换 ts', () => {
        const cur: Diagnostic[] = [
            { from: 0, to: 1, severity: 'error', message: 'eslint', source: 'eslint' },
            { from: 2, to: 3, severity: 'error', message: 'old', source: 'ts' },
            { from: 4, to: 5, severity: 'warning', message: 'host' },
        ]
        const next = mergeDiagnostics(cur, [
            { from: 10, to: 12, severity: 'error', message: 'new', source: 'ts' },
        ])
        expect(next).toEqual([
            { from: 0, to: 1, severity: 'error', message: 'eslint', source: 'eslint' },
            { from: 4, to: 5, severity: 'warning', message: 'host' },
            { from: 10, to: 12, severity: 'error', message: 'new', source: 'ts' },
        ])
    })
})

describe('triggerSignatureHelp', () => {
    it('派发 lite-monaco-signature-help 并返 true', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'fn(' }),
            parent: host,
        })
        let seen = false
        view.dom.addEventListener('lite-monaco-signature-help', () => { seen = true })
        expect(triggerSignatureHelp(view)).toBe(true)
        expect(seen).toBe(true)
        view.destroy()
        host.remove()
    })
})

describe('signatureHelpSession', () => {
    it('input.type 打 ( 后弹出签名卡', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f(a: number) { return a }\nf'
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const off = signatureHelpSession(view, { lang: 'typescript', fileName: '/sig-paren.ts' })
        const at = view.state.doc.length
        view.dispatch(view.state.update({
            changes: { from: at, insert: '(' },
            selection: { anchor: at + 1 },
            userEvent: 'input.type',
        }))
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline && !view.dom.querySelector('.cm-signature-help'))
            await new Promise(r => setTimeout(r, 40))
        expect(view.dom.querySelector('.cm-signature-help')).not.toBeNull()
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(view.dom.querySelector('.cm-signature-help')).toBeNull()
        off()
        view.destroy()
        host.remove()
    }, 60_000)

    it('光标离开调用栈后签名卡关掉', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f(a: number) { return a }\nf'
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const off = signatureHelpSession(view, { lang: 'typescript', fileName: '/sig-leave.ts' })
        const at = view.state.doc.length
        view.dispatch(view.state.update({
            changes: { from: at, insert: '(' },
            selection: { anchor: at + 1 },
            userEvent: 'input.type',
        }))
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline && !view.dom.querySelector('.cm-signature-help'))
            await new Promise(r => setTimeout(r, 40))
        expect(view.dom.querySelector('.cm-signature-help')).not.toBeNull()
        view.dispatch(view.state.update({ selection: { anchor: 0 } }))
        const hideBy = Date.now() + 5_000
        while (Date.now() < hideBy && view.dom.querySelector('.cm-signature-help'))
            await new Promise(r => setTimeout(r, 40))
        expect(view.dom.querySelector('.cm-signature-help')).toBeNull()
        off()
        view.destroy()
        host.remove()
    }, 60_000)

    it('打逗号后高亮下一个参数', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f(a: number, b: string) { return a }\nf'
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const off = signatureHelpSession(view, { lang: 'typescript', fileName: '/sig-comma.ts' })
        const at = view.state.doc.length
        view.dispatch(view.state.update({
            changes: { from: at, insert: '(' },
            selection: { anchor: at + 1 },
            userEvent: 'input.type',
        }))
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline && !view.dom.querySelector('.cm-signature-help'))
            await new Promise(r => setTimeout(r, 40))
        expect(view.dom.querySelector('.cm-signature-help')).not.toBeNull()
        view.dispatch(view.state.update({
            changes: { from: view.state.doc.length, insert: ',' },
            selection: { anchor: view.state.doc.length + 1 },
            userEvent: 'input.type',
        }))
        const until = Date.now() + 5_000
        let active = ''
        while (Date.now() < until) {
            active = view.dom.querySelector('.cm-signature-param-active')?.textContent ?? ''
            if (active.includes('b')) break
            await new Promise(r => setTimeout(r, 40))
        }
        expect(active).toMatch(/b/)
        off()
        view.destroy()
        host.remove()
    }, 60_000)
})
