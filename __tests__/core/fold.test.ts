import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../src/core/model/state'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { foldField, extraFoldField, manualFoldField, setExtraFolds, foldable, collectFoldableLines, foldAll, unfoldAll, foldCode, unfoldCode, toggleFold, foldRecursively, unfoldRecursively, gotoNextFold, gotoPrevFold, gotoParentFold, foldLevel, foldFromSelection, foldDecorations, foldGutterSpec, transactionChangesFold } from '../../src/core/edit/fold'

function editor(doc: string, sel = EditorSelection.single(0)) {
    let state = EditorState.create({
        doc,
        selection: sel,
        extensions: [foldField, EditorState.allowMultipleSelections.of(true)],
    })
    const dispatch = (tr: Transaction) => { state = tr.apply() }
    return {
        get state() { return state },
        run(cmd: (t: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean) {
            return cmd({ state, dispatch })
        },
        folded() { return state.field(foldField) as Set<number> },
    }
}

describe('foldable (缩进判断)', () => {
    it('有更深行的可折叠', () => {
        const s = EditorState.create({ doc: 'function f() {\n  return 1\n}\n' })
        const f = foldable(s, s.doc.line(1).to)
        expect(f).not.toBeNull()
        expect(f!.to).toBe(s.doc.line(2).to)
    })

    it('无更深行不可折叠', () => {
        const s = EditorState.create({ doc: 'hello\nworld\n' })
        const f = foldable(s, s.doc.line(1).to)
        expect(f).toBeNull()
    })

    it('空行不折叠', () => {
        const s = EditorState.create({ doc: '\n\n' })
        const f = foldable(s, 0)
        expect(f).toBeNull()
    })

    it('#region / #endregion 同缩进也可折', () => {
        const s = EditorState.create({ doc: '// #region foo\nconst a = 1\nconst b = 2\n// #endregion\n' })
        const f = foldable(s, s.doc.line(1).from)
        expect(f).not.toBeNull()
        expect(f!.from).toBe(s.doc.line(1).to)
        expect(f!.to).toBe(s.doc.line(4).to)
    })

    it('#region 无闭合不可折', () => {
        const s = EditorState.create({ doc: '// #region foo\nconst a = 1\n' })
        expect(foldable(s, s.doc.line(1).from)).toBeNull()
    })

    it('extraFold 补上缩进看不出的块', () => {
        const doc = 'import a\nimport b\n'
        let state = EditorState.create({
            doc,
            extensions: [foldField, extraFoldField],
        })
        expect(foldable(state, 0)).toBeNull()
        const to = state.doc.line(2).to
        state = state.update({
            effects: setExtraFolds.of([{ line: 1, from: state.doc.line(1).to, to }]),
        }).apply()
        const f = foldable(state, 0)
        expect(f).not.toBeNull()
        expect(f!.to).toBe(to)
        expect(collectFoldableLines(state)).toContain(1)
    })

    it('嵌套 region 配对外层', () => {
        const s = EditorState.create({
            doc: '//#region a\n//#region b\nx\n//#endregion\ny\n//#endregion\n',
        })
        const outer = foldable(s, s.doc.line(1).from)!
        expect(outer.to).toBe(s.doc.line(6).to)
        const inner = foldable(s, s.doc.line(2).from)!
        expect(inner.to).toBe(s.doc.line(4).to)
    })
})

describe('collectFoldableLines', () => {
    it('与逐行 foldable 同集', () => {
        const docs = [
            'function f() {\n  return 1\n}\n',
            'if (a)\n  if (b)\n    x\n  y\nz\n',
            'hello\nworld\n',
            'a\n\n  b\n\nc\n',
            'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n',
            '// #region a\nconst x = 1\n// #endregion\n',
        ]
        for (const doc of docs) {
            const s = EditorState.create({ doc })
            const brute: number[] = []
            for (let n = 1; n <= s.doc.lines; n++) {
                if (foldable(s, s.doc.line(n).from)) brute.push(n)
            }
            expect(collectFoldableLines(s).sort((a, b) => a - b)).toEqual(brute)
        }
    })

    it('foldAll 用一遍扫描，结果行 = foldable 集', () => {
        const doc = 'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n'
        const e = editor(doc)
        e.run(foldAll)
        const s0 = EditorState.create({ doc })
        const expectLines: number[] = []
        for (let n = 1; n <= s0.doc.lines; n++) {
            if (foldable(s0, s0.doc.line(n).from)) expectLines.push(n)
        }
        expect([...e.folded()].sort((a, b) => a - b)).toEqual(expectLines)
    })
})

describe('fold/unfold 命令', () => {
    it('fold 事务改折叠块；纯选区事务不改', () => {
        const e = editor('function f() {\n  return 1\n}\n')
        let last!: Transaction
        expect(foldCode({
            state: e.state,
            dispatch: tr => { last = tr },
        })).toBe(true)
        expect(transactionChangesFold(last)).toBe(true)
        const sel = e.state.update({ selection: { anchor: 0 } })
        expect(transactionChangesFold(sel)).toBe(false)
    })

    it('foldCode: 折叠光标所在行', () => {
        const e = editor('function f() {\n  return 1\n}\n', EditorSelection.single(14))
        expect(e.run(foldCode)).toBe(true)
        expect(e.folded().has(1)).toBe(true)
        // Monaco setCollapseStateUp:已折、又没有未折的父块 → 什么都不做
        expect(e.run(foldCode)).toBe(false)
        expect(e.folded().has(1)).toBe(true)
    })

    it('未折叠时 unfoldCode 返 false', () => {
        const e = editor('function f() {\n  return 1\n}\n')
        expect(e.run(unfoldCode)).toBe(false)
    })

    it('unfoldCode: 展开当前行', () => {
        const e = editor('function f() {\n  return 1\n}\n', EditorSelection.single(14))
        e.run(foldCode)
        expect(e.folded().has(1)).toBe(true)
        expect(e.run(unfoldCode)).toBe(true)
        expect(e.folded().has(1)).toBe(false)
    })

    it('toggleFold: 折叠→展开切换', () => {
        const e = editor('function f() {\n  return 1\n}\n', EditorSelection.single(14))
        expect(e.run(toggleFold)).toBe(true)
        expect(e.folded().has(1)).toBe(true)
        expect(e.run(toggleFold)).toBe(true)
        expect(e.folded().has(1)).toBe(false)
    })

    it('foldRecursively 把当前块和内层一起折', () => {
        const e = editor(
            'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n',
            EditorSelection.single(0),
        )
        expect(e.run(foldRecursively)).toBe(true)
        expect(e.folded().has(1)).toBe(true)
        expect(e.folded().has(2)).toBe(true)
        expect(e.run(foldRecursively)).toBe(false)
        expect(e.run(unfoldRecursively)).toBe(true)
        expect(e.folded().size).toBe(0)
    })

    it('gotoNextFold / gotoPrevFold / gotoParentFold', () => {
        const doc = 'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n'
        const e = editor(doc, EditorSelection.single(0))
        expect(e.run(gotoNextFold)).toBe(true)
        expect(e.state.doc.lineAt(e.state.selection.main.head).number).toBe(2)
        expect(e.run(gotoNextFold)).toBe(false)
        expect(e.run(gotoPrevFold)).toBe(true)
        expect(e.state.doc.lineAt(e.state.selection.main.head).number).toBe(1)
        expect(e.run(gotoPrevFold)).toBe(false)
        e.run(gotoNextFold)
        expect(e.run(gotoParentFold)).toBe(true)
        expect(e.state.doc.lineAt(e.state.selection.main.head).number).toBe(1)
        expect(e.run(gotoParentFold)).toBe(false)
    })

    it('foldFromSelection 把选区折起来', () => {
        let state = EditorState.create({
            doc: 'a\nb\nc\n',
            selection: EditorSelection.single(0, 6),
            extensions: [foldField, manualFoldField],
        })
        expect(foldFromSelection({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect((state.field(foldField) as Set<number>).has(1)).toBe(true)
        const f = foldable(state, 0)
        expect(f).not.toBeNull()
        expect(f!.to).toBe(state.doc.line(3).to)
        expect(foldFromSelection({
            state: EditorState.create({ doc: 'a\nb', selection: EditorSelection.single(0) }),
            dispatch: () => {},
        })).toBe(false)
    })

    it('foldLevel(2) 只折内层', () => {
        const e = editor(
            'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n',
            EditorSelection.single(0),
        )
        expect(e.run(foldLevel(2))).toBe(true)
        expect(e.folded().has(1)).toBe(false)
        expect(e.folded().has(2)).toBe(true)
        expect(e.run(foldLevel(2))).toBe(false)
    })

    it('无可折叠行:foldCode 返回 false', () => {
        const e = editor('hello\nworld\n', EditorSelection.single(0))
        expect(e.run(foldCode)).toBe(false)
    })

    it('无折叠时 unfoldAll 返 false', () => {
        const e = editor('function f() {\n  return 1\n}\n')
        expect(e.run(unfoldAll)).toBe(false)
        expect(e.run(foldAll)).toBe(true)
        expect(e.run(unfoldAll)).toBe(true)
        expect(e.folded().size).toBe(0)
    })

    it('折后在折叠行前插一行：折叠行号下移', () => {
        const doc = 'x\nfunction f() {\n  return 1\n}\n'
        let state = EditorState.create({
            doc,
            selection: EditorSelection.single(doc.indexOf('function')),
            extensions: [foldField],
        })
        expect(foldCode({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect((state.field(foldField) as Set<number>).has(2)).toBe(true)
        state = state.applyTransaction(state.update({ changes: { from: 0, insert: 'pre\n' } }))
        const folded = state.field(foldField) as Set<number>
        expect(folded.has(3)).toBe(true)
        expect(folded.has(2)).toBe(false)
    })
})

describe('foldDecorations', () => {
    it('无折叠:返回空 DecorationSet', () => {
        const s = EditorState.create({ doc: 'hello', extensions: foldField })
        const ds = foldDecorations(s)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(0)
    })

    it('多折叠按 from 排序再 add', () => {
        const doc = 'function a() {\n  function b() {\n    return 1\n  }\n  return 2\n}\n'
        const e = editor(doc)
        e.run(foldAll)
        expect(() => foldDecorations(e.state)).not.toThrow()
        let n = 0
        foldDecorations(e.state).between(0, e.state.doc.length, () => { n++ })
        expect(n).toBeGreaterThan(1)
    })

    it('有折叠:产出 replace decoration 覆盖折叠区域', () => {
        let s = EditorState.create({
            doc: 'f() {\n  x\n}\n',
            selection: EditorSelection.single(4),
            extensions: foldField,
        })
        const dispatch = (tr: Transaction) => { s = tr.apply() }
        foldCode({ state: s, dispatch })
        const ds = foldDecorations(s)
        let count = 0
        // 另有一条起始行底色的行装饰(Monaco folded-background,见 fold-fix2.test.ts),这里只数 replace
        ds.between(0, 15, (f, t) => { if (t > f) count++ })
        expect(count).toBe(1)
    })
})

// foldGutter 箭头列的注入契约（EditorView 不硬依赖 fold.ts，走 foldGutterSpec 传入）。
describe('foldGutterSpec —— 箭头列注入契约', () => {
    function spec(doc: string) {
        let state = EditorState.create({ doc, extensions: foldField })
        const s = foldGutterSpec((tr: Transaction) => { state = tr.apply() })
        return { s, get state() { return state } }
    }

    it('foldableAt: 可折叠行 true，不可折叠行 false', () => {
        const { s, state } = spec('f() {\n  x\n}\nplain\n')
        expect(s.foldableAt(state, state.doc.line(1).from)).toBe(true)
        expect(s.foldableAt(state, state.doc.line(4).from)).toBe(false)
    })

    it('isFolded: 初始未折叠，toggle 后已折叠', () => {
        const t = spec('f() {\n  x\n}\n')
        expect(t.s.isFolded(t.state, 1)).toBe(false)
        t.s.toggle(t.state, 1)
        expect(t.s.isFolded(t.state, 1)).toBe(true)
    })

    it('toggle 对称：再 toggle 展开', () => {
        const t = spec('f() {\n  x\n}\n')
        t.s.toggle(t.state, 1)
        expect(t.s.isFolded(t.state, 1)).toBe(true)
        t.s.toggle(t.state, 1)
        expect(t.s.isFolded(t.state, 1)).toBe(false)
    })
})

// 行号槽 × 折叠:gutter 必须与 content/heightMap 同源(逐视觉块,非逐 doc 行),
// 否则折叠区隐藏行仍各出一个行号 → 错位 + 幽灵空行(截图 bug)。
describe('foldGutter × content —— gutter 逐视觉块不逐 doc 行', () => {
    function view(doc: string) {
        let state = EditorState.create({
            doc,
            extensions: [foldField, EditorState.allowMultipleSelections.of(true)],
        })
        const v = new EditorView({
            state,
            lineNumbers: true,
            decorationProviders: [foldDecorations],
            foldGutter: foldGutterSpec((tr: Transaction) => {
                state = tr.apply()
                v.update(tr)
            }),
        })
        return v
    }

    it('fold 重建 heightMap，查找类 effect 不走这条', () => {
        const v = view('function f() {\n  a\n  b\n}\n')
        const hm = v.heightMap
        foldCode({ state: v.state, dispatch: tr => v.dispatch(tr) })
        expect(v.heightMap).not.toBe(hm)
    })

    it('折叠后 gutter 行数 = content 视觉行数(隐藏行不占行号)', () => {
        const v = view('function f() {\n  a\n  b\n  c\n}\nafter\n')
        const gutter = v.dom.querySelector('.cm-gutters')!
        const lines0 = v.contentDOM.querySelectorAll('.cm-line').length
        expect(gutter.querySelectorAll('.cm-gutterElement').length).toBe(lines0)

        // 折叠第 1 行:内部 a/b/c 塌进 ⋯,content 视觉行数减少
        v.dispatch(v.state.update({ effects: [] }))
        foldCode({ state: v.state, dispatch: tr => v.dispatch(tr) })
        const lines1 = v.contentDOM.querySelectorAll('.cm-line').length
        expect(lines1).toBeLessThan(lines0)
        expect(gutter.querySelectorAll('.cm-gutterElement').length).toBe(lines1)
    })

    it('gutter 首个行号仍是 1,折叠不错位行号语义', () => {
        const v = view('function f() {\n  a\n  b\n}\nafter\n')
        foldCode({ state: v.state, dispatch: tr => v.dispatch(tr) })
        const first = v.dom.querySelector('.cm-gutters .cm-lineNumber')!
        expect(first.textContent).toBe('1')
    })
})

describe('R3 Fold Level / Recursively 对齐 Monaco(foldingModel.setCollapseStateAtLevel / LevelsDown)', () => {
    const DOC3 = 'function a() {\n  function b() {\n    if (x) {\n      y()\n    }\n  }\n  function c() {\n    z()\n  }\n}\n'
    it('Fold Level 2 只折恰好第 2 层(不折第 3 层)', () => {
        const e = editor(DOC3, EditorSelection.single(0))
        expect(e.run(foldLevel(2))).toBe(true)
        expect([...e.folded()].sort()).toEqual([2, 7])
    })
    it('Fold Level 跳过包含选区所在行的块', () => {
        const e = editor(DOC3, EditorSelection.single(DOC3.indexOf('z()')))
        expect(e.run(foldLevel(2))).toBe(true)
        expect([...e.folded()]).toEqual([2])
    })
    it('Fold Recursively:光标在块体里也折包住它的最内层块和其内层', () => {
        const e2 = editor(DOC3, EditorSelection.single(DOC3.split("\n").slice(0, 4).join("\n").length + 3)) // 第 5 行 `    }`:属于第 2 行的块
        expect(e2.run(foldRecursively)).toBe(true)
        expect([...e2.folded()].sort()).toEqual([2, 3])
        expect(e2.run(unfoldRecursively)).toBe(true)
        expect(e2.folded().size).toBe(0)
    })
})
