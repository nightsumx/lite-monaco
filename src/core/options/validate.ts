// 选项校验:raw → validated。逐项照 monaco-editor 的 vs/editor/common/config/editorOptions.js 里各选项的 validate 移植,
// 辅助函数(boolean / clampedInt / clampedFloat / stringSet / primitiveSet…)与 Monaco 的语义完全一致
// (含 undefined / null / 错误类型 / 越界时回落默认值或夹取)。
//
// 校验的对象是 raw 形态(宿主传进来的 IEditorOptions);输出是 Monaco 的 "validated" 值,
// 还要经 compute.ts(依赖环境的 compute())才是 getOption() 返回的 computed 值。
//
// 与 Monaco 逐字相同的"怪癖"也保留(对照测试里有专门的用例):
//   - suggest.snippetsPreventQuickSuggestions 的默认值取的是 filterGraceful 的默认值(true);
//   - rulers 里的 color 原样透传;
//   - 数组也算 object(`find: []` 会走对象分支,每个字段回落默认值)。
// 唯一的差别:Monaco 的 inlayHints.validate 会把 input.enabled 的布尔值写回 input(改了入参),这里不改入参,结果相同。
//
// ── Monaco 0.55 新增选项:已校验(默认值与 Monaco 一致)但【未生效】的清单 ──
// 只过 validate / compute、能 getOption 读到,行为层没接。
// 已接行为的 0.55 新选项(不在清单里):allowVariableLineHeights / effectiveAllowVariableFonts(装饰过滤)、
//   cursorHeight / overtypeCursorStyle / effectiveCursorStyle(光标)、minimap.autohide 'mouseover'|'scroll'、autoIndentOnPaste(WithinString)、overtypeOnPaste、
//   selectionHighlightMaxLength / selectionHighlightMultiline(feature/selectionlayer.ts selectionHighlightRanges)、
//   occurrencesHighlightDelay(selectionlayer.ts highlightLayer 的同词高亮防抖)、trimWhitespaceOnDelete(edit/commands.ts deleteCharTarget)、
//   find.findOnType / find.history / find.replaceHistory(feature/search.ts searchPanel)、
//   mouseMiddleClickAction(feature/link.ts linkDetector + input/mouseselection.ts armDefinitionClick)、
//   scrollOnMiddleClick(input/middlescroll.ts + mouseselection.ts 中键不再列选)、wrapOnEscapedLineFeeds(view/softwrap.ts 文本侧折行 + feature/escapedlf.ts 浏览器折行装饰)、
//   inlayHints.maximumLength(lang/tsinlay.ts inlayDecorations)、allowOverflow(api/widgets.ts 的 allowEditorOverflow 总闸)。
// 仍【未生效】(有意不做):
//   allowVariableFonts, allowVariableFontsInAccessibilityMode(只经 effectiveAllowVariableFonts 间接生效)、
//   experimentalGpuAcceleration, renderRichScreenReaderContent, inertialScroll,
//   editContext / effectiveEditContext(恒 false:lite-monaco 的 EditContext 只服务 Android,与选项无关)、
//   inlineSuggest.edits.* / inlineSuggest.experimental.* / inlineSuggest.triggerCommandOnProviderChange 等 0.55 新字段(旧字段 enabled/keepOnBlur/suppressSuggestions 仍生效)。
// 效果的边界(与 Monaco 的已知差别):
//   allowOverflow 只管 api/widgets.ts 的内容挂件(allowEditorOverflow);补全 / hover 弹层本来就挂 body 的 position:fixed,没有「被编辑器裁」的状态,不受它控制。
//   find.history / replaceHistory 'workspace' = 同页所有编辑器共享一份内存历史(Monaco 存 workspace storage;standalone 无持久化),不落盘。
//   wrapOnEscapedLineFeeds 在浏览器折行(wordWrap on / bounded / 视口宽)下靠 CSS 伪元素强制换行,没有 Monaco 那种视图行投影;固定列折行走文本侧折行模型,与 Monaco 同。
// 已迁移:experimentalInlineEdit → inlineSuggest.edits(merge.ts 里 codeShifting → allowCodeShifting);
//        minimap.autohide 布尔 → 'none'|'mouseover'|'scroll'(布尔入参按 Monaco validate 回落 'none')。
import type { KeyOS } from '../keyos'
import { EDITOR_DEFAULTS, EDITOR_OPTION_NAMES, OPTION_SPECS, PLATFORM_DEFAULTS } from './generated'
import {
    AccessibilitySupport, EditorOption, RenderLineNumbersType, ScrollbarVisibility, WrappingIndent,
    type ComputedEditorOptionValues, type IEditorFindOptions, type IEditorOptions, type IRulerOption,
} from './types'

// ---- 辅助函数(Monaco 里 export 的和 EditorXxxOption 的静态方法) ----

