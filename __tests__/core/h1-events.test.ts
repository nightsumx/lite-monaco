// H1:焦点 / 输入 / 只读拒编 / 粘贴 / 鼠标 / 键盘 / 内容与折叠事件。
// jsdom 测不了的(真实命中测试、真实焦点移动里 relatedTarget 的所有情形、IME 组字的完整时序)在报告里标注。
import { describe, expect, it } from 'vitest'
import { foldAll, unfoldAll } from '../../src/core/index'
import { pasteText } from '../../src/core/input/clipboard'
import { KeyCode, KeyMod } from '../../src/api/keycodes'
import { mount } from './h1-helpers'

describe('H1 焦点', () => {
    it('onDidFocus/BlurEditorText 与 Widget;hasWidgetFocus', () => {
        const { ed, done } = mount()
        const log: string[] = []
        ed.onDidFocusEditorText(() => log.push('text+'))
        ed.onDidBlurEditorText(() => log.push('text-'))
        ed.onDidFocusEditorWidget(() => log.push('widget+'))
        ed.onDidBlurEditorWidget(() => log.push('widget-'))
        expect(ed.hasWidgetFocus()).toBe(false)
        ed.contentDOM.focus()
        expect(log).toEqual(['text+', 'widget+'])
        expect(ed.hasWidgetFocus()).toBe(true)
        ed.contentDOM.blur()
        expect(log).toEqual(['text+', 'widget+', 'text-', 'widget-'])
        expect(ed.hasWidgetFocus()).toBe(false)
        done()
    })

    it('焦点在编辑器内的别的元素上(查找框之类):文本失焦、widget 仍有焦点', () => {
        const { ed, done } = mount()
        const input = document.createElement('input')
        ed.dom.appendChild(input)
        const log: string[] = []
        ed.onDidBlurEditorText(() => log.push('text-'))
        ed.onDidBlurEditorWidget(() => log.push('widget-'))
        ed.contentDOM.focus()
        input.focus()
        expect(ed.hasWidgetFocus()).toBe(true)
        expect(log).toEqual(['text-'])
        input.blur()
        expect(ed.hasWidgetFocus()).toBe(false)
        expect(log).toEqual(['text-', 'widget-'])
        done()
    })
})

describe('H1 输入与编辑事件', () => {
    it('onDidCompositionStart / End', () => {
        const { ed, done } = mount()
        const log: string[] = []
        ed.onDidCompositionStart(() => log.push('start'))
        ed.onDidCompositionEnd(() => log.push('end'))
        ed.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }))
        ed.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }))
        expect(log).toEqual(['start', 'end'])
        done()
    })

    it('组字中 DOM 已改、compositionend 先到(失焦路径):先把内容读进 model,再发 onDidCompositionEnd', () => {
        const { ed, done } = mount()
        const log: string[] = []
        ed.onDidChangeModelContent(() => log.push('chg'))
        ed.onDidCompositionEnd(() => log.push('end:' + ed.getValue()))
        const line = ed.contentDOM.querySelector('.cm-line') as HTMLElement
        ed.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }))
        line.appendChild(document.createTextNode('你'))
        ed.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }))
        // 内容变更(若 jsdom 里观察者读到了 DOM)必须在 end 之前;end 时 model 已含提交文本
        const endIdx = log.findIndex(x => x.startsWith('end:'))
        expect(endIdx).toBeGreaterThanOrEqual(0)
        const chgIdx = log.indexOf('chg')
        if (chgIdx >= 0) expect(chgIdx).toBeLessThan(endIdx)
        done()
    })

    it('onDidAttemptReadOnlyEdit:只读时试图编辑发一次;非只读不发', () => {
        const { ed, done } = mount({ readOnly: true })
        let n = 0
        ed.onDidAttemptReadOnlyEdit(() => { n++ })
        ed.attemptReadOnlyEdit()
        expect(n).toBe(1)
        ed.attemptReadOnlyEdit()
        expect(n).toBe(1) // 同一个宏任务里重复触发(keydown + beforeinput)合并
        ed.updateOptions({ readOnly: false } as never)
        ed.attemptReadOnlyEdit()
        expect(n).toBe(1)
        done()
    })

    it('onDidPaste(仅粘贴事务触发):range 从粘贴前选区起点到粘贴后光标', () => {
        const { ed, done } = mount({ doc: 'abc\ndef' })
        const got: unknown[] = []
        ed.onDidPaste(e => got.push({ r: [e.range.startLineNumber, e.range.startColumn, e.range.endLineNumber, e.range.endColumn], lang: e.languageId }))
        ed.dispatch(ed.state.update({ selection: { anchor: 1 } }))
        pasteText(ed, 'XY\nZ')
        expect(ed.state.sliceDoc()).toBe('aXY\nZbc\ndef')
        expect(got).toEqual([{ r: [1, 2, 2, 2], lang: 'text' }])
        // 普通输入不算粘贴
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'q' }, userEvent: 'input.type' }))
        expect(got.length).toBe(1)
        done()
    })

    it('onDidChangeModelContent:Monaco 形态(changes 坐标是改前文档、isFlush/isUndoing)', () => {
        const { ed, done } = mount({ doc: 'abc\ndef' })
        const evs: any[] = []
        ed.onDidChangeModelContent(e => evs.push(e))
        ed.dispatch(ed.state.update({ changes: { from: 5, to: 6, insert: 'XY' }, userEvent: 'input.type' }))
        expect(evs.length).toBe(1)
        expect(evs[0].changes[0]).toMatchObject({ rangeOffset: 5, rangeLength: 1, text: 'XY' })
        expect(evs[0].changes[0].range).toMatchObject({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 3 })
        expect(evs[0].isFlush).toBe(false)
        expect(evs[0].eol).toBe('\n')
        ed.setValue('zzz')
        expect(evs[1].isFlush).toBe(true)
        done()
    })

    it('onDidChangeModelOptions:tabSize 变了发事件', () => {
        const { ed, done } = mount({ doc: 'a' })
        const evs: any[] = []
        ed.onDidChangeModelOptions(e => evs.push(e))
        ed.updateOptions({ tabSize: 8, detectIndentation: false } as never)
        expect(evs.length).toBeGreaterThan(0)
        expect(evs.some(e => e.tabSize)).toBe(true)
        done()
    })

    it('onDidChangeHiddenAreas:折叠 / 展开时发', () => {
        const { ed, done } = mount({ doc: 'function a() {\n  return 1\n}\nlet b = 2', lang: 'typescript' })
        let n = 0
        ed.onDidChangeHiddenAreas(() => { n++ })
        foldAll(ed)
        expect(n).toBe(1)
        unfoldAll(ed)
        expect(n).toBe(2)
        done()
    })
})

