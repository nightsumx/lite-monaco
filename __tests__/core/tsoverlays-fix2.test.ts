// 第 2 轮 F3b:peek 照 Monaco ReferenceWidget、F2 重命名照 RenameWidget(期望值来自 Monaco 0.52 实测 /tmp/lc-hunt/fix2/f3b/pkkeys.ts、pkmeas.ts、rnprobe.ts)
import { describe, expect, it } from 'vitest'
import { showPeek, closePeek, peekOpen, type PeekLocation } from '../../src/lang/tspeek'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { EditorSelection } from '../../src/core/model/selection'
import { createTSActions } from '../../src/lang/tsactions'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { renameInput, renameInputOpen } from '../../src/lang/tsrename'

const LH = 20
const DOC = 'const a = 1\nfunction foo() {}\n    const value = foo(bar)\nfoo()\nfoo()\nlet zz = 1\n'

function setup(doc = DOC) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc }), parent: host })
    ;(view as unknown as { lineBlockAt: (p: number) => unknown }).lineBlockAt = (p: number) => {
        const n = view.state.doc.lineAt(p).number
        return { from: 0, to: 0, top: (n - 1) * LH, bottom: n * LH, height: LH }
    }
    Object.defineProperty(view.scrollDOM, 'clientHeight', { get: () => 518, configurable: true })
    const ref = (line: number, col: number, file = '/src/main.ts', text: string | null = doc): PeekLocation => {
        const start = view.state.doc.line(line).from + col
        return { file, line, start, length: 3, local: file === '/src/main.ts', preview: '', text }
    }
    const refs = () => [ref(2, 9), ref(3, 18), ref(4, 0), ref(5, 0)]
    const caret = (line: number, col: number) => view.dispatch(view.state.update({ selection: { anchor: view.state.doc.line(line).from + col } }))
    const at = () => { const h = view.state.selection.main.head; const l = view.state.doc.lineAt(h); return `${l.number}:${h - l.from}` }
    const q = (s: string) => view.dom.querySelector<HTMLElement>(s)
    const rows = () => [...view.dom.querySelectorAll<HTMLElement>('.cm-peek-tree > *')]
    const idx = (cls: string) => rows().findIndex(r => r.classList.contains(cls))
    const key = (target: HTMLElement, k: string, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }))
    const down = (el: HTMLElement, detail = 1) => el.dispatchEvent(new MouseEvent('mousedown', { detail, bubbles: true, cancelable: true }))
    const done = () => { closePeek(view); view.destroy(); host.remove() }
    return { view, ref, refs, caret, at, q, rows, idx, key, down, done }
}

