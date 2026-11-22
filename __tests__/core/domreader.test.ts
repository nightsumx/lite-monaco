import { describe, expect, it } from 'vitest'
import { DOMReader, DOMPoint, LineBreakPlaceholder } from '../../src/core/view/domreader'
import { Rope } from '../../src/core/model/rope'

// CM7 DOMReader 读路径的两个独立契约(domchange.test.ts 只测无 widget 的多行读回):
//   ① \r\n / \r / \n 三种换行读回等价(readTextNode 的词法分段)
//   ② 撞 data-cm-widget 元素时不读占位文本,从 doc 切隐藏原文(= CM6 overrideDOMText)
// 后者是 input-matrix I11/I12 端到端暴露的读路径真 bug 的纯契约版,单独钉死。

const doc = (s: string) => Rope.of(s.split('\n'))

// 造一个含单个文本节点的行 div。
function lineWithText(text: string): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-line'
    div.appendChild(document.createTextNode(text))
    return div
}

// 造含 widget(⋯ 占位)的行:before + <span data-cm-widget=N data-cm-widget-from=F>⋯</span> + after。
function lineWithWidget(before: string, widgetLen: number, widgetFrom: number, after: string): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-line'
    if (before) div.appendChild(document.createTextNode(before))
    const w = document.createElement('span')
    w.setAttribute('data-cm-widget', String(widgetLen))
    w.setAttribute('data-cm-widget-from', String(widgetFrom))
    w.textContent = '⋯'
    div.appendChild(w)
    if (after) div.appendChild(document.createTextNode(after))
    return div
}

describe('DOMReader \\r\\n 归一:三种换行读回同一占位序列', () => {
    // readTextNode 遇 \r\n / \r / \n 都切一次行,产 LineBreakPlaceholder。
    const readSingleLine = (text: string) => {
        const el = lineWithText(text)
        const r = new DOMReader([])
        r.readLines(el, el)
        return r.text
    }
    it('\\n', () => {
        expect(readSingleLine('a\nb')).toBe(`a${LineBreakPlaceholder}b`)
    })
    it('\\r\\n', () => {
        expect(readSingleLine('a\r\nb')).toBe(`a${LineBreakPlaceholder}b`)
    })
    it('\\r', () => {
        expect(readSingleLine('a\rb')).toBe(`a${LineBreakPlaceholder}b`)
    })
})

describe('DOMReader widget 读回:从 doc 切隐藏原文,不读占位 ⋯', () => {
    it('折叠区在行中:abc[def]ghi,⋯ 隐藏 def', () => {
        // doc='abcdefghi',[3,6)=def 折成 ⋯。DOM 只有 'abc' + ⋯ + 'ghi'。
        const d = doc('abcdefghi')
        const el = lineWithWidget('abc', 3, 3, 'ghi')
        const r = new DOMReader([])
        r.readLines(el, el, d, 0)
        expect(r.text).toBe('abcdefghi') // 隐藏的 def 从 doc 切回,而非读成 ⋯
    })
    it('无 doc(未启用 widget 感知):读占位文本本身', () => {
        // 不传 doc/docStart → this.doc=null → widget 分支不 append 隐藏原文(仅推进 docPos)。
        const el = lineWithWidget('abc', 3, 3, 'ghi')
        const r = new DOMReader([])
        r.readLines(el, el)
        expect(r.text).toBe('abcghi') // 无 doc 可切,占位不计入(docPos 推进但不 append)
    })
    it('用绝对 data-cm-widget-from,不随前文可见编辑漂移', () => {
        // doc='abcdefghi',widget-from=3 固定。即使 before 文本已被编辑成 'aXbc'(读到的可见文本变长),
        // 仍从 doc[3,6) 切 def。
        const d = doc('abcdefghi')
        const el = lineWithWidget('aXbc', 3, 3, 'ghi')
        const r = new DOMReader([])
        r.readLines(el, el, d, 0)
        expect(r.text).toBe('aXbcdefghi') // 可见 'aXbc' + doc 切的 'def' + 'ghi'
    })
})

describe('DOMReader DOMPoint 选区点映射', () => {
    it('文本节点内 offset → 累计文本位置', () => {
        const el = lineWithText('hello')
        const t = el.firstChild as Text
        const point = new DOMPoint(t, 3)
        const r = new DOMReader([point])
        r.readLines(el, el)
        expect(point.pos).toBe(3)
    })
})
