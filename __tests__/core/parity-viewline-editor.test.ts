// 对齐套件里 viewLineRenderer.test.ts 的「编辑器正文怎么画一行」部分,逐条翻译成自有单测。
//
// Monaco 的原测断言的是 renderViewLine 吐的 HTML 串和 CharacterMapping。lite-monaco 正文不拼 HTML 串:
// 一行是 contenteditable 里真实的 DOM(真 \t、真空格、white-space: pre),空白记号 / 行内装饰 / 控制字符
// 都是 DOM 上的 mark 和 widget。所以这里把每条原测的「输入 → 期望」翻成「同样的输入 → 编辑器 DOM / 公共 API 上看得到的同一件事」:
//   · 空白记号:哪些字符被画成点 / 箭头(原版的 mtkw / mtkz 里的 · → ),用 DOM 里 cm-selWs / cm-selTab 覆盖的偏移比
//   · 行内装饰:before / after / inlineClassName 出现的位置与先后
//   · 控制字符 / 不可见字符:画成什么
//   · 字符映射(CharacterMapping):DOM 位置 ↔ 文档偏移互逆(posFromDOM / domAtPos)
// 标题沿用原版 suite + 测试标题。期望值里的空白偏移取自原版 .snap 快照(脚本从快照 HTML 里数 · / → 得到,
// 不是手填),所以和 Monaco 实际画出来的一致。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { posFromDOM, domAtPos } from '../../src/core/view/dombridge'
import { visibleColumn, columnFromVisible } from '../../src/core/edit/vcol'
import { findSpecialChars } from '../../src/core/feature/specialchar'

afterEach(cleanup)

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })

/** 一行里按 token 切色的假高亮器:parts = [结束偏移, 色号],色号 → #0000NN(每个色号一个颜色,相邻同号也各自一段) */
function partsHl(content: string, parts: [number, number][]) {
    return {
        codeToTokens: (code: string) => {
            if (code !== content) return { tokens: code.split('\n').map(l => [{ content: l, offset: 0 }]) }
            let start = 0
            const toks = parts.map(([end, c]) => {
                const t = { content: content.substring(start, end), offset: start, color: '#' + (0x100000 + c * 0x111).toString(16) }
                start = end
                return t
            })
            return { tokens: [toks] }
        },
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['typescript', 'text'],
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    }
}

interface OpenOpts { options?: Record<string, unknown>, parts?: [number, number][], decos?: unknown[], selections?: [number, number][] }
function open(doc: string, o: OpenOpts = {}) {
    const extra: Record<string, unknown> = { options: o.options ?? {} }
    if (o.parts) extra.highlighter = partsHl(doc, o.parts)
    const ed = mountEditor(doc, extra)
    if (o.decos?.length) ed.deltaDecorations([], o.decos)
    if (o.selections) {
        ed.setSelections(o.selections.map(([a, b]) => ({ selectionStartLineNumber: 1, selectionStartColumn: a + 1, positionLineNumber: 1, positionColumn: b + 1 })))
    }
    const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
    return { ed, line }
}

const WS = ['cm-selWs', 'cm-selTab']
/** 被画成空白记号(点 / 箭头)的字符偏移。widget(装饰、控制字符)不占偏移 */
function wsOffsets(line: Element): number[] {
    const out: number[] = []
    let pos = 0
    const walk = (n: Node, ws: boolean) => {
        if (n.nodeType === 3) {
            for (const ch of (n as Text).data) { if (ws && (ch === ' ' || ch === '\t')) out.push(pos); pos += ch.length }
            return
        }
        const el = n as Element
        if (el.hasAttribute?.('data-cm-widget')) return
        const w = ws || WS.some(c => el.classList?.contains(c))
        n.childNodes.forEach(c => walk(c, w))
    }
    line.childNodes.forEach(c => walk(c, false))
    return out
}

/** 一行文档字符(不含 widget)按 DOM 顺序拼出来 */
function docText(line: Element): string {
    let s = ''
    const walk = (n: Node) => {
        if (n.nodeType === 3) { s += (n as Text).data; return }
        if ((n as Element).hasAttribute?.('data-cm-widget')) return
        n.childNodes.forEach(walk)
    }
    line.childNodes.forEach(walk)
    return s
}

/** DOM 顺序里:文本片段(t:)与装饰元素(w: 类名)。widget 内的文字不展开 */
function sequence(line: Element, classes: string[]): string[] {
    const out: string[] = []
    const walk = (n: Node) => {
        if (n.nodeType === 3) {
            const t = (n as Text).data
            if (out.length && out[out.length - 1].startsWith('t:')) out[out.length - 1] += t
            else out.push('t:' + t)
            return
        }
        const el = n as Element
        const hit = classes.find(c => el.classList?.contains(c))
        if (hit && el.hasAttribute('data-cm-widget')) { out.push('w:' + hit); return }
        n.childNodes.forEach(walk)
    }
    line.childNodes.forEach(walk)
    return out
}

const ALL = (s: string) => [...s].map((_, i) => i)

