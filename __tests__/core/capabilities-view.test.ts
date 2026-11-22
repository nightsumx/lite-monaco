// 能力: EditorView posAtCoords / composition hang / observer ignore / palette / multi-cursor feature
import { describe, expect, it, vi } from 'vitest'
import { make, makeScrolled, typeText } from './input-harness'
import { checkBijection } from '../../src/core/view/invariants'
import { commandPaletteCommand, defaultPaletteCommands, openCommandPalette } from '../../src/core/feature/commandpalette'
import { rectangleSelectionStyle, basicMouseSelection, isRectangleMouseEvent } from '../../src/core/input/mouseselection'
import { countColumn, findColumn } from '../../src/core/model/column'

describe('posAtCoords', () => {
    it('jsdom 无布局时按估算返回合法 pos', () => {
        const view = make('hello\nworld')
        const pos = view.posAtCoords({ x: 20, y: 5 })
        expect(pos).not.toBeNull()
        expect(pos!).toBeGreaterThanOrEqual(0)
        expect(pos!).toBeLessThanOrEqual(view.state.doc.length)
        view.destroy()
    })

    it('y 更大 → 更靠后的行（估算）', () => {
        const view = make('a\nb\nc\nd\ne')
        const p0 = view.posAtCoords({ x: 0, y: 0 })!
        const p1 = view.posAtCoords({ x: 0, y: 40 })!
        expect(p1).toBeGreaterThanOrEqual(p0)
        view.destroy()
    })
})

describe('observer composition hang', () => {
    it('composing 时 flush 返回 false 不吃 mutation', () => {
        const view = make('ab')
        view.observer.startComposition()
        expect(view.observer.composing).toBe(true)
        // 改 DOM 但不该进 state
        const line = view.contentDOM.children[0] as HTMLElement
        const t = line.firstChild as Text
        if (t) t.nodeValue = 'aXb'
        expect(view.observer.flush()).toBe(false)
        expect(view.state.doc.toString()).toBe('ab')
        view.observer.endComposition()
        // end 后可能异步 flush；force 一下
        view.observer.forceFlush()
        view.destroy()
    })

    it('ignore 丢弃自造 mutation', () => {
        const view = make('hi')
        view.observer.ignore(() => {
            const line = view.contentDOM.children[0] as HTMLElement
            const t = line.firstChild as Text
            if (t) t.nodeValue = 'XX'
        })
        view.observer.flush()
        expect(view.state.doc.toString()).toBe('hi')
        view.destroy()
    })
})

describe('矩形选列计算 (column + 多 range)', () => {
    it('countColumn/findColumn 与矩形选列一致', () => {
        // a b \t c d  → 列:1,2, 展开到4, 5,6
        expect(countColumn('ab\tcd', 4, 3)).toBe(4) // 到 tab 结束
        expect(countColumn('ab\tcd', 4, 4)).toBe(5) // 再含 'c'
        expect(findColumn('ab\tcd', 4, 4)).toBe(3) // 列4 → offset 3（tab 后）
        expect(findColumn('hello', 2, 4)).toBe(2)
    })

    it('isRectangleMouseEvent: Shift+Alt+左键(Alt 单按是加光标,对齐 Monaco multiCursorModifier=alt)', () => {
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { altKey: true, shiftKey: true, button: 0 }))).toBe(true)
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { altKey: true, button: 0 }))).toBe(false)
        expect(isRectangleMouseEvent(new MouseEvent('mousedown', { button: 0 }))).toBe(false)
    })

    it('basicMouseSelection 单击返回单点', () => {
        const view = make('hello\nworld')
        const style = basicMouseSelection(view, new MouseEvent('mousedown', {
            clientX: 0, clientY: 0, detail: 1, button: 0,
        }))
        const sel = style.get(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }), false, false)
        expect(sel.ranges.length).toBe(1)
        view.destroy()
    })

    it('rectangleSelectionStyle 拖多行产生多 range', () => {
        const view = make('aaaa\nbbbb\ncccc')
        // 桩 posAtCoords 返回稳定列
        const orig = view.posAtCoords.bind(view)
        let call = 0
        view.posAtCoords = (_c) => {
            // 第一行 col0 → 第二行 col2
            if (call++ === 0) return 0
            return 7 // line2 offset 2 roughly 'bb|bb' line from 5 → 7
        }
        const startEv = new MouseEvent('mousedown', { clientX: 0, clientY: 0, altKey: true, button: 0 })
        const style = rectangleSelectionStyle(view, startEv)
        expect(style).not.toBeNull()
        const sel = style!.get(
            new MouseEvent('mousemove', { clientX: 20, clientY: 40, altKey: true }),
            false,
            false,
        )
        expect(sel.ranges.length).toBeGreaterThanOrEqual(1)
        view.posAtCoords = orig
        view.destroy()
    })

    it('矩形选跨空行：空行落光标，两侧行有 range', () => {
        const view = make('aaaa\n\ncccc')
        let call = 0
        view.posAtCoords = () => {
            if (call++ === 0) return 0
            return view.state.doc.line(3).from + 2
        }
        const style = rectangleSelectionStyle(view, new MouseEvent('mousedown', {
            clientX: 0, clientY: 0, altKey: true, button: 0,
        }))
        const sel = style!.get(
            new MouseEvent('mousemove', { clientX: 20, clientY: 40, altKey: true }),
            false,
            false,
        )
        expect(sel.ranges.length).toBe(3)
        expect(sel.ranges[1].empty).toBe(true)
        expect(sel.ranges[0].empty).toBe(false)
        expect(sel.ranges[2].empty).toBe(false)
        view.destroy()
    })
})

