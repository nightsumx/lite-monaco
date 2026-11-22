// 键位对齐 Monaco 0.52 macOS 默认:物理键兜底(bug 17)、认领键必拦原生(bug 5)、Mac 专有键位(bug 9/16/20)、和弦。
// 「Monaco 实测」各条的期望值来自 /tmp/lc-hunt 对照页(f5/p-find.ts、a-edit/t14-optkeys.ts)。
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../src/core/model/state'
import { mount, setMacPlatform } from './f5-replay'

// 平台要在 keymap 模块加载前定好(defaultKeymap 在加载时按 navigator.platform 生成),所以全用动态 import
setMacPlatform()
const { buildDefaultKeymap, keymapHandler } = await import('../../src/core/edit/keymap')
const { EditorSelection } = await import('../../src/core/model/selection')
const { EditorState } = await import('../../src/core/model/state')
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const mods = { lm, core }

function run(doc: string, keys: string[]): string {
    const r = mount(mods, { doc })
    try {
        for (const k of keys) {
            if (k.length === 1) r.type(k)
            else r.press(k)
        }
        return r.result()
    } finally { r.destroy() }
}

describe('Monaco 实测:Mac 键位', () => {
    const CASES: { name: string, doc: string, keys: string[], monaco: string }[] = [
        { name: '⌃G 打开跳行,Esc 关掉,文档不动', doc: 'a‸\nb\n', keys: ['Control+g', 'Escape'], monaco: 'a‸\nb\n' },
        { name: '⌘K ⌘D:最后一个选区挪到下一处', doc: '⟨foo⟩ x foo y foo\n', keys: ['Meta+d', 'Meta+k', 'Meta+d'], monaco: '⟨foo⟩ x foo y ⟨foo⟩\n' },
        { name: '⌘K 后按未绑定键:吞掉,不落字', doc: 'a‸b\n', keys: ['Meta+k', 'x'], monaco: 'a‸b\n' },
        { name: '⌘U 光标撤销', doc: 'a‸bc\n', keys: ['ArrowRight', 'ArrowRight', 'Meta+u'], monaco: 'ab‸c\n' },
        { name: '⌃⌥← 子词', doc: 'fooBarBaz‸\n', keys: ['Control+Alt+ArrowLeft'], monaco: 'fooBar‸Baz\n' },
        { name: '⌃⌥→ 子词(下划线)', doc: '‸foo_bar_baz\n', keys: ['Control+Alt+ArrowRight', 'Control+Alt+ArrowRight'], monaco: 'foo_bar‸_baz\n' },
        { name: '⇧⌥→ 按词扩选(不是智能扩选)', doc: '‸foo.bar baz\n', keys: ['Shift+Alt+ArrowRight', 'Shift+Alt+ArrowRight'], monaco: '⟨foo.bar⟩ baz\n' },
        // ⌃⇧⌘→ 智能扩选走 TS 语言服务,jsdom 里起不来,只在浏览器里验(f5/p-find.ts:foo(b‸ar, baz) → foo(⟨bar⟩, baz))
        { name: '⌃J 合并行', doc: 'a‸\n  b\n', keys: ['Control+j'], monaco: 'a‸ b\n' },
        { name: '⌃N ⌃P 上下行', doc: 'ab‸c\nde\n', keys: ['Control+n', 'Control+p'], monaco: 'ab‸c\nde\n' },
    ]
    for (const c of CASES) it(c.name, () => expect(run(c.doc, c.keys)).toBe(c.monaco))
})

