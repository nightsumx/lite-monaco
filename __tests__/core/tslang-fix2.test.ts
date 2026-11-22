// 第 2 轮 F3a:默认编译选项 / JS 不跑语义 / lib 放行 / 撤销选项 / 大文档预算 / related / marker hover 顺序 / hover 控制器
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { diagnosticHoverSource, hoverSources, hoverTooltip, showHover } from '../../src/core/feature/hover'
import { setTsTags, tsDiagnosticsSession, tsTagField, tsTagHoverMarkers } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache, getTSService, getTsCompilerOptions, isProgramLib, setTsCompilerOptions } from '../../src/lang/tsservice'
import { budgetFor } from '../../src/core/perf'

const SLOW = 60_000

function mountView(doc: string, extensions: import('../../src/core/model/state').Extension[] = [], keymap?: import('../../src/core/edit/keymap').KeyBinding[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(0), extensions }), parent: host, keymap })
    return { view, done: () => { view.destroy(); host.remove() } }
}
async function until(pred: () => boolean, ms = 20_000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return false
}
const codes = (view: EditorView) => (view.state.field(diagnosticsField) ?? []).map(d => d.code)

describe('S2 默认编译选项照 Monaco typescriptDefaults(不开 strict)', () => {
    it('strict 族错误不报;宿主仍能打开', async () => {
        clearTSServiceCache()
        const doc = "let s: string = null\nfunction f(a) { return a }\nexport {}\n"
        const { view, done } = mountView(doc, [diagnosticsField])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/s2.ts', debounceMs: 1 })
        await getTSService({ lang: 'typescript', fileName: '/s2.ts' }).ensure()
        view.dispatch(view.state.update({ changes: { from: doc.length, insert: '\n' } }))
        await new Promise(r => setTimeout(r, 400))
        expect(codes(view)).toEqual([])
        setTsCompilerOptions({ strict: true })
        expect(await until(() => codes(view).includes('(2322)') && codes(view).includes('(7006)'))).toBe(true)
        off(); done()
    }, SLOW)
})

describe('S14 撤销 compilerOptions:值给 undefined 就删掉这个键', () => {
    it('strict: undefined 撤销后不再报', async () => {
        clearTSServiceCache()
        setTsCompilerOptions({ strict: true })
        expect(getTsCompilerOptions().strict).toBe(true)
        setTsCompilerOptions({ strict: undefined })
        expect('strict' in getTsCompilerOptions()).toBe(false)
        const doc = "let s: string = null\nexport {}\n"
        const { view, done } = mountView(doc, [diagnosticsField])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/s14.ts', debounceMs: 1 })
        await getTSService({ lang: 'typescript', fileName: '/s14.ts' }).ensure()
        view.dispatch(view.state.update({ changes: { from: doc.length, insert: '\n' } }))
        await new Promise(r => setTimeout(r, 400))
        expect(codes(view)).toEqual([])
        off(); done()
    }, SLOW)
})

describe('S3 JS 照 javascriptDefaults(noSemanticValidation):只有语法 + suggestion', () => {
    it('重复声明(语义 2451)不报,类型注解(语法 8010)照报,未使用照样淡显', async () => {
        clearTSServiceCache()
        const doc = "let a = 1\nlet a = 2\nconst t: number = 1\nfunction f() { const unused = 3 }\nf()\n"
        const { view, done } = mountView(doc, [diagnosticsField, tsTagField])
        const off = tsDiagnosticsSession(view, { lang: 'javascript', fileName: '/s3.js', debounceMs: 1 })
        await getTSService({ lang: 'javascript', fileName: '/s3.js' }).ensure()
        view.dispatch(view.state.update({ changes: { from: doc.length, insert: '\n' } }))
        expect(await until(() => view.state.field(tsTagField).some(m => m.message.includes("'unused'")))).toBe(true)
        expect(codes(view)).toEqual(['(8010)'])
        off(); done()
    }, SLOW)
})

describe('S4 lib:esnext.full 引用的 webworker.importscripts / scripthost 进 program', () => {
    it('isProgramLib', () => {
        expect(isProgramLib('lib.webworker.importscripts.d.ts')).toBe(true)
        expect(isProgramLib('lib.scripthost.d.ts')).toBe(true)
        expect(isProgramLib('lib.webworker.d.ts')).toBe(false)
    })
})

