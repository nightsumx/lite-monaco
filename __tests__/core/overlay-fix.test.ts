// F7 浮层修复:命令面板 / Go to Line(共用 quick input)/ 右键菜单。
// 对照 Monaco 0.52 实测(/tmp/lc-hunt/f7/m-quick.ts、m-menu.ts)。
import { afterEach, describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { parseGotoPosition } from '../../src/core/feature/gotoline'
import { matchCommandLabel, openCommandPalette, openGotoLine } from '../../src/core/feature/commandpalette'
import { activeQuickInput, keybindingParts } from '../../src/core/feature/overlay'
import { contextMenuCM7, contextMenuIsOpen, type ContextMenuItem } from '../../src/core/feature/contextmenu'
import { keyOS } from '../../src/core/keyos'
import { make } from './input-harness'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
const qiInput = (view: EditorView) => view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
const typeInto = (input: HTMLInputElement, v: string) => {
    input.value = v
    input.dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e
}
const labels = (view: EditorView) => [...view.dom.querySelectorAll('.cm-quick-input-label')].map(n => n.textContent)

afterEach(() => {
    document.querySelectorAll('body > .cm-context-menu').forEach(n => n.remove())
    document.body.replaceChildren()
})

describe('P0 浮层随 view.destroy 清理', () => {
    it('命令面板:destroy 后 DOM 不残留,window keydown 不再被拦', () => {
        const view = make('abc')
        openCommandPalette(view)
        expect(view.dom.querySelector('.cm-quick-input')).not.toBeNull()
        view.destroy()
        expect(document.querySelector('.cm-quick-input, .cm-picker')).toBeNull()
        expect(activeQuickInput(view)).toBeNull()
        // 旧实现在 window 挂 keydown 并 preventDefault:destroy 后仍然吞 Escape/Enter
        expect(key(window, 'Enter').defaultPrevented).toBe(false)
        expect(key(window, 'Escape').defaultPrevented).toBe(false)
    })

    it('Go to Line:destroy 后 DOM 不残留、焦点不卡在输入框里', () => {
        const view = make(lines(5))
        openGotoLine(view)
        const input = qiInput(view)
        expect(document.activeElement).toBe(input)
        view.destroy()
        expect(document.querySelector('.cm-quick-input, .cm-picker')).toBeNull()
        expect(input.isConnected).toBe(false)
        expect(key(window, 'Enter').defaultPrevented).toBe(false)
    })

    it('右键菜单:destroy 后 DOM 不残留、window 监听撤掉', () => {
        const view = make('abc')
        contextMenuCM7()(view)
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
        expect(contextMenuIsOpen()).toBe(true)
        view.destroy()
        expect(contextMenuIsOpen()).toBe(false)
        expect(key(window, 'ArrowDown').defaultPrevented).toBe(false)
    })

    it('onDestroy 钩子先于 overlay disposer、可退订', () => {
        const view = make('a')
        const seen: string[] = []
        view.onDestroy(() => seen.push(view.dom.isConnected ? 'dom' : 'gone'))
        const off = view.onDestroy(() => seen.push('off'))
        off()
        view.destroy()
        expect(seen).toEqual(['dom'])
    })
})

describe('P1 Go to Line 无效输入', () => {
    it('abc 回车不跳、不关;合法行号回车才跳并关', () => {
        const view = make(lines(10))
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(3) }))
        openGotoLine(view)
        const input = qiInput(view)
        typeInto(input, ':abc')
        key(input, 'Enter')
        expect(view.state.selection.main.head).toBe(3)
        expect(activeQuickInput(view)).not.toBeNull()
        typeInto(input, ':4')
        key(input, 'Enter')
        expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from)
        expect(activeQuickInput(view)).toBeNull()
        view.destroy()
    })

    it('解析对齐 Monaco 0.55:行:列 / 行,列 / 负数倒数 / 0 与超范围 clamp / 非数无 line / ::偏移', () => {
        const state = EditorState.create({ doc: lines(60) })
        const at = (v: string, z = false) => { const r = parseGotoPosition(state, v, z); return [r.line, r.column] }
        expect(at('40')).toEqual([40, 1])
        expect(at('40:5')).toEqual([40, 5])
        expect(at('40,5')).toEqual([40, 5])
        expect(at('40#5')).toEqual([40, 5])
        expect(at('-1')).toEqual([60, 1])
        expect(at('-3')).toEqual([58, 1])
        expect(at(' 7 ')).toEqual([7, 1])
        expect(at('0')).toEqual([1, 1])
        expect(at('999')).toEqual([60, 1])
        expect(at('abc')).toEqual([undefined, undefined])
        expect(at('')).toEqual([undefined, undefined])
        expect(at(':1')).toEqual([1, 1])
        expect(at(':1', true)).toEqual([1, 2])
        expect(parseGotoPosition(state, ':').inOffsetMode).toBe(true)
    })
})

