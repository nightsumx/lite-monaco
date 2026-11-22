import type { TransactionSpec } from '../../src/core/model/state'
import { describe, expect, it } from 'vitest'
import { ChangeSet } from '../../src/core/model/change'
import { completedSyntaxStop, history, historyField, isolateHistory, redo, redoDepth, undo, undoDepth, undoSelection } from '../../src/core/edit/history'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState, Transaction } from '../../src/core/model/state'

// CM7 history —— 撤销/重做纯状态机。core 无 EditorView,用最小 dispatch 环驱动:
//   一个可变 cell 持当前态,dispatch(tr) = cell = tr.apply()。
//   命令收 {state, dispatch},pop 出的事务回流 historyField.update 完成分支搬移。
//
// 钉死:① 基本 undo/redo 往返 ② 时间分组(同组合并 vs 跨 delay 分组)③ 相邻性合并
//   ④ isolate 强制断组 ⑤ selection-only 历史 ⑥ remote(addToHistory=false)只映射不入栈
//   ⑦ 可监测公理:HistoryState.toJSON/fromJSON 双射 + 跨序列化重放等价。
// time 由调用方经 Transaction.time 注解显式给(阶段1 砍 Date.now)。

function editor(doc = '', config: Parameters<typeof history>[0] = {}) {
    let state = EditorState.create({ doc, extensions: history(config) })
    const dispatch = (tr: Transaction) => {
        state = tr.apply()
    }
    return {
        get state() { return state },
        dispatch,
        // 派一个普通编辑事务(带 time / userEvent)
        type(spec: TransactionSpec) { dispatch(state.update(spec)) },
        undo() { return undo({ state, dispatch }) },
        redo() { return redo({ state, dispatch }) },
        undoSelection() { return undoSelection({ state, dispatch }) },
        doc() { return state.doc.toString() },
    }
}

describe('history —— 基本 undo/redo 往返', () => {
    it('插入后 undo 回空、redo 复原', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'abc' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        expect(e.doc()).toBe('abc')
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('')
        expect(e.redo()).toBe(true)
        expect(e.doc()).toBe('abc')
    })

    it('空栈 undo/redo 返 false', () => {
        const e = editor('x')
        expect(e.undo()).toBe(false)
        expect(e.redo()).toBe(false)
    })

    it('redo 栈在新编辑后清空', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        e.undo()
        expect(redoDepth(e.state)).toBe(1)
        e.type({ changes: { from: 0, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        expect(redoDepth(e.state)).toBe(0)
        expect(e.doc()).toBe('b')
    })
})

describe('history —— 时间分组与相邻合并', () => {
    it('同组(近时刻 + 相邻 input.type)合并成一次 undo', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(1000) })
        e.type({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(1010) })
        expect(e.doc()).toBe('ab')
        expect(undoDepth(e.state)).toBe(1)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('')
    })

    // Monaco 不按时间切组(停顿后继续打字仍是一次 undo);只有显式配置 newGroupDelay 才按时间切。
    it('默认:停顿不切组(Monaco)', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(100000) })
        expect(undoDepth(e.state)).toBe(1)
    })

    it('显式配置 newGroupDelay 时跨时间窗分成两组', () => {
        const e = editor('', { newGroupDelay: 500 })
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(1000) })
        expect(undoDepth(e.state)).toBe(2)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('a')
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('')
    })

    it('非相邻编辑即使近时刻也不合并', () => {
        const e = editor('....')
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 5, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(10) })
        expect(undoDepth(e.state)).toBe(2)
    })

    it('密集 delete.backward 可合并', () => {
        const e = editor('abcd')
        e.type({
            changes: { from: 3, to: 4 }, selection: EditorSelection.single(3),
            userEvent: 'delete.backward', annotations: Transaction.time.of(1000),
        })
        e.type({
            changes: { from: 2, to: 3 }, selection: EditorSelection.single(2),
            userEvent: 'delete.backward', annotations: Transaction.time.of(1010),
        })
        expect(e.doc()).toBe('ab')
        expect(undoDepth(e.state)).toBe(1)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('abcd')
    })

    it('delete.line 绝不与相邻 delete.line 合并(⌘⌫ 一次一帧)', () => {
        // 模拟两段式 ⌘⌫:先清行,再并入上一行 — 即使近时刻相邻也不粘
        const e = editor('aa\nbb')
        e.type({
            changes: { from: 3, to: 5 }, selection: EditorSelection.single(3),
            userEvent: 'delete.line', annotations: Transaction.time.of(1000),
        })
        expect(e.doc()).toBe('aa\n')
        e.type({
            changes: { from: 2, to: 3 }, selection: EditorSelection.single(2),
            userEvent: 'delete.line', annotations: Transaction.time.of(1010),
        })
        expect(e.doc()).toBe('aa')
        expect(undoDepth(e.state)).toBe(2)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('aa\n')
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('aa\nbb')
    })

    it('input.type 与 delete.line 不交叉合并', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'hi' }, userEvent: 'input.type', annotations: Transaction.time.of(1000) })
        e.type({
            changes: { from: 0, to: 2 }, selection: EditorSelection.single(0),
            userEvent: 'delete.line', annotations: Transaction.time.of(1010),
        })
        expect(undoDepth(e.state)).toBe(2)
    })

    it('语法断点:// 后正文不与注释符合并 — undo 回到 //', () => {
        const e = editor('')
        // 逐字敲 // 123(近时刻,本会并成一坨;语法断点切断)
        e.type({ changes: { from: 0, insert: '/' }, selection: EditorSelection.single(1), userEvent: 'input.type', annotations: Transaction.time.of(1000) })
        e.type({ changes: { from: 1, insert: '/' }, selection: EditorSelection.single(2), userEvent: 'input.type', annotations: Transaction.time.of(1010) })
        expect(e.doc()).toBe('//')
        e.type({ changes: { from: 2, insert: ' ' }, selection: EditorSelection.single(3), userEvent: 'input.type', annotations: Transaction.time.of(1020) })
        e.type({ changes: { from: 3, insert: '1' }, selection: EditorSelection.single(4), userEvent: 'input.type', annotations: Transaction.time.of(1030) })
        e.type({ changes: { from: 4, insert: '2' }, selection: EditorSelection.single(5), userEvent: 'input.type', annotations: Transaction.time.of(1040) })
        e.type({ changes: { from: 5, insert: '3' }, selection: EditorSelection.single(6), userEvent: 'input.type', annotations: Transaction.time.of(1050) })
        expect(e.doc()).toBe('// 123')
        // 正文一帧
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('//')
        // 注释符一帧(可能 / 与 / 已合并)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('')
    })

    it('缩进后 // 仍触发语法断点', () => {
        const e = editor('    ')
        e.type({ changes: { from: 4, insert: '/' }, selection: EditorSelection.single(5), userEvent: 'input.type', annotations: Transaction.time.of(2000) })
        e.type({ changes: { from: 5, insert: '/' }, selection: EditorSelection.single(6), userEvent: 'input.type', annotations: Transaction.time.of(2010) })
        e.type({ changes: { from: 6, insert: 'x' }, selection: EditorSelection.single(7), userEvent: 'input.type', annotations: Transaction.time.of(2020) })
        expect(e.doc()).toBe('    //x')
        e.undo()
        expect(e.doc()).toBe('    //')
    })
})

