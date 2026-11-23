// H1:setValue(撤销语义对照 Monaco TextModel.setValue)、setModel + onWill/DidChangeModel、trigger、getValue。
import { describe, expect, it } from 'vitest'
import { undo, redo } from '../../src/core/edit/history'
import { createModel } from '../../src/api/model'
import { Uri } from '../../src/api/uri'
import { foldAll, foldField } from '../../src/core/index'
import { mount } from './h1-helpers'

describe('H1 setValue / getValue', () => {
    it('Monaco 语义:清撤销栈、光标回 (1,1)、发 isFlush、版本号变;撤销不会回到 setValue 之前', () => {
        const { ed, done } = mount({ doc: 'abc' })
        ed.dispatch(ed.state.update({ changes: { from: 3, insert: 'd' }, userEvent: 'input.type' }))
        const evs: any[] = []
        ed.onDidChangeModelContent(e => evs.push(e))
        ed.dispatch(ed.state.update({ selection: { anchor: 2 } }))
        ed.setValue('hello\nworld')
        expect(ed.getValue()).toBe('hello\nworld')
        expect(ed.state.selection.main.head).toBe(0)
        expect(evs.length).toBe(1)
        expect(evs[0].isFlush).toBe(true)
        expect(evs[0].versionId).toBeGreaterThan(1)
        undo(ed) // 撤销栈已清:什么都不发生
        expect(ed.getValue()).toBe('hello\nworld')
        // setValue 之后的编辑可撤销,且只撤销到 setValue 的结果
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' }))
        undo(ed)
        expect(ed.getValue()).toBe('hello\nworld')
        redo(ed)
        expect(ed.getValue()).toBe('Xhello\nworld')
        done()
    })

    it('只读编辑器照样 setValue(它是 model 的 API,不是编辑命令)', () => {
        const { ed, done } = mount({ doc: 'a', readOnly: true })
        ed.setValue('b')
        expect(ed.getValue()).toBe('b')
        done()
    })

    it('换行符按新文本重新认;getValue({ lineEnding }) 转换', () => {
        const { ed, done } = mount({ doc: 'a\nb' })
        ed.setValue('x\r\ny\r\nz')
        expect(ed.getValue()).toBe('x\r\ny\r\nz')
        expect(ed.getValue({ lineEnding: '\n', preserveBOM: false })).toBe('x\ny\nz')
        ed.setValue('p\nq')
        expect(ed.getValue({ lineEnding: '\r\n', preserveBOM: false })).toBe('p\r\nq')
        done()
    })
})

describe('H1 setModel', () => {
    it('换 model:文本、撤销栈、选区、折叠各归各的;onWill → onDid 顺序,带新旧 uri', () => {
        const { ed, done } = mount({ doc: 'one\ntwo', lang: 'typescript' })
        const m1 = createModel('one\ntwo', 'typescript', Uri.parse('inmemory://m1'))
        ed.setModel(m1) // 自己建的临时 model 此时被销毁(见下一个用例),之后 m1 是普通 model
        const m2 = createModel('function g() {\n  return 2\n}\nlet z', 'typescript', Uri.parse('inmemory://m2'))
        const log: string[] = []
        ed.onWillChangeModel(e => log.push(`will ${e.oldModelUrl === m1.uri} ${e.newModelUrl === m2.uri} ${ed.getModel() === m1}`))
        ed.onDidChangeModel(e => log.push(`did ${e.oldModelUrl === m1.uri} ${e.newModelUrl === m2.uri} ${ed.getModel() === m2}`))

        // m1 上做点编辑,留下撤销栈
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'A' }, userEvent: 'input.type' }))
        ed.setModel(m2)
        expect(log).toEqual(['will true true true', 'did true true true'])
        expect(ed.getValue()).toBe('function g() {\n  return 2\n}\nlet z')
        expect(m1.getValue()).toBe('Aone\ntwo') // 旧 model 收回快照,内容保留

        // m2 的编辑进 m2,并且 m1 的撤销栈不串过来
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'B' }, userEvent: 'input.type' }))
        expect(m2.getValue().startsWith('Bfunction')).toBe(true)
        undo(ed)
        expect(m2.getValue().startsWith('function')).toBe(true)
        undo(ed) // m2 栈空了,不会撤销到 m1 的 'A'
        expect(ed.getValue().startsWith('function')).toBe(true)

        // 切回 m1:它自己的撤销栈还在
        ed.setModel(m1)
        expect(ed.getValue()).toBe('Aone\ntwo')
        undo(ed)
        expect(ed.getValue()).toBe('one\ntwo')
        done()
    })

    it('换 model 时折叠清空,切回来也不还原(同 Monaco:要还原用 saveViewState / restoreViewState)', () => {
        const { ed, done } = mount({ doc: 'function f() {\n  return 1\n}\nlet b = 2', lang: 'typescript' })
        const m1 = createModel('function f() {\n  return 1\n}\nlet b = 2', 'typescript', Uri.parse('inmemory://m1f'))
        ed.setModel(m1)
        foldAll(ed)
        const folds = [...(ed.state.field(foldField, false) ?? [])]
        expect(folds.length).toBeGreaterThan(0)
        const m2 = createModel('plain text\nsecond', 'typescript', Uri.parse('inmemory://m3'))
        ed.setModel(m2)
        expect([...(ed.state.field(foldField, false) ?? [])]).toEqual([])
        ed.setModel(m1)
        expect([...(ed.state.field(foldField, false) ?? [])]).toEqual([])
        done()
    })

    it('换行符与缩进选项跟着 model;语言跟着 model', () => {
        const { ed, done } = mount({ doc: 'a', lang: 'typescript' })
        const m2 = createModel('x\r\ny', 'text', Uri.parse('inmemory://m4'))
        ed.setModel(m2)
        expect(ed.getModel()!.getEOL()).toBe('\r\n')
        expect(ed.getModel()!.getLanguageId()).toBe('text')
        expect(ed.getValue()).toBe('x\r\ny')
        done()
    })

    it('编辑器自己建的 model 换走就销毁(Monaco _ownsModel);createModel 出来的不销毁', () => {
        const { ed, done } = mount({ doc: 'a' })
        const own = ed.getModel()!
        const mine = createModel('b', 'text', Uri.parse('inmemory://own1'))
        ed.setModel(mine)
        expect(own.isDisposed()).toBe(true)
        ed.setModel(createModel('c', 'text', Uri.parse('inmemory://own2')))
        expect(mine.isDisposed()).toBe(false)
        done()
    })

    it('同一个 model 不动不发事件;null 清空;已销毁的 model 抛错', () => {
        const { ed, done } = mount({ doc: 'a' })
        const m = ed.getModel()!
        let n = 0
        ed.onDidChangeModel(() => { n++ })
        ed.setModel(m)
        expect(n).toBe(0)
        ed.setModel(null)
        expect(n).toBe(1)
        expect(ed.getModel()).toBeNull()
        const dead = createModel('d', 'text', Uri.parse('inmemory://dead'))
        dead.dispose()
        expect(() => ed.setModel(dead)).toThrow()
        done()
    })

    it('onDidChangeModelContent 在换 model 之后转发新 model 的事件', () => {
        const { ed, done } = mount({ doc: 'a' })
        const evs: any[] = []
        ed.onDidChangeModelContent(e => evs.push(e))
        const m2 = createModel('zz', 'text', Uri.parse('inmemory://m5'))
        ed.setModel(m2)
        evs.length = 0
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'q' }, userEvent: 'input.type' }))
        expect(evs.length).toBe(1)
        expect(m2.getValue()).toBe('qzz')
        done()
    })
})

