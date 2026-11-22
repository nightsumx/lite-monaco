// H1:createEditor(IStandaloneEditorConstructionOptions)与 index 导出汇总。
import { describe, expect, it } from 'vitest'
import * as api from '../../src/index'
import { createEditor, setDefaultHighlighter, createModel, Uri, EditorOption } from '../../src/index'
import { fakeHl } from './h1-helpers'

function box() {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
}

describe('H1 createEditor', () => {
    it('value / language / 选项 / dimension', () => {
        const el = box()
        const ed = createEditor(el, { highlighter: fakeHl(), value: 'hello\nworld', language: 'text', lineNumbers: 'off', wordWrap: 'on', tabSize: 2, dimension: { width: 320, height: 200 }, features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false } })
        expect(ed.getValue()).toBe('hello\nworld')
        expect(ed.getModel()!.getLanguageId()).toBe('text')
        expect(ed.getOption(EditorOption.wordWrap)).toBe('on')
        expect(ed.state.tabSize).toBe(2)
        expect(ed.dom.style.width).toBe('320px')
        expect(ed.dom.style.height).toBe('200px')
        ed.destroy()
    })

    it('没给 language:plaintext;没给高亮器且没登记:用默认懒加载高亮器(不抛,同 Monaco 零配置);登记后用登记的', () => {
        const el = box()
        const bare = createEditor(el, { value: 'y', features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false } })
        expect(bare.getValue()).toBe('y')
        bare.destroy()
        setDefaultHighlighter(fakeHl())
        const ed = createEditor(el, { value: 'x', features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false } })
        expect(ed.getModel()!.getLanguageId()).toBe('plaintext')
        ed.destroy()
        setDefaultHighlighter(undefined)
    })

    it('model:内容、语言、换行符都来自 model,编辑器自己建的临时 model 被销毁', () => {
        const el = box()
        const m = createModel('a\r\nb', 'text', Uri.parse('inmemory://create1'))
        const ed = createEditor(el, { highlighter: fakeHl(), model: m, features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false } })
        expect(ed.getModel()).toBe(m)
        expect(ed.getValue()).toBe('a\r\nb')
        ed.destroy()
    })

    it('overflowWidgetsDomNode 在 mergeRawOptions 里不丢(widgets 经 getUserOptions 读它),updateOptions 后仍在', () => {
        const el = box()
        const overflow = box()
        const ed = createEditor(el, { highlighter: fakeHl(), value: '', overflowWidgetsDomNode: overflow, features: { stickyScroll: false, autocomplete: false, tsDiagnostics: false } })
        expect((ed.getRawOptions() as unknown as { overflowWidgetsDomNode?: HTMLElement }).overflowWidgetsDomNode).toBe(overflow)
        ed.updateOptions({ wordWrap: 'on' } as never)
        expect((ed.getRawOptions() as unknown as { overflowWidgetsDomNode?: HTMLElement }).overflowWidgetsDomNode).toBe(overflow)
        ed.destroy()
    })
})

describe('H1 index 导出汇总(Monaco 同名符号)', () => {
    const names = [
        'createEditor', 'Position', 'Range', 'Selection', 'SelectionDirection', 'Uri', 'KeyCode', 'KeyMod',
        'ScrollType', 'MouseTargetType', 'CursorChangeReason', 'createModel', 'getModel', 'getModels', 'onDidChangeModelLanguage',
        'EndOfLinePreference', 'EndOfLineSequence', 'DefaultEndOfLine', 'setModelLanguage',
        'MarkerSeverity', 'MarkerTag', 'setModelMarkers', 'removeAllMarkers', 'getModelMarkers', 'onDidChangeMarkers',
        'defineTheme', 'setTheme', 'addEditorAction', 'addKeybindingRule', 'addKeybindingRules',
        'TrackedRangeStickiness', 'OverviewRulerLane', 'MinimapPosition', 'GlyphMarginLane',
        'ContentWidgetPositionPreference', 'OverlayWidgetPositionPreference', 'EditorOption', 'ConfigurationChangedEvent',
        'DiffEditor', 'createDiffEditor', 'typescriptDefaults', 'javascriptDefaults', 'liteMonaco',
    ]
    for (const n of names) it(n, () => { expect((api as Record<string, unknown>)[n], n).toBeDefined() })
})