describe('S1 / S10 诊断预算', () => {
    it('S 档防抖 500(Monaco);L 档 full + 灯泡照常;XL 只语法', () => {
        expect(budgetFor(100, 1_000).diagDebounceMs).toBe(500)
        const L = budgetFor(8_000, 10)
        expect(L.diagMode).toBe('full')
        expect(L.lightbulbDebounceMs).toBeGreaterThan(0)
        expect(budgetFor(20_000, 10).diagMode).toBe('syntax')
    })
})

describe('S5 错误诊断带 relatedInformation,hover 每条一行 `文件(行, 列): 消息`', () => {
    it('2420 的 declared here', async () => {
        clearTSServiceCache()
        const doc = "interface I { m(): void }\nclass D implements I { }\nexport {}\n"
        const { view, done } = mountView(doc, [diagnosticsField, hoverSources.of(diagnosticHoverSource)])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName: '/s5.ts', debounceMs: 1 })
        expect(await until(() => codes(view).includes('(2420)'))).toBe(true)
        const d = view.state.field(diagnosticsField).find(x => x.code === '(2420)')!
        expect(d.related).toEqual([{ file: 's5.ts', line: 1, col: 15, message: "'m' is declared here.", same: true }])
        view.dispatch(view.state.update({ selection: EditorSelection.single(d.from) }))
        expect(await showHover(view)).toBe(true)
        const rel = [...view.dom.querySelectorAll('.cm-tooltip-hover .cm-diagnostic-related')].map(e => e.textContent)
        expect(rel).toEqual(["s5.ts(1, 15): 'm' is declared here."])
        // 点链接跳到声明
        view.dom.querySelector<HTMLElement>('.cm-diagnostic-related a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        expect(view.state.selection.main.head).toBe(14)
        off(); done()
    }, SLOW)
})

describe('S12 同位置多条:诊断和标签一个 hover 源,先 hint 后 error/warning/info(Monaco lineDecorations 顺序)', () => {
    it('class D:6196 hint 在 2420 error 前;状态栏照最严重的给 View Problem', async () => {
        const { view, done } = mountView('class D implements I { }\n', [diagnosticsField, tsTagField, hoverSources.of(diagnosticHoverSource), tsTagHoverMarkers])
        view.dispatch(view.state.update({
            selection: EditorSelection.single(6),
            effects: [
                setDiagnostics.of([{ from: 6, to: 7, severity: 'error', message: "Class 'D' incorrectly implements interface 'I'.", code: '(2420)', source: 'ts' }]),
                setTsTags.of([{ from: 6, to: 7, tag: 'unnecessary', message: "'D' is declared but never used.", code: '(6196)' }]),
            ],
        }))
        expect(await showHover(view)).toBe(true)
        const rows = [...view.dom.querySelectorAll('.cm-tooltip-hover .cm-diagnostic-tooltip .cm-diagnostic-code')].map(e => e.textContent)
        expect(rows).toEqual(['(6196)', '(2420)'])
        expect(view.dom.querySelectorAll('.cm-tooltip-hover .cm-hover-row').length).toBe(1)
        expect(view.dom.querySelector('.cm-hover-status')!.textContent).toMatch(/View Problem/)
        done()
    })

    it('只有 hint:没有 View Problem', async () => {
        const { view, done } = mountView('const x = 1\n', [diagnosticsField, tsTagField, hoverSources.of(diagnosticHoverSource), tsTagHoverMarkers])
        view.dispatch(view.state.update({ selection: EditorSelection.single(6), effects: setTsTags.of([{ from: 6, to: 7, tag: 'unnecessary', message: "'x' is declared but its value is never read.", code: '(6133)' }]) }))
        expect(await showHover(view)).toBe(true)
        expect(view.dom.querySelector('.cm-tooltip-hover .cm-diagnostic-hint')).not.toBeNull()
        expect(view.dom.textContent).not.toMatch(/View Problem/)
        done()
    })
})

