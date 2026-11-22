// S 组(第三轮):选区背景与当前行的形状对齐 Monaco 0.52。
//
// 选区:Monaco SelectionsOverlay —— 每个视觉行一块满行高的矩形,多行连成一片;选区跨过行尾的那一行
// 多画一个半角字宽(空行也因此有一小段);圆角 3px,凹角用「选区色小块 + 背景色反圆角块」。
// 当前行:Monaco 折行时每个视觉行都铺 lineHighlightBackground,只有光标所在视觉行加边框(current-line-exact)。
//
// jsdom 无布局:按等宽网格桩出几何(同 geometry-fix.test.ts 的思路),每 WRAP 字符折一行。
// 浏览器里的对照见 /tmp/lc-hunt/r3/fix-S/{base,wrap}.ts(左 Monaco 右 lite-monaco)。

import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { highlightLayer, selectionPieces } from '../../src/core/feature/selectionlayer'

const LH = 20
const CW = 8
const TOP = 50
const LEFT = 30

const restores: (() => void)[] = []
afterEach(() => {
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})

function override(obj: object, key: string, desc: PropertyDescriptor) {
    const prev = Object.getOwnPropertyDescriptor(obj, key)
    Object.defineProperty(obj, key, { configurable: true, ...desc })
    restores.push(() => {
        if (prev) Object.defineProperty(obj, key, prev)
        else delete (obj as Record<string, unknown>)[key]
    })
}
const patch = (obj: object, key: string, value: unknown) => override(obj, key, { writable: true, value })

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } } as DOMRect
}
const list = (rs: DOMRect[]) => Object.assign([...rs], { item: (i: number) => rs[i] ?? null }) as unknown as DOMRectList

// 网格几何:行 n 顶 = TOP + 前面各行视觉行数 × LH;wrap>0 时每 wrap 字符一个视觉行。
// 非折叠 range 的 getClientRects 按视觉行拆成多块(真浏览器同样每个视觉行一个 rect)。
function installGrid(wrap = 0) {
    let view: EditorView | null = null
    const rowsOf = (len: number) => wrap ? Math.max(1, Math.ceil(len / wrap)) : 1
    const lineTop = (v: EditorView, n: number) => {
        let rows = 0
        for (let i = 1; i < n; i++) rows += rowsOf(v.state.doc.line(i).length)
        return TOP + rows * LH
    }
    // 列 col 的 (行, x);side<0 时折行点算上一视觉行末尾
    const at = (v: EditorView, pos: number, side: number) => {
        const line = v.state.doc.lineAt(pos)
        const col = pos - line.from
        let row = wrap ? Math.floor(col / wrap) : 0
        if (wrap && side < 0 && col > 0 && col % wrap === 0) row--
        row = Math.min(row, rowsOf(line.length) - 1)
        return { top: lineTop(v, line.number) + row * LH, x: LEFT + (col - row * wrap) * CW, row, line }
    }
    const P = HTMLElement.prototype
    const origBox = P.getBoundingClientRect
    patch(P, 'getBoundingClientRect', function (this: HTMLElement) {
        if (this.classList.contains('cm-line')) {
            if (this.getAttribute('aria-hidden') === 'true') return rect(0, 0, 300, LH)
            if (!view) return rect(0, 0, 0, 0)
            const i = Array.from(view.contentDOM.children).indexOf(this)
            if (i < 0) return rect(0, 0, 0, 0)
            const n = view.viewportStartLine + i
            return rect(LEFT, lineTop(view, n), 600, rowsOf(view.state.doc.line(n).length) * LH)
        }
        if (this.classList.contains('cm-scroller')) return rect(LEFT, TOP, 600, 400)
        if (this.classList.contains('cm-content')) return rect(LEFT, TOP, 600, view ? view.heightMap.height : 0)
        return origBox.call(this)
    } as typeof P.getBoundingClientRect)
    const R = Range.prototype as Range & Record<string, unknown>
    patch(R, 'getBoundingClientRect', function (this: Range) {
        return rect(0, 0, this.toString().length * CW, 15)
    } as Range['getBoundingClientRect'])
    patch(R, 'getClientRects', function (this: Range) {
        const v = view
        if (!v) return list([])
        const a = v.posFromDOM(this.startContainer, this.startOffset)
        if (this.collapsed) {
            const c = at(v, a, 0)
            // Chrome 实测:15px 字形在 20px 行里 caret rect 顶取整到 +2(不是 +2.5),中线比行中线高 0.5px
            return list([rect(c.x, c.top + 2, 0, 15)])
        }
        const b = v.posFromDOM(this.endContainer, this.endOffset)
        const s = at(v, a, 1), e = at(v, b, -1)
        const out: DOMRect[] = []
        for (let row = s.row; row <= e.row; row++) {
            const l = row === s.row ? s.x : LEFT
            const r = row === e.row ? e.x : LEFT + wrap * CW
            out.push(rect(l, s.top + (row - s.row) * LH + 2.5, r - l, 15))
        }
        return list(out)
    } as Range['getClientRects'])
    override(P, 'clientHeight', { get(this: HTMLElement) { return this.classList.contains('cm-scroller') ? 400 : 0 } })
    override(P, 'clientWidth', { get(this: HTMLElement) { return this.classList.contains('cm-scroller') ? 600 : 0 } })
    return (doc: string, sel: EditorSelection, lineWrapping = wrap > 0) => {
        const host = document.body.appendChild(document.createElement('div'))
        view = new EditorView({
            state: EditorState.create({ doc, selection: sel, extensions: EditorState.allowMultipleSelections.of(true) }),
            parent: host,
            drawSelection: true,
            lineWrapping,
            overlays: [v => highlightLayer(v)],
        })
        view.remeasure()
        view.dispatch(view.state.update({ selection: sel }))
        return view
    }
}

