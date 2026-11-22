// 第五轮 O 组:⌘. Quick Fix 改成 Monaco 的 action widget(贴着光标 / 灯泡的下拉),不再是屏幕中央的 picker。
// Monaco 实测(/tmp/lc-hunt/r5/O/m-qf4.ts、m-qf5.ts):
// - 键盘 ⌘.:锚点 = 光标行左下角(x = 光标 left,y = 行底);下方放得下 → top = y + 2,否则翻上去 bottom = y
// - 点灯泡:x = 点击处,y = 灯泡底 + floor(行高 / 3)
// - 第一行是组标题「Quick Fix」(role=separator),第一个操作默认聚焦;↑↓ 循环跳过标题,Mac 上 ⌃N / ⌃P 同;
//   Home / End / PageDown 不动;Enter 应用,Esc 关并回编辑器;鼠标移上去聚焦,点击应用
import { afterEach, describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'

setMacPlatform()
const { showActionList } = await import('../../src/core/feature/actionlist')
const { EditorState } = await import('../../src/core/model/state')
const { EditorView } = await import('../../src/core/view/editorview')

const views: InstanceType<typeof EditorView>[] = []
afterEach(() => {
    for (const v of views.splice(0)) v.destroy()
    document.body.textContent = ''
})

function mount() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc: 'x' }), parent: host })
    views.push(view)
    return view
}
const ITEMS = [
    { label: "Declare method 'zork'", value: 1, group: 'Quick Fix' },
    { label: "Declare property 'zork'", value: 2, group: 'Quick Fix' },
    { label: "Add index signature for property 'zork'", value: 3, group: 'Quick Fix' },
]
const widget = () => document.querySelector('.cm-action-widget') as HTMLElement | null
const focusedIndex = () => [...widget()!.querySelectorAll('[role=option]')].findIndex(r => r.classList.contains('focused'))
const key = (k: string, init: KeyboardEventInit = {}) =>
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))

function withSize(w: number, h: number, fn: () => void) {
    const ow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return (this as HTMLElement).classList.contains('cm-action-widget') ? w : 0 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as HTMLElement).classList.contains('cm-action-widget') ? h : 0 } })
    try { fn() }
    finally {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ow)
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh)
    }
}

describe('showActionList(Monaco action widget)', () => {
    it('结构:组标题 + 操作行,第一个操作聚焦,焦点进列表', () => {
        const view = mount()
        void showActionList(view, { x: 223, y: 222 }, { items: ITEMS })
        const w = widget()!
        expect(w).toBeTruthy()
        const header = w.querySelector('[role=separator]')!
        expect(header.textContent).toBe('Quick Fix')
        const rows = [...w.querySelectorAll('[role=option]')]
        expect(rows.map(r => r.getAttribute('aria-label'))).toEqual(ITEMS.map(i => i.label))
        expect(rows[0].querySelector('.codicon-light-bulb')).toBeTruthy()
        expect(focusedIndex()).toBe(0)
        expect(w.contains(document.activeElement)).toBe(true)
    })

    it('贴在锚点下方 2px;放不下就翻到上方(底边 = 锚点)', () => {
        const view = mount()
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
        Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
        withSize(278, 108, () => { void showActionList(view, { x: 223, y: 222 }, { items: ITEMS }) })
        let w = widget()!
        expect(w.style.position).toBe('fixed')
        expect([w.style.left, w.style.top]).toEqual(['223px', '224px'])
        key('Escape')
        Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
        withSize(278, 108, () => { void showActionList(view, { x: 223, y: 642 }, { items: ITEMS }) })
        w = widget()!
        expect(w.style.top).toBe(`${642 - 108}px`)
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    })

    it('↑↓ 循环(跳过标题),⌃N / ⌃P 同,Home / End 不动', () => {
        const view = mount()
        void showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        const seq: number[] = []
        for (const [k, init] of [['ArrowDown'], ['ArrowDown'], ['ArrowDown'], ['ArrowUp'], ['ArrowUp'], ['End'], ['Home'], ['n', { ctrlKey: true }], ['p', { ctrlKey: true }]] as [string, KeyboardEventInit?][]) {
            key(k, init)
            seq.push(focusedIndex())
        }
        // Monaco 实测:2 3 1 3 2 | End 2 Home 2 | ⌃N 3 ⌃P 2(1 起数)
        expect(seq.map(i => i + 1)).toEqual([2, 3, 1, 3, 2, 2, 2, 3, 2])
    })

    it('Enter 应用聚焦项;Esc 关闭、结 null、焦点回编辑器', async () => {
        const view = mount()
        const p = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        key('ArrowDown')
        key('Enter')
        expect(await p).toBe(2)
        expect(widget()).toBeNull()

        const q = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        key('Escape')
        expect(await q).toBeNull()
        expect(widget()).toBeNull()
        expect(document.activeElement).toBe(view.contentDOM)
    })

    it('鼠标移上去聚焦,点击应用;点外面关', async () => {
        const view = mount()
        const p = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        const rows = [...widget()!.querySelectorAll<HTMLElement>('[role=option]')]
        rows[2].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
        expect(focusedIndex()).toBe(2)
        rows[2].click()
        expect(await p).toBe(3)

        const q = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(await q).toBeNull()
    })

    it('编辑器滚动不关;编辑器尺寸变了才关(Monaco onDidLayoutChange)', async () => {
        const view = mount()
        const p = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        view.measureGeometry()
        expect(widget()).not.toBeNull()
        Object.defineProperty(view.scrollDOM, 'clientWidth', { configurable: true, value: view.scrollDOM.clientWidth + 100 })
        Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, value: 300 })
        view.measureGeometry()
        expect(await p).toBeNull()
    })

    it('view 销毁:菜单摘掉、结 null', async () => {
        const view = mount()
        const p = showActionList(view, { x: 0, y: 0 }, { items: ITEMS })
        view.destroy()
        views.length = 0
        expect(await p).toBeNull()
        expect(widget()).toBeNull()
    })
})
