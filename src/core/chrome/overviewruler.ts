// CM7 overview ruler —— 右侧概览标注条 overlay(对标 Monaco decorationsOverviewRuler)。
//
// 把整篇文档压成一条竖条,标记按「内容真实偏移比例」落位。ruler 是文档级、绝对定位浮在 view.dom 右侧、
// 不随内容滚,无法用 Decoration 表达,只能建 DOM 挂到 view.dom 自绘(走 attachOverlay 三连,不加生命周期)。
//
// palette.overview 给了时(lite-monaco 的 rulerPalette 都给)照 Monaco decorationsOverviewRuler 画,见 overviewpaint.ts:
// lane、最小 6px、光标 2px、border,来源含同词(读写分色)、选中串、贴着的括号、查找、诊断。
// 没给时是旧画法:collectMarks(光标 / 查找 / 诊断)经 rulerLayout 合并成满宽 2px 色点。

import type { EditorView } from '../view/editorview'
import type { EditorState } from '../model/state'
import type { RulerPalette } from './ruler'
import { QueryType } from '../view/heightmap'
import { rulerLayout, type RulerMark } from './ruler'
import { getOption } from '../options'
import { diagnosticsField } from '../feature/diagnostics'
import { searchField } from '../feature/search'
import { attachOverlay } from '../feature/overlay'
import { drawOverview, trackTextualWords } from './overviewpaint'
import type { VScrollbarOptions } from './vscrollbar'

const WIDTH = 14

// 内生 + 外生标记合并成 RulerMark[]。全走 CM7 primitive,与 CM6 collectMarks 同语义不同实现。
export function collectMarks(state: EditorState): RulerMark[] {
    const doc = state.doc
    const marks: RulerMark[] = []

    if (!getOption(state, 'hideCursorInOverviewRuler'))
        for (const r of state.selection.ranges) marks.push({ line: doc.lineAt(r.head).number, kind: 'cursor' })

    // 搜索命中:searchField.matches 已是 {from,to}[](field 在 doc/query 变时重算)。
    const search = state.field(searchField, false)
    if (search) for (const m of search.matches) marks.push({ line: doc.lineAt(m.from).number, kind: 'match' })

    for (const d of state.field(diagnosticsField, false) ?? [])
        marks.push({ line: doc.lineAt(Math.min(d.from, doc.length)).number, kind: d.severity })

    // 同词/occurrence 高亮**不进** ruler(对齐 Monaco:概览条只标 cursor/search/diagnostic)。同词高亮仅在
    // 正文 selectionMatchDecorations 出现;曾投 wordHighlight → 短词(c/x/i)全文几十处淹没右侧。见测。
    return marks
}

// overlay 工厂:绑定 palette,返回 (view) => 卸载函数(供 EditorView.overlays)。
// palette.overview 给了时照 Monaco decorationsOverviewRuler 画(overviewpaint.ts),否则是旧的 collectMarks 画法。
export function overviewRulerCM7(palette: RulerPalette, opts: Pick<VScrollbarOptions, 'overview'> = {}): (view: EditorView) => () => void {
    return (view: EditorView) => {
        let canvas: HTMLCanvasElement
        const words = palette.overview ? trackTextualWords(view, () => paint(view)) : null
        const paint = (v: EditorView) => {
            const barH = v.scrollDOM.clientHeight
            if (!barH) return
            const o = opts.overview ?? {}
            drawOverview(v, canvas, WIDTH, barH, palette, { ...o, textualWordsLive: o.textualWords !== false && !!words?.live(), bracketOwner: v })
        }

        const off = attachOverlay(view, {
            mount(v) {
                const root = document.createElement('div')
                root.className = 'cm-overviewRuler'
                canvas = document.createElement('canvas')
                canvas.width = WIDTH
                root.appendChild(canvas)
                v.dom.appendChild(root)
                return root
            },
            redraw(v, tr) {
                if (palette.overview) {
                    if (tr) words?.update(tr)
                    paint(v)
                    return
                }
                const barH = v.scrollDOM.clientHeight
                if (!barH) return
                canvas.height = barH
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                ctx.clearRect(0, 0, WIDTH, barH)

                const total = v.metrics.height || 1
                const lineTop = (line: number) => {
                    const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from
                    const block = v.heightMap.lineAt(pos, QueryType.ByPos, v.oracle, 0, 0)
                    return block.top / total * barH
                }
                const points = rulerLayout(collectMarks(v.state), lineTop, palette)
                for (const p of points) {
                    ctx.fillStyle = p.color
                    ctx.fillRect(0, p.top, WIDTH, 2)
                }
            },
        })
        return () => { off(); words?.dispose() }
    }
}
