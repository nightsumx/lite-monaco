import { describe, expect, it } from 'vitest'
import { buildTileTree, setBuildHook, type BuildResult } from '../../src/core/view/buildtile'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { Rope } from '../../src/core/model/rope'

// CM7 buildtile —— 文档文本 × 装饰集 → tile 树。这是「编辑器决定渲染成什么」的纯可序列化投影。
//
// 可监测(本测核心):tile 树 toJSON() 出规范 JSON,buildTileTree 是纯函数。
//   用 render() 把树压成一行可读串(line/mark 嵌套用括号,widget 用 ⟨⟩),确切 toBe 钉死;
//   关键结构(mark 嵌套序=Precedence、换行切 mark、widget 插桩)再用 toJSON 精确断言。

const doc = (s: string) => Rope.of(s.split('\n'))

interface J { type: string, text?: string, tag?: string, length?: number, children?: J[] }

// 把 tile 树 toJSON 压成单行串:文本原样;mark→<tag>(…);inline widget→⟨w:len⟩;行→[(…)]。
function render(tile: ReturnType<typeof buildTileTree>): string {
    const j = tile.toJSON() as J
    return j.children!.map(block =>
        block.type === 'line' ? `[${renderInline(block.children!)}]` : `⟪block:${block.length}⟫`,
    ).join('\n')
}

function renderInline(children: readonly J[]): string {
    let out = ''
    for (const j of children) {
        if (j.type === 'text')
            out += j.text
        else if (j.type === 'mark')
            out += `<${j.tag}>(${renderInline(j.children!)})`
        else if (j.type === 'widget')
            out += `⟨w:${j.length}⟩`
    }
    return out
}

// estimatedHeight/lineBreaks 未知的最简 widget,只为占位测 inline/replace 投影。
const stubWidget = {
    eq: () => false,
    compare: () => false,
    get estimatedHeight() { return -1 },
    get lineBreaks() { return 0 },
}

const mark = (cls: string, from: number, to: number) => Decoration.mark({ class: cls }).range(from, to)

describe('buildTileTree —— 文本切行', () => {
    it('无装饰:每行一个 LineTile,文本原样', () => {
        const tree = buildTileTree(doc('hello\nworld'), [])
        expect(render(tree)).toBe('[hello]\n[world]')
    })

    it('空文档:单个空行', () => {
        const tree = buildTileTree(doc(''), [])
        expect(render(tree)).toBe('[]')
    })

    it('末尾空行保留', () => {
        const tree = buildTileTree(doc('a\n'), [])
        expect(render(tree)).toBe('[a]\n[]')
    })

    it('行数=block 数', () => {
        const tree = buildTileTree(doc('a\nb\nc'), [])
        expect(tree.children.length).toBe(3)
    })
})

describe('buildTileTree —— mark 嵌套', () => {
    it('单个 mark 包住一段', () => {
        const set = RangeSet.of([mark('em', 1, 4)], true)
        const tree = buildTileTree(doc('abcde'), [set])
        expect(render(tree)).toBe('[a<span>(bcd)e]')
    })

    it('mark 被换行切开:每行各自包一层', () => {
        const set = RangeSet.of([mark('em', 1, 8)], true)
        const tree = buildTileTree(doc('abc\ndef'), [set])
        expect(render(tree)).toBe('[a<span>(bc)]\n[<span>(def)]')
    })

    it('高优先级(靠前 set)嵌在低优先级内层(Precedence)', () => {
        // CM6 语义:sets 数组靠前 = 高优先级 = 建内层 DOM。set0(b)高于 set1(i) → b 在内。
        const high = RangeSet.of([Decoration.mark({ tagName: 'b' }).range(0, 5)], true)
        const low = RangeSet.of([Decoration.mark({ tagName: 'i' }).range(1, 4)], true)
        const tree = buildTileTree(doc('abcde'), [high, low])
        expect(render(tree)).toBe('[<b>(a)<i>(<b>(bcd))<b>(e)]')
    })

    it('部分重叠的 mark 被对方切开', () => {
        // a=set0 高优先级(内),b=set1 低优先级(外)。重叠段 b 在外包 a。
        const a = RangeSet.of([Decoration.mark({ tagName: 'a' }).range(0, 3)], true)
        const b = RangeSet.of([Decoration.mark({ tagName: 'b' }).range(2, 5)], true)
        const tree = buildTileTree(doc('abcde'), [a, b])
        expect(render(tree)).toBe('[<a>(ab)<b>(<a>(c)de)]')
    })
})

describe('buildTileTree —— widget 装饰', () => {
    it('inline widget 插在文本中', () => {
        const set = RangeSet.of([Decoration.widget({ widget: stubWidget as never, side: 1 }).range(2)], true)
        const tree = buildTileTree(doc('abcd'), [set])
        expect(render(tree)).toBe('[ab⟨w:0⟩cd]')
    })

    it('replace widget 覆盖区间', () => {
        const set = RangeSet.of([Decoration.replace({ widget: stubWidget as never }).range(1, 3)], true)
        const tree = buildTileTree(doc('abcde'), [set])
        expect(render(tree)).toBe('[a⟨w:2⟩de]')
    })
})

describe('buildTileTree —— line 装饰', () => {
    it('line deco 把 class 合进 LineTile.attrs', () => {
        const set = RangeSet.of([Decoration.line({ class: 'active' }).range(0)], true)
        const tree = buildTileTree(doc('abc'), [set])
        const json = tree.toJSON() as { children: { attrs: { class: string } }[] }
        expect(json.children[0].attrs.class).toBe('cm-line active')
    })
})

describe('buildTileTree —— toJSON 规范形', () => {
    it('双射:toJSON 出确定结构', () => {
        const set = RangeSet.of([mark('em', 1, 3)], true)
        const tree = buildTileTree(doc('abcd'), [set])
        expect(tree.toJSON()).toEqual({
            type: 'doc',
            children: [{
                type: 'line',
                attrs: { class: 'cm-line' },
                children: [
                    { type: 'text', text: 'a' },
                    { type: 'mark', tag: 'span', attrs: { class: 'em' }, children: [{ type: 'text', text: 'bc' }] },
                    { type: 'text', text: 'd' },
                ],
            }],
        })
    })
})

describe('buildTileTree 可观测:instrumentation hook', () => {
    it('setBuildHook 回调收到 {tree, from, to, elapsedMs, decorationCount}', () => {
        const results: BuildResult[] = []
        setBuildHook(r => results.push(r))
        const d = doc('hello')
        buildTileTree(d, [RangeSet.of([Decoration.mark({ class: 'kw' }).range(0, 5)])])
        setBuildHook(null)
        expect(results.length).toBe(1)
        expect(results[0].from).toBe(0)
        expect(results[0].to).toBe(5)
        expect(results[0].decorationCount).toBe(1)
        expect(results[0].elapsedMs).toBeGreaterThanOrEqual(0)
        expect(results[0].tree).toBeTruthy()
    })

    it('hook 为 null 时零开销(不抛)', () => {
        setBuildHook(null)
        expect(() => buildTileTree(doc('x'), [])).not.toThrow()
    })
})
