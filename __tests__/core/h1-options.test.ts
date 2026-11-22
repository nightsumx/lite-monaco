// H1:updateOptions / getOption / getOptions / getRawOptions / onDidChangeConfiguration,以及 features → options 映射。
import { describe, expect, it } from 'vitest'
import { EditorOption } from '../../src/core/options'
import { featuresToOptions, featuresFromOptions } from '../../src/api/options'
import { undo } from '../../src/core/edit/history'
import { foldAll, foldField, setDiagnostics, diagnosticsField } from '../../src/core/index'
import { mount } from './h1-helpers'

describe('H1 updateOptions —— 往返不丢 doc / 选区 / 历史 / 折叠', () => {
    it('每类选项各取一个:切过去再切回来,doc、选区、撤销栈、折叠不变', () => {
        const { ed, done } = mount({ doc: 'function a() {\n  return 1\n}\nlet b = 2' , lang: 'typescript' })
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: '// x\n' }, userEvent: 'input.type' }))
        ed.dispatch(ed.state.update({ selection: { anchor: 8, head: 12 } }))
        ed.dispatch(ed.state.update({ selection: { anchor: 8, head: 12 } }))
        foldAll(ed)
        const doc0 = ed.state.sliceDoc()
        const sel0 = ed.state.selection.main
        const folded0 = [...(ed.state.field(foldField, false) ?? [])]
        expect(folded0.length).toBeGreaterThan(0)
        const patches: [Record<string, unknown>, Record<string, unknown>][] = [
            [{ lineNumbers: 'off' }, { lineNumbers: 'on' }],
            [{ wordWrap: 'on' }, { wordWrap: 'off' }],
            [{ readOnly: true }, { readOnly: false }],
            [{ tabSize: 8 }, { tabSize: 4 }],
            [{ minimap: { enabled: false } }, { minimap: { enabled: true } }],
            [{ fontSize: 20 }, { fontSize: 14 }],
            [{ renderWhitespace: 'all' }, { renderWhitespace: 'selection' }],
            [{ cursorStyle: 'block' }, { cursorStyle: 'line' }],
            [{ scrollBeyondLastLine: false }, { scrollBeyondLastLine: true }],
        ]
        for (const [there, back] of patches) {
            ed.updateOptions(there as never)
            // 折叠状态是 state 的字段,选项槽 reconfigure 不碰它(folding:false 只是不画折叠列)
            expect([...(ed.state.field(foldField, false) ?? [])], JSON.stringify(there)).toEqual(folded0)
            expect(ed.state.sliceDoc(), JSON.stringify(there)).toBe(doc0)
            expect(ed.state.selection.main.from).toBe(sel0.from)
            expect(ed.state.selection.main.to).toBe(sel0.to)
            ed.updateOptions(back as never)
            expect(ed.state.sliceDoc(), JSON.stringify(back)).toBe(doc0)
        }
        // folding:false 对照 Monaco:折叠模型随控制器销毁,折叠全部展开(再打开不会还原)。doc / 选区 / 历史照旧
        ed.updateOptions({ folding: false } as never)
        expect([...(ed.state.field(foldField, false) ?? [])]).toEqual([])
        expect(ed.state.sliceDoc()).toBe(doc0)
        ed.updateOptions({ folding: true } as never)
        // 撤销栈还在:撤销刚才那次输入
        undo(ed)
        expect(ed.state.sliceDoc()).toBe(doc0.slice(5))
        done()
    })

    it('getOption / getOptions / getRawOptions 反映 updateOptions;合并是增量的,undefined 清回默认', () => {
        const { ed, done } = mount()
        expect(ed.getOption(EditorOption.wordWrap)).toBe('off')
        expect(ed.getOptions().wordWrap).toBe('off')
        ed.updateOptions({ wordWrap: 'on', tabSize: 2 } as never)
        expect(ed.getOption(EditorOption.wordWrap)).toBe('on')
        expect(ed.getOption('wordWrap' as never)).toBe('on')
        expect(ed.getRawOptions()).toMatchObject({ wordWrap: 'on' })
        ed.updateOptions({ lineNumbers: 'relative' } as never)
        expect(ed.getRawOptions()).toMatchObject({ wordWrap: 'on', lineNumbers: 'relative' }) // 前一次的没丢
        expect(ed.state.tabSize).toBe(2)
        ed.updateOptions({ wordWrap: undefined } as never)
        expect(ed.getOption(EditorOption.wordWrap)).toBe('off')
        // 嵌套对象深合并
        ed.updateOptions({ minimap: { enabled: false } } as never)
        ed.updateOptions({ minimap: { side: 'left' } } as never)
        expect(ed.getOptions().minimap).toMatchObject({ enabled: false, side: 'left' })
        done()
    })

    it('按选项重算结构:lineNumbers/wordWrap/readOnly 的 DOM 与 state 和"直接这样构造"一致', () => {
        const a = mount()
        a.ed.updateOptions({ lineNumbers: 'off', wordWrap: 'on', readOnly: true } as never)
        const b = mount({ options: { lineNumbers: 'off', wordWrap: 'on', readOnly: true } as never })
        expect(a.ed.dom.querySelectorAll('.cm-lineNumbers').length).toBe(0)
        expect(a.ed.state.readOnly).toBe(true)
        expect(b.ed.state.readOnly).toBe(true)
        expect(a.ed.dom.querySelectorAll('.cm-lineNumbers').length).toBe(b.ed.dom.querySelectorAll('.cm-lineNumbers').length)
        expect(a.ed.dom.classList.contains('cm-lineWrapping')).toBe(b.ed.dom.classList.contains('cm-lineWrapping'))
        expect(a.ed.getOptions().lineNumbers.renderType).toBe(b.ed.getOptions().lineNumbers.renderType)
        a.done(); b.done()
    })

    it('字体选项经 V 的 applyViewOptions 落到 DOM:updateOptions 后与直接构造一致', () => {
        const a = mount()
        const before = getComputedStyle(a.ed.contentDOM).fontSize
        a.ed.updateOptions({ fontSize: 24 } as never)
        const b = mount({ options: { fontSize: 24 } as never })
        expect(before).not.toBe('24px')
        expect(getComputedStyle(a.ed.contentDOM).fontSize).toBe('24px')
        expect(getComputedStyle(b.ed.contentDOM).fontSize).toBe(getComputedStyle(a.ed.contentDOM).fontSize)
        a.done(); b.done()
    })

    it('tabSize/insertSpaces 等文本模型选项走 updateOptions', () => {
        const { ed, done } = mount({ doc: 'a' })
        ed.updateOptions({ tabSize: 8, insertSpaces: false, detectIndentation: false } as never)
        expect(ed.state.tabSize).toBe(8)
        expect(ed.state.indentUnit).toBe('\t')
        expect(ed.getRawOptions()).toMatchObject({ tabSize: 8, insertSpaces: false })
        done()
    })
})

