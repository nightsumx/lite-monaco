// model.guides:缩进参考线的数据口(Monaco GuidesTextModelPart 的缩进部分)。
//
// 与 core/feature/indentguides.ts(渲染用的简化版,按光标块画层)分开:这里是 Monaco 公开语义的逐行计算,
// 供宿主 / 其它特性按 model 查询,不依赖视图。空行的层级看上下最近的有字行,offSide 语言(Python 等)空行归下面的块。
import { getLanguageConfiguration } from './languages'

export interface IActiveIndentGuideInfo { startLineNumber: number, endLineNumber: number, indent: number }

/** 返回 -1 = 整行只有空白;否则是缩进列(tab 按 tabSize 对齐) */
export function computeIndentLevel(line: string, tabSize: number): number {
    let indent = 0, i = 0
    const len = line.length
    while (i < len) {
        const ch = line.charCodeAt(i)
        if (ch === 32) indent++
        else if (ch === 9) indent = indent - indent % tabSize + tabSize
        else break
        i++
    }
    return i === len ? -1 : indent
}

export interface GuidesHost {
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLanguageId(): string
    getOptions(): { tabSize: number, indentSize: number }
}

export interface IGuidesTextModelPart {
    getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[]
    getActiveIndentGuide(lineNumber: number, minLineNumber: number, maxLineNumber: number): IActiveIndentGuideInfo
}

export function createGuides(m: GuidesHost): IGuidesTextModelPart {
    const indentOf = (lineIndex: number) => computeIndentLevel(m.getLineContent(lineIndex + 1), m.getOptions().tabSize)
    const offSide = () => Boolean(getLanguageConfiguration(m.getLanguageId())?.folding?.offSide)
    const whitespaceLevel = (off: boolean, above: number, below: number): number => {
        const size = m.getOptions().indentSize
        if (above === -1 || below === -1) return 0 // 文件头 / 尾
        if (above < below) return 1 + Math.floor(above / size) // 在上面那块里面
        if (above === below) return Math.ceil(below / size) // 两块之间
        return off ? Math.ceil(below / size) : 1 + Math.floor(below / size) // offSide:归下面的块;否则是上面那块的收尾
    }
    // 从 lineIndex(0 起)往上 / 往下找最近的有字行,返回 [index, indent];没有 = [-1, -1]
    const findAbove = (from: number): [number, number] => {
        for (let i = from; i >= 0; i--) { const n = indentOf(i); if (n >= 0) return [i, n] }
        return [-1, -1]
    }
    const findBelow = (from: number): [number, number] => {
        const count = m.getLineCount()
        for (let i = from; i < count; i++) { const n = indentOf(i); if (n >= 0) return [i, n] }
        return [-1, -1]
    }
    return {
        getLinesIndentGuides(startLineNumber, endLineNumber) {
            const count = m.getLineCount()
            if (startLineNumber < 1 || startLineNumber > count) throw new Error('Illegal value for startLineNumber')
            if (endLineNumber < 1 || endLineNumber > count) throw new Error('Illegal value for endLineNumber')
            const off = offSide(), size = m.getOptions().indentSize
            const result: number[] = new Array(endLineNumber - startLineNumber + 1)
            let aboveIdx = -2, aboveIndent = -1, belowIdx = -2, belowIndent = -1
            for (let line = startLineNumber; line <= endLineNumber; line++) {
                const cur = indentOf(line - 1)
                if (cur >= 0) { aboveIdx = line - 1; aboveIndent = cur; result[line - startLineNumber] = Math.ceil(cur / size); continue }
                if (aboveIdx === -2) [aboveIdx, aboveIndent] = findAbove(line - 2)
                if (belowIdx !== -1 && (belowIdx === -2 || belowIdx < line - 1)) [belowIdx, belowIndent] = findBelow(line)
                result[line - startLineNumber] = whitespaceLevel(off, aboveIndent, belowIndent)
            }
            return result
        },
        getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
            const lineCount = m.getLineCount()
            if (lineNumber < 1 || lineNumber > lineCount) throw new Error('Illegal value for lineNumber')
            const off = offSide(), size = m.getOptions().indentSize
            // 向上 / 向下各维护一份「上方 / 下方最近有字行」的缓存:-2 = 还没算
            let upAboveIdx = -2, upAbove = -1, upBelowIdx = -2, upBelow = -1
            const upResolve = (n: number) => {
                if (upAboveIdx !== -1 && (upAboveIdx === -2 || upAboveIdx > n - 1)) [upAboveIdx, upAbove] = findAbove(n - 2)
                if (upBelowIdx === -2) [upBelowIdx, upBelow] = findBelow(n)
            }
            let downAboveIdx = -2, downAbove = -1, downBelowIdx = -2, downBelow = -1
            const downResolve = (n: number) => {
                if (downAboveIdx === -2) [downAboveIdx, downAbove] = findAbove(n - 2)
                if (downBelowIdx !== -1 && (downBelowIdx === -2 || downBelowIdx < n - 1)) [downBelowIdx, downBelow] = findBelow(n)
            }
            let startLineNumber = 0, endLineNumber = 0, indent = 0, initialIndent = 0
            let goUp = true, goDown = true
            for (let distance = 0; goUp || goDown; distance++) {
                const up = lineNumber - distance, down = lineNumber + distance
                if (distance > 1 && (up < 1 || up < minLineNumber)) goUp = false
                if (distance > 1 && (down > lineCount || down > maxLineNumber)) goDown = false
                if (distance > 50000) goUp = goDown = false
                let upLevel = -1
                if (goUp && up >= 1) {
                    const cur = indentOf(up - 1)
                    if (cur >= 0) { upBelowIdx = up - 1; upBelow = cur; upLevel = Math.ceil(cur / size) }
                    else { upResolve(up); upLevel = whitespaceLevel(off, upAbove, upBelow) }
                }
                let downLevel = -1
                if (goDown && down <= lineCount) {
                    const cur = indentOf(down - 1)
                    if (cur >= 0) { downAboveIdx = down - 1; downAbove = cur; downLevel = Math.ceil(cur / size) }
                    else { downResolve(down); downLevel = whitespaceLevel(off, downAbove, downBelow) }
                }
                if (distance === 0) { initialIndent = upLevel; continue }
                if (distance === 1) {
                    // 块开头:选子块(不选父块)
                    if (down <= lineCount && downLevel >= 0 && initialIndent + 1 === downLevel) {
                        goUp = false; startLineNumber = endLineNumber = down; indent = downLevel; continue
                    }
                    // 块结尾:同上
                    if (up >= 1 && upLevel >= 0 && upLevel - 1 === initialIndent) {
                        goDown = false; startLineNumber = endLineNumber = up; indent = upLevel; continue
                    }
                    startLineNumber = endLineNumber = lineNumber
                    indent = initialIndent
                    if (indent === 0) return { startLineNumber, endLineNumber, indent }
                }
                if (goUp) { if (upLevel >= indent) startLineNumber = up; else goUp = false }
                if (goDown) { if (downLevel >= indent) endLineNumber = down; else goDown = false }
            }
            return { startLineNumber, endLineNumber, indent }
        },
    }
}
