// K1:hover.* 选项、hover 卡键盘滚动命令、颜色悬浮卡、links 选项 / openLink / registerLinkOpener、parameterHints.*。
// 鼠标交互用 mock 的 caretRangeFromPoint + 假定时器驱动;真实鼠标几何 / 拖动需要浏览器(见交付报告)。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import {
    hoverSources, hoverTooltip, showHover, scrollUpHover, scrollDownHover, scrollLeftHover, scrollRightHover,
    pageUpHover, pageDownHover, goToTopHover, goToBottomHover, HOVER_COMMANDS, hoverScrollKey, colorHoverSource, colorToHex,
} from '../../src/core/feature/hover'
import type { HoverSource } from '../../src/core/feature/hover'
import {
    computeLineLinks, linkAt, registerLinkOpener, openLinkUrl, openLink, linkDecorations, activeLinkField,
    activeLinkDecorations, linkDetector, linkHoverSource, LINK_COMMANDS,
} from '../../src/core/feature/link'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { signatureHelpSession } from '../../src/lang/tssignature'

const views: EditorView[] = []
afterEach(() => {
    for (const v of views.splice(0)) { v.dom.parentElement?.remove(); v.destroy() }
    vi.useRealTimers()
    document.body.replaceChildren()
})

function rect(left: number, top: number, width: number, height: number) {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

function mount(doc: string, options: Record<string, unknown>, extra: unknown[] = [], sel = 0) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            selection: EditorSelection.single(sel),
            extensions: [editorOptions.of(options as never), ...(extra as never[])],
        }),
        parent: host,
    })
    views.push(view)
    view.oracle.lineHeight = 20
    ;(view as unknown as { caretCoords: () => unknown }).caretCoords = () => ({ left: 50, top: 400, bottom: 420, height: 20 })
    ;(view as unknown as { lineBlockAt: () => unknown }).lineBlockAt = () => ({ from: 0, to: doc.length, top: 400, bottom: 420, height: 20 })
    view.dom.getBoundingClientRect = () => rect(0, 100, 800, 700)
    view.contentDOM.getBoundingClientRect = () => rect(0, 100, 800, 700)
    return view
}

// —— hover 卡尺寸:固定 300×100 ——
let origRect: typeof HTMLElement.prototype.getBoundingClientRect
beforeEach(() => {
    origRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        if (this.classList.contains('cm-tooltip-hover')) return rect(0, 0, 300, 100)
        return origRect.call(this)
    }
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
})
afterEach(() => { HTMLElement.prototype.getBoundingClientRect = origRect })

const card: HoverSource = (_s, pos) => pos > 3 ? null : ({ pos: 0, end: 3, create: () => { const d = document.createElement('div'); d.textContent = 'tip'; return d } })

// 鼠标位置 → 文档位置:测试里直接指定
let mousePos: number | null = 1
function stubPointer(view: EditorView) {
    ;(document as unknown as { caretRangeFromPoint: unknown }).caretRangeFromPoint = () => ({ startContainer: view.contentDOM, startOffset: 0 })
    ;(view as unknown as { posFromDOM: () => number | null }).posFromDOM = () => mousePos
}
const move = (view: EditorView, x = 10) =>
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 410, bubbles: true }))
const shown = (view: EditorView) => view.dom.querySelector('.cm-tooltip-hover') !== null

