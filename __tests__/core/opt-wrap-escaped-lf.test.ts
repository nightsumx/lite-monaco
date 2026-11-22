import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions } from '../../src/core/options'
import { escapedLineFeedDecorations } from '../../src/core/feature/escapedlf'
import { createEditor } from '../../src'
import { computeLineProjection, wrapConfig } from '../../src/core/view/softwrap'
import { fakeHl, QUIET } from './h1-helpers'

// wrapOnEscapedLineFeeds(默认 false):Monaco monospaceLineBreaksComputer —— 含 " 和 \n 的行,在每个字面 \n(奇数个反斜杠)之后强制折行。
// 两条消费路径:文本侧折行模型(wordWrapColumn,softWrapModel)与浏览器折行(CSS 强制断行,装饰 cm-escapedLF)。
const SRC = 'x = "ab\\ncd\\\\nef\\ngh"' // x = "ab\ncd\\nef\ngh"(第二个是转义的反斜杠,不算)

function marks(doc: string, opts: Record<string, unknown>) {
    const s = EditorState.create({ doc, extensions: [editorOptions.of(opts as never)] })
    const out: [number, number][] = []
    escapedLineFeedDecorations(s).between(0, doc.length, (from, to) => { out.push([from, to]) })
    return out
}

describe('wrapOnEscapedLineFeeds · 浏览器折行装饰', () => {
    it('默认 false 不画', () => { expect(marks(SRC, { wordWrap: 'on' })).toEqual([]) })
    it('开了但没开折行:不画', () => { expect(marks(SRC, { wrapOnEscapedLineFeeds: true })).toEqual([]) })
    it('开了 + 折行:标出奇数个反斜杠的 \\n,偶数个的(\\\\n)不标', () => {
        const at = (needle: string, nth = 0) => { let i = -1; for (let k = 0; k <= nth; k++) i = SRC.indexOf(needle, i + 1); return i }
        expect(marks(SRC, { wordWrap: 'on', wrapOnEscapedLineFeeds: true }))
            .toEqual([[at('\\n', 0), at('\\n', 0) + 2], [at('\\n', 2), at('\\n', 2) + 2]])
    })
    it('行里没有双引号:不画(Monaco isLineFeedWrappingEnabled 要求同时有 " 和 \\n)', () => {
        expect(marks('a\\nb\\nc', { wordWrap: 'on', wrapOnEscapedLineFeeds: true })).toEqual([])
    })
    it('行尾的 \\n(后面没有字符)不画', () => {
        expect(marks('"a\\n', { wordWrap: 'on', wrapOnEscapedLineFeeds: true })).toEqual([])
    })
})

describe('wrapOnEscapedLineFeeds · 文本侧折行模型', () => {
    it('选项经 editorview 传到折行配置:折点落在每个 \\n 之后', () => {
        const on = computeLineProjection(SRC, wrapConfig({ column: 80, escapedLineFeeds: true }))
        const off = computeLineProjection(SRC, wrapConfig({ column: 80, escapedLineFeeds: false }))
        expect(off).toBeNull()
        expect(on!.breakOffsets.slice(0, -1).length).toBe(2)
    })
    it('EditorView.softWrapModel 读 wrapOnEscapedLineFeeds', () => {
        const mk = (extra: object) => {
            const parent = document.createElement('div')
            document.body.appendChild(parent)
            const ed: any = createEditor(parent, { value: SRC, highlighter: fakeHl(), features: QUIET, wordWrap: 'wordWrapColumn', wordWrapColumn: 80, ...extra } as never)
            return { ed, done: () => { ed.dispose(); parent.remove() } }
        }
        const a = mk({}), b = mk({ wrapOnEscapedLineFeeds: true })
        const rows = (h: any) => h.ed.softWrapModel().rowCount(1)
        expect(rows(a)).toBe(1)
        expect(rows(b)).toBe(3)
        a.done(); b.done()
    })
})