describe('viewLineRenderer.renderLine', () => {
    it('overflow', () => {
        // 原版:stopRenderingLineAfter = 6 把 12 个 token 的 'Hello world!' 截成 6 个 + 「Show more (6 chars)」,boundary 下单个空格不画点。
        // 差异(有意):lite-monaco 正文不截断。DOM 必须 ≡ 文档(输入 / 选区 / 查找都靠这条双射),长行靠扫描窗口控制装饰成本
        // (core/view/scanwindow.ts),不靠删字。所以这里断言:选项被接受、12 个 token 各一段、文字一个不少、单个空格不画点。
        const parts = Array.from({ length: 12 }, (_, i) => [i + 1, i] as [number, number])
        const { ed, line } = open('Hello world!', { parts, options: { stopRenderingLineAfter: 6, renderWhitespace: 'boundary' } })
        expect(docText(line)).toBe('Hello world!')
        expect(line.textContent).toBe('Hello world!')
        expect(line.querySelector('.mtkoverflow')).toBeNull()
        expect(line.querySelectorAll(':scope > span').length).toBe(12)
        expect(wsOffsets(line)).toEqual([])
        expect(ed.getOption(133 /* stopRenderingLineAfter */)).toBe(6)
    })
})

// ── renderWhitespace 各档:哪些字符被画成点 / 箭头 ──
// 原版 createLineParts 系列把 [内容, token, faux indent, 档位, 选区] 渲染成 HTML,断言里 · / → 出现在哪些字符上。
// 期望偏移 = 原版快照里的 · / → 所在字符偏移(含 tab:一个 tab 一个箭头)。
// faux indent(折行续行的缩进,原版把它当文本的头 N 个字符且不画记号):lite-monaco 的续行缩进是 CSS(--cm-wrap-indent),
// 不在文本里,所以对应用例的文档去掉头 N 个字符,偏移同步前移 N。
interface WsCase { title: string, doc: string, parts: [number, number][], mode: string, selections?: [number, number][], expected: number[] }
const WS_CASES: WsCase[] = [
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace - 4 leading spaces', doc: '    Hello world!    ', parts: [[4, 1], [6, 2], [20, 3]], mode: 'boundary', expected: [0, 1, 2, 3, 16, 17, 18, 19] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace - 8 leading spaces', doc: '        Hello world!        ', parts: [[8, 1], [10, 2], [28, 3]], mode: 'boundary', expected: [...ALL('        '), ...ALL('        ').map(i => i + 20)] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace - 2 leading tabs', doc: '\t\tHello world!\t', parts: [[2, 1], [4, 2], [15, 3]], mode: 'boundary', expected: [0, 1, 14] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace - mixed leading spaces and tabs', doc: '  \t\t  Hello world! \t  \t   \t    ', parts: [[6, 1], [8, 2], [31, 3]], mode: 'boundary', expected: [0, 1, 2, 3, 4, 5, ...Array.from({ length: 13 }, (_, i) => 18 + i)] },
    // 原版内容是 '\t\t  Hello…',头 2 个字符(两个 tab)是 faux indent,不画
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace skips faux indent', doc: '  Hello world! \t  \t   \t    ', parts: [[2, 1], [4, 2], [27, 3]], mode: 'boundary', expected: [0, 1, ...Array.from({ length: 13 }, (_, i) => 14 + i)] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts does not emit width for monospace fonts', doc: '  Hello world! \t  \t   \t    ', parts: [[2, 1], [4, 2], [27, 3]], mode: 'boundary', expected: [0, 1, ...Array.from({ length: 13 }, (_, i) => 14 + i)] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace in middle but not for one space', doc: 'it  it it  it', parts: [[6, 1], [7, 2], [13, 3]], mode: 'boundary', expected: [2, 3, 9, 10] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for all in middle', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'all', expected: [0, 6, 13] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with no selections', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'selection', expected: [] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with whole line selection', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'selection', selections: [[0, 14]], expected: [0, 6, 13] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with selection spanning part of whitespace', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'selection', selections: [[0, 5]], expected: [0] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with multiple selections', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'selection', selections: [[0, 5], [9, 14]], expected: [0, 13] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with multiple, initially unsorted selections', doc: ' Hello world!\t', parts: [[4, 0], [6, 1], [14, 2]], mode: 'selection', selections: [[9, 14], [0, 5]], expected: [0, 13] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for selection with selections next to each other', doc: ' * S', parts: [[4, 0]], mode: 'selection', selections: [[0, 1], [1, 2], [2, 3]], expected: [0, 2] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for trailing with leading, inner, and without trailing whitespace', doc: ' Hello world!', parts: [[4, 0], [6, 1], [14, 2]], mode: 'trailing', expected: [] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for trailing with leading, inner, and trailing whitespace', doc: ' Hello world! \t', parts: [[4, 0], [6, 1], [15, 2]], mode: 'trailing', expected: [13, 14] },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for trailing with 8 leading and 8 trailing whitespaces', doc: '        Hello world!        ', parts: [[8, 1], [10, 2], [28, 3]], mode: 'trailing', expected: ALL('        ').map(i => i + 20) },
    { title: 'viewLineRenderer.renderLine 2 createLineParts render whitespace for trailing with line containing only whitespaces', doc: ' \t ', parts: [[2, 0], [3, 1]], mode: 'trailing', expected: [0, 1, 2] },
    { title: 'viewLineRenderer.renderLine 2 issue #22832: Consider fullwidth characters when rendering tabs (render whitespace)', doc: 'asd = "擦"\t\t#asd', parts: [[15, 3]], mode: 'all', expected: [3, 5, 9, 10] },
    // 原版:这一行是被折行的一段(continuesWithWrappedLine),行尾的单个空格在折点上,boundary 不画点。
    // 折行在 lite-monaco 里是浏览器的事,模型行没有「这一段」,这个空格就是词间的单个空格,后面接着下一段的字
    { title: 'viewLineRenderer.renderLine 2 issue #38123: editor.renderWhitespace: "boundary" renders whitespace at line wrap point when line is wrapped', doc: 'This is a long line which never uses more than two spaces. next', parts: [[59, 3], [63, 3]], mode: 'boundary', expected: [] },
    { title: 'viewLineRenderer.renderLine typical line', doc: '\t    export class Game { // http://test.com     ', parts: [[5, 1], [11, 2], [12, 3], [17, 4], [18, 5], [22, 6], [23, 7], [24, 8], [25, 9], [28, 10], [43, 11], [48, 12]], mode: 'boundary', expected: [0, 1, 2, 3, 4, 43, 44, 45, 46, 47] },
    { title: 'viewLineRenderer.renderLine 2 issue #91936: Semantic token color highlighting fails on line with selected text', doc: "                    else if ($s = 08) then '\\b'", parts: [[20, 1], [24, 15], [25, 1], [27, 15], [28, 1], [29, 1], [31, 16], [32, 1], [33, 1], [34, 1], [36, 6], [37, 1], [38, 1], [42, 15], [43, 1], [47, 11]], mode: 'selection', selections: [[0, 47]], expected: [...ALL(' '.repeat(20)), 24, 27, 31, 33, 37, 42] },
]

