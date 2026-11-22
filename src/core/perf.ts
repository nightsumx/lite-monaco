// 编辑器性能预算 —— 大文档「一处分级、处处降级」。
//
// 根因不是某个按钮,是热路径每键重复做:
//   · state.sliceDoc() 物化全文(多消费者各扫一次)
//   · TS getCompletions/diagnostics/details 同步全量
//   · 文档词/括号匹配 O(n) 扫
//
// 本模块提供:
//   1) materializeDoc(state) —— 同 EditorState 只物化一次(WeakMap)
//   2) budgetFor(lines,len) —— 统一阈值,补全/诊断/签名/灯泡/括号全读这里

import type { EditorState } from './model/state'

export type DocClass = 'S' | 'M' | 'L' | 'XL'

export interface EditorBudget {
    docClass: DocClass
    /** 补全输入防抖 ms */
    completionDebounceMs: number
    /** TS getCompletionEntryDetails 条数 */
    completionDetailBudget: number
    /** 文档词近邻行半径 */
    wordNearLines: number
    /** 诊断: full(语法 + 语义 + suggestion) | syntax(只语法) | off */
    diagMode: 'full' | 'syntax' | 'off'
    diagDebounceMs: number
    /** 灯泡轮询防抖;0=关 */
    lightbulbDebounceMs: number
    /** sticky 是否画 */
    stickyScroll: boolean
    /** 括号匹配最大扫描字符(单侧) */
    bracketScanMax: number
    /** 选区同词窗(已有 MATCH_WINDOW,这里给参考) */
    selectionMatchWindow: number
}

const THRESH = {
    M_lines: 2_500,
    M_chars: 100_000,
    L_lines: 8_000,
    L_chars: 400_000,
    XL_lines: 20_000,
    XL_chars: 1_500_000,
} as const

export function classifyDoc(lines: number, chars: number): DocClass {
    if (lines >= THRESH.XL_lines || chars >= THRESH.XL_chars) return 'XL'
    if (lines >= THRESH.L_lines || chars >= THRESH.L_chars) return 'L'
    if (lines >= THRESH.M_lines || chars >= THRESH.M_chars) return 'M'
    return 'S'
}

export function budgetFor(lines: number, chars: number): EditorBudget {
    const docClass = classifyDoc(lines, chars)
    switch (docClass) {
        case 'XL':
            return {
                docClass,
                completionDebounceMs: 160,
                completionDetailBudget: 4,
                wordNearLines: 200,
                // 主线程实测(2026-10,TS 5.7,非 strict):2 万行语义诊断 160ms、3 万行 240ms、5 万行 375ms,语法诊断 40/55/91ms。
                // 语义检查留给 L 档以下;这里只报语法错误。灯泡要语义诊断(code fix 内部全文检查),关
                diagMode: 'syntax',
                diagDebounceMs: 1_500,
                lightbulbDebounceMs: 0, // 关
                stickyScroll: true,
                bracketScanMax: 4_000,
                selectionMatchWindow: 8_000,
            }
        case 'L':
            return {
                docClass,
                completionDebounceMs: 100,
                completionDetailBudget: 8,
                wordNearLines: 300,
                // 实测 8800 行语义诊断 80–250ms、1.2 万行 100–280ms,和 M 档同一量级:照 Monaco 全报,防抖拉长
                diagMode: 'full',
                diagDebounceMs: 800,
                lightbulbDebounceMs: 600,
                stickyScroll: true,
                bracketScanMax: 12_000,
                selectionMatchWindow: 20_000,
            }
        case 'M':
            return {
                docClass,
                completionDebounceMs: 50,
                completionDetailBudget: 16,
                wordNearLines: 400,
                diagMode: 'full',
                diagDebounceMs: 500,
                lightbulbDebounceMs: 350,
                stickyScroll: true,
                bracketScanMax: 40_000,
                selectionMatchWindow: 40_000,
            }
        default:
            return {
                docClass: 'S',
                completionDebounceMs: 0,
                completionDetailBudget: 40,
                wordNearLines: 400,
                diagMode: 'full',
                diagDebounceMs: 500, // Monaco DiagnosticsAdapter:onDidChangeContent 后 setTimeout 500
                lightbulbDebounceMs: 200,
                stickyScroll: true,
                bracketScanMax: 200_000,
                selectionMatchWindow: 40_000,
            }
    }
}

export function budgetForState(state: EditorState): EditorBudget {
    return budgetFor(state.doc.lines, state.doc.length)
}

// —— 同 state 只物化一次全文(补全/诊断/签名/hover 共享)——
const docTextCache = new WeakMap<EditorState, string>()

/** 从 state 取全文;同一 EditorState 引用只 slice 一次 */
export function materializeDoc(state: EditorState): string {
    let t = docTextCache.get(state)
    if (t != null) return t
    t = state.sliceDoc()
    docTextCache.set(state, t)
    return t
}

/** 测试/调试用 */
export function clearDocTextCacheForTests(): void {
    // WeakMap 无法 clear;换新 state 即可。占位给 API 稳定。
}
