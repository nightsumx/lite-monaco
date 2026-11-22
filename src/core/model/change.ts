// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 ChangeSet —— 文档变更的代数对象(幺半群)。
//
// 表示:sections = 整数对数组 [len, ins, len, ins, ...]。len=旧文档段长,
// ins=-1 表未改段 / ins>=0 表该段被替换成 ins 长内容。插入=(0,n>0),删除=(n>0,0)。
// inserted[i>>1] 存第 i 段实际插入的 Rope 文本。
//
// 代数:compose(结合,empty 为单位元,无逆元→monoid 非群)、map(OT 变换)、
// invert(给定旧文档求逆变更)。这些算法逐行移植 CM6 change.ts —— 协同编辑场景验证过的硬核,
// 不重推。CM7 改动:Text→Rope、禁正则(行分割走词法扫描)、toJSON/fromJSON 一等可监测面。

import { Rope } from './rope'

export enum MapMode { Simple, TrackDel, TrackBefore, TrackAfter }

// ChangeDesc.toJSON 出 number[],ChangeSet.toJSON 出嵌套(段长+插入行)。两者共用这个上界,
// 让 ChangeSet.toJSON 合法重写 ChangeDesc.toJSON(LSP),避免 CM6 那样退化成 any。
export type ChangeJSON = readonly (number | readonly (number | string)[])[]

// 按 \n 与 \r\n / \r 切行 —— 词法扫描,不用正则(CLAUDE.md 禁正则)。
function splitLines(s: string): string[] {
    // 大文本没有 \r 时用原生 split(同 state.ts DefaultSplit):setValue / 整篇替换时比逐字符扫快一倍以上
    if (s.length > 4096 && s.indexOf('\r') < 0) return s.split('\n')
    const out: string[] = []
    let start = 0
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        if (c === 10) { // \n
            out.push(s.slice(start, i))
            start = i + 1
        } else if (c === 13) { // \r 或 \r\n
            out.push(s.slice(start, i))
            if (s.charCodeAt(i + 1) === 10) i++
            start = i + 1
        }
    }
    out.push(s.slice(start))
    return out
}

export class ChangeDesc {
    protected constructor(readonly sections: readonly number[]) {}

    get length() {
        let result = 0
        for (let i = 0; i < this.sections.length; i += 2) result += this.sections[i]
        return result
    }

    get newLength() {
        let result = 0
        for (let i = 0; i < this.sections.length; i += 2) {
            const ins = this.sections[i + 1]
            result += ins < 0 ? this.sections[i] : ins
        }
        return result
    }

    get empty() { return this.sections.length === 0 || (this.sections.length === 2 && this.sections[1] < 0) }

    iterGaps(f: (posA: number, posB: number, length: number) => void) {
        for (let i = 0, posA = 0, posB = 0; i < this.sections.length;) {
            const len = this.sections[i++], ins = this.sections[i++]
            if (ins < 0) { f(posA, posB, len); posB += len } else { posB += ins }
            posA += len
        }
    }

    iterChangedRanges(f: (fromA: number, toA: number, fromB: number, toB: number) => void, individual = false) {
        iterChanges(this, f, individual)
    }

    get invertedDesc() {
        const sections: number[] = []
        for (let i = 0; i < this.sections.length;) {
            const len = this.sections[i++], ins = this.sections[i++]
            if (ins < 0) sections.push(len, ins)
            else sections.push(ins, len)
        }
        return new ChangeDesc(sections)
    }

    composeDesc(other: ChangeDesc) { return this.empty ? other : other.empty ? this : composeSets(this, other) }

    mapDesc(other: ChangeDesc, before = false): ChangeDesc { return other.empty ? this : mapSet(this, other, before) }