describe('renderWhitespace(原版 createLineParts 系列)', () => {
    for (const c of WS_CASES) {
        it(c.title, () => {
            const { line } = open(c.doc, { parts: c.parts, options: { renderWhitespace: c.mode }, selections: c.selections })
            expect(docText(line)).toBe(c.doc)
            expect(wsOffsets(line)).toEqual(c.expected)
        })
    }
})

// ── RTL / bidi ──
describe('viewLineRenderer.renderLine(RTL)', () => {
    it('issue #99589: Rendering whitespace influences bidi layout', () => {
        // 原版:renderWhitespace 'all' 只在行首四个空格上画点;RTL 的串里的空格不画 ——
        // 把 RTL 文字里的空格拆成单独的记号 span 会改变 bidi 排版(串的显示顺序变了)。
        const doc = '    ["🖨️ چاپ فاکتور","🎨 تنظیمات"]'
        const { line } = open(doc, { parts: [[5, 2], [21, 3], [22, 2], [34, 3], [35, 2]], options: { renderWhitespace: 'all' } })
        expect(docText(line)).toBe(doc)
        expect(wsOffsets(line)).toEqual([0, 1, 2, 3])
    })

    it('issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages', () => {
        // 原版的 HTML 部分在 parity-viewline-colorize 里已逐字比对(dir=rtl + unicode-bidi:isolate 的包裹);
        // 编辑器正文不拆 span 包 dir,文字原样放进一个文本流,让浏览器的 bidi 算法按原顺序排。这里断言文字与行内偏移映射不被改动。
        const doc = 'var קודמות = "מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם";'
        const { ed, line } = open(doc, { parts: [[3, 6], [13, 1], [66, 20], [67, 1]] })
        expect(docText(line)).toBe(doc)
        for (let i = 0; i <= doc.length; i++) {
            const { node, offset } = domAtPos(ed.contentDOM, ed.state.doc, i)
            expect(posFromDOM(ed.contentDOM, ed.state.doc, node, offset)).toBe(i)
        }
    })

    it('issue #137036: Issue in RTL languages in recent versions', () => {
        const doc = '<option value="العربية">العربية</option>'
        const { ed, line } = open(doc, { parts: [[1, 2], [7, 3], [8, 4], [13, 5], [14, 4], [23, 6], [24, 2], [31, 4], [33, 2], [39, 3], [40, 2]] })
        expect(docText(line)).toBe(doc)
        // 每个 token 一段,段内文字与原 token 一致
        const spans = [...line.querySelectorAll(':scope > span')].map(e => e.textContent)
        expect(spans.join('')).toBe(doc)
        expect(spans.length).toBe(11)
        for (let i = 0; i <= doc.length; i++) {
            const { node, offset } = domAtPos(ed.contentDOM, ed.state.doc, i)
            expect(posFromDOM(ed.contentDOM, ed.state.doc, node, offset)).toBe(i)
        }
    })

    it('issue #260239: HTML containing bidirectional text is rendered incorrectly', () => {
        const doc = '<p class="myclass" title="العربي">نشاط التدويل!</p>'
        const parts: [number, number][] = [[1, 1], [2, 2], [3, 3], [8, 4], [9, 5], [10, 6], [17, 7], [18, 6], [19, 3], [24, 4], [25, 5], [26, 6], [32, 8], [33, 6], [34, 1], [47, 9], [48, 1], [49, 2], [50, 2], [51, 1]]
        const { ed, line } = open(doc, { parts })
        expect(docText(line)).toBe(doc)
        expect([...line.querySelectorAll(':scope > span')].map(e => e.textContent)).toEqual(parts.map(([e], i) => doc.substring(i ? parts[i - 1][0] : 0, e)))
        for (let i = 0; i <= doc.length; i++) {
            const { node, offset } = domAtPos(ed.contentDOM, ed.state.doc, i)
            expect(posFromDOM(ed.contentDOM, ed.state.doc, node, offset)).toBe(i)
        }
    })

    it('issue #6885: Does not split large tokens in RTL text', () => {
        const doc = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.'
        const { line } = open(doc, { parts: [[doc.length, 1]] })
        expect(docText(line)).toBe(doc)
        expect(line.querySelectorAll(':scope > span').length).toBe(1)
    })
})

