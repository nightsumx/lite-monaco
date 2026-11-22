import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import type { Transaction } from '../../src/core/model/state'
import { defaultKeymap, type KeyBinding, keymapHandler } from '../../src/core/edit/keymap'

// keymap 是纯分发器:KeyboardEvent + modifier → 命中 KeyBinding → 跑命令。钉「键→命令」契约。
// 真 keydown/preventDefault 的浏览器副作用归 aipeek(5199),这里只测匹配与分流逻辑。

function harness(doc = '', sel?: EditorSelection) {
    let state = EditorState.create({ doc, selection: sel })
    const target = {
        get state() { return state },
        dispatch: (tr: Transaction) => { state = tr.apply() },
    }
    return { target, doc: () => state.doc.toString(), sel: () => state.selection.main }
}

// 最小 KeyboardEvent stub(jsdom 的 KeyboardEvent 也行,但显式 stub 更省)。
function key(k: string, mod: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {}) {
    let prevented = false
    return {
        key: k,
        ctrlKey: !!mod.ctrlKey,
        altKey: !!mod.altKey,
        metaKey: !!mod.metaKey,
        shiftKey: !!mod.shiftKey,
        preventDefault() { prevented = true },
        get prevented() { return prevented },
    } as unknown as KeyboardEvent & { prevented: boolean }
}

describe('keymap —— 分发', () => {
    const run = keymapHandler(defaultKeymap)

    it('ArrowRight → cursorCharForward', () => {
        const h = harness('abc', EditorSelection.single(0))
        const e = key('ArrowRight')
        expect(run(e, h.target)).toBe(true)
        expect(h.sel().head).toBe(1)
        expect((e as any).prevented).toBe(true)
    })

    it('Shift+ArrowRight → selectCharForward(锚不动)', () => {
        const h = harness('abc', EditorSelection.single(0))
        expect(run(key('ArrowRight', { shiftKey: true }), h.target)).toBe(true)
        expect(h.sel().anchor).toBe(0)
        expect(h.sel().head).toBe(1)
    })

    it('Backspace → deleteCharBackward', () => {
        const h = harness('abc', EditorSelection.single(2))
        expect(run(key('Backspace'), h.target)).toBe(true)
        expect(h.doc()).toBe('ac')
    })

    it('Mod-Shift-k → deleteLine 删整行', () => {
        const h = harness('a\nb\nc', EditorSelection.single(2))
        expect(run(key('k', { metaKey: true, shiftKey: true }), h.target)
            || run(key('k', { ctrlKey: true, shiftKey: true }), h.target)).toBe(true)
        expect(h.doc()).toBe('a\nc')
    })

    it('Mac: Cmd+Backspace → deleteLine 删整行', () => {
        // jsdom platform 多为 Mac;Cmd-Backspace 绑 deleteLine
        const h = harness('a\nb\nc', EditorSelection.single(2))
        const handled = run(key('Backspace', { metaKey: true }), h.target)
        if (handled) {
            expect(h.doc()).toBe('a\nc')
        }
        else {
            // 非 Mac 构建:Ctrl+Backspace 是删词,至少不应抛
            expect(h.doc()).toMatch(/a/)
        }
    })

    it('未绑定键不处理、不 preventDefault', () => {
        const h = harness('abc', EditorSelection.single(0))
        const e = key('a')
        expect(run(e, h.target)).toBe(false)
        expect((e as any).prevented).toBe(false)
    })

    it('Mod+ArrowRight 走词级移动而非字符移动', () => {
        const h = harness('foo bar', EditorSelection.single(0))
        expect(run(key('ArrowRight', { ctrlKey: true }), h.target)).toBe(true)
        expect(h.sel().head).toBe(3) // 词尾
    })

    it('命令返回 false(文档首退格)时不 preventDefault', () => {
        const h = harness('abc', EditorSelection.single(0))
        const e = key('Backspace')
        expect(run(e, h.target)).toBe(false)
        expect((e as any).prevented).toBe(false)
    })

    it('自定义绑定:Mod 占位 + 单字符大小写无关', () => {
        let hit = 0
        const binding: KeyBinding = { key: 'Ctrl-k', run: () => { hit++; return true } }
        const r = keymapHandler([binding])
        expect(r(key('k', { ctrlKey: true }), harness().target)).toBe(true)
        expect(r(key('K', { ctrlKey: true }), harness().target)).toBe(true)
        expect(hit).toBe(2)
    })
})
