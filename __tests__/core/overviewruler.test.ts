import { describe, expect, it } from 'vitest'
import { collectMarks } from '../../src/core/chrome/overviewruler'
import { rulerLayout } from '../../src/core/chrome/ruler'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { searchField, openSearch, setSearchQuery } from '../../src/core/feature/search'

// 旧画法(palette 没有 overview 时)的 collectMarks 契约。第七轮起 lite-monaco 走 overviewpaint.ts,照 Monaco 画同词
// (对照页实测:用户挪光标后同词确实进概览尺,见 overviewruler-r7-fix.test.ts);下面「Monaco 不含」的说法只对旧画法成立。
// overview ruler collectMarks 契约(对齐 Monaco decorationsOverviewRuler,实测 2024):
// Monaco 的概览条**不含**任何 occurrence/同词高亮标记(getAllDecorations 里 overviewRuler 命中数=0),
// 无论光标停驻还是显式选中一个词。同词高亮只在正文(selectionMatchDecorations)出现。
// ruler 只投:cursor、search match、diagnostic。此前把 wordHighlight 也投进来 → 短词(c/x/i)/标点
// 全文匹配几十处 → 右侧密密麻麻一堆条(用户实测 bug)。

function stCursor(doc: string, at: number) {
    return EditorState.create({ doc, selection: EditorSelection.single(at) })
}
function stSelect(doc: string, from: number, to: number) {
    return EditorState.create({ doc, selection: EditorSelection.single(from, to) })
}

const wordHi = (m: { kind: string }) => m.kind === 'wordHighlight'

describe('collectMarks —— ruler 不含同词高亮(对齐 Monaco)', () => {
    const doc = 'const c = 1\nfunction c() {}\nlet cx = c + c\nc()'

    it('光标停在短词 c 上:ruler 零 wordHighlight', () => {
        const at = doc.indexOf('c') // 落在第一个 c
        expect(collectMarks(stCursor(doc, at)).filter(wordHi)).toHaveLength(0)
    })

    it('显式选中一个词:ruler 仍零 wordHighlight', () => {
        const from = doc.indexOf('function')
        expect(collectMarks(stSelect(doc, from, from + 'function'.length)).filter(wordHi)).toHaveLength(0)
    })

    it('光标停在 { 上:零 wordHighlight', () => {
        const at = doc.indexOf('{')
        expect(collectMarks(stCursor(doc, at)).filter(wordHi)).toHaveLength(0)
    })

    it('始终含 cursor 标记', () => {
        expect(collectMarks(stCursor(doc, 1)).some(m => m.kind === 'cursor')).toBe(true)
    })

    it('搜索命中和诊断进 ruler', () => {
        let state = EditorState.create({
            doc: 'foo bar foo',
            extensions: [searchField, diagnosticsField],
        })
        openSearch({ state, dispatch: tr => { state = tr.apply() } })
        setSearchQuery('foo')({ state, dispatch: tr => { state = tr.apply() } })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: 4, to: 7, severity: 'error', message: 'bad' },
            ]),
        }))
        const marks = collectMarks(state)
        expect(marks.some(m => m.kind === 'match')).toBe(true)
        expect(marks.some(m => m.kind === 'error')).toBe(true)
    })
})

describe('rulerLayout', () => {
    const palette = {
        error: '#e', warning: '#w', info: '#i', cursor: '#c',
        match: '#m', wordHighlight: '#h', minimapSelection: '#s', currentLine: '#l',
    }

    it('同像素 error 压过 cursor', () => {
        const laid = rulerLayout(
            [{ line: 1, kind: 'cursor' }, { line: 1, kind: 'error' }],
            () => 10,
            palette,
        )
        expect(laid).toEqual([{ top: 10, color: '#e' }])
    })
})