// ── 长 token / 连字 / 代理对 ──
describe('viewLineRenderer.renderLine(长 token)', () => {
    const TEXT = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.'

    it('issue #21476: Does not split large tokens when ligatures are on', () => {
        // 原版:fontLigatures 开着时 101 列的 token 不按 50 列拆(拆在连字中间会打断连字),而是按空格后断成三段。
        // 编辑器正文不按 50 列拆 token —— 一个 token 一个 span —— 连字不会被打断,连字开关也被接受。
        const doc = TEXT.substring(0, 101)
        const { ed, line } = open(doc, { parts: [[101, 1]], options: { fontLigatures: true } })
        expect(docText(line)).toBe(doc)
        // 第 101 个字符是空格,行尾空白有自己的高亮 span(cm-trailingSpace);除开它,token 是整段
        const spans = [...line.querySelectorAll(':scope > span:not(.cm-trailingSpace)')]
        expect(spans.length).toBe(1)
        expect(spans[0].textContent).toBe(doc.trimEnd())
        expect(ed.getOption(60 /* fontLigatures */)).toBe('"liga" on, "calt" on')
    })

    it('issue #33525: Long line with ligatures takes a long time to paint decorations', () => {
        const doc = 'append data to '.repeat(13).trimEnd()
        const { line } = open(doc, { parts: [[doc.length, 3]], options: { fontLigatures: true } })
        expect(docText(line)).toBe(doc)
        expect(line.querySelectorAll(':scope > span').length).toBe(1)
    })

    it('issue #33525: Long line with ligatures takes a long time to paint decorations - not possible', () => {
        const doc = 'appenddatato'.repeat(13)
        const { line } = open(doc, { parts: [[doc.length, 3]], options: { fontLigatures: true } })
        expect(docText(line)).toBe(doc)
        expect(line.querySelectorAll(':scope > span').length).toBe(1)
    })
})

// ── 行内装饰(inlineClassName / beforeContentClassName / afterContentClassName) ──
// 原版 LineDecoration 的 Before / After 类型 = Monaco 公共 API 里装饰的 beforeContentClassName / afterContentClassName(伪元素内容),
// Regular = inlineClassName。Monaco 把它们画成带类名的 span(Before / After 夹在文字里);lite-monaco 画成零宽的 widget span
// (data-cm-widget)。位置(在第几个字符前)和先后顺序是用户看得见的,所以断言 DOM 顺序;文字一个字符不能多或少。
const deco = (c1: number, c2: number, options: Record<string, unknown>) => ({ range: R(1, c1, 1, c2), options: { description: 'd', ...options } })

