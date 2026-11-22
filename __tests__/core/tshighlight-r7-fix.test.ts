// 第七轮:TS 同词高亮分读写(Monaco tsMode.js DocumentHighlightAdapter + wordHighlighter highlightDecorations.js)。
// TS 的 writtenReference(带初值的声明、赋值)→ DocumentHighlightKind.Write → class wordHighlightStrong;
// 其余(读、无初值声明)→ Text → class wordHighlightText(TS 不出 Read,wordHighlight 这一档用不到)。
// 对照页实测(/tmp/lc-hunt/r7/monaco-wordhl.ts):`let foo = 1` / `foo = 2` 是 Strong,`console.log(foo)` 是 Text;
// vs-dark Strong rgba(0,73,114,.72) / Text rgba(87,87,87,.72),vs Strong rgba(14,99,156,.25) / Text rgba(87,87,87,.25)。
// 修前:全部 cm-wordHighlight,读写不分色。
import { beforeAll, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView, decorations } from '../../src/core/view/editorview'
import { highlightDecorations, highlightField, highlightsToMarks, setHighlights, tsHighlightSession } from '../../src/lang/tshighlight'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { liteMonacoBaseCSS } from '../../src/product/themecss'
import { themeColor } from '../../src/product/theme'

const SLOW = 60_000
const FILE = '/hl-r7.ts'
const DOC = 'let foo = 1\nfoo = 2\nconsole.log(foo)\n'

let spans: { start: number, length: number, kind?: string }[] = []
beforeAll(async () => {
    clearTSServiceCache()
    const s = getTSService({ lang: 'typescript', fileName: FILE })
    s.update(DOC)
    const svc = await s.ensure()
    spans = ((await svc.getDocumentHighlights(FILE, DOC.indexOf('(foo') + 2, [FILE])) ?? [])
        .flatMap(h => h.highlightSpans.map(x => ({ ...x.textSpan, kind: x.kind })))
}, SLOW)

describe('TS 同词高亮读写分档', () => {
    it('writtenReference → write;其余 → text', () => {
        const marks = highlightsToMarks(spans)
        expect(marks.map(m => [DOC.slice(m.from, m.to), m.from, !!m.write])).toEqual([
            ['foo', 4, true], ['foo', 12, true], ['foo', 32, false],
        ])
    })

    it('装饰 class:写 cm-wordHighlightStrong,读 cm-wordHighlightText', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [highlightField, decorations.of(highlightDecorations)] }), parent })
        view.dispatch(view.state.update({ effects: setHighlights.of(highlightsToMarks(spans)) }))
        const cls = (sel: string) => [...view.contentDOM.querySelectorAll(sel)].map(e => e.textContent)
        expect(cls('.cm-wordHighlightStrong')).toEqual(['foo', 'foo'])
        expect(cls('.cm-wordHighlightText')).toEqual(['foo'])
        expect(cls('.cm-wordHighlight')).toEqual([])
        view.destroy(); parent.remove()
    })

    it('主题:Strong / Text 背景取 Monaco vs / vs-dark 默认,CSS 有两档', () => {
        const dark = { bg: '#1e1e1e', fg: '#d4d4d4', dark: true }
        const light = { bg: '#fffffe', fg: '#000000', dark: false }
        expect(themeColor(dark, 'editor.wordHighlightStrongBackground')).toBe('rgba(0,73,114,0.72)')
        expect(themeColor(dark, 'editor.wordHighlightTextBackground')).toBe('rgba(87,87,87,0.72)')
        expect(themeColor(light, 'editor.wordHighlightStrongBackground')).toBe('rgba(14,99,156,0.25)')
        expect(themeColor(light, 'editor.wordHighlightTextBackground')).toBe('rgba(87,87,87,0.25)')
        const css = liteMonacoBaseCSS()
        expect(css).toMatch(/\.cm-wordHighlightText \{ background-color: [^;]*wordHighlightTextBackground/)
        expect(css).toMatch(/\.cm-wordHighlightStrong \{ background-color: [^;]*wordHighlightStrongBackground/)
    })
})

// Monaco getOccurrencesAtPosition:按分数问 provider,结果是 undefined / null 才问下一个(空数组不算)。
// TS 在注释、关键字上 getDocumentHighlights 返回 undefined → 退回 TextualDocumentHighlightProvider(全文整词,Text)。
// 对照页实测(/tmp/lc-hunt/r7/monaco-tsfallback.ts):注释里的 line → 两行注释 + 字符串里的 line 都是 wordHighlightText;
// 关键字 const → 两处 const。修前:lite-monaco 什么都不高亮。
describe('TS 没有语义结果时退回文本同词', () => {
    const FB = '/hl-r7-fb.ts'
    const D = 'let foo = 1\n// line one\n// line two\nconst s = "line"\nconst t = 2\n'
    it('注释里的词 / 关键字 → 文本同词(Text);字符串字面量 TS 有结果 → 只它自己', async () => {
        clearTSServiceCache()
        const s = getTSService({ lang: 'typescript', fileName: FB })
        s.update(D)
        await s.ensure()
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: D, extensions: [highlightField, decorations.of(highlightDecorations)] }), parent })
        const off = tsHighlightSession(view, { lang: 'typescript', fileName: FB })
        view.contentDOM.focus()
        const marks = () => view.state.field(highlightField).map(m => [m.from, !!m.write])
        const at = async (pos: number) => {
            view.dispatch(view.state.update({ selection: { anchor: pos }, userEvent: 'select.pointer' }))
            await new Promise(r => setTimeout(r, 500))
        }
        const line = (k: number) => { let i = -1; for (let n = 0; n <= k; n++) i = D.indexOf('line', i + 1); return i }
        await at(line(0) + 1)
        expect(marks()).toEqual([[line(0), false], [line(1), false], [line(2), false]])
        expect(view.contentDOM.querySelectorAll('.cm-wordHighlightText').length).toBe(3)
        await at(D.indexOf('const') + 1)
        expect(marks()).toEqual([[D.indexOf('const'), false], [D.lastIndexOf('const'), false]])
        await at(line(2) + 1)
        expect(marks()).toEqual([[line(2), false]])
        off(); view.destroy(); parent.remove()
    }, SLOW)
})