describe('P1 同一浮层不重复打开', () => {
    it('Go to Line 连开两次只有一个,焦点在已有的输入框', () => {
        const view = make(lines(5))
        openGotoLine(view)
        const first = qiInput(view)
        typeInto(first, ':3')
        openGotoLine(view)
        expect(view.dom.querySelectorAll('.cm-quick-input').length).toBe(1)
        expect(qiInput(view)).toBe(first)
        expect(document.activeElement).toBe(first)
        view.destroy()
    })

    it('命令面板开着再按 Go to Line:同一个框换成 ":"', () => {
        const view = make(lines(5))
        openCommandPalette(view)
        openCommandPalette(view)
        expect(view.dom.querySelectorAll('.cm-quick-input').length).toBe(1)
        openGotoLine(view)
        expect(view.dom.querySelectorAll('.cm-quick-input').length).toBe(1)
        expect(qiInput(view).value).toBe(':')
        expect(labels(view)[0]).toBe('Type a line number to go to (from 1 to 5).')
        view.destroy()
    })
})

describe('P2 quick input 位置和内容', () => {
    it('挂在编辑器里(不挂 body),没有遮罩', () => {
        const view = make('a')
        openCommandPalette(view)
        const root = view.dom.querySelector('.cm-quick-input')!
        expect(root.parentElement).toBe(view.dom)
        expect(document.querySelector('body > .cm-quick-input, body > .cm-picker')).toBeNull()
        view.destroy()
    })

    it('Go to Line 文案(Monaco 0.55):空输入给范围提示,合法给 Press Enter', () => {
        const view = make(lines(60))
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(10).from + 6) }))
        openGotoLine(view)
        expect(labels(view)).toEqual(['Type a line number to go to (from 1 to 60).'])
        const input = qiInput(view)
        typeInto(input, ':40')
        expect(labels(view)).toEqual(["Press 'Enter' to go to line 40 or enter : to add a column number."])
        typeInto(input, ':40:5')
        expect(labels(view)).toEqual(["Press 'Enter' to go to line 40 at column 5."])
        typeInto(input, ':abc')
        expect(labels(view)[0]).toBe('Type a line number to go to (from 1 to 60).')
        // 预览不动选区
        typeInto(input, ':40')
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(10)
        key(input, 'Escape')
        expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(10)
        view.destroy()
    })

    it('Go to Line 行:列 跳到列', () => {
        const view = make(lines(5))
        openGotoLine(view)
        typeInto(qiInput(view), ':3:4')
        key(qiInput(view), 'Enter')
        expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from + 3)
        view.destroy()
    })

    it('命令面板:">" 前缀、字母序、匹配高亮、快捷键键帽', () => {
        const view = make('a')
        openCommandPalette(view, [
            { id: 'u', label: 'Transform to Uppercase', run: () => true },
            { id: 'a', label: 'Add Line Comment', keybinding: '⌘K ⌘C', run: () => true },
            { id: 'z', label: 'Zoom', keybinding: 'Ctrl+Shift+Z', run: () => true },
        ])
        const input = qiInput(view)
        expect(input.value).toBe('>')
        expect(labels(view)).toEqual(['Add Line Comment', 'Transform to Uppercase', 'Zoom'])
        const kb = [...view.dom.querySelectorAll('.cm-quick-input-row')][2].querySelectorAll('.cm-keybinding-key')
        expect([...kb].map(k => k.textContent)).toEqual(['Ctrl', 'Shift', 'Z'])
        typeInto(input, '>trup')
        expect(labels(view)).toEqual(['Transform to Uppercase'])
        const hl = [...view.dom.querySelectorAll('.cm-quick-input-highlight')].map(n => n.textContent)
        expect(hl).toEqual(['Tr', 'Up'])
        view.destroy()
    })

    it('删掉 ">" 显示帮助(Monaco HelpQuickAccessProvider),选 ":" 换成 Go to Line', () => {
        const view = make(lines(3))
        openCommandPalette(view)
        const input = qiInput(view)
        typeInto(input, '')
        expect(labels(view)).toEqual(['\u2026', ':', '>'])
        expect([...view.dom.querySelectorAll('.cm-quick-input-row')].map(r => r.getAttribute('aria-label')))
            .toEqual(['\u2026, Show all Quick Access Providers', ':, Go to Line/Column...', '>, Show And Run Commands'])
        key(input, 'Enter')
        expect(input.value).toBe('')
        typeInto(input, 'g')
        expect(labels(view)).toEqual([])
        typeInto(input, '')
        key(input, 'ArrowDown')
        key(input, 'Enter')
        expect(input.value).toBe(':')
        expect(activeQuickInput(view)).not.toBeNull()
        view.destroy()
    })

    it('matchCommandLabel:前缀 / 词首 / 连续子串', () => {
        expect(matchCommandLabel('tra', 'Transform to Uppercase')).toEqual([[0, 3]])
        expect(matchCommandLabel('trup', 'Transform to Uppercase')).toEqual([[0, 2], [13, 15]])
        expect(matchCommandLabel('form', 'Transform to Uppercase')).toEqual([[5, 9]])
        expect(matchCommandLabel('xyz', 'Transform to Uppercase')).toBeNull()
        expect(matchCommandLabel('', 'X')).toEqual([])
    })

    it('keybindingParts:mac 符号逐键、+ 分隔逐段', () => {
        expect(keybindingParts('⇧⌘P')).toEqual(['⇧', '⌘', 'P'])
        expect(keybindingParts('⌃G')).toEqual(['⌃', 'G'])
        expect(keybindingParts('Ctrl+Shift+K')).toEqual(['Ctrl', 'Shift', 'K'])
        expect(keybindingParts('F1')).toEqual(['F1'])
    })
})

