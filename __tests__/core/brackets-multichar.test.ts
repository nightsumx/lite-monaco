// 多字符括号(begin/end、if/fi、(* *)、<!-- -->)走实时路径:匹配高亮 / 彩虹括号 / Go to Bracket / Select to Bracket /
// Remove Brackets / enclosingBrackets,以及大文档上不扫全文。
// 真值:Monaco BracketTokens 的词法(src/api/bracketpairs.ts 同一条正则):长的优先、大小写不敏感、以字母起止的括号要词边界
// (endpoint 不是 end,diff 里的 if 不是 if)。括号 token 的范围是 [起,止),光标落在 token 内部 / 两端都算「贴着」(Range.containsPosition)。
import { describe, expect, it } from 'vitest'
import { EditorState, type StateCommand, type Transaction } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import {
    bracketsConfig, bracketSpans, bracketTable, colorizedBracketTable, enclosingBracketPair, enclosingBrackets, jumpToBracket,
    electricAction, electricCharacters, makeBracketTable, matchBracketAt, matchBracketPair, removeBrackets, selectToBracket, selectToBracketWith, setBracketSkipSource,
} from '../../src/core/edit/brackets'
import { bracketMatchingDecorations } from '../../src/core/feature/selectionlayer'
import { bracketColorDecorations } from '../../src/core/feature/bracketcolor'
import { setLanguageConfiguration } from '../../src/api/languages'
import type { ScopedShiki } from '../../src/core/view/tokens'
import { parse } from './f5-replay'
import { mount } from './h1-helpers'

type Pairs = readonly (readonly [string, string])[]
const BE: Pairs = [['begin', 'end']]
const MIX: Pairs = [['begin', 'end'], ['(', ')'], ['{', '}']]
const OCAML: Pairs = [['(*', '*)'], ['(', ')']]
const HTML: Pairs = [['<!--', '-->'], ['<', '>']]
const FI: Pairs = [['if', 'fi']]

const stateOf = (spec: string, pairs: Pairs, colorized?: Pairs) => {
    const { doc, sels } = parse(spec)
    return EditorState.create({
        doc,
        ...(sels.length ? { selection: EditorSelection.create(sels.map(([a, h]) => EditorSelection.range(a, h)), 0) } : {}),
        extensions: [EditorState.allowMultipleSelections.of(true), bracketsConfig.of({ brackets: pairs, colorized })],
    })
}
/** 光标(‸)位置 */
const caret = (spec: string) => parse(spec).sels[0][1]

describe('括号表:多字符括号不再被丢掉', () => {
    it('begin/end 进表,大小写不敏感(键小写),种类号开闭同号', () => {
        const t = makeBracketTable([['BEGIN', 'End'], ['(', ')']])
        expect(t.open.begin).toBe('end')
        expect(t.close.end).toBe('begin')
        expect(t.tok.begin >> 1).toBe(t.tok.end >> 1)
        expect(t.tok.begin & 1).toBe(1)
        expect(t.tok.end & 1).toBe(0)
        expect(t.tok['('] >> 1).not.toBe(t.tok.begin >> 1)
    })
    it('共用闭括号的几个开括号并成一类(def/begin/if … end)', () => {
        const t = makeBracketTable([['begin', 'end'], ['def', 'end']])
        expect(t.tok.begin >> 1).toBe(t.tok.def >> 1)
        expect(t.tok.end >> 1).toBe(t.tok.def >> 1)
    })
    it('全是单字符的表不带正则(逐字符快路径)', () => {
        expect(makeBracketTable([['(', ')'], ['<', '>']]).re).toBeNull()
        expect(makeBracketTable(MIX).re).not.toBeNull()
    })
})

