// 行首括号深度索引 == 「整段前缀一次扫完」(旧做法 depthAt(sliceDoc(0, 行首)))。
// 钉死:复合恒等(含栈底闭括号不下溢)、skip 命中、块边界、编辑后作废、后台分词作废。
import { describe, expect, it } from 'vitest'
import { depthAt } from '../../src/core/edit/brackets'
import { DEPTH_BLOCK, DepthIndex, type DepthLines } from '../../src/core/feature/depthindex'

function mk(lines: string[]): DepthLines & { text: string } {
    const starts: number[] = []
    let p = 0
    for (const l of lines) { starts.push(p); p += l.length + 1 }
    return { lines: lines.length, line: n => ({ from: starts[n - 1], text: lines[n - 1] }), text: lines.join('\n') }
}
const ref = (d: ReturnType<typeof mk>, n: number, skip: ((p: number) => boolean) | undefined) => {
    const from = n <= 1 ? 0 : d.line(n).from
    return depthAt(d.text.slice(0, from), from, 0, skip)
}
function rng(seed: number) {
    let s = seed
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}
const PIECES = ['(', ')', '[', ']', '{', '}', 'a', ' ', '"', 'x = 1', '))', '((', '}}', '{{']
function randomLines(r: () => number, n: number): string[] {
    return Array.from({ length: n }, () => {
        let t = ''
        for (let k = Math.floor(r() * 6); k > 0; k--) t += PIECES[Math.floor(r() * PIECES.length)]
        return t
    })
}

