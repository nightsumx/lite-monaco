// Diff 编辑器选项:名字、取值、默认值、校验都照 Monaco 0.52(monaco.d.ts 的 IDiffEditorBaseOptions,
// common/config/diffEditor.ts 的默认值,browser/widget/diffEditor/diffEditorOptions.ts 的 validateDiffEditorOptions)。
import type { IEditorOptions } from '../options'

export interface IDiffEditorBaseOptions {
    /** 允许拖动分隔条。默认 true */
    enableSplitViewResizing?: boolean
    /** 并排时的默认分割比例,0.1~0.9。默认 0.5 */
    splitViewDefaultRatio?: number
    /** 并排渲染两个编辑器。默认 true;false = 行内(inline) */
    renderSideBySide?: boolean
    /** renderSideBySide + useInlineViewWhenSpaceIsLimited 时,宽度 ≤ 它就用行内视图。默认 900 */
    renderSideBySideInlineBreakpoint?: number | undefined
    /** 空间不够(宽度 ≤ renderSideBySideInlineBreakpoint)时自动用行内视图。默认 true */
    useInlineViewWhenSpaceIsLimited?: boolean
    /** 小视图优化:只有纯插入/纯删除的 diff 用行内视图,未改区域用紧凑条。默认 false */
    compactMode?: boolean
    /** 超过这么多毫秒就放弃 diff 计算(0 = 不限)。默认 5000 */
    maxComputationTime?: number
    /** 参与 diff 的最大文件大小(MB,0 = 不限)。默认 50 */
    maxFileSize?: number
    /** 比较时忽略行首尾空白。默认 true */
    ignoreTrimWhitespace?: boolean
    /** 在行号旁画 +/-。默认 true */
    renderIndicators?: boolean
    /** 在边栏画回退图标(只在 renderGutterMenu 为 false 时出现)。默认 true */
    renderMarginRevertIcon?: boolean
    /** 两侧中间的 Revert 菜单列。默认 true */
    renderGutterMenu?: boolean
    /** 原文侧可编辑。默认 false */
    originalEditable?: boolean
    /** Diff 里显示 CodeLens。默认 false(lite-monaco 无 CodeLens,只存值) */
    diffCodeLens?: boolean
    /** 画概览尺。默认 true */
    renderOverviewRuler?: boolean
    /** 换行策略。默认 'inherit' */
    diffWordWrap?: 'off' | 'on' | 'inherit'
    /** diff 算法。默认 'advanced' */
    diffAlgorithm?: 'legacy' | 'advanced'
    /** 无障碍提示是否冗长。默认 false */
    accessibilityVerbose?: boolean
    experimental?: {
        /** 检测并画出移动的代码块。默认 false */
        showMoves?: boolean
        /** 空范围的小竖条。默认 true */
        showEmptyDecorations?: boolean
        /** 行内视图里把删除文字画在原位。默认 false(只在 renderSideBySide 为 false 时有用) */
        useTrueInlineView?: boolean
    }
    /** diff 编辑器在另一个编辑器里。默认 false */
    isInEmbeddedEditor?: boolean
    /** 只显示无障碍 diff 查看器。默认 false */
    onlyShowAccessibleDiffViewer?: boolean
    /** 折叠未改区域 */
    hideUnchangedRegions?: {
        enabled?: boolean
        /** 点"显示更多"一次多露几行。默认 20 */
        revealLineCount?: number
        /** 少于这么多行的未改区域不折叠。默认 3 */
        minimumLineCount?: number
        /** 折叠区两侧保留的上下文行数。默认 3 */
        contextLineCount?: number
    }
}

/** Monaco IDiffEditorOptions:既是 diff 自己的选项,也是两侧编辑器的选项(继承 IEditorOptions) */
export type IDiffEditorOptions = IEditorOptions & IDiffEditorBaseOptions