describe('completedSyntaxStop', () => {
    it('// 在行首(可有空白)为 true', () => {
        let s = EditorState.create({ doc: '', extensions: history() })
        const tr = s.update({
            changes: { from: 0, insert: '//' },
            selection: EditorSelection.single(2),
            userEvent: 'input.type',
        })
        expect(completedSyntaxStop(tr)).toBe(true)
    })

    it('正文中间的 // 不算(行首空白后不是仅 //)', () => {
        let s = EditorState.create({ doc: 'x', extensions: history() })
        const tr = s.update({
            changes: { from: 1, insert: '//' },
            selection: EditorSelection.single(3),
            userEvent: 'input.type',
        })
        // token = 'x//' ≠ '//'
        expect(completedSyntaxStop(tr)).toBe(false)
    })
})

describe('history —— isolate 强制断组', () => {
    it('isolateHistory=before 阻止与前组合并', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(1000) })
        e.type({
            changes: { from: 1, insert: 'b' },
            userEvent: 'input.type',
            annotations: [Transaction.time.of(1005), isolateHistory.of('before')],
        })
        expect(undoDepth(e.state)).toBe(2)
    })

    it('isolateHistory=after 阻止与后组合并', () => {
        const e = editor('')
        e.type({
            changes: { from: 0, insert: 'a' },
            userEvent: 'input.type',
            annotations: [Transaction.time.of(1000), isolateHistory.of('after')],
        })
        e.type({
            changes: { from: 1, insert: 'b' },
            userEvent: 'input.type',
            annotations: Transaction.time.of(1005),
        })
        expect(undoDepth(e.state)).toBe(2)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('a')
    })

    it('整篇替换 isolate full 后，undo 打字不撤回到空文档', () => {
        const e = editor('')
        e.type({
            changes: { from: 0, to: 0, insert: 'LOADED\nfile\n' },
            annotations: [Transaction.time.of(0), isolateHistory.of('full')],
        })
        e.type({
            changes: { from: 0, insert: 'x' },
            userEvent: 'input.type',
            annotations: Transaction.time.of(100),
        })
        expect(e.doc().startsWith('xLOADED')).toBe(true)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('LOADED\nfile\n')
    })
})

