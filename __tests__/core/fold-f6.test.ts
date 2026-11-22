// F6 P1-8 折叠:TS outlining 块不吞 `}` 行;点 ⋯ 展开;箭头只在行号区悬停时显示(折起的常显)。
// 浏览器对 Monaco 比对见 /tmp/lc-hunt/f6/mouse.ts「点 ⋯ 占位展开」、/tmp/lc-hunt/f6/foldhover.ts
import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { foldField, extraFoldField, setExtraFolds, foldable, foldCode, unfoldEffectAt } from '../../src/core/edit/fold'
import { liteMonacoBaseCSS } from '../../src/product/themecss'

const withExtra = (doc: string, line: number, endLine: number) => {
    const s = EditorState.create({ doc, extensions: [foldField, extraFoldField] })
    return s.update({ effects: setExtraFolds.of([{ line, from: s.doc.line(line).to, to: s.doc.line(endLine).to }]) }).apply()
}

describe('TS 块折叠范围', () => {
    it('outlining 给到 `}` 行时止于前一行(`}` 行折起后仍可见)', () => {
        // 缩进看不出块(体和头同缩进),只能靠 outlining
        const doc = 'const o = {\na: 1,\nb: 2,\n}\nx'
        const s = withExtra(doc, 1, 4)
        const f = foldable(s, 0)!
        expect(f.to).toBe(s.doc.line(3).to)
    })

    it('`});` / `]` 一样处理;不以括号开头的末行不动', () => {
        const a = withExtra('call(() => {\nx()\n});\ny', 1, 3)
        expect(foldable(a, 0)!.to).toBe(a.doc.line(2).to)
        const b = withExtra('/**\n * doc\n */\nfunction f() {}', 1, 3)
        expect(foldable(b, 0)!.to).toBe(b.doc.line(3).to)
    })

    it('去掉 `}` 后只剩起始行 → 不可折', () => {
        const s = withExtra('f({\n})\nz', 1, 2)
        expect(foldable(s, 0)).toBeNull()
    })
})

describe('点 ⋯ 展开', () => {
    it('unfoldEffectAt:落在已折范围里给 unfold effect,范围外给 null', () => {
        let s = EditorState.create({ doc: 'function f() {\n    a()\n}\nz', extensions: [foldField, extraFoldField] })
        foldCode({ state: s, dispatch: tr => { s = tr.apply() } })
        expect(s.field(foldField).has(1)).toBe(true)
        const ph = s.doc.line(1).to
        const eff = unfoldEffectAt(s, ph)!
        expect(eff).not.toBeNull()
        s = s.update({ effects: eff }).apply()
        expect(s.field(foldField).size).toBe(0)
        expect(unfoldEffectAt(s, ph)).toBeNull()
    })
})

describe('折叠箭头显隐 CSS', () => {
    it('默认透明,行号区悬停显示,折起的常显', () => {
        const css = liteMonacoBaseCSS()
        const rule = (sel: string) => {
            const i = css.indexOf(sel + ' {')
            return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
        }
        expect(rule('.cm-foldMarker')).toMatch(/opacity:\s*0/)
        expect(css).toMatch(/\.cm-foldMarker-collapsed,\s*\n?\.cm-gutters:hover \.cm-foldMarker-active \{[^}]*opacity:\s*1/)
    })
})

// TS outlining 的折叠表是异步补的(280ms 后);中间的编辑要把它映射过去(Monaco 折叠装饰随编辑移动),
// 否则文档变短后 extraRange 的 lineAt(to) 越界、或折叠落到错行。
describe('extraFoldField 随文档改动映射', () => {
    const DOC = 'import {\na,\nb,\n} from "x"\nz'
    it('整篇换成短文档:条目丢弃,foldable / collectFoldableLines 不抛', async () => {
        const { collectFoldableLines } = await import('../../src/core/edit/fold')
        const { foldScopes } = await import('../../src/core/feature/stickyscroll')
        const s = withExtra(DOC, 1, 4)
        const s2 = s.update({ changes: { from: 0, to: s.doc.length, insert: '' } }).apply()
        expect(s2.field(extraFoldField)).toEqual([])
        expect(() => foldable(s2, 0)).not.toThrow()
        expect(() => collectFoldableLines(s2)).not.toThrow()
        expect(() => foldScopes(s2)).not.toThrow()
        const s3 = s.update({ changes: { from: 0, to: s.doc.length, insert: 'x\ny' } }).apply()
        expect(() => foldScopes(s3)).not.toThrow()
        expect(foldable(s3, 0)).toBeNull()
    })

    it('上方插两行:条目跟着下移,折叠范围对准原来的块', () => {
        const s = withExtra(DOC, 1, 4)
        const s2 = s.update({ changes: { from: 0, insert: '// a\n// b\n' } }).apply()
        expect(s2.field(extraFoldField)).toEqual([{ line: 3, from: s2.doc.line(3).to, to: s2.doc.line(6).to }])
        expect(foldable(s2, s2.doc.line(3).from)).toEqual({ from: s2.doc.line(3).to, to: s2.doc.line(5).to })
        expect(foldable(s2, 0)).toBeNull()
    })

    it('块内打字:范围跟着伸缩;删掉起始行的行尾 / 块缩成一行 → 条目丢弃', () => {
        const s = withExtra(DOC, 1, 4)
        const typed = s.update({ changes: { from: s.doc.line(2).from, insert: 'aa' } }).apply()
        expect(typed.field(extraFoldField)[0].to).toBe(typed.doc.line(4).to)
        // 删掉 1..3 行的换行(块并成一行)
        const joined = s.update({ changes: { from: s.doc.line(1).to, to: s.doc.line(4).from } }).apply()
        expect(joined.field(extraFoldField)).toEqual([])
    })
})