    mapPos(pos: number, assoc?: number): number
    mapPos(pos: number, assoc: number, mode: MapMode): number | null
    mapPos(pos: number, assoc = -1, mode: MapMode = MapMode.Simple) {
        let posA = 0, posB = 0
        for (let i = 0; i < this.sections.length;) {
            const len = this.sections[i++], ins = this.sections[i++], endA = posA + len
            if (ins < 0) {
                if (endA > pos) return posB + (pos - posA)
                posB += len
            } else {
                if (mode !== MapMode.Simple && endA >= pos
                    && ((mode === MapMode.TrackDel && posA < pos && endA > pos)
                        || (mode === MapMode.TrackBefore && posA < pos)
                        || (mode === MapMode.TrackAfter && endA > pos))) return null
                if (endA > pos || (endA === pos && assoc < 0 && !len))
                    return pos === posA || assoc < 0 ? posB : posB + ins
                posB += ins
            }
            posA = endA
        }
        if (pos > posA) throw new RangeError(`位置 ${pos} 越界(changeset 长 ${posA})`)
        return posB
    }

    /** 一串升序位置一次映射完(同 mapPos,段指针只往前走):O(段 + 位置) */
    mapSorted(positions: readonly number[], assoc: number, mode: MapMode): (number | null)[] {
        const out: (number | null)[] = []
        let i = 0, posA = 0, posB = 0
        for (const pos of positions) {
            let r: number | null | undefined
            while (r === undefined && i < this.sections.length) {
                const len = this.sections[i], ins = this.sections[i + 1], endA = posA + len
                if (ins < 0) {
                    if (endA > pos) { r = posB + (pos - posA); break }
                    posB += len
                } else {
                    if (mode !== MapMode.Simple && endA >= pos
                        && ((mode === MapMode.TrackDel && posA < pos && endA > pos)
                            || (mode === MapMode.TrackBefore && posA < pos)
                            || (mode === MapMode.TrackAfter && endA > pos))) { r = null; break }
                    if (endA > pos || (endA === pos && assoc < 0 && !len)) { r = pos === posA || assoc < 0 ? posB : posB + ins; break }
                    posB += ins
                }
                posA = endA
                i += 2
            }
            if (r === undefined) {
                if (pos > posA) throw new RangeError(`位置 ${pos} 越界(changeset 长 ${posA})`)
                r = posB
            }
            out.push(r)
        }
        return out
    }

    touchesRange(from: number, to = from): boolean | 'cover' {
        for (let i = 0, pos = 0; i < this.sections.length && pos <= to;) {
            const len = this.sections[i++], ins = this.sections[i++], end = pos + len
            if (ins >= 0 && pos <= to && end >= from) return pos < from && end > to ? 'cover' : true
            pos = end
        }
        return false
    }

    toString() {
        let result = ''
        for (let i = 0; i < this.sections.length;) {
            const len = this.sections[i++], ins = this.sections[i++]
            result += (result ? ' ' : '') + len + (ins >= 0 ? `:${ins}` : '')
        }
        return result
    }

    toJSON(): ChangeJSON { return this.sections }

    static fromJSON(json: unknown) {
        if (!Array.isArray(json) || json.length % 2 || json.some(a => typeof a !== 'number'))
            throw new RangeError('ChangeDesc JSON 非法')
        return new ChangeDesc(json as number[])
    }

    static create(sections: readonly number[]) { return new ChangeDesc(sections) }
}

export type ChangeSpec =
    | { from: number, to?: number, insert?: string | Rope }
    | ChangeSet
    | readonly ChangeSpec[]

export class ChangeSet extends ChangeDesc {
    private constructor(sections: readonly number[], readonly inserted: readonly Rope[]) {
        super(sections)
    }

    apply(doc: Rope) {
        if (this.length !== doc.length) throw new RangeError('changeset 与文档长度不符')
        // 改动很多(批量 applyEdits、多光标、分散的撤销):逐段 replace 是 k 次 O(log n) 的路径复制,每次都新建一串节点;
        // 改动数和行数一个量级时,顺着旧文档切片拼出新文本一次建树(O(n + k))更快。结果相同(行文字里不会有 \n)
        let k = 0
        for (let i = 1; i < this.sections.length; i += 2) if (this.sections[i] >= 0) k++
        if (k >= BULK_APPLY_MIN && k * BULK_APPLY_RATIO > doc.lines) return applyBulk(this, doc)
        iterChanges(this, (fromA, toA, fromB, _toB, text) => { doc = doc.replace(fromB, fromB + (toA - fromA), text) }, false)
        return doc
    }

