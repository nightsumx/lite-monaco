// 剪贴板/拖放真事件路径:paste/cut/copy/drop 必须 preventDefault + 走命令,
// 绝不让 contenteditable 原生塞 HTML 破 DOM≡doc。jsdom 无 ClipboardEvent 构造器,
// 用 Event + 挂 clipboardData/dataTransfer mock 驱动 handler。

import { describe, expect, it } from 'vitest'
import {
    copyCommand,
    cutCommand,
    cutOrCopy,
    dropText,
    handleCopy,
    handleCut,
    handleDrop,
    handleDragOver,
    handlePaste,
    pasteCommand,
    pasteText,
    writeClipboardText,
} from '../../src/core/input/clipboard'
import { EditorView } from '../../src/core/view/editorview'
import { expectDOMMatchesDoc, make } from './input-harness'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'

// mock clipboardData:jsdom 无 DataTransfer 构造。
function mockClip(text = ''): DataTransfer {
    const store = new Map<string, string>()
    if (text)
        store.set('text/plain', text)
    return {
        clearData: () => store.clear(),
        getData: (t: string) => store.get(t) ?? '',
        setData: (t: string, v: string) => { store.set(t, v) },
        // 其余 DataTransfer 字段测试不读
    } as unknown as DataTransfer
}

// paste/cut 走 state.selection,必须写 state(不是只写 DOM 的 setCaret)。
function caret(view: EditorView, pos: number) {
    view.dispatch(view.state.update({ selection: EditorSelection.cursor(pos) }))
}

function firePaste(view: EditorView, text: string): boolean {
    const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(e, 'clipboardData', { value: mockClip(text) })
    return handlePaste(view, e) && e.defaultPrevented
}

function fireCut(view: EditorView): { prevented: boolean, text: string } {
    const data = mockClip()
    const e = new Event('cut', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(e, 'clipboardData', { value: data })
    const ok = handleCut(view, e)
    return { prevented: ok && e.defaultPrevented, text: data.getData('text/plain') }
}

function fireCopy(view: EditorView): { prevented: boolean, text: string } {
    const data = mockClip()
    const e = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(e, 'clipboardData', { value: data })
    const ok = handleCopy(view, e)
    return { prevented: ok && e.defaultPrevented, text: data.getData('text/plain') }
}

function fireDrop(view: EditorView, text: string): boolean {
    const dt = mockClip(text)
    const e = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(e, 'dataTransfer', { value: dt })
    return handleDrop(view, e) && e.defaultPrevented
}

describe('paste 纯文本拦截', () => {
    it('粘贴单行替换选区,DOM≡doc', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        expect(firePaste(view, 'hi')).toBe(true)
        expect(view.state.doc.toString()).toBe('hi world')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('粘贴多行拆行,光标落粘贴末', () => {
        const view = make('ab')
        caret(view, 1)
        pasteText(view, 'X\nY')
        expect(view.state.doc.toString()).toBe('aX\nYb')
        expect(view.state.selection.main.head).toBe(4) // aX\nY|b
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('空串粘贴消费事件但不改 doc', () => {
        const view = make('x')
        caret(view, 1)
        expect(firePaste(view, '')).toBe(true)
        expect(view.state.doc.toString()).toBe('x')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('只有 html / 图、没有 text/plain：不把富文本写进 doc', () => {
        const view = make('x')
        caret(view, 1)
        const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
        Object.defineProperty(e, 'clipboardData', {
            value: {
                getData: (t: string) => t === 'text/html' ? '<img src="x">' : '',
                clearData: () => {},
                setData: () => {},
                files: [{ type: 'image/png', name: 'a.png' }],
            },
        })
        expect(handlePaste(view, e)).toBe(true)
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('x')
        expect(view.contentDOM.innerHTML).not.toContain('<img')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('粘贴忽略 text/html,只取 text/plain(防富文本破双射)', () => {
        const view = make('x')
        caret(view, 1)
        const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
        const store = new Map<string, string>([
            ['text/html', '<b>BOLD</b>'],
            ['text/plain', 'plain'],
        ])
        Object.defineProperty(e, 'clipboardData', {
            value: {
                getData: (t: string) => store.get(t) ?? '',
                clearData: () => {},
                setData: () => {},
            },
        })
        handlePaste(view, e)
        expect(view.state.doc.toString()).toBe('xplain')
        expect(view.contentDOM.innerHTML).not.toContain('<b>')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('readonly 消费事件但不改 doc', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'locked', extensions: [EditorState.readOnly.of(true)] }),
            parent: host,
        })
        const before = view.state.doc.toString()
        expect(firePaste(view, 'X')).toBe(true)
        expect(view.state.doc.toString()).toBe(before)
        view.destroy()
    })
})

describe('copy / cut', () => {
    it('有选区 copy 写 text/plain,doc 不动', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        const r = fireCopy(view)
        expect(r.prevented).toBe(true)
        expect(r.text).toBe('hello')
        expect(view.state.doc.toString()).toBe('hello world')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('空选区 copy 拷当前整行(对齐 Monaco)', () => {
        const view = make('line1\nline2\nline3')
        caret(view, 7) // line2 内
        const r = fireCopy(view)
        expect(r.prevented).toBe(true)
        // Monaco:空选区复制整行带换行
        expect(r.text).toBe('line2\n')
        view.destroy()
    })

    it('只读 cut 写剪贴板但不删', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'hello',
                selection: EditorSelection.range(0, 5),
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        const r = fireCut(view)
        expect(r.prevented).toBe(true)
        expect(r.text).toBe('hello')
        expect(view.state.doc.toString()).toBe('hello')
        view.destroy()
        host.remove()
    })

    it('cut 写剪贴板并删选区,DOM≡doc', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 6) })) // "hello "
        const r = fireCut(view)
        expect(r.prevented).toBe(true)
        expect(r.text).toBe('hello ')
        expect(view.state.doc.toString()).toBe('world')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('cut 空选区 → 删整行(含换行)', () => {
        const view = make('a\nb\nc')
        caret(view, 2) // b 行
        const r = fireCut(view)
        expect(r.text).toBe('b\n')
        expect(view.state.doc.toString()).toBe('a\nc')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('多选区 cut 删两段', () => {
        const view = make('abcdefgh')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.range(0, 2), // ab
                EditorSelection.range(4, 6), // ef
            ]),
        }))
        const data = mockClip()
        expect(cutOrCopy(view, data, true)).toBe(true)
        expect(data.getData('text/plain')).toBe('ab\nef')
        expect(view.state.doc.toString()).toBe('cdgh')
        expectDOMMatchesDoc(view)
        view.destroy()
    })
})

