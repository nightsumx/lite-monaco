import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { placeCompletionWidget } from '../../src/core/feature/suggestwidget'
import { mountSuggest, cleanupSuggest, fixedProvider, type SuggestRig } from './_suggest-harness'

// 钉死补全弹层几何:列表顶 = caret 行底(+gap),绝不能吸到容器/窗口顶。
// 回归:真页 caret@455 而 list@196(editor.top+4) 的吸顶 bug。

describe('placeCompletionWidget 纯函数契约', () => {
    const win = { left: 0, top: 0, right: 1440, bottom: 900 }

    it('下方够: top = caret.bottom(实测 Monaco 无间隙)', () => {
        const p = placeCompletionWidget(
            { left: 200, top: 300, bottom: 318 },
            { w: 240, h: 200 },
            win,
        )
        expect(p.top).toBe(318)
        expect(p.left).toBe(200)
        expect(p.height).toBe(200)
    })

    it('回归: caret 中下 + 列表 280 高 → 仍贴行底,不吸顶', () => {
        // 真页数据: editor≈(0,192)-(w,710), caret top=455 bottom=470, listH=280
        // 旧逻辑: below+h 越出 editor.bottom → above 也不够整表 → top=editor.top+4=196
        const p = placeCompletionWidget(
            { left: 1394, top: 455, bottom: 470 },
            { w: 320, h: 280 },
            win, // 用 window,允许越出 editor 盒
        )
        expect(p.top).toBe(470)
        expect(p.top).toBeGreaterThan(400) // 绝不是 ~196
    })

    it('下方会整表越出 window 底且上方够:翻到行上', () => {
        const p = placeCompletionWidget(
            { left: 100, top: 700, bottom: 718 },
            { w: 200, h: 250 },
            win,
        )
        // 下方 182 < 250 且上方 698 更大 → 上:列表底 = caret.top - 2
        expect(p.top).toBe(448)
        expect(p.above).toBe(true)
    })

    it('水平:越出右缘时左移,不丢 left=caret 意图到负值', () => {
        const p = placeCompletionWidget(
            { left: 1400, top: 100, bottom: 118 },
            { w: 300, h: 100 },
            { left: 0, top: 0, right: 1440, bottom: 900 },
        )
        expect(p.left + 300).toBeLessThanOrEqual(1440 - 4)
        expect(p.left).toBeGreaterThanOrEqual(4)
    })

    it('上下都放不下整表:取空间大的一侧并缩短高度,不越出 bounds(Monaco suggestWidget._layout)', () => {
        // 下方 64 > 上方 18 → 下,高度缩到 64
        const p = placeCompletionWidget(
            { left: 10, top: 20, bottom: 36 },
            { w: 200, h: 800 },
            { left: 0, top: 0, right: 400, bottom: 100 },
        )
        expect(p.above).toBe(false)
        expect(p.top).toBe(36)
        expect(p.top + p.height).toBeLessThanOrEqual(100)
        // 靠编辑器底:上方大 → 上,高度缩到上方空间,列表底贴 caret.top-2
        const q = placeCompletionWidget(
            { left: 10, top: 680, bottom: 700 },
            { w: 430, h: 242 },
            { left: 0, top: 500, right: 1440, bottom: 710 },
        )
        expect(q.above).toBe(true)
        expect(q.top).toBeGreaterThanOrEqual(500)
        expect(q.top + q.height).toBe(678)
    })

    it('编辑器底下方空间不够整表 → 翻上(列表不越出编辑器底,对照 Monaco 实测 caret@680 → 列表 436..678)', () => {
        const q = placeCompletionWidget(
            { left: 106, top: 680, bottom: 700 },
            { w: 430, h: 242 },
            { left: 0, top: 182, right: 1600, bottom: 700 },
        )
        expect(q).toEqual({ left: 106, top: 436, height: 242, above: true })
    })

    it('caret 贴左缘：left 夹到 bounds.left+4', () => {
        const p = placeCompletionWidget(
            { left: -40, top: 100, bottom: 118 },
            { w: 200, h: 80 },
            { left: 0, top: 0, right: 400, bottom: 900 },
        )
        expect(p.left).toBe(4)
    })
})

describe('suggestOverlay 用 caretCoords 写 style.top', () => {
    let rig: SuggestRig
    // 可控的假 caret 几何
    let fakeCaret: { left: number, top: number, height: number, bottom: number } | null

    beforeEach(() => {
        rig = mountSuggest({ doc: 'line0\nline1\nline2\nfun', providers: [['plaintext', fixedProvider(['function', 'funky'])]] })
        // 给 host 一个非零布局盒,避免全 0
        rig.host.style.cssText = 'position:fixed;left:100px;top:200px;width:600px;height:400px'
        fakeCaret = { left: 250, top: 480, height: 16, bottom: 496 }
        // stub caretCoords
        rig.v.caretCoords = (_pos: number) => {
            if (fakeCaret) return { ...fakeCaret }
            return null
        }
    })

    afterEach(() => {
        cleanupSuggest()
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
    })
    const frames = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const open = async () => { rig.trigger(); await rig.waitOpen(); await frames() }

    it('打开补全后 list.style.top ≈ fakeCaret.bottom+2', async () => {
        await open()
        const list = document.body.querySelector('.cm-completionList') as HTMLElement | null
        expect(list).toBeTruthy()
        expect(list!.style.position).toBe('fixed')
        const top = parseFloat(list!.style.top)
        expect(top).toBe(496)
        expect(top).toBeGreaterThan(400)
    })

    it('caret 下移后 scroll/reposition 跟随,不留在旧顶', async () => {
        // 用窗口中部坐标,避免 listH 触发「翻到行上」
        fakeCaret = { left: 250, top: 300, height: 16, bottom: 316 }
        await open()
        const list = document.body.querySelector('.cm-completionList') as HTMLElement
        const top1 = parseFloat(list.style.top)
        expect(top1).toBe(316)
        fakeCaret = { left: 250, top: 420, height: 16, bottom: 436 }
        rig.v.scrollDOM.dispatchEvent(new Event('scroll'))
        await frames()
        const top2 = parseFloat(list.style.top)
        expect(top2).toBe(436)
        expect(top2).toBeGreaterThan(top1)
    })

    it('caretCoords 返回 null 时不把 top 写成接近 0 的可见吸顶(保持 hidden 或不错误可见)', async () => {
        fakeCaret = null
        await open()
        const list = document.body.querySelector('.cm-completionList') as HTMLElement | null
        // 无坐标:要么还没有 list,要么 visibility hidden,要么 top 未设成吸顶假象
        if (list && list.style.visibility !== 'hidden' && list.style.top) {
            // 若仍显示,top 不应是「窗口顶附近的假成功」——无 caret 时不应写 top
            // 当前实现: null 直接 return,可能保留上次;首次则无 top
            expect(list.style.top === '' || parseFloat(list.style.top) > 50).toBe(true)
        }
    })
})