/** Monaco `boolean()`:undefined → 默认;字符串 'false' → false;其余 Boolean(value) */
export function boolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'undefined') return defaultValue
    if (value === 'false') return false
    return Boolean(value)
}

/** minimap.markSectionHeaderRegex 的校验(Monaco 0.55 EditorMinimap.validate):字符串且能编译成带 d 标志的正则才收,否则默认值 */
function validRegexSource(value: unknown, defaultValue: string): string {
    if (typeof value !== 'string') return defaultValue
    try { new RegExp(value, 'd'); return value } catch { return defaultValue }
}

/** Monaco `clampedInt()`(0.55):字符串先 parseInt;不是数字 / NaN → 默认;否则夹到 [minimum, maximum] 再 |0 */
export function clampedInt<D>(value: unknown, defaultValue: D, minimum: number, maximum: number): number | D {
    if (typeof value === 'string') value = parseInt(value, 10)
    if (typeof value !== 'number' || isNaN(value)) return defaultValue
    let r = value
    r = Math.max(minimum, r)
    r = Math.min(maximum, r)
    return r | 0
}

/** Monaco `EditorFloatOption.clamp` */
export function clamp(n: number, min: number, max: number): number {
    if (n < min) return min
    if (n > max) return max
    return n
}

/** Monaco `EditorFloatOption.float`(0.55):字符串先 parseFloat;不是数字 / NaN → 默认;数字原样(含 Infinity) */
export function float(value: unknown, defaultValue: number): number {
    if (typeof value === 'string') value = parseFloat(value)
    if (typeof value !== 'number' || isNaN(value)) return defaultValue
    return value
}

/** Monaco `clampedFloat()` */
export function clampedFloat(value: unknown, defaultValue: number, minimum: number, maximum: number): number {
    if (typeof value === 'undefined') return defaultValue
    return clamp(float(value, defaultValue), minimum, maximum)
}

/** Monaco `EditorStringOption.string` */
export function string(value: unknown, defaultValue: string): string {
    if (typeof value !== 'string') return defaultValue
    return value
}

/** Monaco `stringSet()`:不是字符串 → 默认;在 renamedValues 里 → 改名后的值;不在 allowedValues 里 → 默认 */
export function stringSet<T extends string>(value: unknown, defaultValue: T, allowedValues: readonly T[], renamedValues?: Record<string, T>): T {
    if (typeof value !== 'string') return defaultValue
    if (renamedValues && value in renamedValues) return renamedValues[value]
    if (allowedValues.indexOf(value as T) === -1) return defaultValue
    return value as T
}

/** Monaco `primitiveSet()`:任意原始值的 stringSet(用于 true / false / 'xxx' 混合的集合) */
export function primitiveSet<T extends string | boolean>(value: unknown, defaultValue: T, allowedValues: readonly T[]): T {
    const idx = allowedValues.indexOf(value as T)
    if (idx === -1) return defaultValue
    return allowedValues[idx]
}

// ---- 平台默认值 ----

/** 某个平台的默认值(Monaco 的 fontFamily / fontSize / renderFinalNewline 随平台变)。取 computed 形态的默认,即不设任何选项时 getOption() 之前的 validated 值 */
export function defaultsFor(os: KeyOS): Record<string, unknown> {
    return os === 'win' ? { ...EDITOR_DEFAULTS, ...PLATFORM_DEFAULTS.win }
        : os === 'linux' ? { ...EDITOR_DEFAULTS, ...PLATFORM_DEFAULTS.linux }
            : EDITOR_DEFAULTS
}

export interface ValidateContext {
    /** Monaco 的 OS 三分;只影响默认值和 multiCursorModifier 的 ctrlCmd 映射 */
    readonly os: KeyOS
    /** 该平台的默认值表(= Monaco 各选项的 defaultValue) */
    readonly defaults: Record<string, unknown>
}

export function validateContext(os: KeyOS): ValidateContext {
    return { os, defaults: defaultsFor(os) }
}

type Obj = Record<string, unknown>
type Validator = (input: unknown, ctx: ValidateContext) => unknown

const isObj = (input: unknown): input is Obj => !!input && typeof input === 'object'

/** 复杂选项里常见的开头:不是对象就回落默认值 */
function objectOption<K extends keyof ComputedEditorOptionValues>(name: K, fn: (input: Obj, d: ComputedEditorOptionValues[K], ctx: ValidateContext) => unknown): Validator {
    return (input, ctx) => {
        const d = ctx.defaults[name] as ComputedEditorOptionValues[K]
        if (!isObj(input)) return d
        return fn(input, d, ctx)
    }
}

const defaultsOf = (ctx: ValidateContext): ComputedEditorOptionValues => ctx.defaults as unknown as ComputedEditorOptionValues