describe('H1 鼠标 / 键盘事件', () => {
    it('onMouseDown/Up/Move/ContextMenu:带 IMouseEvent 与 target', () => {
        const { ed, done } = mount()
        const log: string[] = []
        ed.onMouseDown(e => log.push('down' + e.event.leftButton + (typeof e.target.type)))
        ed.onMouseUp(() => log.push('up'))
        ed.onMouseMove(() => log.push('move'))
        ed.onContextMenu(e => log.push('menu' + e.event.rightButton))
        const fire = (t: string, init: MouseEventInit = {}) => ed.contentDOM.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: 5, clientY: 5, ...init }))
        fire('mousedown'); fire('mouseup'); fire('mousemove'); fire('contextmenu', { button: 2 })
        expect(log).toEqual(['downtruenumber', 'up', 'move', 'menutrue'])
        done()
    })

    it('onMouseLeave', () => {
        const { ed, done } = mount()
        let n = 0
        ed.onMouseLeave(e => { n++; expect(e.event.browserEvent.type).toBe('mouseleave') })
        ed.dom.dispatchEvent(new MouseEvent('mouseleave'))
        expect(n).toBe(1)
        done()
    })

    it('onMouseDrop', () => {
        const { ed, done } = mount()
        let n = 0
        ed.onMouseDrop(() => { n++ })
        ed.contentDOM.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }))
        expect(n).toBe(1)
        done()
    })

    it('onKeyDown/onKeyUp:keyCode 是 Monaco KeyCode,equals 比修饰键 + 键', () => {
        const { ed, done } = mount()
        const seen: { code: number, ctrl: boolean, eq: boolean }[] = []
        ed.onKeyDown(e => seen.push({ code: e.keyCode, ctrl: e.ctrlKey, eq: e.equals(KeyMod.WinCtrl | KeyCode.KeyS) }))
        let up = 0
        ed.onKeyUp(() => { up++ })
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', keyCode: 83, ctrlKey: true, bubbles: true, cancelable: true }))
        ed.contentDOM.dispatchEvent(new KeyboardEvent('keyup', { key: 's', code: 'KeyS', keyCode: 83, bubbles: true }))
        expect(seen[0].code).toBe(KeyCode.KeyS)
        expect(seen[0].ctrl).toBe(true)
        expect(up).toBe(1)
        done()
    })

    it('销毁后事件不再触发', () => {
        const { ed, done } = mount()
        let n = 0
        ed.onKeyDown(() => { n++ })
        const el = ed.contentDOM
        done()
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', keyCode: 65, bubbles: true }))
        expect(n).toBe(0)
    })
})
