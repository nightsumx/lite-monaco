import { describe, expect, it } from 'vitest'
import { EditorState, type Transaction } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { selectionHighlightRanges } from '../../src/core/feature/selectionlayer'
import { collectOverviewDecos, type OverviewColors } from '../../src/core/chrome/overviewpaint'
import { openSearch, searchField, setSearchQuery, toggleFindCaseSensitive, toggleFindRegex } from '../../src/core/feature/search'

// Monaco SelectionHighlighter._createState:查找框开着、查询串等于选中文本(按 matchCase 比)、非正则 → 不画选中串高亮
// (查找命中已经画了同一批位置),正文和概览尺都不画
const C: OverviewColors = {
    cursor: 'cur', findMatch: 'find', wordHighlight: 'read', wordHighlightStrong: 'write', wordHighlightText: 'text',
    selectionHighlight: 'sel', bracketMatch: 'br', error: 'err', warning: 'warn', info: 'info', border: 'bd',
}

function run(query: string, ...cmds: ((d: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean)[]) {
    const doc = 'foo bar foo\nFoo foo'
    let s = EditorState.create({ doc, selection: EditorSelection.single(0, 3), extensions: [searchField] })
    const d = { state: s, dispatch: (tr: Transaction) => { s = tr.apply(); d.state = s } }
    openSearch(d)
    setSearchQuery(query)(d)
    for (const c of cmds) c(d)
    s = s.applyTransaction(s.update({ selection: EditorSelection.single(0, 3) }))
    return { ranges: selectionHighlightRanges(s).length, ruler: collectOverviewDecos(s, C, { bracketMatch: false }).filter(x => x.color === 'sel').length }
}

describe('查找框查询 = 选中文本时不画选中串高亮', () => {
    it('同串(不分大小写)→ 不画', () => {
        expect(run('foo')).toEqual({ ranges: 0, ruler: 0 })
        expect(run('FOO')).toEqual({ ranges: 0, ruler: 0 })
    })
    it('不同串、区分大小写下大小写不同、正则 → 照画', () => {
        expect(run('fo').ranges).toBe(3)
        expect(run('FOO', toggleFindCaseSensitive).ranges).toBe(3)
        expect(run('foo', toggleFindRegex).ranges).toBe(3)
    })
})