function scrollbarVisibility(visibility: unknown, defaultValue: ScrollbarVisibility): ScrollbarVisibility {
    if (typeof visibility !== 'string') return defaultValue
    switch (visibility) {
        case 'hidden': return ScrollbarVisibility.Hidden
        case 'visible': return ScrollbarVisibility.Visible
        default: return ScrollbarVisibility.Auto
    }
}

function validateBooleanMap(map: unknown, defaultValue: Record<string, true>): Record<string, true> {
    if (typeof map !== 'object' || !map) return defaultValue
    const result: Record<string, true> = {}
    for (const [key, value] of Object.entries(map)) {
        if (value === true) result[key] = true
    }
    return result
}

/** fontLigatures / fontVariations 的取值常量(Monaco EditorFontLigatures / EditorFontVariations) */
export const FONT_LIGATURES_OFF = '"liga" off, "calt" off'
export const FONT_LIGATURES_ON = '"liga" on, "calt" on'
export const FONT_VARIATIONS_OFF = 'normal'
export const FONT_VARIATIONS_TRANSLATE = 'translate'

// Monaco 的 d.ts 把这几块标了 @internal(没导出),但 validate / 默认值里真实存在,这里补类型
interface InlineSuggestEdits { enabled: boolean, showCollapsed: boolean, allowCodeShifting: 'always' | 'horizontal' | 'never', renderSideBySide: 'never' | 'auto' }
interface InlineSuggestExperimental { suppressInlineSuggestions: string, showOnSuggestConflict: 'always' | 'never' | 'whenSuggestListIsIncomplete', emptyResponseInformation: boolean }
type InlineSuggestInternal = ComputedEditorOptionValues['inlineSuggest'] & { edits: InlineSuggestEdits, triggerCommandOnProviderChange: boolean, experimental: InlineSuggestExperimental }
type FindInternal = Readonly<Required<IEditorFindOptions>> & { globalFindClipboard: boolean, history: 'never' | 'workspace', replaceHistory: 'never' | 'workspace' }

function validateInlineSuggestEdits(input: unknown, d: InlineSuggestEdits): InlineSuggestEdits {
    if (!isObj(input)) return d
    return {
        enabled: boolean(input.enabled, d.enabled),
        showCollapsed: boolean(input.showCollapsed, d.showCollapsed),
        allowCodeShifting: stringSet(input.allowCodeShifting, d.allowCodeShifting, ['always', 'horizontal', 'never']),
        renderSideBySide: stringSet(input.renderSideBySide, d.renderSideBySide, ['never', 'auto']),
    }
}

function validateInlineSuggestExperimental(input: unknown, d: InlineSuggestExperimental): InlineSuggestExperimental {
    if (!isObj(input)) return d
    return {
        suppressInlineSuggestions: string(input.suppressInlineSuggestions, d.suppressInlineSuggestions),
        showOnSuggestConflict: stringSet(input.showOnSuggestConflict, d.showOnSuggestConflict, ['always', 'never', 'whenSuggestListIsIncomplete']),
        emptyResponseInformation: boolean(input.emptyResponseInformation, d.emptyResponseInformation),
    }
}

const ON_OFF_INLINE = ['on', 'inline', 'off'] as const
const PEEK3 = ['peek', 'gotoAndPeek', 'goto'] as const
const IN_UNTRUSTED = 'inUntrustedWorkspace' as const
const TRI = [true, false, IN_UNTRUSTED] as const

function quickSuggestionValue(input: unknown, def: 'on' | 'inline' | 'off'): 'on' | 'inline' | 'off' {
    if (typeof input === 'boolean') return input ? 'on' : 'off'
    return stringSet(input, def, ON_OFF_INLINE)
}

/**
 * 复杂选项(不能只靠 OPTION_SPECS 描述的)的 validate,逐个照 Monaco 移植。
 * 也包含几个 Monaco 里是 EditorFloatOption / EditorEnumOption 但带自定义函数或随平台变的:
 * fastScrollSensitivity、letterSpacing、mouseWheelScrollSensitivity、multiCursorModifier。
 */
