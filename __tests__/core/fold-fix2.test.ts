// 第 2 轮 F6b V6:Monaco 折叠起始行整行铺 folded-background(editor.foldBackground);被外层折叠藏起来的内层不铺
import { describe, it, expect } from 'vitest'
import { EditorState, type Transaction } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { foldAll, foldDecorations, foldField } from '../../src/core/edit/fold'
import { LineDecoration } from '../../src/core/model/decoration'
import { liteMonacoBaseCSS } from '../../src/product/themecss'

describe('折叠起始行底色', () => {
    it('每个可见的折叠起始行一条 cm-foldedBackground 行装饰', () => {
        const doc = 'function a() {\n  function b() {\n    return 1\n  }\n}\nfunction c() {\n  x\n}'
        let s = EditorState.create({ doc, selection: EditorSelection.single(0), extensions: foldField })
        foldAll({ state: s, dispatch: (tr: Transaction) => { s = tr.apply() } })
        const lines: number[] = []
        foldDecorations(s).between(0, s.doc.length, (from, _to, d) => {
            if (d instanceof LineDecoration && d.spec.class === 'cm-foldedBackground') lines.push(s.doc.lineAt(from).number)
        })
        expect(lines).toEqual([1, 6])
        expect(liteMonacoBaseCSS('mac')).toContain(".cm-foldedBackground { background-color: var(")
    })
})
