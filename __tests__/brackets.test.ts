import { describe, it, expect } from 'vitest'
import { bracketSpans, isSkipScopes, depthAt } from '../src/core/edit/brackets'

const depths = (text: string, base = 0, skip?: (p: number) => boolean) =>
    bracketSpans(text, base, skip).map(s => s.depth)

describe('bracketSpans', () => {
    it('一对括号:闭括号继承开括号深度', () => {
        expect(bracketSpans('()')).toEqual([
            { from: 0, to: 1, depth: 0 },
            { from: 1, to: 2, depth: 0 },
        ])
    })

    it('嵌套:深度随层递增,闭括号对称回落', () => {
        expect(depths('(())')).toEqual([0, 1, 1, 0])
    })

    it('混合括号种类:统一深度计数', () => {
        expect(depths('([{}])')).toEqual([0, 1, 2, 2, 1, 0])
    })

    it('跳过非括号字符,位置正确', () => {
        expect(bracketSpans('a(b)c')).toEqual([
            { from: 1, to: 2, depth: 0 },
            { from: 3, to: 4, depth: 0 },
        ])
    })

    it('base 偏移叠加到 from', () => {
        expect(bracketSpans('()', 100)).toEqual([
            { from: 100, to: 101, depth: 0 },
            { from: 101, to: 102, depth: 0 },
        ])
    })

    it('不匹配括号:不抛、确定性,栈底闭括号记深度 0 不下溢', () => {
        expect(depths(')(')).toEqual([0, 0])
    })

    it('skip 命中的位置不计为括号', () => {
        // "(" 在 pos1-3 区间内跳过,只剩外层 ( ) 配对
        expect(bracketSpans('("(")', 0, p => p >= 1 && p <= 3)).toEqual([
            { from: 0, to: 1, depth: 0 },
            { from: 4, to: 5, depth: 0 },
        ])
    })
})

// 滚动播种命脉:旧实现每帧重扫「文档开头→视口顶」整段前缀求种子深度(O(n)/帧,深处滚动卡顿元凶)。
// 新实现把这一左折叠拆在行边界:depthByLine[行] 缓存行起始深度,种子 = 从该深度续扫行内零头。
// 折叠在任意点拆分 + 累加器穿线 = 与一次全扫恒等。本测钉死「拆分恒等」+「钳位跨拆分不丢」(本会话回归过一次)。
describe('depthAt 拆分恒等(滚动种子)', () => {
    const full = (t: string) => depthAt(t, t.length, 0, undefined)
    it('任意切点:左段深度续扫右段 == 一次全扫', () => {
        const t = '(a(b)c((d'
        for (let k = 0; k <= t.length; k++) {
            const left = depthAt(t.slice(0, k), k, 0, undefined)
            expect(depthAt(t.slice(k), t.length - k, k, undefined, left)).toBe(full(t))
        }
    })

    it('钳位跨拆分不丢:左段含被钳住的 ),右段从钳后深度续算', () => {
        // "())(":全扫 = ( →1, ) →0, ) →0(钳位), ( →1 ⇒ 末深度 1
        expect(full('())(')).toBe(1)
        // 在第 3 字符后拆:左 "())" → 0(含一次钳位),右 "(" 从 0 续 → 1。与全扫一致
        const left = depthAt('())', 3, 0, undefined)
        expect(left).toBe(0)
        expect(depthAt('(', 1, 3, undefined, left)).toBe(1)
    })
})

describe('isSkipScopes', () => {
    it('字符串引号叶子:栈里有 string.quoted 即 skip(不只看叶子)', () => {
        // shiki 给字符串两端引号的叶子是 punctuation.definition.string.begin,栈里仍有 string.quoted
        expect(isSkipScopes(['source.ts', 'string.quoted.double.ts', 'punctuation.definition.string.begin.ts'])).toBe(true)
    })

    it('字符串体:string.quoted 命中 → skip', () => {
        expect(isSkipScopes(['source.ts', 'string.quoted.double.ts'])).toBe(true)
    })

    it('注释体:comment.* 命中 → skip', () => {
        expect(isSkipScopes(['source.ts', 'comment.line.double-slash.ts'])).toBe(true)
    })

    it('模板串 ${} 内:虽含 string.template,但含 meta.template.expression → 不 skip(是真代码)', () => {
        expect(
            isSkipScopes([
                'source.ts',
                'string.template.ts',
                'meta.template.expression.ts',
                'punctuation.definition.template-expression.begin.ts',
            ]),
        ).toBe(false)
    })

    it('模板串字面段:只有 string.template 无 expression → skip', () => {
        expect(isSkipScopes(['source.ts', 'string.template.ts'])).toBe(true)
    })

    it('纯代码:无 string/comment → 不 skip', () => {
        expect(isSkipScopes(['source.ts', 'meta.var.expr.ts'])).toBe(false)
    })
})