describe('peek 列表(Monaco ReferenceWidget)', () => {
    it('行预览:起点往前 8 列所在词开头 + 引用 + 其余,去首尾空白', () => {
        const t = setup()
        t.caret(1, 0)
        showPeek(t.view, { title: 'References', locations: t.refs() })
        const r = t.rows()[1]
        expect(r.textContent).toBe('value = foo(bar)')
        expect(r.querySelector('.cm-peek-hl')?.textContent).toBe('foo')
        expect(t.q('.cm-peek-meta')?.textContent).toBe('References (4)')
        expect(t.q('.cm-peek-filename')?.textContent).toBe('main.ts')
        expect(t.q('.cm-peek-dirname')?.textContent).toBe('/src')
        t.done()
    })

    it('选中离光标最近的那处,焦点在列表;↑↓ 只挪焦点不绕回,Enter 才选中', () => {
        const t = setup()
        t.caret(4, 1)
        showPeek(t.view, { title: 'References', locations: t.refs() })
        expect(t.idx('cm-peek-ref-selected')).toBe(2)
        expect(document.activeElement).toBe(t.q('.cm-peek-tree'))
        const tree = t.q('.cm-peek-tree')!
        t.key(tree, 'ArrowDown')
        expect(t.idx('cm-peek-ref-focused')).toBe(3)
        expect(t.idx('cm-peek-ref-selected')).toBe(2)
        t.key(tree, 'ArrowDown')
        expect(t.idx('cm-peek-ref-focused')).toBe(3)
        t.key(tree, 'Enter')
        expect(t.idx('cm-peek-ref-selected')).toBe(3)
        expect(peekOpen(t.view)).toBe(true)
        t.key(tree, 'Home')
        expect(t.idx('cm-peek-ref-focused')).toBe(0)
        t.done()
    })

    it('F4 / ⇧F4:编辑器光标跟到下一处 / 上一处(绕回),peek 挪到那一行', () => {
        const t = setup()
        t.caret(4, 1)
        showPeek(t.view, { title: 'References', locations: t.refs() })
        const tree = t.q('.cm-peek-tree')!
        const top0 = t.q('.cm-peek')!.style.top
        t.key(tree, 'F4')
        expect(t.at()).toBe('5:0')
        expect(t.idx('cm-peek-ref-selected')).toBe(3)
        expect(t.q('.cm-peek')!.style.top).toBe(`${parseFloat(top0) + LH}px`)
        t.key(tree, 'F4')
        expect(t.at()).toBe('2:9')
        t.key(tree, 'F4', true)
        expect(t.at()).toBe('5:0')
        expect(document.activeElement).toBe(t.q('.cm-peek-tree'))
        t.done()
    })

    it('Esc 关掉,焦点回编辑器;在同一处再开一次 = 关掉', () => {
        const t = setup()
        t.caret(4, 1)
        showPeek(t.view, { title: 'References', locations: t.refs() })
        t.key(t.q('.cm-peek-tree')!, 'Escape')
        expect(peekOpen(t.view)).toBe(false)
        expect(t.at()).toBe('4:1')
        showPeek(t.view, { title: 'References', locations: t.refs() })
        showPeek(t.view, { title: 'References', locations: t.refs() })
        expect(peekOpen(t.view)).toBe(false)
        t.done()
    })

    it('双击:peekMode 在 peek 里跳过去;否则关掉 peek 选中整个引用', () => {
        const t = setup()
        t.caret(1, 0)
        showPeek(t.view, { title: 'References', locations: t.refs(), peekMode: true })
        t.down(t.rows()[2], 2)
        expect(peekOpen(t.view)).toBe(true)
        expect(t.at()).toBe('4:0')
        closePeek(t.view)
        t.caret(1, 0)
        showPeek(t.view, { title: 'References', locations: t.refs() })
        t.down(t.rows()[2], 2)
        expect(peekOpen(t.view)).toBe(false)
        const s = t.view.state.selection.main
        expect([s.from, s.to]).toEqual([t.view.state.doc.line(4).from, t.view.state.doc.line(4).from + 3])
        t.done()
    })

    it('多个文件:文件行带计数,只展开选中那处所在的文件;别的文件跳过去 = 关掉', () => {
        const t = setup()
        t.caret(4, 1)
        const lib = 'declare function foo(): void\n'
        const locs = [...t.refs(), t.ref(1, 17, '/lib/a.d.ts', lib)].map(r => r.file === '/lib/a.d.ts' ? { ...r, start: 17, line: 1 } : r)
        showPeek(t.view, { title: 'References', locations: locs, peekMode: true })
        const files = [...t.view.dom.querySelectorAll('.cm-peek-file')]
        expect(files.map(f => [f.querySelector('.cm-peek-file-name')?.textContent, f.querySelector('.cm-peek-count')?.textContent, f.getAttribute('aria-expanded')]))
            .toEqual([['a.d.ts', '1', 'false'], ['main.ts', '4', 'true']])
        expect(t.view.dom.querySelectorAll('.cm-peek-ref-child').length).toBe(4)
        t.down(files[0] as HTMLElement)
        const lr = t.rows()[1]
        expect(lr.textContent).toBe('function foo(): void')
        t.down(lr, 2)
        expect(peekOpen(t.view)).toBe(false)
        t.done()
    })

    it('自动取名的文件:标题显示 References,不显示路径', () => {
        const t = setup()
        showPeek(t.view, { title: 'Definitions', locations: t.refs(), inMemory: true })
        expect(t.q('.cm-peek-filename')?.textContent).toBe('References')
        expect(t.q('.cm-peek-dirname')?.textContent).toBe('')
        expect(t.q('.cm-peek-meta')?.textContent).toBe('Definitions (4)')
        t.done()
    })

    it('预览是只读编辑器,标出同文件的各处引用', () => {
        const t = setup()
        showPeek(t.view, { title: 'References', locations: t.refs() })
        const pv = t.q('.cm-peek-preview .cm-editor')
        expect(pv).not.toBe(null)
        expect(pv!.querySelectorAll('.cm-peek-match').length).toBeGreaterThan(0)
        t.done()
    })
})