    mapDesc(other: ChangeDesc, before = false): ChangeDesc { return mapSet(this, other, before, true) }

    invert(doc: Rope) {
        const sections = this.sections.slice(), inserted: Rope[] = []
        for (let i = 0, pos = 0; i < sections.length; i += 2) {
            const len = sections[i], ins = sections[i + 1]
            if (ins >= 0) {
                sections[i] = ins; sections[i + 1] = len
                const index = i >> 1
                while (inserted.length < index) inserted.push(Rope.empty)
                inserted.push(len ? doc.slice(pos, pos + len) : Rope.empty)
            }
            pos += len
        }
        return new ChangeSet(sections, inserted)
    }

    compose(other: ChangeSet) { return this.empty ? other : other.empty ? this : composeSets(this, other, true) }

    map(other: ChangeDesc, before = false): ChangeSet { return other.empty ? this : mapSet(this, other, before, true) }

    iterChanges(f: (fromA: number, toA: number, fromB: number, toB: number, inserted: Rope) => void, individual = false) {
        iterChanges(this, f, individual)
    }

    get desc() { return ChangeDesc.create(this.sections) }

    toJSON(): ChangeJSON {
        const parts: (number | (number | string)[])[] = []
        for (let i = 0; i < this.sections.length; i += 2) {
            const len = this.sections[i], ins = this.sections[i + 1]
            if (ins < 0) parts.push(len)
            else if (ins === 0) parts.push([len])
            else parts.push([len, ...this.inserted[i >> 1].toJSON()])
        }
        return parts
    }

    static of(changes: ChangeSpec, length: number, lineSep?: string): ChangeSet {
        let sections: number[] = [], inserted: Rope[] = [], pos = 0
        let total: ChangeSet | null = null

        const flush = (force = false) => {
            if (!force && !sections.length) return
            if (pos < length) addSection(sections, length - pos, -1)
            const set = new ChangeSet(sections, inserted)
            total = total ? total.compose(set.map(total)) : set
            sections = []; inserted = []; pos = 0
        }
        const process = (spec: ChangeSpec) => {
            if (Array.isArray(spec)) {
                for (const sub of spec) process(sub)
            } else if (spec instanceof ChangeSet) {
                if (spec.length !== length) throw new RangeError(`changeset 长度不符(得 ${spec.length},应 ${length})`)
                flush()
                total = total ? total.compose(spec.map(total)) : spec
            } else {
                const s = spec as { from: number, to?: number, insert?: string | Rope }
                const from = s.from, to = s.to ?? s.from, insert = s.insert
                if (from > to || from < 0 || to > length)
                    throw new RangeError(`变更区间 ${from}..${to} 非法(文档长 ${length})`)
                // lineSep 是 '\n' 时走默认切法:先按 '\n' 切再对每段切一次,会把 '\r\n' 的 '\r' 切成多余的空行
                const insText = !insert ? Rope.empty : typeof insert === 'string' ? Rope.of(lineSep && lineSep !== '\n' ? insert.split(lineSep).flatMap(splitLines) : splitLines(insert)) : insert
                const insLen = insText.length
                if (from === to && insLen === 0) return
                if (from < pos) flush()
                if (from > pos) addSection(sections, from - pos, -1)
                addSection(sections, to - from, insLen)
                addInsert(inserted, sections, insText)
                pos = to
            }
        }

        process(changes)
        flush(!total)
        return total!
    }

    static empty(length: number) {
        return new ChangeSet(length ? [length, -1] : [], [])
    }

    static fromJSON(json: unknown) {
        if (!Array.isArray(json)) throw new RangeError('ChangeSet JSON 非法')
        const sections: number[] = [], inserted: Rope[] = []
        for (let i = 0; i < json.length; i++) {
            const part = json[i]
            if (typeof part === 'number') {
                sections.push(part, -1)
            } else if (!Array.isArray(part) || typeof part[0] !== 'number' || part.some((e, j) => j && typeof e !== 'string')) {
                throw new RangeError('ChangeSet JSON 非法')
            } else if (part.length === 1) {
                sections.push(part[0], 0)
            } else {
                while (inserted.length < i) inserted.push(Rope.empty)
                inserted[i] = Rope.of(part.slice(1))
                sections.push(part[0], inserted[i].length)
            }
        }
        return new ChangeSet(sections, inserted)
    }

