import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'
import { diagnosticHoverSource, hoverPosFromPoint, hoverSources, hoverTooltip, placeTooltip, showHover } from '../../src/core/feature/hover'
import { EditorView } from '../../src/core/view/editorview'
import type { HoverResult } from '../../src/core/feature/hover'
import type { Diagnostic } from '../../src/core/chrome/ruler'

// diagnosticHoverSource 恒同步,窄化掉 Promise 分支便于断言。
const diagHover = (s: EditorState, pos: number) => diagnosticHoverSource(s, pos, 1) as HoverResult | null

function stateWith(diags: Diagnostic[]) {
    let state = EditorState.create({
        doc: 'const x = foo()\n',
        selection: EditorSelection.single(0),
        extensions: [diagnosticsField],
    })
    state = state.update({ effects: setDiagnostics.of(diags) }).apply()
    return state
}

describe('diagnosticHoverSource —— 命中判定', () => {
    it('pos 在 [from,to] 内且有 message → HoverResult(pos=from, end=to, above)', () => {
        const s = stateWith([{ from: 10, to: 13, severity: 'error', message: '找不到名称 foo', code: 'ts(2304)' }])
        const r = diagHover(s, 11)
        expect(r).not.toBeNull()
        expect(r!.pos).toBe(10)
        expect(r!.end).toBe(13)
        expect(r!.above).toBe(true)
    })

    it('pos 越界 → null', () => {
        const s = stateWith([{ from: 10, to: 13, severity: 'error', message: 'x' }])
        expect(diagHover(s, 3)).toBeNull()
    })

    it('命中但无 message → null', () => {
        const s = stateWith([{ from: 10, to: 13, severity: 'warning' }])
        expect(diagHover(s, 11)).toBeNull()
    })

    it('多诊断重叠取首个命中', () => {
        const s = stateWith([
            { from: 0, to: 15, severity: 'info', message: '外层' },
            { from: 10, to: 13, severity: 'error', message: '内层' },
        ])
        const r = diagHover(s, 11)
        expect(r!.end).toBe(15) // find 返数组首个命中,即外层
    })

    it('create() 产出诊断卡 DOM 契约(msg + code;没有严重度图标,对齐 Monaco marker hover)', () => {
        const s = stateWith([{ from: 10, to: 13, severity: 'error', message: '找不到名称 foo', code: 'ts(2304)' }])
        const dom = diagHover(s, 11)!.create()
        expect(dom.className).toBe('cm-diagnostic-tooltip hover-row-with-copy') // Monaco 0.55 marker hover 行带复制按钮
        expect(dom.querySelector('svg')).toBeNull()
        expect(dom.querySelector('[class*="cm-hover-icon-"]')).toBeNull()
        expect(dom.firstElementChild!.className).toBe('cm-diagnostic-msg')
        expect(dom.querySelector('.cm-diagnostic-msg')!.textContent).toBe('找不到名称 foo')
        expect(dom.querySelector('.cm-diagnostic-code')!.textContent).toBe('ts(2304)')
    })

    it('无 code → 不出 code span', () => {
        const s = stateWith([{ from: 10, to: 13, severity: 'info', message: 'hi' }])
        const dom = diagHover(s, 11)!.create()
        expect(dom.querySelector('.cm-diagnostic-code')).toBeNull()
    })
})