describe('matchBracketAt / matchBracketPair:begin/end', () => {
    const pair = (spec: string, pairs: Pairs = BE) => {
        const s = stateOf(spec, pairs)
        return matchBracketPair(s.doc.toString(), 0, caret(spec), undefined, bracketTable(s))
    }
    it('光标贴着开括号两端 / 内部 → 配到闭括号', () => {
        const want = { open: 0, openEnd: 5, close: 8, closeEnd: 11 }
        expect(pair('‸begin x end')).toEqual(want)
        expect(pair('be‸gin x end')).toEqual(want)
        expect(pair('begin‸ x end')).toEqual(want)
    })
    it('光标贴着闭括号两端 / 内部 → 配到开括号', () => {
        const want = { open: 0, openEnd: 5, close: 8, closeEnd: 11 }
        expect(pair('begin x ‸end')).toEqual(want)
        expect(pair('begin x e‸nd')).toEqual(want)
        expect(pair('begin x end‸')).toEqual(want)
    })
    it('不贴括号 = 没有', () => {
        expect(pair('begin ‸x end')).toBeNull()
    })
    it('大小写不敏感', () => {
        expect(pair('‸BEGIN x End')).toEqual({ open: 0, openEnd: 5, close: 8, closeEnd: 11 })
    })
    it('词边界:endpoint / prebegin / begins 不是括号', () => {
        // begin 配最后那个 end,不是 endpoint 里的 end
        const spec = '‸begin endpoint end'
        expect(pair(spec)).toEqual({ open: 0, openEnd: 5, close: 15, closeEnd: 18 })
        expect(pair('prebegin x ‸end')).toBeNull()
        expect(pair('‸begins x end')).toBeNull()
        expect(pair('begin x ‸endpoint')).toBeNull()
    })
    it('嵌套:同类括号按深度配', () => {
        const spec = 'begin begin x end end'
        const s = stateOf(spec, BE), t = bracketTable(s)
        expect(matchBracketPair(spec, 0, 0, undefined, t)).toEqual({ open: 0, openEnd: 5, close: 18, closeEnd: 21 })
        expect(matchBracketPair(spec, 0, 6, undefined, t)).toEqual({ open: 6, openEnd: 11, close: 14, closeEnd: 17 })
    })
    it('别类括号不算深度', () => {
        const spec = 'begin { end }'
        const s = stateOf(spec, MIX)
        expect(matchBracketPair(spec, 0, 0, undefined, bracketTable(s))).toEqual({ open: 0, openEnd: 5, close: 8, closeEnd: 11 })
    })
    it('跨行', () => {
        const spec = 'begin\n  x\nend'
        const s = stateOf(spec, BE)
        expect(matchBracketPair(spec, 0, 0, undefined, bracketTable(s))).toEqual({ open: 0, openEnd: 5, close: 10, closeEnd: 13 })
        expect(matchBracketPair(spec, 0, 13, undefined, bracketTable(s))).toEqual({ open: 0, openEnd: 5, close: 10, closeEnd: 13 })
    })
    it('长的优先:(* 不是 (,*) 不是 )', () => {
        const spec = '(* a (b) *)'
        const t = bracketTable(stateOf(spec, OCAML))
        expect(matchBracketPair(spec, 0, 0, undefined, t)).toEqual({ open: 0, openEnd: 2, close: 9, closeEnd: 11 })
        expect(matchBracketPair(spec, 0, 5, undefined, t)).toEqual({ open: 5, openEnd: 6, close: 7, closeEnd: 8 })
        expect(matchBracketPair(spec, 0, 11, undefined, t)).toEqual({ open: 0, openEnd: 2, close: 9, closeEnd: 11 })
    })
    it('<!-- --> 与 < >', () => {
        const spec = '<!-- x --> <a>'
        const t = bracketTable(stateOf(spec, HTML))
        expect(matchBracketPair(spec, 0, 0, undefined, t)).toEqual({ open: 0, openEnd: 4, close: 7, closeEnd: 10 })
        expect(matchBracketPair(spec, 0, 11, undefined, t)).toEqual({ open: 11, openEnd: 12, close: 13, closeEnd: 14 })
    })
    it('if/fi:diff 里的 if、fix 里的 fi 不是括号', () => {
        const spec = 'diff if x fi fix'
        const t = bracketTable(stateOf(spec, FI))
        expect(matchBracketPair(spec, 0, 5, undefined, t)).toEqual({ open: 5, openEnd: 7, close: 10, closeEnd: 12 })
        expect(matchBracketPair(spec, 0, 0, undefined, t)).toBeNull()
        expect(matchBracketPair(spec, 0, 16, undefined, t)).toBeNull()
    })
    it('跳过谓词:字符串里的 end 不算(按 token 起点问)', () => {
        const spec = 'begin "end" end'
        const t = bracketTable(stateOf(spec, BE))
        const skip = (pos: number) => pos >= 6 && pos < 11
        expect(matchBracketPair(spec, 0, 0, skip, t)).toEqual({ open: 0, openEnd: 5, close: 12, closeEnd: 15 })
        expect(matchBracketPair(spec, 0, 0, undefined, t)).toEqual({ open: 0, openEnd: 5, close: 7, closeEnd: 10 })
        // 光标在被跳过的 end 上:不配
        expect(matchBracketPair(spec, 0, 8, skip, t)).toBeNull()
    })
    it('窗口 base:返回文档偏移', () => {
        const text = 'xx begin y end'
        const t = bracketTable(stateOf('', BE))
        expect(matchBracketPair(text, 100, 103, undefined, t)).toEqual({ open: 103, openEnd: 108, close: 111, closeEnd: 114 })
    })
    it('matchBracketAt 老签名:只给起点', () => {
        const spec = 'begin x end'
        const t = bracketTable(stateOf(spec, BE))
        expect(matchBracketAt(spec, 0, 0, undefined, t)).toEqual([0, 8])
    })
})

