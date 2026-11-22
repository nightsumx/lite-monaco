// Portions of this file are derived from Monaco Editor / VS Code (MIT, Copyright (c) Microsoft Corporation). See THIRD-PARTY-NOTICES.md.
// 补全过滤打分 —— 逐行移植 VS Code / Monaco 0.52 `base/common/filters.ts` 的 fuzzyScore
// (含 graceful 置换版、anyScore、createMatches)。不改规则、不加启发式:
// 补全列表的过滤与排序必须和 Monaco 一致(completionModel.ts 用的就是这一套)。
//
// 返回值 FuzzyScore = [score, wordStart, ...matchPositions(倒序)],undefined = 不匹配。

export type FuzzyScore = [score: number, wordStart: number, ...matches: number[]]

/** 没有可打分的词(空前缀)时 Monaco 用的常量分 */
export const FUZZY_DEFAULT: FuzzyScore = [-100, 0]

export interface FuzzyScoreOptions {
    readonly firstMatchCanBeWeak: boolean
    readonly boostFullMatch: boolean
}

/** Monaco 补全:matchOnWordStartOnly 默认 true → firstMatchCanBeWeak = false */
export const FUZZY_OPTIONS_DEFAULT: FuzzyScoreOptions = { boostFullMatch: true, firstMatchCanBeWeak: false }

const MAX_LEN = 128

function initTable(): number[][] {
    const table: number[][] = []
    const row: number[] = []
    for (let i = 0; i <= MAX_LEN; i++) row[i] = 0
    for (let i = 0; i <= MAX_LEN; i++) table.push(row.slice(0))
    return table
}
function initArr(maxLen: number): number[] {
    const row: number[] = []
    for (let i = 0; i <= maxLen; i++) row[i] = 0
    return row
}

const minWordMatchPos = initArr(2 * MAX_LEN)
const maxWordMatchPos = initArr(2 * MAX_LEN)
const diagT = initTable()
const table = initTable()
const arrows = initTable()

function isEmojiImprecise(x: number): boolean {
    return ((x >= 0x1F1E6 && x <= 0x1F1FF) || (x === 8986) || (x === 8987) || (x === 9200)
        || (x === 9203) || (x >= 9728 && x <= 10175) || (x === 11088) || (x === 11093)
        || (x >= 127744 && x <= 128591) || (x >= 128640 && x <= 128764)
        || (x >= 128992 && x <= 129008) || (x >= 129280 && x <= 129535)
        || (x >= 129648 && x <= 129782))
}

function isSeparatorAtPos(value: string, index: number): boolean {
    if (index < 0 || index >= value.length) return false
    const code = value.codePointAt(index)
    switch (code) {
        case 95: case 45: case 46: case 32: case 47: case 92: case 39: case 34: case 58:
        case 36: case 60: case 62: case 40: case 41: case 91: case 93: case 123: case 125:
            return true
        case undefined:
            return false
        default:
            return isEmojiImprecise(code)
    }
}

function isWhitespaceAtPos(value: string, index: number): boolean {
    if (index < 0 || index >= value.length) return false
    const code = value.charCodeAt(index)
    return code === 32 || code === 9
}

function isUpperCaseAtPos(pos: number, word: string, wordLow: string): boolean {
    return word[pos] !== wordLow[pos]
}

function isPatternInWord(
    patternLow: string, patternPos: number, patternLen: number,
    wordLow: string, wordPos: number, wordLen: number, fillMinWordPosArr = false,
): boolean {
    while (patternPos < patternLen && wordPos < wordLen) {
        if (patternLow[patternPos] === wordLow[wordPos]) {
            if (fillMinWordPosArr) minWordMatchPos[patternPos] = wordPos
            patternPos += 1
        }
        wordPos += 1
    }
    return patternPos === patternLen
}

function fillInMaxWordMatchPos(
    patternLen: number, wordLen: number, patternStart: number, wordStart: number,
    patternLow: string, wordLow: string,
) {
    let patternPos = patternLen - 1
    let wordPos = wordLen - 1
    while (patternPos >= patternStart && wordPos >= wordStart) {
        if (patternLow[patternPos] === wordLow[wordPos]) {
            maxWordMatchPos[patternPos] = wordPos
            patternPos--
        }
        wordPos--
    }
}

