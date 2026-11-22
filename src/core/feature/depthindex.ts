// 行首括号深度索引(sticky scroll 的括号着色要「文档开头 → 这一行行首」的深度)。
//
// 旧做法每画一次就 sliceDoc(0, 行首) 切出整段前缀再逐字符数,O(行首偏移);10 万行时每键 ~24ms,
// 而且后台分词每推一片就把行首之后的缓存全作废,等于每键都重数。
//
// 这里把「数括号」拆成每 BLOCK 行一块的小函数:一块从深度 d 进去、出来的深度是 max(d + a, b)
// (a = 净增减,b = 从 0 进去的出口 —— 深度到 0 就不再往下,所以出口有个地板)。两块复合还是这个形状:
//   a = a1 + a2, b = max(b1 + a2, b2)
// 所以深度 = 把前面各块的 (a, b) 依次复合,再逐行续数块内零头。一块只依赖它自己那几行的文字和括号跳过结果:
// 改一行只作废那一块(行数变了作废它和它之后的),后台分词重算了哪些行就作废哪些块,别的块不动。
// 结果与「整段前缀一次扫完」恒等(见 __tests__/core/depthindex.test.ts)。
import { CLOSE_OPEN, OPEN_CLOSE, type BracketSkip } from '../edit/brackets'

export const DEPTH_BLOCK = 256

interface Summary { a: number, b: number }
export interface DepthLines {
    /** 总行数 */
    lines: number
    /** n 行(1 起)的行首偏移和文字 */
    line(n: number): { from: number, text: string }
    /** 可选:第 from..to 行(1 起,闭区间)的文字一次取完(Rope.lineTexts);有它就不逐行 line(n)(每行一次树查找 + 一个 Line 对象) */
    texts?(from: number, to: number): string[]
}

// 括号字符码 → 1 开 / 2 闭(只有 ASCII 的 ()[]{},同 OPEN_CLOSE / CLOSE_OPEN)
const KIND = new Uint8Array(128)
for (const c of Object.keys(OPEN_CLOSE)) KIND[c.charCodeAt(0)] = 1
for (const c of Object.keys(CLOSE_OPEN)) KIND[c.charCodeAt(0)] = 2

/**
 * 数 [fromLine, toLine](1 起,闭区间)的括号:a = 净增减,d = 从 d0 进去的出口(到 0 不再往下)。
 * 字符串 / 注释里的括号(skip 命中)不算。
 */
function scanLines(doc: DepthLines, fromLine: number, toLine: number, skip: BracketSkip, d0: number): Summary {
    let a = 0, d = d0
    if (toLine < fromLine) return { a, b: d }
    if (doc.texts) {
        const texts = doc.texts(fromLine, toLine)
        let from = doc.line(fromLine).from
        for (let t = 0; t < texts.length; t++) {
            const text = texts[t]
            for (let i = 0; i < text.length; i++) {
                const c = text.charCodeAt(i)
                const k = c < 128 ? KIND[c] : 0
                if (k === 0 || skip?.(from + i)) continue
                if (k === 1) { a++; d++ }
                else { a--; if (d > 0) d-- }
            }
            from += text.length + 1
        }
        return { a, b: d }
    }
    for (let n = fromLine; n <= toLine; n++) {
        const { from, text } = doc.line(n)
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i)
            const k = c < 128 ? KIND[c] : 0
            if (k === 0 || skip?.(from + i)) continue
            if (k === 1) { a++; d++ }
            else { a--; if (d > 0) d-- }
        }
    }
    return { a, b: d }
}

export class DepthIndex {
    private blocks: (Summary | undefined)[] = []

    /** 第 n 行(1 起)之后的行(含)都变了或挪了位置:作废 n 所在块和它之后的块(编辑改了行数、或编辑点之后的一切) */
    invalidateFromLine(n: number): void {
        const k = Math.floor((Math.max(1, n) - 1) / DEPTH_BLOCK)
        if (k < this.blocks.length) this.blocks.length = k
    }

    /** 行下标 [from, to)(0 起,后台分词重算过的区间)所在的块作废;别的块不动 */
    invalidateLines(from: number, to: number): void {
        const a = Math.floor(from / DEPTH_BLOCK)
        const b = Math.min(this.blocks.length - 1, Math.floor((Math.max(from, to - 1)) / DEPTH_BLOCK))
        for (let k = a; k <= b; k++) this.blocks[k] = undefined
    }

    clear(): void {
        this.blocks.length = 0
    }

    private summary(doc: DepthLines, k: number, skip: BracketSkip): Summary {
        let s = this.blocks[k]
        if (s) return s
        s = scanLines(doc, k * DEPTH_BLOCK + 1, Math.min(doc.lines, (k + 1) * DEPTH_BLOCK), skip, 0)
        this.blocks[k] = s
        return s
    }

    /**
     * 空闲时把还没算的整块先算好(跳转到文档深处时,sticky 行首深度不用现场把前面所有块数一遍:10 万行首次 ~10ms)。
     * budgetMs 内算多少算多少;全算完返回 true。没有 skip(token 缓存没对上文档)时什么都不做,免得缓存下没跳过字符串的结果。
     */
    warm(doc: DepthLines, skip: BracketSkip, budgetMs: number, now: () => number = () => performance.now()): boolean {
        if (!skip) return true
        const t0 = now()
        const whole = Math.floor(doc.lines / DEPTH_BLOCK)
        for (let k = 0; k < whole; k++) {
            if (this.blocks[k]) continue
            this.summary(doc, k, skip)
            if (now() - t0 > budgetMs) return false
        }
        return true
    }

    /** 第 n 行(1 起)行首的括号深度:文档开头到这一行行首,字符串/注释里的括号(skip 命中)不算 */
    depthAtLine(doc: DepthLines, n: number, skip: BracketSkip): number {
        if (n <= 1) return 0
        const whole = Math.floor((n - 1) / DEPTH_BLOCK)
        let d = 0
        for (let k = 0; k < whole; k++) {
            const s = this.summary(doc, k, skip)
            d = Math.max(d + s.a, s.b)
        }
        d = scanLines(doc, whole * DEPTH_BLOCK + 1, n - 1, skip, d).b
        return d
    }
}
