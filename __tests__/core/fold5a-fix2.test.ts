// 第 2 轮 F5a:折叠后的移动 / 展开 / 编辑保持、到边复位目标列、加光标的主光标、键盘列选择。期望值来自 Monaco 0.52 实测
// (/tmp/lc-hunt/h-host/f04-vertical.ts、f03-edit.ts 慢速版、h-edit/m2-page.ts)
import { describe, expect, it } from 'vitest'
import { EditorState, type StateCommand, type Transaction } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { foldCode, foldField, manualFoldField, revealSelectionFolds, foldable } from '../../src/core/edit/fold'
import { addCursorBelow, cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, insertNewline, moveLineDown, selectLineDown } from '../../src/core/edit/commands'
import { cursorColumnSelectDown, cursorColumnSelectLeft, cursorColumnSelectRight, cursorColumnSelectUp } from '../../src/core/edit/vertical'
import { deleteLine } from '../../src/core/edit/lineedit'
import { history, undo } from '../../src/core/edit/history'

const DOC = 'const a = 1\nfunction f() {\n    const x = 1\n    if (x) {\n        g()\n    }\n    return x\n}\nconst b = 2\n'

function editor(doc: string, line: number, col = 0) {
    let state = EditorState.create({
        doc, extensions: [foldField, manualFoldField, history(), EditorState.allowMultipleSelections.of(true)],
        selection: EditorSelection.cursor(0),
    })
    state = state.update({ selection: EditorSelection.cursor(state.doc.line(line).from + col) }).apply()
    const run = (cmd: StateCommand) => cmd({ state, dispatch: (tr: Transaction) => { state = tr.apply() } })
    const at = () => state.selection.ranges.map(r => {
        const p = (x: number) => { const l = state.doc.lineAt(x); return `${l.number}:${x - l.from}` }
        return r.empty ? p(r.head) : `${p(r.anchor)}→${p(r.head)}`
    }).join(' ')
    const collapsed = () => [...state.field(foldField)].sort((a, b) => a - b).map(n => {
        const f = foldable(state, state.doc.line(n).from)
        return f ? `${n}-${state.doc.lineAt(f.to).number}` : `${n}(ghost)`
    }).join(' ')
    return { run, at, collapsed, get state() { return state } }
}

describe('折叠后移动:跳过藏起的行,不展开', () => {
    it('↓ 从首行跳到块后一行,目标列保留;↑ 回首行', () => {
        const e = editor(DOC, 2, 3)
        e.run(foldCode)
        e.run(cursorLineDown)
        expect(e.at()).toBe('8:1')
        e.run(cursorLineUp)
        expect(e.at()).toBe('2:3')
        expect(e.collapsed()).toBe('2-7')
    })

    it('Shift+↓ 两次:1:0 → 8:0,不展开', () => {
        const e = editor(DOC, 2)
        e.run(foldCode)
        e.run(cursorLineUp)
        e.run(selectLineDown)
        e.run(selectLineDown)
        expect(e.at()).toBe('1:0→8:0')
        expect(revealSelectionFolds(e.state)).toBe(null)
    })

    it('→ 在首行行尾到块后一行行首,← 回首行行尾', () => {
        const e = editor(DOC, 2, 14)
        e.run(foldCode)
        e.run(cursorCharRight)
        expect(e.at()).toBe('8:0')
        e.run(cursorCharLeft)
        expect(e.at()).toBe('2:14')
    })

    it('锚点所在行被藏才展开', () => {
        const e = editor(DOC, 2)
        e.run(foldCode)
        const s = e.state.update({ selection: EditorSelection.range(e.state.doc.line(1).from, e.state.doc.line(4).from) }).apply()
        expect(revealSelectionFolds(s)).toBe(null)
        const t = e.state.update({ selection: EditorSelection.range(e.state.doc.line(4).from, e.state.doc.line(1).from) }).apply()
        expect(revealSelectionFolds(t)?.effects.length).toBe(1)
    })
})

describe('编辑后折叠保持(Monaco FoldingModel.update)', () => {
    it('首行行首回车:折叠跟着首行走到 3-8', () => {
        const e = editor(DOC, 2)
        e.run(foldCode)
        e.run(insertNewline)
        expect(e.collapsed()).toBe('3-8')
    })

    it('Alt+↓ 移首行:3-7', () => {
        const e = editor(DOC, 2)
        e.run(foldCode)
        e.run(moveLineDown)
        expect(e.collapsed()).toBe('3-7')
    })

    it('删掉首行:按映射后的范围留成 recovered 块 2-6;撤销后 3-7', () => {
        const e = editor(DOC, 2)
        e.run(foldCode)
        e.run(deleteLine)
        expect(e.collapsed()).toBe('2-6')
        e.run(undo)
        expect(e.collapsed()).toBe('3-7')
    })

    it('首行行尾回车:光标进了块里,展开', () => {
        const e = editor(DOC, 2, 14)
        e.run(foldCode)
        e.run(insertNewline)
        expect(e.collapsed()).toBe('')
    })
})

describe('上下加光标 / 到边复位', () => {
    it('⌥⌘↓ 后主光标不变', () => {
        const e = editor('a\nb\nc\n', 1)
        e.run(addCursorBelow)
        e.run(addCursorBelow)
        expect(e.state.selection.main.head).toBe(0)
    })

    it('末行再按 ↓:目标列复位成行尾', () => {
        const e = editor('abcdef\nab', 1, 5)
        e.run(cursorLineDown)
        expect(e.at()).toBe('2:2')
        expect(e.run(cursorLineDown)).toBe(true)
        e.run(cursorLineUp)
        expect(e.at()).toBe('1:2')
    })
})

describe('键盘列选择(Monaco ColumnSelection)', () => {
    it('↓↓ 每行一个光标,主选区在起点那行;→ 接着上一次的框', () => {
        const e = editor('line 1 abc\nline 2 abc\nline 3 abc\n', 1, 3)
        e.run(cursorColumnSelectDown)
        e.run(cursorColumnSelectDown)
        expect(e.at()).toBe('1:3 2:3 3:3')
        expect(e.state.selection.mainIndex).toBe(0)
        e.run(cursorColumnSelectRight)
        expect(e.at()).toBe('1:3→1:4 2:3→2:4 3:3→3:4')
    })

    it('往上框、往左:反向选区;框外的短行跳过', () => {
        const e = editor('line 2 abc\nx\nline 4 abc\n', 3, 6)
        e.run(cursorColumnSelectUp)
        e.run(cursorColumnSelectUp)
        e.run(cursorColumnSelectLeft)
        expect(e.at()).toBe('1:6→1:5 3:6→3:5')
        expect(e.state.doc.lineAt(e.state.selection.main.head).number).toBe(3)
    })

    it('按可见列:Tab 和全角字符', () => {
        const e = editor('\tab\n中文x\n', 1, 1)
        e.run(cursorColumnSelectDown)
        expect(e.at()).toBe('1:1 2:2')
    })
})