describe('viewLineRenderer.renderLine(行内装饰)', () => {
    it('issue #18616: Inline decorations ending at the text length are no longer rendered', () => {
        const doc = 'https://microsoft.com'
        const { line } = open(doc, { parts: [[21, 3]], decos: [deco(1, 22, { inlineClassName: 'link' })] })
        const link = line.querySelectorAll('.link')
        expect([...link].map(e => e.textContent).join('')).toBe(doc)
    })

    it('issue #19207: Link in Monokai is not rendered correctly', () => {
        const doc = "'let url = `http://***/_api/web/lists/GetByTitle(\\'Teambuildingaanvragen\\')/items`;'"
        const { line } = open(doc, { parts: [[49, 6], [51, 4], [72, 6], [74, 4], [84, 6]], decos: [deco(13, 51, { inlineClassName: 'lk' })] })
        // 装饰范围 13..51 跨过 token 边界(49):链接文字完整,且跨越的两种颜色都在里面
        const text = [...line.querySelectorAll('.lk')].filter(e => !e.querySelector('.lk')).map(e => e.textContent).join('')
        expect(text).toBe(doc.substring(12, 50))
        expect(docText(line)).toBe(doc)
    })

    it('issue #91178: after decoration type shown before cursor', () => {
        // After 与 Before 装饰在同一位置(第 13 列):Before(dec2)先,After(dec1)后,不管谁先加
        const doc = '//just a comment'
        const { line } = open(doc, {
            parts: [[16, 1]],
            decos: [deco(12, 13, { afterContentClassName: 'dec1' }), deco(13, 14, { beforeContentClassName: 'dec2' })],
        })
        expect(sequence(line, ['dec1', 'dec2'])).toEqual(['t://just a com', 'w:dec2', 'w:dec1', 't:ment'])
    })

    it('createLineParts can handle unsorted inline decorations', () => {
        // 'Hello world':a=[5,7) b=[1,3) c=[2,8) 乱序加入,每个字符的类集合不受顺序影响
        const { line } = open('Hello world', {
            decos: [deco(5, 7, { inlineClassName: 'a' }), deco(1, 3, { inlineClassName: 'b' }), deco(2, 8, { inlineClassName: 'c' })],
        })
        const classesAt: string[][] = []
        const walk = (n: Node, cls: string[]) => {
            if (n.nodeType === 3) { for (let k = 0; k < (n as Text).length; k++) classesAt.push([...cls].sort()); return }
            const own = ['a', 'b', 'c'].filter(c => (n as Element).classList?.contains(c))
            n.childNodes.forEach(ch => walk(ch, [...cls, ...own]))
        }
        line.childNodes.forEach(c => walk(c, []))
        // H e l l o ␣ w o r l d
        expect(classesAt).toEqual([['b'], ['b', 'c'], ['c'], ['c'], ['a', 'c'], ['a', 'c'], ['c'], [], [], [], []])
    })

    it('issue #11485: Visible whitespace conflicts with before decorator attachment', () => {
        const { line } = open('\tbla', { parts: [[4, 3]], options: { renderWhitespace: 'all' }, decos: [deco(1, 2, { beforeContentClassName: 'before' })] })
        // Before 装饰挂在 tab 前,tab 的箭头记号仍在
        expect(sequence(line, ['before'])[0]).toBe('w:before')
        expect(wsOffsets(line)).toEqual([0])
        expect(docText(line)).toBe('\tbla')
    })

    it('issue #32436: Non-monospace font + visible whitespace + After decorator causes line to "jump"', () => {
        const { line } = open('\tbla', { parts: [[4, 3]], options: { renderWhitespace: 'all' }, decos: [deco(2, 3, { beforeContentClassName: 'before' })] })
        expect(sequence(line, ['before'])).toEqual(['t:\t', 'w:before', 't:bla'])
        expect(wsOffsets(line)).toEqual([0])
    })

    it("issue #30133: Empty lines don't render inline decorations", () => {
        const { line } = open('', { decos: [deco(1, 1, { beforeContentClassName: 'before' })] })
        expect(sequence(line, ['before'])).toEqual(['w:before'])
    })

    it('issue #37208: Collapsing bullet point containing emoji in Markdown document results in [??] character', () => {
        // 装饰范围 7..8 落在 🙏 的两个码元中间:不能把代理对劈开(会画出 [??]),整个 emoji 在装饰里
        const doc = '  1. 🙏'
        const { line } = open(doc, { parts: [[7, 3]], options: { tabSize: 2 }, decos: [deco(7, 8, { inlineClassName: 'inline-folded' })] })
        expect(docText(line)).toBe(doc)
        const folded = [...line.querySelectorAll('.inline-folded')].map(e => e.textContent).join('')
        expect(folded).toBe('🙏')
    })

    it('issue #37401 #40127: Allow both before and after decorations on empty line', () => {
        const { line } = open('', { decos: [deco(1, 1, { beforeContentClassName: 'before' }), deco(1, 1, { afterContentClassName: 'after' })] })
        expect(sequence(line, ['before', 'after'])).toEqual(['w:before', 'w:after'])
    })

    it('issue #118759: enable multiple text editor decorations in empty lines', () => {
        // 加入顺序 after1 after2 before1 before2;显示顺序 Before 们在前、After 们在后,各自保持加入顺序
        const { line } = open('', {
            decos: [
                deco(1, 1, { afterContentClassName: 'after1' }), deco(1, 1, { afterContentClassName: 'after2' }),
                deco(1, 1, { beforeContentClassName: 'before1' }), deco(1, 1, { beforeContentClassName: 'before2' }),
            ],
        })
        expect(sequence(line, ['before1', 'before2', 'after1', 'after2'])).toEqual(['w:before1', 'w:before2', 'w:after1', 'w:after2'])
    })

    it('issue #38935: GitLens end-of-line blame no longer rendering', () => {
        const { line } = open('\t}', {
            parts: [[2, 3]],
            decos: [deco(3, 3, { beforeContentClassName: 'ced-3 ced-3b' }), deco(3, 3, { afterContentClassName: 'ced-4 ced-4b' })],
        })
        expect(sequence(line, ['ced-3', 'ced-4'])).toEqual(['t:\t}', 'w:ced-3', 'w:ced-4'])
    })

    it('issue #136622: Inline decorations are not rendering on non-ASCII lines when renderControlCharacters is on', () => {
        const { line } = open('some text £', {
            parts: [[11, 3]], options: { renderControlCharacters: true },
            decos: [deco(4, 5, { afterContentClassName: 'inlineDec1' }), deco(6, 7, { beforeContentClassName: 'inlineDec2' })],
        })
        // 原版:'some' | dec1 | ' ' | dec2 | 'text £'(After 在第 5 列前、Before 在第 6 列前)
        expect(sequence(line, ['inlineDec1', 'inlineDec2'])).toEqual(['t:some', 'w:inlineDec1', 't: ', 'w:inlineDec2', 't:text £'])
    })

    it('issue #124038: Multiple end-of-line text decorations get merged', () => {
        const { line } = open('    if', {
            parts: [[4, 1], [6, 2]], options: { renderWhitespace: 'all' },
            decos: [deco(7, 7, { beforeContentClassName: 'ced-3' }), deco(7, 7, { afterContentClassName: 'ced-4' }), deco(7, 7, { afterContentClassName: 'ghost' })],
        })
        // 行尾三个装饰各自独立,不合并成一个;前导空格仍画点
        expect(sequence(line, ['ced-3', 'ced-4', 'ghost'])).toEqual(['t:    if', 'w:ced-3', 'w:ced-4', 'w:ghost'])
        expect(wsOffsets(line)).toEqual([0, 1, 2, 3])
    })
})

