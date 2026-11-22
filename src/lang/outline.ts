// 非 TS 语言的 document symbols → sticky scroll 作用域(Monaco stickyScroll.defaultModel = 'outlineModel')。
//
// Monaco 0.52 的 json / css / scss / less / html 都有 document symbol provider(languages/*/worker,
// 背后是 vscode-*-languageservice),sticky 用它的 outline,不用折叠范围。这里按同样的规则在主线程现算:
//   - JSON(jsonoutline.ts):findDocumentSymbols2,对象属性 / 数组元素的树;
//   - CSS / SCSS / LESS(cssoutline.ts):worker 调的是 findSymbolInformations —— 扁平列表(没有 children);
//   - HTML(htmloutline.ts):worker 调的 findDocumentSymbols 把元素树按先序摊平成 SymbolInformation,也是扁平的。
// 扁平列表全在顶层,Monaco 的候选二分在顶层只取一个(起始行 ≤ 视口首行的最后一个),所以 CSS / HTML 的
// sticky 最多一行,而且这一个是单行元素(<p>x</p>、$x: 1)时就什么都不显示 —— 对照页实测如此,照做。
//
// 树 → sticky 照 StickyModelFromCandidateOutlineProvider(和 tssticky 的 navTreeToSticky 同一套):
// 顶层全收;子元素只收跨行的,和父同起始行的不另起一层(把它的子元素挂到父下);
// 范围 = [selectionRange 起始行, range 末行],体末 = 末行 - 1;同层按 (起始行升, 末行降) 排序。

import type { EditorView } from '../core/view/editorview'
import type { StickyNode, StickyOutlineSource } from '../core/feature/stickyscroll'
import { budgetForState, materializeDoc } from '../core/perf'
import { jsonSymbols } from './jsonoutline'
import { cssSymbols } from './cssoutline'
import { htmlSymbols } from './htmloutline'

/** 一个 document symbol(偏移):range = [from, to),selectionRange 起点 sel */
export interface DocSymbol {
    from: number
    to: number
    sel: number
    children?: DocSymbol[]
}

const cmp = (a: StickyNode, b: StickyNode) => a.start - b.start || b.end - a.end

/** 一个 document symbol 的行号形态:start/end = range 起止行,sel = selectionRange 起始行 */
export interface LineSymbol {
    start: number
    end: number
    sel: number
    children?: LineSymbol[]
}

/**
 * document symbols(行号)→ sticky 作用域树(Monaco StickyModelFromCandidateOutlineProvider)。
 * 没有符号 → null(Monaco isModelValid,退回折叠范围)
 */
export function lineSymbolsToSticky(syms: readonly LineSymbol[]): StickyNode[] | null {
    if (!syms.length) return null
    const build = (s: LineSymbol, prevStart: number): StickyNode => {
        const children: StickyNode[] = []
        for (const c of s.children ?? []) {
            if (c.sel === c.end) continue
            if (c.sel !== prevStart) children.push(build(c, c.sel))
            else for (const sub of c.children ?? []) children.push(build(sub, c.sel))
        }
        children.sort(cmp)
        return { start: s.sel, end: s.end - 1, children }
    }
    // 顶层按 range(不是 selectionRange)排序
    const top = [...syms].sort((a, b) => a.start - b.start || b.end - a.end)
    return top.map(s => build(s, s.sel))
}

/** document symbols(偏移)→ sticky 作用域树。没有符号 → null */
export function symbolsToSticky(syms: readonly DocSymbol[], lineAt: (pos: number) => number): StickyNode[] | null {
    const conv = (s: DocSymbol): LineSymbol => ({ start: lineAt(s.from), end: lineAt(s.to), sel: lineAt(s.sel), children: s.children?.map(conv) })
    return lineSymbolsToSticky(syms.map(conv))
}

/** 语言 → 现算 document symbols 的函数;不认识的语言 → null */
export function documentSymbolsFor(lang: string): ((text: string) => DocSymbol[]) | null {
    const l = lang.toLowerCase()
    if (l === 'json' || l === 'jsonc' || l === 'json5') return jsonSymbols
    if (l === 'css' || l === 'scss' || l === 'less') return text => cssSymbols(text, l)
    if (l === 'html' || l === 'htm' || l === 'xhtml') return htmlSymbols
    return null
}

// Monaco:内容变化 → 50ms → Delayer 300ms 取 outline。这里同步现算(线性,2 千行 1ms 级),
// 上次耗时 × 8 做防抖下限;XL 文档不算,留折叠范围(同 tssticky)。
const debounceFor = (view: EditorView, lastCost: number) =>
    Math.max(budgetForState(view.state).docClass === 'L' ? 800 : 350, lastCost * 8)

/** stickyScrollOverlay 的 outline 来源:json / css / scss / less / html;别的语言 → null */
export function languageStickyOutline(lang: string): StickyOutlineSource | null {
    const symbols = documentSymbolsFor(lang)
    if (!symbols) return null
    return (view, publish) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        let lastCost = 0
        let published = false
        const run = () => {
            const state = view.state
            if (budgetForState(state).docClass === 'XL') {
                if (published) { published = false; publish(null) }
                return
            }
            const t0 = Date.now()
            let syms: DocSymbol[] = []
            try { syms = symbols(materializeDoc(state)) }
            catch { syms = [] }
            const roots = symbolsToSticky(syms, pos => state.doc.lineAt(Math.min(pos, state.doc.length)).number)
            lastCost = Date.now() - t0
            published = !!roots
            publish(roots)
        }
        const off = view.onTransaction(tr => {
            if (!tr.docChanged) return
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { timer = null; run() }, debounceFor(view, lastCost))
        })
        // 首次也走定时器(Monaco 装上后 50ms 才取 outline),不占编辑器创建的那一帧
        timer = setTimeout(() => { timer = null; run() }, 50)
        return () => {
            if (timer) clearTimeout(timer)
            off()
        }
    }
}
