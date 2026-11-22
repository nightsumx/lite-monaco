import { describe, expect, it } from 'vitest'
import { maxOffset, clampDomPos, isUneditable, avoidUneditable } from '../../src/core/view/domutil'

describe('domutil L7 clamp', () => {
    it('maxOffset 文本/元素', () => {
        const t = document.createTextNode('abc')
        expect(maxOffset(t)).toBe(3)
        const el = document.createElement('div')
        el.append(t, document.createTextNode('x'))
        expect(maxOffset(el)).toBe(2)
    })

    it('clampDomPos 钳偏大 offset', () => {
        const t = document.createTextNode('ab')
        expect(clampDomPos(t, 99).offset).toBe(2)
        expect(clampDomPos(t, -1).offset).toBe(0)
    })

    it('空文本 / 空元素 / 注释节点 offset 钳到 0', () => {
        expect(maxOffset(document.createTextNode(''))).toBe(0)
        expect(maxOffset(document.createElement('div'))).toBe(0)
        expect(maxOffset(document.createComment('x'))).toBe(0)
        expect(clampDomPos(document.createTextNode(''), 3).offset).toBe(0)
        expect(clampDomPos(document.createComment('x'), 9).offset).toBe(0)
    })
})

describe('domutil uneditable', () => {
    it('contenteditable=false / widget 属性', () => {
        const el = document.createElement('span')
        el.contentEditable = 'false'
        expect(isUneditable(el)).toBe(true)
        const w = document.createElement('span')
        w.setAttribute('data-cm-widget', '3')
        expect(isUneditable(w)).toBe(true)
        expect(isUneditable(document.createTextNode('a'))).toBe(false)
    })

    it('avoidUneditable 从 widget 旁挪到文本', () => {
        const line = document.createElement('div')
        const a = document.createTextNode('aa')
        const w = document.createElement('span')
        w.setAttribute('data-cm-widget', '2')
        w.textContent = '…'
        const b = document.createTextNode('bb')
        line.append(a, w, b)
        // offset 指向 widget 之后（子 2）
        const r = avoidUneditable(line, 2, false)
        expect(r.node.nodeType).toBe(3)
    })

    it('preferAfter 从空 widget 挪到后邻文本起点', () => {
        const line = document.createElement('div')
        const a = document.createTextNode('aa')
        const w = document.createElement('span')
        w.setAttribute('data-cm-widget', '2')
        const b = document.createTextNode('bb')
        line.append(a, w, b)
        const r = avoidUneditable(line, 1, true)
        expect(r.node).toBe(b)
        expect(r.offset).toBe(0)
    })
})