type Box = { cls: string, left: number, top: number, width: number, height: number }
const boxes = (v: EditorView, sel: string): Box[] => Array.from(v.dom.querySelectorAll<HTMLElement>(sel)).map(e => ({
    cls: e.className,
    left: parseFloat(e.style.left),
    top: parseFloat(e.style.top),
    width: parseFloat(e.style.width),
    height: parseFloat(e.style.height),
}))
// 只看主体块(不含凹角小块):按 top 排序
const bodies = (v: EditorView) => boxes(v, '.cm-selectedText').filter(b => !b.cls.includes('cm-selInner')).sort((a, b) => a.top - b.top)

describe('选区背景:满行高矩形、多行连成一片(Monaco SelectionsOverlay)', () => {
    it('跨 4 行(含空行):每行一块 LH 高、上下无缝;跨过行尾的行多一个字宽,空行也有一段', () => {
        const mount = installGrid()
        const doc = 'abcdef\n  xy\n\nlast line'
        const s = EditorState.create({ doc })
        const from = 2, to = s.doc.line(4).from + 2
        const v = mount(doc, EditorSelection.single(from, to))
        const b = bodies(v)
        expect(b.length).toBe(4)
        for (const x of b) expect(x.height).toBe(LH)
        for (let i = 1; i < b.length; i++) expect(b[i].top).toBe(b[i - 1].top + LH)
        // 第 1 行从第 2 列到行尾 + 一个字宽
        expect(b[0].left).toBe(LEFT + 2 * CW)
        expect(b[0].width).toBe(4 * CW + CW)
        // 第 2 行整行 + 一个字宽;空行 = 一个字宽;末行只到选区终点,不加
        expect(b[1].width).toBe(4 * CW + CW)
        expect(b[2].left).toBe(LEFT)
        expect(b[2].width).toBe(CW)
        expect(b[3].width).toBe(2 * CW)
    })

    it('选区止于下一行行首:那一行出一块 0 宽(Monaco 同样画,它决定上一行的下圆角)', () => {
        const mount = installGrid()
        const v = mount('abc\ndef', EditorSelection.single(0, 4))
        const b = bodies(v)
        expect(b.map(x => x.width)).toEqual([3 * CW + CW, 0])
    })

    it('空选区不画;视口外的选区部分不画(大选区只画视口内)', () => {
        const mount = installGrid()
        const v = mount('abc\ndef', EditorSelection.single(1))
        expect(bodies(v).length).toBe(0)
        const many = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n')
        const w = mount(many, EditorSelection.single(0, many.length))
        const n = bodies(w).length
        expect(n).toBeGreaterThan(10)
        expect(n).toBeLessThan(200)
    })

    it('折行:按视觉行画,软折行处不加字宽,只在逻辑行尾加', () => {
        const mount = installGrid(10)
        // 第 1 行 25 字 = 视觉行 [0,10) [10,20) [20,25]
        const doc = 'a'.repeat(25) + '\nbb'
        const v = mount(doc, EditorSelection.single(5, 28))
        const b = bodies(v)
        expect(b.map(x => x.top - b[0].top)).toEqual([0, LH, 2 * LH, 3 * LH])
        expect(b.map(x => x.width)).toEqual([5 * CW, 10 * CW, 5 * CW + CW, 2 * CW])
        expect(b[1].left).toBe(LEFT)
    })

    it('多光标多选区:每个选区首行上缩 1px、末行下缩 1px(Monaco hasMultipleSelections)', () => {
        const mount = installGrid()
        const v = mount('abc\ndef\nghi\njkl', EditorSelection.create([EditorSelection.range(0, 5), EditorSelection.range(9, 13)]))
        const b = bodies(v)
        expect(b.length).toBe(4)
        expect([b[0].height, b[1].height]).toEqual([LH - 1, LH - 1])
        expect(b[0].top).toBe(b[1].top - LH + 1)
    })
})

