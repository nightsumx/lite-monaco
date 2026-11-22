import { describe, expect, it } from 'vitest'
import { containsRTL } from '../../src/core/view/materialize'
import { afterEach } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'

afterEach(cleanup)

// Monaco viewLineRenderer:含 RTL 字符的 token 写成 <span dir=rtl style=unicode-bidi:isolate>,
// 纯 LTR 的不动。lite 的「token」= 行的一级子节点。

describe('containsRTL(同 Monaco strings.containsRTL)', () => {
    it('希伯来 / 阿拉伯 / 辅助平面 RTL 为真,拉丁 / CJK / emoji / 数字为假', () => {
        expect(containsRTL('שלום')).toBe(true)
        expect(containsRTL('مرحبا')).toBe(true)
        expect(containsRTL('\u{1E900}')).toBe(true) // Adlam
        expect(containsRTL('abc 中文 😀 123')).toBe(false)
        expect(containsRTL('')).toBe(false)
    })
})

describe('含 RTL 的行', () => {
    it('整行文字被 dir=rtl + unicode-bidi:isolate 包住;文字不变', () => {
        const ed = mountEditor('abc שלום def\nplain')
        const lines = ed.contentDOM.querySelectorAll('.cm-line')
        const iso = lines[0].querySelector('[dir=rtl]') as HTMLElement
        expect(iso).toBeTruthy()
        expect(iso.style.unicodeBidi).toBe('isolate')
        expect(lines[0].textContent).toBe('abc שלום def')
        expect(lines[1].querySelector('[dir]')).toBeNull()
    })
})

describe('mark 把 token 劈开', () => {
    it('希伯来文中间一段加了装饰:各段仍在同一个隔离 span 里(显示顺序不变)', () => {
        const ed = mountEditor('abc שלום עולם def')
        ed.deltaDecorations([], [{ range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 9 }, options: { description: 'x', inlineClassName: 'hit' } }])
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        const isos = line.querySelectorAll(':scope > [dir=rtl]')
        expect(isos.length).toBe(1)
        expect(isos[0].textContent).toBe('abc שלום עולם def')
        expect(isos[0].querySelector('.hit')?.textContent).toBe('לום')
    })
})

describe('第四轮·块B:按 token 的 key 分组(同 Monaco 一个 token 一个隔离 span)', () => {
    const isoTexts = (text: string) => {
        const ed = mountEditor(text)
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        return [...line.querySelectorAll(':scope > [dir=rtl]')].map(e => e.textContent)
    }
    it('行首空白被剥出隔离 span 外(Monaco splitLeadingWhitespaceFromRTL)', () => {
        const ed = mountEditor('  שלום')
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        const iso = line.querySelector(':scope > [dir=rtl]') as HTMLElement
        expect(iso.textContent).toBe('שלום')
        expect(line.textContent).toBe('  שלום')
    })
    it('选区 / 装饰劈开 RTL 文本不增加隔离 span 个数(连续 RTL run 合并)', () => {
        const ed = mountEditor('שלום עולם')
        expect(isoTexts('שלום עולם').length).toBe(1)
        ed.deltaDecorations([], [{ range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 }, options: { description: 'x', inlineClassName: 'hit' } }])
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        expect(line.querySelectorAll(':scope > [dir=rtl]').length).toBe(1)
    })
    it('行末的 LRM 哨兵(::after)写在主题里:含 RTL 子节点的行才有,免得行尾空格被 UAX#9 L1 重置', async () => {
        const { liteMonacoBaseCSS } = await import('../../src/product/themecss')
        expect(liteMonacoBaseCSS()).toMatch(/\.cm-line:has\(> \[dir=rtl\]\)::after/)
    })
})
