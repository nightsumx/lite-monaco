// 第四轮 K 组:TS 同符号高亮对齐 Monaco WordHighlighter(0.52 wordHighlighter.js + 对照页实测 /tmp/lc-hunt/r4/K/wh-mo.ts)。
//   - 只在编辑器有焦点、主选区单行、且选区落在一个词里(或正好包住它)时查;多行 / 越过词 → 清掉;
//   - 光标变化先等 50ms(runDelayer),之后至少再过 250ms 才画 → 落词约 300ms 出现;
//   - 只认用户的光标移动(鼠标 / 键盘,Explicit);打字、撤销、程序设选区 → 清掉,不重查;
//   - 光标还在现有高亮里 → 不动;挪到非词处 → 50ms 后清;
//   - 失焦不清(保留到下一次光标或内容变化);失焦时程序设的选区不查,重新聚焦时按当前选区查。
// 修前:任何选区变化 200ms 后在 head 处查,不看焦点和选区形状 → 失焦 / 多行选区时照样高亮,打字后也重新高亮。
import { beforeAll, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView, decorations } from '../../src/core/view/editorview'
import { highlightDecorations, highlightField, tsHighlightSession } from '../../src/lang/tshighlight'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'

const SLOW = 60_000
const FILE = '/hl-fix.ts'
const DOC = [
    'let activeObserver = 1',      // 1
    'function f(c: number) {',     // 2
    '    activeObserver = c',      // 3
    '    return activeObserver',   // 4
    '}',                           // 5
].join('\n')
const at = (s: string, k = 0) => { let i = -1; for (let n = 0; n <= k; n++) i = DOC.indexOf(s, i + 1); return i }
const AO = at('activeObserver', 1) + 3 // 第 3 行词内
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeAll(async () => {
    clearTSServiceCache()
    const s = getTSService({ lang: 'typescript', fileName: FILE })
    s.update(DOC)
    const svc = await s.ensure()
    // 预热:首次查询要建程序,同步几百 ms,会把下面按时间断言的用例挤歪
    svc.getDocumentHighlights(FILE, AO, [FILE])
}, SLOW)

function mk() {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [highlightField, decorations.of(highlightDecorations)] }), parent })
    const off = tsHighlightSession(view, { lang: 'typescript', fileName: FILE })
    const marks = () => view.state.field(highlightField).map(m => view.state.sliceDoc(m.from, m.to))
    // userEvent null = 程序设选区
    const sel = (anchor: number, head = anchor, userEvent: string | null = 'select.pointer') =>
        view.dispatch(view.state.update({ selection: { anchor, head }, userEvent: userEvent ?? undefined }))
    const done = () => { off(); view.destroy(); parent.remove() }
    return { view, marks, sel, done }
}

describe('TS 同符号高亮(Monaco WordHighlighter)', () => {
    it('点到词上:约 300ms 后高亮(50ms 延迟 + 250ms 最短渲染),不是 200ms', async () => {
        const { view, marks, sel, done } = mk()
        view.contentDOM.focus()
        sel(AO)
        await sleep(230)
        expect(marks()).toEqual([])
        await sleep(370)
        expect(marks()).toEqual(['activeObserver', 'activeObserver', 'activeObserver'])
        done()
    }, SLOW)

    it('多行选区、越过词的单行选区 → 不高亮;词内 / 正好包住词的单行选区 → 高亮', async () => {
        const { view, marks, sel, done } = mk()
        view.contentDOM.focus()
        sel(at('function'), AO) // 跨行,head 在词里
        await sleep(450)
        expect(marks()).toEqual([])
        sel(AO, view.state.doc.line(3).to) // 单行,越过词
        await sleep(450)
        expect(marks()).toEqual([])
        const w = at('activeObserver', 1)
        sel(w, w + 'activeObserver'.length) // 正好包住
        await sleep(450)
        expect(marks().length).toBe(3)
        done()
    }, SLOW)

    it('失焦保留;失焦时程序设的选区 → 清掉且不查', async () => {
        const { view, marks, sel, done } = mk()
        view.contentDOM.focus()
        sel(AO)
        await sleep(450)
        expect(marks().length).toBe(3)
        view.contentDOM.blur()
        await sleep(400)
        expect(marks().length).toBe(3) // Monaco 失焦不清
        sel(at('c: number'), at('c: number'), null) // 程序设选区(参数 c)
        await sleep(450)
        expect(marks()).toEqual([])
        done()
    }, SLOW)

    it('从没聚焦过:用户移动光标也不查(Monaco _run 无焦点且无 query → 清)', async () => {
        const { marks, sel, done } = mk()
        sel(AO)
        await sleep(450)
        expect(marks()).toEqual([])
        // 聚焦时按当前选区查一次:jsdom 聚焦后 DOMObserver 会把原生选区读回成 0,这条链在浏览器里测
        // (/tmp/lc-hunt/r4/K/wh-mo.ts「api setSel while blurred」→「then focus」)
        done()
    }, SLOW)

    it('程序设选区(无 userEvent)即使有焦点也不查', async () => {
        const { view, marks, sel, done } = mk()
        view.contentDOM.focus()
        await sleep(100)
        sel(AO, AO, null)
        await sleep(450)
        expect(marks()).toEqual([])
        done()
    }, SLOW)

    it('打字清掉且不重查;挪到非词处 50ms 后清;在现有高亮里挪动不闪', async () => {
        const { view, marks, sel, done } = mk()
        view.contentDOM.focus()
        sel(AO)
        await sleep(450)
        expect(marks().length).toBe(3)
        // 挪到另一处同符号:不清、不重查
        sel(at('activeObserver', 2) + 2)
        await sleep(100)
        expect(marks().length).toBe(3)
        // 挪到行首空白(非词)
        sel(view.state.doc.line(3).from + 1)
        await sleep(120)
        expect(marks()).toEqual([])
        sel(AO)
        await sleep(450)
        expect(marks().length).toBe(3)
        expect(view.dom.querySelectorAll('.cm-wordHighlightText, .cm-wordHighlightStrong').length).toBe(3)
        view.dispatch(view.state.update({ changes: { from: AO, insert: 'x' }, selection: { anchor: AO + 1 }, userEvent: 'input.type' }))
        expect(marks()).toEqual([])
        // 别的行上的高亮 DOM 也要清(视图只重画改到的行,修前第 1、4 行的残留到下次整窗重画)
        await Promise.resolve()
        expect(view.dom.querySelectorAll('.cm-wordHighlightText, .cm-wordHighlightStrong').length).toBe(0)
        await sleep(500)
        expect(marks()).toEqual([])
        done()
    }, SLOW)
})