export const VALIDATORS: Record<string, Validator> = {
    accessibilitySupport: (input, ctx) => {
        switch (input) {
            case 'auto': return AccessibilitySupport.Unknown
            case 'off': return AccessibilitySupport.Disabled
            case 'on': return AccessibilitySupport.Enabled
        }
        return ctx.defaults.accessibilitySupport
    },
    bracketPairColorization: objectOption('bracketPairColorization', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        independentColorPoolPerBracketType: boolean(input.independentColorPoolPerBracketType, d.independentColorPoolPerBracketType),
    })),
    guides: objectOption('guides', (input, d) => ({
        bracketPairs: primitiveSet<boolean | 'active'>(input.bracketPairs, d.bracketPairs, [true, false, 'active']),
        bracketPairsHorizontal: primitiveSet<boolean | 'active'>(input.bracketPairsHorizontal, d.bracketPairsHorizontal, [true, false, 'active']),
        highlightActiveBracketPair: boolean(input.highlightActiveBracketPair, d.highlightActiveBracketPair),
        indentation: boolean(input.indentation, d.indentation),
        highlightActiveIndentation: primitiveSet<boolean | 'always'>(input.highlightActiveIndentation, d.highlightActiveIndentation, [true, false, 'always']),
    })),
    comments: objectOption('comments', (input, d) => ({
        insertSpace: boolean(input.insertSpace, d.insertSpace),
        ignoreEmptyLines: boolean(input.ignoreEmptyLines, d.ignoreEmptyLines),
    })),
    emptySelectionClipboard: (input, ctx) => boolean(input, ctx.defaults.emptySelectionClipboard as boolean),
    dropIntoEditor: objectOption('dropIntoEditor', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        showDropSelector: stringSet(input.showDropSelector, d.showDropSelector, ['afterDrop', 'never']),
    })),
    stickyScroll: objectOption('stickyScroll', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        maxLineCount: clampedInt(input.maxLineCount, d.maxLineCount, 1, 20),
        defaultModel: stringSet(input.defaultModel, d.defaultModel, ['outlineModel', 'foldingProviderModel', 'indentationModel']),
        scrollWithEditor: boolean(input.scrollWithEditor, d.scrollWithEditor),
    })),
    find: (_input, ctx) => {
        // Monaco 的 d.ts 里 IEditorFindOptions 没列 globalFindClipboard / history / replaceHistory(@internal),这里补上
        const d = defaultsOf(ctx).find as FindInternal
        if (!isObj(_input)) return d
        const input = _input
        return {
            cursorMoveOnType: boolean(input.cursorMoveOnType, d.cursorMoveOnType),
            findOnType: boolean(input.findOnType, d.findOnType),
            seedSearchStringFromSelection: typeof input.seedSearchStringFromSelection === 'boolean'
                ? (input.seedSearchStringFromSelection ? 'always' : 'never')
                : stringSet(input.seedSearchStringFromSelection, d.seedSearchStringFromSelection, ['never', 'always', 'selection']),
            autoFindInSelection: typeof input.autoFindInSelection === 'boolean'
                ? (input.autoFindInSelection ? 'always' : 'never')
                : stringSet(input.autoFindInSelection, d.autoFindInSelection, ['never', 'always', 'multiline']),
            globalFindClipboard: boolean(input.globalFindClipboard, d.globalFindClipboard),
            addExtraSpaceOnTop: boolean(input.addExtraSpaceOnTop, d.addExtraSpaceOnTop),
            loop: boolean(input.loop, d.loop),
            history: stringSet(input.history, d.history, ['never', 'workspace']),
            replaceHistory: stringSet(input.replaceHistory, d.replaceHistory, ['never', 'workspace']),
        }
    },
    fontLigatures: (input, ctx) => {
        if (typeof input === 'undefined') return ctx.defaults.fontLigatures
        if (typeof input === 'string') {
            if (input === 'false' || input.length === 0) return FONT_LIGATURES_OFF
            if (input === 'true') return FONT_LIGATURES_ON
            return input
        }
        if (Boolean(input)) return FONT_LIGATURES_ON
        return FONT_LIGATURES_OFF
    },
    fontSize: (input, ctx) => {
        const def = ctx.defaults.fontSize as number
        const r = float(input, def)
        if (r === 0) return def // Monaco 取 EDITOR_FONT_DEFAULTS.fontSize,与该平台的默认相同
        return clamp(r, 6, 100)
    },
    fontWeight: (input, ctx) => {
        if (input === 'normal' || input === 'bold') return input
        // Monaco 把 EDITOR_FONT_DEFAULTS.fontWeight('normal')当默认值传给 clampedInt
        return String(clampedInt(input, ctx.defaults.fontWeight, 1, 1000))
    },
    fontVariations: (input, ctx) => {
        if (typeof input === 'undefined') return ctx.defaults.fontVariations
        if (typeof input === 'string') {
            if (input === 'false') return FONT_VARIATIONS_OFF
            if (input === 'true') return FONT_VARIATIONS_TRANSLATE
            return input
        }
        if (Boolean(input)) return FONT_VARIATIONS_TRANSLATE
        return FONT_VARIATIONS_OFF
    },
    gotoLocation: objectOption('gotoLocation', (input, d) => ({
        multiple: stringSet(input.multiple, d.multiple, PEEK3),
        multipleDefinitions: stringSet(input.multipleDefinitions, 'peek', PEEK3),
        multipleTypeDefinitions: stringSet(input.multipleTypeDefinitions, 'peek', PEEK3),
        multipleDeclarations: stringSet(input.multipleDeclarations, 'peek', PEEK3),
        multipleImplementations: stringSet(input.multipleImplementations, 'peek', PEEK3),
        multipleReferences: stringSet(input.multipleReferences, 'peek', PEEK3),
        multipleTests: stringSet(input.multipleTests, 'peek', PEEK3),
        alternativeDefinitionCommand: string(input.alternativeDefinitionCommand, d.alternativeDefinitionCommand),
        alternativeTypeDefinitionCommand: string(input.alternativeTypeDefinitionCommand, d.alternativeTypeDefinitionCommand),
        alternativeDeclarationCommand: string(input.alternativeDeclarationCommand, d.alternativeDeclarationCommand),
        alternativeImplementationCommand: string(input.alternativeImplementationCommand, d.alternativeImplementationCommand),
        alternativeReferenceCommand: string(input.alternativeReferenceCommand, d.alternativeReferenceCommand),
        alternativeTestsCommand: string(input.alternativeTestsCommand, d.alternativeTestsCommand),
    })),
    hover: objectOption('hover', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        delay: clampedInt(input.delay, d.delay, 0, 10000),
        sticky: boolean(input.sticky, d.sticky),
        hidingDelay: clampedInt(input.hidingDelay, d.hidingDelay, 0, 600000),
        above: boolean(input.above, d.above),
    })),
    lightbulb: objectOption('lightbulb', (input, d) => ({
        enabled: stringSet(input.enabled, d.enabled, ['off', 'onCode', 'on']),
    })),
    lineDecorationsWidth: (input, ctx) => {
        if (typeof input === 'string' && /^\d+(\.\d+)?ch$/.test(input)) {
            const multiple = parseFloat(input.substring(0, input.length - 2))
            return -multiple // 负数表示 ch 的倍数,由 compute 换算成像素
        }
        return clampedInt(input, ctx.defaults.lineDecorationsWidth, 0, 1000)
    },
    lineHeight: (input, ctx) => clamp(float(input, ctx.defaults.lineHeight as number), 0, 150),
    lineNumbers: (lineNumbers, ctx) => {
        const d = defaultsOf(ctx).lineNumbers
        let renderType: RenderLineNumbersType = d.renderType
        let renderFn = d.renderFn
        if (typeof lineNumbers !== 'undefined') {
            if (typeof lineNumbers === 'function') {
                renderType = RenderLineNumbersType.Custom
                renderFn = lineNumbers as (lineNumber: number) => string
            } else if (lineNumbers === 'interval') {
                renderType = RenderLineNumbersType.Interval
            } else if (lineNumbers === 'relative') {
                renderType = RenderLineNumbersType.Relative
            } else if (lineNumbers === 'on') {
                renderType = RenderLineNumbersType.On
            } else {
                renderType = RenderLineNumbersType.Off
            }
        }
        return { renderType, renderFn }
    },
    minimap: objectOption('minimap', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        autohide: stringSet(input.autohide, d.autohide, ['none', 'mouseover', 'scroll']),
        size: stringSet(input.size, d.size, ['proportional', 'fill', 'fit']),
        side: stringSet(input.side, d.side, ['right', 'left']),
        showSlider: stringSet(input.showSlider, d.showSlider, ['always', 'mouseover']),
        renderCharacters: boolean(input.renderCharacters, d.renderCharacters),
        scale: clampedInt(input.scale, 1, 1, 3),
        maxColumn: clampedInt(input.maxColumn, d.maxColumn, 1, 10000),
        showRegionSectionHeaders: boolean(input.showRegionSectionHeaders, d.showRegionSectionHeaders),
        showMarkSectionHeaders: boolean(input.showMarkSectionHeaders, d.showMarkSectionHeaders),
        markSectionHeaderRegex: validRegexSource(input.markSectionHeaderRegex, d.markSectionHeaderRegex as string),
        sectionHeaderFontSize: clamp(float(input.sectionHeaderFontSize, d.sectionHeaderFontSize), 4, 32),
        sectionHeaderLetterSpacing: clamp(float(input.sectionHeaderLetterSpacing, d.sectionHeaderLetterSpacing), 0, 5),
    })),
    padding: objectOption('padding', input => ({
        top: clampedInt(input.top, 0, 0, 1000),
        bottom: clampedInt(input.bottom, 0, 0, 1000),
    })),
    pasteAs: objectOption('pasteAs', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        showPasteSelector: stringSet(input.showPasteSelector, d.showPasteSelector, ['afterPaste', 'never']),
    })),
    parameterHints: objectOption('parameterHints', (input, d) => ({
        enabled: boolean(input.enabled, d.enabled),
        cycle: boolean(input.cycle, d.cycle),
    })),
    placeholder: (input, ctx) => {
        if (typeof input === 'undefined') return ctx.defaults.placeholder
        if (typeof input === 'string') return input
        return ctx.defaults.placeholder
    },
    quickSuggestions: (input, ctx) => {
        if (typeof input === 'boolean') {
            // boolean → 三项全开 / 全关
            const value = input ? 'on' : 'off'
            return { comments: value, strings: value, other: value }
        }
        if (!input || typeof input !== 'object') return ctx.defaults.quickSuggestions // 非法对象
        const d = defaultsOf(ctx).quickSuggestions
        const { other, comments, strings } = input as Obj
        return {
            other: quickSuggestionValue(other, d.other),
            comments: quickSuggestionValue(comments, d.comments),
            strings: quickSuggestionValue(strings, d.strings),
        }
    },
    readOnlyMessage: (input, ctx) => {
        if (!isObj(input)) return ctx.defaults.readOnlyMessage
        return input // 原样放行(IMarkdownString)
    },
    rulers: (input, ctx) => {
        if (Array.isArray(input)) {
            const rulers: { column: number, color: unknown }[] = []
            for (const _element of input) {
                if (typeof _element === 'number') {
                    rulers.push({ column: clampedInt(_element, 0, 0, 10000), color: null })
                } else if (_element && typeof _element === 'object') {
                    const element = _element as Obj
                    rulers.push({ column: clampedInt(element.column, 0, 0, 10000), color: element.color })
                }
            }
            rulers.sort((a, b) => a.column - b.column)
            return rulers as IRulerOption[]
        }
        return ctx.defaults.rulers
    },
    scrollbar: objectOption('scrollbar', (input, d) => {
        const horizontalScrollbarSize = clampedInt(input.horizontalScrollbarSize, d.horizontalScrollbarSize, 0, 1000)
        const verticalScrollbarSize = clampedInt(input.verticalScrollbarSize, d.verticalScrollbarSize, 0, 1000)
        return {
            arrowSize: clampedInt(input.arrowSize, d.arrowSize, 0, 1000),
            vertical: scrollbarVisibility(input.vertical, d.vertical),
            horizontal: scrollbarVisibility(input.horizontal, d.horizontal),
            useShadows: boolean(input.useShadows, d.useShadows),
            verticalHasArrows: boolean(input.verticalHasArrows, d.verticalHasArrows),
            horizontalHasArrows: boolean(input.horizontalHasArrows, d.horizontalHasArrows),
            handleMouseWheel: boolean(input.handleMouseWheel, d.handleMouseWheel),
            alwaysConsumeMouseWheel: boolean(input.alwaysConsumeMouseWheel, d.alwaysConsumeMouseWheel),
            horizontalScrollbarSize,
            horizontalSliderSize: clampedInt(input.horizontalSliderSize, horizontalScrollbarSize, 0, 1000),
            verticalScrollbarSize,
            verticalSliderSize: clampedInt(input.verticalSliderSize, verticalScrollbarSize, 0, 1000),
            scrollByPage: boolean(input.scrollByPage, d.scrollByPage),
            ignoreHorizontalScrollbarInContentHeight: boolean(input.ignoreHorizontalScrollbarInContentHeight, d.ignoreHorizontalScrollbarInContentHeight),
        }
    }),
    inlayHints: objectOption('inlayHints', (input, d) => {
        const enabled = typeof input.enabled === 'boolean' ? (input.enabled ? 'on' : 'off') : input.enabled
        return {
            enabled: stringSet(enabled, d.enabled, ['on', 'off', 'offUnlessPressed', 'onUnlessPressed']),
            fontSize: clampedInt(input.fontSize, d.fontSize, 0, 100),
            fontFamily: string(input.fontFamily, d.fontFamily),
            padding: boolean(input.padding, d.padding),
            maximumLength: clampedInt(input.maximumLength, d.maximumLength, 0, Number.MAX_SAFE_INTEGER),
        }
    }),
    smartSelect: objectOption('smartSelect', (input, d) => ({
        selectLeadingAndTrailingWhitespace: boolean(input.selectLeadingAndTrailingWhitespace, d.selectLeadingAndTrailingWhitespace),
        selectSubwords: boolean(input.selectSubwords, d.selectSubwords),
    })),
    suggest: objectOption('suggest', (input, d) => ({
        insertMode: stringSet(input.insertMode, d.insertMode, ['insert', 'replace']),
        filterGraceful: boolean(input.filterGraceful, d.filterGraceful),
        // Monaco 在这里取的是 filterGraceful 的默认值(true),不是自己的(false),照搬
        snippetsPreventQuickSuggestions: boolean(input.snippetsPreventQuickSuggestions, d.filterGraceful),
        localityBonus: boolean(input.localityBonus, d.localityBonus),
        shareSuggestSelections: boolean(input.shareSuggestSelections, d.shareSuggestSelections),
        selectionMode: stringSet(input.selectionMode, d.selectionMode, ['always', 'never', 'whenQuickSuggestion', 'whenTriggerCharacter']),
        showIcons: boolean(input.showIcons, d.showIcons),
        showStatusBar: boolean(input.showStatusBar, d.showStatusBar),
        preview: boolean(input.preview, d.preview),
        previewMode: stringSet(input.previewMode, d.previewMode, ['prefix', 'subword', 'subwordSmart']),
        showInlineDetails: boolean(input.showInlineDetails, d.showInlineDetails),
        showMethods: boolean(input.showMethods, d.showMethods),
        showFunctions: boolean(input.showFunctions, d.showFunctions),
        showConstructors: boolean(input.showConstructors, d.showConstructors),
        showDeprecated: boolean(input.showDeprecated, d.showDeprecated),
        matchOnWordStartOnly: boolean(input.matchOnWordStartOnly, d.matchOnWordStartOnly),
        showFields: boolean(input.showFields, d.showFields),
        showVariables: boolean(input.showVariables, d.showVariables),
        showClasses: boolean(input.showClasses, d.showClasses),
        showStructs: boolean(input.showStructs, d.showStructs),
        showInterfaces: boolean(input.showInterfaces, d.showInterfaces),
        showModules: boolean(input.showModules, d.showModules),
        showProperties: boolean(input.showProperties, d.showProperties),
        showEvents: boolean(input.showEvents, d.showEvents),
        showOperators: boolean(input.showOperators, d.showOperators),
        showUnits: boolean(input.showUnits, d.showUnits),
        showValues: boolean(input.showValues, d.showValues),
        showConstants: boolean(input.showConstants, d.showConstants),
        showEnums: boolean(input.showEnums, d.showEnums),
        showEnumMembers: boolean(input.showEnumMembers, d.showEnumMembers),
        showKeywords: boolean(input.showKeywords, d.showKeywords),
        showWords: boolean(input.showWords, d.showWords),
        showColors: boolean(input.showColors, d.showColors),
        showFiles: boolean(input.showFiles, d.showFiles),
        showReferences: boolean(input.showReferences, d.showReferences),
        showFolders: boolean(input.showFolders, d.showFolders),
        showTypeParameters: boolean(input.showTypeParameters, d.showTypeParameters),
        showSnippets: boolean(input.showSnippets, d.showSnippets),
        showUsers: boolean(input.showUsers, d.showUsers),
        showIssues: boolean(input.showIssues, d.showIssues),
    })),
    inlineSuggest: objectOption('inlineSuggest', (input, d0) => { const d = d0 as InlineSuggestInternal; return ({
        enabled: boolean(input.enabled, d.enabled),
        mode: stringSet(input.mode, d.mode, ['prefix', 'subword', 'subwordSmart']),
        showToolbar: stringSet(input.showToolbar, d.showToolbar, ['always', 'onHover', 'never']),
        suppressSuggestions: boolean(input.suppressSuggestions, d.suppressSuggestions),
        keepOnBlur: boolean(input.keepOnBlur, d.keepOnBlur),
        fontFamily: string(input.fontFamily, d.fontFamily),
        syntaxHighlightingEnabled: boolean(input.syntaxHighlightingEnabled, d.syntaxHighlightingEnabled),
        minShowDelay: clampedInt(input.minShowDelay, 0, 0, 10000),
        suppressInSnippetMode: boolean(input.suppressInSnippetMode, d.suppressInSnippetMode),
        edits: validateInlineSuggestEdits(input.edits, d.edits),
        triggerCommandOnProviderChange: boolean(input.triggerCommandOnProviderChange, d.triggerCommandOnProviderChange),
        experimental: validateInlineSuggestExperimental(input.experimental, d.experimental),
    }) }),
    unicodeHighlight: objectOption('unicodeHighlight', (input, d) => ({
        nonBasicASCII: primitiveSet<boolean | typeof IN_UNTRUSTED>(input.nonBasicASCII, IN_UNTRUSTED, TRI),
        invisibleCharacters: boolean(input.invisibleCharacters, d.invisibleCharacters),
        ambiguousCharacters: boolean(input.ambiguousCharacters, d.ambiguousCharacters),
        includeComments: primitiveSet<boolean | typeof IN_UNTRUSTED>(input.includeComments, IN_UNTRUSTED, TRI),
        includeStrings: primitiveSet<boolean | typeof IN_UNTRUSTED>(input.includeStrings, IN_UNTRUSTED, TRI),
        allowedCharacters: validateBooleanMap(input.allowedCharacters, d.allowedCharacters as Record<string, true>),
        allowedLocales: validateBooleanMap(input.allowedLocales, d.allowedLocales as Record<string, true>),
    })),
    wordSegmenterLocales: (input, ctx) => {
        if (typeof input === 'string') input = [input]
        if (Array.isArray(input)) {
            const validLocales: string[] = []
            for (const locale of input) {
                if (typeof locale === 'string') {
                    try {
                        if (Intl.Segmenter.supportedLocalesOf(locale).length > 0) validLocales.push(locale)
                    } catch {
                        // 非法的 locale 忽略
                    }
                }
            }
            return validLocales
        }
        return ctx.defaults.wordSegmenterLocales
    },
    wrappingIndent: input => {
        switch (input) {
            case 'none': return WrappingIndent.None
            case 'same': return WrappingIndent.Same
            case 'indent': return WrappingIndent.Indent
            case 'deepIndent': return WrappingIndent.DeepIndent
        }
        return WrappingIndent.Same
    },
    wrappingStrategy: input => stringSet(input, 'simple', ['simple', 'advanced']),

    // ---- Monaco 里是 EditorFloatOption / EditorEnumOption,但带自定义函数或随平台变 ----
    fastScrollSensitivity: (input, ctx) => { const x = float(input, ctx.defaults.fastScrollSensitivity as number); return x <= 0 ? 5 : x },
    letterSpacing: (input, ctx) => clamp(float(input, ctx.defaults.letterSpacing as number), -5, 20),
    mouseWheelScrollSensitivity: (input, ctx) => { const x = float(input, ctx.defaults.mouseWheelScrollSensitivity as number); return x === 0 ? 1 : x },
    multiCursorModifier: (input, ctx) => {
        if (typeof input !== 'string') return ctx.defaults.multiCursorModifier
        if (input !== 'ctrlCmd' && input !== 'alt') return ctx.defaults.multiCursorModifier
        // ctrlCmd:mac 上是 ⌘,其余是 Ctrl
        return input === 'ctrlCmd' ? (ctx.os === 'mac' ? 'metaKey' : 'ctrlKey') : 'altKey'
    },
}

