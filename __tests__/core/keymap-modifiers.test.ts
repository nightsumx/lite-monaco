// 组合键漏网修复 —— Shift/Cmd/Ctrl + 其他字符/回车/退格曾落到浏览器原生 contenteditable,
// 原生 mutate DOM(Shift+Enter 插 <br>、Shift+Backspace 绕过模型)破坏 DOM≡doc 双射,产生大量 bug。
//
// 修复两处:
//   1. keymap 显式绑定 Shift-Enter / Shift-Backspace / Shift-Delete → 复用无 Shift 的命令(Shift 不改语义)。
//   2. keymap 未命中 && 事件带 Cmd/Ctrl(命令修饰键)→ 一律 preventDefault,绝不让原生 mutate DOM(兜底)。
//
// 这里钉 keymap 分发契约 + 兜底判定纯逻辑;真 keydown 副作用走 5199 aihand。

import { describe, expect, it } from 'vitest'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import type { Transaction } from '../../src/core/model/state'
import { defaultKeymap, keymapHandler, shouldBlockNative } from '../../src/core/edit/keymap'

function harness(doc = '', sel?: EditorSelection) {
    let state = EditorState.create({ doc, selection: sel })
    const target = {
        get state() { return state },
        dispatch: (tr: Transaction) => { state = tr.apply() },
    }
    return { target, doc: () => state.doc.toString(), sel: () => state.selection.main }
}

function key(k: string, mod: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {}) {
    return {
        key: k,
        ctrlKey: !!mod.ctrlKey, altKey: !!mod.altKey, metaKey: !!mod.metaKey, shiftKey: !!mod.shiftKey,
        preventDefault() {},
    } as unknown as KeyboardEvent
}

describe('组合键漏网:Shift + 回车/删除', () => {
    const run = keymapHandler(defaultKeymap)

    it('Shift+Enter → 与 Enter 同:切段落插换行(不 <br>)', () => {
        const h = harness('abc', EditorSelection.single(2))
        expect(run(key('Enter', { shiftKey: true }), h.target)).toBe(true)
        expect(h.doc()).toBe('ab\nc')
    })

    it('Shift+Backspace → 与 Backspace 同:删前一字符', () => {
        const h = harness('abc', EditorSelection.single(2))
        expect(run(key('Backspace', { shiftKey: true }), h.target)).toBe(true)
        expect(h.doc()).toBe('ac')
    })

    // 第七轮:Win/Linux 上 Shift+Delete 是剪切(Blink editing_behavior Shift+Delete = Cut,Monaco 交给原生);
    // jsdom 的 platform 是 '' → Linux。有选区时和删除一样去掉选中的字。
    it('Shift+Delete(Win/Linux)→ 剪切:有选区删选中的字', () => {
        const h = harness('abc', EditorSelection.single(1, 2))
        expect(run(key('Delete', { shiftKey: true }), h.target)).toBe(true)
        expect(h.doc()).toBe('ac')
    })

    it('IME 组字中按键(isComposing / keyCode 229)绝不触发编辑命令', () => {
        // 中文拼音输入时按 Backspace 删拼音码、Enter/Space 选字、方向键翻候选 —— 都属于输入法,
        // 若跑成 deleteCharBackward/insertNewline 就是用户报的「打输入法时按键也触发退格,混乱」。
        const composing = (k: string) => Object.assign(key(k), { isComposing: true }) as KeyboardEvent
        for (const k of ['Backspace', 'Enter', ' ', 'ArrowLeft', 'ArrowRight']) {
            const h = harness('abc', EditorSelection.single(2))
            expect(run(composing(k), h.target)).toBe(false)
            expect(h.doc()).toBe('abc') // 文档不动
            expect(h.sel().head).toBe(2) // 光标不动
        }
        // 有些输入法不带 isComposing 只给 keyCode 229(Process 键)
        const h = harness('abc', EditorSelection.single(2))
        expect(run(Object.assign(key('Backspace'), { keyCode: 229 }) as KeyboardEvent, h.target)).toBe(false)
        expect(h.doc()).toBe('abc')
    })

    it('Shift 消歧未被打破:Mod+z 与 Mod+Shift+z 是不同绑定,各命中各的命令', () => {
        // 用可分辨的自定义绑定对验证:shift 状态精确路由,Mod+Shift+z 绝不误落 Mod+z。
        let plain = 0, shifted = 0
        const r = keymapHandler([
            { key: 'Ctrl-z', run: () => { plain++; return true } },
            { key: 'Ctrl-Shift-z', run: () => { shifted++; return true } },
        ])
        r(key('z', { ctrlKey: true }), harness().target)
        r(key('z', { ctrlKey: true, shiftKey: true }), harness().target)
        expect(plain).toBe(1)
        expect(shifted).toBe(1) // 没被 Mod-z 抢走
    })
})

describe('兜底:未命中的命令修饰键组合必须 block 原生', () => {
    it('Cmd/Ctrl + 未绑定字符(如 b/i/u)→ block(否则原生加粗污染 DOM)', () => {
        expect(shouldBlockNative(key('b', { metaKey: true }))).toBe(true)
        expect(shouldBlockNative(key('i', { ctrlKey: true }))).toBe(true)
        expect(shouldBlockNative(key('u', { metaKey: true }))).toBe(true)
    })

    it('纯字符 / Shift+字符 / 普通打字 → 不 block(要让原生落字)', () => {
        expect(shouldBlockNative(key('a'))).toBe(false)
        expect(shouldBlockNative(key('A', { shiftKey: true }))).toBe(false)
        expect(shouldBlockNative(key('1'))).toBe(false)
    })

    it('IME 组合中(keyCode 229 / isComposing)→ 不 block', () => {
        const e = key('Process')
        Object.assign(e, { isComposing: true })
        expect(shouldBlockNative(e)).toBe(false)
    })

    it('Alt 单独(可能是死键/组字)→ 不 block', () => {
        expect(shouldBlockNative(key('e', { altKey: true }))).toBe(false)
    })

    it('Cmd/Ctrl + c/x/v → 不 block(否则 copy/cut/paste 事件发不出,复制粘贴失效)', () => {
        expect(shouldBlockNative(key('c', { metaKey: true }))).toBe(false)
        expect(shouldBlockNative(key('c', { ctrlKey: true }))).toBe(false)
        expect(shouldBlockNative(key('x', { metaKey: true }))).toBe(false)
        expect(shouldBlockNative(key('v', { ctrlKey: true }))).toBe(false)
        expect(shouldBlockNative(key('C', { metaKey: true }))).toBe(false)
    })

    it('Cmd+Shift+c 仍 block(非系统剪贴板)', () => {
        expect(shouldBlockNative(key('c', { metaKey: true, shiftKey: true }))).toBe(true)
    })
})
