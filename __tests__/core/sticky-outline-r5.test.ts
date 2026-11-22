// 非 TS 语言的 sticky outline(json / css / scss / less / html),对照 Monaco 0.52.2 实测。
// 夹具 __fixtures__/sticky-outline-monaco.json:
//   trees  —— Monaco sticky model(document symbols 经 StickyModelFromCandidateOutlineProvider)的树;
//   scroll —— 样例文档在各 scrollTop 下 Monaco 显示的 sticky 行(行高 20,视口 900)。
// 浏览器逐位置对比脚本:/tmp/lc-hunt/r5/L/stk-cmp.ts(另含真实文件)、edge-cmp.ts。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { documentSymbolsFor, symbolsToSticky, languageStickyOutline } from '../../src/lang/outline'
import { completelyVisibleLines, stickyCandidates, stickyLayout, stickyScrollOverlay, type StickyNode } from '../../src/core/feature/stickyscroll'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'

type Tree = { s: number, e: number, c: Tree[] }
const FX = JSON.parse(readFileSync(join(__dirname, '__fixtures__/sticky-outline-monaco.json'), 'utf8')) as {
    trees: { name: string, lang: string, doc: string, tree: Tree[] }[]
    scroll: Record<string, { lineHeight: number, viewport: number, positions: Record<string, number[]> }>
}

const lineAtOf = (doc: string) => {
    const starts = [0]
    for (let i = doc.indexOf('\n'); i >= 0; i = doc.indexOf('\n', i + 1)) starts.push(i + 1)
    return (pos: number) => {
        let lo = 0, hi = starts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (starts[mid] <= pos) lo = mid
            else hi = mid - 1
        }
        return lo + 1
    }
}
const sticky = (lang: string, doc: string) => symbolsToSticky(documentSymbolsFor(lang)!(doc), lineAtOf(doc))
const toTree = (ns: readonly StickyNode[]): Tree[] => ns.map(n => ({ s: n.start, e: n.end, c: toTree(n.children) }))

describe('document symbols → sticky 树:和 Monaco 的 sticky model 一致', () => {
    for (const c of FX.trees) {
        it(`${c.lang}: ${c.name}`, () => {
            const roots = sticky(c.lang, c.doc)
            expect(roots ? toTree(roots) : null).toEqual(c.tree)
        })
    }
})

describe('逐滚动位置的 sticky 行:和 Monaco 一致', () => {
    for (const [lang, fx] of Object.entries(FX.scroll)) {
        it(`${lang}: ${Object.keys(fx.positions).length} 个位置`, () => {
            const doc = FX.trees.find(t => t.name === 'sample ' + lang)!.doc
            const roots = sticky(lang, doc)!
            const LH = fx.lineHeight, lines = doc.split('\n').length
            const top = (n: number) => (n - 1) * LH, bottom = (n: number) => n * LH
            const bad: string[] = []
            for (const [k, want] of Object.entries(fx.positions)) {
                const st = Number(k)
                const first = Math.min(lines, Math.floor(st / LH) + 1)
                const last = Math.min(lines, Math.floor((st + fx.viewport - 1) / LH) + 1)
                const vis = completelyVisibleLines(first, last, st, fx.viewport, top, bottom)
                const got = stickyLayout(stickyCandidates(roots, vis.start, vis.end), st, LH, top, bottom).lines
                if (got.join() !== want.join()) bad.push(`st=${st}: [${got}] != monaco [${want}]`)
            }
            expect(bad).toEqual([])
        })
    }
})

describe('可见范围 = Monaco getVisibleRanges(完整可见的行)', () => {
    const top = (n: number) => (n - 1) * 20, bottom = (n: number) => n * 20
    it('首行被卷掉一点就从下一行算;末行露不全退一行', () => {
        expect(completelyVisibleLines(32, 77, 629, 900, top, bottom)).toEqual({ start: 33, end: 76 })
        expect(completelyVisibleLines(32, 76, 620, 900, top, bottom)).toEqual({ start: 32, end: 76 })
    })
    it('只剩一行时不动', () => {
        expect(completelyVisibleLines(5, 5, 85, 10, top, bottom)).toEqual({ start: 5, end: 5 })
    })
    it('@media 头行被卷掉 9px:Monaco 不钉它(视口首行算 .card 那行)', () => {
        const doc = FX.trees.find(t => t.name === 'sample css')!.doc
        const roots = sticky('css', doc)!
        const vis = completelyVisibleLines(32, 77, 629, 900, top, bottom)
        expect(stickyLayout(stickyCandidates(roots, vis.start, vis.end), 629, 20, top, bottom).lines).toEqual([])
    })
})

describe('解析细节', () => {
    it('json:数组元素和对象属性都进树,根不算;单行的不另起一层', () => {
        const doc = '{\n  "a": [\n    {\n      "b": 1\n    },\n    2\n  ],\n  "c": 1\n}'
        expect(toTree(sticky('json', doc)!)).toEqual([
            { s: 2, e: 6, c: [{ s: 3, e: 4, c: [] }] },
            { s: 8, e: 7, c: [] },
        ])
    })
    it('css:一条规则集的每个选择器各一条,范围到规则集末尾', () => {
        const doc = 'a,\nb {\n  x: 1;\n}'
        expect(toTree(sticky('css', doc)!)).toEqual([{ s: 1, e: 3, c: [] }, { s: 2, e: 3, c: [] }])
    })
    it('html:元素树摊平;<p> 不隐式闭合,结束标签往上找同名祖先', () => {
        const doc = '<div>\n<p>a\n<p>b\n</div>\n<br>\n<x/>'
        expect(toTree(sticky('html', doc)!)).toEqual([
            { s: 1, e: 3, c: [] }, { s: 2, e: 3, c: [] }, { s: 3, e: 3, c: [] }, { s: 5, e: 4, c: [] }, { s: 6, e: 5, c: [] },
        ])
    })
    it('不认识的语言没有 outline 来源;空文档没有符号 → null(退回折叠范围)', () => {
        expect(languageStickyOutline('python')).toBeNull()
        expect(sticky('json', '')).toBeNull()
        expect(sticky('css', '/* only */')).toBeNull()
    })
})

describe('真编辑器:outline 接到 stickyScrollOverlay,编辑后跟着更新', () => {
    it('html 的 outline 是扁平的:滚进 <section> 只钉 <section>(折叠范围会钉 <div> + <section>)', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const body = Array.from({ length: 30 }, (_, i) => `        text ${i}`).join('\n')
        const doc = `<div>\n    <section>\n${body}\n    </section>\n</div>\n`
        const view = new EditorView({ state: EditorState.create({ doc }), parent })
        const lh = view.oracle.lineHeight || 20
        let st = lh * 5
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -st, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: -st, toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view, { outline: languageStickyOutline('html')! })
        const rows = () => [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')].map(r => Number(r.dataset.line))
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(rows()).toEqual([1, 2]) // outline 还没到(首次 50ms 后):折叠范围
        await new Promise(r => setTimeout(r, 80))
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(rows()).toEqual([2])
        // 在前面插三行:旧 outline 先按改动映射,防抖后换成新 outline
        view.dispatch(view.state.update({ changes: { from: 0, insert: '<b>\n</b>\n<i></i>\n' } }))
        st = lh * 8
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(rows()).toEqual([5])
        await new Promise(r => setTimeout(r, 450))
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(rows()).toEqual([5])
        off()
        view.destroy()
        parent.remove()
    })
})