describe('P2 quick input 焦点', () => {
    it('Escape 关闭后焦点回编辑器,选区不变', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(2, 5) }))
        openCommandPalette(view)
        key(qiInput(view), 'Escape')
        expect(document.activeElement).toBe(view.contentDOM)
        expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([2, 5])
        view.destroy()
    })

    it('Enter 执行后焦点回编辑器,命令确实跑了', async () => {
        const view = make('hello world')
        let ran = false
        openCommandPalette(view, [{ id: 'x', label: 'Run X', run: () => { ran = document.activeElement === view.contentDOM } }])
        key(qiInput(view), 'Enter')
        await Promise.resolve()
        expect(ran).toBe(true)
        view.destroy()
    })

    it('第一次 Tab 留在框内,第二次关掉、焦点回编辑器(Monaco:焦点出 widget 就关);⇧Tab 留在框内', () => {
        const view = make('a')
        openGotoLine(view)
        const input = qiInput(view)
        expect(key(input, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true)
        expect(key(input, 'Tab').defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(input)
        key(input, 'Tab')
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        expect(document.activeElement).toBe(view.contentDOM)
        view.destroy()
    })

    it('框内按键不冒泡到编辑器 keymap', () => {
        const view = make('a')
        let reached = 0
        view.dom.addEventListener('keydown', () => { reached++ })
        openCommandPalette(view)
        key(qiInput(view), 'ArrowDown')
        key(qiInput(view), 'Escape')
        expect(reached).toBe(0)
        view.destroy()
    })
})

