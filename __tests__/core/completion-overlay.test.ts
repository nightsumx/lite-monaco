import { afterEach, describe, expect, it } from 'vitest'
import { placeCompletionWidget } from '../../src/core/feature/suggestwidget'
import { mountSuggest, cleanupSuggest } from './_suggest-harness'

afterEach(cleanupSuggest)

// 真页 bug 复现:回车 → 空行输 abc → 退格,DOM 变 "ababs"。
// 根因(取数抓出,非猜):补全下拉曾是【内容流 widget 装饰】注在光标处,其 textContent(候选 "abs")
// 混进 cm-line 文本 → "ab"+"abs"="ababs",破 DOM≡doc。修法:下拉改成绝对定位 overlay(同 hoverTooltip),
// 绝不注入 contenteditable 内容流(对齐 Monaco / 几何真源定律)。本测钉死:补全打开时被编辑行 DOM 文本 == doc 文本。

function lineDOMText(el: HTMLElement): string {
    if (el.childNodes.length === 1 && el.firstChild!.nodeName === 'BR') return ''
    return el.textContent ?? ''
}

describe('placeCompletionWidget(屏上坐标,贴 caret 行)', () => {
    // 详见 completion-place.test.ts 完整契约;此处保留 smoke
    const win = { left: 0, top: 0, right: 1440, bottom: 900 }

    it('下方够高:列表顶 = caret.bottom', () => {
        const p = placeCompletionWidget(
            { left: 140, top: 150, bottom: 168 },
            { w: 200, h: 150 },
            win,
        )
        expect(p.top).toBe(168)
        expect(p.left).toBe(140)
    })

    it('回归吸顶: caret@455 listH=280 → top@470 不是 ~196', () => {
        const p = placeCompletionWidget(
            { left: 1394, top: 455, bottom: 470 },
            { w: 320, h: 280 },
            win,
        )
        expect(p.top).toBe(470)
    })
})

describe('补全下拉不进内容流(真页 ababs bug)', () => {
    it('补全打开时,光标行 DOM 文本 == doc 文本(下拉不污染 textContent)', async () => {
        // doc 有 'abs' 词。第2行输 'ab' → 补全出 'abs'。下拉若注在内容流,行文本会变 'ababs'。
        const r = mountSuggest({ doc: 'abs\nab' }) // caret 在第2行 'ab' 末
        const v = r.v
        r.trigger()
        await r.waitOpen()
        expect(r.labels).toContain('abs')
        expect(r.listed).toBe(true)

        // 被编辑行(第2行,index 1)DOM 文本必须仍是 'ab',不含候选 'abs'。
        expect(lineDOMText(v.contentDOM.children[1] as HTMLElement)).toBe('ab')
        // 下拉绝不在 contentDOM 内。
        expect(v.contentDOM.querySelector('.cm-completionList')).toBeNull()
    })

    it('补全 overlay 挂 body(fixed) 而非内容流', async () => {
        const r = mountSuggest({ doc: 'function\nfun' })
        const v = r.v
        r.trigger()
        await r.waitOpen()
        const list = document.body.querySelector('.cm-completionList')
        expect(list).not.toBeNull()
        expect(v.contentDOM.contains(list)).toBe(false)
        expect(v.dom.contains(list)).toBe(false)
        cleanupSuggest()
        expect(document.body.querySelector('.cm-completionList')).toBeNull()
    })

    it('关闭补全后 overlay 移除', async () => {
        const r = mountSuggest({ doc: 'function\nfun' })
        const v = r.v
        r.trigger()
        await r.waitOpen()
        expect(document.body.querySelector('.cm-completionList')).not.toBeNull()
        v.dispatch(v.state.update({ changes: { from: 11, to: 12 } }))
        await r.waitClosed()
        expect(r.open).toBe(false)
        expect(document.body.querySelector('.cm-completionList')).toBeNull()
    })
})
