import { describe, expect, it } from 'vitest'
import { ChangeSet } from '../../src/core/model/change'
import {
    clearWidthChangeFlag,
    LineWidthMap,
    LineWidthOracle,
    widthChangeFlag,
} from '../../src/core/view/linewidthmap'
import { Rope, Line } from '../../src/core/model/rope'

// CM7 LineWidthMap —— HeightMap 的水平对偶。纯逻辑核测试：maxLineWidth 收敛、applyChanges 标脏/重置、
// 纯算快速路径、toJSON 可监测。DOM 实测路径用伪元素 { offsetWidth } 钉死（不依赖真布局）。

function oracle(fastRender = false): LineWidthOracle {
    const o = new LineWidthOracle(false)
    o.charWidth = 7
    o.fastRender = fastRender
    return o
}

function doc(...lines: string[]): Rope {
    return Rope.of(lines)
}

// 伪元素：jsdom offsetWidth 恒 0，用对象字面量直接给值，模拟 DOM 实测。
describe('lineWidthOracle —— 纯算快速路径', () => {
    it('fastRender 关闭 → 返回 -1（须 DOM 实测）', () => {
        const o = oracle(false)
        o.setDoc(doc('abc'))
        expect(o.fastWidthFor(o.doc.line(1))).toBe(-1)
    })

    it('fastRender + ASCII → charWidth × length', () => {
        const o = oracle(true)
        o.setDoc(doc('abc'))
        expect(o.fastWidthFor(o.doc.line(1))).toBe(21)
    })

    it('fastRender + 非 ASCII → -1', () => {
        const o = oracle(true)
        o.setDoc(doc('你好'))
        expect(o.fastWidthFor(o.doc.line(1))).toBe(-1)
    })

    it('换行模式 → -1（宽度由 viewport 决定，非行内）', () => {
        const o = new LineWidthOracle(true)
        o.charWidth = 7
        o.fastRender = true
        o.setDoc(doc('abc'))
        expect(o.fastWidthFor(o.doc.line(1))).toBe(-1)
    })

    it('refresh: charWidth 变化返回 true', () => {
        const o = oracle(true)
        expect(o.refresh(8, true)).toBe(true)
        expect(o.charWidth).toBe(8)
        expect(o.refresh(8, true)).toBe(false)
    })
})

describe('lineWidthMap.measureLine —— 缓存 + maxLineWidth 增量', () => {
    it('DOM 实测：缓存命中不重读', () => {
        const o = oracle()
        o.setDoc(doc('hello', 'world'))
        const m = new LineWidthMap(o)
        expect(m.measureWidth(1, 50)).toBe(50)
        expect(m.measureWidth(1, 50)).toBe(50)
        expect(m.maxLineWidth).toBe(50)
    })

    it('maxLineWidth 只增不减', () => {
        const o = oracle()
        o.setDoc(doc('a', 'bb', 'ccc'))
        const m = new LineWidthMap(o)
        m.measureWidth(1, 10)
        expect(m.maxLineWidth).toBe(10)
        m.measureWidth(2, 5)
        expect(m.maxLineWidth).toBe(10)
        m.measureWidth(3, 30)
        expect(m.maxLineWidth).toBe(30)
    })

    it('无 DOM 元素 → 返回 -1，不更新', () => {
        const o = oracle()
        o.setDoc(doc('x'))
        const m = new LineWidthMap(o)
        expect(m.measureWidth(1, -1)).toBe(-1)
        expect(m.maxLineWidth).toBe(0)
    })

    it('measureLineFast 命中纯算路径并写缓存', () => {
        const o = oracle(true)
        o.setDoc(doc('abc'))
        const m = new LineWidthMap(o)
        const line: Line = o.doc.line(1)
        expect(m.measureLineFast(line)).toBe(21)
        expect(m.maxLineWidth).toBe(21)
        // 二次：缓存命中
        expect(m.measureLineFast(line)).toBe(21)
    })

    it('measureLineFast 非 ASCII → -1', () => {
        const o = oracle(true)
        o.setDoc(doc('你好'))
        const m = new LineWidthMap(o)
        expect(m.measureLineFast(o.doc.line(1))).toBe(-1)
        expect(m.maxLineWidth).toBe(0)
    })
})

