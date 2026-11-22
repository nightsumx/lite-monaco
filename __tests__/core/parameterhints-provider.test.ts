// registerSignatureHelpProvider:打字命中触发字符 → 签名卡出现;Esc / 越界关;onDidType 的文本语义。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { languageFeatures, registerSignatureHelpProvider, SignatureHelpTriggerKind } from '../../src/index'

afterEach(() => { cleanup(); vi.useRealTimers() })

const help = (n = 1) => ({
    value: {
        signatures: Array.from({ length: n }, (_, i) => ({ label: `fn${i}(a: number, b: string)`, parameters: [{ label: 'a: number' }, { label: 'b: string' }] })),
        activeSignature: 0, activeParameter: 1,
    },
    dispose() { },
})

describe('onDidType', () => {
    it('trigger type 发 onDidType;自动配对只算敲的那个字符', () => {
        const ed = mountEditor('')
        const seen: string[] = []
        ed.onDidType((t: string) => seen.push(t))
        ed.trigger('keyboard', 'type', { text: 'a' })
        ed.trigger('keyboard', 'type', { text: '(' })
        expect(seen[0]).toBe('a')
        expect(seen[1]).toBe('(')
    })
})

describe('registerSignatureHelpProvider', () => {
    it('打字触发字符 → 120ms 后出卡,Esc 关;provider 收到 TriggerCharacter', async () => {
        vi.useFakeTimers()
        const ed = mountEditor('')
        const ctxs: Array<{ triggerKind: number, triggerCharacter?: string }> = []
        const d = registerSignatureHelpProvider('*', {
            signatureHelpTriggerCharacters: ['('],
            provideSignatureHelp: (_m, _p, _t, ctx) => { ctxs.push(ctx); return help(2) },
        })
        await Promise.resolve() // 贡献在微任务里装
        ed.trigger('keyboard', 'type', { text: '(' })
        await vi.advanceTimersByTimeAsync(200)
        expect(ctxs[0].triggerKind).toBe(SignatureHelpTriggerKind.TriggerCharacter)
        expect(ctxs[0].triggerCharacter).toBe('(')
        const card = ed.dom.querySelector('.cm-signature-help')
        expect(card).not.toBeNull()
        expect(card!.classList.contains('cm-signature-multiple')).toBe(true)
        expect(card!.querySelector('.cm-signature-param-active')?.textContent).toBe('b: string')
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(ed.dom.querySelector('.cm-signature-help')).toBeNull()
        d.dispose()
        expect(languageFeatures.signatureHelpProvider.allNoModel().length).toBe(0)
    })

    it('没有 provider:打字不出卡', async () => {
        vi.useFakeTimers()
        const ed = mountEditor('')
        await Promise.resolve()
        ed.trigger('keyboard', 'type', { text: '(' })
        await vi.advanceTimersByTimeAsync(200)
        expect(ed.dom.querySelector('.cm-signature-help')).toBeNull()
    })
})
