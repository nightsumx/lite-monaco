// rulers / showFoldingControls / lightbulb.enabled —— 非默认值真生效,默认行为不变。
import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { IEditorOptions } from '../../src/core/options'
import { ShowLightbulbIconMode } from '../../src/core/options/types'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions } from '../../src/core/options'
import { lightbulbTriggerRange } from '../../src/lang/tscodeactions'

const hl = () => ({
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const
function mk(doc: string, options: IEditorOptions = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl(), doc, lang: 'text', features: QUIET, options })
    return { view, done: () => { view.destroy(); parent.remove() } }
}

describe('rulers', () => {
    it('默认 []:不画标尺', () => {
        const { view, done } = mk('hello')
        expect(view.dom.querySelectorAll('.cm-ruler')).toHaveLength(0)
        done()
    })
    it('每个标尺一条竖线;列 0 不画;color 优先于主题色;数字和对象两种写法', () => {
        const { view, done } = mk('hello', { rulers: [80, { column: 100, color: '#ff0000' }, 0] })
        const els = [...view.dom.querySelectorAll<HTMLElement>('.cm-ruler')]
        expect(els).toHaveLength(2)
        expect(els[0].style.background).toBe('')
        expect(els[1].style.background).toBe('rgb(255, 0, 0)')
        done()
    })
})

describe('showFoldingControls', () => {
    const cls = (o: IEditorOptions) => {
        const { view, done } = mk('a', o)
        const r = [view.dom.classList.contains('cm-fold-always'), view.dom.classList.contains('cm-fold-never')]
        done()
        return r
    }
    it("mouseover(默认)两个类都没有;always / never 各加一个", () => {
        expect(cls({})).toEqual([false, false])
        expect(cls({ showFoldingControls: 'always' })).toEqual([true, false])
        expect(cls({ showFoldingControls: 'never' })).toEqual([false, true])
    })
})

describe('lightbulb.enabled(自动触发范围)', () => {
    const range = (o: IEditorOptions, doc: string, pos: number) => lightbulbTriggerRange(
        EditorState.create({ doc, selection: EditorSelection.single(pos), extensions: [editorOptions.of(o)] }))
    it('没有 liteMonaco() 时是默认 onCode:空白包围不触发,有字才触发', () => {
        expect(lightbulbTriggerRange(EditorState.create({ doc: 'a  b', selection: EditorSelection.single(2) }))).toBeNull()
        expect(range({}, 'ab', 1)).toEqual({ from: 1, to: 1 })
    })
    it('off:什么都不触发,有选区也不', () => {
        expect(range({ lightbulb: { enabled: ShowLightbulbIconMode.Off } }, 'ab', 1)).toBeNull()
        const s = EditorState.create({ doc: 'ab', selection: EditorSelection.single(0, 2), extensions: [editorOptions.of({ lightbulb: { enabled: ShowLightbulbIconMode.Off } })] })
        expect(lightbulbTriggerRange(s)).toBeNull()
    })
    it('on:光标在空白里、空行里也触发', () => {
        expect(range({ lightbulb: { enabled: ShowLightbulbIconMode.On } }, 'a  b', 2)).toEqual({ from: 2, to: 2 })
        expect(range({ lightbulb: { enabled: ShowLightbulbIconMode.On } }, '', 0)).toEqual({ from: 0, to: 0 })
        expect(range({ lightbulb: { enabled: ShowLightbulbIconMode.OnCode } }, '', 0)).toBeNull()
    })
})