function doScore(
    pattern: string, patternLow: string, patternPos: number, patternStart: number,
    word: string, wordLow: string, wordPos: number, wordLen: number, wordStart: number,
    newMatchStart: boolean, outFirstMatchStrong: boolean[],
): number {
    if (patternLow[patternPos] !== wordLow[wordPos]) return Number.MIN_SAFE_INTEGER
    let score = 1
    let isGapLocation = false
    if (wordPos === (patternPos - patternStart)) {
        // 公共前缀:`foobar <-> foobaz`
        score = pattern[patternPos] === word[wordPos] ? 7 : 5
    }
    else if (isUpperCaseAtPos(wordPos, word, wordLow) && (wordPos === 0 || !isUpperCaseAtPos(wordPos - 1, word, wordLow))) {
        // 命中大写:`foo <-> forOthers`
        score = pattern[patternPos] === word[wordPos] ? 7 : 5
        isGapLocation = true
    }
    else if (isSeparatorAtPos(wordLow, wordPos) && (wordPos === 0 || !isSeparatorAtPos(wordLow, wordPos - 1))) {
        // 命中分隔符:`. <-> foo.bar`
        score = 5
    }
    else if (isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1)) {
        // 分隔符之后:`foo <-> bar_foo`
        score = 5
        isGapLocation = true
    }
    if (score > 1 && patternPos === patternStart) outFirstMatchStrong[0] = true
    if (!isGapLocation)
        isGapLocation = isUpperCaseAtPos(wordPos, word, wordLow) || isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1)
    if (patternPos === patternStart) {
        // 模式首字符命中的不是词首:按前面有缺口扣分
        if (wordPos > wordStart) score -= isGapLocation ? 3 : 5
    }
    else if (newMatchStart) {
        score += isGapLocation ? 2 : 0
    }
    else {
        score += isGapLocation ? 0 : 1
    }
    // 命中末字符时假装后面还有缺口,避免偏袒
    if (wordPos + 1 === wordLen) score -= isGapLocation ? 3 : 5
    return score
}

export function fuzzyScore(
    pattern: string, patternLow: string, patternStart: number,
    word: string, wordLow: string, wordStart: number,
    options: FuzzyScoreOptions = FUZZY_OPTIONS_DEFAULT,
): FuzzyScore | undefined {
    const patternLen = pattern.length > MAX_LEN ? MAX_LEN : pattern.length
    const wordLen = word.length > MAX_LEN ? MAX_LEN : word.length
    if (patternStart >= patternLen || wordStart >= wordLen || (patternLen - patternStart) > (wordLen - wordStart))
        return undefined
    if (!isPatternInWord(patternLow, patternStart, patternLen, wordLow, wordStart, wordLen, true))
        return undefined
    fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow)

    let row = 1
    let column = 1
    let patternPos = patternStart
    let wordPos = wordStart
    const hasStrongFirstMatch = [false]
    for (row = 1, patternPos = patternStart; patternPos < patternLen; row++, patternPos++) {
        const minPos = minWordMatchPos[patternPos]
        const maxPos = maxWordMatchPos[patternPos]
        const nextMaxPos = (patternPos + 1 < patternLen ? maxWordMatchPos[patternPos + 1] : wordLen)
        for (column = minPos - wordStart + 1, wordPos = minPos; wordPos < nextMaxPos; column++, wordPos++) {
            let score = Number.MIN_SAFE_INTEGER
            let canComeDiag = false
            if (wordPos <= maxPos) {
                score = doScore(pattern, patternLow, patternPos, patternStart, word, wordLow, wordPos, wordLen, wordStart,
                    diagT[row - 1][column - 1] === 0, hasStrongFirstMatch)
            }
            let diagScore = 0
            if (score !== Number.MAX_SAFE_INTEGER) {
                canComeDiag = true
                diagScore = score + table[row - 1][column - 1]
            }
            const canComeLeft = wordPos > minPos
            const leftScore = canComeLeft ? table[row][column - 1] + (diagT[row][column - 1] > 0 ? -5 : 0) : 0
            const canComeLeftLeft = wordPos > minPos + 1 && diagT[row][column - 1] > 0
            const leftLeftScore = canComeLeftLeft ? table[row][column - 2] + (diagT[row][column - 2] > 0 ? -5 : 0) : 0
            if (canComeLeftLeft && (!canComeLeft || leftLeftScore >= leftScore) && (!canComeDiag || leftLeftScore >= diagScore)) {
                table[row][column] = leftLeftScore
                arrows[row][column] = 3
                diagT[row][column] = 0
            }
            else if (canComeLeft && (!canComeDiag || leftScore >= diagScore)) {
                table[row][column] = leftScore
                arrows[row][column] = 2
                diagT[row][column] = 0
            }
            else if (canComeDiag) {
                table[row][column] = diagScore
                arrows[row][column] = 1
                diagT[row][column] = diagT[row - 1][column - 1] + 1
            }
            else {
                throw new Error('not possible')
            }
        }
    }
    if (!hasStrongFirstMatch[0] && !options.firstMatchCanBeWeak) return undefined

    row--
    column--
    const result: FuzzyScore = [table[row][column], wordStart]
    let backwardsDiagLength = 0
    let maxMatchColumn = 0
    while (row >= 1) {
        let diagColumn = column
        do {
            const arrow = arrows[row][diagColumn]
            if (arrow === 3) diagColumn = diagColumn - 2
            else if (arrow === 2) diagColumn = diagColumn - 1
            else break
        } while (diagColumn >= 1)
        if (backwardsDiagLength > 1
            && patternLow[patternStart + row - 1] === wordLow[wordStart + column - 1]
            && !isUpperCaseAtPos(diagColumn + wordStart - 1, word, wordLow)
            && backwardsDiagLength + 1 > diagT[row][diagColumn]) {
            diagColumn = column
        }
        if (diagColumn === column) backwardsDiagLength++
        else backwardsDiagLength = 1
        if (!maxMatchColumn) maxMatchColumn = diagColumn
        row--
        column = diagColumn - 1
        result.push(column)
    }
    if (wordLen - wordStart === patternLen && options.boostFullMatch) {
        // 整词全中:+2 让完全匹配排到最前
        result[0] += 2
    }
    const skippedCharsCount = maxMatchColumn - patternLen
    result[0] -= skippedCharsCount
    return result
}

