// overview ruler 的纯逻辑 —— 零编辑器依赖,CM6(src/ruler.ts)与 CM7(src/core/overviewruler.ts)共用。
// 类型 + 「同像素多标记取最高优先级色」的合并律。collectMarks(读编辑器状态)不在此,各编辑器自实现。

export interface RulerPalette {
    error: string
    warning: string
    info: string
    cursor: string
    match: string
    wordHighlight: string
    minimapSelection: string
    currentLine: string
    minimapFindMatch?: string // minimap 查找命中(Monaco minimap.findMatchHighlight);缺省 #d18616
    /** 概览尺(Monaco decorationsOverviewRuler)各类标记的颜色;缺省时概览尺退回旧画法(collectMarks + rulerLayout) */
    overview?: OverviewColors
}

/** 概览尺各类标记的颜色(Monaco editorOverviewRuler.* 与 editorCursor) */
export interface OverviewColors {
    cursor: string
    cursorPrimary?: string
    cursorSecondary?: string
    findMatch: string
    wordHighlight: string
    wordHighlightStrong: string
    wordHighlightText: string
    selectionHighlight: string
    bracketMatch: string
    /** editorOverviewRuler.rangeHighlightForeground(Go to Line 预览行) */
    rangeHighlight?: string
    error: string
    warning: string
    info: string
    border?: string
    /** editorOverviewRuler.background(主题显式给了才有) */
    background?: string
}


export type Severity = 'error' | 'warning' | 'info'
export interface Diagnostic {
    from: number
    to: number
    severity: Severity
    message?: string // hover tooltip 显示文案;缺省则只画波浪线/概览条,hover 无内容
    code?: string // 诊断码(如 'ts(2304)');hover 里灰显在 message 后,对齐 VS Code
    /** 来源 id:如 'ts' / 'eslint';自动诊断只替换同 source,不踩宿主手工诊断 */
    source?: string
    /** setModelMarkers 的 owner(editor.setModelMarkers(model, owner, …));带了就是 marker 层放进来的,同 owner 再设时整体替换 */
    owner?: string
    /** Monaco marker relatedInformation:hover 里每条一行 `文件(行, 列): 消息` */
    related?: readonly DiagnosticRelated[]
}
/** 行列在算诊断时定下,之后不跟编辑映射(同 Monaco)。file = basename;same = 在本文件里(点了能跳) */
export interface DiagnosticRelated { file: string, line: number, col: number, message: string, same: boolean }

export type MarkKind = 'error' | 'warning' | 'info' | 'cursor' | 'match' | 'wordHighlight'
export interface RulerMark {
    line: number
    kind: MarkKind
}

// 同像素行多标记时谁赢:数字大者优先(error 最高,match/wordHighlight 最低)。
export const PRIORITY: Record<MarkKind, number> = { error: 5, warning: 4, info: 3, cursor: 2, match: 1, wordHighlight: 1 }

// 纯函数:行号标记 + 行→像素映射 → 每个像素行的 {top, color}。
// 映射注入(lineTop):内容真实偏移(lineTop/height×轨道高),折叠/软换行非等高行也对。
// 本函数只管同像素合并 + 取最高优先级色 —— 「像素冲突解决」单一职责,不掺线性假设。
export function rulerLayout(
    marks: RulerMark[],
    lineTop: (line: number) => number,
    palette: RulerPalette,
): { top: number; color: string }[] {
    const byPx = new Map<number, MarkKind>()
    for (const m of marks) {
        const top = Math.round(lineTop(m.line))
        const cur = byPx.get(top)
        if (!cur || PRIORITY[m.kind] > PRIORITY[cur]) byPx.set(top, m.kind)
    }
    return [...byPx].map(([top, kind]) => ({ top, color: palette[kind] }))
}