describe('hover.enabled / delay / sticky / hidingDelay / above', () => {
    beforeEach(() => { mousePos = 1; vi.useFakeTimers() })

    it('默认:鼠标停 300ms 后弹卡', async () => {
        const v = mount('foo bar baz', {}, [hoverSources.of(card)])
        stubPointer(v)
        const off = hoverTooltip(v)
        move(v)
        await vi.advanceTimersByTimeAsync(250)
        expect(shown(v)).toBe(false)
        await vi.advanceTimersByTimeAsync(100)
        expect(shown(v)).toBe(true)
        off()
    })
    it('enabled:false:鼠标不弹卡;键盘 Show Hover 照常', async () => {
        const v = mount('foo bar baz', { hover: { enabled: false } }, [hoverSources.of(card)])
        stubPointer(v)
        const off = hoverTooltip(v)
        move(v)
        await vi.advanceTimersByTimeAsync(2000)
        expect(shown(v)).toBe(false)
        await showHover(v)
        expect(shown(v)).toBe(true)
        off()
    })
    it('delay:1000 → 300ms 时还没有,1000ms 后才弹', async () => {
        const v = mount('foo bar baz', { hover: { delay: 1000 } }, [hoverSources.of(card)])
        stubPointer(v)
        const off = hoverTooltip(v)
        move(v)
        await vi.advanceTimersByTimeAsync(400)
        expect(shown(v)).toBe(false)
        await vi.advanceTimersByTimeAsync(700)
        expect(shown(v)).toBe(true)
        off()
    })
    const openThenLeave = async (hover: Record<string, unknown>) => {
        // delay 拉大:避免「离开后又按 delay 重新问一次」盖过 hidingDelay 的效果
        const opts = { delay: 5000, ...hover }
        const v = mount('foo bar baz', { hover: opts }, [hoverSources.of(card)])
        stubPointer(v)
        const off = hoverTooltip(v)
        move(v)
        await vi.advanceTimersByTimeAsync(5100)
        expect(shown(v)).toBe(true)
        mousePos = 8 // 移出锚点 [0,3]
        move(v, 200)
        return { v, off }
    }
    it('默认 sticky + hidingDelay 300:离开锚点后 300ms 才收', async () => {
        const { v, off } = await openThenLeave({})
        await vi.advanceTimersByTimeAsync(200)
        expect(shown(v)).toBe(true)
        await vi.advanceTimersByTimeAsync(200)
        expect(shown(v)).toBe(false)
        off()
    })
    it('hidingDelay:100 → 100ms 后收', async () => {
        const { v, off } = await openThenLeave({ hidingDelay: 100 })
        await vi.advanceTimersByTimeAsync(50)
        expect(shown(v)).toBe(true)
        await vi.advanceTimersByTimeAsync(100)
        expect(shown(v)).toBe(false)
        off()
    })
    it('sticky:false → 离开锚点立即收(不等 hidingDelay)', async () => {
        const { v, off } = await openThenLeave({ sticky: false })
        expect(shown(v)).toBe(false)
        off()
    })
    it('sticky:false → 鼠标移进卡就收;默认 sticky 移进卡不收', async () => {
        for (const sticky of [true, false]) {
            const v = mount('foo bar baz', { hover: { sticky } }, [hoverSources.of(card)])
            stubPointer(v)
            const off = hoverTooltip(v)
            move(v)
            await vi.advanceTimersByTimeAsync(400)
            const c = v.dom.querySelector('.cm-tooltip-hover')!
            c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
            await vi.advanceTimersByTimeAsync(10)
            expect(shown(v)).toBe(sticky)
            off()
        }
    })
    it('above:默认 true 卡放在行上方;false 放下方', async () => {
        const top = async (hover: Record<string, unknown>) => {
            const v = mount('foo bar baz', { hover }, [hoverSources.of(card)])
            await showHover(v)
            return (v.dom.querySelector('.cm-tooltip-hover') as HTMLElement).style.top
        }
        // 行 [400,420],卡高 100,编辑器顶 100:上方 = 400-100-100 = 200;下方 = 420-100 = 320
        expect(await top({})).toBe('200px')
        expect(await top({ above: false })).toBe('320px')
    })
})

