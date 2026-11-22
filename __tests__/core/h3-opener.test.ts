// H3:editor.registerEditorOpener —— 定义落在别的文件时问 opener(接管了就不再自己处理)。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { createTSActions } from '../../src/lang/tsactions'
import { registerEditorOpener, openCodeEditorViaOpeners, hasEditorOpener } from '../../src/api/openers'

describe('H3 registerEditorOpener', () => {
    it('注册顺序问、第一个接管的算数、dispose 取消、出错的当没接管', async () => {
        const calls: string[] = []
        const a = registerEditorOpener({ openCodeEditor: () => { calls.push('a'); return false } })
        const b = registerEditorOpener({ openCodeEditor: () => { calls.push('b'); throw new Error('x') } })
        const c = registerEditorOpener({ openCodeEditor: async () => { calls.push('c'); return true } })
        const d = registerEditorOpener({ openCodeEditor: () => { calls.push('d'); return true } })
        const err = console.error; console.error = () => {}
        expect(await openCodeEditorViaOpeners({} as any, { toString: () => 'x' } as any)).toBe(true)
        expect(calls).toEqual(['a', 'b', 'c'])
        c.dispose()
        calls.length = 0
        await openCodeEditorViaOpeners({} as any, {} as any)
        expect(calls).toEqual(['a', 'b', 'd'])
        console.error = err
        a.dispose(); b.dispose(); d.dispose()
        expect(hasEditorOpener()).toBe(false)
    })

    it('转到定义落在别的文件:用 uri + 选区调 opener;没有 opener 时什么都不做', async () => {
        clearTSServiceCache()
        const doc = 'import { foo } from \'./op-lib\'\nfoo\n'
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(doc.lastIndexOf('foo') + 1) }), parent: host })
        const actions = createTSActions({ lang: 'typescript', fileName: '/op-main.ts', files: { '/op-lib.ts': 'export const foo = 1\n' } })
        await actions.goToDefinition(view) // 没注册:不动
        expect(view.state.selection.main.head).toBe(doc.lastIndexOf('foo') + 1)
        const got: any[] = []
        const d = registerEditorOpener({ openCodeEditor: (src, uri, sel) => { got.push({ src, path: uri.path, sel }); return true } })
        await actions.goToDefinition(view)
        await new Promise(r => setTimeout(r, 0))
        d.dispose()
        expect(got.length).toBe(1)
        expect(got[0].src).toBe(view)
        expect(got[0].path).toBe('/op-lib.ts')
        expect(got[0].sel).toEqual({ startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 17 })
        view.destroy(); host.remove()
    }, 60_000)
})
