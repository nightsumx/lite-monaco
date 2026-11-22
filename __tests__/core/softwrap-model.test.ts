// 折行的文本侧模型(softwrap.ts):折点算法(Monaco MonospaceLineBreaksComputer 规则)、LineProjection 的位置互换、
// SoftWrapModel 的视图坐标、竖移(vertical.ts 无布局 + wordWrapColumn 走它)。Monaco 原版用例由 __parity__ 覆盖,这里测 lite-monaco 自己的接线。
import { describe, expect, it } from 'vitest'
import { createEditor } from '../../src'
import { WrappingIndent } from '../../src/core/options'
import { Affinity, SoftWrapModel, computeLineProjection, wrapConfig, type WrapSource } from '../../src/core/view/softwrap'
import { fakeHl, QUIET } from './h1-helpers'

const cfg = (column: number, extra: Parameters<typeof wrapConfig>[0] extends infer T ? Partial<T> : never = {}) => wrapConfig({ column, indent: WrappingIndent.None, ...extra })
const breaks = (text: string, column: number, extra = {}) => {
    const p = computeLineProjection(text, cfg(column, extra))
    return p ? p.breakOffsets.slice(0, -1) : []
}

describe('computeLineProjection:折点', () => {
    it('词放不进当前行就整词下移(空格后断)', () => {
        expect(breaks('just some text', 6)).toEqual([5, 10])
        expect(breaks('abc def', 20)).toEqual([])
    })
    it('没有可断点:按列硬断', () => {
        expect(breaks('abcdefghij', 4)).toEqual([4, 8])
    })
    it('全角占 fullWidth 列', () => {
        expect(breaks('你好世界', 4)).toEqual([2])
        expect(breaks('你好世界', 6, { fullWidth: 3 })).toEqual([2])
    })
    it('Tab 展到 tab stop(宽 4)+ 词 2 列 > 5:Tab 是 breakAfter 字符,断在它之后', () => {
        expect(breaks('\tab', 5)).toEqual([1])
    })
    it('Kinsoku:不在开括号后断、不在句号前断', () => {
        expect(breaks('aaa(bbbbb', 5)).toEqual([3, 8]) // 断在 ( 之前
        expect(breaks('aaaaa.', 5)).toEqual([5])
    })
    it('代理对不拆', () => {
        for (const b of breaks('😀😀😀😀😀', 5)) expect(b % 2).toBe(0)
    })
    it('column <= 0 不折', () => {
        expect(computeLineProjection('aaaaaaaaaa', cfg(-1))).toBeNull()
    })
})

describe('computeLineProjection:wrappingIndent', () => {
    const indentOf = (text: string, ind: WrappingIndent, column = 20) => computeLineProjection(text, wrapConfig({ column, indent: ind, tabSize: 4 }))?.wrappedTextIndentLength
    const t = '  Word1 Word2 Word3 Word4'
    it('none / same / indent / deepIndent = 0 / 原缩进 / +1 个 tab stop / +2', () => {
        expect(indentOf(t, WrappingIndent.None)).toBe(0)
        expect(indentOf(t, WrappingIndent.Same)).toBe(2)
        expect(indentOf(t, WrappingIndent.Indent)).toBe(4)
        expect(indentOf(t, WrappingIndent.DeepIndent)).toBe(8)
    })
    it('缩进后连一个全角字符都放不下:续行顶格', () => {
        expect(indentOf('        aaaaaaaaaaaaaaaa', WrappingIndent.Indent, 12)).toBe(0)
    })
    it('空行 / 纯空白行没有缩进可记', () => {
        expect(indentOf('                          ', WrappingIndent.Same)).toBe(0)
    })
})

describe('LineProjection:位置互换', () => {
    const p = computeLineProjection('Word1 Word2 Word3 Word4', wrapConfig({ column: 20, indent: WrappingIndent.Indent }))!
    it('续行 minColumn = 缩进长度 + 1,行长含缩进', () => {
        expect(p.getOutputLineCount()).toBe(2)
        expect(p.getMinOutputOffset(1)).toBe(4)
        expect(p.getLineLength(1)).toBe(4 + 5)
    })
    it('模型 offset ↔ 视图位置互逆;折点上 None → 下一行首,Left → 上一行尾', () => {
        expect(p.translateToOutputPosition(18).toString()).toBe('1:4')
        expect(p.translateToOutputPosition(18, Affinity.Left).toString()).toBe('0:18')
        for (let i = 0; i <= 23; i++) {
            const o = p.translateToOutputPosition(i)
            expect(p.translateToInputOffset(o.outputLineIndex, o.outputOffset)).toBe(i)
        }
    })
    it('落进缩进区的视图列夹回折点', () => {
        expect(p.translateToInputOffset(1, 0)).toBe(18)
        expect(p.translateToInputOffset(1, 2)).toBe(18)
    })
    it('normalizeOutputPosition 按 affinity 把折点两侧并到一处', () => {
        expect(p.normalizeOutputPosition(0, 18, Affinity.Right).toString()).toBe('1:4')
        expect(p.normalizeOutputPosition(1, 4, Affinity.Left).toString()).toBe('0:18')
    })
})