describe('hover 卡键盘滚动命令(editor.action.scrollUpHover 等)', () => {
    async function focused() {
        const v = mount('foo bar baz', {}, [hoverSources.of(card)])
        await showHover(v)
        const root = v.dom.querySelector('.cm-tooltip-hover') as HTMLElement
        Object.defineProperty(root, 'clientHeight', { configurable: true, value: 100 })
        Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 500 })
        root.scrollTop = 200
        root.scrollLeft = 100
        root.focus()
        return { v, root }
    }
    it('↑↓:按编辑器行高滚;←→:30px', async () => {
        const { v, root } = await focused()
        expect(scrollUpHover(v)).toBe(true); expect(root.scrollTop).toBe(180)
        expect(scrollDownHover(v)).toBe(true); expect(root.scrollTop).toBe(200)
        scrollLeftHover(v); expect(root.scrollLeft).toBe(70)
        scrollRightHover(v); expect(root.scrollLeft).toBe(100)
    })
    it('PageUp/PageDown 滚一屏;Home/End 到顶 / 到底', async () => {
        const { v, root } = await focused()
        pageUpHover(v); expect(root.scrollTop).toBe(100)
        pageDownHover(v); expect(root.scrollTop).toBe(200)
        goToTopHover(v); expect(root.scrollTop).toBe(0)
        goToBottomHover(v); expect(root.scrollTop).toBe(500)
    })
    it('卡没有焦点(Monaco precondition hoverFocused)→ 返回 false,不动', async () => {
        const { v, root } = await focused()
        v.focus()
        root.scrollTop = 200
        expect(scrollDownHover(v)).toBe(false)
        expect(root.scrollTop).toBe(200)
    })
    it('卡内按键走同一组命令(PageDown 等),Monaco 命令 id 都注册了', async () => {
        const { root } = await focused()
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
        expect(root.scrollTop).toBe(300)
        for (const id of ['showHover', 'scrollUpHover', 'scrollDownHover', 'scrollLeftHover', 'scrollRightHover', 'pageUpHover', 'pageDownHover', 'goToTopHover', 'goToBottomHover'])
            expect(typeof HOVER_COMMANDS[`editor.action.${id}`]).toBe('function')
    })
    it('键位表(Monaco 默认):方向键 / PageUp·Down / Home·End / ⌘↑ ⌘↓', () => {
        const k = (key: string, init: KeyboardEventInit = {}) => hoverScrollKey(new KeyboardEvent('keydown', { key, ...init }))
        expect([k('ArrowUp'), k('ArrowDown'), k('ArrowLeft'), k('ArrowRight')]).toEqual(['up', 'down', 'left', 'right'])
        expect([k('PageUp'), k('PageDown'), k('Home'), k('End')]).toEqual(['pageUp', 'pageDown', 'top', 'bottom'])
        expect([k('ArrowUp', { metaKey: true }), k('ArrowDown', { ctrlKey: true })]).toEqual(['top', 'bottom'])
        expect(k('ArrowUp', { altKey: true })).toBeNull()
    })
})

describe('颜色悬浮卡(ColorHoverParticipant)', () => {
    const doc = 'a { color: #ff0000; b: rgb(0, 128, 255); c: hsl(120, 100%, 50%); d: rgba(255,0,0,0.5) }'
    const at = (needle: string, options: Record<string, unknown> = {}) => {
        const s = EditorState.create({ doc, extensions: [editorOptions.of(options as never)] })
        return colorHoverSource(s, doc.indexOf(needle) + 1, 1) as ReturnType<HoverSource> & { create: () => HTMLElement } | null
    }
    it('hex / rgb / hsl / rgba 给色块 + hex', () => {
        expect(at('#ff0000')!.create().textContent).toBe('#ff0000')
        expect(at('rgb(0')!.create().textContent).toBe('#0080ff')
        expect(at('hsl(')!.create().textContent).toBe('#00ff00')
        expect(at('rgba(')!.create().textContent).toBe('#ff000080')
        expect((at('#ff0000')!.create().querySelector('.cm-color-hover-swatch') as HTMLElement).style.background).toBe('rgb(255, 0, 0)')
    })
    it('不在颜色上 → null', () => { expect(at('color:')).toBeNull() })
    it('colorDecorators:false → 不给', () => { expect(at('#ff0000', { colorDecorators: false })).toBeNull() })
    it("colorDecoratorsActivatedOn:'click' 不给;'hover' / 默认 'clickAndHover' 给", () => {
        expect(at('#ff0000', { colorDecoratorsActivatedOn: 'click' })).toBeNull()
        expect(at('#ff0000', { colorDecoratorsActivatedOn: 'hover' })).not.toBeNull()
        expect(at('#ff0000')).not.toBeNull()
    })
    it('colorToHex', () => {
        expect(colorToHex('#abc')).toBe('#aabbcc')
        expect(colorToHex('rgb(10%, 20%, 30%)')).toBe('#1a334d')
        expect(colorToHex('nope')).toBeNull()
    })
})

