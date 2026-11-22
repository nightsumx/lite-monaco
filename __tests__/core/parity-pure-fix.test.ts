// 原版纯函数/值类型 parity 清理(__parity__/na/pure.json 那一批)时补进 src 的能力的自有测试。
// 口径都取 Monaco 0.55:原版用例在 __parity__ 里跑,这里只钉 lite 自己的边角与接线。
import { describe, expect, it } from 'vitest'
import { findSectionHeaders, updateSectionHeaders, DEFAULT_MARK_SECTION_HEADER_REGEX } from '../../src/core/chrome/sectionheaders'
import { computeLineLinks } from '../../src/core/feature/link'
import { nextRenderTabStop, prevRenderTabStop, toStatusbarColumn, visibleColumn } from '../../src/core/edit/vcol'
import { atomicTabPosition, Direction } from '../../src/core/edit/atomictabs'
import { CharacterClassifier, CharacterSet } from '../../src/core/model/characterclassifier'
import { parseReplaceString, buildReplaceStringWithCasePreserved } from '../../src/core/edit/find'
import { ReferencesModel } from '../../src/lang/referencesmodel'
import { score, matchGlob } from '../../src/lang/languageselector'
import { computeDefaultDocumentColors, parseHexColor } from '../../src/core/feature/doccolors'
import { hexColorDecorations } from '../../src/core/feature/hexcolor'
import { EditorState } from '../../src/core/model/state'
import { GlyphMarginLanesModel } from '../../src/core/view/glyphlanes'
import { glyphInkFromSample, downsampleGlyphs } from '../../src/core/chrome/minimapcore'
import { LineRangeSet } from '../../src/core/diff/moves'
import { lineRangeOfRangeMapping, charSlice } from '../../src/core/diff/linediff'

const OPTS = { region: true, mark: true, markers: null }

describe('sectionheaders:minimap.markSectionHeaderRegex', () => {
    it('MARK 标题取 label(Monaco 0.55),startColumn 是整段匹配的起点', () => {
        const [h] = findSectionHeaders(['// MARK: Helpers'], OPTS)
        expect(h.text).toBe('Helpers')
        expect(h.startColumn).toBe(4)
    })
    it('自定义多行正则:跨行匹配,endLine 记在最后一行', () => {
        const regex = '^#{2} (?<label>.*)\\n(?<separator>-+)$'
        const hs = findSectionHeaders(['a', '## Title', '-----', 'b'], { ...OPTS, region: false, markRegex: regex })
        expect(hs.map(h => [h.line, h.endLine, h.text])).toEqual([[2, 3, 'Title']])
    })
    it('空串 / 非法 / 死循环正则回落到默认(不抛)', () => {
        for (const bad of ['', '(', '(?<label>.*)?']) {
            expect(() => findSectionHeaders(['// MARK: x'], { ...OPTS, markRegex: bad })).not.toThrow()
        }
        expect(findSectionHeaders(['// MARK: x'], { ...OPTS, markRegex: DEFAULT_MARK_SECTION_HEADER_REGEX })).toEqual(findSectionHeaders(['// MARK: x'], OPTS))
    })
    it('多行正则下增量 == 整篇重扫', () => {
        const opts = { ...OPTS, region: false, markRegex: '^#{2} (?<label>.*)\\n(?<separator>-+)$' }
        const a = ['## A', '---', 'x', '## B', '--']
        const b = ['y', ...a]
        expect(updateSectionHeaders({ lines: a, headers: findSectionHeaders(a, opts) }, b, opts)).toEqual(findSectionHeaders(b, opts))
    })
})

describe('link:| 是强制终止字符(Monaco #225513)', () => {
    it('{@link URL|text} 的链接停在 |', () => {
        const [l] = computeLineLinks('/** {@link https://example.com/a|text} */')
        expect(l.url).toBe('https://example.com/a')
    })
})

describe('vcol:render tab stop / 状态栏列 / 代理对', () => {
    it('nextRenderTabStop / prevRenderTabStop', () => {
        expect(nextRenderTabStop(0, 4)).toBe(4)
        expect(nextRenderTabStop(3, 4)).toBe(4)
        expect(nextRenderTabStop(4, 4)).toBe(8)
        expect(prevRenderTabStop(5, 4)).toBe(4)
        expect(prevRenderTabStop(4, 4)).toBe(0)
    })
    it('toStatusbarColumn 按码点数、tab 展开,从 1 起', () => {
        expect(toStatusbarColumn('\tx', 1, 4)).toBe(5)
        expect(toStatusbarColumn('📚az', 2, 4)).toBe(2)
    })
    it('offset 落在代理对中间:孤半个代理对算 1 列', () => {
        expect(visibleColumn('📚az', 1, 4)).toBe(1)
        expect(visibleColumn('📚az', 2, 4)).toBe(2) // 整个代理对过去:emoji 占 2 列
    })
})

