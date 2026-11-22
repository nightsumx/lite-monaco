import { describe, expect, it } from 'vitest'
import { LineWidthMap, LineWidthOracle } from '../../src/core/view/linewidthmap'
import { Rope } from '../../src/core/model/rope'

// browser-diff 30-whitespace/fontFamily-serif:比例字体(Georgia)下 lite 按「字数 × 字宽」给了没渲染的行一个宽度下界
//(content.width 184,Monaco 163)。下界只增不减,最长的行在比例字体里不一定最宽 → 横向滚动条永远多一截。比例字体不估。
describe('没渲染的行的宽度估算只用于等宽字体', () => {
    const mk = (mono: boolean) => {
        const o = new LineWidthOracle(false)
        o.charWidth = 7
        o.canEstimate = () => mono
        o.setDoc(Rope.of(['ab', 'abcdefghij', 'abc']))
        const m = new LineWidthMap(o)
        m.seedEstimate()
        return m
    }
    it('等宽:全文最长行 × 字宽', () => expect(mk(true).maxLineWidth).toBe(70))
    it('比例字体:不估,maxLineWidth 等渲染后实测', () => expect(mk(false).maxLineWidth).toBe(0))
    it('比例字体:编辑时脏行的估算也不抬下界', () => {
        const m = mk(false)
        m.seedEstimate(1, 3)
        expect(m.maxLineWidth).toBe(0)
    })
    it('比例字体:渲染后实测照常进 maxLineWidth', () => {
        const m = mk(false)
        m.measureWidth(2, 61)
        expect(m.maxLineWidth).toBe(61)
    })
})