function nextTypoPermutation(pattern: string, patternPos: number): string | undefined {
    if (patternPos + 1 >= pattern.length) return undefined
    const swap1 = pattern[patternPos]
    const swap2 = pattern[patternPos + 1]
    if (swap1 === swap2) return undefined
    return pattern.slice(0, patternPos) + swap2 + swap1 + pattern.slice(patternPos + 2)
}

/** Monaco filterGraceful(默认开,且候选 ≤2000 时用):相邻字符换位容错,每次换位 -3 */
export function fuzzyScoreGracefulAggressive(
    pattern: string, lowPattern: string, patternPos: number,
    word: string, lowWord: string, wordPos: number,
    options: FuzzyScoreOptions = FUZZY_OPTIONS_DEFAULT,
): FuzzyScore | undefined {
    let top = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, options)
    if (pattern.length >= 3) {
        const tries = Math.min(7, pattern.length - 1)
        for (let moving = patternPos + 1; moving < tries; moving++) {
            const newPattern = nextTypoPermutation(pattern, moving)
            if (newPattern) {
                const candidate = fuzzyScore(newPattern, newPattern.toLowerCase(), patternPos, word, lowWord, wordPos, options)
                if (candidate) {
                    candidate[0] -= 3
                    if (!top || candidate[0] > top[0]) top = candidate
                }
            }
        }
    }
    return top
}

/** filterText 与 label 不同时,Monaco 用它在 label 上找高亮(分数取 filterText 的) */
export function anyScore(
    pattern: string, lowPattern: string, patternPos: number,
    word: string, lowWord: string, wordPos: number,
): FuzzyScore {
    const max = Math.min(13, pattern.length)
    for (; patternPos < max; patternPos++) {
        const result = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, { firstMatchCanBeWeak: true, boostFullMatch: true })
        if (result) return result
    }
    return [0, wordPos]
}

/** 分数 → 命中下标(升序),给高亮用 */
export function matchIndices(score: FuzzyScore | undefined): number[] {
    if (!score) return []
    const out: number[] = []
    const wordPos = score[1]
    for (let i = score.length - 1; i > 1; i--) out.push(score[i] + wordPos)
    return out
}
