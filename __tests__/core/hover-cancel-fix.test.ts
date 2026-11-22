// R3 修复回归:鼠标 hover 待弹时,点击 / 非修饰键取消待弹(Monaco ContentHoverController 的
// onMouseDown / onKeyDown → _hideWidgets → 取消 hover 计算);单独按修饰键不取消。
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { hoverSources, hoverTooltip, showHover, type HoverSource } from '../../src/core/feature/hover'

const cleanups: (() => void)[] = []
afterEach(() => { for (const c of cleanups.splice(0)) c() })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** 装一个 hover 源;delay>0 时源异步(像 TS quickInfo 冷启动) */
function mount(delay = 0) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const src: HoverSource = (_s, pos) => {
        const r = { pos, end: pos + 3, create: () => { const d = document.createElement('div'); d.textContent = 'info'; return d } }
        return delay ? new Promise(res => setTimeout(() => res(r), delay)) : r
    }
    const view = new EditorView({ state: EditorState.create({ doc: 'foo bar\nbaz\n', extensions: [hoverSources.of(src)] }), parent: host })
    view.caretCoords = () => ({ left: 20, top: 10, bottom: 24, height: 14 })
    const doc = view.contentDOM.ownerDocument
    const orig = Object.getOwnPropertyDescriptor(doc, 'caretPositionFromPoint')
    Object.defineProperty(doc, 'caretPositionFromPoint', { configurable: true, writable: true, value: () => ({ offsetNode: view.contentDOM, offset: 0 }) })
    view.posFromDOM = () => 1
    const off = hoverTooltip(view)
    cleanups.push(() => {
        off()
        if (orig) Object.defineProperty(doc, 'caretPositionFromPoint', orig)
        else delete (doc as { caretPositionFromPoint?: unknown }).caretPositionFromPoint
        view.destroy()
        host.remove()
    })
    return view
}

const card = (v: EditorView) => v.dom.querySelector('.cm-tooltip-hover')
const move = (v: EditorView) => v.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 12, bubbles: true }))
const key = (v: EditorView, k: string) => v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
const down = (v: EditorView, target: Element = v.contentDOM) => target.dispatchEvent(new MouseEvent('mousedown', { clientX: 20, clientY: 12, bubbles: true, cancelable: true }))

describe('hover 待弹被点击/按键取消', () => {
    it('对照:只移动鼠标,300ms 后弹', async () => {
        const v = mount()
        move(v)
        await sleep(350)
        expect(card(v)).not.toBeNull()
    })

    it('移上去后在原地点击:不弹', async () => {
        const v = mount()
        move(v)
        await sleep(100)
        down(v)
        await sleep(400)
        expect(card(v)).toBeNull()
    })

    for (const k of ['F12', 'ArrowRight', 'x', 'Escape', 'Enter']) {
        it(`移上去后按 ${k}:不弹`, async () => {
            const v = mount()
            move(v)
            await sleep(100)
            key(v, k)
            await sleep(400)
            expect(card(v)).toBeNull()
        })
    }

    for (const k of ['Shift', 'Meta', 'Control', 'Alt']) {
        it(`移上去后单按修饰键 ${k}:照弹(Monaco 修饰键不隐藏)`, async () => {
            const v = mount()
            move(v)
            await sleep(100)
            key(v, k)
            await sleep(400)
            expect(card(v)).not.toBeNull()
        })
    }

    it('源在算(异步)时按键:结果到了也不弹', async () => {
        const v = mount(200)
        move(v)
        await sleep(350) // 计时器已到,源还在算
        expect(card(v)).toBeNull()
        key(v, 'x')
        await sleep(300)
        expect(card(v)).toBeNull()
    })

    it('源在算(异步)时点击:结果到了也不弹', async () => {
        const v = mount(200)
        move(v)
        await sleep(350)
        down(v)
        await sleep(300)
        expect(card(v)).toBeNull()
    })

    it('点击后再移动鼠标:重新计时照弹', async () => {
        const v = mount()
        move(v)
        await sleep(100)
        down(v)
        move(v)
        await sleep(350)
        expect(card(v)).not.toBeNull()
    })

    it('鼠标 hover 在算时按键盘 Show Hover:取消鼠标那次,键盘卡照弹', async () => {
        const v = mount(200)
        // 像 keymap:contentDOM 上的 keydown 唤起 showHover
        v.contentDOM.addEventListener('keydown', e => { if (e.key === 'i') void showHover(v) })
        move(v)
        await sleep(350)
        key(v, 'i')
        await sleep(300)
        expect(v.dom.querySelector('[data-cm-kb-hover]')).not.toBeNull()
    })

    it('卡片已开时在卡片上按下不关(可以选卡里的字)', async () => {
        const v = mount()
        move(v)
        await sleep(350)
        const c = card(v)!
        down(v, c)
        await sleep(50)
        expect(card(v)).not.toBeNull()
    })
})