// ── 控制字符 / 不可见字符 / 特殊空白 ──
/** 行里 widget(控制字符、不可见字符)的 [文档偏移, 显示文字] */
function widgets(line: Element): [number, string][] {
    return [...line.querySelectorAll('[data-cm-widget-from]')].filter(e => (e as HTMLElement).dataset.cmWidget === '1').map(e => [Number((e as HTMLElement).dataset.cmWidgetFrom), e.textContent ?? ''])
}

describe('viewLineRenderer.renderLine(控制字符)', () => {
    it('replaces some bad characters', () => {
        // 原版:NUL → &#00;,BOM / LS → U+FFFD。编辑器里:NUL 画成 ␀,LS(U+2028)与 BOM 画成替换字符的 widget;文字不丢
        const nul = open('a\0b').line
        expect(widgets(nul)).toEqual([[1, '␀']])
        const bom = open('a﻿b').line
        expect(widgets(bom)).toEqual([[1, '�']])
        const ls = open('a b').line
        expect(widgets(ls)).toEqual([[1, '�']])
    })

    it('escapes HTML markup', () => {
        for (const [text, esc] of [['a<b', 'a&lt;b'], ['a>b', 'a&gt;b'], ['a&b', 'a&amp;b']]) {
            const { line } = open(text)
            expect(line.textContent).toBe(text)
            expect(line.innerHTML).toContain(esc)
        }
    })

    it('issue #95685: Uses unicode replacement character for Paragraph Separator', () => {
        const { line } = open('var ftext = [ "Und", "dann", "eines"];')
        expect(widgets(line)).toEqual([[13, '�']])
        expect(docText(line)).toBe('var ftext = ["Und", "dann", "eines"];')
    })

    it('issue #119416: Delete Control Character (U+007F / &#127;) displayed as space', () => {
        const { line } = open('[\x7f] [\0]', { parts: [[7, 3]], options: { renderControlCharacters: true } })
        expect(widgets(line)).toEqual([[1, '␡'], [5, '␀']])
    })

    it('issue #116939: Important control characters aren\'t rendered', () => {
        const doc = 'transferBalance(5678,‮6776,4321‬,"USD");'
        const { line } = open(doc, { parts: [[42, 3]], options: { renderControlCharacters: true } })
        // 双向控制符(U+202E / U+202C)画成 [U+XXXX],不当不可见字符放过(特洛伊源码攻击)
        expect(widgets(line)).toEqual([[21, '[U+202E]'], [31, '[U+202C]']])
        expect(docText(line)).toBe(doc.replace(/[‮‬]/g, ''))
    })

    it('renderControlCharacters: false 时不画控制字符字形(原版 renderControlCharacters 开关)', () => {
        const on = open('a\x1bb', { options: { renderControlCharacters: true } }).line
        const off = open('a\x1bb', { options: { renderControlCharacters: false } }).line
        expect(widgets(on)).toEqual([[1, '␛']])
        expect(widgets(off).some(([, t]) => t === '␛')).toBe(false)
    })

    it('replaces spaces(不间断空格 U+00A0 与普通空格不混:前者当不可见字符高亮,文字原样保留)', () => {
        const { line } = open('ab c')
        expect(line.textContent).toBe('ab c')
        // 第四轮·块B:不再在文字外包 <span title>(会劈开 ZWJ 簇);框画在 overlay,说明走悬停源
        expect(line.querySelector('[title*="U+00a0"]')).toBeNull()
        expect(findSpecialChars('ab\u00a0c').some(s => s.title?.includes('U+00a0'))).toBe(true)
    })
})

