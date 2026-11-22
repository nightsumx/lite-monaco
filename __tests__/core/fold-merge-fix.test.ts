// 第五轮 E 组:手建折叠块和缩进 / region / TS outlining 块交叉时照 Monaco FoldingRegions.sanitizeAndMerge 合并。
// 规则(foldingRanges.js):按起始行排;同起始行手建的赢;交叉时手建的赢(provider 块被丢掉,折叠状态跟着丢);
// 手建块之间交叉,新建的赢;嵌套必须完全包含(起在别人末行上也算交叉)。合并后的区域集是 gutter 箭头、
// Fold / Fold All / Fold Level 等命令的唯一来源。
// 真值:Monaco 0.52 对照页实测(/tmp/lc-hunt/r5/E/mon-cross.ts),区域写法同 Monaco:起-止,C = 折着,U = 手建。
import { afterEach, describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'
import type { EditorView } from '../../src/core/view/editorview'

setMacPlatform()
const { liteMonaco } = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { defaultPaletteCommands } = await import('../../src/core/feature/commandpalette')

const hl = {
    codeToTokens: (code: string) => ({ tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}

const views: EditorView[] = []
afterEach(() => {
    for (const v of views.splice(0)) { v.destroy(); v.dom.parentElement?.remove() }
})

type Sel = [number, number, number, number]

function make(doc: string) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl as never, doc, lang: 'text', theme: 'dark-plus', features: { minimap: false, stickyScroll: false, codeActions: false, signatureHelp: false, tsDiagnostics: false, hover: false, autocomplete: false } })
    views.push(view)
    view.focus()
    return view
}
function select(view: EditorView, sels: Sel[]) {
    const pos = (l: number, c: number) => view.state.doc.line(l).from + c - 1
    view.dispatch(view.state.update({
        selection: core.EditorSelection.create(sels.map(s => core.EditorSelection.range(pos(s[0], s[1]), pos(s[2], s[3])))),
    }))
}
const LABELS: Record<string, string> = {
    create: 'Create Folding Range from Selection', remove: 'Remove Manual Folding Ranges',
    fold: 'Fold', unfold: 'Unfold', foldAll: 'Fold All', unfoldAll: 'Unfold All',
}
function run(view: EditorView, cmd: string) {
    if (cmd.startsWith('level')) return core.foldLevel(Number(cmd.slice(5)))(view)
    const c = defaultPaletteCommands().find(c => c.label === LABELS[cmd])
    expect(c, cmd).toBeTruthy()
    return c!.run(view)
}
// Monaco 的写法:区域 `起-止[C][U]`,再加隐藏行段
function regions(view: EditorView): string {
    const s = view.state
    const folded = s.field(core.foldField)
    const manual = new Set(s.field(core.manualFoldField).map(r => r.line))
    const out: string[] = []
    const hidden: number[][] = []
    for (const n of [...core.collectFoldableLines(s)].sort((a, b) => a - b)) {
        const f = core.foldable(s, s.doc.line(n).from)
        if (!f) continue
        const end = s.doc.lineAt(f.to).number
        out.push(`${n}-${end}${folded.has(n) ? 'C' : ''}${manual.has(n) ? 'U' : ''}`)
        if (!folded.has(n)) continue
        const last = hidden[hidden.length - 1]
        if (last && n + 1 <= last[1]) { last[1] = Math.max(last[1], end); continue }
        hidden.push([n + 1, end])
    }
    return out.join(' ') + '  | hidden ' + hidden.map(h => h.join('-')).join(',')
}

const DOC = ['function a() {', '    if (x) {', '        y()', '    }', '    z()', '}', 'function b() {', '    w()', '}', ''].join('\n')

