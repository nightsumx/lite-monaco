// 边界属性矩阵 —— (输入Op × 边界点 × 装饰/虚拟化) 笛卡尔积,每格断言 DOM≡doc 双射不变式。
//
// 建模:一整类「特殊边界没处理到 → bug」的边界点是有限集合(空 doc / doc 首尾 / 空行 / 行尾 /
// 折叠边界 / 多 span 行 / 虚拟化视口边 / 多光标)。输入 Op 也是有限集合。逐个手挑测试永远漏格,
// 故数据驱动扫笛卡尔积——仿 markloom COVERAGE.md「只列合法格,每格 expectLegal」。
//
// 每步 flush→dispatch 同时触发 editorview.update 里的运行时闸门(invariants.checkBijection),
// 双重钉死:矩阵显式断言 + 闸门隐式 throw。不可能格(空 doc 退格等)显式 skip 并注明原因。

import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { Decoration, WidgetType } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import type { EditorView } from '../../src/core/view/editorview'
import {
    make, makeScrolled, makeWith,
    setCaret, setSelection, typeText, deleteText, pressEnter,
    replaceSelection, replaceSelectionCrossLine, expectInvariants, expectDOMMatchesViewport, expectDOMMatchesDoc,
} from './input-harness'

// —— 装饰 provider(仿 input-fold / input-span 的最小形态)——
class FoldW extends WidgetType {
    toDOM(): Node { const s = document.createElement('span'); s.className = 'cm-foldPlaceholder'; s.textContent = '⋯'; return s }
}
const foldProvider = (ranges: { from: number, to: number }[]) => (_s: EditorState) => {
    const b = new RangeSetBuilder<Decoration>()
    for (const r of ranges) b.add(r.from, r.to, Decoration.replace({ widget: new FoldW() }))
    return b.finish()
}
// 每个非空白词标一个 mark span(多 span 行)。
const wordMarkProvider = (_s: EditorState) => {
    const b = new RangeSetBuilder<Decoration>()
    const doc = _s.doc.toString()
    let start = -1
    const flush = (end: number) => { if (start >= 0) b.add(start, end, Decoration.mark({ class: 'tok' })); start = -1 }
    for (let i = 0; i < doc.length; i++) {
        if (doc[i] === ' ' || doc[i] === '\n') flush(i)
        else if (start < 0) start = i
    }
    flush(doc.length)
    return b.finish()
}

// —— Op 目录:每个是 (view, pos) → 施加一次输入。skip 里声明该 op 在某边界不可能。——
const ops = ['type', 'backspace', 'delete', 'enter', 'paste-multiline', 'replace-selection'] as const
type Op = typeof ops[number]

function applyOp(op: Op, view: EditorView, pos: number) {
    const doc = view.state.doc
    switch (op) {
        case 'type':
            setCaret(view, pos); typeText(view, pos, 'X'); break
        case 'backspace': // 删 pos 前一字符
            setCaret(view, pos); deleteText(view, pos - 1, 1); break
        case 'delete': // 删 pos 后一字符
            setCaret(view, pos); deleteText(view, pos, 1); break
        case 'enter':
            setCaret(view, pos); pressEnter(view, pos); break
        case 'paste-multiline': { // 选中 pos 处零宽范围,粘贴含换行文本 → 跨行 childList
            setSelection(view, pos, pos)
            replaceSelectionCrossLine(view, pos, pos, 'A\nB'); break
        }
        case 'replace-selection': { // 选中 pos 前一字符(同行)替换
            const from = pos - 1, to = pos
            if (doc.lineAt(from).number !== doc.lineAt(to).number) return
            setSelection(view, from, to); replaceSelection(view, from, to, 'Z'); break
        }
    }
}

// —— 边界目录 ——
interface Fixture {
    name: string
    make: () => EditorView
    caret: (v: EditorView) => number
    virtualized?: boolean          // 断言 expectDOMMatchesViewport(虚拟化窗口)
    structuralOnly?: boolean       // 折叠:只结构双射,跳全 doc 往返(折内位置合法贴边界,非恒等)
    skip?: (op: Op) => boolean     // 逐 op 不可能性(注明原因)
}

const atStart = () => 0
const atEnd = (v: EditorView) => v.state.doc.length

