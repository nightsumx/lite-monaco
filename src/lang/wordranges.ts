// 一段行范围里的「词 → 出现位置」表(Monaco EditorWorker.$computeWordRanges 的语义)。
// 词距(worddistance.ts)用它算补全项离光标有多近。纯数据,不依赖编辑器。
import type { IRange } from '../api/position'

/** 行 [startLineNumber, endLineNumber)(不含末行,与 Monaco 一致)里按 wordDefinition 切出的词;纯数字词跳过 */
export function computeWordRanges(getLineContent: (lineNumber: number) => string, range: IRange, wordDefinition: RegExp): Record<string, IRange[]> {
    const result: Record<string, IRange[]> = Object.create(null)
    const re = new RegExp(wordDefinition.source, wordDefinition.flags.includes('g') ? wordDefinition.flags : wordDefinition.flags + 'g')
    for (let line = range.startLineNumber; line < range.endLineNumber; line++) {
        const text = getLineContent(line)
        re.lastIndex = 0
        for (let m = re.exec(text); m; m = re.exec(text)) {
            if (m[0].length === 0) { re.lastIndex++; continue }
            if (!isNaN(Number(m[0]))) continue
            const arr = result[m[0]] ?? (result[m[0]] = [])
            arr.push({ startLineNumber: line, startColumn: m.index + 1, endLineNumber: line, endColumn: m.index + 1 + m[0].length })
        }
    }
    return result
}
