// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 文档原语 —— 不可变 B+ 树(rope)。
//
// 数学模型:文档 = 行序列,行间隐含 '\n'。length = Σ行长 + (行数-1)。
// 结构:Leaf 存一组行串;Node 存一组子树。两者都受 BRANCH 约束,replace 后自平衡。
// 代数:replace 是唯一编辑原语,(from,to,text) → 新树,旧树不动(持久化结构共享)。
//
// 算法照搬 CM6 text.ts(decompose + 重平衡 = 已被无数用户验证的坑知识),
// 代码全新、扁平、强类型;新增 toJSON/fromJSON 作一等可监测面(序列化双射律钉死)。

const BRANCH = 32 // 分支因子:Leaf 行数上限 / Node 子节点数量级

// decompose 的开口标志:From=左端要与前一片接合,To=右端要与后一片接合
const enum Open { From = 1, To = 2 }

export class Line {
    constructor(
        readonly from: number,
        readonly to: number,
        readonly number: number,
        readonly text: string,
    ) {}

    get length() { return this.to - this.from }
}

// 按行读缓存的门槛:行数不超过它的文档树很浅,直接下降;每次下降约值 1/FLAT_READ_COST 个「摊平一行」
const FLAT_MIN_LINES = 4096
const FLAT_READ_COST = 16

export abstract class Rope {
    abstract readonly length: number
    abstract readonly lines: number
    abstract readonly children: readonly Rope[] | null

    lineAt(pos: number): Line {
        if (pos < 0 || pos > this.length)
            throw new RangeError(`位置 ${pos} 越界(文档长 ${this.length})`)
        return this.lineInner(pos, false, 1, 0)
    }

    line(n: number): Line {
        if (n < 1 || n > this.lines)
            throw new RangeError(`行号 ${n} 越界(共 ${this.lines} 行)`)
        return this.lineInner(n, true, 1, 0)
    }

    abstract lineInner(target: number, isLine: boolean, line: number, offset: number): Line

    /** 第 n 行(1 起)的文本。调用方保证 1 ≤ n ≤ lines。下降时在节点的累计行数表里二分、叶子直接下标,不建 Line:读路径(getLineContent 等)的热点 */
    lineText(n: number): string {
        let node: Rope = this
        if (node.children) {
            // 同一份(不可变)文档被按行读了很多次:摊平成行数组,之后 O(1)。读够「摊平自己的成本」才建(滑雪租赁:最坏多花一倍),编辑中的文档每笔换新根,计数从头来,不会为打字付 O(行数)
            const root = node as RopeNode
            if (root._flat) return root._flat[n - 1]
            if (root.lines > FLAT_MIN_LINES && ++root._reads * FLAT_READ_COST > root.lines) return (root._flat = root.toJSON())[n - 1]
        }
        while (node.children) {
            const nd = node as RopeNode, ends = nd.lineEnds()
            let lo = 0, hi = ends.length - 1
            while (lo < hi) {
                const mid = (lo + hi) >> 1
                if (ends[mid] >= n) hi = mid
                else lo = mid + 1
            }
            if (lo) n -= ends[lo - 1]
            node = nd.children[lo]
        }
        return (node as RopeLeaf).text[n - 1]
    }

    /** 第 n 行(1 起)起点的文档偏移(同 line(n).from)。调用方保证 1 ≤ n ≤ lines */
    lineFrom(n: number): number {
        let node: Rope = this, off = 0
        if (node.children) {
            const root = node as RopeNode
            if (root._starts) return root._starts[n - 1]
            if (root.lines > FLAT_MIN_LINES && ++root._sreads * FLAT_READ_COST > root.lines) return (root._starts = root.lineStarts())[n - 1]
        }
        while (node.children) {
            const nd = node as RopeNode, ends = nd.lineEnds()
            let lo = 0, hi = ends.length - 1
            while (lo < hi) {
                const mid = (lo + hi) >> 1
                if (ends[mid] >= n) hi = mid
                else lo = mid + 1
            }
            if (lo) { n -= ends[lo - 1]; off += nd.childStarts()[lo] }
            node = nd.children[lo]
        }
        const text = (node as RopeLeaf).text
        for (let i = 0; i < n - 1; i++) off += text[i].length + 1
        return off
    }