describe('lineWidthMap.measureViewport —— widthChangeFlag', () => {
    it('实测视口内行 → flag 在 max 增长时置位', () => {
        const o = oracle()
        o.setDoc(doc('a', 'bb', 'ccc'))
        const m = new LineWidthMap(o)
        clearWidthChangeFlag()
        m.measureViewport([
            { lineNumber: 1, width: 10 },
            { lineNumber: 2, width: 20 },
        ])
        expect(widthChangeFlag).toBe(true)
        expect(m.maxLineWidth).toBe(20)
    })

    it('max 不变 → flag 不置位', () => {
        const o = oracle()
        o.setDoc(doc('a', 'b', 'c'))
        const m = new LineWidthMap(o)
        m.measureViewport([{ lineNumber: 1, width: 50 }])
        clearWidthChangeFlag()
        m.measureViewport([{ lineNumber: 2, width: 10 }])
        expect(widthChangeFlag).toBe(false)
        expect(m.maxLineWidth).toBe(50)
    })
})

describe('lineWidthMap.applyChanges —— 文档变更', () => {
    it('行数变化 → 清缓存后 seed 全文档下界', () => {
        const o = oracle()
        const oldDoc = doc('aaa', 'bbb')
        o.setDoc(oldDoc)
        const m = new LineWidthMap(o)
        m.measureViewport([
            { lineNumber: 1, width: 50 },
            { lineNumber: 2, width: 60 },
        ])
        expect(m.maxLineWidth).toBe(60)

        const newDoc = doc('aaa')
        const changes = ChangeSet.of([
            { from: 3, to: 7, insert: '' },
        ], oldDoc.length)
        m.applyChanges(changes, oldDoc, newDoc)
        expect(m.maxLineWidth).toBe(21)
        expect(widthChangeFlag).toBe(true)
    })

    it('行数不变 → 标脏变更行（删缓存条目）', () => {
        const o = oracle()
        const oldDoc = doc('aaa', 'bbb', 'ccc')
        o.setDoc(oldDoc)
        const m = new LineWidthMap(o)
        m.measureViewport([
            { lineNumber: 1, width: 10 },
            { lineNumber: 2, width: 20 },
            { lineNumber: 3, width: 30 },
        ])
        expect(m.maxLineWidth).toBe(30)

        const newDoc = doc('aaa', 'XXX', 'ccc')
        const changes = ChangeSet.of([
            { from: 4, to: 7, insert: 'XXX' },
        ], oldDoc.length)
        clearWidthChangeFlag()
        m.applyChanges(changes, oldDoc, newDoc)
        // 行数不变 → 不重置 max，但标脏第 2 行
        expect(m.maxLineWidth).toBe(30)
        // 第 2 行缓存被删，重测会更新
        const w = m.measureWidth(2, 40)
        expect(w).toBe(40)
        expect(m.maxLineWidth).toBe(40)
    })

    it('flush → 全重置', () => {
        const o = oracle()
        o.setDoc(doc('aaa'))
        const m = new LineWidthMap(o)
        m.measureViewport([{ lineNumber: 1, width: 50 }])
        m.flush()
        expect(m.maxLineWidth).toBe(0)
        expect(widthChangeFlag).toBe(true)
    })
})

// 对齐 Monaco：contentWidth 不依赖「哪些行渲染了」。初始/变更时对全文档纯算估算最长行宽，
// 让 maxLineWidth 有全文档下界——虚拟化下最宽行在视口外时，横向滚动条初始也正确。
// 反模式（已判死并回归）：只累积视口实测行 → 最宽行未进视口时 contentWidth 偏小、thumb 宽错。
describe('lineWidthOracle.estimateMaxWidth —— 全文档纯算下界', () => {
    it('返回最长行的估算宽（charWidth × maxLen），不限 ASCII', () => {
        const o = oracle()
        o.setDoc(doc('ab', 'abcdefgh', 'abc'))
        // 最长行 8 字符 × charWidth 7 = 56
        expect(o.estimateMaxWidth()).toBe(56)
    })

    it('非 ASCII 行不进估算(字宽 ≠ UTF-16 长度 × 半角宽,估高了降不下来),等渲染后 DOM 实测;ASCII 行照估', () => {
        const o = oracle()
        o.setDoc(doc('a', '你好世界'))
        expect(o.estimateMaxWidth()).toBe(7)
        o.setDoc(doc('abc', 'a😀b👨‍👩‍👧c🇨🇳d❤️e'))
        expect(o.estimateMaxWidth()).toBe(21)
        expect(o.estimateWidthForLines(2, 2)).toBe(0)
    })

    it('空文档 → 0', () => {
        const o = oracle()
        o.setDoc(doc(''))
        expect(o.estimateMaxWidth()).toBe(0)
    })
})

