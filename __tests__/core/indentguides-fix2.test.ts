// 第 2 轮 F6b V18:Monaco IndentGuidesOverlay._primaryPosition 初值 null,光标第一次变化前不画活动参考线
import { describe, it, expect } from 'vitest'
import { activeIndentGuideLayer } from '../../src/core/feature/indentguides'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'

describe('活动参考线:光标动过才出现', () => {
    it('打开时光标在缩进块里也不画;选区变一次后画', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'if (a) {\n    b()\n    c()\n}'
        const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(14) }), parent: host })
        const off = activeIndentGuideLayer(view)
        const el = view.dom.querySelector<HTMLElement>('.cm-activeIndentGuide')
        expect(el?.style.display).toBe('none')
        view.dispatch(view.state.update({ changes: { from: 0, insert: ' ' } }))
        expect(el?.style.display).toBe('none')
        view.dispatch(view.state.update({ selection: EditorSelection.single(15) }))
        expect(el?.style.display).toBe('block')
        off(); view.destroy(); host.remove()
    })
})