describe('history —— remote(addToHistory=false)只映射不入栈', () => {
    it('远程变更不进 undo 栈,但本地 undo 经映射仍命中正确位置', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'local' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        // 远程在头部插入,不入历史
        e.type({ changes: { from: 0, insert: 'REMOTE' }, annotations: Transaction.addToHistory.of(false) })
        expect(e.doc()).toBe('REMOTElocal')
        expect(undoDepth(e.state)).toBe(1)
        expect(e.undo()).toBe(true)
        // 只撤销本地的 'local',远程保留
        expect(e.doc()).toBe('REMOTE')
    })
})

describe('history —— selection-only 历史', () => {
    it('undoSelection 回到编辑前选区', () => {
        const e = editor('hello')
        e.type({
            changes: { from: 5, insert: '!' },
            selection: EditorSelection.single(6),
            userEvent: 'input.type',
            annotations: Transaction.time.of(0),
        })
        expect(e.doc()).toBe('hello!')
        expect(e.undoSelection()).toBe(true)
        expect(e.doc()).toBe('hello')
    })
})

describe('history —— 可监测公理:toJSON/fromJSON 双射 + 跨序列化重放', () => {
    it('historyField 序列化后反序列化,undo 行为等价', () => {
        const e = editor('', { newGroupDelay: 500 })
        e.type({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type', annotations: Transaction.time.of(2000) })

        const json = e.state.toJSON({ history: historyField })
        // 纯 JSON,可经 structuredClone / JSON.parse(JSON.stringify) 往返
        const round = JSON.parse(JSON.stringify(json))

        let restored = EditorState.fromJSON(round, { extensions: history({ newGroupDelay: 500 }) }, { history: historyField })
        const dispatch = (tr: Transaction) => {
            restored = tr.apply()
        }
        expect(restored.doc.toString()).toBe('ab')
        expect(undoDepth(restored)).toBe(2)

        // 重放 undo:与原态一致地分两步回到空
        expect(undo({ state: restored, dispatch })).toBe(true)
        expect(restored.doc.toString()).toBe('a')
        expect(undo({ state: restored, dispatch })).toBe(true)
        expect(restored.doc.toString()).toBe('')
    })

    it('toJSON 出纯结构(done/undone 为数组)', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type', annotations: Transaction.time.of(0) })
        const hist = historyField.spec.toJSON!(e.state.field(historyField), e.state) as { done: unknown[], undone: unknown[] }
        expect(Array.isArray(hist.done)).toBe(true)
        expect(hist.done.length).toBe(1)
        expect(Array.isArray(hist.undone)).toBe(true)
        expect(hist.undone.length).toBe(0)
    })
})

// ChangeSet 直接构造的健全性(给 isAdjacent 喂真 desc)
describe('history —— 相邻性判定基于变更区间', () => {
    it('连续 delete.backward 合并', () => {
        const e = editor('abc')
        e.type({ changes: { from: 2, to: 3 }, userEvent: 'delete.backward', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 1, to: 2 }, userEvent: 'delete.backward', annotations: Transaction.time.of(10) })
        expect(e.doc()).toBe('a')
        expect(undoDepth(e.state)).toBe(1)
        expect(e.undo()).toBe(true)
        expect(e.doc()).toBe('abc')
    })

    it('changeSet.of 与 desc 自洽(回归保护)', () => {
        const cs = ChangeSet.of({ from: 0, insert: 'hi' }, 0)
        expect(cs.newLength).toBe(2)
    })
})

describe('history —— 组字与打字同组(Monaco compositionType = TypingOther)', () => {
    it('组字「你好」后接着打 abc,一次 undo 全撤', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: '你好' }, selection: EditorSelection.cursor(2), userEvent: 'input.type.compose', annotations: Transaction.time.of(0) })
        for (const [i, ch] of [...'abc'].entries())
            e.type({ changes: { from: 2 + i, insert: ch }, selection: EditorSelection.cursor(3 + i), userEvent: 'input.type', annotations: Transaction.time.of(10 + i) })
        expect(e.doc()).toBe('你好abc')
        e.undo()
        expect(e.doc()).toBe('')
    })
    it('组字后打空格仍切组(同字母后打空格)', () => {
        const e = editor('')
        e.type({ changes: { from: 0, insert: '你好' }, selection: EditorSelection.cursor(2), userEvent: 'input.type.compose', annotations: Transaction.time.of(0) })
        e.type({ changes: { from: 2, insert: ' ' }, selection: EditorSelection.cursor(3), userEvent: 'input.type', annotations: Transaction.time.of(10) })
        e.type({ changes: { from: 3, insert: 'x' }, selection: EditorSelection.cursor(4), userEvent: 'input.type', annotations: Transaction.time.of(20) })
        e.undo()
        expect(e.doc()).toBe('你好')
    })
})