describe('computeLineLinks(Monaco LinkComputer 移植)', () => {
    const urls = (s: string) => computeLineLinks(s).map(l => l.url)
    it('http / https / file,大小写不敏感', () => {
        expect(urls('see http://a.com/x and HTTPS://B.com and file:///tmp/a')).toEqual(['http://a.com/x', 'HTTPS://B.com', 'file:///tmp/a'])
    })
    it('结尾的 . , ; : 不算;被括号 / 方括号 / 花括号包着时不带右括号', () => {
        expect(urls('go to http://a.com/x.')).toEqual(['http://a.com/x'])
        expect(urls('(http://a.com/x)')).toEqual(['http://a.com/x'])
        expect(urls('[http://a.com/x]')).toEqual(['http://a.com/x'])
        expect(urls('{http://a.com/x}')).toEqual(['http://a.com/x'])
        expect(urls('http://a.com/wiki_(x)')).toEqual(['http://a.com/wiki_(x)'])
    })
    it('引号包着的链接在引号处结束;空格结束', () => {
        expect(urls('"http://a.com/x" y')).toEqual(['http://a.com/x'])
        expect(urls("'http://a.com/x'")).toEqual(['http://a.com/x'])
        expect(urls('http://a.com/x y')).toEqual(['http://a.com/x'])
    })
    it('只有 scheme 没有主机 / 非 scheme → 没有链接', () => {
        expect(urls('http:// ')).toEqual([])
        expect(urls('mailto:a@b.c ftp://x')).toEqual([])
    })
    it('范围是行内偏移', () => {
        expect(computeLineLinks('ab http://a.com cd')[0]).toMatchObject({ from: 3, to: 15 })
    })
})

describe('links 选项', () => {
    const DOC = 'x http://a.com/x y'
    const decoCount = (options: Record<string, unknown>) => {
        const s = EditorState.create({ doc: DOC, extensions: [editorOptions.of(options as never)] })
        let n = 0
        const it = linkDecorations(s).iter()
        for (; it.value; it.next()) n++
        return n
    }
    it('默认 true:识别、画 detected-link 装饰', () => {
        expect(decoCount({})).toBe(1)
        const s = EditorState.create({ doc: DOC })
        expect(linkAt(s, 5)).toMatchObject({ url: 'http://a.com/x' })
    })
    it('false:不识别、不画装饰、openLink 无效', () => {
        expect(decoCount({ links: false })).toBe(0)
        const s = EditorState.create({ doc: DOC, extensions: [editorOptions.of({ links: false } as never)] })
        expect(linkAt(s, 5)).toBeNull()
        const v = mount(DOC, { links: false }, [], 5)
        expect(openLink(v)).toBe(false)
    })
})

