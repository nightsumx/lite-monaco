// 第 2 轮 F8:diff 编辑器照 Monaco 0.52。期望值来自 h-host/d01-algo.ts 在对照页的 Monaco 实测。
import { describe, expect, it } from 'vitest'
import { computeLineRangeMappings } from '../../src/core/diff/linediff'
import { DiffEditor } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

function fmt(o: string, m: string, opts?: { ignoreTrimWhitespace?: boolean }) {
    const pos = (text: string, off: number) => {
        let line = 1, col = 1
        for (let i = 0; i < off; i++) {
            if (text[i] === '\n') { line++; col = 1 } else col++
        }
        return `${line}:${col}`
    }
    return computeLineRangeMappings(o, m, opts).map(x => `o[${x.originalStart},${x.originalEnd}) m[${x.modifiedStart},${x.modifiedEnd}) `
        + x.innerChanges.map(c => `${pos(o, c.originalFrom)}-${pos(o, c.originalTo)}→${pos(m, c.modifiedFrom)}-${pos(m, c.modifiedTo)}`).join(' '))
}

describe('computeLineRangeMappings = Monaco advanced(d01)', () => {
    const cases: [string, string, string, string[]][] = [
        ['单字符改', 'const a = 1\nconst b = 2\n', 'const a = 1\nconst b = 3\n', ['o[2,3) m[2,3) 2:11-2:12→2:11-2:12']],
        ['行内插词', 'foo(bar, baz)\n', 'foo(bar, qux, baz)\n', ['o[1,2) m[1,2) 1:9-1:9→1:9-1:14']],
        ['多行块替换', 'a\nfunction x() {\n  return 1\n}\nz\n', 'a\nclass Y {\n  m() {}\n  n() {}\n}\nz\n',
            ['o[2,4) m[2,5) 2:1-2:11→2:1-3:4 2:15-3:11→3:8-4:9']],
        ['纯插入', 'a\nb\nc\n', 'a\nb\nNEW1\nNEW2\nc\n', ['o[3,3) m[3,5) 3:1-3:1→3:1-5:1']],
        ['纯删除', 'a\nb\nDEL1\nDEL2\nc\n', 'a\nb\nc\n', ['o[3,5) m[3,3) 3:1-5:1→3:1-3:1']],
        ['移动块', 'one\ntwo\nthree\nfour\nfive\nsix\n', 'four\nfive\none\ntwo\nthree\nsix\n',
            ['o[1,1) m[1,3) 1:1-1:1→1:1-3:1', 'o[4,6) m[6,6) 4:1-6:1→6:1-6:1']],
        ['行首缩进变', 'if (x) {\nfoo()\n}\n', 'if (x) {\n    foo()\n}\n', []],
        ['行尾空白变', 'a\nb  \nc\n', 'a\nb\nc\n', []],
        ['CRLF vs LF', 'a\r\nb\r\nc\r\n', 'a\nb\nc\n', []],
        ['词级改', 'const greeting = "hello world"\n', 'const greet = "hello there world"\n',
            ['o[1,2) m[1,2) 1:12-1:15→1:12-1:12 1:24-1:24→1:21-1:27']],
        ['空行插入', 'a\n\nb\n', 'a\n\n\nb\n', ['o[2,2) m[2,3) 2:1-2:1→2:1-3:1']],
        ['括号对齐', '}\n}\nfoo\n}\n', '}\nbar\n}\nfoo\n}\n', ['o[2,2) m[2,3) 2:1-2:1→2:1-3:1']],
    ]
    for (const [name, o, m, want] of cases) it(name, () => expect(fmt(o, m)).toEqual(want))

    it('ignoreTrimWhitespace:false 时缩进变化算一处', () => {
        expect(fmt('if (x) {\nfoo()\n}\n', 'if (x) {\n    foo()\n}\n', { ignoreTrimWhitespace: false }))
            .toEqual(['o[2,3) m[2,3) 2:1-2:1→2:1-2:5'])
    })
})

function mount(original: string, modified: string, extra: Partial<ConstructorParameters<typeof DiffEditor>[0]> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = new DiffEditor({ parent, highlighter: fakeHl(), lang: 'text', original, modified, ...extra })
    return { d, done: () => { d.destroy(); parent.remove() } }
}