// ---- 简单选项:靠 OPTION_SPECS 通用校验 ----

function validateBySpec(name: string, input: unknown, ctx: ValidateContext): unknown {
    const spec = OPTION_SPECS[name]
    const def = ctx.defaults[name]
    switch (spec.t) {
        case 'bool': return boolean(input, def as boolean)
        case 'int': return clampedInt(input, def, spec.min, spec.max)
        case 'float': return float(input, def as number)
        case 'string': return string(input, def as string)
        case 'enum': return stringSet(input, def as string, spec.values)
        case 'enumMap': {
            // Monaco EditorEnumOption:不是字符串或不在允许集合里 → 默认值,否则转成数值
            if (typeof input !== 'string') return def
            if (spec.values.indexOf(input) === -1) return def
            return spec.map[input]
        }
    }
}

/** 校验单个选项(name 是 IEditorOptions 的键)。没有校验器的名字(计算项 `_never_`)会抛错 */
export function validateOption(name: string, input: unknown, ctx: ValidateContext): unknown {
    const custom = VALIDATORS[name]
    if (custom) return custom(input, ctx)
    if (OPTION_SPECS[name]) return validateBySpec(name, input, ctx)
    throw new Error(`no validator for editor option "${name}"`)
}

/** 计算项没有 raw 名字(Monaco 里 name 是 '_never_'),只有 EditorOption 成员名 */
export const COMPUTED_ONLY: Readonly<Record<number, string>> = {
    [EditorOption.fontInfo]: 'fontInfo',
    [EditorOption.editorClassName]: 'editorClassName',
    [EditorOption.pixelRatio]: 'pixelRatio',
    [EditorOption.layoutInfo]: 'layoutInfo',
    [EditorOption.wrappingInfo]: 'wrappingInfo',
    [EditorOption.effectiveCursorStyle]: 'effectiveCursorStyle',
    [EditorOption.effectiveEditContext]: 'effectiveEditContext',
    [EditorOption.effectiveAllowVariableFonts]: 'effectiveAllowVariableFonts',
}

/** EditorOption 的值 → 选项在 computed 表里的 key(有名字的用选项名,计算项用成员名) */
export const OPTION_KEYS: readonly string[] = EDITOR_OPTION_NAMES.map((n, id) => (n === '_never_' ? COMPUTED_ONLY[id] : n))

/** 校验整份 raw,按 Monaco 的 validateOptions:每个选项都过一遍自己的 validate(没给的当 undefined),计算项跳过 */
export function validateOptions(raw: IEditorOptions, os: KeyOS): Record<string, unknown> {
    const ctx = validateContext(os)
    const input = raw as Record<string, unknown>
    const out: Record<string, unknown> = {}
    EDITOR_OPTION_NAMES.forEach(name => {
        if (name === '_never_') return
        out[name] = validateOption(name, input[name], ctx)
    })
    return out
}