describe('SymbolNavigationAction(Monaco)', () => {
    const open = (doc: string, pos: number, fileName: string) => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(pos) }), parent: host })
        return { view, actions: createTSActions({ lang: 'typescript', fileName }), done: () => { closePeek(view); view.destroy(); host.remove() } }
    }

    it('lib 里的定义:peek 能看,goTo 只有一处非本文件结果时不动', async () => {
        const doc = 'console.log(1)\n'
        const t = open(doc, doc.indexOf('log') + 1, '/lib-peek.ts')
        expect(await t.actions.peekDefinition(t.view)).toBe(true)
        expect(peekOpen(t.view)).toBe(true)
        expect(t.view.dom.querySelector('.cm-peek-filename')?.textContent).toContain('lib.')
        closePeek(t.view)
        await t.actions.goToDefinition(t.view)
        expect(peekOpen(t.view)).toBe(false)
        expect(t.view.state.selection.main.head).toBe(doc.indexOf('log') + 1)
        t.done()
    }, 60_000)

    it('光标就在定义上:转成 goToReferences', async () => {
        const doc = 'function foo() {}\nfoo()\nfoo()\n'
        const t = open(doc, doc.indexOf('foo') + 1, '/def-refs.ts')
        expect(await t.actions.goToDefinition(t.view)).toBe(true)
        expect(t.view.dom.querySelector('.cm-peek-meta')?.textContent).toBe('References (3)')
        t.done()
    }, 60_000)
})

describe('F2 重命名(Monaco RenameWidget)', () => {
    it('符号行滚出视口:取消,焦点回编辑器', async () => {
        const t = setup()
        let st = 0
        Object.defineProperty(t.view.scrollDOM, 'scrollTop', { get: () => st, set: (v: number) => { st = v }, configurable: true })
        t.caret(3, 18)
        const p = renameInput(t.view, { from: t.view.state.doc.line(3).from + 18, to: t.view.state.doc.line(3).from + 21, name: 'foo' })
        expect(renameInputOpen(t.view)).toBe(true)
        st = 100
        t.view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(await p).toBe(null)
        expect(t.view.dom.querySelector('.cm-rename-box')).toBe(null)
        expect(t.view.hasFocus).toBe(true)
        t.done()
    })
})

describe('⌘. / 灯泡(VS Code codeActionWidget 分组)', () => {
    it('quick fix 和 Fix all 在 Quick Fix 组,重构按 Extract / Rewrite… 分组;点灯泡和 ⌘. 是同一份列表', async () => {
        clearTSServiceCache()
        const { runCodeActionsMenu, codeActionsLightbulb } = await import('../../src/lang/tscodeactions')
        const doc = 'function f(a: number) {\n    return consol.log(a + 1)\n}\nconsol.log(2)\n'
        const t = setup(doc)
        const opts = { lang: 'typescript' as const, fileName: '/groups.ts' }
        const s = doc.indexOf('consol')
        t.view.dispatch(t.view.state.update({ selection: EditorSelection.single(s + 'consol.log(a + 1)'.length, s) }))
        const read = async () => {
            const w = await new Promise<HTMLElement>(r => { const tick = () => { const el = document.querySelector<HTMLElement>('.cm-action-widget'); el ? r(el) : setTimeout(tick, 20) }; tick() })
            const out = [...w.querySelectorAll('.cm-action-list > *')].map(e => e.getAttribute('role') === 'separator' ? `# ${e.textContent}` : `${e.querySelector('.codicon')!.className.split('codicon-')[1]} ${e.textContent}`)
            document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
            return out
        }
        void runCodeActionsMenu(t.view, opts)
        const menu = await read()
        expect(menu[0]).toBe('# Quick Fix')
        expect(menu).toContain("light-bulb Change spelling to 'console'")
        expect(menu).toContain("light-bulb Fix all: Change spelling to 'console'")
        const ex = menu.indexOf('# Extract')
        expect(ex).toBeGreaterThan(0)
        expect(menu[ex + 1].startsWith('wrench Extract to')).toBe(true)
        const order = menu.filter(l => l.startsWith('# '))
        expect(order).toEqual([...order].sort((a, b) => ['# Quick Fix', '# Extract', '# Inline', '# Rewrite', '# Move', '# More Actions...'].indexOf(a) - ['# Quick Fix', '# Extract', '# Inline', '# Rewrite', '# Move', '# More Actions...'].indexOf(b)))
        const off = codeActionsLightbulb(t.view, opts)
        t.view.dom.querySelector<HTMLElement>('.cm-lightbulb')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(await read()).toEqual(menu)
        off()
        t.done()
    }, 60_000)
})
