import { describe, expect, it } from 'vitest'
import { autoDirection, BidiSpan, computeOrder, Direction, isolatesEq, movedOver, moveVisually, trivialOrder } from '../../src/core/model/bidi'
import { Rope } from '../../src/core/model/rope'
import { EditorSelection } from '../../src/core/model/selection'

// CM7 BiDi —— Unicode 双向排序(UAX#9)。逐行港接 CM6 view/bidi.ts。
//
// 可监测(本测核心):computeOrder 把一行投影成 BidiSpan[](视觉顺序的方向段划分);
//   把 span 序列「按视觉顺序取每段字符」拼回,就是该行的视觉呈现串——这条「逻辑串→视觉串」
//   投影是 bidi 的全部语义,用确切串 toBe 钉死。moveVisually 的 movedOver 是另一观测点。

const LTR = Direction.LTR
const RTL = Direction.RTL

// 按视觉顺序渲染:order 已是视觉次序的段;RTL 段内字符再反转。结果 = 屏幕从左到右看到的串。
function visual(line: string, order: readonly BidiSpan[]) {
    let out = ''
    for (const span of order) {
        const seg = line.slice(span.from, span.to)
        out += span.dir === RTL ? [...seg].reverse().join('') : seg
    }
    return out
}

// 一些 RTL 字符(希伯来 aleph/bet/gimel)与 Arabic。用真码点,测才碰到 charType 表。
const heb = 'אבג' // אבג

describe('computeOrder —— 逻辑串投影成视觉段', () => {
    it('纯 ASCII LTR 走 trivialOrder 捷径:单段 level 0', () => {
        const order = computeOrder('hello', LTR, [])
        expect(order.length).toBe(1)
        expect(order[0].from).toBe(0)
        expect(order[0].to).toBe(5)
        expect(order[0].level).toBe(0)
    })

    it('空行:单零宽段,方向取基方向 level', () => {
        expect(computeOrder('', LTR, [])[0].level).toBe(0)
        expect(computeOrder('', RTL, [])[0].level).toBe(1)
    })

    it('纯希伯来 + RTL 基向:整段 level 1,视觉反转', () => {
        const order = computeOrder(heb, RTL, [])
        expect(visual(heb, order)).toBe([...heb].reverse().join(''))
    })

    it('lTR 文本里嵌希伯来:拉丁段保序、希伯来段反转(经典 bidi)', () => {
        // "a" + אבג + "b" → 视觉:a + גבא + b
        const line = `a${heb}b`
        const order = computeOrder(line, LTR, [])
        expect(visual(line, order)).toBe(`a${[...heb].reverse().join('')}b`)
    })

    it('span 段按视觉顺序覆盖整行(逻辑位置无遗漏无重叠)', () => {
        const line = `a${heb}b`
        const order = computeOrder(line, LTR, [])
        // 收集每段覆盖的逻辑区间,按逻辑起点排序后应恰好平铺 [0,line.length]。
        const ranges = order.map(s => [s.from, s.to]).sort((x, y) => x[0] - y[0])
        let pos = 0
        for (const [from, to] of ranges) {
            expect(from).toBe(pos)
            pos = to
        }
        expect(pos).toBe(line.length)
    })
})

describe('bidiSpan —— 段查询原语', () => {
    it('find 在多段里按 level/assoc 命中', () => {
        const order = computeOrder(`a${heb}b`, LTR, [])
        // 位置 0 落在首个拉丁段。
        expect(order[BidiSpan.find(order, 0, -1, 0)].from).toBe(0)
    })

    it('dir 由 level 奇偶决定', () => {
        expect(new BidiSpan(0, 3, 0).dir).toBe(LTR)
        expect(new BidiSpan(0, 3, 1).dir).toBe(RTL)
    })
})

describe('trivialOrder / autoDirection / isolatesEq', () => {
    it('trivialOrder:整行单 LTR 段', () => {
        const o = trivialOrder(7)
        expect(o.length).toBe(1)
        expect(o[0].to).toBe(7)
        expect(o[0].level).toBe(0)
    })

    it('autoDirection:首个强字符定向', () => {
        expect(autoDirection('abc', 0, 3)).toBe(LTR)
        expect(autoDirection(heb, 0, 3)).toBe(RTL)
        expect(autoDirection('  abc', 0, 5)).toBe(LTR)
    })

    it('isolatesEq:结构相等判定', () => {
        const a = [{ from: 0, to: 2, direction: LTR, inner: [] }]
        const b = [{ from: 0, to: 2, direction: LTR, inner: [] }]
        const c = [{ from: 0, to: 3, direction: LTR, inner: [] }]
        expect(isolatesEq(a, b)).toBe(true)
        expect(isolatesEq(a, c)).toBe(false)
    })
})

describe('moveVisually —— 纯视觉光标移动 + movedOver 观测点', () => {
    it('lTR 行内逐字符前进,movedOver 记录跨过的字符', () => {
        const doc = Rope.of(['hello'])
        const line = doc.line(1)
        const order = computeOrder(line.text, LTR, [])
        const next = moveVisually(line, order, LTR, EditorSelection.cursor(0), true)
        expect(next?.head).toBe(1)
        expect(movedOver).toBe('h')
    })

    it('行首逆向移动返回 null(无更多段)', () => {
        const doc = Rope.of(['hi'])
        const line = doc.line(1)
        const order = computeOrder(line.text, LTR, [])
        const prev = moveVisually(line, order, LTR, EditorSelection.cursor(0), false)
        expect(prev).toBe(null)
    })

    it('LTR 行内希伯来段：视觉前进跨过 RTL 簇', () => {
        const doc = Rope.of([`a${heb}b`])
        const line = doc.line(1)
        const order = computeOrder(line.text, LTR, [])
        const next = moveVisually(line, order, LTR, EditorSelection.cursor(1), true)
        expect(next).not.toBeNull()
        expect(next!.head).not.toBe(1)
        expect(movedOver.length).toBeGreaterThan(0)
    })
})
