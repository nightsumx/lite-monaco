import { describe, expect, it } from 'vitest'
import { findDiff } from '../../src/core/input/domchange'
import { DOMReader, LineBreakPlaceholder } from '../../src/core/view/domreader'
import { buildTileTree } from '../../src/core/view/buildtile'
import { materialize } from '../../src/core/view/materialize'
import { Rope } from '../../src/core/model/rope'

// CM7 阶段3 纯逻辑层(findDiff 律 + DOMReader 读回)。IME/真选区归 aipeek,不在此。

// findDiff 律:把 diff 应用回 a 必得 b(a.slice(0,from)+b 段+a.slice(toA) === b)。
function applyDiff(a: string, b: string, d: { from: number, toA: number, toB: number }) {
    return a.slice(0, d.from) + b.slice(d.from, d.toB) + a.slice(d.toA)
}

describe('findDiff 律:应用 diff 还原 b', () => {
    const cases: Array<[string, string, string]> = [
        ['中间插入', 'abc', 'abXc'],
        ['末尾插入', 'abc', 'abcd'],
        ['行首插入', 'abc', 'Xabc'],
        ['删除一字', 'abXc', 'abc'],
        ['退格(末删)', 'hello', 'hell'],
        ['替换段', 'foo bar', 'foo BAZ'],
        ['插入换行(占位)', `ab`, `a${LineBreakPlaceholder}b`],
    ]
    for (const [name, a, b] of cases) {
        it(name, () => {
            const d = findDiff(a, b, 0, null)
            expect(d).not.toBeNull()
            expect(applyDiff(a, b, d!)).toBe(b)
        })
    }

    it('无变化 → null', () => {
        expect(findDiff('abc', 'abc', 0, null)).toBeNull()
    })

    it('preferredSide=end 退格锚到末尾仍还原', () => {
        const d = findDiff('aaa', 'aa', 3, 'end')
        expect(d).not.toBeNull()
        expect(applyDiff('aaa', 'aa', d!)).toBe('aa')
    })
})

describe('DOMReader 读回:DOM → 文本(行间占位)', () => {
    const read = (s: string) => {
        const dom = materialize(buildTileTree(Rope.of(s.split('\n')), []))
        const reader = new DOMReader([])
        reader.readLines(dom.children[0] as HTMLElement, dom.children[dom.children.length - 1] as HTMLElement)
        return reader.text
    }
    const ph = (s: string) => s.split('\n').join(LineBreakPlaceholder)

    it('单行', () => {
        expect(read('hello')).toBe('hello')
    })
    it('多行 → 行间占位符', () => {
        expect(read('a\nbb\nccc')).toBe(ph('a\nbb\nccc'))
    })
    it('空行', () => {
        expect(read('a\n\nb')).toBe(ph('a\n\nb'))
    })
})