describe('Monaco 实测:Mac ⌥ 组字后的 event.key 按物理键匹配(bug 17)', () => {
    // [名字, 起始, keydown 载荷(Chrome on Mac 实际发的), Monaco 结果]
    const CASES: [string, string, { key: string, code: string, keyCode: number, altKey?: boolean, shiftKey?: boolean, metaKey?: boolean }, string][] = [
        ['⌥⇧A(key=Å)块注释', 'a ⟨foo⟩ b\n', { key: 'Å', code: 'KeyA', keyCode: 65, altKey: true, shiftKey: true }, 'a /* ⟨foo⟩ */ b\n'],
        ['⌥⇧I(key=ˆ)每行行尾加光标', '⟨ab\ncd\nef⟩\n', { key: 'ˆ', code: 'KeyI', keyCode: 73, altKey: true, shiftKey: true }, 'ab‸\ncd‸\nef‸\n'],
        ['⌘⇧\\(key=|)跳到匹配括号', 'foo‸(a, b)\n', { key: '|', code: 'Backslash', keyCode: 220, metaKey: true, shiftKey: true }, 'foo(a, b‸)\n'],
    ]
    for (const [name, doc, init, monaco] of CASES) {
        it(name, () => {
            const r = mount(mods, { doc })
            try {
                const e = r.pressRaw(init)
                expect(e.defaultPrevented).toBe(true)
                expect(r.result()).toBe(monaco)
            } finally { r.destroy() }
        })
    }

    it('没有 code 时退回 keyCode', () => {
        const r = mount(mods, { doc: 'foo‸(a, b)\n' })
        try {
            r.pressRaw({ key: '|', keyCode: 220, metaKey: true, shiftKey: true })
            expect(r.result()).toBe('foo(a, b‸)\n')
        } finally { r.destroy() }
    })

    it('不带 ⌥⌘⌃ 时不按物理键配(⇧\\ 打出 | 是普通输入)', () => {
        const r = mount(mods, { doc: 'a‸\n' })
        try {
            const e = r.pressRaw({ key: '|', code: 'Backslash', keyCode: 220, shiftKey: true })
            expect(e.defaultPrevented).toBe(false)
        } finally { r.destroy() }
    })
})

describe('认领的移动/删除键,命令没动也拦原生(bug 5)', () => {
    // 原生 contenteditable 会在这些边界上自己动 DOM 选区(⇧End 扩到下一行、⌥↑ 移原生光标),破坏 DOM≡doc
    const CASES: [string, string][] = [
        ['Shift+End', 'a\nbc‸\nd\n'],
        ['Shift+Home', 'a\n‸cd\n'],
        ['Alt+ArrowUp', 'ab‸c\nd\n'],
        ['Alt+ArrowDown', 'a\nb‸c'],
        ['Shift+PageDown', 'a\nb‸'],
        ['Shift+Meta+ArrowUp', '‸ab\nc\n'],
        ['Meta+Backspace', '‸ab\n'],
        ['Alt+Delete', 'ab‸'],
    ]
    for (const [k, doc] of CASES) {
        it(`${k} @ ${JSON.stringify(doc)}`, () => {
            const r = mount(mods, { doc })
            try {
                const before = r.result()
                const e = r.press(k)
                expect(e.defaultPrevented).toBe(true)
                expect(r.result()).toBe(before)
            } finally { r.destroy() }
        })
    }
})

describe('keymapHandler:和弦与平台', () => {
    function target(doc: string, sel: InstanceType<typeof EditorSelection>) {
        let state = EditorState.create({ doc, selection: sel, extensions: [EditorState.allowMultipleSelections.of(true)] })
        return { get state() { return state }, dispatch: (tr: Transaction) => { state = tr.apply() } }
    }
    const ev = (key: string, mods: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { key, cancelable: true, ...mods })

    it('和弦首键吞掉并等第二键,修饰键单按不打断', () => {
        const t = target('foo x foo', EditorSelection.single(0, 3))
        const run = keymapHandler(buildDefaultKeymap(true), { mac: true })
        expect(run(ev('k', { metaKey: true }), t)).toBe(true)
        expect(run(ev('Meta', { metaKey: true }), t)).toBe(false)
        expect(run(ev('d', { metaKey: true }), t)).toBe(true)
        expect(t.state.selection.main.from).toBe(6)
    })

    it('Mac:⌘⌫ 删到行首,⌘Delete 删到行尾;非 Mac 的 Ctrl+⌫ 删词', () => {
        const mac = keymapHandler(buildDefaultKeymap(true), { mac: true })
        const a = target('    foo bar baz', EditorSelection.single(11))
        mac(ev('Backspace', { metaKey: true }), a)
        expect(a.state.doc.toString()).toBe(' baz')
        const b = target('foo bar\nnext', EditorSelection.single(4))
        mac(ev('Delete', { metaKey: true }), b)
        expect(b.state.doc.toString()).toBe('foo \nnext')
        const win = keymapHandler(buildDefaultKeymap(false), { mac: false })
        const c = target('foo bar', EditorSelection.single(7))
        win(ev('Backspace', { ctrlKey: true }), c)
        expect(c.state.doc.toString()).toBe('foo ')
    })

    it('Mac 没有 ⌘Y 重做(Monaco Mac 只有 ⇧⌘Z)', () => {
        expect(buildDefaultKeymap(true).some(b => b.key === 'Mod-y')).toBe(false)
        expect(buildDefaultKeymap(false).some(b => b.key === 'Mod-y')).toBe(true)
    })
})
