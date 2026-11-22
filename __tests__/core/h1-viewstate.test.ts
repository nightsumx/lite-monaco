// H1:saveViewState / restoreViewState 往返(光标、折叠、滚动)。形态对照 Monaco ICodeEditorViewState。
// jsdom 没有真实布局:滚动用 scrollDOM.scrollTop 赋值 + heightmap 的估高(行高固定),真浏览器的像素级往返留给 e2e。
import { describe, expect, it } from 'vitest'
import { foldAll, foldField, EditorSelection, EditorState } from '../../src/core/index'
import { mount } from './h1-helpers'

const CODE = Array.from({ length: 40 }, (_, i) => i % 5 === 0 ? `function f${i}() {` : i % 5 === 4 ? '}' : `  line${i}`).join('\n')

describe('H1 view state', () => {
    it('形态:cursorState / viewState / contributionsState["editor.contrib.folding"]', () => {
        const { ed, done } = mount({ doc: CODE, lang: 'typescript' })
        ed.dispatch(ed.state.update({ selection: { anchor: 4, head: 9 } }))
        const vs = ed.saveViewState()!
        expect(vs.cursorState).toEqual([{ inSelectionMode: true, selectionStart: { lineNumber: 1, column: 5 }, position: { lineNumber: 1, column: 10 } }])
        expect(Object.keys(vs.viewState).sort()).toEqual(['firstPosition', 'firstPositionDeltaTop', 'scrollLeft'])
        expect(vs.viewState.firstPosition).toEqual({ lineNumber: 1, column: 1 })
        expect(vs.contributionsState).toHaveProperty('editor.contrib.folding')
        expect(vs.contributionsState['editor.contrib.folding']).toMatchObject({ lineCount: 40 })
        done()
    })

    it('多光标:主选区在最前;空选区 inSelectionMode=false', () => {
        const { ed, done } = mount({ doc: 'aa\nbb\ncc', extensions: [EditorState.allowMultipleSelections.of(true)] })
        ed.dispatch(ed.state.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.range(4, 5)], 1) }))
        const vs = ed.saveViewState()!
        expect(vs.cursorState.length).toBe(2)
        expect(vs.cursorState[0].inSelectionMode).toBe(true) // 主选区(第二个)在最前
        expect(vs.cursorState[1].inSelectionMode).toBe(false)
        done()
    })

    it('往返:光标 + 折叠 + 滚动(换一个实例恢复)', () => {
        const a = mount({ doc: CODE, lang: 'typescript' })
        a.ed.dispatch(a.ed.state.update({ selection: { anchor: 30, head: 40 } }))
        foldAll(a.ed)
        const foldedA = [...(a.ed.state.field(foldField, false) ?? [])]
        expect(foldedA.length).toBeGreaterThan(0)
        const selA = a.ed.state.selection.main // 折叠会把藏进去的光标挪出来,以折叠后的为准
        a.ed.scrollDOM.scrollTop = 36
        a.ed.scrollDOM.scrollLeft = 12
        const vs = JSON.parse(JSON.stringify(a.ed.saveViewState()))
        a.done()

        const b = mount({ doc: CODE, lang: 'typescript' })
        b.ed.restoreViewState(vs)
        expect(b.ed.state.selection.main.anchor).toBe(selA.anchor)
        expect(b.ed.state.selection.main.head).toBe(selA.head)
        expect([...(b.ed.state.field(foldField, false) ?? [])]).toEqual(foldedA)
        expect(b.ed.scrollDOM.scrollTop).toBe(36)
        expect(b.ed.scrollDOM.scrollLeft).toBe(12)
        b.done()
    })

    it('折叠变了之后恢复:靠 firstPosition 而不是 scrollTop(同一行贴在同一位置)', () => {
        const a = mount({ doc: CODE, lang: 'typescript' })
        a.ed.scrollDOM.scrollTop = 18 * 12
        const vs = a.ed.saveViewState()!
        const first = vs.viewState.firstPosition.lineNumber
        expect(first).toBeGreaterThan(1)
        a.done()
        const b = mount({ doc: CODE, lang: 'typescript' })
        b.ed.restoreViewState(vs)
        const top = b.ed.lineBlockAt(b.ed.state.doc.line(first).from).top
        expect(b.ed.scrollDOM.scrollTop).toBe(top - vs.viewState.firstPositionDeltaTop)
        b.done()
    })

    it('不合法 / 空状态:什么都不做;越界光标夹到文档内;只有 scrollTop 的旧格式也认', () => {
        const { ed, done } = mount({ doc: 'abc\ndef' })
        ed.dispatch(ed.state.update({ selection: { anchor: 2 } }))
        ed.restoreViewState(null)
        ed.restoreViewState({} as never)
        expect(ed.state.selection.main.head).toBe(2)
        ed.restoreViewState({ cursorState: [{ inSelectionMode: false, selectionStart: { lineNumber: 99, column: 99 }, position: { lineNumber: 99, column: 99 } }], viewState: { scrollTop: 0, scrollLeft: 0 }, contributionsState: {} } as never)
        expect(ed.state.selection.main.head).toBe(ed.state.doc.length)
        done()
    })

    it('折叠 checksum 对不上(内容变了)就不恢复', () => {
        const a = mount({ doc: CODE, lang: 'typescript' })
        foldAll(a.ed)
        const vs = a.ed.saveViewState()!
        a.done()
        const b = mount({ doc: CODE.replace('line1', 'LINE1'), lang: 'typescript' })
        b.ed.restoreViewState(vs)
        // 第 1 个块(1-5 行)内容变了 → 不折;别的块照折
        const folded = [...(b.ed.state.field(foldField, false) ?? [])]
        expect(folded).not.toContain(1)
        expect(folded.length).toBeGreaterThan(0)
        b.done()
    })
})