describe('registerLinkOpener / editor.action.openLink / 修饰键点击', () => {
    const DOC = 'x http://a.com/x y'
    it('默认 opener:http(s) 走 window.open;registerLinkOpener 先于默认,返回 true 就不再往下', async () => {
        const open = vi.fn()
        const win = { open } as unknown as Window
        expect(await openLinkUrl('https://a.com/x', win)).toBe(true)
        expect(open).toHaveBeenCalledWith('https://a.com/x', '_blank', 'noopener,noreferrer')
        const seen: string[] = []
        const d = registerLinkOpener({ open(uri) { seen.push(`${uri.scheme}|${uri.authority}|${uri.path}`); return true } })
        open.mockClear()
        expect(await openLinkUrl('https://a.com/x?q=1', win)).toBe(true)
        expect(seen).toEqual(['https|a.com|/x'])
        expect(open).not.toHaveBeenCalled()
        d.dispose()
        await openLinkUrl('https://a.com/x', win)
        expect(open).toHaveBeenCalledTimes(1)
    })
    it('opener 返回 false → 交给下一个 / 默认;file: 默认不打开', async () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: () => false })
        expect(await openLinkUrl('http://a.com', { open } as unknown as Window)).toBe(true)
        expect(await openLinkUrl('file:///tmp/a', { open } as unknown as Window)).toBe(false)
        d.dispose()
    })
    it('editor.action.openLink:光标在链接上才打开', () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const on = mount(DOC, {}, [], 5)
        expect(LINK_COMMANDS['editor.action.openLink'](on)).toBe(true)
        expect(open).toHaveBeenCalledWith('http://a.com/x')
        open.mockClear()
        const off = mount(DOC, {}, [], 0)
        expect(openLink(off)).toBe(false)
        expect(open).not.toHaveBeenCalled()
        d.dispose()
    })
    it('修饰键(默认 multiCursorModifier=altKey → ⌘/Ctrl)悬停激活下划线,松开鼠标打开;没按修饰键什么都不做', async () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const v = mount(DOC, {}, [activeLinkField], 0)
        ;(v as unknown as { posAtCoords: () => number }).posAtCoords = () => 5
        const off = linkDetector(v)
        v.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))
        expect(v.state.field(activeLinkField)).toBeNull()
        v.contentDOM.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
        await Promise.resolve()
        expect(open).not.toHaveBeenCalled()
        v.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true, ctrlKey: true, metaKey: true }))
        const a = v.state.field(activeLinkField)
        expect(a).toEqual({ from: 2, to: 16 })
        expect(activeLinkDecorations(v.state).size).toBe(1)
        v.contentDOM.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 10, clientY: 10, bubbles: true, ctrlKey: true, metaKey: true }))
        await new Promise(r => setTimeout(r, 0))
        expect(open).toHaveBeenCalledWith('http://a.com/x')
        off()
        d.dispose()
    })
    it("multiCursorModifier:'ctrlCmd' 时触发键换成 Alt", async () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const v = mount(DOC, { multiCursorModifier: 'ctrlCmd' }, [activeLinkField], 0)
        ;(v as unknown as { posAtCoords: () => number }).posAtCoords = () => 5
        const off = linkDetector(v)
        v.contentDOM.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true, ctrlKey: true, metaKey: true }))
        await new Promise(r => setTimeout(r, 0))
        expect(open).not.toHaveBeenCalled()
        v.contentDOM.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true, altKey: true }))
        await new Promise(r => setTimeout(r, 0))
        expect(open).toHaveBeenCalledTimes(1)
        off()
        d.dispose()
    })
    it('links:false 时修饰键点击不打开', async () => {
        const open = vi.fn()
        const d = registerLinkOpener({ open: (u) => { open(u.toString()); return true } })
        const v = mount(DOC, { links: false }, [activeLinkField], 0)
        ;(v as unknown as { posAtCoords: () => number }).posAtCoords = () => 5
        const off = linkDetector(v)
        v.contentDOM.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true, ctrlKey: true, metaKey: true }))
        await new Promise(r => setTimeout(r, 0))
        expect(open).not.toHaveBeenCalled()
        off()
        d.dispose()
    })
    it('hover 卡「Follow link (… + click)」', () => {
        const s = EditorState.create({ doc: DOC })
        const r = linkHoverSource(s, 5, 1) as { create: () => HTMLElement }
        const el = r.create()
        expect(el.textContent).toMatch(/^Follow link \((cmd|ctrl) \+ click\)$/)
        const alt = EditorState.create({ doc: DOC, extensions: [editorOptions.of({ multiCursorModifier: 'ctrlCmd' } as never)] })
        expect((linkHoverSource(alt, 5, 1) as { create: () => HTMLElement }).create().textContent).toMatch(/^Follow link \((option|alt) \+ click\)$/)
    })
})