describe('DiffEditor 照 Monaco', () => {
    it('H6 setModels 后撤销栈属于新模型', () => {
        const { d, done } = mount('a\n', 'b\n')
        d.modifiedView.dispatch(d.modifiedView.state.update({ changes: { from: 0, insert: 'X' }, userEvent: 'input' }))
        d.setModels('left\n', 'right\n')
        const ev = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true })
        d.modifiedView.contentDOM.dispatchEvent(ev)
        expect(d.getModified()).toBe('right\n')
        done()
    })

    it('H9 第一次 goToNextChange 落在第一处改动', () => {
        const { d, done } = mount('a\nb\nc\nd\n', 'A\nb\nC\nd\n')
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.doc.lineAt(d.modifiedView.state.selection.main.head).number).toBe(3)
        done()
    })

    it('H9 光标在第一处改动之前时,下一处是第一处;之后再回到第一处靠 prev', () => {
        const { d, done } = mount('x\na\nb\nc\nd\n', 'x\nA\nb\nC\nd\n')
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.doc.lineAt(d.modifiedView.state.selection.main.head).number).toBe(2)
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.doc.lineAt(d.modifiedView.state.selection.main.head).number).toBe(4)
        expect(d.goToNextChange()).toBe(true)
        expect(d.modifiedView.state.doc.lineAt(d.modifiedView.state.selection.main.head).number).toBe(2)
        expect(d.goToPrevChange()).toBe(true)
        expect(d.modifiedView.state.doc.lineAt(d.modifiedView.state.selection.main.head).number).toBe(4)
        done()
    })

    it('H3 Alt+↓ 只挪行,不跳改动;F7 = 无障碍 diff 查看器(Monaco AccessibleDiffViewerNext),不是跳改动', () => {
        const { d, done } = mount('a\nb\nc\nd\n', 'a\nb\nc\nD\n')
        const v = d.modifiedView
        v.dispatch(v.state.update({ selection: { anchor: 0 } }))
        v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }))
        expect(d.getModified()).toBe('b\na\nc\nD\n')
        expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(2)
        const f7 = new KeyboardEvent('keydown', { key: 'F7', code: 'F7', bubbles: true, cancelable: true })
        v.contentDOM.dispatchEvent(f7)
        expect(f7.defaultPrevented).toBe(true)
        expect(d.dom.querySelector('.accessibleDiffViewer .monaco-diff-editor, .accessibleDiffViewer .diff-review')).not.toBeNull()
        done()
    })

    it('H7 纯删除块也有 Revert Block,还原出被删的行', () => {
        const { d, done } = mount('a\nb\nDEL1\nDEL2\nc\n', 'a\nb\nc\n')
        const btns = d.dom.querySelectorAll('.gutter .gutterItem .action-label.codicon-arrow-right')
        expect(btns.length).toBe(1)
        expect(btns[0].getAttribute('aria-label')).toBe('Revert Block')
        ;(btns[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(d.getModified()).toBe('a\nb\nDEL1\nDEL2\nc\n')
        done()
    })

    it('H7 revert 照 Monaco:按 mapping 的行区间整段替换(d04 文本)', () => {
        const o = 'keep 1\nfoo(bar, baz)\nkeep 3\nDEL 4\nDEL 5\nkeep 6\nkeep 7\n'
        const m = 'keep 1\nfoo(bar, qux, baz)\nkeep 3\nkeep 6\nINS X\nINS Y\nkeep 7\n'
        const { d, done } = mount(o, m)
        expect(d.getMappings().length).toBe(3)
        d.revertMapping(d.getMappings()[0])
        expect(d.getModified()).toBe('keep 1\nfoo(bar, baz)\nkeep 3\nkeep 6\nINS X\nINS Y\nkeep 7\n')
        done()
    })

    it('H10 聚焦 modified 时字级高亮照样重算', async () => {
        const { d, done } = mount('const a = 1\n', 'const a = 1\n', { recomputeDebounceMs: 0 })
        const v = d.modifiedView
        v.contentDOM.focus()
        expect(v.contentDOM.ownerDocument.activeElement).toBe(v.contentDOM)
        v.dispatch(v.state.update({ changes: { from: 10, to: 11, insert: '2' }, userEvent: 'input' }))
        await new Promise(r => setTimeout(r, 20))
        expect(v.contentDOM.querySelectorAll('.char-insert').length).toBeGreaterThan(0)
        done()
    })

    it('H21 纯插入行整行打 char-insert 层;空范围 diff-range-empty', () => {
        const { d, done } = mount('a\nb\nc\n', 'a\nb\nNEW1\nNEW2\nc\n')
        const ins = d.modifiedView.contentDOM.querySelectorAll('.char-insert')
        expect([...ins].map(e => e.textContent).join('|')).toBe('NEW1|NEW2')
        done()
        const w = mount('foo(bar, baz)\n', 'foo(bar, qux, baz)\n')
        expect(w.d.originalView.contentDOM.querySelectorAll('.char-delete.diff-range-empty').length).toBe(1)
        w.done()
    })
})
