// 第七轮:概览尺照 Monaco 0.52 decorationsOverviewRuler 画(src/core/chrome/overviewpaint.ts)。
// 对照页像素(/tmp/lc-hunt/r7/ruler-compare.ts,vs-dark,14×518,60 行):同词、选中串、查找、光标四个场景与 Monaco 逐行一致;
//   - lane:API 默认 2 条,从 x=1 起;Center = x1 宽 6,Right = x7 宽 7,光标 Full = x1 宽 13;x=0 列和顶行是 border;
//   - 同词:TS 写 = wordHighlightStrongForeground rgba(192,160,192,.8),读 = wordHighlightTextForeground rgba(160,160,160,.8);
//   - 查找 rgba(209,134,22,.49)(修前是自定的实色 #e6a23c、满宽 2px);诊断走 Right lane;
//   - 每段至少 6px;光标 2px、editorCursor × 0.7;选中串在有语义同词(TS)时不进概览尺;包住光标的括号不进,贴着的进。
// 修前:只有光标 / 查找 / 诊断,统一满宽 2px 色条,不画同词、选中串、括号。
import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { openSearch, searchField, setSearchQuery } from '../../src/core/feature/search'
import { collectOverviewDecos, groupOverviewDecos, LANE, overviewLanes, paintOverview, type OverviewColors } from '../../src/core/chrome/overviewpaint'
import { rulerPalette } from '../../src/product/theme'

const C: OverviewColors = {
    cursor: 'cur', findMatch: 'find', wordHighlight: 'read', wordHighlightStrong: 'write', wordHighlightText: 'text',
    selectionHighlight: 'sel', bracketMatch: 'br', error: 'err', warning: 'warn', info: 'info', border: 'bd',
}

function st(doc: string, sel: EditorSelection) {
    return EditorState.create({ doc, selection: sel, extensions: [searchField, diagnosticsField] })
}
const kinds = (s: EditorState, opts: Parameters<typeof collectOverviewDecos>[2]) =>
    collectOverviewDecos(s, C, opts).map(d => `${d.color}@${s.doc.lineAt(d.from).number}/${d.lane}/${d.z}`)

describe('概览尺标记来源(Monaco 带 overviewRuler 的装饰)', () => {
    const doc = 'let foo = 1\nfoo = 2\nlog(foo)\n// foo'

    it('TS 语义同词:写 → Strong,读 → Text,都在 Center;选中串不进', () => {
        const s = st(doc, EditorSelection.single(doc.indexOf('log(') + 5))
        const marks = [{ from: 4, to: 7, write: true }, { from: 12, to: 15, write: true }, { from: 24, to: 27 }]
        expect(kinds(s, { wordHighlights: () => marks, bracketMatch: false })).toEqual(['write@1/2/0', 'write@2/2/0', 'text@3/2/0'])
        // 选中整词:有语义来源时选中串不进(_SELECTION_HIGHLIGHT_OPTIONS_NO_OVERVIEW)
        const s2 = st(doc, EditorSelection.single(4, 7))
        expect(kinds(s2, { wordHighlights: () => null, bracketMatch: false })).toEqual([])
    })

    it('文本同词(在时)+ 选中串:Text / selectionHighlight', () => {
        const s = st(doc, EditorSelection.single(doc.indexOf('log(') + 5))
        expect(kinds(s, { textualWordsLive: true, bracketMatch: false })).toEqual(['text@1/2/0', 'text@2/2/0', 'text@3/2/0', 'text@4/2/0'])
        expect(kinds(s, { textualWordsLive: false, bracketMatch: false })).toEqual([])
        const s2 = st(doc, EditorSelection.single(4, 7))
        expect(kinds(s2, { bracketMatch: false })).toEqual(['sel@2/2/0', 'sel@3/2/0', 'sel@4/2/0'])
    })

    it('括号:贴着光标的一对进(Center),只是包住光标的不进', () => {
        expect(kinds(st(doc, EditorSelection.single(doc.indexOf('(') + 1)), {})).toEqual(['br@3/2/0', 'br@3/2/0'])
        expect(kinds(st(doc, EditorSelection.single(doc.indexOf('(') + 2)), {})).toEqual([])
    })

    it('查找命中 Center(当前 z13 其余 z10),诊断 Right(error 30 / warning 20 / info 10)', () => {
        let s = st(doc, EditorSelection.single(0))
        const d = { state: s, dispatch: (tr: import('../../src/core/model/state').Transaction) => { s = tr.apply(); d.state = s } }
        openSearch(d)
        setSearchQuery('foo')(d)
        s = s.applyTransaction(s.update({ effects: setDiagnostics.of([
            { from: 0, to: 3, severity: 'error', message: 'e' },
            { from: 8, to: 9, severity: 'warning', message: 'w' },
            { from: 12, to: 15, severity: 'info', message: 'i' },
        ]) }))
        const out = kinds(s, { bracketMatch: false, selectionHighlight: false })
        expect(out.filter(k => k.startsWith('find')).map(k => k.split('/')[1])).toEqual(['2', '2', '2', '2'])
        expect(out.filter(k => !k.startsWith('find'))).toEqual(['err@1/4/30', 'warn@1/4/20', 'info@2/4/10'])
    })
})