describe('enclosingBrackets:begin/end', () => {
    const enc = (spec: string, pairs: Pairs = BE) => {
        const s = stateOf(spec, pairs)
        return enclosingBracketPair(s.doc.toString(), 0, caret(spec), undefined, bracketTable(s))
    }
    it('包住光标的最内层已闭合对', () => {
        expect(enc('begin begin ‸x end end')).toEqual({ open: 6, openEnd: 11, close: 14, closeEnd: 17 })
        expect(enc('begin a ‸b begin x end end')).toEqual({ open: 0, openEnd: 5, close: 22, closeEnd: 25 })
    })
    it('光标在括号 token 内部也算被这一对包住(严格包含);在两端外沿不算', () => {
        const want = { open: 0, openEnd: 5, close: 8, closeEnd: 11 }
        expect(enc('be‸gin x end')).toEqual(want)
        expect(enc('begin x en‸d')).toEqual(want)
        expect(enc('‸begin x end')).toBeNull()
        expect(enc('begin x end‸')).toBeNull()
        expect(enc('begin‸ x end')).toEqual(want)
        expect(enc('begin x ‸end')).toEqual(want)
    })
    it('没闭合的开括号跳过往外找;游离的 end 不算', () => {
        expect(enc('begin a ( ‸x end', MIX)).toEqual({ open: 0, openEnd: 5, close: 12, closeEnd: 15 })
        expect(enc('begin a ‸x')).toBeNull()
        expect(enc('begin a end ‸ end')).toBeNull()
    })
    it('词边界:endpoint 不闭合', () => {
        expect(enc('begin ‸x endpoint')).toBeNull()
        expect(enc('begin ‸x endpoint end')).toEqual({ open: 0, openEnd: 5, close: 17, closeEnd: 20 })
    })
    it('各类括号混用,按种类配', () => {
        expect(enc('begin ( ‸x ) end', MIX)).toEqual({ open: 6, openEnd: 7, close: 10, closeEnd: 11 })
        expect(enc('begin ( x ) ‸y end', MIX)).toEqual({ open: 0, openEnd: 5, close: 14, closeEnd: 17 })
    })
    it('(* *):光标在 (* 内部', () => {
        expect(enc('(‸* x *)', OCAML)).toEqual({ open: 0, openEnd: 2, close: 5, closeEnd: 7 })
    })
    it('enclosingBrackets 老签名:只给起点', () => {
        const spec = 'begin ‸x end'
        const s = stateOf(spec, BE)
        expect(enclosingBrackets(s.doc.toString(), 0, caret(spec), undefined, bracketTable(s))).toEqual([0, 8])
    })
})

describe('匹配高亮(bracketMatchingDecorations)', () => {
    const marks = (spec: string, pairs: Pairs, opts?: { enclosing?: boolean }) => {
        const state = stateOf(spec, pairs)
        const out: [number, number][] = []
        const it = bracketMatchingDecorations(state, undefined, opts).iter()
        while (it.value) { out.push([it.from, it.to]); it.next() }
        return out
    }
    it('贴着 begin / end:两只括号整词高亮', () => {
        expect(marks('‸begin x end', BE)).toEqual([[0, 5], [8, 11]])
        expect(marks('begin x end‸', BE)).toEqual([[0, 5], [8, 11]])
        expect(marks('begin x en‸d', BE)).toEqual([[0, 5], [8, 11]])
    })
    it('不贴括号:退到包住光标的那对', () => {
        expect(marks('begin x ‸y end', BE)).toEqual([[0, 5], [10, 13]])
        expect(marks('begin x ‸y end', BE, { enclosing: false })).toEqual([])
    })
    it('(* *) / <!-- -->', () => {
        expect(marks('‸(* a *)', OCAML)).toEqual([[0, 2], [5, 7]])
        expect(marks('<!-- a --‸>', HTML)).toEqual([[0, 4], [7, 10]])
    })
    it('词边界:endpoint 不高亮', () => {
        expect(marks('‸begin endpoint', BE)).toEqual([])
    })
    it('多光标', () => {
        expect(marks('‸begin x ( ‸a ) end', MIX)).toEqual([[0, 5], [8, 9], [12, 13], [14, 17]])
    })
    it('单字符表:行为不变', () => {
        expect(marks('f(‸x)', [['(', ')']])).toEqual([[1, 2], [3, 4]])
        expect(marks('f(‸x)', [])).toEqual([])
    })
})

