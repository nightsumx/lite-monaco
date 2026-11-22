// 引用结果集的数据模型(Monaco gotoSymbol/browser/referencesModel.ts 去掉服务依赖的部分):
// 按文件、位置排序,同一位置去重,按文件分组;找离光标最近的引用、上一个 / 下一个引用(跨文件循环)。
// Peek 面板(tspeek.ts)拿它排序分组,不再自己写一遍。

import { Position, Range, type IRange, type IPosition } from '../api/position'

/** 只要能 toString 成可比较的字符串:URI 对象或文件路径 */
export type RefUri = string | { toString(): string }

export interface RefLocation {
    uri: RefUri
    range: IRange
}

const key = (u: RefUri) => String(u)

/** 公共前缀长度 */
function commonPrefixLength(a: string, b: string): number {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
    return i
}

function compareLocations(a: RefLocation, b: RefLocation): number {
    const ka = key(a.uri), kb = key(b.uri)
    if (ka !== kb) return ka < kb ? -1 : 1
    return Range.compareRangesUsingStarts(a.range, b.range)
}

export class OneReference<L extends RefLocation = RefLocation> {
    constructor(readonly isProviderFirst: boolean, readonly parent: FileReferences<L>, readonly link: L) {}
    get uri(): RefUri { return this.link.uri }
    get range(): IRange { return this.link.range }
}

export class FileReferences<L extends RefLocation = RefLocation> {
    readonly children: OneReference<L>[] = []
    constructor(readonly parent: ReferencesModel<L>, readonly uri: RefUri) {}
}

export class ReferencesModel<L extends RefLocation = RefLocation> {
    readonly groups: FileReferences<L>[] = []
    readonly references: OneReference<L>[] = []

    constructor(private readonly links: L[], readonly title: string) {
        const providersFirst = links[0]
        const sorted = links.slice().sort(compareLocations)
        let current: FileReferences<L> | undefined
        for (const link of sorted) {
            if (!current || key(current.uri) !== key(link.uri)) {
                current = new FileReferences(this, link.uri)
                this.groups.push(current)
            }
            const last = current.children[current.children.length - 1]
            if (!last || compareLocations(link, last.link) !== 0) {
                const one = new OneReference(providersFirst === link, current, link)
                this.references.push(one)
                current.children.push(one)
            }
        }
    }

    clone(): ReferencesModel<L> { return new ReferencesModel(this.links, this.title) }

    get isEmpty(): boolean { return this.groups.length === 0 }

    /** 上一个 / 下一个:先在本文件内循环,只有一个文件以外的情况走到头才跨到相邻文件 */
    nextOrPreviousReference(reference: OneReference<L>, next: boolean): OneReference<L> {
        const { parent } = reference
        let idx = parent.children.indexOf(reference)
        const childCount = parent.children.length
        const groupCount = this.groups.length
        if (groupCount === 1 || (next && idx + 1 < childCount) || (!next && idx > 0)) {
            idx = next ? (idx + 1) % childCount : (idx + childCount - 1) % childCount
            return parent.children[idx]
        }
        idx = this.groups.indexOf(parent)
        if (next) return this.groups[(idx + 1) % groupCount].children[0]
        const g = this.groups[(idx + groupCount - 1) % groupCount]
        return g.children[g.children.length - 1]
    }

    /** 路径公共前缀最长的;并列时比 |行差| × 100 + |列差| */
    nearestReference(resource: RefUri, position: IPosition): OneReference<L> | undefined {
        const res = key(resource)
        let best: OneReference<L> | undefined
        let bestPrefix = -1
        let bestDist = 0
        for (const ref of this.references) {
            const prefix = commonPrefixLength(key(ref.uri), res)
            const dist = Math.abs(ref.range.startLineNumber - position.lineNumber) * 100 + Math.abs(ref.range.startColumn - position.column)
            if (prefix > bestPrefix || (prefix === bestPrefix && dist < bestDist)) { best = ref; bestPrefix = prefix; bestDist = dist }
        }
        return best
    }

    referenceAt(resource: RefUri, position: Position): OneReference<L> | undefined {
        const res = key(resource)
        return this.references.find(r => key(r.uri) === res && Range.containsPosition(r.range, position))
    }

    firstReference(): OneReference<L> | undefined {
        return this.references.find(r => r.isProviderFirst) ?? this.references[0]
    }
}