// ── Tab:宽度、全角、制表位 ──
describe('viewLineRenderer.renderLine(tab 与宽字符)', () => {
    it('handles tabs', () => {
        // 原版:tab 在 tabSize=4 下展开到下一个制表位,'xxxx\t' 一整个 tab 宽 4。编辑器里 tab 是真 \t,宽度走 CSS tab-size;
        // 列号(visibleColumn)是用户看得见的结果:每个字符之前占几列
        const cols = (t: string) => [...Array(t.length + 1).keys()].map(i => visibleColumn(t, i, 4))
        expect(cols('\t')).toEqual([0, 4])
        expect(cols('x\t')).toEqual([0, 1, 4])
        expect(cols('xx\t')).toEqual([0, 1, 2, 4])
        expect(cols('xxx\t')).toEqual([0, 1, 2, 3, 4])
        expect(cols('xxxx\t')).toEqual([0, 1, 2, 3, 4, 8])
        const { line } = open('xxxx\t', { options: { tabSize: 4 } })
        expect(line.textContent).toBe('xxxx\t')
    })

    it('issue #22832: Consider fullwidth characters when rendering tabs', () => {
        // 'asd = "擦"\t\t#asd':擦占 2 列,后面的 tab 补到的宽度要把它算进去。CSS 的 tab-size 只数字符,不认全角占 2 列,
        // 所以 tab 前面有非 ASCII 字符时编辑器把这个 tab 包进带 tab-size 的 span 补偿(cm-tabStop)
        const doc = 'asd = "擦"\t\t#asd'
        expect(visibleColumn(doc, 9, 4)).toBe(10) // 第一个 tab 之前:'asd = "擦"' 是 9 个字符、10 列
        expect(visibleColumn(doc, 10, 4)).toBe(12) // 第一个 tab 之后:下一个制表位 12
        expect(visibleColumn(doc, 11, 4)).toBe(16)
        const { line } = open(doc, { options: { tabSize: 4 } })
        expect(docText(line)).toBe(doc)
        // 浏览器按「字符数 × ch」放 tab:CSS 每个 tab 单独设 tab-size,让它停在 Monaco 的制表位(第 12、16 列)
        const stops = [...line.querySelectorAll('.cm-tabStop')] as HTMLElement[]
        expect(stops.map(e => e.style.tabSize)).toEqual(['2', '4'])
    })

    it('issue #22832 (columnFromVisible):全角字符的列 ↔ 偏移互逆', () => {
        const doc = 'asd = "擦"\t\t#asd'
        for (let i = 0; i <= doc.length; i++) expect(columnFromVisible(doc, visibleColumn(doc, i, 4), 4)).toBe(i)
    })

    it('issue #22352: COMBINING ACUTE ACCENT (U+0301)', () => {
        const doc = '12345689012345678901234568901234567890123456890abába'
        const { ed, line } = open(doc, { parts: [[53, 3]] })
        expect(docText(line)).toBe(doc)
        // 组合字符不单独占一列:光标按字素簇走,可见列里 a + U+0301 算 1 列
        expect(visibleColumn(doc, doc.length, 4)).toBe(doc.length - 1 - (doc.match(/́/g)?.length ?? 0) + 1)
        expect(ed.state.doc.toString()).toBe(doc)
    })

    it('issue #22352: Partially Broken Complex Script Rendering of Tamil', () => {
        const doc = ' JoyShareல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்'
        const { ed, line } = open(doc, { parts: [[100, 3]] })
        expect(docText(line)).toBe(doc)
        // 泰米尔文的元音符号 / 虚点不拆开:任何偏移与 DOM 位置互逆,字素簇边界不落在簇中间
        for (let i = 0; i <= doc.length; i++) {
            const { node, offset } = domAtPos(ed.contentDOM, ed.state.doc, i)
            expect(posFromDOM(ed.contentDOM, ed.state.doc, node, offset)).toBe(i)
        }
    })

    it('issue #42700: Hindi characters are not being rendered properly', () => {
        const doc = ' वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।'
        const { ed, line } = open(doc, { parts: [[105, 3]] })
        expect(docText(line)).toBe(doc)
        for (let i = 0; i <= doc.length; i++) {
            const { node, offset } = domAtPos(ed.contentDOM, ed.state.doc, i)
            expect(posFromDOM(ed.contentDOM, ed.state.doc, node, offset)).toBe(i)
        }
    })

    it('issue #20624: Unaligned surrogate pairs are corrupted at multiples of 50 columns', () => {
        const doc = 'a' + '𠮷'.repeat(120)
        const { line } = open(doc, { parts: [[doc.length, 1]] })
        // 原版:按 50 列拆 token 时拆在代理对中间会出乱码。编辑器不按列拆,但每个代理对必须完整出现在同一个文本节点里
        expect(docText(line)).toBe(doc)
        const texts: string[] = []
        const walk = (n: Node) => { if (n.nodeType === 3) texts.push((n as Text).data); else n.childNodes.forEach(walk) }
        line.childNodes.forEach(walk)
        for (const t of texts) {
            expect(t.charCodeAt(0) >= 0xDC00 && t.charCodeAt(0) <= 0xDFFF).toBe(false)
            const last = t.charCodeAt(t.length - 1)
            expect(last >= 0xD800 && last <= 0xDBFF).toBe(false)
        }
    })

    it('issue #2255: Weird line rendering part 1 / part 2(token 边界落在 tab 上,tab 之后的列不错)', () => {
        for (const [doc, parts] of [
            ['\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),', [[3, 1], [15, 2], [21, 3], [22, 4], [43, 5], [45, 6], [46, 7], [66, 8], [67, 9], [68, 10]]],
            [' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),', [[4, 1], [16, 2], [22, 3], [23, 4], [44, 5], [46, 6], [47, 7], [67, 8], [68, 9], [69, 10]]],
        ] as [string, [number, number][]][]) {
            const { line } = open(doc, { parts })
            expect(docText(line)).toBe(doc)
            // 每个 token 一段,段文字与 token 切分一致
            const segs = [...line.querySelectorAll(':scope > span')].map(e => e.textContent)
            expect(segs.join('')).toBe(doc.replace(/\s+$/, ''))
        }
    })

    it('issue #19673: Monokai Theme bad-highlighting in line wrap', () => {
        // 原版:折行续行缩进(faux indent 4 列)不吃掉前面 token 的颜色。编辑器的续行缩进是 CSS,文本里的缩进空格仍在第一个 token 里
        const doc = '    MongoCallback<string>): void {'
        const { line } = open(doc, { parts: [[17, 1], [18, 2], [24, 3], [26, 4], [27, 5], [28, 6], [32, 7], [34, 8]] })
        expect(docText(line)).toBe(doc)
        const first = line.querySelector(':scope > span') as HTMLElement
        expect(first.textContent).toBe('    MongoCallback')
    })

    it('createLineParts simple / simple two tokens / 空行', () => {
        const a = open('Hello world!', { parts: [[12, 1]] }).line
        expect([...a.querySelectorAll(':scope > span')].map(e => e.textContent)).toEqual(['Hello world!'])
        const b = open('Hello world!', { parts: [[6, 1], [12, 2]] }).line
        expect([...b.querySelectorAll(':scope > span')].map(e => e.textContent)).toEqual(['Hello ', 'world!'])
        expect(open('').line.textContent).toBe('')
    })
})