describe('atomictabs:行首空白里一次跳一个缩进单位', () => {
    it('Left / Right / Nearest', () => {
        const line = '        x' // 8 个空格,tabSize 4
        expect(atomicTabPosition(line, 6, 4, Direction.Left)).toBe(4)
        expect(atomicTabPosition(line, 5, 4, Direction.Right)).toBe(8)
        expect(atomicTabPosition(line, 5, 4, Direction.Nearest)).toBe(4)
        expect(atomicTabPosition(line, 9, 4, Direction.Left)).toBe(-1) // 越过空白不适用
    })
})

describe('CharacterClassifier / CharacterSet', () => {
    it('ASCII 快表和 >255 的 Map 两路', () => {
        const c = new CharacterClassifier<number>(0)
        c.set(97, 1)
        c.set(0x4e2d, 2)
        expect([c.get(97), c.get(98), c.get(0x4e2d), c.get(0x4e2e)]).toEqual([1, 0, 2, 0])
        const s = new CharacterSet()
        s.add(65)
        expect([s.has(65), s.has(66)]).toEqual([true, false])
    })
})

describe('ReplacePattern', () => {
    it('静态串无模式;$1 / $& / \\n / \\t / 大小写变换', () => {
        expect(parseReplaceString('abc').hasReplacementPatterns).toBe(false)
        const p = parseReplaceString('$1-\\u$2-\\L$3-$&')
        expect(p.hasReplacementPatterns).toBe(true)
        expect(p.buildReplaceString(['xx', 'a', 'b', 'C'])).toBe('a-B-c-xx')
    })
    it('保留大小写', () => {
        expect(buildReplaceStringWithCasePreserved(['Hello'], 'world')).toBe('World')
        expect(buildReplaceStringWithCasePreserved(['HELLO'], 'world')).toBe('WORLD')
    })
})

describe('ReferencesModel', () => {
    const loc = (uri: string, l: number, c = 1) => ({ uri, range: { startLineNumber: l, startColumn: c, endLineNumber: l, endColumn: c + 1 } })
    it('按文件、位置排序,同一位置去重,分组', () => {
        const m = new ReferencesModel([loc('b', 2), loc('a', 5), loc('a', 1), loc('a', 1)], 't')
        expect(m.references.map(r => [String(r.uri), r.range.startLineNumber])).toEqual([['a', 1], ['a', 5], ['b', 2]])
        expect(m.groups.map(g => g.children.length)).toEqual([2, 1])
    })
    it('nextOrPreviousReference 跨文件循环', () => {
        const m = new ReferencesModel([loc('a', 1), loc('b', 2)], 't')
        const [r1, r2] = m.references
        expect(m.nextOrPreviousReference(r2, true)).toBe(r1)
        expect(m.nextOrPreviousReference(r1, false)).toBe(r2)
    })
})

describe('languageselector.score', () => {
    const uri = { scheme: 'file', fsPath: '/home/u/Desktop/test.json' }
    it('未同步的 model 只有 hasAccessToAllModels 能命中', () => {
        expect(score('json', uri, 'json', false)).toBe(0)
        expect(score({ language: 'json', hasAccessToAllModels: true }, uri, 'json', false)).toBe(10)
    })
    it('IRelativePattern:要求 fsPath 在 base 之下,glob 对相对路径', () => {
        expect(score({ pattern: { base: '/home/u/Desktop', pattern: '*.json' } }, uri, 'json', true)).toBe(10)
        expect(score({ pattern: { base: '/home/u/Other', pattern: '*.json' } }, uri, 'json', true)).toBe(0)
        expect(matchGlob({ base: '/home/u', pattern: '*.json' }, '/home/u/Desktop/test.json')).toBe(false)
        expect(matchGlob({ base: '/home/u', pattern: '**/*.json' }, '/home/u/Desktop/test.json')).toBe(true)
    })
    it('notebookType:没有 notebook 时 xxx 和 * 都是 0;有 notebook 时用 notebook 的 uri', () => {
        expect(score({ language: 'bat', notebookType: 'xxx' }, uri, 'bat', true)).toBe(0)
        expect(score({ language: 'bat', notebookType: '*' }, uri, 'bat', true)).toBe(0)
        const cell = { scheme: 'vscode-notebook-cell', fsPath: '/a.py' }
        const nb = { scheme: 'file', fsPath: '/a.py' }
        expect(score({ notebookType: 'jupyter', scheme: 'file' }, cell, 'python', true, nb, 'jupyter')).toBe(10)
    })
})

