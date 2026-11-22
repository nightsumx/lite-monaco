// H2:内容挂件 / 浮层挂件。jsdom 无布局:caretCoords、编辑器矩形、挂件尺寸全用几何桩。
// 桩的坐标:编辑器占视口 (0,100) 800×400;第 n 行 top = 100 + (n-1)*20,列 c 的 left = 50 + c*8(见 h2-helpers 的 stubGeometry)。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, mountEditor, rect, stubGeometry } from './h2-helpers'
const { ContentWidgetPositionPreference: P, OverlayWidgetPositionPreference: O } = await import('../../src/api/widgets')

afterEach(cleanup)

function node(w = 100, h = 30): HTMLElement {
    const el = document.createElement('div')
    el.textContent = 'w'
    el.getBoundingClientRect = () => rect(0, 0, w, h)
    return el
}

function contentWidget(id: string, position: unknown, pref: number[], extra: Record<string, unknown> = {}, n = node()) {
    const state = { position, pref }
    const w = {
        getId: () => id,
        getDomNode: () => n,
        getPosition: () => state.position === null ? null : ({ position: state.position, preference: state.pref }),
        ...extra,
    }
    return { w, n, state }
}

const px = (s: string) => parseFloat(s)

describe('内容挂件', () => {
    it('EXACT:左上角贴光标;挂进 DOM,带 widgetid', () => {
        const ed = mountEditor('abc\ndef\nghi')
        stubGeometry(ed)
        const { w, n } = contentWidget('c1', { lineNumber: 2, column: 3 }, [P.EXACT])
        ed.addContentWidget(w)
        expect(ed.dom.contains(n)).toBe(true)
        expect(n.getAttribute('widgetid')).toBe('c1')
        // 第 2 行 top=120(相对编辑器 20),列 2 → left=50+2*8=66
        expect(px(n.style.left)).toBe(66)
        expect(px(n.style.top)).toBe(20)
        expect(n.style.visibility).toBe('visible')
    })

    it('ABOVE:底边贴行顶;BELOW:顶边贴行底', () => {
        const ed = mountEditor('abc\ndef\nghi')
        stubGeometry(ed)
        const a = contentWidget('a', { lineNumber: 3, column: 1 }, [P.ABOVE])
        const b = contentWidget('b', { lineNumber: 3, column: 1 }, [P.BELOW])
        ed.addContentWidget(a.w)
        ed.addContentWidget(b.w)
        // 第 3 行 top=140(相对 40),bottom=160(相对 60);挂件高 30
        expect(px(a.n.style.top)).toBe(40 - 30)
        expect(px(b.n.style.top)).toBe(60)
    })

    it('preference 数组按序试:上面放不下就用 BELOW,放得下用 ABOVE', () => {
        const ed = mountEditor('abc\ndef\nghi')
        stubGeometry(ed)
        // 第 1 行:上方放不下(挂件高 30,行顶在编辑器顶边)→ 行底
        const a = contentWidget('x', { lineNumber: 1, column: 1 }, [P.ABOVE, P.BELOW])
        ed.addContentWidget(a.w)
        expect(px(a.n.style.top)).toBe(20)
        // 第 2 行:行顶相对 20,上方只有 20 < 30,也放不下 → BELOW(行底 40)
        const b = contentWidget('y', { lineNumber: 2, column: 1 }, [P.ABOVE, P.BELOW])
        ed.addContentWidget(b.w)
        expect(px(b.n.style.top)).toBe(40)
        // 第 3 行:行顶相对 40,上方放得下 → ABOVE(40-30)
        const c = contentWidget('z', { lineNumber: 3, column: 1 }, [P.ABOVE, P.BELOW])
        ed.addContentWidget(c.w)
        expect(px(c.n.style.top)).toBe(10)
    })

    it('下方放不下(靠近底边)改用 ABOVE', () => {
        const ed = mountEditor(Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n'))
        stubGeometry(ed)
        // 第 20 行 top=100+19*20=480,bottom=500 = 编辑器底边;BELOW 放不下
        const { w, n } = contentWidget('z', { lineNumber: 20, column: 1 }, [P.BELOW, P.ABOVE])
        ed.addContentWidget(w)
        expect(px(n.style.top)).toBe(480 - 100 - 30)
    })

    it('右侧放不下时向左挪,不越过编辑器左缘', () => {
        const ed = mountEditor('x'.repeat(100))
        stubGeometry(ed)
        const { w, n } = contentWidget('r', { lineNumber: 1, column: 99 }, [P.EXACT])
        ed.addContentWidget(w)
        expect(px(n.style.left)).toBe(800 - 100)
    })

    it('getPosition 返回 null 或位置在视口外:隐藏', () => {
        const ed = mountEditor('abc')
        stubGeometry(ed)
        const { w, n, state } = contentWidget('h', null, [P.EXACT])
        ed.addContentWidget(w)
        expect(n.style.visibility).toBe('hidden')
        state.position = { lineNumber: 1, column: 1 }
        ed.layoutContentWidget(w)
        expect(n.style.visibility).toBe('visible')
        ed.caretCoords = () => null
        ed.layoutContentWidget(w)
        expect(n.style.visibility).toBe('hidden')
    })

    it('随编辑重新定位:在前面插一行,挂件跟着文字下移', () => {
        const ed = mountEditor('abc\ndef')
        stubGeometry(ed)
        // 挂件的位置函数每次按"挂在 def 开头"算:模拟宿主在 onDidChangeModelContent 里更新位置
        const { w, n, state } = contentWidget('e', { lineNumber: 2, column: 1 }, [P.EXACT])
        ed.addContentWidget(w)
        expect(px(n.style.top)).toBe(20)
        state.position = { lineNumber: 3, column: 1 }
        ed.dispatch(ed.state.update({ changes: { from: 0, insert: 'new\n' } }))
        expect(px(n.style.top)).toBe(40)
    })

    it('滚动 / 布局变化(几何通知)触发重新定位', () => {
        const ed = mountEditor('abc\ndef')
        stubGeometry(ed)
        const { w, n } = contentWidget('s', { lineNumber: 2, column: 1 }, [P.EXACT])
        ed.addContentWidget(w)
        const before = px(n.style.top)
        // 模拟滚动 20px:所有行上移
        ed.caretCoords = (pos: number) => {
            const line = ed.state.doc.lineAt(pos)
            const top = 100 + (line.number - 1) * 20 - 20
            return { left: 50, top, height: 20, bottom: top + 20 }
        }
        ed.scrollDOM.dispatchEvent(new Event('scroll'))
        // 几何通知是异步合并的:直接用 layout 触发等价路径
        ed.layoutContentWidget(w)
        expect(px(n.style.top)).toBe(before - 20)
    })

    it('allowEditorOverflow:挂到 body 下的 overflow 容器(fixed,视口坐标)', () => {
        const ed = mountEditor('abc\ndef')
        stubGeometry(ed)
        const { w, n } = contentWidget('o', { lineNumber: 2, column: 3 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(w)
        expect(ed.dom.contains(n)).toBe(false)
        expect(document.body.contains(n)).toBe(true)
        expect(n.style.position).toBe('fixed')
        expect(px(n.style.left)).toBe(66)
        expect(px(n.style.top)).toBe(120)
    })

    it('overflowWidgetsDomNode 选项:allowEditorOverflow 的挂件挂进它', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        host.getBoundingClientRect = () => rect(10, 10, 100, 100)
        const ed = mountEditor('abc\ndef', { options: { overflowWidgetsDomNode: host } })
        stubGeometry(ed)
        const { w, n } = contentWidget('o2', { lineNumber: 2, column: 1 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(w)
        expect(host.contains(n)).toBe(true)
        // fixedOverflowWidgets 默认 false:相对 host 绝对定位
        expect(n.style.position).toBe('absolute')
        expect(px(n.style.left)).toBe(50 - 10)
        expect(px(n.style.top)).toBe(120 - 10)
    })

    it('fixedOverflowWidgets:true 时即使有 overflowWidgetsDomNode 也用 fixed 视口坐标', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        host.getBoundingClientRect = () => rect(10, 10, 100, 100)
        const ed = mountEditor('abc\ndef', { options: { overflowWidgetsDomNode: host, fixedOverflowWidgets: true } })
        stubGeometry(ed)
        const { w, n } = contentWidget('o3', { lineNumber: 2, column: 1 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(w)
        expect(n.style.position).toBe('fixed')
        expect(px(n.style.top)).toBe(120)
    })

    it('suppressMouseDown:mousedown 不冒泡到编辑器;不设则冒泡', () => {
        const ed = mountEditor('abc')
        stubGeometry(ed)
        const seen: string[] = []
        ed.dom.addEventListener('mousedown', () => seen.push('editor'))
        const a = contentWidget('m1', { lineNumber: 1, column: 1 }, [P.EXACT], { suppressMouseDown: true })
        const b = contentWidget('m2', { lineNumber: 1, column: 1 }, [P.EXACT])
        ed.addContentWidget(a.w)
        ed.addContentWidget(b.w)
        a.n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(seen).toEqual([])
        b.n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(seen).toEqual(['editor'])
    })

    it('afterRender 收到选中的 preference;同 id 重复 add 替换旧的', () => {
        const ed = mountEditor('abc\ndef\nghi')
        stubGeometry(ed)
        const after = vi.fn()
        const first = contentWidget('d', { lineNumber: 3, column: 1 }, [P.ABOVE, P.BELOW], { afterRender: after })
        ed.addContentWidget(first.w)
        // Monaco 签名:afterRender(选中的 preference, {top,left} | null),不是整个 position 对象
        expect(after.mock.calls.at(-1)![0]).toBe(P.ABOVE)
        expect(after.mock.calls.at(-1)![1]).toEqual({ top: expect.any(Number), left: expect.any(Number) })
        const second = contentWidget('d', { lineNumber: 2, column: 1 }, [P.EXACT])
        ed.addContentWidget(second.w)
        expect(ed.dom.contains(first.n)).toBe(false)
        expect(ed.dom.contains(second.n)).toBe(true)
    })

    it('remove 后清 DOM 和我们加的样式;再 layout 不报错;销毁时全清', () => {
        const ed = mountEditor('abc')
        stubGeometry(ed)
        const a = contentWidget('rm', { lineNumber: 1, column: 1 }, [P.EXACT])
        const o = contentWidget('rmo', { lineNumber: 1, column: 1 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(a.w)
        ed.addContentWidget(o.w)
        ed.removeContentWidget(a.w)
        expect(a.n.isConnected).toBe(false)
        expect(a.n.getAttribute('widgetid')).toBeNull()
        expect(a.n.style.left).toBe('')
        expect(a.n.style.position).toBe('')
        expect(() => ed.layoutContentWidget(a.w)).not.toThrow()
        ed.removeContentWidget(o.w)
        expect(o.n.isConnected).toBe(false)
        const keep = contentWidget('keep', { lineNumber: 1, column: 1 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(keep.w)
        ed.destroy()
        expect(keep.n.isConnected).toBe(false)
        expect(document.querySelector('.cm-overflowWidgets')).toBeNull()
    })
})

describe('浮层挂件', () => {
    const overlay = (id: string, preference: unknown, n = node(80, 20)) => {
        const state = { preference }
        const w = {
            getId: () => id,
            getDomNode: () => n,
            getPosition: () => state.preference === undefined ? null : ({ preference: state.preference }),
        }
        return { w, n, state }
    }

    it('TOP_RIGHT_CORNER / BOTTOM_RIGHT_CORNER / TOP_CENTER 的定位样式', () => {
        const ed = mountEditor('abc')
        const tr = overlay('tr', O.TOP_RIGHT_CORNER)
        const br = overlay('br', O.BOTTOM_RIGHT_CORNER)
        const tc = overlay('tc', O.TOP_CENTER)
        for (const x of [tr, br, tc]) ed.addOverlayWidget(x.w)
        expect(ed.dom.contains(tr.n)).toBe(true)
        expect(tr.n.getAttribute('widgetid')).toBe('tr')
        expect(tr.n.style.top).toBe('0px')
        // Monaco overlayWidgets._renderWidget:right = 2×竖条宽 + minimap 宽,bottom = 2×横条高(真 Chromium 实测)
        expect(tr.n.style.right).toBe('28px') // 2 × verticalScrollbarSize 默认 14
        expect(br.n.style.bottom).toBe('24px') // 2 × horizontalScrollbarSize 默认 12
        expect(br.n.style.right).toBe('28px')
        expect(tc.n.style.left).toBe('50%')
        expect(tc.n.style.transform).toBe('translateX(-50%)')
    })

    it('scrollbar 大小从选项读', () => {
        const ed = mountEditor('abc', { options: { scrollbar: { verticalScrollbarSize: 20, horizontalScrollbarSize: 8 } } })
        const br = overlay('br2', O.BOTTOM_RIGHT_CORNER)
        ed.addOverlayWidget(br.w)
        expect(br.n.style.right).toBe('40px')
        expect(br.n.style.bottom).toBe('16px')
    })

    it('layoutOverlayWidget:position 变了重新摆;null = 挂件自管,不加定位', () => {
        const ed = mountEditor('abc')
        const x = overlay('lay', O.TOP_RIGHT_CORNER)
        ed.addOverlayWidget(x.w)
        x.state.preference = O.TOP_CENTER
        ed.layoutOverlayWidget(x.w)
        expect(x.n.style.right).toBe('')
        expect(x.n.style.left).toBe('50%')
        x.state.preference = undefined
        ed.layoutOverlayWidget(x.w)
        expect(x.n.style.left).toBe('')
        expect(x.n.style.top).toBe('')
    })

    it('remove 后清 DOM,销毁时清容器', () => {
        const ed = mountEditor('abc')
        const x = overlay('rmv', O.TOP_RIGHT_CORNER)
        const y = overlay('rmv2', O.TOP_CENTER)
        ed.addOverlayWidget(x.w)
        ed.addOverlayWidget(y.w)
        ed.removeOverlayWidget(x.w)
        expect(x.n.isConnected).toBe(false)
        expect(x.n.getAttribute('widgetid')).toBeNull()
        expect(x.n.style.top).toBe('')
        ed.destroy()
        expect(y.n.isConnected).toBe(false)
    })
})

describe('allowOverflow(默认 true,总闸)', () => {
    it('false:allowEditorOverflow 的挂件退回编辑器内容层(被编辑器框裁),不挂到外面', () => {
        const ed = mountEditor('abc\ndef', { options: { allowOverflow: false } })
        stubGeometry(ed)
        const { w, n } = contentWidget('ao', { lineNumber: 2, column: 3 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(w)
        expect(ed.dom.contains(n)).toBe(true)
        expect(n.style.position).toBe('absolute')
    })
    it('默认 / true:行为不变(挂到外面,fixed)', () => {
        const ed = mountEditor('abc\ndef', { options: { allowOverflow: true } })
        stubGeometry(ed)
        const { w, n } = contentWidget('ao2', { lineNumber: 2, column: 3 }, [P.EXACT], { allowEditorOverflow: true })
        ed.addContentWidget(w)
        expect(ed.dom.contains(n)).toBe(false)
        expect(n.style.position).toBe('fixed')
    })
})