// ── getColumnOfLinePartOffset:点在「第 partIndex 段、段内第 offset 列」落到哪个文档列 ──
// 原版 CharacterMapping.getColumn(DomPosition(part, offset), partLength):offset 是展开 tab 之后的段内水平列。
// 对应物:编辑器把鼠标点位的可见列换成文档列用 columnFromVisible(落在 tab 中间时取较近的一侧);
// 段内水平列 = 这一段起点的可见列 + offset,段起点的可见列 = visibleColumn(段起点偏移)。
describe('viewLineRenderer.renderLine(getColumnOfLinePartOffset)', () => {
    function make(lineContent: string, tabSize: number, ends: number[]) {
        const starts = [0, ...ends.slice(0, -1)]
        return (partIndex: number, partLength: number, offset: number, expected: number) => {
            const base = visibleColumn(lineContent, starts[partIndex], tabSize)
            // partLength = 段在屏幕上占的列数
            expect(visibleColumn(lineContent, ends[partIndex], tabSize) - base).toBe(partLength)
            expect(columnFromVisible(lineContent, base + offset, tabSize) + 1, `getColumn for ${partIndex}, ${offset}`).toBe(expected)
        }
    }

    it('getColumnOfLinePartOffset 1 - simple text', () => {
        const t = make('hello world', 4, [11])
        for (let o = 0; o <= 11; o++) t(0, 11, o, o + 1)
    })

    it('getColumnOfLinePartOffset 2 - regular JS', () => {
        const t = make('var x = 3;', 4, [3, 4, 5, 8, 9, 10])
        t(0, 3, 0, 1); t(0, 3, 1, 2); t(0, 3, 2, 3); t(0, 3, 3, 4)
        t(1, 1, 0, 4); t(1, 1, 1, 5)
        t(2, 1, 0, 5); t(2, 1, 1, 6)
        t(3, 3, 0, 6); t(3, 3, 1, 7); t(3, 3, 2, 8); t(3, 3, 3, 9)
        t(4, 1, 0, 9); t(4, 1, 1, 10)
        t(5, 1, 0, 10); t(5, 1, 1, 11)
    })

    it('getColumnOfLinePartOffset 3 - tab with tab size 6', () => {
        const t = make('\t', 6, [1])
        t(0, 6, 0, 1); t(0, 6, 1, 1); t(0, 6, 2, 1); t(0, 6, 3, 1)
        t(0, 6, 4, 2); t(0, 6, 5, 2); t(0, 6, 6, 2)
    })

    it('getColumnOfLinePartOffset 4 - once indented line, tab size 4', () => {
        const t = make('\tfunction', 4, [1, 9])
        t(0, 4, 0, 1); t(0, 4, 1, 1); t(0, 4, 2, 1); t(0, 4, 3, 2); t(0, 4, 4, 2)
        for (let o = 0; o <= 8; o++) t(1, 8, o, 2 + o)
    })

    it('getColumnOfLinePartOffset 5 - twice indented line, tab size 4', () => {
        const t = make('\t\tfunction', 4, [2, 10])
        t(0, 8, 0, 1); t(0, 8, 1, 1); t(0, 8, 2, 1); t(0, 8, 3, 2)
        t(0, 8, 4, 2); t(0, 8, 5, 2); t(0, 8, 6, 2)
        t(0, 8, 7, 3); t(0, 8, 8, 3)
        for (let o = 0; o <= 8; o++) t(1, 8, o, 3 + o)
    })
})