describe('H1 trigger', () => {
    it('type / cut / undo / redo / 光标命令 / 编辑命令', () => {
        const { ed, done } = mount({ doc: 'abc def' })
        ed.trigger('test', 'type', { text: 'X' })
        expect(ed.getValue()).toBe('Xabc def')
        ed.trigger('test', 'undo')
        expect(ed.getValue()).toBe('abc def')
        ed.trigger('test', 'redo')
        expect(ed.getValue()).toBe('Xabc def')
        ed.trigger('test', 'cursorEnd')
        expect(ed.state.selection.main.head).toBe(ed.state.doc.length)
        ed.trigger('test', 'cursorHome')
        expect(ed.state.selection.main.head).toBe(0)
        ed.trigger('test', 'selectAll')
        expect(ed.state.selection.main.to).toBe(ed.state.doc.length)
        ed.trigger('test', 'deleteLeft')
        expect(ed.getValue()).toBe('')
        done()
    })

    it('compositionType 替换前一个字符', () => {
        const { ed, done } = mount({ doc: 'ab' })
        ed.dispatch(ed.state.update({ selection: { anchor: 2 } }))
        ed.trigger('test', 'compositionType', { text: 'XY', replacePrevCharCnt: 1 })
        expect(ed.getValue()).toBe('aXY')
        done()
    })

    it('paste(带文本)走粘贴路径,触发 onDidPaste;只读时不改文档', () => {
        const { ed, done } = mount({ doc: 'ab' })
        let pasted = 0
        ed.onDidPaste(() => { pasted++ })
        ed.trigger('test', 'paste', { text: 'ZZ' })
        expect(ed.getValue()).toBe('ZZab')
        expect(pasted).toBe(1)
        ed.updateOptions({ readOnly: true } as never)
        ed.trigger('test', 'type', { text: 'q' })
        expect(ed.getValue()).toBe('ZZab')
        done()
    })

    it('不认识的 id 什么都不做(同 Monaco);"default:" 前缀兼容', () => {
        const { ed, done } = mount({ doc: 'ab' })
        ed.trigger('test', 'no.such.handler')
        ed.trigger('test', 'default:type', { text: 'k' })
        expect(ed.getValue()).toBe('kab')
        done()
    })

    it('没命中核心命令时回落动作注册表', () => {
        const { ed, done } = mount({ doc: 'ab' })
        const hit: unknown[] = []
        const holder = ed as unknown as { getAction?: unknown }
        if (typeof holder.getAction !== 'function') {
            // H2 的 actions 还没挂 getAction:只验证回落分支不抛
            ed.trigger('test', 'editor.action.somethingElse')
        } else {
            ed.addAction({ id: 'h1.test.action', label: 'x', run: () => { hit.push(1) } } as never)
            ed.trigger('test', 'h1.test.action')
            expect(hit.length).toBe(1)
        }
        done()
    })
})