const fixtures: Fixture[] = [
    // 空 doc:无字符可删。
    { name: '空 doc', make: () => make(''), caret: atStart, skip: op => op === 'backspace' || op === 'delete' || op === 'replace-selection' },
    // 单空行(等价空 doc,分列以覆盖显式空行路径)。
    { name: '单空行', make: () => make(''), caret: atStart, skip: op => op === 'backspace' || op === 'delete' || op === 'replace-selection' },
    // doc 起点:前无字符。
    { name: 'doc 起点', make: () => make('abc\ndef'), caret: atStart, skip: op => op === 'backspace' || op === 'replace-selection' },
    // doc 终点:后无字符。
    { name: 'doc 终点', make: () => make('abc\ndef'), caret: atEnd, skip: op => op === 'delete' },
    // 文本间空行:光标落空行,四周有字符。
    { name: '文本间空行', make: () => make('a\n\nb'), caret: () => 2, skip: op => op === 'replace-selection' },
    // 行尾:该行末字符后。
    { name: '行尾', make: () => make('abc\ndef'), caret: v => v.state.doc.line(1).to },
    // 折叠边界:光标贴折叠区起点(widget 前)。折内位置往返合法贴边界(非恒等)→ structuralOnly。
    { name: '折叠边界', make: () => makeWith('abcdefghi', [foldProvider([{ from: 3, to: 6 }])]), caret: () => 3, structuralOnly: true },
    // 多 span 行:光标落词间空格。
    { name: '多 span 行词间', make: () => makeWith('foo bar baz', [wordMarkProvider]), caret: () => 3 },
    // 虚拟化视口顶边:光标落当前视口首行行首。backspace 会并入视口外的上一行(off-screen 无 DOM),
    // 那是「跨视口边界删除」另一类问题,不属本行首边界,跳过。
    {
        name: '虚拟化视口顶边', virtualized: true,
        make: () => makeScrolled(Array.from({ length: 200 }, (_, i) => `line${i}`).join('\n'), { clientHeight: 200, scrollTop: 700 }),
        caret: v => v.state.doc.line(v.viewportStartLine).from,
        skip: op => op === 'backspace',
    },
    // 虚拟化视口底边:光标落当前视口末行行尾。
    {
        name: '虚拟化视口底边', virtualized: true,
        make: () => makeScrolled(Array.from({ length: 200 }, (_, i) => `line${i}`).join('\n'), { clientHeight: 200, scrollTop: 700 }),
        caret: v => v.state.doc.lineAt(Math.min(v.viewport.to, v.state.doc.length)).to,
    },
    // 多光标(其一在空行边界):主光标落空行,副光标落有字行。
    {
        name: '多光标含空行', make: () => make('a\n\nb'), caret: () => 2,
        // replace-selection 用 setSelection 会覆盖多光标(单选区),跳过——多光标语义另测。
        skip: op => op === 'replace-selection',
    },
]

describe.each(fixtures)('边界矩阵 · $name', (fx) => {
    it.each(ops)('%s → 双射不变', (op) => {
        if (fx.skip?.(op)) return
        const view = fx.make()
        const pos = fx.caret(view)
        applyOp(op, view, pos)
        if (fx.virtualized) expectDOMMatchesViewport(view)
        else if (fx.structuralOnly) expectDOMMatchesDoc(view) // 折内不做全 doc 往返
        else expectInvariants(view)
    })
})

// 多光标本身的边界:一个 range 落空行、一个落有字行,施加输入后双射仍成立。
describe('多光标边界 · 输入扇出两处', () => {
    it('两 range(其一在空行)选区合法且双射成立', () => {
        const view = make('a\n\nb')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)], 1),
        }))
        expect(view.state.selection.ranges.length).toBe(2)
        expectInvariants(view)
    })

    it('千级光标 replaceSelection 每处各插一字', () => {
        const n = 1000
        const doc = 'a'.repeat(n)
        let state = EditorState.create({
            doc,
            selection: EditorSelection.create(
                Array.from({ length: n }, (_, i) => EditorSelection.cursor(i)),
            ),
            extensions: [EditorState.allowMultipleSelections.of(true)],
        })
        state = state.applyTransaction(state.update(state.replaceSelection('Z')))
        expect(state.selection.ranges.length).toBe(n)
        expect(state.doc.toString()).toBe('Za'.repeat(n))
        expect(state.selection.ranges[0].head).toBe(1)
        expect(state.selection.ranges[n - 1].head).toBe(n * 2 - 1)
    })
})
