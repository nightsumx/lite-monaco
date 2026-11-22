// 第六轮 I 组:折叠区域集里 region 标记和缩进块交叉时照 Monaco indentRangeProvider.computeRanges 一遍算
// (自下而上:#endregion 压一个 -2 哨兵、#region 把它和中间的缩进块一起收掉,region 起始行再当普通行参与外层缩进块)。
// TS outlining 补的块照 syntaxRangeProvider.sanitizeRanges:同起始行先来的赢,交叉的照样留着。
// 真值:Monaco 0.52 对照页实测(/tmp/lc-hunt/r6/I/fold.ts;对照页的 TS 没注册 folding provider,用的是 indent provider)。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { collectFoldableLines, extraFoldField, foldable, foldField, foldRegionsAtLine, setExtraFolds, unfoldCode } from '../../src/core/edit/fold'

function st(lines: string[], extra: { line: number, end: number }[] = []) {
    let s = EditorState.create({ doc: lines.join('\n'), extensions: [foldField, extraFoldField] })
    if (extra.length) {
        const d = s.doc
        s = s.update({ effects: setExtraFolds.of(extra.map(e => ({ line: e.line, from: d.line(e.line).to, to: d.line(e.end).to }))) }).apply()
    }
    return s
}
// 区域集,写法同 Monaco:起-止
function regions(s: EditorState): string {
    return [...new Set(collectFoldableLines(s))].sort((a, b) => a - b).map((n) => {
        const f = foldable(s, s.doc.line(n).from)
        return f ? `${n}-${s.doc.lineAt(f.to).number}` : null
    }).filter(Boolean).join(' ')
}

describe('region 标记和缩进块交叉(Monaco indentRangeProvider.computeRanges)', () => {
    const cases: [string, string[], string][] = [
        ['region 起在缩进块里、收在块外:外层缩进块伸到 #endregion', ['function a() {', '    // #region r', '    x()', '}', '// #endregion', 'y()', ''], '1-5 2-5'],
        ['region 在 if 块内起、块外收', ['if (a) {', '    b()', '    //#region', '    c()', '}', 'd()', '//#endregion', ''], '1-8 3-7'],
        ['嵌套正确', ['//#region', 'function a() {', '    x()', '}', '//#endregion', ''], '1-5 2-3'],
        ['region 和缩进块同起始行', ['//#region', '    a()', '    b()', '//#endregion', ''], '1-4'],
        ['未闭合 region 当普通行', ['//#region', 'function a() {', '    x()', '}', ''], '2-3'],
        ['多余的 #endregion 截断外层缩进块', ['function a() {', '    x()', '    //#endregion', '}', ''], '1-2'],
        ['只到文末的块连文末空行也算', ['def f():', '    x', '    y', '', '', ''], '1-6'],
        ['块后的空行算进块里', ['def f():', '    x', '', '', 'g()', ''], '1-4'],
        ['region 里有缩进块', ['  //#region', '    a()', '        b()', '  //#endregion', ''], '1-4 2-3'],
        ['嵌套 region', ['//#region a', '//#region b', 'x()', '//#endregion', '//#endregion', ''], '1-5 2-4'],
        ['多行注释 / 函数参数', ['/**', ' * doc', ' * more', ' */', 'function f() {', '    x()', '}', ''], '1-4 5-6'],
    ]
    for (const [name, lines, want] of cases) {
        it(name, () => {
            expect(regions(st(lines))).toBe(want)
        })
    }

    it('Unfold / Fold 找包住光标行的块:region 起始行之上的外层缩进块也算', () => {
        const s = st(['function a() {', '    // #region r', '    x()', '}', '// #endregion', 'y()', ''])
        expect(foldRegionsAtLine(s, 5)).toEqual([2, 1])
        expect(foldRegionsAtLine(s, 4)).toEqual([2, 1])
        expect(foldRegionsAtLine(s, 6)).toEqual([])
        expect(unfoldCode({ state: s, dispatch: () => {} })).toBe(false)
    })
})

describe('TS outlining 补的块(Monaco sanitizeRanges)', () => {
    it('同起始行缩进 / region 块先来,TS 的不顶替', () => {
        expect(regions(st(['function a() {', '    x()', '    y()', '}', ''], [{ line: 1, end: 3 }]))).toBe('1-3')
    })
    it('和缩进块交叉的照样留着', () => {
        // 缩进块 1-3,TS 补 3-5(起在缩进块末行上)
        const s = st(['if (a) {', '    b()', '    c(', 'd)', 'e', ''], [{ line: 3, end: 5 }])
        expect(regions(s)).toBe('1-3 3-5')
    })
})