describe('彩虹括号(bracketSpans / bracketColorDecorations)', () => {
    const spans = (text: string, pairs: Pairs, independent = false, colorized?: Pairs) => {
        const s = stateOf(text, pairs, colorized)
        return bracketSpans(text, 0, undefined, independent, colorizedBracketTable(s)).map(x => `${x.from}-${x.to}:${x.depth}`)
    }
    it('begin/end 整词一个 span,深度按嵌套', () => {
        expect(spans('begin (x) end', MIX)).toEqual(['0-5:0', '6-7:1', '8-9:1', '10-13:0'])
        expect(spans('begin begin end end', BE)).toEqual(['0-5:0', '6-11:1', '12-15:1', '16-19:0'])
    })
    it('独立色池:各种括号各数各的', () => {
        expect(spans('begin (x) end', MIX, true)).toEqual(['0-5:0', '6-7:0', '8-9:0', '10-13:0'])
        expect(spans('begin begin ( ) end end', MIX, true)).toEqual(['0-5:0', '6-11:1', '12-13:0', '14-15:0', '16-19:1', '20-23:0'])
    })
    it('词边界 / 大小写', () => {
        expect(spans('begin endpoint END', BE)).toEqual(['0-5:0', '15-18:0'])
    })
    it('(* *):长的优先', () => {
        expect(spans('(* (a) *)', OCAML)).toEqual(['0-2:0', '3-4:1', '5-6:1', '7-9:0'])
    })
    it('配了 colorizedBracketPairs 就按它(不在里面的不上色)', () => {
        expect(spans('begin (x) end', MIX, false, [['begin', 'end']])).toEqual(['0-5:0', '10-13:0'])
    })
    it('多余的闭括号不弹栈', () => {
        expect(spans('end begin end', BE)).toEqual(['0-3:0', '4-9:0', '10-13:0'])
    })

    const hl = {
        codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['ts'],
    } as unknown as ScopedShiki
    it('装饰层:整词一个 mark,按深度取色', () => {
        const state = stateOf('begin (x) end', MIX)
        const out: string[] = []
        bracketColorDecorations(hl, state, { lang: 'ts', theme: 't' }, ['c0', 'c1']).between(0, state.doc.length, (f, t, v) => {
            out.push(`${f}-${t}:${(v as { spec?: { attributes?: { style?: string } } }).spec?.attributes?.style?.replace('color:', '')}`)
        })
        expect(out).toEqual(['0-5:c0', '6-7:c1', '8-9:c1', '10-13:c0'])
    })
})

