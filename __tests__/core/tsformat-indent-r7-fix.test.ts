// 第七轮:TS 格式化的缩进照 Monaco FormatHelper._convertOptions。
// 格式化传 model.getFormattingOptions() = { tabSize: indentSize, insertSpaces } → TabSize = IndentSize = indentSize,
// ConvertTabsToSpaces = insertSpaces;Quick Fix 传 model.getOptions() → 真 tabSize。
// 之前 tsformaton / tsactions 把 state.tabSize 当 indentSize,且总是 convertTabsToSpaces: true。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { indentSizeFacet } from '../../src/core/edit/enter'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { createTSActions } from '../../src/lang/tsactions'
import { tsFormatOptions } from '../../src/lang/tsformatopts'

const SLOW = 60_000

function mount(doc: string, extensions: import('../../src/core/model/state').Extension[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, extensions }), parent: host })
    return { view, done: () => { view.destroy(); host.remove() } }
}

describe('TS 格式选项(Monaco _convertOptions)', () => {
    it('format:TabSize = IndentSize = indentSize;codefix:真 tabSize;insertSpaces 照传', () => {
        const s = EditorState.create({ extensions: [EditorState.tabSize.of(8), EditorState.indentUnit.of('    ')] })
        expect(tsFormatOptions(s, 'format')).toMatchObject({ tabSize: 4, indentSize: 4, convertTabsToSpaces: true })
        expect(tsFormatOptions(s, 'codefix')).toMatchObject({ tabSize: 8, indentSize: 8, convertTabsToSpaces: true })
        expect(tsFormatOptions(s, 'editor')).toMatchObject({ tabSize: 8, indentSize: 4, convertTabsToSpaces: true })
        const t = EditorState.create({ extensions: [EditorState.tabSize.of(4), EditorState.indentUnit.of('\t')] })
        expect(tsFormatOptions(t, 'format')).toMatchObject({ tabSize: 4, indentSize: 4, convertTabsToSpaces: false })
        // 显式 indentSize(第六轮 indentSizeFacet,Monaco indentSize 选项)
        const u = EditorState.create({ extensions: [EditorState.tabSize.of(8), EditorState.indentUnit.of('  '), indentSizeFacet.of(2)] })
        expect(tsFormatOptions(u, 'format')).toMatchObject({ tabSize: 2, indentSize: 2 })
    })

    it('tabSize 8 + indentSize 4:Format Document 一层缩进 4 个空格', async () => {
        clearTSServiceCache()
        const { view, done } = mount('function f() {\nreturn 1\n}', [EditorState.tabSize.of(8), EditorState.indentUnit.of('    ')])
        const actions = createTSActions({ lang: 'typescript', fileName: '/fmt-r7a.ts' })
        expect(await actions.formatDocument(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('function f() {\n    return 1\n}')
        done()
    }, SLOW)

    it('Tab 缩进(insertSpaces false):Format Document 用 \\t 缩进', async () => {
        clearTSServiceCache()
        const { view, done } = mount('function f() {\nreturn 1\n}', [EditorState.tabSize.of(4), EditorState.indentUnit.of('\t')])
        const actions = createTSActions({ lang: 'typescript', fileName: '/fmt-r7b.ts' })
        expect(await actions.formatDocument(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('function f() {\n\treturn 1\n}')
        done()
    }, SLOW)
})