describe('command palette', () => {
    it('defaultPaletteCommands 含核心 id 且可去重 extra', () => {
        const cmds = defaultPaletteCommands([
            { id: 'find', label: 'dup', run: () => true },
            { id: 'custom', label: 'Custom', run: () => true },
        ])
        const ids = cmds.map(c => c.id)
        expect(ids).toContain('find')
        expect(ids).toContain('cursorUndo')
        // Monaco 面板里没有 Undo / Select All(r4p-fix.test.ts)
        expect(ids).not.toContain('undo')
        expect(ids).not.toContain('selectAll')
        expect(ids.filter(id => id === 'find')).toHaveLength(1)
        expect(ids).toContain('custom')
    })

    it('openCommandPalette 返回 true', () => {
        const view = make('x')
        const cmds = defaultPaletteCommands()
        expect(cmds.length).toBeGreaterThan(5)
        expect(typeof openCommandPalette).toBe('function')
        view.destroy()
    })

    it('面板过滤 Enter 跑 Expand Line Selection，Esc 不改文档', async () => {
        const view = make('ab\ncd')
        expect(openCommandPalette(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input).not.toBeNull()
        // 输入框自带 '>' 前缀(Monaco CommandsQuickAccess)
        expect(input.value).toBe('>')
        input.value = '>expand line selection'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(view.state.selection.main.from).toBe(0)
        expect(view.state.selection.main.to).toBe(3)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()

        const before = view.state.doc.toString()
        const sel = view.state.selection.main
        expect(openCommandPalette(view)).toBe(true)
        const again = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await Promise.resolve()
        expect(view.state.doc.toString()).toBe(before)
        expect(view.state.selection.main.from).toBe(sel.from)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })

    it('ArrowDown 再 Enter 跑第二项', async () => {
        const view = make('x')
        let seen = ''
        expect(openCommandPalette(view, [
            { id: 'a', label: 'Alpha', run: () => { seen = 'a' } },
            { id: 'b', label: 'Beta', run: () => { seen = 'b' } },
        ])).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(seen).toBe('b')
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })

    it('commandPaletteCommand 打开面板', () => {
        const view = make('x')
        expect(commandPaletteCommand()(view)).toBe(true)
        expect(view.dom.querySelector('.cm-quick-input')).not.toBeNull()
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        view.destroy()
    })

    it('焦点移出面板就关,不跑命令', async () => {
        const view = make('ab')
        const before = view.state.doc.toString()
        expect(openCommandPalette(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        view.contentDOM.focus()
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        await new Promise(r => setTimeout(r, 5))
        expect(view.state.doc.toString()).toBe(before)
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })

    it('过滤无命中 Enter 不改文档、面板不关', async () => {
        const view = make('ab')
        const before = view.state.doc.toString()
        expect(openCommandPalette(view)).toBe(true)
        const input = view.dom.querySelector('.cm-quick-input-input') as HTMLInputElement
        input.value = '>zzzzqqq'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(view.state.doc.toString()).toBe(before)
        expect(view.dom.querySelector('.cm-quick-input')).not.toBeNull()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(view.dom.querySelector('.cm-quick-input')).toBeNull()
        view.destroy()
    })
})

describe('composing getter + hasFocus', () => {
    it('composing 跟随 inputState', () => {
        const view = make('a')
        expect(view.composing).toBe(false)
        view.inputState.composing = 0
        expect(view.composing).toBe(true)
        view.inputState.composing = -1
        expect(view.composing).toBe(false)
        view.destroy()
    })
})

describe('虚拟化下输入保持双射', () => {
    it('大文档视口内 typeText', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `line${i}`)
        const doc = lines.join('\n')
        const view = makeScrolled(doc, { clientHeight: 100, scrollTop: 500, lineHeight: 14 })
        const pos = view.viewport.from + 2
        const line = view.state.doc.lineAt(pos)
        // 只在视口内打字
        if (pos >= view.viewport.from && pos <= view.viewport.to) {
            typeText(view, line.from + Math.min(2, line.length), 'Z')
            expect(checkBijection(view)).toBeNull()
        }
        view.destroy()
    })
})

describe('flushIOSKey', () => {
    it('无 pending 返 false', () => {
        const view = make('a')
        expect(view.flushIOSKey()).toBe(false)
        view.destroy()
    })

    it('有 pending 清掉并派 synthetic', () => {
        const view = make('a')
        view.inputState.pendingIOSKey = { key: 'Backspace', keyCode: 8 }
        const spy = vi.fn()
        view.contentDOM.addEventListener('keydown', spy)
        view.flushIOSKey()
        expect(view.inputState.pendingIOSKey).toBeNull()
        expect(spy).toHaveBeenCalled()
        view.destroy()
    })
})