    /** 第 from..to 行(1 起,闭区间)的文本,一次树遍历取完:比逐行 line(n) 少一个 log 因子和每行一个 Line 对象 */
    lineTexts(from: number, to: number): string[] {
        const out: string[] = []
        const lo = Math.max(1, from), hi = Math.min(this.lines, to)
        if (lo <= hi) this.collectLines(lo, hi, 1, out)
        return out
    }
    abstract collectLines(from: number, to: number, line: number, out: string[]): void

    replace(from: number, to: number, text: Rope): Rope {
        [from, to] = clip(this, from, to)
        const parts: Rope[] = []
        this.decompose(0, from, parts, Open.To)
        if (text.length) text.decompose(0, text.length, parts, Open.From | Open.To)
        this.decompose(to, this.length, parts, Open.From)
        return RopeNode.from(parts, this.length - (to - from) + text.length)
    }

    slice(from: number, to: number = this.length): Rope {
        [from, to] = clip(this, from, to)
        const parts: Rope[] = []
        this.decompose(from, to, parts, 0 as Open)
        return RopeNode.from(parts, to - from)
    }

    abstract sliceString(from: number, to?: number, lineSep?: string): string
    abstract decompose(from: number, to: number, target: Rope[], open: Open): void
    abstract flatten(target: string[]): void

    toString() { return this.sliceString(0) }

    // 可监测一等面:toJSON → 行数组(规范形),fromJSON 逆构。双射律见 rope.test.ts。
    toJSON(): string[] {
        const lines: string[] = []
        this.flatten(lines)
        return lines
    }

    static of(lines: readonly string[]): Rope {
        if (lines.length === 0) throw new RangeError('文档至少有一行')
        if (lines.length === 1 && !lines[0]) return Rope.empty
        return lines.length <= BRANCH ? new RopeLeaf(lines) : RopeNode.from(RopeLeaf.split(lines, []))
    }

    static fromJSON(lines: readonly string[]): Rope {
        return Rope.of(lines)
    }

    static empty: Rope
}

// 叶子:存一组行串,行间隐含换行。受 BRANCH 约束,超限须裹进 RopeNode。
class RopeLeaf extends Rope {
    readonly children = null

    constructor(readonly text: readonly string[], readonly length: number = textLength(text)) {
        super()
    }

    get lines() { return this.text.length }

    lineInner(target: number, isLine: boolean, line: number, offset: number): Line {
        for (let i = 0; ; i++) {
            const str = this.text[i], end = offset + str.length
            if ((isLine ? line : end) >= target)
                return new Line(offset, end, line, str)
            offset = end + 1
            line++
        }
    }

    decompose(from: number, to: number, target: Rope[], open: Open) {
        const text = from <= 0 && to >= this.length
            ? this
            : new RopeLeaf(sliceText(this.text, from, to), Math.min(to, this.length) - Math.max(0, from))
        if (open & Open.From) {
            const prev = target.pop() as RopeLeaf
            const joined = appendText(text.text, prev.text.slice(), 0, text.length)
            if (joined.length <= BRANCH) {
                target.push(new RopeLeaf(joined, prev.length + text.length))
            } else {
                const mid = joined.length >> 1
                target.push(new RopeLeaf(joined.slice(0, mid)), new RopeLeaf(joined.slice(mid)))
            }
        } else {
            target.push(text)
        }
    }

    replace(from: number, to: number, text: Rope): Rope {
        if (!(text instanceof RopeLeaf)) return super.replace(from, to, text)
        const [f, t] = clip(this, from, to)
        const lines = appendText(this.text, appendText(text.text, sliceText(this.text, 0, f)), t)
        const newLen = this.length + text.length - (t - f)
        if (lines.length <= BRANCH) return new RopeLeaf(lines, newLen)
        return RopeNode.from(RopeLeaf.split(lines, []), newLen)
    }