describe('doccolors:Monaco 默认文档颜色', () => {
    it('hex 只认行首 / 引号 / 空白之后', () => {
        expect(computeDefaultDocumentColors("c = '#ff0000'").length).toBe(1)
        expect(computeDefaultDocumentColors('a:#ff0000').length).toBe(0)
        expect(parseHexColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 })
    })
    it('rgb / rgba / hsl / hsla,不合法整条丢弃', () => {
        const [a, b, c] = computeDefaultDocumentColors('rgb(255, 0, 0) rgba(0,255,0,0.5) hsl(120, 100%, 50%)')
        expect(a.color).toEqual({ red: 1, green: 0, blue: 0, alpha: 1 })
        expect(b.color).toEqual({ red: 0, green: 1, blue: 0, alpha: 0.5 })
        expect(c.color).toEqual({ red: 0, green: 1, blue: 0, alpha: 1 })
        expect(computeDefaultDocumentColors('rgb(256, 0, 0) hsl(361, 0%, 0%)')).toEqual([])
    })
    it('hexColorDecorations 也给 rgb()/hsl() 画色块,并按起点有序', () => {
        const state = EditorState.create({ doc: 'rgb(1, 2, 3) #fff hsl(0, 0%, 0%)' })
        const set = hexColorDecorations(state)
        const froms: number[] = []
        set.between(0, state.doc.length, from => { froms.push(from) })
        expect(froms).toEqual([0, 13, 18])
    })
})

describe('GlyphMarginLanesModel', () => {
    const span = (a: number, b = a) => ({ startLineNumber: a, endLineNumber: b })
    it('requiredLanes 取「同一行同时占用车道数」的最大值,不是出现过的车道并集', () => {
        const m = new GlyphMarginLanesModel(10)
        m.push(1, span(1)) // 左
        m.push(3, span(5)) // 右,不同行
        expect(m.requiredLanes).toBe(1)
        m.push(3, span(1))
        expect(m.requiredLanes).toBe(2)
        expect(m.getLanesAtLine(1)).toEqual([1, 3])
        expect(m.getLanesAtLine(9)).toEqual([2]) // 没有占用时是 Center
    })
})

describe('minimapcore:下采样 + soften', () => {
    it('从采样表得墨量表:最亮像素拉满,暗底 soften ×12/15 向零取整', () => {
        const N = 96, W = 10, H = 16
        const sample = new Uint8ClampedArray(N * W * H * 4)
        // 只给 '!'(下标 1)一格画满白
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const o = (y * N * W + W + x) * 4
            sample.set([255, 255, 255, 255], o)
        }
        const raw = downsampleGlyphs(sample, 1)
        expect(Math.max(...raw)).toBe(255)
        const g = glyphInkFromSample(sample, 1, false)
        expect(g.cw).toBe(1)
        expect(g.ch).toBe(2)
        expect(g.ink[0]).toBe(Math.floor(255 * 12 / 15))
    })
})

describe('diff 内部件:LineRangeSet / lineRangeOfRangeMapping / charSlice', () => {
    it('LineRangeSet 合并相切、并集、相交判断', () => {
        const s = new LineRangeSet([{ start: 2, end: 3 }, { start: 3, end: 4 }, { start: 10, end: 20 }])
        expect(s.toString()).toBe('[2,4), [10,20)')
        expect(s.intersects({ start: 4, end: 10 })).toBe(false)
        expect(s.getUnion(new LineRangeSet([{ start: 4, end: 10 }])).toString()).toBe('[2,20)')
    })
    it('lineRangeOfRangeMapping:两端落在行首 / 行尾的整行不算改', () => {
        const r = (sl: number, sc: number, el: number, ec: number) => ({ sl, sc, el, ec })
        expect(lineRangeOfRangeMapping(r(2, 1, 3, 1), r(2, 1, 2, 1), ['x', '', ''], ['y', ''])).toEqual({ o1: 2, o2: 3, m1: 2, m2: 2 })
    })
    it('charSlice.translate:行首位置 left / right 偏好', () => {
        const s = charSlice(['ab', 'cd'], { sl: 1, sc: 1, el: 2, ec: 3 }, true)
        expect(s.translate(3, false)).toEqual([2, 1])
        expect(s.translate(2, false)).toEqual([1, 3])
    })
})
