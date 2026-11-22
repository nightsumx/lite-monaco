import { describe, expect, it } from 'vitest'
import { checkInvariant, roundtrip } from '../helpers/laws'
import { Rope } from '../../src/core/model/rope'

// CM7 rope —— TDD 第一支柱。CM6 text.ts 是坑知识参照,代码全新,内建可监测(toJSON/fromJSON)。
// 测试分两类(见 CM7-DESIGN §6.5):
//   law/roundtrip —— 对所有输入成立的代数律 + 序列化双射(=可监测公理)
//   fixture 快照 —— 具体回归点(放 __fixtures__,后续补)

describe('Rope 构造与基本量', () => {
    it('单行', () => {
        const r = Rope.of(['hello'])
        expect(r.length).toBe(5)
        expect(r.lines).toBe(1)
        expect(r.toString()).toBe('hello')
    })

    it('多行:length 含换行符,lines 为行数', () => {
        const r = Rope.of(['ab', 'cd', 'e'])
        expect(r.toString()).toBe('ab\ncd\ne')
        expect(r.length).toBe(7) // 2 + 1 + 2 + 1 + 1
        expect(r.lines).toBe(3)
    })

    it('空文档 = 单空行', () => {
        const r = Rope.of([''])
        expect(r.length).toBe(0)
        expect(r.lines).toBe(1)
        expect(r.toString()).toBe('')
    })
})

describe('Rope.line / lineAt', () => {
    const r = Rope.of(['ab', 'cd', 'e'])
    it('line(n) 取第 n 行(1-based)', () => {
        expect(r.line(1)).toMatchObject({ from: 0, to: 2, number: 1, text: 'ab' })
        expect(r.line(2)).toMatchObject({ from: 3, to: 5, number: 2, text: 'cd' })
        expect(r.line(3)).toMatchObject({ from: 6, to: 7, number: 3, text: 'e' })
    })
    it('lineAt(pos) 取 pos 所在行', () => {
        expect(r.lineAt(0).number).toBe(1)
        expect(r.lineAt(4).number).toBe(2)
        expect(r.lineAt(7).number).toBe(3) // 末尾归末行
    })
    it('越界抛错', () => {
        expect(() => r.line(0)).toThrow()
        expect(() => r.line(4)).toThrow()
        expect(() => r.lineAt(-1)).toThrow()
        expect(() => r.lineAt(8)).toThrow()
    })
})

describe('Rope.replace —— 编辑原语', () => {
    it('中间替换', () => {
        expect(Rope.of(['hello']).replace(0, 5, Rope.of([' world'])).toString()).toBe(' world')
    })
    it('插入(from===to)', () => {
        expect(Rope.of(['hello']).replace(5, 5, Rope.of([' world'])).toString()).toBe('hello world')
    })
    it('删除(空替换)', () => {
        expect(Rope.of(['hello world']).replace(5, 11, Rope.of([''])).toString()).toBe('hello')
    })
    it('跨行替换', () => {
        expect(Rope.of(['ab', 'cd', 'ef']).replace(1, 7, Rope.of(['X'])).toString()).toBe('aXf')
    })

    it('五千行：行号↔文本仍对；改中间一行不搅乱首尾', () => {
        const n = 5000
        const r = Rope.of(Array.from({ length: n }, (_, i) => `L${i}`))
        expect(r.lines).toBe(n)
        expect(r.line(1).text).toBe('L0')
        expect(r.line(n).text).toBe(`L${n - 1}`)
        expect(r.lineAt(r.line(2500).from).number).toBe(2500)
        const mid = r.line(2500)
        const r2 = r.replace(mid.from, mid.to, Rope.of(['MID']))
        expect(r2.lines).toBe(n)
        expect(r2.line(2500).text).toBe('MID')
        expect(r2.line(1).text).toBe('L0')
        expect(r2.line(n).text).toBe(`L${n - 1}`)
    })
})

describe('Rope.sliceString', () => {
    const r = Rope.of(['ab', 'cd', 'e'])
    it('取子串(含换行)', () => {
        expect(r.sliceString(0, 5)).toBe('ab\ncd')
        expect(r.sliceString(1, 4)).toBe('b\nc')
        expect(r.sliceString(3)).toBe('cd\ne')
    })
})

describe('Rope 代数律(对所有输入成立)', () => {
    // 插入空 = 恒等
    it('replace(p,p,empty) === 原文档', () => {
        expect(checkInvariant(
            (s: string, p: number) => Rope.of([s]).replace(p, p, Rope.of([''])).toString(),
            (out, s) => out === s,
            ['hello', 2],
        )).toBe(true)
    })
    // 全选替换 = 新内容
    it('replace(0,len,x) === x', () => {
        expect(checkInvariant(
            (s: string, x: string) => Rope.of([s]).replace(0, s.length, Rope.of([x])).toString(),
            (out, _s, x) => out === x,
            ['hello', 'world'],
        )).toBe(true)
    })
    // 长度守恒:replace 后 length 变化 = 插入长 - 删除长
    it('length 守恒', () => {
        expect(checkInvariant(
            (s: string, from: number, to: number, x: string) =>
                Rope.of([s]).replace(from, to, Rope.of([x])).length,
            (out, s, from, to, x) => out === s.length - (to - from) + x.length,
            ['hello world', 2, 7, 'XY'],
        )).toBe(true)
    })
})

describe('Rope 可监测公理:序列化双射', () => {
    // 这条 roundtrip 就是"可监测"公理本身的验收 —— toJSON/fromJSON 必须无损往返。
    // x = 规范 JSON(string[] 行数组),law 比对 decode(encode(x)) deepEqual x,
    // 即 toJSON(fromJSON(json)) === json,在规范形上闭合,不碰 B+树内部结构。
    roundtrip<[string[]], Rope>(
        'rope-json',
        json => Rope.fromJSON(json),
        rope => rope.toJSON(),
        {
            inputs: [
                [['']],
                [['hello']],
                [['ab', 'cd', 'e']],
                [['', '', '']],
            ],
        },
    )
})

// 大文档:验证分树后行为不变(B+树正确性的最小钉)
describe('Rope 大文档', () => {
    it('100 行往返一致', () => {
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
        const r = Rope.of(lines)
        expect(r.lines).toBe(100)
        expect(r.line(50).text).toBe('line 49')
        expect(r.toJSON()).toEqual(lines)
    })
})
