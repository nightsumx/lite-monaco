import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { createTSActions } from '../../src/lang/tsactions'
import { clearTSServiceCache } from '../../src/lang/tsservice'

const SLOW = 60_000

describe('expandSmartSelection', () => {
    it('从标识符扩到整句', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 + 2 }\n'
        const pos = doc.indexOf('1')
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(pos),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/smart.ts' })
        expect(await actions.expandSmartSelection(view)).toBe(true)
        const a = view.state.selection.main
        expect(a.to - a.from).toBeGreaterThan(0)
        const first = view.state.sliceDoc(a.from, a.to)
        expect(await actions.expandSmartSelection(view)).toBe(true)
        const b = view.state.selection.main
        expect(b.to - b.from).toBeGreaterThan(a.to - a.from)
        expect(await actions.shrinkSmartSelection(view)).toBe(true)
        expect(view.state.sliceDoc(
            view.state.selection.main.from,
            view.state.selection.main.to,
        )).toBe(first)
        view.destroy()
        host.remove()
    }, SLOW)
})