describe('手建块和缩进块交叉(Monaco sanitizeAndMerge)', () => {
    // [名字, 步骤, Monaco 结果](mon-cross.ts 实测)
    const flows: [string, [string, Sel[]][], string][] = [
        ['init', [], '1-5 2-3 7-8  | hidden '],
        ['manual 3-5 (交叉 if 2-3)', [['create', [[3, 1, 5, 3]]]], '1-5 3-5CU 7-8  | hidden 4-5'],
        ['manual 1-3 (同起始行 a)', [['create', [[1, 1, 3, 3]]]], '1-3CU 2-3 7-8  | hidden 2-3'],
        ['manual 5-8 (交叉 a 和 b)', [['create', [[5, 1, 8, 3]]]], '2-3 5-8CU 7-8  | hidden 6-8'],
        ['manual 2-7', [['create', [[2, 1, 7, 3]]]], '2-7CU  | hidden 3-7'],
        ['manual 3-4 (起在 if 末行)', [['create', [[3, 1, 4, 3]]]], '1-5 3-4CU 7-8  | hidden 4-4'],
        ['fold 2 then manual 3-5', [['fold', [[3, 1, 3, 1]]], ['create', [[3, 1, 5, 3]]]], '1-5 3-5CU 7-8  | hidden 4-5'],
        ['fold 1 then manual 5-8', [['fold', [[3, 1, 3, 1]]], ['fold', [[3, 1, 3, 1]]], ['create', [[5, 1, 8, 3]]]], '2-3C 5-8CU 7-8  | hidden 3-3,6-8'],
        ['two manual crossing 一次', [['create', [[2, 1, 5, 3], [5, 5, 8, 1]]]], '2-5CU 7-8  | hidden 3-5'],
        ['two manual 一次 反序', [['create', [[5, 5, 8, 1], [2, 1, 5, 3]]]], '2-5CU 7-8  | hidden 3-5'],
        ['two manual 嵌套 一次', [['create', [[2, 1, 3, 3], [3, 5, 5, 1]]]], '1-5 2-3CU 7-8  | hidden 3-3'],
        ['manual 4-8 then manual 2-5', [['create', [[4, 1, 8, 1]]], ['create', [[2, 1, 5, 3]]]], '2-5CU  | hidden 3-5'],
        ['manual 3-5, unfold, foldAll', [['create', [[3, 1, 5, 3]]], ['unfoldAll', [[3, 1, 3, 1]]], ['foldAll', [[9, 1, 9, 1]]]], '1-5C 3-5CU 7-8C  | hidden 2-5,8-8'],
        ['manual 5-8, unfoldAll, foldLevel1', [['create', [[5, 1, 8, 3]]], ['unfoldAll', [[1, 1, 1, 1]]], ['level1', [[10, 1, 10, 1]]]], '2-3C 5-8CU 7-8  | hidden 3-3,6-8'],
        ['manual 3-5, unfoldAll, foldLevel2', [['create', [[3, 1, 5, 3]]], ['unfoldAll', [[1, 1, 1, 1]]], ['level2', [[10, 1, 10, 1]]]], '1-5 3-5CU 7-8  | hidden 4-5'],
        ['manual 3-5 then remove', [['create', [[3, 1, 5, 3]]], ['remove', [[3, 1, 3, 1]]]], '1-5 2-3 7-8  | hidden '],
        ['fold 2, manual 3-5, remove', [['fold', [[3, 1, 3, 1]]], ['create', [[3, 1, 5, 3]]], ['remove', [[3, 1, 3, 1]]]], '1-5 2-3 7-8  | hidden '],
        ['manual 3-5, unfold@3, fold@2', [['create', [[3, 1, 5, 3]]], ['unfold', [[3, 1, 3, 1]]], ['fold', [[2, 5, 2, 5]]]], '1-5C 3-5U 7-8  | hidden 2-5'],
        // 被新块挤掉的 provider 块要等下一次编辑重算才回来(哪怕挤它的新块自己也没留下)
        ['two manual crossing 一次 + edit', [['create', [[2, 1, 5, 3], [5, 5, 8, 1]]], ['edit', []]], '1-5 2-5CU 7-8  | hidden 3-5'],
        ['manual 4-8 then 2-5 + edit', [['create', [[4, 1, 8, 1]]], ['create', [[2, 1, 5, 3]]], ['edit', []]], '1-5 2-5CU 7-8  | hidden 3-5'],
        ['manual 2-6 + fold@8', [['create', [[2, 1, 7, 1]]], ['fold', [[8, 1, 8, 1]]]], '2-6CU 7-8C  | hidden 3-6,8-8'],
    ]
    for (const [name, steps, want] of flows) {
        it(name, () => {
            const v = make(DOC)
            for (const [cmd, sels] of steps) {
                if (cmd === 'edit') { v.dispatch(v.state.update({ changes: { from: v.state.doc.length, insert: 'x' } })); continue }
                select(v, sels)
                run(v, cmd)
            }
            expect(regions(v)).toBe(want)
        })
    }

    it('gutter 箭头只画合并后的区域', () => {
        const v = make(DOC)
        select(v, [[5, 1, 8, 3]])
        run(v, 'create')
        const spec = core.foldGutterSpec(v.dispatch.bind(v))
        const arrows = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => spec.foldableAt(v.state, v.state.doc.line(n).from))
        expect(arrows).toEqual([2, 5, 7])
    })

    it('TS outlining 补的块和手建块交叉也丢掉', () => {
        const v = make('a\nb\nc\nd\ne\n')
        const line = (n: number) => v.state.doc.line(n)
        v.dispatch(v.state.update({ effects: core.setExtraFolds.of([{ line: 1, from: line(1).to, to: line(3).to }, { line: 4, from: line(4).to, to: line(5).to }]) }))
        expect(regions(v)).toBe('1-3 4-5  | hidden ')
        select(v, [[2, 1, 4, 2]])
        run(v, 'create')
        expect(regions(v)).toBe('2-4CU  | hidden 3-4')
        // outlining 整表换掉后照样按手建的赢
        v.dispatch(v.state.update({ effects: core.setExtraFolds.of([{ line: 3, from: line(3).to, to: line(5).to }]) }))
        expect(regions(v)).toBe('2-4CU  | hidden 3-4')
        select(v, [[2, 1, 2, 1]])
        run(v, 'remove')
        expect(regions(v)).toBe('3-5  | hidden ')
    })
})