describe('showHover', () => {
    it('光标在诊断上弹出卡片', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'const x = foo()',
                selection: EditorSelection.single(11),
                extensions: [
                    diagnosticsField,
                    hoverSources.of(diagnosticHoverSource),
                ],
            }),
            parent: host,
        })
        view.dispatch(view.state.update({
            effects: setDiagnostics.of([
                { from: 10, to: 13, severity: 'error', message: 'bad' },
            ]),
        }))
        expect(await showHover(view)).toBe(true)
        expect(view.dom.querySelector('[data-cm-kb-hover] .cm-diagnostic-msg')?.textContent).toBe('bad')
        view.destroy()
        host.remove()
    })

    // 浏览器复现 /tmp/lc-hunt/g2/hovdbg2.ts:改完文档马上 ⌘K ⌘I,卡片 100ms 内被 TS 折叠表 / 诊断的纯 effect 事务关掉。
    // Monaco 的 content hover 只在内容变、光标动、滚动、按键、点外面时关。
    it('纯 effect 事务(异步诊断 / 折叠表)不关卡片;改文档、移光标关', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const src = (_s: EditorState, pos: number): HoverResult => ({ pos, create: () => { const d = document.createElement('div'); d.className = 'x-card'; return d } })
        const view = new EditorView({
            state: EditorState.create({ doc: 'const x = foo()', selection: EditorSelection.single(11), extensions: [diagnosticsField, hoverSources.of(src)] }),
            parent: host,
        })
        expect(await showHover(view)).toBe(true)
        view.dispatch(view.state.update({ effects: setDiagnostics.of([{ from: 0, to: 5, severity: 'error', message: 'later' }]) }))
        expect(view.dom.querySelector('.x-card')).not.toBeNull()
        view.dispatch(view.state.update({ selection: EditorSelection.single(3) }))
        expect(view.dom.querySelector('.x-card')).toBeNull()
        expect(await showHover(view)).toBe(true)
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'a' } }))
        expect(view.dom.querySelector('.x-card')).toBeNull()
        view.destroy()
        host.remove()
    })
})

// 用最小 fake DOM 驱动 hoverPosFromPoint 分支。jsdom 无 caretPositionFromPoint,手动挂 stub。
describe('hoverPosFromPoint —— 坐标命中分支', () => {
    function fakeView(opts: {
        caretPosition?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
        caretRange?: (x: number, y: number) => Range | null
        contains?: boolean
        posFromDOM?: () => number
    }) {
        const doc = {
            caretPositionFromPoint: opts.caretPosition,
            caretRangeFromPoint: opts.caretRange,
        } as unknown as Document
        return {
            contentDOM: { ownerDocument: doc, contains: () => opts.contains ?? true } as unknown as HTMLElement,
            posFromDOM: opts.posFromDOM ?? (() => 5),
        } as unknown as EditorView
    }

    it('caretPositionFromPoint → posFromDOM', () => {
        const v = fakeView({ caretPosition: () => ({ offsetNode: document.createTextNode('x'), offset: 2 }), posFromDOM: () => 7 })
        expect(hoverPosFromPoint(v, 1, 1)).toBe(7)
    })

    it('无 caretPositionFromPoint 回退 caretRangeFromPoint', () => {
        const r = { startContainer: document.createTextNode('x'), startOffset: 1 } as unknown as Range
        const v = fakeView({ caretRange: () => r, posFromDOM: () => 3 })
        expect(hoverPosFromPoint(v, 1, 1)).toBe(3)
    })

    it('两种 API 都无 → null', () => {
        const v = fakeView({})
        expect(hoverPosFromPoint(v, 1, 1)).toBeNull()
    })

    it('命中 node 不在 contentDOM 内 → null', () => {
        const v = fakeView({ caretPosition: () => ({ offsetNode: document.createTextNode('x'), offset: 0 }), contains: false })
        expect(hoverPosFromPoint(v, 1, 1)).toBeNull()
    })

    it('posFromDOM 抛 → null', () => {
        const v = fakeView({ caretPosition: () => ({ offsetNode: document.createTextNode('x'), offset: 0 }), posFromDOM: () => { throw new Error('bad') } })
        expect(hoverPosFromPoint(v, 1, 1)).toBeNull()
    })

    it('caretPositionFromPoint 返 null → null', () => {
        const v = fakeView({ caretPosition: () => null })
        expect(hoverPosFromPoint(v, 1, 1)).toBeNull()
    })
})