describe('P1 右键菜单', () => {
    const items = (log: string[]): ContextMenuItem[] => [
        { id: 'a', label: 'Alpha', run: () => { log.push('a'); return true } },
        { id: 'off', label: 'Off', enabled: () => false, run: () => { log.push('off'); return true } },
        { id: 'sep', separator: true },
        { id: 'b', label: 'Beta', run: () => { log.push('b'); return true } },
        { id: 'c', label: 'Gamma', run: () => { log.push('c'); return true } },
    ]
    const open = (log: string[], x = 30, y = 30) => {
        const view = make('hello world')
        contextMenuCM7({ items: items(log) })(view)
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
        const menu = document.querySelector('body > .cm-context-menu') as HTMLElement
        const rows = [...menu.querySelectorAll(':scope > .cm-context-item')] as HTMLElement[]
        return { view, menu, rows }
    }
    const focusedLabel = (menu: HTMLElement) => menu.querySelector(':scope > .cm-context-item.focused .cm-context-label')?.textContent ?? null

    it('打开时无聚焦项、焦点在菜单上;↓ 从第一项、↑ 从最后一项,跳过禁用和分隔,循环', () => {
        const log: string[] = []
        const { view, menu } = open(log)
        expect(document.activeElement).toBe(menu)
        expect(focusedLabel(menu)).toBeNull()
        key(window, 'ArrowDown')
        expect(focusedLabel(menu)).toBe('Alpha')
        key(window, 'ArrowDown')
        expect(focusedLabel(menu)).toBe('Beta')
        key(window, 'ArrowDown')
        key(window, 'ArrowDown')
        expect(focusedLabel(menu)).toBe('Alpha')
        key(window, 'ArrowUp')
        expect(focusedLabel(menu)).toBe('Gamma')
        key(window, 'Home')
        expect(focusedLabel(menu)).toBe('Alpha')
        key(window, 'End')
        expect(focusedLabel(menu)).toBe('Gamma')
        view.destroy()
    })

    it('打开时 ↑ 落最后一项', () => {
        const { view, menu } = open([])
        key(window, 'ArrowUp')
        expect(focusedLabel(menu)).toBe('Gamma')
        view.destroy()
    })

    it('Enter 执行聚焦项并关菜单,焦点回编辑器', () => {
        const log: string[] = []
        const { view } = open(log)
        key(window, 'ArrowDown')
        key(window, 'ArrowDown')
        key(window, 'Enter')
        expect(log).toEqual(['b'])
        expect(contextMenuIsOpen()).toBe(false)
        expect(document.activeElement).toBe(view.contentDOM)
        view.destroy()
    })

    it('Escape 关闭、焦点回编辑器、选区不变', () => {
        const { view } = open([])
        const sel = view.state.selection.main
        key(window, 'Escape')
        expect(contextMenuIsOpen()).toBe(false)
        expect(document.activeElement).toBe(view.contentDOM)
        expect(view.state.selection.main.eq(sel)).toBe(true)
        view.destroy()
    })

    it('打字时菜单不关,字符不进文档', () => {
        const { view } = open([])
        const e = key(window, 'q')
        expect(contextMenuIsOpen()).toBe(true)
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('hello world')
        key(window, 'Tab')
        expect(contextMenuIsOpen()).toBe(true)
        view.destroy()
    })

    it('mousedown 不执行,mouseup 执行', () => {
        const log: string[] = []
        const { view, rows } = open(log)
        rows[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))
        expect(log).toEqual([])
        expect(contextMenuIsOpen()).toBe(true)
        rows[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))
        expect(log).toEqual(['a'])
        expect(contextMenuIsOpen()).toBe(false)
        view.destroy()
    })

    it('按住右键拖到项上松开 = 执行;原地松开不执行', () => {
        const log: string[] = []
        const { view, rows } = open(log, 30, 30)
        // 原地松开(打开菜单的那次按压)
        rows[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 }))
        expect(log).toEqual([])
        expect(contextMenuIsOpen()).toBe(true)
        view.destroy()

        const log2: string[] = []
        const second = open(log2, 30, 30)
        second.rows[1].dispatchEvent(new MouseEvent('mouseenter', { clientX: 60, clientY: 90 }))
        second.rows[1].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, clientX: 60, clientY: 90 }))
        expect(log2).toEqual(['b'])
        second.view.destroy()
    })

    it('不可用项不渲染(Monaco precondition 并进 when);分隔线不打头、不收尾、不连续', () => {
        const { view, menu } = open([])
        expect([...menu.querySelectorAll(':scope > *')].map(el => el.classList.contains('cm-context-sep') ? '-' : el.textContent))
            .toEqual(['Alpha', '-', 'Beta', 'Gamma'])
        view.destroy()
        const v2 = make('x')
        contextMenuCM7({ items: [
            { id: 's0', separator: true },
            { id: 'off', label: 'Off', enabled: false },
            { id: 's1', separator: true },
            { id: 'a', label: 'A' },
            { id: 's2', separator: true },
            { id: 's3', separator: true },
            { id: 'p', label: 'P', submenu: [{ id: 'q', label: 'Q', enabled: false }] },
            { id: 'b', label: 'B' },
            { id: 's4', separator: true },
        ] })(v2)
        v2.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
        const m2 = document.querySelector('body > .cm-context-menu') as HTMLElement
        expect([...m2.querySelectorAll(':scope > *')].map(el => el.classList.contains('cm-context-sep') ? '-' : el.textContent))
            .toEqual(['A', '-', 'B'])
        v2.destroy()
    })

    it('子菜单:→ 进入、← 退出、Escape 先关子菜单', () => {
        const log: string[] = []
        const view = make('x')
        contextMenuCM7({
            items: [
                { id: 'p', label: 'Peek', submenu: [{ id: 's1', label: 'Sub One', run: () => { log.push('s1'); return true } }] },
            ],
        })(view)
        view.contentDOM.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
        const menu = document.querySelector('body > .cm-context-menu') as HTMLElement
        const sub = menu.querySelector('.cm-context-submenu') as HTMLElement
        key(window, 'ArrowDown')
        key(window, 'ArrowRight')
        expect(sub.classList.contains('visible')).toBe(true)
        expect(sub.querySelector('.cm-context-item.focused')?.textContent).toBe('Sub One')
        key(window, 'Escape')
        expect(sub.classList.contains('visible')).toBe(false)
        expect(contextMenuIsOpen()).toBe(true)
        key(window, 'ArrowRight')
        key(window, 'Enter')
        expect(log).toEqual(['s1'])
        expect(contextMenuIsOpen()).toBe(false)
        view.destroy()
    })
})

