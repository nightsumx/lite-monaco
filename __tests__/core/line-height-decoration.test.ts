// 装饰自定义行高(Monaco 0.55 IModelDecorationOptions.lineHeight / fontSize)+ PositionOffsetTransformer。
// 路径:api/decorations(options)→ LineDecoration.spec.lineHeight → heightmap(HeightMapText.customLineHeight)→ 几何 / DOM 样式。
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../src/api/create'
import { createModel } from '../../src/api/model'
import { PositionOffsetTransformer } from '../../src/core/model/posoffset'

const hl = {
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text', 'plaintext'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as never
const features = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, codeActions: false, stickyScroll: false }

function make(text: string, lh = 10) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const model = createModel(text)
    const ed: any = createEditor(parent, { model: model as never, highlighter: hl, lineHeight: lh, features } as never)
    ed.oracle.lineHeight = lh
    ed.resetHeights()
    return { ed, model, parent }
}
const rect = (l: number) => ({ startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 })
const h = (ed: any, n: number) => ed.getBottomForLineNumber(n) - ed.getTopForLineNumber(n)

afterEach(() => { document.body.replaceChildren() })

describe('decoration lineHeight', () => {
    const text = Array.from({ length: 8 }, (_, i) => `l${i + 1}`).join('\n')

    it('覆盖起点所在行的行高,后面的行整体下推;删掉装饰复原', () => {
        const { ed } = make(text)
        const [id] = ed.deltaDecorations([], [{ range: rect(3), options: { description: 't', lineHeight: 30 } }])
        expect([1, 2, 3, 4].map(n => h(ed, n))).toEqual([10, 10, 30, 10])
        expect(ed.getBottomForLineNumber(8)).toBe(100)
        ed.deltaDecorations([id], [])
        expect(ed.getBottomForLineNumber(8)).toBe(80)
    })

    it('allowVariableLineHeights:false(Monaco 0.55)→ 忽略 lineHeight 装饰;改回 true 立刻生效', () => {
        const { ed } = make(text)
        ed.deltaDecorations([], [{ range: rect(3), options: { description: 't', lineHeight: 30 } }])
        expect(h(ed, 3)).toBe(30)
        ed.updateOptions({ allowVariableLineHeights: false })
        expect([2, 3, 4].map(n => h(ed, n))).toEqual([10, 10, 10])
        expect(ed.getBottomForLineNumber(8)).toBe(80)
        ed.updateOptions({ allowVariableLineHeights: true })
        expect(h(ed, 3)).toBe(30)
    })

    it('多行区间只作用在起始行(同 Monaco);同行多条取最大;上限 300', () => {
        const { ed } = make(text)
        ed.deltaDecorations([], [
            { range: { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 }, options: { description: 'a', lineHeight: 20 } },
            { range: rect(2), options: { description: 'b', lineHeight: 40 } },
            { range: rect(6), options: { description: 'c', lineHeight: 9999 } },
        ])
        expect([2, 3, 5, 6].map(n => h(ed, n))).toEqual([40, 10, 10, 300])
    })

    it('随编辑平移:上方插行 / 删行,行高跟着装饰走', () => {
        const { ed, model } = make(text)
        ed.deltaDecorations([], [{ range: rect(5), options: { description: 't', lineHeight: 30 } }])
        model.applyEdits([{ range: rect(2), text: 'x\ny\n' }])
        expect([5, 6, 7, 8].map(n => h(ed, n))).toEqual([10, 10, 30, 10])
        model.applyEdits([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 }, text: '' }])
        expect([3, 4, 5].map(n => h(ed, n))).toEqual([10, 30, 10])
    })

    it('原位改 options.lineHeight(changeDecorationOptions)后几何更新', () => {
        const { ed } = make(text)
        const [id] = ed.deltaDecorations([], [{ range: rect(3), options: { description: 't', lineHeight: 30 } }])
        ed.changeDecorations((acc: any) => acc.changeDecorationOptions(id, { description: 't', lineHeight: 50 }))
        expect(h(ed, 3)).toBe(50)
    })

    it('DOM:起点行带 line-height 样式;fontSize 变成区间文字的行内样式', () => {
        const { ed, parent } = make(text)
        ed.deltaDecorations([], [
            { range: rect(3), options: { description: 'h', lineHeight: 30 } },
            { range: { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 2 }, options: { description: 'f', fontSize: '20px', fontWeight: 'bold; color:red' } },
        ])
        const lines = parent.querySelectorAll('.cm-line')
        expect((lines[2] as HTMLElement).style.lineHeight).toBe('30px')
        expect((lines[1] as HTMLElement).style.lineHeight).toBe('')
        const span = lines[3].querySelector('span[style*="font-size"]') as HTMLElement
        expect(span.style.fontSize).toBe('20px')
        expect(parent.querySelector('[style*="color: red"], [style*="color:red"]')).toBeNull() // 值里的分号被剔掉,注入不了别的声明
    })
})

describe('PositionOffsetTransformer', () => {
    const t = new PositionOffsetTransformer('ab\ncd\r\nef')
    it('offset → position:越界在末行往右外推', () => {
        expect(t.getPosition(0)).toEqual({ lineNumber: 1, column: 1 })
        expect(t.getPosition(3)).toEqual({ lineNumber: 2, column: 1 })
        expect(t.getPosition(7)).toEqual({ lineNumber: 3, column: 1 })
        expect(t.getPosition(9)).toEqual({ lineNumber: 3, column: 3 })
        expect(t.getPosition(12)).toEqual({ lineNumber: 3, column: 6 })
    })
    it('position → offset:钳位;行内容不含 \\r', () => {
        expect(t.getOffset({ lineNumber: 2, column: 99 })).toBe(5)
        expect(t.getOffset({ lineNumber: 99, column: 1 })).toBe(9)
        expect(t.getOffset({ lineNumber: 0, column: 5 })).toBe(0)
        expect(t.getLineLength(2)).toBe(2)
    })
    it('range 互转', () => {
        expect(t.getRange(1, 4)).toEqual({ startLineNumber: 1, startColumn: 2, endLineNumber: 2, endColumn: 2 })
        expect(t.getOffsetRange({ startLineNumber: 1, startColumn: 2, endLineNumber: 2, endColumn: 2 })).toEqual({ start: 1, endExclusive: 4 })
    })
})