describe('drop 拦截', () => {
    it('drop 纯文本落到主选区,preventDefault,DOM≡doc', () => {
        const view = make('ab')
        caret(view, 1)
        expect(fireDrop(view, 'X\nY')).toBe(true)
        expect(view.state.doc.toString()).toBe('aX\nYb')
        expectDOMMatchesDoc(view)
        view.destroy()
    })

    it('dragover preventDefault 并标 copy', () => {
        const view = make('x')
        const e = new Event('dragover', { bubbles: true, cancelable: true }) as DragEvent
        const dt = { dropEffect: 'none' }
        Object.defineProperty(e, 'dataTransfer', { value: dt })
        expect(handleDragOver(view, e)).toBe(true)
        expect(e.defaultPrevented).toBe(true)
        expect(dt.dropEffect).toBe('copy')
        view.destroy()
    })

    it('drop 只有文件没有文本：拦原生且不改 doc', () => {
        const view = make('x')
        const e = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
        Object.defineProperty(e, 'dataTransfer', {
            value: {
                getData: () => '',
                files: [{ type: 'image/png', name: 'shot.png' }],
            },
        })
        expect(handleDrop(view, e)).toBe(true)
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('x')
        view.destroy()
    })

    it('drop 无 text 仍 preventDefault(防原生 HTML)', () => {
        const view = make('x')
        const e = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
        Object.defineProperty(e, 'dataTransfer', { value: mockClip('') })
        expect(handleDrop(view, e)).toBe(true)
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('x')
        view.destroy()
    })

    it('dropText 直接 API 与 paste 同构', () => {
        const view = make('z')
        caret(view, 0)
        dropText(view, 'go')
        expect(view.state.doc.toString()).toBe('goz')
        expectDOMMatchesDoc(view)
        view.destroy()
    })
})

describe('contentDOM 真挂载事件', () => {
    it('contentDOM 上 dispatch paste 事件走拦截(集成)', () => {
        const view = make('hi')
        caret(view, 2)
        const e = new Event('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(e, 'clipboardData', { value: mockClip('!') })
        view.contentDOM.dispatchEvent(e)
        expect(e.defaultPrevented).toBe(true)
        expect(view.state.doc.toString()).toBe('hi!')
        expectDOMMatchesDoc(view)
        view.destroy()
    })
})

describe('keymap 剪贴板命令(Cmd+C/X/V 热路径)', () => {
    it('copyCommand 消费键位且不改 doc', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 5) }))
        const writes: string[] = []
        const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (t: string) => Promise<void> } }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', {
            configurable: true,
            value: { writeText: (t: string) => { writes.push(t); return Promise.resolve() } },
        })
        try {
            expect(copyCommand(view)).toBe(true)
            expect(writes).toEqual(['hello'])
            expect(view.state.doc.toString()).toBe('hello world')
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
            view.destroy()
        }
    })

    it('cutCommand 写剪贴板并删选区', () => {
        const view = make('hello world')
        view.dispatch(view.state.update({ selection: EditorSelection.range(0, 6) }))
        const writes: string[] = []
        const nav = globalThis.navigator as Navigator & { clipboard?: { writeText: (t: string) => Promise<void> } }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', {
            configurable: true,
            value: { writeText: (t: string) => { writes.push(t); return Promise.resolve() } },
        })
        try {
            expect(cutCommand(view)).toBe(true)
            expect(writes).toEqual(['hello '])
            expect(view.state.doc.toString()).toBe('world')
            expectDOMMatchesDoc(view)
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
            view.destroy()
        }
    })

    it('只读 pasteCommand 返 true 不改 doc', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'locked',
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        expect(pasteCommand(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('locked')
        view.destroy()
        host.remove()
    })

    it('pasteCommand 从 clipboard.readText 插入', async () => {
        const view = make('ab')
        caret(view, 1)
        const nav = globalThis.navigator as Navigator & { clipboard?: { readText: () => Promise<string> } }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', {
            configurable: true,
            value: { readText: () => Promise.resolve('XY') },
        })
        try {
            expect(pasteCommand(view)).toBe(true)
            // 异步插入
            await Promise.resolve()
            await Promise.resolve()
            expect(view.state.doc.toString()).toBe('aXYb')
            expectDOMMatchesDoc(view)
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
            view.destroy()
        }
    })

    it('writeClipboardText 无 API 时走 legacy 不抛', () => {
        const nav = globalThis.navigator as Navigator & { clipboard?: unknown }
        const prev = nav.clipboard
        Object.defineProperty(nav, 'clipboard', { configurable: true, value: undefined })
        try {
            expect(() => writeClipboardText('z')).not.toThrow()
        } finally {
            Object.defineProperty(nav, 'clipboard', { configurable: true, value: prev })
        }
    })
})
