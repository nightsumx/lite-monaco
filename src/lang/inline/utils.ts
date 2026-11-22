// 行内补全的杂项纯函数(移植自 inlineCompletions/browser/utils.ts + base 里用到的几个小件)。
import { Range } from '../../api/position'
import type { Position } from '../../api/position'
import type { CancellationToken } from '../async'
import { OffsetRange, StringReplacement } from './stringedit'
import { PositionOffsetTransformer, TextEdit, TextReplacement } from './textedit'

export const emptyArray: readonly never[] = []

/** 编辑应用之后,每条编辑的新范围(按传入顺序返回;传入不必有序) */
export function getModifiedRangesAfterApplying(edits: readonly TextReplacement[]): Range[] {
    const order = edits.map((_, i) => i).sort((a, b) => Range.compareRangesUsingStarts(edits[a].range, edits[b].range))
    const newRanges = new TextEdit(order.map(i => edits[i])).getNewRanges()
    const out = new Array<Range>(edits.length)
    order.forEach((orig, k) => { out[orig] = newRanges[k] })
    return out
}

export function getEndPositionsAfterApplying(edits: readonly TextReplacement[]): Position[] {
    return getModifiedRangesAfterApplying(edits).map(r => r.getEndPosition())
}

/** 每条编辑去掉与文档重合的公共前后缀(接受后光标要落在「真正新增文本」的末尾) */
export function removeTextReplacementCommonSuffixPrefix(edits: readonly TextReplacement[], text: string): TextReplacement[] {
    const t = new PositionOffsetTransformer(text)
    return edits.map(e => {
        const r = new StringReplacement(new OffsetRange(t.getOffset(e.range.getStartPosition()), t.getOffset(e.range.getEndPosition())), e.text)
            .removeCommonSuffix(text).removeCommonPrefix(text)
        return new TextReplacement(t.getRange(r.replaceRange.start, r.replaceRange.endExclusive), r.newText)
    })
}

/** 等 ms 毫秒,token 取消就提前醒(都 resolve,不抛)。setTimeout 现取现用,假计时器能接管 */
export function wait(ms: number, token?: CancellationToken): Promise<void> {
    return new Promise(resolve => {
        let off: { dispose(): void } | undefined
        const handle = setTimeout(() => { off?.dispose(); resolve() }, ms)
        off = token?.onCancellationRequested(() => { clearTimeout(handle); off?.dispose(); resolve() })
    })
}

export function distinctByKey<T>(items: T[], key: (item: T) => unknown): T[] {
    const seen = new Set<unknown>()
    return items.filter(i => { const k = key(i); if (seen.has(k)) return false; seen.add(k); return true })
}

export function moveToFront<T>(item: T, items: T[]): T[] {
    const i = items.indexOf(item)
    return i > -1 ? [item, ...items.slice(0, i), ...items.slice(i + 1)] : items
}

export function prefixedUuid(prefix: string): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    const id = c?.randomUUID ? c.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16) })
    return `${prefix}-${id}`
}