describe('F7 第 2 轮:Go to Line / 命令面板对齐 Monaco', () => {
    const focusedLabel = (view: EditorView) => view.dom.querySelector('.cm-quick-input-row.focused .cm-quick-input-label')?.textContent

    it(':40:999 列号截到行尾,:40:0 落行首;标签带 clamp 后的列', () => {
        const view = make(lines(60))
        openGotoLine(view)
        const input = qiInput(view)
        typeInto(input, ':40:999')
        expect(labels(view)).toEqual([`Press 'Enter' to go to line 40 at column ${view.state.doc.line(40).length + 1}.`])
        key(input, 'Enter')
        expect(view.state.selection.main.head).toBe(view.state.doc.line(40).to)
        openGotoLine(view)
        typeInto(qiInput(view), ':40:0')
        key(qiInput(view), 'Enter')
        expect(view.state.selection.main.head).toBe(view.state.doc.line(40).from)
        view.destroy()
    })

    it('预览中光标变了:取消复原的是变化后的滚动位置(Monaco 每次光标变化重存 view state)', () => {
        const view = make(lines(60))
        openGotoLine(view)
        const input = qiInput(view)
        view.scrollDOM.scrollTop = 0
        typeInto(input, ':40')
        view.scrollDOM.scrollTop = 333
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(view.state.doc.line(30).from) }))
        key(input, 'Escape')
        expect(view.scrollDOM.scrollTop).toBe(333)
        view.destroy()
    })

    it('预览行进 rangeHighlightField(概览尺 Full 条),关掉就清', async () => {
        const { rangeHighlightField } = await import('../../src/core/feature/gotoline')
        const { collectOverviewDecos } = await import('../../src/core/chrome/overviewpaint')
        const view = new EditorView({ state: EditorState.create({ doc: lines(60), extensions: [rangeHighlightField] }), parent: document.body })
        openGotoLine(view)
        typeInto(qiInput(view), ':40')
        expect(view.state.field(rangeHighlightField)).toBe(view.state.doc.line(40).from)
        const colors = { cursor: '', findMatch: '', wordHighlight: '', wordHighlightStrong: '', wordHighlightText: '', selectionHighlight: '', bracketMatch: '', rangeHighlight: 'rgba(0,122,204,0.6)', error: '', warning: '', info: '' }
        expect(collectOverviewDecos(view.state, colors, { selectionHighlight: false, bracketMatch: false })
            .filter(d => d.color === colors.rangeHighlight).map(d => d.lane)).toEqual([7])
        key(qiInput(view), 'Escape')
        expect(view.state.field(rangeHighlightField)).toBeNull()
        view.destroy()
    })

    it('命令面板里 ⌃G:前缀换成 ":",过滤词带过去并选中(Monaco quickAccess.show)', () => {
        const view = make(lines(3))
        openCommandPalette(view)
        const input = qiInput(view)
        typeInto(input, '>fold')
        const e = key(input, 'g', { code: 'KeyG', ctrlKey: true })
        expect(e.defaultPrevented).toBe(true)
        expect(input.value).toBe(':fold')
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 5])
        view.destroy()
    })

    it('最近用过的排前面并带 recently used / other commands 分组;按 id 全等也能搜到', async () => {
        const view = make('a')
        const cmds = [
            { id: 'mru.a', label: 'Alpha', run: () => {} },
            { id: 'mru.b', label: 'Beta', run: () => {} },
            { id: 'mru.c', label: 'Gamma', run: () => {} },
        ]
        openCommandPalette(view, cmds)
        typeInto(qiInput(view), '>gam')
        key(qiInput(view), 'Enter')
        await Promise.resolve()
        openCommandPalette(view, cmds)
        expect(labels(view)).toEqual(['Gamma', 'Alpha', 'Beta'])
        expect([...view.dom.querySelectorAll('.cm-quick-input-row')].map(r => r.querySelector('.cm-quick-input-separator')?.textContent ?? ''))
            .toEqual(['recently used', 'other commands', ''])
        expect(view.dom.querySelectorAll('.cm-quick-input-separator-border').length).toBe(1)
        typeInto(qiInput(view), '>mru.b')
        expect(labels(view)).toEqual(['Beta'])
        key(qiInput(view), 'Escape')
        view.destroy()
    })

    it('没命中的按 tf-idf 进 similar commands(过滤词 ≥ 3)', () => {
        const view = make('a')
        openCommandPalette(view, [
            { id: 'tf-s1', label: 'Sort Lines Ascending', run: () => {} },
            { id: 'tf-s2', label: 'Sort Lines Descending', run: () => {} },
            { id: 'tf-j', label: 'Join Lines', run: () => {} },
            { id: 'tf-x', label: 'Toggle Line Comment', run: () => {} },
        ])
        typeInto(qiInput(view), '>lines sort')
        expect(labels(view)).toEqual(['Sort Lines Ascending', 'Sort Lines Descending'])
        expect(view.dom.querySelector('.cm-quick-input-separator')?.textContent).toBe('similar commands')
        typeInto(qiInput(view), '>li')
        expect(view.dom.querySelector('.cm-quick-input-separator')).toBeNull()
        view.destroy()
    })

    it('跳分组循环:recently used → other commands → 回到首行;往前同样循环', async () => {
        const view = make('a')
        const cmds = ['P', 'Q', 'R', 'S'].map(l => ({ id: `sep.${l}`, label: l, run: () => {} }))
        for (const l of ['R', 'P']) {
            openCommandPalette(view, cmds)
            typeInto(qiInput(view), `>${l}`)
            key(qiInput(view), 'Enter')
            await Promise.resolve()
        }
        openCommandPalette(view, cmds)
        expect(labels(view)).toEqual(['P', 'R', 'Q', 'S'])
        const sep = keyOS === 'mac' ? { metaKey: true } : { altKey: true }
        const seq: string[] = []
        for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
            key(qiInput(view), k, sep)
            seq.push(view.dom.querySelector('.cm-quick-input-row.focused .cm-quick-input-label')!.textContent!)
        }
        expect(seq).toEqual(['Q', 'P', 'Q', 'P'])
        view.destroy()
    })

    it('tf-idf 语料带 Monaco 的 description(lines sort 带出 Reindent Lines);帮助列表 ? 不命中', () => {
        const view = make('a')
        openCommandPalette(view)
        typeInto(qiInput(view), '>lines sort')
        expect(labels(view)).toEqual(['Sort Lines Ascending', 'Sort Lines Descending', 'Reindent Lines', 'Reindent Selected Lines'])
        typeInto(qiInput(view), '?')
        expect(labels(view)).toEqual([])
        view.destroy()
    })

    it('⌃End / ⌃Home 首尾;跳分组没有分组时落到末行', () => {
        const view = make('a')
        openCommandPalette(view, ['A', 'B', 'C', 'D'].map(l => ({ id: l, label: l, run: () => {} })))
        const input = qiInput(view)
        const mac = keyOS === 'mac'
        key(input, 'End', { ctrlKey: true })
        expect(focusedLabel(view)).toBe('D')
        key(input, 'Home', { ctrlKey: true })
        expect(focusedLabel(view)).toBe('A')
        key(input, 'ArrowDown', mac ? { metaKey: true } : { altKey: true })
        expect(focusedLabel(view)).toBe('D')
        // 末行再跳:循环回第一行
        key(input, 'ArrowDown', mac ? { metaKey: true } : { altKey: true })
        expect(focusedLabel(view)).toBe('A')
        view.destroy()
    })
})