    static createSet(sections: readonly number[], inserted: readonly Rope[]) {
        return new ChangeSet(sections, inserted)
    }
}

const append = (a: Rope, b: Rope) => a.replace(a.length, a.length, b)

function addSection(sections: number[], len: number, ins: number, forceJoin = false) {
    if (len === 0 && ins <= 0) return
    const last = sections.length - 2
    if (last >= 0 && ins <= 0 && ins === sections[last + 1]) sections[last] += len
    else if (last >= 0 && len === 0 && sections[last] === 0) sections[last + 1] += ins
    else if (forceJoin) { sections[last] += len; sections[last + 1] += ins }
    else sections.push(len, ins)
}

function addInsert(values: Rope[], sections: readonly number[], value: Rope) {
    if (value.length === 0) return
    const index = (sections.length - 2) >> 1
    if (index < values.length) {
        values[values.length - 1] = append(values[values.length - 1], value)
    } else {
        while (values.length < index) values.push(Rope.empty)
        values.push(value)
    }
}

const BULK_APPLY_MIN = 256
const BULK_APPLY_RATIO = 64

/** 一次建树地应用 changes:旧文档按改动切片 + 插入的文字拼成整段,再按 \n 切成行 */
function applyBulk(changes: ChangeSet, doc: Rope): Rope {
    const parts: string[] = []
    let pos = 0
    iterChanges(changes, (fromA, toA, _fromB, _toB, text) => {
        if (fromA > pos) parts.push(doc.sliceString(pos, fromA))
        if (text.length) parts.push(text.sliceString(0))
        pos = toA
    }, false)
    if (pos < doc.length) parts.push(doc.sliceString(pos))
    return Rope.of(parts.join('').split('\n'))
}

function iterChanges(
    desc: ChangeDesc,
    f: (fromA: number, toA: number, fromB: number, toB: number, text: Rope) => void,
    individual: boolean,
) {
    const inserted = (desc as ChangeSet).inserted
    for (let posA = 0, posB = 0, i = 0; i < desc.sections.length;) {
        let len = desc.sections[i++], ins = desc.sections[i++]
        if (ins < 0) {
            posA += len; posB += len
        } else {
            let endA = posA, endB = posB, text = Rope.empty
            for (;;) {
                endA += len; endB += ins
                if (ins && inserted) text = append(text, inserted[(i - 2) >> 1])
                if (individual || i === desc.sections.length || desc.sections[i + 1] < 0) break
                len = desc.sections[i++]; ins = desc.sections[i++]
            }
            f(posA, endA, posB, endB, text)
            posA = endA; posB = endB
        }
    }
}

function mapSet(setA: ChangeSet, setB: ChangeDesc, before: boolean, mkSet: true): ChangeSet
function mapSet(setA: ChangeDesc, setB: ChangeDesc, before: boolean): ChangeDesc
function mapSet(setA: ChangeDesc, setB: ChangeDesc, before: boolean, mkSet = false): ChangeSet | ChangeDesc {
    const sections: number[] = [], insert: Rope[] | null = mkSet ? [] : null
    const a = new SectionIter(setA), b = new SectionIter(setB)
    for (let inserted = -1;;) {
        if ((a.done && b.len) || (b.done && a.len)) {
            throw new Error('changeset 长度不匹配')
        } else if (a.ins === -1 && b.ins === -1) {
            const len = Math.min(a.len, b.len)
            addSection(sections, len, -1)
            a.forward(len)
            b.forward(len)
        } else if (b.ins >= 0 && (a.ins < 0 || inserted === a.i || (a.off === 0 && (b.len < a.len || (b.len === a.len && !before))))) {
            let len = b.len
            addSection(sections, b.ins, -1)
            while (len) {
                const piece = Math.min(a.len, len)
                if (a.ins >= 0 && inserted < a.i && a.len <= piece) {
                    addSection(sections, 0, a.ins)
                    if (insert) addInsert(insert, sections, a.text)
                    inserted = a.i
                }
                a.forward(piece)
                len -= piece
            }
            b.next()
        } else if (a.ins >= 0) {
            let len = 0, left = a.len
            while (left) {
                if (b.ins === -1) {
                    const piece = Math.min(left, b.len)
                    len += piece
                    left -= piece
                    b.forward(piece)
                } else if (b.ins === 0 && b.len < left) {
                    left -= b.len
                    b.next()
                } else {
                    break
                }
            }
            addSection(sections, len, inserted < a.i ? a.ins : 0)
            if (insert && inserted < a.i) addInsert(insert, sections, a.text)
            inserted = a.i
            a.forward(a.len - left)
        } else if (a.done && b.done) {
            return insert ? ChangeSet.createSet(sections, insert) : ChangeDesc.create(sections)
        } else {
            throw new Error('changeset 长度不匹配')
        }
    }
}

