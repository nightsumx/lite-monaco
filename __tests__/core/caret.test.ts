// 光标定位域 —— pos ↔ DOM ↔ 屏坐标 必须是双射。
//
// 用户报「光标经常定位错误」= 点到的列 / 画出的竖线 / state.selection.head 三者不一致。
// 真源:
//   state.head  --domAtPos-->  (node,offset)  --posFromDOM-->  head
//   head        --caretCoords-->  {left,top}   --posAtCoords-->  head
//   点击 x      --posAtCoords-->  离 x 最近的 caret 列
// jsdom 无布局:给 Range.getClientRects / 盒几何打桩,使 coords 路径可测。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { EditorSelection } from '../../src/core/model/selection'
import { make, makeScrolled } from './input-harness'

const CW = 8
const LH = 16
const ORIGIN_X = 10
const ORIGIN_Y = 20

function installCaretGeom(view: EditorView) {
    const RangeCtor = view.dom.ownerDocument.createRange().constructor as typeof Range
    const prevRects = RangeCtor.prototype.getClientRects
    RangeCtor.prototype.getClientRects = function (this: Range) {
        const pos = view.posFromDOM(this.startContainer, this.startOffset)
        const line = view.state.doc.lineAt(Math.max(0, Math.min(pos, view.state.doc.length)))
        const col = pos - line.from
        const left = ORIGIN_X + col * CW
        const top = ORIGIN_Y + (line.number - 1) * LH
        const rec = {
            left, top, right: left, bottom: top + LH,
            width: 0, height: LH,
            x: left, y: top,
            toJSON() { return this },
        }
        return { 0: rec, length: 1, item: (i: number) => i === 0 ? rec : null } as unknown as DOMRectList
    }
    const box = (el: Element) => {
        if (el === view.scrollDOM || el === view.contentDOM) {
            return {
                left: ORIGIN_X, top: ORIGIN_Y, right: ORIGIN_X + 400, bottom: ORIGIN_Y + 400,
                width: 400, height: 400, x: ORIGIN_X, y: ORIGIN_Y, toJSON() { return this },
            } as DOMRect
        }
        const lines = Array.from(view.contentDOM.children)
        const i = lines.indexOf(el)
        if (i >= 0) {
            const top = ORIGIN_Y + i * LH
            return {
                left: ORIGIN_X, top, right: ORIGIN_X + 400, bottom: top + LH,
                width: 400, height: LH, x: ORIGIN_X, y: top, toJSON() { return this },
            } as DOMRect
        }
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() { return this } } as DOMRect
    }
    const prevScroll = view.scrollDOM.getBoundingClientRect.bind(view.scrollDOM)
    const prevContent = view.contentDOM.getBoundingClientRect.bind(view.contentDOM)
    view.scrollDOM.getBoundingClientRect = () => box(view.scrollDOM)
    view.contentDOM.getBoundingClientRect = () => box(view.contentDOM)
    for (const line of Array.from(view.contentDOM.children))
        (line as HTMLElement).getBoundingClientRect = () => box(line)
    view.oracle.lineHeight = LH
    view.oracle.charWidth = CW
    view.resetHeights()
    return () => {
        RangeCtor.prototype.getClientRects = prevRects
        view.scrollDOM.getBoundingClientRect = prevScroll
        view.contentDOM.getBoundingClientRect = prevContent
    }
}

const DOCS = [
    'hello',
    'a\nbb\nccc',
    'a\n\nb',
    'const x',
]

describe('光标域 —— pos ↔ DOM', () => {
    for (const text of DOCS) {
        it(`∀pos posFromDOM∘domAtPos = id  「${text.replace(/\n/g, '↵')}」`, () => {
            const view = make(text)
            const n = view.state.doc.length
            for (let pos = 0; pos <= n; pos++) {
                const { node, offset } = view.domAtPos(pos)
                expect(view.posFromDOM(node, offset)).toBe(pos)
            }
            view.destroy()
        })
    }
})