describe('placeTooltip —— 定位几何边界', () => {
    const editor = { left: 0, top: 0, width: 800, height: 600 }

    it('below 放得下 → 放锚点下方', () => {
        const caret = { left: 100, top: 200, bottom: 220 }
        const { left, top } = placeTooltip(caret, { w: 300, h: 100 }, editor, false)
        expect(left).toBe(100)
        expect(top).toBe(220)
    })

    it('below 溢出底部 → 翻到上方', () => {
        const caret = { left: 100, top: 560, bottom: 580 }
        const { top } = placeTooltip(caret, { w: 300, h: 100 }, editor, false)
        expect(top).toBe(460) // aboveTop = 560 - 100
    })

    it('above 优先且放得下 → 上方', () => {
        const caret = { left: 100, top: 300, bottom: 320 }
        const { top } = placeTooltip(caret, { w: 300, h: 100 }, editor, true)
        expect(top).toBe(200)
    })

    it('above 但上方放不下 → 退回下方', () => {
        const caret = { left: 100, top: 40, bottom: 60 }
        const { top } = placeTooltip(caret, { w: 300, h: 100 }, editor, true)
        expect(top).toBe(60) // aboveTop = -60 < 0 → belowTop
    })

    it('left clamp 右缘', () => {
        const caret = { left: 700, top: 100, bottom: 120 }
        const { left } = placeTooltip(caret, { w: 300, h: 50 }, editor, false)
        expect(left).toBe(800 - 300 - 4)
    })

    it('left clamp 左缘(不为负)', () => {
        const caret = { left: -50, top: 100, bottom: 120 }
        const { left } = placeTooltip(caret, { w: 300, h: 50 }, editor, false)
        expect(left).toBe(0)
    })
})

describe('hoverTooltip', () => {
    it('没有 hover 源：mousemove 不弹卡', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'foo' }),
            parent: host,
        })
        const off = hoverTooltip(view)
        view.contentDOM.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 8, clientY: 8, bubbles: true,
        }))
        await new Promise(r => setTimeout(r, 350))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        off()
        view.destroy()
        host.remove()
    })

    it('mousemove 后弹出诊断卡', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        let state = EditorState.create({
            doc: 'const x = foo()\n',
            extensions: [diagnosticsField, hoverSources.of(diagnosticHoverSource)],
        })
        state = state.update({
            effects: setDiagnostics.of([
                { from: 10, to: 13, severity: 'error', message: '找不到名称 foo' },
            ]),
        }).apply()
        const view = new EditorView({ state, parent: host })
        view.caretCoords = () => ({ left: 20, top: 10, bottom: 24, height: 14 })
        const doc = view.contentDOM.ownerDocument
        const orig = doc.caretPositionFromPoint
        Object.defineProperty(doc, 'caretPositionFromPoint', {
            configurable: true,
            writable: true,
            value: () => ({ offsetNode: view.contentDOM, offset: 0 }),
        })
        const origPos = view.posFromDOM.bind(view)
        view.posFromDOM = () => 11
        const off = hoverTooltip(view)
        view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 12, bubbles: true }))
        await new Promise(r => setTimeout(r, 350))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        expect(view.dom.querySelector('.cm-diagnostic-msg')?.textContent).toBe('找不到名称 foo')
        view.contentDOM.dispatchEvent(new MouseEvent('mouseleave'))
        // Monaco hidingDelay 300
        await new Promise(r => setTimeout(r, 150))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        await new Promise(r => setTimeout(r, 200))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        // 再开一次，滚动立即关
        view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 12, bubbles: true }))
        await new Promise(r => setTimeout(r, 350))
        expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull()
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull()
        off()
        view.posFromDOM = origPos
        Object.defineProperty(doc, 'caretPositionFromPoint', {
            configurable: true,
            writable: true,
            value: orig,
        })
        view.destroy()
        host.remove()
    })
})
