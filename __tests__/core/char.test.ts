import { describe, expect, it } from 'vitest'
import { codePointAt, codePointSize, findClusterBreak, fromCodePoint } from '../../src/core/model/char'

// CM7 字符原语 —— 码点读写(surrogate pair 拼合)是纯算法,输入层(emoji/代理对删除、
// IME、字素簇移动)直接依赖。字素簇边界委托 @marijn/find-cluster-break,只做 smoke。

describe('codePointAt', () => {
    it('BMP 单元:返回码点本身', () => {
        expect(codePointAt('a', 0)).toBe(0x61)
        expect(codePointAt('中', 0)).toBe(0x4E2D)
    })
    it('代理对高位起点:拼成完整码点', () => {
        expect(codePointAt('😀', 0)).toBe(0x1F600)
    })
    it('高位在串尾(无低位):降级返回 charCodeAt', () => {
        const loneHigh = '\uD83D' // 😀 的高代理,单独
        expect(codePointAt(loneHigh, 0)).toBe(0xD83D)
    })
    it('高位后不是低位:降级返回高位本身', () => {
        expect(codePointAt('\uD83Da', 0)).toBe(0xD83D)
    })
    it('从代理对低位读:返回低位码值(非完整码点)', () => {
        expect(codePointAt('😀', 1)).toBe(0xDE00) // 低代理本身
    })
})

describe('fromCodePoint', () => {
    it('BMP(≤0xFFFF):单字符', () => {
        expect(fromCodePoint(0x61)).toBe('a')
        expect(fromCodePoint(0xFFFF)).toBe('￿')
    })
    it('跨界(≥0x10000):拆成代理对', () => {
        expect(fromCodePoint(0x1F600)).toBe('😀')
        expect(fromCodePoint(0x10000).length).toBe(2)
    })
})

describe('codePointSize', () => {
    it('BMP → 1,补充平面 → 2(0xFFFF/0x10000 分界)', () => {
        expect(codePointSize(0x61)).toBe(1)
        expect(codePointSize(0xFFFF)).toBe(1)
        expect(codePointSize(0x10000)).toBe(2)
        expect(codePointSize(0x1F600)).toBe(2)
    })
})

describe('codePointAt / fromCodePoint 往返律', () => {
    for (const ch of ['a', 'Z', '中', '😀', '🇨🇳'.slice(0, 2)]) {
        it(`fromCodePoint(codePointAt) 恒等: ${JSON.stringify(ch)}`, () => {
            expect(fromCodePoint(codePointAt(ch, 0))).toBe(ch)
        })
    }
})

describe('findClusterBreak smoke(委托 @marijn,不重测上游)', () => {
    it('emoji 作为整字素簇跨过', () => {
        expect(findClusterBreak('😀x', 0)).toBe(2) // 跳过整个代理对
    })
    it('ascii 单字符前进 1', () => {
        expect(findClusterBreak('ab', 0)).toBe(1)
    })
})

describe('第四轮·块B:韩文 jamo 簇(UAX#29 GB6–GB8,对齐 Monaco 一次走过整个音节)', () => {
    const nfd = '한' // ᄒ + ᅡ + ᆫ = 한
    it('L+V+T 前进 / 后退各一步走完', () => {
        expect(findClusterBreak(nfd, 0, true)).toBe(3)
        expect(findClusterBreak(nfd, 3, false)).toBe(0)
        expect(findClusterBreak(nfd + nfd, 3, true)).toBe(6)
        expect(findClusterBreak(nfd + nfd, 6, false)).toBe(3)
    })
    it('LV 音节(가)+ T 并簇;LVT(각)后接 V 不并', () => {
        expect(findClusterBreak('각', 0, true)).toBe(2)
        expect(findClusterBreak('각ᅡ', 0, true)).toBe(1)
    })
    it('不影响拉丁 / CJK', () => {
        expect(findClusterBreak('ab', 0, true)).toBe(1)
        expect(findClusterBreak('中文', 2, false)).toBe(1)
    })
})
