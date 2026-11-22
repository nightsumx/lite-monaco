// Monaco codeEditorWidget:显示中的 model 被 dispose,编辑器先 setModel(null) 放下它。
// 以前 lite 留着死 model 的引用:getModel() 换成一个隐式 model,下一次 setModel 抛 "Model is disposed!"。
import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { mount } from './h1-helpers'

describe('显示中的 model 被 dispose', () => {
    it('编辑器放下它:getModel() 为 null,发 onDidChangeModel;之后 setModel 别的 model 照常', () => {
        const { ed, done } = mount({ doc: '' })
        const a = createModel('a\nb', 'plaintext')
        ed.setModel(a)
        const evs: any[] = []
        ed.onDidChangeModel(e => evs.push(e))
        a.dispose()
        expect(ed.getModel()).toBe(null)
        expect(evs.length).toBe(1)
        expect(evs[0].oldModelUrl?.toString()).toBe(a.uri.toString())
        expect(evs[0].newModelUrl).toBe(null)
        const b = createModel('x', 'plaintext')
        expect(() => ed.setModel(b)).not.toThrow()
        expect(ed.getValue()).toBe('x')
        b.dispose()
        done()
    })

    it('没显示的 model 被 dispose 不影响编辑器', () => {
        const { ed, done } = mount({ doc: '' })
        const a = createModel('a', 'plaintext'), b = createModel('b', 'plaintext')
        ed.setModel(a)
        b.dispose()
        expect(ed.getModel()).toBe(a)
        a.dispose()
        done()
    })

    it('编辑器先销毁、model 后销毁不报错', () => {
        const { ed, done } = mount({ doc: '' })
        const a = createModel('a', 'plaintext')
        ed.setModel(a)
        done()
        expect(() => a.dispose()).not.toThrow()
    })
})