describe('光标域 —— pos ↔ 屏坐标', () => {
    afterEach(() => { /* restore in each test via uninstall */ })

    for (const text of DOCS) {
        it(`∀pos posAtCoords∘caretCoords = id  「${text.replace(/\n/g, '↵')}」`, () => {
            const view = make(text)
            const uninstall = installCaretGeom(view)
            try {
                const n = view.state.doc.length
                for (let pos = 0; pos <= n; pos++) {
                    const c = view.caretCoords(pos)
                    expect(c).not.toBeNull()
                    expect(view.posAtCoords({ x: c!.left, y: c!.top + 1 })).toBe(pos)
                }
            } finally {
                uninstall()
                view.destroy()
            }
        })
    }

    it('点在字的左半 → 该列，右半 → 下一列（近边）', () => {
        const view = make('abcd')
        const uninstall = installCaretGeom(view)
        try {
            const y = ORIGIN_Y + 1
            // col 1 的 caret 在 ORIGIN_X+8；字 'b' 中点在 +12
            expect(view.posAtCoords({ x: ORIGIN_X + CW + CW * 0.4, y })).toBe(1)
            expect(view.posAtCoords({ x: ORIGIN_X + CW + CW * 0.6, y })).toBe(2)
        } finally {
            uninstall()
            view.destroy()
        }
    })

    it('点在行首左侧 → 行首', () => {
        const view = make('abcd')
        const uninstall = installCaretGeom(view)
        try {
            expect(view.posAtCoords({ x: ORIGIN_X - 3, y: ORIGIN_Y + 1 })).toBe(0)
        } finally {
            uninstall()
            view.destroy()
        }
    })

    it('点在行尾右侧 → 行尾', () => {
        const view = make('abcd')
        const uninstall = installCaretGeom(view)
        try {
            expect(view.posAtCoords({ x: ORIGIN_X + 4 * CW + 20, y: ORIGIN_Y + 1 })).toBe(4)
        } finally {
            uninstall()
            view.destroy()
        }
    })
})

describe('光标域 —— 装饰 / 空行 / 视口', () => {
    it('mark span 里每个 pos 仍双射', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'const x' }),
            parent: host,
            decorationProviders: [() => RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)], true)],
        })
        const uninstall = installCaretGeom(view)
        try {
            for (let pos = 0; pos <= view.state.doc.length; pos++) {
                const { node, offset } = view.domAtPos(pos)
                expect(view.posFromDOM(node, offset)).toBe(pos)
                const c = view.caretCoords(pos)
                expect(c).not.toBeNull()
                expect(view.posAtCoords({ x: c!.left, y: c!.top + 1 })).toBe(pos)
            }
        } finally {
            uninstall()
            view.destroy()
            host.remove()
        }
    })

    it('空行 caret 高度不超过行高（不吃整块盒）', () => {
        const view = make('a\n\nb')
        const uninstall = installCaretGeom(view)
        try {
            const empty = view.state.doc.line(2).from
            const c = view.caretCoords(empty)
            expect(c).not.toBeNull()
            expect(c!.height).toBeLessThanOrEqual(LH * 1.5)
        } finally {
            uninstall()
            view.destroy()
        }
    })

    it('视口外 caretCoords = null；视口内 pos↔DOM 仍双射', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `L${String(i).padStart(3, '0')}`).join('\n')
        const view = makeScrolled(lines, { clientHeight: 200, scrollTop: 400, lineHeight: 14 })
        expect(view.viewportStartLine).toBeGreaterThan(1)
        expect(view.caretCoords(0)).toBeNull()
        const from = view.state.doc.line(view.viewportStartLine).from
        const { node, offset } = view.domAtPos(from)
        expect(view.posFromDOM(node, offset)).toBe(from)
        view.destroy()
    })
})

describe('光标域 —— 编辑后 head 跟着走', () => {
    it('在 pos 插入一字 → head = pos+1，且 coords 双射仍在', () => {
        const view = make('hello')
        const uninstall = installCaretGeom(view)
        try {
            view.dispatch(view.state.update({
                changes: { from: 2, insert: 'X' },
                selection: { anchor: 3 },
            }))
            expect(view.state.selection.main.head).toBe(3)
            expect(view.state.sliceDoc()).toBe('heXllo')
            const c = view.caretCoords(3)
            expect(c).not.toBeNull()
            expect(view.posAtCoords({ x: c!.left, y: c!.top + 1 })).toBe(3)
        } finally {
            uninstall()
            view.destroy()
        }
    })

    it('dispatch 选区 → state.head 即目标，DOM 映射回去相同', () => {
        const view = make('abcdef')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(4) }))
        expect(view.state.selection.main.head).toBe(4)
        const { node, offset } = view.domAtPos(4)
        expect(view.posFromDOM(node, offset)).toBe(4)
        view.destroy()
    })
})