describe('hover 控制器(Monaco ContentHoverController)', () => {
    const open = async () => {
        // 编辑器自己的 keymap(和 lite-monaco 一样先于 hover 挂上)
        const m = mountView('const x = foo()\n', [diagnosticsField, hoverSources.of(diagnosticHoverSource)], [{ key: 'Mod-k Mod-i', run: t => { void showHover(t as EditorView); return true } }])
        m.view.dispatch(m.view.state.update({ selection: EditorSelection.single(11), effects: setDiagnostics.of([{ from: 10, to: 13, severity: 'error', message: 'bad' }]) }))
        const off = hoverTooltip(m.view)
        expect(await showHover(m.view)).toBe(true)
        const card = () => m.view.dom.querySelector<HTMLElement>('.cm-tooltip-hover')
        return { ...m, card, done: () => { off(); m.done() } }
    }
    const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
        const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
        el.dispatchEvent(e)
        return e
    }

    it('O3 和弦前缀(⌘K)不关卡;卡开着再 Show Hover → 焦点进卡;卡内 ↓/PageDown 滚动;Esc 关卡还焦点', async () => {
        const { view, card, done } = await open()
        // (不先 focus:jsdom 里 focus 后按键,observer flush 会把 DOM 选区当成新选区派发,卡跟着关;浏览器里实测不会)
        const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
        key(view.contentDOM, 'k', mod)
        expect(card()).not.toBeNull()
        key(view.contentDOM, 'i', mod)
        await new Promise(r => setTimeout(r, 0))
        expect(document.activeElement).toBe(card())
        const c = card()!
        Object.defineProperty(c, 'clientHeight', { configurable: true, value: 100 })
        Object.defineProperty(c, 'scrollHeight', { configurable: true, value: 1000 })
        key(c, 'ArrowDown')
        expect(c.scrollTop).toBeGreaterThan(0)
        const t = c.scrollTop
        key(c, 'PageDown')
        expect(c.scrollTop).toBe(t + 100)
        expect(view.state.selection.main.head).toBe(11)
        key(c, 'Escape')
        expect(card()).toBeNull()
        expect(document.activeElement).toBe(view.contentDOM)
        done()
    })

    it('其它键照样关卡', async () => {
        const { view, card, done } = await open()
        key(view.contentDOM, 'ArrowRight')
        expect(card()).toBeNull()
        done()
    })

    it('O37 键盘唤起的卡失焦不关', async () => {
        const { view, card, done } = await open()
        view.contentDOM.dispatchEvent(new FocusEvent('blur'))
        expect(card()).not.toBeNull()
        done()
    })

    it('O20 最大宽高 max(宽×0.66, 500) × max(高/4, 250)', async () => {
        const m = mountView('const x = foo()\n', [diagnosticsField, hoverSources.of(diagnosticHoverSource)])
        m.view.dom.getBoundingClientRect = () => ({ left: 0, top: 0, right: 2000, bottom: 1600, width: 2000, height: 1600, x: 0, y: 0, toJSON() {} }) as DOMRect
        m.view.dispatch(m.view.state.update({ selection: EditorSelection.single(11), effects: setDiagnostics.of([{ from: 10, to: 13, severity: 'error', message: 'bad' }]) }))
        expect(await showHover(m.view)).toBe(true)
        const c = m.view.dom.querySelector<HTMLElement>('.cm-tooltip-hover')!
        expect([c.style.maxWidth, c.style.maxHeight]).toEqual(['1320px', '400px'])
        m.done()
    })

    it('O30 卡内滚轮每格 50px,不传给编辑器', async () => {
        const { card, done } = await open()
        const c = card()!
        Object.defineProperty(c, 'clientHeight', { configurable: true, value: 100 })
        Object.defineProperty(c, 'scrollHeight', { configurable: true, value: 1000 })
        // 一格(按行):编辑器同一套换算 = 50px(Chrome 实测鼠标一格同样 50)
        const e = new WheelEvent('wheel', { deltaY: 1, deltaMode: 1, bubbles: true, cancelable: true })
        c.dispatchEvent(e)
        expect(c.scrollTop).toBe(50)
        expect(e.defaultPrevented).toBe(true)
        done()
    })
})