/** 校验、补默认之后的形态(Monaco DiffEditorOptions._options 的值) */
export interface ResolvedDiffEditorOptions {
    enableSplitViewResizing: boolean
    splitViewDefaultRatio: number
    renderSideBySide: boolean
    renderSideBySideInlineBreakpoint: number
    useInlineViewWhenSpaceIsLimited: boolean
    compactMode: boolean
    maxComputationTime: number
    maxFileSize: number
    ignoreTrimWhitespace: boolean
    renderIndicators: boolean
    renderMarginRevertIcon: boolean
    renderGutterMenu: boolean
    originalEditable: boolean
    diffCodeLens: boolean
    renderOverviewRuler: boolean
    diffWordWrap: 'off' | 'on' | 'inherit'
    diffAlgorithm: 'legacy' | 'advanced'
    accessibilityVerbose: boolean
    experimental: { showMoves: boolean, showEmptyDecorations: boolean, useTrueInlineView: boolean }
    isInEmbeddedEditor: boolean
    onlyShowAccessibleDiffViewer: boolean
    hideUnchangedRegions: { enabled: boolean, revealLineCount: number, minimumLineCount: number, contextLineCount: number }
}

/** Monaco diffEditorDefaultOptions */
export const diffEditorDefaultOptions: ResolvedDiffEditorOptions = {
    enableSplitViewResizing: true,
    splitViewDefaultRatio: 0.5,
    renderSideBySide: true,
    renderMarginRevertIcon: true,
    renderGutterMenu: true,
    maxComputationTime: 5000,
    maxFileSize: 50,
    ignoreTrimWhitespace: true,
    renderIndicators: true,
    originalEditable: false,
    diffCodeLens: false,
    renderOverviewRuler: true,
    diffWordWrap: 'inherit',
    diffAlgorithm: 'advanced',
    accessibilityVerbose: false,
    experimental: { showMoves: false, showEmptyDecorations: true, useTrueInlineView: false },
    hideUnchangedRegions: { enabled: false, contextLineCount: 3, minimumLineCount: 3, revealLineCount: 20 },
    isInEmbeddedEditor: false,
    onlyShowAccessibleDiffViewer: false,
    renderSideBySideInlineBreakpoint: 900,
    useInlineViewWhenSpaceIsLimited: true,
    compactMode: false,
}

/** Monaco 里属于 diff 自己(而不是两侧编辑器)的顶层选项名 */
export const DIFF_OPTION_KEYS: readonly string[] = [
    'enableSplitViewResizing', 'splitViewDefaultRatio', 'renderSideBySide', 'renderSideBySideInlineBreakpoint',
    'useInlineViewWhenSpaceIsLimited', 'compactMode', 'maxComputationTime', 'maxFileSize', 'ignoreTrimWhitespace',
    'renderIndicators', 'renderMarginRevertIcon', 'renderGutterMenu', 'originalEditable', 'diffCodeLens',
    'renderOverviewRuler', 'diffWordWrap', 'diffAlgorithm', 'accessibilityVerbose', 'experimental',
    'isInEmbeddedEditor', 'onlyShowAccessibleDiffViewer', 'hideUnchangedRegions',
]

// —— Monaco editorOptions.ts 的 boolean / clampedInt / clampedFloat / stringSet ——
function bool(value: unknown, def: boolean): boolean {
    if (typeof value === 'undefined') return def
    if (value === 'false') return false
    return Boolean(value)
}
function clampedInt(value: unknown, def: number, min: number, max: number): number {
    let r: number
    if (typeof value === 'undefined') r = def
    else {
        r = parseInt(value as string, 10)
        if (isNaN(r)) r = def
    }
    return Math.max(min, Math.min(max, r))
}
function clampedFloat(value: unknown, def: number, min: number, max: number): number {
    let r: number
    if (typeof value === 'undefined') r = def
    else {
        r = parseFloat(value as string)
        if (isNaN(r)) r = def
    }
    return Math.max(min, Math.min(max, r))
}
function stringSet<T extends string>(value: unknown, def: T, allowed: readonly T[], alias?: Record<string, T>): T {
    if (typeof value !== 'string') return def
    if (!allowed.includes(value as T)) return alias && alias[value] ? alias[value] : def
    return value as T
}

const MAX_SAFE_SMALL_INTEGER = 1 << 30