describe('lineWidthMap.seedEstimate —— 全文档下界注入 maxLineWidth', () => {
    it('seed 后 maxLineWidth ≥ 全文档估算，视口未测也有正确下界', () => {
        const o = oracle()
        o.setDoc(doc('short', 'a'.repeat(100), 'mid'))
        const m = new LineWidthMap(o)
        // 未 seed：只测了视口内短行
        m.measureWidth(1, 35)
        expect(m.maxLineWidth).toBe(35)
        // seed：全文档估算，最长行 100 × 7 = 700
        m.seedEstimate()
        expect(m.maxLineWidth).toBe(700)
    })

    it('seed 不覆盖更大的 DOM 实测值（只增不减）', () => {
        const o = oracle()
        o.setDoc(doc('a'.repeat(50)))
        const m = new LineWidthMap(o)
        m.measureWidth(1, 999) // DOM 实测更宽（如含宽字符）
        m.seedEstimate() // 估算 350 < 999
        expect(m.maxLineWidth).toBe(999)
    })
})

describe('lineWidthMap.contentWidth / getScrollWidth', () => {
    it('contentWidth = maxLineWidth + extraWidth', () => {
        const o = oracle()
        o.setDoc(doc('abc'))
        const m = new LineWidthMap(o)
        m.measureViewport([{ lineNumber: 1, width: 100 }])
        m.extraWidth = 14
        expect(m.contentWidth()).toBe(114)
    })

    it('getScrollWidth: maxLineWidth=0 时下限 1（无横向滚动）', () => {
        const o = oracle()
        o.setDoc(doc(''))
        const m = new LineWidthMap(o)
        expect(m.getScrollWidth()).toBe(1)
    })
})

describe('lineWidthMap 可监测：toJSON', () => {
    it('toJSON 产出 {maxLineWidth, contentWidth, extraWidth, cached}', () => {
        const o = oracle()
        o.setDoc(doc('aaa', 'bbb'))
        const m = new LineWidthMap(o)
        m.measureViewport([
            { lineNumber: 1, width: 30 },
            { lineNumber: 2, width: 40 },
        ])
        m.extraWidth = 5
        const json = m.toJSON()
        expect(json.maxLineWidth).toBe(40)
        expect(json.contentWidth).toBe(45)
        expect(json.extraWidth).toBe(5)
        expect(json.cached).toBe(2)
    })
})

describe('lineWidthMap.applyChanges —— 全文档估值缓存', () => {
    // 估到的最长行没被改就沿用上次的估值(打字不用每键再扫几百~几千行);改了就重估。
    // 同一串编辑,带缓存的和每次都作废缓存(= 以前每次重估)的,maxLineWidth 必须一直一样。
    for (const lines of [300, 6000]) {
        it(`${lines} 行:随机单行编辑,结果和每次全量重估一致`, () => {
            let seed = 11
            const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
            const text = Array.from({ length: lines }, (_, i) => 'x'.repeat(5 + (i * 7919) % 40))
            const mk = () => { const o = oracle(false); const m = new LineWidthMap(o); o.setDoc(Rope.of(text)); m.seedEstimate(); return m }
            const cached = mk(), fresh = mk()
            let cur = Rope.of(text)
            for (let step = 0; step < 300; step++) {
                const n = 1 + Math.floor(rand() * lines)
                const line = cur.line(n)
                const insert = 'y'.repeat(Math.floor(rand() * 60))
                const next = cur.replace(line.from, line.to, Rope.of([insert]))
                const cs = ChangeSet.of([{ from: line.from, to: line.to, insert }], cur.length)
                // 视口里量到的宽:取这一行当前的纯算宽,让「被改的行恰好是已记的最宽行」也出现
                const vp = Math.max(1, n - 3)
                for (const m of [cached, fresh]) m.measureViewport([{ lineNumber: vp, width: 7 * (cur.line(vp).length) }])
                ;(fresh as unknown as { _docEst: unknown })._docEst = null
                cached.applyChanges(cs, cur, next)
                fresh.applyChanges(cs, cur, next)
                expect(cached.maxLineWidth).toBe(fresh.maxLineWidth)
                cur = next
            }
        })
    }
})