function composeSets(setA: ChangeSet, setB: ChangeSet, mkSet: true): ChangeSet
function composeSets(setA: ChangeDesc, setB: ChangeDesc): ChangeDesc
function composeSets(setA: ChangeDesc, setB: ChangeDesc, mkSet = false): ChangeDesc {
    const sections: number[] = []
    const insert: Rope[] | null = mkSet ? [] : null
    const a = new SectionIter(setA), b = new SectionIter(setB)
    for (let open = false;;) {
        if (a.done && b.done) {
            return insert ? ChangeSet.createSet(sections, insert) : ChangeDesc.create(sections)
        } else if (a.ins === 0) {
            addSection(sections, a.len, 0, open)
            a.next()
        } else if (b.len === 0 && !b.done) {
            addSection(sections, 0, b.ins, open)
            if (insert) addInsert(insert, sections, b.text)
            b.next()
        } else if (a.done || b.done) {
            throw new Error('changeset 长度不匹配')
        } else {
            const len = Math.min(a.len2, b.len), sectionLen = sections.length
            if (a.ins === -1) {
                const insB = b.ins === -1 ? -1 : b.off ? 0 : b.ins
                addSection(sections, len, insB, open)
                if (insert && insB) addInsert(insert, sections, b.text)
            } else if (b.ins === -1) {
                addSection(sections, a.off ? 0 : a.len, len, open)
                if (insert) addInsert(insert, sections, a.textBit(len))
            } else {
                addSection(sections, a.off ? 0 : a.len, b.off ? 0 : b.ins, open)
                if (insert && !b.off) addInsert(insert, sections, b.text)
            }
            open = (a.ins > len || (b.ins >= 0 && b.len > len)) && (open || sections.length > sectionLen)
            a.forward2(len)
            b.forward(len)
        }
    }
}

class SectionIter {
    i = 0
    declare len: number
    declare off: number
    declare ins: number

    constructor(readonly set: ChangeDesc) {
        this.next()
    }

    next() {
        const { sections } = this.set
        if (this.i < sections.length) {
            this.len = sections[this.i++]
            this.ins = sections[this.i++]
        } else {
            this.len = 0; this.ins = -2
        }
        this.off = 0
    }

    get done() { return this.ins === -2 }

    get len2() { return this.ins < 0 ? this.len : this.ins }

    get text() {
        const { inserted } = this.set as ChangeSet, index = (this.i - 2) >> 1
        return index >= inserted.length ? Rope.empty : inserted[index]
    }

    textBit(len?: number) {
        const { inserted } = this.set as ChangeSet, index = (this.i - 2) >> 1
        return index >= inserted.length && !len
            ? Rope.empty
            : inserted[index].slice(this.off, len == null ? undefined : this.off + len)
    }

    forward(len: number) {
        if (len === this.len) this.next()
        else { this.len -= len; this.off += len }
    }

    forward2(len: number) {
        if (this.ins === -1) this.forward(len)
        else if (len === this.ins) this.next()
        else { this.ins -= len; this.off += len }
    }
}