/** Monaco validateDiffEditorOptions:对 options 里出现的项校验,没出现的取 defaults */
export function validateDiffEditorOptions(options: IDiffEditorBaseOptions, defaults: ResolvedDiffEditorOptions): ResolvedDiffEditorOptions {
    // Monaco 0.52 还认旧名 experimental.collapseUnchangedRegions
    const legacyCollapse = (options.experimental as { collapseUnchangedRegions?: boolean } | undefined)?.collapseUnchangedRegions
    return {
        enableSplitViewResizing: bool(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
        splitViewDefaultRatio: clampedFloat(options.splitViewDefaultRatio, 0.5, 0.1, 0.9),
        renderSideBySide: bool(options.renderSideBySide, defaults.renderSideBySide),
        renderMarginRevertIcon: bool(options.renderMarginRevertIcon, defaults.renderMarginRevertIcon),
        maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, MAX_SAFE_SMALL_INTEGER),
        maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, MAX_SAFE_SMALL_INTEGER),
        ignoreTrimWhitespace: bool(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
        renderIndicators: bool(options.renderIndicators, defaults.renderIndicators),
        originalEditable: bool(options.originalEditable, defaults.originalEditable),
        diffCodeLens: bool(options.diffCodeLens, defaults.diffCodeLens),
        renderOverviewRuler: bool(options.renderOverviewRuler, defaults.renderOverviewRuler),
        diffWordWrap: stringSet(options.diffWordWrap, defaults.diffWordWrap, ['off', 'on', 'inherit']),
        diffAlgorithm: stringSet(options.diffAlgorithm, defaults.diffAlgorithm, ['legacy', 'advanced'], { smart: 'legacy', experimental: 'advanced' }),
        accessibilityVerbose: bool(options.accessibilityVerbose, defaults.accessibilityVerbose),
        experimental: {
            showMoves: bool(options.experimental?.showMoves, defaults.experimental.showMoves),
            showEmptyDecorations: bool(options.experimental?.showEmptyDecorations, defaults.experimental.showEmptyDecorations),
            useTrueInlineView: bool(options.experimental?.useTrueInlineView, defaults.experimental.useTrueInlineView),
        },
        hideUnchangedRegions: {
            enabled: bool(options.hideUnchangedRegions?.enabled ?? legacyCollapse, defaults.hideUnchangedRegions.enabled),
            contextLineCount: clampedInt(options.hideUnchangedRegions?.contextLineCount, defaults.hideUnchangedRegions.contextLineCount, 0, MAX_SAFE_SMALL_INTEGER),
            minimumLineCount: clampedInt(options.hideUnchangedRegions?.minimumLineCount, defaults.hideUnchangedRegions.minimumLineCount, 0, MAX_SAFE_SMALL_INTEGER),
            revealLineCount: clampedInt(options.hideUnchangedRegions?.revealLineCount, defaults.hideUnchangedRegions.revealLineCount, 0, MAX_SAFE_SMALL_INTEGER),
        },
        isInEmbeddedEditor: bool(options.isInEmbeddedEditor, defaults.isInEmbeddedEditor),
        onlyShowAccessibleDiffViewer: bool(options.onlyShowAccessibleDiffViewer, defaults.onlyShowAccessibleDiffViewer),
        renderSideBySideInlineBreakpoint: clampedInt(options.renderSideBySideInlineBreakpoint, defaults.renderSideBySideInlineBreakpoint, 0, MAX_SAFE_SMALL_INTEGER),
        useInlineViewWhenSpaceIsLimited: bool(options.useInlineViewWhenSpaceIsLimited, defaults.useInlineViewWhenSpaceIsLimited),
        renderGutterMenu: bool(options.renderGutterMenu, defaults.renderGutterMenu),
        compactMode: bool(options.compactMode, defaults.compactMode),
    }
}

/** 把一份扁平的 IDiffEditorOptions 拆成 diff 自己的部分和两侧编辑器的部分 */
export function splitDiffOptions(all: Record<string, unknown>): { diff: IDiffEditorBaseOptions, editor: IEditorOptions } {
    const diff: Record<string, unknown> = {}
    const editor: Record<string, unknown> = {}
    for (const k of Object.keys(all)) {
        if (all[k] === undefined) continue
        if (DIFF_OPTION_KEYS.includes(k)) diff[k] = all[k]
        else editor[k] = all[k]
    }
    return { diff: diff as IDiffEditorBaseOptions, editor: editor as IEditorOptions }
}
