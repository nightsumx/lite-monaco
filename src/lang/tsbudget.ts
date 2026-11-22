// TS 诊断预算 —— 委托统一 perf.budgetFor(M1.6 / 全功能性能一处降级)。

import { budgetFor, type EditorBudget } from '../core/perf'

export type DiagMode = 'full' | 'syntax' | 'off'

export interface DiagnosticsPolicy {
    mode: DiagMode
    debounceMs: number
    reason: string
}

/** perf 的分档阈值:mid = M 档(诊断 500ms)、large = L 档(800ms)、syntax = XL 档(只报语法) */
export const BUDGET = {
    midLines: 2_500,
    midChars: 100_000,
    largeLines: 8_000,
    largeChars: 400_000,
    syntaxLines: 20_000,
    syntaxChars: 1_500_000,
} as const

export function diagnosticsPolicy(docLen: number, lines: number): DiagnosticsPolicy {
    const b = budgetFor(lines, docLen)
    return {
        mode: b.diagMode,
        debounceMs: b.diagDebounceMs,
        reason: `docClass=${b.docClass}`,
    }
}

export function editorBudget(lines: number, chars: number): EditorBudget {
    return budgetFor(lines, chars)
}

export interface TSBudgetSnapshot {
    lastPolicy: DiagnosticsPolicy | null
    lastDiagAt: number
    lastDiagMode: DiagMode | null
    diagRuns: number
    diagSkipped: number
    lastDocLines: number
    lastDocLen: number
}

const snap: TSBudgetSnapshot = {
    lastPolicy: null,
    lastDiagAt: 0,
    lastDiagMode: null,
    diagRuns: 0,
    diagSkipped: 0,
    lastDocLines: 0,
    lastDocLen: 0,
}

export function recordDiagPolicy(p: DiagnosticsPolicy, docLen: number, lines: number): void {
    snap.lastPolicy = p
    snap.lastDocLen = docLen
    snap.lastDocLines = lines
}

export function recordDiagRun(mode: DiagMode): void {
    snap.lastDiagAt = Date.now()
    snap.lastDiagMode = mode
    snap.diagRuns++
}

export function recordDiagSkipped(): void {
    snap.diagSkipped++
}

export function getTSBudgetSnapshot(): Readonly<TSBudgetSnapshot> {
    return { ...snap }
}

export function resetTSBudgetSnapshot(): void {
    snap.lastPolicy = null
    snap.lastDiagAt = 0
    snap.lastDiagMode = null
    snap.diagRuns = 0
    snap.diagSkipped = 0
    snap.lastDocLines = 0
    snap.lastDocLen = 0
}

// 行首表:全文一次扫描,之后按 offset 二分取行。单项缓存(同一份文本连续查很多次:
// 引用列表、outlining span、peek 片段),避免每次从头扫 —— 那是 O(结果数 × 文本长) 的二次方。
let cachedText: string | null = null
let cachedStarts: number[] = [0]

/** text 的行首 offset 表(第 n 行 1-based 起点 = starts[n-1]) */
export function lineStartsOf(text: string): number[] {
    if (text === cachedText) return cachedStarts
    const starts = [0]
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
    cachedText = text
    cachedStarts = starts
    return starts
}

/** offset → 1-based 行号(二分) */
export function lineNumberAt(starts: readonly number[], pos: number): number {
    let lo = 0, hi = starts.length - 1
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (starts[mid] <= pos) lo = mid
        else hi = mid - 1
    }
    return lo + 1
}

/** 从全文 offset 取行号 + 行文本预览(跨文件 VFS / 本文件共用) */
export function linePreviewAt(
    text: string,
    offset: number,
    maxLen = 80,
): { line: number, preview: string, lineStart: number } {
    const pos = Math.max(0, Math.min(offset, text.length))
    const starts = lineStartsOf(text)
    const line = lineNumberAt(starts, pos)
    const lineStart = starts[line - 1]
    const lineEnd = line < starts.length ? starts[line] - 1 : text.length
    let preview = text.slice(lineStart, lineEnd).trim()
    if (preview.length > maxLen) preview = preview.slice(0, maxLen - 1) + '…'
    return { line, preview, lineStart }
}

/** 新旧全文的改动区(公共前后缀之外);一样返回 null */
export function textChange(a: string, b: string): import('typescript').TextChangeRange | null {
    if (a === b) return null
    const n = Math.min(a.length, b.length)
    // 先按 256 字符一段比(原生比较),再逐字收尾
    let p = 0
    while (p + 256 <= n && a.startsWith(b.slice(p, p + 256), p)) p += 256
    while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++
    let s = 0
    const m = n - p
    while (s + 256 <= m && a.endsWith(b.slice(b.length - s - 256, b.length - s), a.length - s)) s += 256
    while (s < m && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++
    return { span: { start: p, length: a.length - s - p }, newLength: b.length - s - p }
}