describe('DepthIndex', () => {
    it('texts(批量取行)路径与逐行 line(n) 路径结果相同(随机文档、随机 skip、跨块)', () => {
        const r = rng(23)
        const lines = randomLines(r, DEPTH_BLOCK * 3 + 91)
        const d = mk(lines)
        const bulk: DepthLines = { lines: d.lines, line: d.line, texts: (a, b) => lines.slice(a - 1, b) }
        const masked = new Set<number>()
        for (let i = 0; i < d.text.length; i++) if (r() < 0.2) masked.add(i)
        const skip = (p: number) => masked.has(p)
        const a = new DepthIndex(), b = new DepthIndex()
        for (let n = 1; n <= d.lines; n += 7) {
            expect(b.depthAtLine(bulk, n, skip), `line ${n}`).toBe(ref(d, n, skip))
            expect(a.depthAtLine(d, n, skip)).toBe(b.depthAtLine(bulk, n, skip))
        }
    })

    it('随机文档、随机 skip:每一行的行首深度都与整段前缀扫描一致(跨多个块)', () => {
        const r = rng(7)
        const lines = randomLines(r, DEPTH_BLOCK * 4 + 37)
        const d = mk(lines)
        const masked = new Set<number>()
        for (let i = 0; i < d.text.length; i++) if (r() < 0.15) masked.add(i)
        const skip = (p: number) => masked.has(p)
        const idx = new DepthIndex()
        for (const n of [1, 2, 3, DEPTH_BLOCK, DEPTH_BLOCK + 1, DEPTH_BLOCK + 2, DEPTH_BLOCK * 2 + 1, d.lines, 5, d.lines - 1, 1])
            expect(idx.depthAtLine(d, n, skip), `line ${n}`).toBe(ref(d, n, skip))
        for (let n = 1; n <= d.lines; n += 13) expect(idx.depthAtLine(d, n, skip)).toBe(ref(d, n, skip))
    })

    it('栈底的闭括号不下溢(地板):)))) 之后再 ( 是 1 不是 -3', () => {
        const lines = [...Array.from({ length: DEPTH_BLOCK }, () => '))))'), '(', 'x']
        const d = mk(lines)
        const idx = new DepthIndex()
        expect(idx.depthAtLine(d, DEPTH_BLOCK + 2, undefined)).toBe(1)
        expect(idx.depthAtLine(d, d.lines, undefined)).toBe(ref(d, d.lines, undefined))
    })

    it('改一行:作废它所在的块和之后的,结果仍与整段扫描一致;之前的块不重算', () => {
        const r = rng(11)
        const lines = randomLines(r, DEPTH_BLOCK * 3)
        let d = mk(lines)
        const idx = new DepthIndex()
        let scans = 0
        const counting = (p: number) => { scans++; void p; return false }
        const probe = d.lines
        idx.depthAtLine(d, probe, counting)
        const first = scans
        // 在第 2 块里改一行(行数不变):只第 2、3 块要重数
        const at = DEPTH_BLOCK + 10
        lines[at - 1] = '((('
        d = mk(lines)
        idx.invalidateFromLine(at)
        scans = 0
        expect(idx.depthAtLine(d, probe, counting)).toBe(ref(d, probe, undefined))
        expect(scans).toBeLessThan(first)
        // 插入一行(行数变):同样作废它之后的
        lines.splice(at, 0, '))))')
        d = mk(lines)
        idx.invalidateFromLine(at)
        expect(idx.depthAtLine(d, d.lines, undefined)).toBe(ref(d, d.lines, undefined))
        expect(idx.depthAtLine(d, at + 1, undefined)).toBe(ref(d, at + 1, undefined))
    })

    it('后台分词重算了某些行(skip 结果变了):invalidateLines 只作废那些块', () => {
        const r = rng(3)
        const lines = randomLines(r, DEPTH_BLOCK * 3 + 5)
        const d = mk(lines)
        const idx = new DepthIndex()
        let masked = new Set<number>()
        const skip = (p: number) => masked.has(p)
        const last = d.lines
        expect(idx.depthAtLine(d, last, skip)).toBe(ref(d, last, skip))
        // 第 1 块里的几行被判成字符串/注释
        const l5 = d.line(5), l9 = d.line(9)
        masked = new Set([...Array(l5.text.length).keys()].map(i => l5.from + i).concat([...Array(l9.text.length).keys()].map(i => l9.from + i)))
        idx.invalidateLines(4, 9)
        expect(idx.depthAtLine(d, last, skip)).toBe(ref(d, last, skip))
        // 另一块的变化也同样
        masked = new Set()
        const l = d.line(DEPTH_BLOCK * 2 + 4)
        for (let i = 0; i < l.text.length; i++) masked.add(l.from + i)
        idx.invalidateLines(DEPTH_BLOCK * 2 + 3, DEPTH_BLOCK * 2 + 4)
        expect(idx.depthAtLine(d, last, skip)).toBe(ref(d, last, skip))
    })

    it('warm:预先算好整块,之后的查询不再问 skip(只剩块内零头);没有 skip 时不算', () => {
        const r = rng(21)
        const lines = randomLines(r, DEPTH_BLOCK * 5 + 9)
        const d = mk(lines)
        let asked = 0
        const skip = (p: number) => { asked++; return p % 7 === 0 }
        const idx = new DepthIndex()
        expect(idx.warm(d, undefined, 1e9)).toBe(true)
        expect(asked).toBe(0)
        // 预算用完就停,返回 false;再来一轮接着算,最终全部算完
        let t = 0
        const clock = () => (t += 10)
        expect(idx.warm(d, skip, 15, clock)).toBe(false)
        let rounds = 0
        while (!idx.warm(d, skip, 15, clock)) rounds++
        expect(rounds).toBeGreaterThan(0)
        const warmed = asked
        const n = DEPTH_BLOCK * 5 + 1
        expect(idx.depthAtLine(d, n, skip)).toBe(ref(d, n, skip))
        expect(asked - warmed).toBeLessThan(d.line(n).from) // 只数了块内零头
        const before = asked
        idx.depthAtLine(d, DEPTH_BLOCK * 3 + 1, skip) // 正好在块边界:零头为 0
        expect(asked).toBe(before)
    })
})