describe('selectionPieces:Monaco 圆角算法(实测 0.52 选 9:1-14:1 的 class 序列)', () => {
    it('外角圆、平齐不圆、凹角出两块(选区色 + 背景色反圆角)', () => {
        // Monaco 实测 rows(left,width):[0,8] [0,415] [0,305] [0,180] [0,16] [0,0]
        const rows = [8, 415, 305, 180, 16, 0].map((w, i) => ({ top: i * 20, left: 0, width: w }))
        const p = selectionPieces(rows, 20, 8, false)
        const main = p.filter(x => x.cls.startsWith('cm-selectedText') && !x.cls.includes('cm-selInner'))
        const corner = (c: string) => c.split(' ').filter(x => /^cm-(tl|tr|bl|br)$/.test(x)).sort().join(' ')
        expect(main.map(x => corner(x.cls))).toEqual([
            'cm-tl cm-tr', 'cm-br cm-tr', 'cm-br', 'cm-br', 'cm-br', 'cm-bl cm-br cm-tr',
        ])
        // 凹角:第 1 行右侧(下一行更长)、第 3/4/5 行右侧(上一行更长)各一对小块,宽 10
        const inner = p.filter(x => x.cls.includes('cm-selInner'))
        expect(inner.map(x => [x.top, x.left, x.width])).toEqual([
            [0, 8, 10], [0, 8, 10],
            [40, 305, 10], [40, 305, 10],
            [60, 180, 10], [60, 180, 10],
            [80, 16, 10], [80, 16, 10],
        ])
        // 凹角先于主体输出(Monaco #77777:凹角块不能盖住别的选区)
        expect(p.findIndex(x => x.cls.includes('cm-selInner'))).toBeLessThan(p.findIndex(x => !x.cls.includes('cm-selInner')))
    })
})

describe('当前行:折行时只框光标所在视觉行(Monaco current-line-exact)', () => {
    it('光标在第 2 视觉行:3 个视觉行都铺底色,边框只在第 2 行', () => {
        const mount = installGrid(10)
        const v = mount('a'.repeat(25) + '\nbb', EditorSelection.single(15))
        const all = boxes(v, '.cm-currentLine').sort((a, b) => a.top - b.top)
        expect(all.map(x => x.height)).toEqual([LH, LH, LH])
        expect(all.map(x => x.top - all[0].top)).toEqual([0, LH, 2 * LH])
        const exact = boxes(v, '.cm-currentLine-exact')
        expect(exact.length).toBe(1)
        expect(exact[0].top).toBe(all[1].top)
    })

    it('不折行:一条当前行,带边框', () => {
        const mount = installGrid()
        const v = mount('abc\ndef', EditorSelection.single(5))
        const all = boxes(v, '.cm-currentLine')
        expect(all.length).toBe(1)
        expect(all[0].cls).toContain('cm-currentLine-exact')
        expect(all[0].height).toBe(LH)
    })
})

describe('光标:顶对齐所在视觉行的行盒顶,高 = 行高', () => {
    it('字形 rect 有半像素偏移也不影响:top = 行顶', () => {
        const mount = installGrid(10)
        const v = mount('a'.repeat(25) + '\nbb', EditorSelection.single(15))
        const c = v.dom.querySelector('.cm-cursor-primary') as HTMLElement
        expect(parseFloat(c.style.height)).toBe(LH)
        // 网格里 caret rect 顶 = 行顶 + 2(同 Chrome),按字形中线反推会落在行顶上方 0.5px
        expect(parseFloat(c.style.top)).toBe(LH)
    })
})

describe('主题 CSS', () => {
    it('选区块:聚焦 selectionBackground、失焦 inactive;原生 ::selection 透明;mark 只在没挂 highlightLayer 时上色', async () => {
        const { liteMonacoBaseCSS } = await import('../../src/product/themecss')
        const css = liteMonacoBaseCSS()
        expect(css).toContain('.cm-selectedText { background-color: var(--lm-editor-inactiveSelectionBackground); }')
        expect(css).toContain('.cm-editor.cm-focused .cm-selectedText { background-color: var(--lm-editor-selectionBackground); }')
        expect(css).toContain('.cm-content ::selection { background: transparent; }')
        expect(css).toContain('.cm-editor:not(.cm-focusTracked) .cm-selectionBackground')
        expect(css).not.toMatch(/(^|\n)\.cm-selectionBackground \{/)
    })

    it('默认行高 = round(字号 × GOLDEN_LINE_HEIGHT_RATIO) 取整到像素(Monaco fontInfo:mac 12px × 1.5 → 18px,其余 14px × 1.35 → 19px)', async () => {
        const { liteMonacoBaseCSS } = await import('../../src/product/themecss')
        expect(liteMonacoBaseCSS('mac').match(/\n\.cm-editor \{[^}]*\}/)![0]).toContain('line-height: round(1.5em, 1px)')
        expect(liteMonacoBaseCSS('win').match(/\n\.cm-editor \{[^}]*\}/)![0]).toContain('line-height: round(1.35em, 1px)')
    })
})