describe('命令:Go to Bracket / Select to Bracket / Remove Brackets', () => {
    function run(cmd: StateCommand, spec: string, pairs: Pairs = BE) {
        let state = stateOf(spec, pairs)
        const target = { get state() { return state }, dispatch(tr: Transaction) { state = tr.apply() } }
        const ran = cmd(target)
        return { ran, doc: state.doc.toString(), ranges: state.selection.ranges.map(r => [r.anchor, r.head]) }
    }
    const heads = (r: ReturnType<typeof run>) => r.ranges.map(x => x[1])
    describe('jumpToBracket', () => {
        it('在开括号旁 → 闭括号之前;在闭括号旁 → 开括号之前', () => {
            expect(heads(run(jumpToBracket, 'be‸gin x end'))).toEqual([8])
            expect(heads(run(jumpToBracket, 'begin‸ x end'))).toEqual([8])
            expect(heads(run(jumpToBracket, 'begin x e‸nd'))).toEqual([0])
            expect(heads(run(jumpToBracket, 'begin x end‸'))).toEqual([0])
        })
        it('不贴括号:落到包围对的闭括号之前;没包围就落到后面第一只括号之前', () => {
            expect(heads(run(jumpToBracket, 'begin ‸x end'))).toEqual([8])
            expect(heads(run(jumpToBracket, '‸x begin y end'))).toEqual([2])
        })
        it('词边界:endpoint 之前的光标找不到 end', () => {
            expect(run(jumpToBracket, 'begin x ‸endpoint').ran).toBe(false)
        })
    })
    describe('selectToBracket', () => {
        it('选中含两只括号的整段;起点在闭括号旁时反向', () => {
            expect(run(selectToBracket, 'be‸gin x end').ranges).toEqual([[0, 11]])
            expect(run(selectToBracket, 'begin x ‸end').ranges).toEqual([[11, 0]])
            expect(run(selectToBracket, 'begin x end‸').ranges).toEqual([[11, 0]])
        })
        it('包围 / 后面第一对', () => {
            expect(run(selectToBracket, 'begin ‸x end').ranges).toEqual([[0, 11]])
            expect(run(selectToBracket, '‸x begin y end').ranges).toEqual([[2, 13]])
        })
        it('selectBrackets=false:只选括号之间', () => {
            let state = stateOf('be‸gin x end', BE)
            selectToBracketWith({ get state() { return state }, dispatch(tr: Transaction) { state = tr.apply() } } as never, false)
            expect(state.selection.ranges.map(r => [r.anchor, r.head])).toEqual([[5, 8]])
        })
        it('(* *)', () => {
            expect(run(selectToBracket, '‸(* a *) b', OCAML).ranges).toEqual([[0, 7]])
        })
    })
    describe('removeBrackets', () => {
        it('两只括号整词删掉', () => {
            expect(run(removeBrackets, 'be‸gin x end').doc).toBe(' x ')
            expect(run(removeBrackets, 'begin ‸x end').doc).toBe(' x ')
            expect(run(removeBrackets, '(* a ‸*)', OCAML).doc).toBe(' a ')
        })
        it('配不上就不动', () => {
            expect(run(removeBrackets, 'begin ‸x endpoint').ran).toBe(false)
        })
    })
})

describe('电键:行首打出多字符闭括号', () => {
    const t = makeBracketTable(MIX)
    it('电键 = 各闭括号的最后一个字符(大小写都算)', () => {
        expect(electricCharacters(t).sort()).toEqual(['D', ')', '}', 'd'].sort())
    })
    it('行首只有空白时打完 end → 要对齐的闭括号是 end', () => {
        expect(electricAction(t, '    en', 'd')).toEqual({ matchOpenBracket: 'end' })
        expect(electricAction(t, '    EN', 'D')).toEqual({ matchOpenBracket: 'END' })
        expect(electricAction(t, '    x en', 'd')).toBeNull() // 前面不只是空白
        expect(electricAction(t, '    begi', 'n')).toBeNull() // 最后一个括号是开括号
        expect(electricAction(t, '    frien', 'd')).toBeNull() // friend 不是 end
        expect(electricAction(t, '    en', 'd', 2)).toBeNull() // 字符串里
    })
})

describe('接线:setLanguageConfiguration 的 begin/end 进实时路径', () => {
    it('括号表认多字符,dispose 回默认', () => {
        const { ed, done } = mount({ lang: 'bmlang', doc: 'begin x end' })
        const d = setLanguageConfiguration('bmlang', { brackets: [['begin', 'end'], ['(', ')']] })
        const t = bracketTable(ed.state)
        expect(t.open.begin).toBe('end')
        expect(matchBracketPair('begin x end', 0, 0, undefined, t)).toEqual({ open: 0, openEnd: 5, close: 8, closeEnd: 11 })
        d.dispose()
        expect(bracketTable(ed.state).custom).toBe(false)
        done()
    })
})