    sliceString(from: number, to = this.length, lineSep = '\n') {
        [from, to] = clip(this, from, to)
        let result = ''
        for (let pos = 0, i = 0; pos <= to && i < this.text.length; i++) {
            const line = this.text[i], end = pos + line.length
            if (pos > from && i) result += lineSep
            if (from < end && to > pos) result += line.slice(Math.max(0, from - pos), to - pos)
            pos = end + 1
        }
        return result
    }

    flatten(target: string[]) {
        for (const line of this.text) target.push(line)
    }

    collectLines(from: number, to: number, line: number, out: string[]): void {
        const a = Math.max(0, from - line), b = Math.min(this.text.length - 1, to - line)
        for (let i = a; i <= b; i++) out.push(this.text[i])
    }

    static split(text: readonly string[], target: Rope[]): Rope[] {
        let part: string[] = [], len = -1
        for (const line of text) {
            part.push(line)
            len += line.length + 1
            if (part.length === BRANCH) {
                target.push(new RopeLeaf(part, len))
                part = []
                len = -1
            }
        }
        if (len > -1) target.push(new RopeLeaf(part, len))
        return target
    }
}

// 内部节点:存子树,子树间隐含换行(首尾除外)。replace 时自平衡。
class RopeNode extends Rope {
    readonly lines: number

    // 读路径的索引,第一次按行/偏移查才建(编辑路径上新造的节点不付这个钱):子树累计行数、子树起点相对本节点的偏移
    private _ends: Int32Array | null = null
    private _cstarts: Float64Array | null = null

    // 整篇读缓存(见 Rope.lineText / lineFrom):行文本数组、每行起点偏移,及各自的读次数
    _flat: string[] | null = null
    _reads = 0
    _starts: Float64Array | null = null
    _sreads = 0

    /** 每行起点的文档偏移(下标 = 行号 - 1) */
    lineStarts(): Float64Array {
        const lines = this.toJSON(), out = new Float64Array(lines.length)
        let off = 0
        for (let i = 0; i < lines.length; i++) { out[i] = off; off += lines[i].length + 1 }
        return out
    }

    lineEnds(): Int32Array {
        if (this._ends) return this._ends
        const ends = new Int32Array(this.children.length)
        let sum = 0
        for (let i = 0; i < ends.length; i++) ends[i] = sum += this.children[i].lines
        return this._ends = ends
    }

    childStarts(): Float64Array {
        if (this._cstarts) return this._cstarts
        const starts = new Float64Array(this.children.length)
        let off = 0
        for (let i = 0; i < starts.length; i++) { starts[i] = off; off += this.children[i].length + 1 }
        return this._cstarts = starts
    }

    constructor(readonly children: readonly Rope[], readonly length: number) {
        super()
        let lines = 0
        for (const child of children) lines += child.lines
        this.lines = lines
    }

    lineInner(target: number, isLine: boolean, line: number, offset: number): Line {
        for (let i = 0; ; i++) {
            const child = this.children[i], end = offset + child.length, endLine = line + child.lines - 1
            if ((isLine ? endLine : end) >= target)
                return child.lineInner(target, isLine, line, offset)
            offset = end + 1
            line = endLine + 1
        }
    }

    decompose(from: number, to: number, target: Rope[], open: Open) {
        for (let i = 0, pos = 0; pos <= to && i < this.children.length; i++) {
            const child = this.children[i], end = pos + child.length
            if (from <= end && to >= pos) {
                const childOpen = open & ((pos <= from ? Open.From : 0) | (end >= to ? Open.To : 0))
                if (pos >= from && end <= to && !childOpen) target.push(child)
                else child.decompose(from - pos, to - pos, target, childOpen)
            }
            pos = end + 1
        }
    }

    replace(from: number, to: number, text: Rope): Rope {
        [from, to] = clip(this, from, to)
        // 快路径:改动只落单个子树且改后该子树行数仍在可接受区间,只更新那一个子树。
        if (text.lines < this.lines) for (let i = 0, pos = 0; i < this.children.length; i++) {
            const child = this.children[i], end = pos + child.length
            if (from >= pos && to <= end) {
                const updated = child.replace(from - pos, to - pos, text)
                const totalLines = this.lines - child.lines + updated.lines
                if (updated.lines < (totalLines >> (5 - 1)) && updated.lines > (totalLines >> (5 + 1))) {
                    const copy = this.children.slice()
                    copy[i] = updated
                    return new RopeNode(copy, this.length - (to - from) + text.length)
                }
                return super.replace(pos, end, updated)
            }
            pos = end + 1
        }
        return super.replace(from, to, text)
    }