describe('computeLineProjection:注入文字', () => {
    it('注入文字占宽、可被折断,模型 offset 不含它', () => {
        const p = computeLineProjection('abcdef', cfg(4)) // 无注入:[4,6]
        expect(p!.breakOffsets).toEqual([4, 6])
        const q = computeLineProjection('abcdef', cfg(4), [{ offset: 3, options: { content: 'XXXX' } }])!
        expect(q.breakOffsets).toEqual([4, 8, 10])
        // 注入点右侧 = 注入文字之后
        expect(q.translateToOutputPosition(3, Affinity.None).toString()).toBe('0:3')
        expect(q.translateToOutputPosition(3, Affinity.Right).toString()).toBe('1:3') // 越过 XXXX 里落在第 2 行的 XXX 之后
    })
})

// ───── 文档级:视图坐标 ─────
const docSource = (text: string, extra: Partial<WrapSource> = {}): WrapSource => {
    const lines = text.split('\n')
    return { lines: lines.length, text: n => lines[n - 1], ...extra }
}

describe('SoftWrapModel', () => {
    const m = new SoftWrapModel(docSource('Word1 Word2 Word3 Word4\nWord5 Word6 Word7 Word8'), wrapConfig({ column: 20, indent: WrappingIndent.Indent }))
    it('行数与绝对视图行号', () => {
        expect([m.rowCount(1), m.rowCount(2)]).toEqual([2, 2])
        expect(m.viewLineNumber(2, 1)).toBe(4)
    })
    it('视图行内容含续行缩进', () => {
        expect(m.content(1, 1)).toBe('    Word4')
        expect(m.content(2, 0)).toBe('Word5 Word6 Word7 ')
    })
    it('shift 跨行平移,越界给 before / after', () => {
        expect(m.shift({ line: 1, row: 1 }, 1)).toEqual({ line: 2, row: 0 })
        expect(m.shift({ line: 2, row: 0 }, -1)).toEqual({ line: 1, row: 1 })
        expect(m.shift({ line: 1, row: 0 }, -1)).toBe('before')
        expect(m.shift({ line: 2, row: 1 }, 1)).toBe('after')
    })
    it('折叠的行不占视图行', () => {
        const h = new SoftWrapModel(docSource('a\nb\nc', { hidden: n => n === 2 }), cfg(10))
        expect(h.rowCount(2)).toBe(0)
        expect(h.shift({ line: 1, row: 0 }, 1)).toEqual({ line: 3, row: 0 })
        expect(h.viewLineNumber(3, 0)).toBe(2)
    })
})

// ───── 接线:EditorView(无布局 + wordWrapColumn) ─────
function make(value: string, opts: Record<string, unknown> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const ed: any = createEditor(parent, { value, highlighter: fakeHl(), features: QUIET, wordWrap: 'wordWrapColumn', wordWrapColumn: 20, ...opts } as never)
    return { ed, dispose: () => { ed.dispose(); parent.remove() } }
}
const press = (ed: any, id: string) => ed.trigger('test', id, null)
const view = (ed: any) => ed.viewSelections().map((s: any) => `(${s.head.lineNumber},${s.head.column})`)

describe('EditorView:固定列折行的视图投影与竖移', () => {
    const text = 'Word1 Word2 Word3 Word4\nWord5 Word6 Word7 Word8'
    it('没开固定列折行:没有折行模型', () => {
        const h = make(text, { wordWrap: 'on' })
        expect(h.ed.softWrapModel()).toBeNull()
        expect(h.ed.viewSelections()).toBeNull()
        h.dispose()
    })
    it('↓↑ 按视图行走,续行目标列含缩进;末行 ↓ 到行尾', () => {
        const h = make(text, { wrappingIndent: 'indent' })
        h.ed.setPosition({ lineNumber: 1, column: 1 })
        const seen = [view(h.ed)[0]]
        for (let i = 0; i < 4; i++) { press(h.ed, 'cursorDown'); seen.push(view(h.ed)[0]) }
        expect(seen).toEqual(['(1,1)', '(2,5)', '(3,1)', '(4,5)', '(4,10)'])
        h.dispose()
    })
    it('折点上的光标:assoc 决定画在前一行尾还是后一行首', () => {
        const h = make('aaaaaaaaaaaaaaaaaaaaaaaaa', { wrappingIndent: 'none' })
        h.ed.setPosition({ lineNumber: 1, column: 21 })
        expect(view(h.ed)).toEqual(['(2,1)'])
        h.dispose()
    })
    it('注入文字(after 装饰):↓ 越过整段注入文字,不卡在里面', () => {
        const h = make('Word1 Word2 Word3 Word4\nWord5 Word6 Word7 Word8', { wrappingIndent: 'indent' })
        h.ed.changeDecorations((a: any) => a.deltaDecorations([], [{
            range: { startLineNumber: 1, startColumn: 22, endLineNumber: 1, endColumn: 22 },
            options: { showIfCollapsed: true, description: 't', after: { content: 'some very very very very very very very very long text' } },
        }]))
        h.ed.setPosition({ lineNumber: 1, column: 1 })
        press(h.ed, 'cursorDown'); press(h.ed, 'cursorDown')
        expect(view(h.ed)).toEqual(['(5,19)']) // 注入文字之后
        press(h.ed, 'cursorDown'); expect(view(h.ed)).toEqual(['(6,1)'])
        h.dispose()
    })
})