describe('H1 重装配(结构变了的选项)不丢宿主状态', () => {
    it('minimap/lineNumbers/语言相关的重装配后:宿主诊断、选区、历史仍在', () => {
        const { ed, done } = mount({ doc: 'let a: number = "x"\nlet b = 2', lang: 'typescript' })
        ed.dispatch(ed.state.update({ effects: setDiagnostics.of([{ from: 0, to: 3, severity: 'error', message: 'host', source: 'host' }]) }))
        ed.dispatch(ed.state.update({ selection: { anchor: 5 } }))
        const n0 = ed.state.field(diagnosticsField).length
        expect(n0).toBeGreaterThan(0)
        ed.updateOptions({ minimap: { enabled: false } } as never) // features 签名变 → 整体重装配
        ed.updateOptions({ lineNumbers: 'off' } as never)
        expect(ed.state.field(diagnosticsField).length).toBe(n0)
        expect(ed.state.selection.main.head).toBe(5)
        done()
    })
})

describe('H1 onDidChangeConfiguration', () => {
    it('e.hasChanged 只对真正变了的选项为真;没变不发事件', () => {
        const { ed, done } = mount()
        const events: { wrap: boolean, ln: boolean, font: boolean }[] = []
        const sub = ed.onDidChangeConfiguration(e => events.push({
            wrap: e.hasChanged(EditorOption.wordWrap), ln: e.hasChanged(EditorOption.lineNumbers), font: e.hasChanged(EditorOption.fontSize),
        }))
        ed.updateOptions({ wordWrap: 'on' } as never)
        expect(events).toEqual([{ wrap: true, ln: false, font: false }])
        ed.updateOptions({ wordWrap: 'on' } as never) // 同值
        expect(events.length).toBe(1)
        ed.updateOptions({ fontSize: 18 } as never)
        expect(events[1].font).toBe(true)
        expect(events[1].wrap).toBe(false)
        sub.dispose()
        ed.updateOptions({ fontSize: 12 } as never)
        expect(events.length).toBe(2)
        done()
    })

    it('销毁后不再发事件', () => {
        const { ed, done } = mount()
        let n = 0
        ed.onDidChangeConfiguration(() => { n++ })
        done()
        expect(n).toBe(0)
    })
})