// ── 规模无关:大文档上光标移动 / 编辑只扫光标邻域,不扫全文 ──
describe('大文档(2 万行)不扫全文', () => {
    const block = (i: number) => `    begin ${i}\n        x := f(${i});\n    end`
    const bigDoc = (lines: number) => {
        const parts: string[] = []
        for (let n = 0; n < lines; n += 3) parts.push(block(n))
        return parts.join('\n')
    }
    const SMALL = 10_000, LARGE = 20_000
    const middle = (doc: string) => doc.indexOf('begin', Math.floor(doc.length / 2))

    function measure(lines: number, unmatched = false) {
        const doc = unmatched ? 'begin\n' + bigDoc(lines).replaceAll('end', 'fin').replaceAll('begin', 'bgn') : bigDoc(lines)
        const caretAt = unmatched ? 1 : middle(doc) + 1
        const state = EditorState.create({ doc, selection: { anchor: caretAt }, extensions: [bracketsConfig.of({ brackets: MIX })] })
        let sliced = 0, skipCalls = 0
        const real = state.sliceDoc.bind(state)
        ;(state as { sliceDoc: unknown }).sliceDoc = (a?: number, b?: number) => { const r = real(a, b); sliced += r.length; return r }
        const owner = {}
        setBracketSkipSource(owner, () => (_pos: number) => { skipCalls++; return false })
        const out: [number, number][] = []
        const it = bracketMatchingDecorations(state, owner).iter()
        while (it.value) { out.push([it.from, it.to]); it.next() }
        return { sliced, skipCalls, out, doc }
    }
    it('光标在 begin 上:配对正确,且只切光标邻域', () => {
        const small = measure(SMALL), large = measure(LARGE)
        expect(large.out.length).toBe(2)
        expect(large.doc.slice(large.out[0][0], large.out[0][1])).toBe('begin')
        expect(large.doc.slice(large.out[1][0], large.out[1][1])).toBe('end')
        expect(large.sliced).toBeLessThanOrEqual(small.sliced + 100)
        expect(large.sliced).toBeLessThanOrEqual(80_001)
        expect(large.skipCalls).toBeLessThanOrEqual(small.skipCalls + 20)
        expect(large.skipCalls).toBeLessThan(200) // 配对在几十个字符外,扫到就停
    })
    it('配不上的 begin:顶多扫一个窗口(4 万字符 × 2),不随文档变大', () => {
        const small = measure(SMALL, true), large = measure(LARGE, true)
        expect(large.out).toEqual([])
        expect(large.sliced).toBeLessThanOrEqual(80_001)
        expect(large.sliced).toBeLessThanOrEqual(small.sliced + 100)
        expect(large.skipCalls).toBeLessThanOrEqual(small.skipCalls + 20)
    })
    it('真 view:光标移动 + 打字,rope 切片 / 物化次数不随行数增长', () => {
        const measureView = (lines: number) => {
            const { ed, done } = mount({ lang: 'bmscale', doc: bigDoc(lines) })
            const d = setLanguageConfiguration('bmscale', { brackets: [['begin', 'end'], ['(', ')']] })
            const view = ed as unknown as { state: EditorState, dispatch(tr: unknown): void }
            const at = (view.state.doc.length >> 1)
            let sliced = 0, toStr = 0, toJson = 0
            const patched: (() => void)[] = []
            const patch = (proto: object, name: string, wrap: (o: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) => {
                const o = (proto as Record<string, (...a: unknown[]) => unknown>)[name]
                if (!Object.prototype.hasOwnProperty.call(proto, name)) return
                ;(proto as Record<string, unknown>)[name] = wrap(o)
                patched.push(() => { (proto as Record<string, unknown>)[name] = o })
            }
            const walk = (p: object | null) => {
                for (; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
                    patch(p, 'sliceString', o => function (this: unknown, ...a) { const r = o.apply(this, a) as string; sliced += r.length; return r })
                    patch(p, 'toString', o => function (this: unknown, ...a) { toStr++; return o.apply(this, a) })
                    patch(p, 'toJSON', o => function (this: unknown, ...a) { toJson++; return o.apply(this, a) })
                }
            }
            const op = () => {
                const s = view.state
                view.dispatch(s.update({ selection: { anchor: at } }))
                view.dispatch(view.state.update({ changes: { from: at, insert: 'x' }, selection: { anchor: at + 1 } }))
            }
            op() // 预热
            walk(Object.getPrototypeOf(view.state.doc))
            const kid = (view.state.doc as unknown as { children: object[] | null }).children?.[0]
            if (kid) walk(Object.getPrototypeOf(kid))
            sliced = toStr = toJson = 0
            op()
            for (const r of patched) r()
            d.dispose(); done()
            return { sliced, toStr, toJson }
        }
        const small = measureView(SMALL), large = measureView(LARGE)
        expect(large.sliced, `${SMALL} 行 ${small.sliced} → ${LARGE} 行 ${large.sliced}`).toBeLessThanOrEqual(small.sliced + 40_000)
        expect(large.toStr).toBeLessThanOrEqual(small.toStr)
        expect(large.toJson).toBeLessThanOrEqual(small.toJson)
    }, 120_000)
})