describe('分组与绘制(OverviewRulerDecorations + decorationsOverviewRuler._render)', () => {
    it('按颜色分组,同 lane 相邻行并段;组按 zIndex、颜色排序', () => {
        const s = EditorState.create({ doc: 'a\nb\nc\nd\ne\nf' })
        const L = (n: number) => s.doc.line(n).from
        const g = groupOverviewDecos(s, [
            { from: L(5), to: L(5), color: 'err', z: 30, lane: LANE.Right },
            { from: L(1), to: L(1), color: 'text', z: 0, lane: LANE.Center },
            { from: L(2), to: L(2), color: 'text', z: 0, lane: LANE.Center },
            { from: L(4), to: L(4), color: 'text', z: 0, lane: LANE.Center },
            { from: L(3), to: L(3), color: 'find', z: 10, lane: LANE.Center },
        ])
        expect(g).toEqual([
            { color: 'text', z: 0, data: [2, 1, 2, 2, 4, 4] },
            { color: 'find', z: 10, data: [2, 3, 3] },
            { color: 'err', z: 30, data: [4, 5, 5] },
        ])
    })

    it('2 lane:x 从 1 起,Center 宽 6、Right 宽 7、Full 宽 13(14px 宽)', () => {
        const [x, w] = overviewLanes(14, 2)
        expect([x[LANE.Center], w[LANE.Center], x[LANE.Right], w[LANE.Right], x[LANE.Full], w[LANE.Full]]).toEqual([1, 6, 7, 7, 1, 13])
    })

    it('一段至少 6px(按中心撑开、贴边夹住);光标满宽 2px;最后描 border', () => {
        const calls: string[] = []
        const ctx = {
            set fillStyle(c: string) { calls.push(`fill ${c}`) },
            set strokeStyle(c: string) { calls.push(`stroke ${c}`) },
            lineWidth: 0,
            clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { calls.push('stroke()') },
            fillRect(x: number, y: number, w: number, h: number) { calls.push(`rect ${x},${y},${w},${h}`) },
        } as unknown as CanvasRenderingContext2D
        // 100 行 × 10px,画布高 100 → 每行 1px
        paintOverview(ctx, [{ color: 'text', z: 0, data: [2, 1, 1, 2, 50, 50] }], [{ line: 31, color: 'cur' }], {
            width: 14, height: 100, dpr: 1, scrollHeight: 1000, lineTop: l => (l - 1) * 10, lineHeight: () => 10,
        }, 'bd')
        expect(calls).toEqual([
            'fill text', 'rect 1,0,6,6', 'rect 1,46,6,6',
            'fill cur', 'rect 1,29,13,2',
            'stroke bd', 'stroke()',
        ])
    })

    it('rulerPalette 给出 Monaco 默认色(vs-dark)', () => {
        const o = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true }).overview!
        expect(o).toMatchObject({
            cursor: 'rgba(174,175,173,0.7)', findMatch: 'rgba(209,134,22,0.49)',
            wordHighlightStrong: 'rgba(192,160,192,0.8)', wordHighlightText: 'rgba(160,160,160,0.8)', wordHighlight: 'rgba(160,160,160,0.8)',
            selectionHighlight: 'rgba(160,160,160,0.8)', bracketMatch: '#a0a0a0', error: 'rgba(255,18,18,0.7)', border: 'rgba(127,127,127,0.3)',
        })
    })
})

describe('liteMonaco() 的竖条列照 Monaco 画概览尺', () => {
    it('文本同词:用户挪光标后 Center lane 画 wordHighlightText 色;光标 editorCursor×0.7 满宽', async () => {
        const { liteMonaco } = await import('../../src/litemonaco')
        const fills: string[] = []
        const ctx = {
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fillRect(x: number, _y: number, w: number) { fills.push(`${(ctx as { fillStyle: string }).fillStyle} x${x} w${w}`) },
        }
        const orig = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function () { return ctx } as never
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const hl = {
            codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
            getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
        } as never
        const view = liteMonaco({ parent, highlighter: hl, doc: 'foo bar\nbaz\nfoo', lang: 'plaintext', features: { minimap: false } })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 300, configurable: true })
        expect(view.dom.querySelector('.cm-scrollbar canvas.cm-scrollbar-overview')).not.toBeNull()
        expect(view.dom.querySelector('.cm-scrollbar-mark')).toBeNull()
        view.contentDOM.focus()
        fills.length = 0
        view.dispatch(view.state.update({ selection: { anchor: 1 }, userEvent: 'select.pointer' }))
        expect(fills.filter(f => f.startsWith('rgba(160,160,160,0.8) x1 w6')).length).toBe(2) // 第 1、3 行的 foo(不相邻,两段)
        expect(fills).toContain('rgba(174,175,173,0.7) x1 w13')
        view.destroy(); parent.remove()
        HTMLCanvasElement.prototype.getContext = orig
    })
})