describe('H1 features → options 映射表(逐项)', () => {
    const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
        ['lineNumbers:false', { lineNumbers: false }, { lineNumbers: 'off' }],
        ['foldGutter:false', { foldGutter: false }, { folding: false }],
        ['activeLine:false', { activeLine: false }, { renderLineHighlight: 'none' }],
        ['bracketMatch:false', { bracketMatch: false }, { matchBrackets: 'never' }],
        ['closeBrackets:false', { closeBrackets: false }, { autoClosingBrackets: 'never', autoClosingQuotes: 'never' }],
        ['bracketColors:false', { bracketColors: false }, { bracketPairColorization: { enabled: false } }],
        ['overviewRuler:false', { overviewRuler: false }, { overviewRulerLanes: 0 }],
        ['minimap:false', { minimap: false }, { minimap: { enabled: false } }],
        ['selectionMatch:false', { selectionMatch: false }, { selectionHighlight: false, occurrencesHighlight: 'off' }],
        ['indentGuide:false', { indentGuide: false }, { guides: { indentation: false } }],
        ['hScrollbar:false', { hScrollbar: false }, { scrollbar: { horizontal: 'hidden' } }],
        ['vScrollbar:false', { vScrollbar: false }, { scrollbar: { vertical: 'hidden' } }],
        ['contextMenu:false', { contextMenu: false }, { contextmenu: false }],
        ['lineWrapping:true', { lineWrapping: true }, { wordWrap: 'on' }],
        ['scrollBeyondLastLine:false', { scrollBeyondLastLine: false }, { scrollBeyondLastLine: false }],
        ['stickyScroll:false', { stickyScroll: false }, { stickyScroll: { enabled: false } }],
        ['formatOnType:true', { formatOnType: true }, { formatOnType: true }],
        ['formatOnPaste:true', { formatOnPaste: true }, { formatOnPaste: true }],
        ['tsUnusedFade:false', { tsUnusedFade: false }, { showUnused: false, showDeprecated: false }],
        ['hover:false(软)', { hover: false }, { hover: { enabled: false } }],
        ['signatureHelp:false(软)', { signatureHelp: false }, { parameterHints: { enabled: false } }],
        ['codeActions:false(软)', { codeActions: false }, { lightbulb: { enabled: 'off' } }],
    ]
    for (const [name, features, expected] of cases) {
        it(name, () => {
            expect(featuresToOptions(features)).toEqual(expected)
        })
    }
    it('readOnly 构造项 → readOnly 选项;没写的 features 不产出任何选项(默认值全是 Monaco 的)', () => {
        expect(featuresToOptions(undefined, true)).toEqual({ readOnly: true })
        expect(featuresToOptions({})).toEqual({})
        expect(featuresToOptions({ lineNumbers: true, minimap: true })).toEqual({})
    })
    it('没有对应选项的 features 只认 features(multiCursor/search/history/...)', () => {
        expect(featuresToOptions({ multiCursor: false, search: false, history: false, tabIndent: false, autocomplete: false, tsDiagnostics: false, a11y: false, inlayHints: false, indentOnInput: false })).toEqual({})
    })
    it('featuresFromOptions:结构跟着选项走,Monaco 默认选项全是"开"', () => {
        const { ed, done } = mount()
        const f = featuresFromOptions(undefined, ed.getOptions())
        expect(f).toMatchObject({ lineNumbers: true, foldGutter: true, activeLine: true, bracketMatch: true, closeBrackets: true, minimap: true, lineWrapping: false, scrollBeyondLastLine: true })
        done()
    })
    it('features:false 构造 = 选项构造:getOption 一致,结构也一致', () => {
        const a = mount({ features: { lineNumbers: false, lineWrapping: true, minimap: false } })
        const b = mount({ options: { lineNumbers: 'off', wordWrap: 'on', minimap: { enabled: false } } as never })
        for (const k of [EditorOption.wordWrap, EditorOption.lineNumbers, EditorOption.minimap]) {
            expect(a.ed.getOption(k)).toEqual(b.ed.getOption(k))
        }
        expect(a.ed.dom.querySelectorAll('.cm-lineNumbers').length).toBe(0)
        expect(b.ed.dom.querySelectorAll('.cm-lineNumbers').length).toBe(0)
        a.done(); b.done()
    })
    it('优先级:updateOptions 压过构造 options 压过 features', () => {
        const { ed, done } = mount({ features: { lineWrapping: true }, options: { wordWrap: 'off' } as never })
        expect(ed.getOption(EditorOption.wordWrap)).toBe('off')
        ed.updateOptions({ wordWrap: 'wordWrapColumn' } as never)
        expect(ed.getOption(EditorOption.wordWrap)).toBe('wordWrapColumn')
        done()
    })
})

describe('H1 automaticLayout —— 唯一刻意偏离 Monaco 的默认值', () => {
    it('lite-monaco 默认 true(Monaco 为 false);可用 options / updateOptions 关', () => {
        const a = mount()
        expect(a.ed.getRawOptions().automaticLayout).toBeUndefined() // 没写;默认由 lite-monaco 补成 true
        a.done()
        const b = mount({ options: { automaticLayout: false } as never })
        expect(b.ed.getRawOptions()).toMatchObject({ automaticLayout: false })
        b.done()
    })
})