    sliceString(from: number, to = this.length, lineSep = '\n') {
        [from, to] = clip(this, from, to)
        let result = ''
        for (let i = 0, pos = 0; i < this.children.length && pos <= to; i++) {
            const child = this.children[i], end = pos + child.length
            if (pos > from && i) result += lineSep
            if (from < end && to > pos) result += child.sliceString(from - pos, to - pos, lineSep)
            pos = end + 1
        }
        return result
    }

    collectLines(from: number, to: number, line: number, out: string[]): void {
        for (const child of this.children) {
            const end = line + child.lines - 1
            if (end >= from && line <= to) child.collectLines(from, to, line, out)
            if (end >= to) return
            line = end + 1
        }
    }

    flatten(target: string[]) {
        for (const child of this.children) child.flatten(target)
    }

    // 从子片重建平衡树:行数 < BRANCH 压回单叶,否则分块成多层 Node。
    static from(children: Rope[], length: number = children.reduce((l, ch) => l + ch.length + 1, -1)): Rope {
        let lines = 0
        for (const ch of children) lines += ch.lines
        if (lines < BRANCH) {
            const flat: string[] = []
            for (const ch of children) ch.flatten(flat)
            return new RopeLeaf(flat, length)
        }
        const chunk = Math.max(BRANCH, lines >> 5), maxChunk = chunk << 1, minChunk = chunk >> 1
        const chunked: Rope[] = []
        let currentLines = 0, currentLen = -1, currentChunk: Rope[] = []
        const flush = () => {
            if (currentLines === 0) return
            chunked.push(currentChunk.length === 1 ? currentChunk[0] : RopeNode.from(currentChunk, currentLen))
            currentLen = -1
            currentLines = 0
            currentChunk = []
        }
        const add = (child: Rope) => {
            let last
            if (child.lines > maxChunk && child instanceof RopeNode) {
                for (const node of child.children) add(node)
            } else if (child.lines > minChunk && (currentLines > minChunk || !currentLines)) {
                flush()
                chunked.push(child)
            } else if (child instanceof RopeLeaf && currentLines
                && (last = currentChunk[currentChunk.length - 1]) instanceof RopeLeaf
                && child.lines + last.lines <= BRANCH) {
                currentLines += child.lines
                currentLen += child.length + 1
                currentChunk[currentChunk.length - 1] = new RopeLeaf(last.text.concat(child.text), last.length + 1 + child.length)
            } else {
                if (currentLines + child.lines > chunk) flush()
                currentLines += child.lines
                currentLen += child.length + 1
                currentChunk.push(child)
            }
        }
        for (const child of children) add(child)
        flush()
        return chunked.length === 1 ? chunked[0] : new RopeNode(chunked, length)
    }
}

Rope.empty = new RopeLeaf([''], 0)

function textLength(text: readonly string[]) {
    let length = -1
    for (const line of text) length += line.length + 1
    return length
}

// 把 text 的 [from,to) 行片追加进 target:首片接到 target 末元素尾部(行内拼接),余片新增。
function appendText(text: readonly string[], target: string[], from = 0, to = 1e9): string[] {
    for (let pos = 0, i = 0, first = true; i < text.length && pos <= to; i++) {
        let line = text[i]
        const end = pos + line.length
        if (end >= from) {
            if (end > to) line = line.slice(0, to - pos)
            if (pos < from) line = line.slice(from - pos)
            if (first) { target[target.length - 1] += line; first = false }
            else target.push(line)
        }
        pos = end + 1
    }
    return target
}

function sliceText(text: readonly string[], from?: number, to?: number): string[] {
    return appendText(text, [''], from, to)
}

function clip(text: Rope, from: number, to: number): [number, number] {
    from = Math.max(0, Math.min(text.length, from))
    return [from, Math.max(from, Math.min(text.length, to))]
}
