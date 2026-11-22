// 编辑行为读的 Monaco 选项:统一从 state 里取(`getOption`),并兼容 raw / computed 两种形态
// (raw: 'alt' / 'full';computed: 'altKey' / 4),取到不认识的值就退回 Monaco 默认值。
// 没有 liteMonaco()(裸 EditorState)时 getOption 返回的就是默认值,所以这里不再单独存默认。

import type { EditorState } from '../model/state'
import { EditorSelection } from '../model/selection'
import { getOption } from '../options'

export type AutoClosingMode = 'always' | 'languageDefined' | 'beforeWhitespace' | 'never'
export type AutoClosingBehavior = 'always' | 'auto' | 'never'

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback
}

const AUTO_CLOSING_MODES = ['always', 'languageDefined', 'beforeWhitespace', 'never'] as const
const AUTO_CLOSING_BEHAVIORS = ['always', 'auto', 'never'] as const

/** autoClosingBrackets / autoClosingQuotes / autoClosingComments */
export function autoClosingMode(state: EditorState, name: 'autoClosingBrackets' | 'autoClosingQuotes' | 'autoClosingComments'): AutoClosingMode {
    return pick(getOption(state, name), AUTO_CLOSING_MODES, 'languageDefined')
}

/** autoClosingDelete / autoClosingOvertype */
export function autoClosingBehavior(state: EditorState, name: 'autoClosingDelete' | 'autoClosingOvertype'): AutoClosingBehavior {
    return pick(getOption(state, name), AUTO_CLOSING_BEHAVIORS, 'auto')
}

export type AutoSurroundMode = 'languageDefined' | 'quotes' | 'brackets' | 'never'
export function autoSurroundMode(state: EditorState): AutoSurroundMode {
    return pick(getOption(state, 'autoSurround'), ['languageDefined', 'quotes', 'brackets', 'never'] as const, 'languageDefined')
}

/** Monaco EditorAutoIndentStrategy:None 0 / Keep 1 / Brackets 2 / Advanced 3 / Full 4 */
export const enum AutoIndent { None = 0, Keep = 1, Brackets = 2, Advanced = 3, Full = 4 }
const AUTO_INDENT_NAMES = ['none', 'keep', 'brackets', 'advanced', 'full']
export function autoIndentLevel(state: EditorState): AutoIndent {
    const v: unknown = getOption(state, 'autoIndent')
    if (typeof v === 'number' && v >= 0 && v <= 4) return v as AutoIndent
    const i = AUTO_INDENT_NAMES.indexOf(v as string)
    return i >= 0 ? i : AutoIndent.Advanced
}

/** multiCursorModifier:'alt' = Alt 加光标(默认);'ctrlCmd' = Ctrl(Mac 为 ⌘)加光标。computed 形态 altKey / ctrlKey / metaKey 也认。 */
export function multiCursorModifierKind(state: EditorState): 'alt' | 'ctrlCmd' {
    const v: string = getOption(state, 'multiCursorModifier')
    return v === 'ctrlCmd' || v === 'ctrlKey' || v === 'metaKey' ? 'ctrlCmd' : 'alt'
}

/**
 * multiCursorLimit(默认 10000):光标数超过上限就只留前 limit 个(Monaco Cursor.setStates 的 states.slice(0, limit))。
 * 没超就原样返回同一个对象。
 */
export function capSelection(state: EditorState, sel: EditorSelection): EditorSelection {
    const limit = Math.max(1, Math.floor(numOption(state, 'multiCursorLimit', 10000)))
    if (sel.ranges.length <= limit) return sel
    return EditorSelection.create(sel.ranges.slice(0, limit), sel.mainIndex < limit ? sel.mainIndex : 0, sel.keepOverlap)
}

/**
 * multiCursorMergeOverlapping(默认 true):false 时光标移动 / 扩选后重叠、重合的多光标不合并(Monaco CursorCollection.normalize 直接返回)。
 * 返回给 EditorSelection.create 的 keepOverlap。目前覆盖光标移动 / 扩选(←→、↑↓、Home/End、按词…)与输入 / 删除(changeByRange);
 * ⌘D、全选匹配、列选择等「新建多光标」的路径仍合并。
 */
export function keepOverlappingCursors(state: EditorState): boolean {
    return !boolOption(state, 'multiCursorMergeOverlapping', true)
}

/** bracketPairColorization.enabled(默认 true)/ independentColorPoolPerBracketType(默认 false) */
export function bracketPairColorization(state: EditorState): { enabled: boolean, independentColorPoolPerBracketType: boolean } {
    const c = getOption(state, 'bracketPairColorization') as { enabled?: unknown, independentColorPoolPerBracketType?: unknown } | undefined
    return {
        enabled: typeof c?.enabled === 'boolean' ? c.enabled : true,
        independentColorPoolPerBracketType: typeof c?.independentColorPoolPerBracketType === 'boolean' ? c.independentColorPoolPerBracketType : false,
    }
}

/** comments.insertSpace / comments.ignoreEmptyLines(默认都是 true) */
export function commentsOptions(state: EditorState): { insertSpace: boolean, ignoreEmptyLines: boolean } {
    const c = getOption(state, 'comments') as { insertSpace?: unknown, ignoreEmptyLines?: unknown } | undefined
    return {
        insertSpace: typeof c?.insertSpace === 'boolean' ? c.insertSpace : true,
        ignoreEmptyLines: typeof c?.ignoreEmptyLines === 'boolean' ? c.ignoreEmptyLines : true,
    }
}

export function boolOption(state: EditorState, name: string, fallback: boolean): boolean {
    const v = getOption(state, name)
    return typeof v === 'boolean' ? v : fallback
}

export function numOption(state: EditorState, name: string, fallback: number): number {
    const v = getOption(state, name)
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function stringOption(state: EditorState, name: string, fallback: string): string {
    const v = getOption(state, name)
    return typeof v === 'string' ? v : fallback
}
