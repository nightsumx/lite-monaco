// 只做数据形状翻译:lite-monaco 的偏移式 LineRangeMapping → Monaco 的 LinesDiff(行区间 + Range)。不含任何 diff 算法。
import { Range } from './range'
import type { LineRangeMapping, MovedText } from '../../src/core/diff/linediff'

const lr = (s: number, e: number) => ({ startLineNumber: s, endLineNumberExclusive: e, toString: () => `[${s},${e})` })

function toPos(lines: string[], off: number): [number, number] {
    let line = 0
    while (line < lines.length - 1 && off > lines[line].length) { off -= lines[line].length + 1; line++ }
    return [line + 1, off + 1]
}

export function toDetailed(c: LineRangeMapping, o: string[], m: string[]) {
    return {
        original: lr(c.originalStart, c.originalEnd),
        modified: lr(c.modifiedStart, c.modifiedEnd),
        innerChanges: c.noInner ? undefined : c.innerChanges.map(x => {
            const [osl, osc] = toPos(o, x.originalFrom), [oel, oec] = toPos(o, x.originalTo)
            const [msl, msc] = toPos(m, x.modifiedFrom), [mel, mec] = toPos(m, x.modifiedTo)
            return { originalRange: new Range(osl, osc, oel, oec), modifiedRange: new Range(msl, msc, mel, mec) }
        }),
    }
}

export function toMonacoLinesDiff(r: { changes: LineRangeMapping[], moves: MovedText[], hitTimeout: boolean }, o: string[], m: string[]) {
    return {
        changes: r.changes.map(c => toDetailed(c, o, m)),
        moves: r.moves.map(v => ({
            lineRangeMapping: { original: lr(v.originalStart, v.originalEnd), modifiedO: undefined, modified: lr(v.modifiedStart, v.modifiedEnd) },
            changes: v.changes.map(c => toDetailed(c, o, m)),
        })),
        hitTimeout: r.hitTimeout,
    }
}
