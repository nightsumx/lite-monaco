// 第六轮 H 组(第 4 条后半):补全列表上下空间按窗口算,不按编辑器。
// Monaco 0.52 suggestWidget._layout:bodyBox = getClientArea(body);下方 = body 高 - 光标行底 - verticalPadding(22),
// 上方 = 光标行顶 - 22;整表放不进下方才翻上。列表是 allowEditorOverflow 的 content widget,可以伸出编辑器底。
// 实测 /tmp/lc-hunt/r6/H/sg-scroll.ts 22(窗口 900、编辑器 [182,700]、第 22 行打字后行底 600):
// Monaco 列表 top=600(下方,伸出编辑器底;对照页 .frame overflow:hidden 把它裁掉了一截),lite-monaco 原先翻到上方 336。
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuggest, cleanupSuggest, type RigOptions } from './_suggest-harness'
import type { CompletionItemProvider } from '../../src/lang/providers'

afterEach(cleanupSuggest)

function rect(left: number, top: number, width: number, height: number) {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

/** 20 个 fun{i}:range = 光标前的词(Monaco provider 协议必须给 range) */
const funProvider: CompletionItemProvider = {
    provideCompletionItems(model, position) {
        const w = model.getWordUntilPosition(position)
        const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
        return { suggestions: Array.from({ length: 20 }, (_, i) => ({ label: `fun${i}`, kind: 4, insertText: `fun${i}`, range })) }
    },
}

async function openAt(caret: { top: number, bottom: number }, winH: number) {
    const opts: RigOptions = { doc: 'line0\nline1\nline2\nfun', providers: [['plaintext', funProvider]] }
    const r = mountSuggest(opts)
    const view = r.v
    view.caretCoords = () => ({ left: 250, top: caret.top, height: caret.bottom - caret.top, bottom: caret.bottom })
    view.dom.getBoundingClientRect = () => rect(0, 182, 800, 518)
    view.scrollDOM.getBoundingClientRect = () => rect(0, 182, 800, 518)
    Object.defineProperty(window, 'innerHeight', { value: winH, configurable: true })
    r.trigger()
    await r.waitOpen()
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    const list = document.body.querySelector('.cm-completionList') as HTMLElement
    return { top: parseFloat(list.style.top), height: parseFloat(list.style.height) }
}

describe('补全列表上下按窗口空间放(Monaco suggestWidget._layout)', () => {
    it('行底 600、编辑器底 700、窗口 900:下方 278 放得下 → 放下方(伸出编辑器)', async () => {
        const r = await openAt({ top: 580, bottom: 600 }, 900)
        expect(r.top).toBe(600)
    })
    it('窗口也不够(行底 700、窗口 720 → 下方 < 0)且上方大 → 翻上', async () => {
        const r = await openAt({ top: 680, bottom: 700 }, 720)
        expect(r.top + r.height).toBe(678)
    })
})
