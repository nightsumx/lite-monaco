// 随机场景生成器(H3 model 对拍用)
import type { Scenario } from './ref'

export function rng(seed: number) {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

const PIECES = ['foo', 'bar', 'x', '  ', '\t', ' ', 'baz_1', '😀', '中文', '.', '(', ')', 'Foo', 'a-b', "it's", '\u00e9']
function genText(r: () => number): string {
    const lines = 1 + Math.floor(r() * 7)
    const mode = r()
    const out: string[] = []
    for (let i = 0; i < lines; i++) {
        let l = ''
        const n = Math.floor(r() * 6)
        for (let j = 0; j < n; j++) l += PIECES[Math.floor(r() * PIECES.length)]
        out.push(l)
    }
    // mode:纯 LF / 纯 CRLF / 混合 / 孤立 \r
    return out.map((l, i) => {
        if (i === out.length - 1) return l
        if (mode < 0.35) return l + '\n'
        if (mode < 0.7) return l + '\r\n'
        if (mode < 0.9) return l + (r() < 0.5 ? '\n' : '\r\n')
        return l + (r() < 0.3 ? '\r' : '\n')
    }).join('')
}

const ri = (r: () => number, max: number) => 1 + Math.floor(r() * max)
const rpos = (r: () => number) => ({ lineNumber: ri(r, 9) - 1, column: ri(r, 12) - 1 })
const rrange = (r: () => number) => {
    const a = rpos(r), b = rpos(r)
    return { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }
}

// 非重叠的有效编辑:从当前文本的行列里挑
function genEdits(r: () => number, lines: string[]) {
    const n = 1 + Math.floor(r() * 3)
    const pts: { l: number, c: number }[] = []
    for (let i = 0; i < n * 2; i++) {
        const l = ri(r, lines.length)
        pts.push({ l, c: ri(r, lines[l - 1].length + 1) })
    }
    pts.sort((a, b) => a.l - b.l || a.c - b.c)
    const edits = []
    const TEXTS = ['', 'x', 'ab\ncd', 'q\r\nw', '\n', '😀', null]
    for (let i = 0; i + 1 < pts.length; i += 2) {
        // 偶尔让相邻编辑的范围相接(touching)
        edits.push({
            range: { startLineNumber: pts[i].l, startColumn: pts[i].c, endLineNumber: pts[i + 1].l, endColumn: pts[i + 1].c },
            text: TEXTS[Math.floor(r() * TEXTS.length)],
            identifier: { major: i, minor: 0 },
        })
    }
    // 随机打乱输入顺序(Monaco 会排序)
    if (r() < 0.5) edits.reverse()
    return edits
}

export function genScenarios(seed: number, count: number): Scenario[] {
    const r = rng(seed)
    const out: Scenario[] = []
    for (let k = 0; k < count; k++) {
        const text = genText(r)
        const steps: Scenario['steps'] = []
        // 用一个本地镜像追踪行,生成合法编辑(只靠 LF 切行:\r\n 与 \r 也算换行)
        let mirror = text.split(/\r\n|\r|\n/)
        const refresh = () => steps.push({ m: '@state', a: [] })
        const reads = () => {
            const lc = mirror.length
            const l = ri(r, lc)
            const rr = rrange(r), p = rpos(r)
            steps.push({ m: 'getLineContent', a: [l] }, { m: 'getLineLength', a: [l] }, { m: 'getLineMaxColumn', a: [l] }, { m: 'getLineMinColumn', a: [l] },
                { m: 'getLineFirstNonWhitespaceColumn', a: [l] }, { m: 'getLineLastNonWhitespaceColumn', a: [l] },
                { m: 'getValueInRange', a: [rr] }, { m: 'getValueInRange', a: [rr, 1] }, { m: 'getValueInRange', a: [rr, 2] },
                { m: 'getValueLengthInRange', a: [rr] }, { m: 'getValueLengthInRange', a: [rr, 2] }, { m: 'getCharacterCountInRange', a: [rr] },
                { m: 'validatePosition', a: [p] }, { m: 'validateRange', a: [rr] },
                { m: 'getOffsetAt', a: [p] }, { m: 'getPositionAt', a: [Math.floor(r() * 80) - 5] },
                { m: 'modifyPosition', a: [p, Math.floor(r() * 30) - 15] },
                { m: 'getFullModelRange', a: [] }, { m: 'getEOL', a: [] }, { m: 'getEndOfLineSequence', a: [] },
                { m: 'getValue', a: [] }, { m: 'getValue', a: [1] }, { m: 'getValue', a: [2] }, { m: 'getValueLength', a: [] }, { m: 'getValueLength', a: [2] },
                { m: 'getLinesContent', a: [] }, { m: 'getLineCount', a: [] },
                { m: 'getWordAtPosition', a: [p] }, { m: 'getWordUntilPosition', a: [p] },
                { m: 'getLineContent', a: [lc + 3] },
            )
            // 搜索
            const needles = ['foo', 'o', 'a', '\\w+', 'x|ba', '^', '$', '\\n', 'o\\nb', '.', 'Foo', ' ', '\\s+', 'ba(r|z)']
            const q = needles[Math.floor(r() * needles.length)]
            const isRegex = r() < 0.6, matchCase = r() < 0.5, capture = r() < 0.5
            const ws = r() < 0.3 ? '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?' : null
            steps.push(
                { m: 'findMatches', a: [q, false, isRegex, matchCase, ws, capture] },
                { m: 'findMatches', a: [q, rrange(r), isRegex, matchCase, ws, capture, 5] },
                { m: 'findNextMatch', a: [q, rpos(r), isRegex, matchCase, ws, capture] },
                { m: 'findPreviousMatch', a: [q, rpos(r), isRegex, matchCase, ws, capture] },
            )
            steps.push({ m: 'normalizeIndentation', a: ['\t  \tfoo'] }, { m: 'normalizeIndentation', a: ['      bar'] }, { m: '@options', a: [] })
        }
        reads()
        const rounds = 2 + Math.floor(r() * 3)
        for (let i = 0; i < rounds; i++) {
            const kind = r()
            if (kind < 0.55) {
                const edits = genEdits(r, mirror.length ? mirror : [''])
                steps.push({ m: 'applyEdits', a: [edits, true] })
            } else if (kind < 0.7) {
                steps.push({ m: 'applyEdits', a: [genEdits(r, mirror)] })
            } else if (kind < 0.85) {
                steps.push({ m: 'setEOL', a: [r() < 0.5 ? 0 : 1] })
            } else if (kind < 0.93) {
                steps.push({ m: 'applyEdits', a: [[{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'a' }, { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'b' }], true] })
            } else {
                steps.push({ m: 'applyEdits', a: [[{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 }, text: 'x' }, { range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 3 }, text: 'y' }]] })
            }
            refresh()
            steps.push({ m: 'getValue', a: [] })
            // 编辑后重新取镜像行:靠 getLinesContent 的结果不好在生成期拿到,只能近似:用文本推演太复杂 → 下一轮用保守范围(行 1)
            mirror = ['']
            reads()
        }
        out.push({ text, steps })
    }
    return out
}