// —— parameterHints.enabled / cycle(真 TS 服务)——
describe('parameterHints', () => {
    const SLOW = 60_000
    const DOC = 'function over(x: string): void\nfunction over(x: number, y: number): void\nfunction over(x: any, y?: any) {}\n'
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    async function until(pred: () => boolean, ms = 5000) {
        const end = Date.now() + ms
        while (Date.now() < end) { if (pred()) return true; await sleep(10) }
        return pred()
    }
    const sig = (v: EditorView) => v.dom.querySelector('.cm-signature-help') as HTMLElement | null
    const meta = (v: EditorView) => sig(v)?.querySelector('.cm-signature-meta')?.textContent
    const type = (v: EditorView, s: string) => {
        for (const ch of s) {
            const at = v.state.selection.main.head
            v.dispatch(v.state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: 'input.type' }))
        }
    }
    async function setup(name: string, parameterHints: Record<string, unknown>) {
        clearTSServiceCache()
        const view = mount(DOC, { parameterHints }, [], DOC.length)
        const off = signatureHelpSession(view, { lang: 'typescript', fileName: name })
        await getTSService({ lang: 'typescript', fileName: name }).ensure()
        return { view, off }
    }
    const arrow = (v: EditorView, key: string) =>
        v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

    it('默认 enabled:打 ( 自动弹', async () => {
        const { view, off } = await setup('/k1-ph-1.ts', {})
        type(view, 'over(')
        expect(await until(() => !!sig(view))).toBe(true)
        off()
    }, SLOW)
    it('enabled:false:打 ( 不弹;显式触发照常', async () => {
        const { view, off } = await setup('/k1-ph-2.ts', { enabled: false })
        type(view, 'over(')
        await sleep(400)
        expect(sig(view)).toBeNull()
        view.dom.dispatchEvent(new Event('lite-monaco-signature-help'))
        expect(await until(() => !!sig(view))).toBe(true)
        off()
    }, SLOW)
    it('cycle 默认 true:最后一个再往后回到第一个', async () => {
        const { view, off } = await setup('/k1-ph-3.ts', {})
        type(view, 'over(')
        expect(await until(() => !!meta(view))).toBe(true)
        expect(meta(view)).toBe('1/2')
        arrow(view, 'ArrowDown'); expect(meta(view)).toBe('2/2')
        arrow(view, 'ArrowDown'); expect(meta(view)).toBe('1/2')
        arrow(view, 'ArrowUp'); expect(meta(view)).toBe('2/2')
        off()
    }, SLOW)
    it('cycle:false:到头再按就关掉提示(Monaco next()/previous() 的 cancel)', async () => {
        const { view, off } = await setup('/k1-ph-4.ts', { cycle: false })
        type(view, 'over(')
        expect(await until(() => !!meta(view))).toBe(true)
        arrow(view, 'ArrowUp') // 第一个往前:关
        expect(sig(view)).toBeNull()
        type(view, ',')
        expect(await until(() => !!meta(view))).toBe(true)
        arrow(view, 'ArrowDown') // 中间往后:切到 2/2
        expect(meta(view)).toBe('2/2')
        arrow(view, 'ArrowDown') // 最后一个往后:关
        expect(sig(view)).toBeNull()
        off()
    }, SLOW)
    it('editor.action.triggerParameterHints 绑 ⌘⇧Space / Ctrl+⇧Space', async () => {
        const src = await import('node:fs').then(fs => fs.readFileSync('src/litemonaco.ts', 'utf8'))
        expect(src).toMatch(/key: 'Mod-Shift-Space',\s*run: \(target\) => triggerSignatureHelp\(/)
    })
})
