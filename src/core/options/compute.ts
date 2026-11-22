// validated → computed:Monaco 各选项的 compute(env, options, value),以及 BareFontInfo._create、EditorLayoutInfoComputer。
// 照 vs/editor/common/config/editorOptions.js 与 common/config/fontInfo.js 移植,不依赖 DOM。
//
// 依赖 DOM / 平台的输入全部由 `ComputeEnv` 传入,**留给视图层**(editorview)提供真值;没传时用下面 defaultEnv 里的无头默认:
//   - measureFont      字体度量(Monaco 的 FontMeasurements.readFontInfo:建隐藏 DOM 量字宽)→ fontInfo 的
//                      typicalHalfwidthCharacterWidth / maxDigitWidth / spaceWidth / isMonospace… 无头时按 0.6em 估算
//   - outerWidth/outerHeight  容器尺寸(ElementSizeObserver)→ layoutInfo 的宽高、minimap 布局、wrappingColumn。无头时为 0
//   - pixelRatio       devicePixelRatio(PixelRatio)。无头时 1
//   - accessibilitySupport    读屏检测(IAccessibilityService)。无头时 Unknown
//   - emptySelectionClipboard Monaco 只在 WebKit / Firefox 上开(UA 检测)。无头时 true(Chrome 也是 WebKit)
//   - extraEditorClassName    UA 相关的 class(no-user-select / enable-user-select / mac)。无头时按 os 给
//   - isDominatedByLongLines / viewLineCount / lineNumbersDigitCount / glyphMarginDecorationLaneCount  来自 model / view
//   - zoomLevel        EditorZoom.getZoomLevel()(Monaco 里是全局单例,这里作为输入;isSimpleWidget 时忽略)
// 这几个计算项的**算法**在这里,**输入**由视图层给:fontInfo、fontSize、lineHeight、lineDecorationsWidth('ch' 倍数)、
// fontVariations、emptySelectionClipboard、accessibilitySupport、editorClassName、pixelRatio、layoutInfo、wrappingInfo、
// wrappingIndent、wrappingStrategy。
import type { KeyOS } from '../keyos'
import { BareFontInfo as BareFontInfoClass, FontInfo as FontInfoClass } from './fontclasses'
import { FONT_VARIATIONS_OFF, FONT_VARIATIONS_TRANSLATE, clampedInt } from './validate'
import {
    AccessibilitySupport, RenderMinimap, WrappingIndent,
    type BareFontInfo, type FontInfo, type ComputedEditorOptionValues, type EditorLayoutInfo, type EditorMinimapLayoutInfo,
    type IEditorMinimapOptions,
} from './types'

/** Monaco MINIMAP_GUTTER_WIDTH */
export const MINIMAP_GUTTER_WIDTH = 8

/** Monaco ComputeOptionsMemory:minimap fit / fill 在视口换行时防抖用 */
export class ComputeOptionsMemory {
    stableMinimapLayoutInput: MinimapLayoutInput | null = null
    stableFitMaxMinimapScale = 0
    stableFitRemainingWidth = 0
}

export interface ComputeEnv {
    memory: ComputeOptionsMemory
    outerWidth: number
    outerHeight: number
    /** 字体度量;不传 → 按 0.6em 估算 */
    measureFont: (bare: BareFontInfo) => FontInfo
    extraEditorClassName: string
    isDominatedByLongLines: boolean
    viewLineCount: number
    lineNumbersDigitCount: number
    emptySelectionClipboard: boolean
    pixelRatio: number
    /** Monaco InputMode:overtype 时 effectiveCursorStyle 取 overtypeCursorStyle */
    inputMode: 'insert' | 'overtype'
    accessibilitySupport: AccessibilitySupport
    glyphMarginDecorationLaneCount: number
    /** EditorZoom 级别(每级 10% 字号 / 行高) */
    zoomLevel: number
    /** 宿主支持 EditContext API(effectiveEditContext = 支持 && editContext 选项);lite-monaco 走 contenteditable,恒 false */
    editContextSupported: boolean
    /** Monaco isSimpleWidget:true 时不吃 zoom */
    isSimpleWidget: boolean
}

/** 无头估算的字体度量:等宽、半角 0.6em(Menlo / Consolas 都在这附近)。视图层应传真测的 measureFont */
export function estimateFontInfo(bare: BareFontInfo): FontInfo {
    const half = bare.fontSize * 0.6 + bare.letterSpacing
    return new FontInfoClass({
        ...bare,
        isMonospace: true,
        typicalHalfwidthCharacterWidth: half,
        typicalFullwidthCharacterWidth: bare.fontSize + bare.letterSpacing,
        canUseHalfwidthRightwardsArrow: true,
        spaceWidth: half,
        middotWidth: half,
        wsmiddotWidth: half,
        maxDigitWidth: half,
    }, false)
}

export function defaultEnv(os: KeyOS): ComputeEnv {
    return {
        memory: new ComputeOptionsMemory(),
        outerWidth: 0,
        outerHeight: 0,
        measureFont: estimateFontInfo,
        extraEditorClassName: 'no-user-select ' + (os === 'mac' ? 'mac ' : ''),
        isDominatedByLongLines: false,
        viewLineCount: 1,
        lineNumbersDigitCount: 1,
        emptySelectionClipboard: true,
        pixelRatio: 1,
        inputMode: 'insert',
        editContextSupported: false,
        accessibilitySupport: AccessibilitySupport.Unknown,
        glyphMarginDecorationLaneCount: 1,
        zoomLevel: 0,
        isSimpleWidget: false,
    }
}

// ---- BareFontInfo._create(fontInfo.js) ----

/** Monaco GOLDEN_LINE_HEIGHT_RATIO:mac 1.5,其余 1.35 */
const goldenLineHeightRatio = (os: KeyOS) => (os === 'mac' ? 1.5 : 1.35)
const MINIMUM_LINE_HEIGHT = 8

/** Monaco `BareFontInfo.createFromValidatedSettings`:从校验后的字体相关选项算出(已吃 zoom 的)字号 / 行高 / 字体变体 */
export function createBareFontInfo(validated: Record<string, unknown>, pixelRatio: number, os: KeyOS, zoomLevel = 0, ignoreEditorZoom = false): BareFontInfo {
    let fontWeight = validated.fontWeight as string
    let fontSize = validated.fontSize as number
    let lineHeight = validated.lineHeight as number
    let fontVariationSettings = validated.fontVariations as string
    if (lineHeight === 0) {
        lineHeight = goldenLineHeightRatio(os) * fontSize
    } else if (lineHeight < MINIMUM_LINE_HEIGHT) {
        // 小到不可能是像素行高的值按 em 算
        lineHeight = lineHeight * fontSize
    }
    // 取整、保底
    lineHeight = Math.round(lineHeight)
    if (lineHeight < MINIMUM_LINE_HEIGHT) lineHeight = MINIMUM_LINE_HEIGHT
    const editorZoomLevelMultiplier = 1 + (ignoreEditorZoom ? 0 : zoomLevel * 0.1)
    fontSize *= editorZoomLevelMultiplier
    lineHeight *= editorZoomLevelMultiplier
    if (fontVariationSettings === FONT_VARIATIONS_TRANSLATE) {
        if (fontWeight === 'normal' || fontWeight === 'bold') {
            fontVariationSettings = FONT_VARIATIONS_OFF
        } else {
            const fontWeightAsNumber = parseInt(fontWeight, 10)
            fontVariationSettings = `'wght' ${fontWeightAsNumber}`
            fontWeight = 'normal'
        }
    }
    return new BareFontInfoClass({
        pixelRatio,
        fontFamily: String(validated.fontFamily),
        fontWeight: String(fontWeight),
        fontSize,
        fontFeatureSettings: validated.fontLigatures as string,
        fontVariationSettings,
        lineHeight: lineHeight | 0,
        letterSpacing: validated.letterSpacing as number,
    })
}

// ---- layoutInfo(EditorLayoutInfoComputer) ----

export interface MinimapLayoutInput {
    outerWidth: number
    outerHeight: number
    lineHeight: number
    typicalHalfwidthCharacterWidth: number
    pixelRatio: number
    scrollBeyondLastLine: boolean
    paddingTop: number
    paddingBottom: number
    minimap: Readonly<Required<IEditorMinimapOptions>>
    verticalScrollbarWidth: number
    viewLineCount: number
    remainingWidth: number
    isViewportWrapping: boolean
}

export interface ContainedMinimapLineCountInput {
    viewLineCount: number
    scrollBeyondLastLine: boolean
    paddingTop: number
    paddingBottom: number
    height: number
    lineHeight: number
    pixelRatio: number
}

export interface LayoutEnv {
    memory?: ComputeOptionsMemory | null
    outerWidth: number
    outerHeight: number
    isDominatedByLongLines: boolean
    lineHeight: number
    viewLineCount: number
    lineNumbersDigitCount: number
    typicalHalfwidthCharacterWidth: number
    maxDigitWidth: number
    pixelRatio: number
    glyphMarginDecorationLaneCount: number
}

type Opts = Readonly<Partial<ComputedEditorOptionValues>>

export function computeContainedMinimapLineCount(input: ContainedMinimapLineCountInput) {
    const typicalViewportLineCount = input.height / input.lineHeight
    const extraLinesBeforeFirstLine = Math.floor(input.paddingTop / input.lineHeight)
    let extraLinesBeyondLastLine = Math.floor(input.paddingBottom / input.lineHeight)
    if (input.scrollBeyondLastLine) {
        extraLinesBeyondLastLine = Math.max(extraLinesBeyondLastLine, typicalViewportLineCount - 1)
    }
    const desiredRatio = (extraLinesBeforeFirstLine + input.viewLineCount + extraLinesBeyondLastLine) / (input.pixelRatio * input.height)
    const minimapLineCount = Math.floor(input.viewLineCount / desiredRatio)
    return { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount }
}

function computeMinimapLayout(input: MinimapLayoutInput, memory: ComputeOptionsMemory): EditorMinimapLayoutInfo {
    const outerWidth = input.outerWidth
    const outerHeight = input.outerHeight
    const pixelRatio = input.pixelRatio
    if (!input.minimap.enabled) {
        return {
            renderMinimap: RenderMinimap.None,
            minimapLeft: 0,
            minimapWidth: 0,
            minimapHeightIsEditorHeight: false,
            minimapIsSampling: false,
            minimapScale: 1,
            minimapLineHeight: 1,
            minimapCanvasInnerWidth: 0,
            minimapCanvasInnerHeight: Math.floor(pixelRatio * outerHeight),
            minimapCanvasOuterWidth: 0,
            minimapCanvasOuterHeight: outerHeight,
        }
    }
    // 只有 viewLineCount 和 remainingWidth 变了时可以用 memory
    const stable = memory.stableMinimapLayoutInput
    const couldUseMemory = !!(stable
        // && input.outerWidth === stable.outerWidth —— Monaco 故意不比
        && input.outerHeight === stable.outerHeight
        && input.lineHeight === stable.lineHeight
        && input.typicalHalfwidthCharacterWidth === stable.typicalHalfwidthCharacterWidth
        && input.pixelRatio === stable.pixelRatio
        && input.scrollBeyondLastLine === stable.scrollBeyondLastLine
        && input.paddingTop === stable.paddingTop
        && input.paddingBottom === stable.paddingBottom
        && input.minimap.enabled === stable.minimap.enabled
        && input.minimap.side === stable.minimap.side
        && input.minimap.size === stable.minimap.size
        && input.minimap.showSlider === stable.minimap.showSlider
        && input.minimap.renderCharacters === stable.minimap.renderCharacters
        && input.minimap.maxColumn === stable.minimap.maxColumn
        && input.minimap.scale === stable.minimap.scale
        && input.verticalScrollbarWidth === stable.verticalScrollbarWidth
        // && input.viewLineCount、input.remainingWidth —— Monaco 故意不比
        && input.isViewportWrapping === stable.isViewportWrapping)
    const lineHeight = input.lineHeight
    const typicalHalfwidthCharacterWidth = input.typicalHalfwidthCharacterWidth
    const scrollBeyondLastLine = input.scrollBeyondLastLine
    const minimapRenderCharacters = input.minimap.renderCharacters
    let minimapScale = (pixelRatio >= 2 ? Math.round(input.minimap.scale * 2) : input.minimap.scale)
    const minimapMaxColumn = input.minimap.maxColumn
    const minimapSize = input.minimap.size
    const minimapSide = input.minimap.side
    const verticalScrollbarWidth = input.verticalScrollbarWidth
    const viewLineCount = input.viewLineCount
    const remainingWidth = input.remainingWidth
    const isViewportWrapping = input.isViewportWrapping
    const baseCharHeight = minimapRenderCharacters ? 2 : 3
    let minimapCanvasInnerHeight = Math.floor(pixelRatio * outerHeight)
    const minimapCanvasOuterHeight = minimapCanvasInnerHeight / pixelRatio
    let minimapHeightIsEditorHeight = false
    let minimapIsSampling = false
    let minimapLineHeight = baseCharHeight * minimapScale
    let minimapCharWidth = minimapScale / pixelRatio
    let minimapWidthMultiplier = 1
    if (minimapSize === 'fill' || minimapSize === 'fit') {
        const { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount } = computeContainedMinimapLineCount({
            viewLineCount,
            scrollBeyondLastLine,
            paddingTop: input.paddingTop,
            paddingBottom: input.paddingBottom,
            height: outerHeight,
            lineHeight,
            pixelRatio,
        })
        // ratio 故意不放进布局,免得采样时布局一直在变
        const ratio = viewLineCount / minimapLineCount
        if (ratio > 1) {
            minimapHeightIsEditorHeight = true
            minimapIsSampling = true
            minimapScale = 1
            minimapLineHeight = 1
            minimapCharWidth = minimapScale / pixelRatio
        } else {
            let fitBecomesFill = false
            let maxMinimapScale = minimapScale + 1
            if (minimapSize === 'fit') {
                const effectiveMinimapHeight = Math.ceil((extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight)
                if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
                    // fit + 视口换行有环:行数 → minimap 布局 → 视口宽 → 行数。一旦降到更小的 scale 就粘住它来破环
                    fitBecomesFill = true
                    maxMinimapScale = memory.stableFitMaxMinimapScale
                } else {
                    fitBecomesFill = (effectiveMinimapHeight > minimapCanvasInnerHeight)
                }
            }
            if (minimapSize === 'fill' || fitBecomesFill) {
                minimapHeightIsEditorHeight = true
                const configuredMinimapScale = minimapScale
                minimapLineHeight = Math.min(lineHeight * pixelRatio, Math.max(1, Math.floor(1 / desiredRatio)))
                if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
                    maxMinimapScale = memory.stableFitMaxMinimapScale
                }
                minimapScale = Math.min(maxMinimapScale, Math.max(1, Math.floor(minimapLineHeight / baseCharHeight)))
                if (minimapScale > configuredMinimapScale) {
                    minimapWidthMultiplier = Math.min(2, minimapScale / configuredMinimapScale)
                }
                minimapCharWidth = minimapScale / pixelRatio / minimapWidthMultiplier
                minimapCanvasInnerHeight = Math.ceil((Math.max(typicalViewportLineCount, extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine)) * minimapLineHeight)
                if (isViewportWrapping) {
                    // 记下来给下次用
                    memory.stableMinimapLayoutInput = input
                    memory.stableFitRemainingWidth = remainingWidth
                    memory.stableFitMaxMinimapScale = minimapScale
                } else {
                    memory.stableMinimapLayoutInput = null
                    memory.stableFitRemainingWidth = 0
                }
            }
        }
    }
    // 推导见 Monaco:minimapWidth = ((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)
    const minimapMaxWidth = Math.floor(minimapMaxColumn * minimapCharWidth)
    const minimapWidth = Math.min(minimapMaxWidth, Math.max(0, Math.floor(((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth))) + MINIMAP_GUTTER_WIDTH)
    let minimapCanvasInnerWidth = Math.floor(pixelRatio * minimapWidth)
    const minimapCanvasOuterWidth = minimapCanvasInnerWidth / pixelRatio
    minimapCanvasInnerWidth = Math.floor(minimapCanvasInnerWidth * minimapWidthMultiplier)
    const renderMinimap = (minimapRenderCharacters ? RenderMinimap.Text : RenderMinimap.Blocks)
    const minimapLeft = (minimapSide === 'left' ? 0 : (outerWidth - minimapWidth - verticalScrollbarWidth))
    return {
        renderMinimap,
        minimapLeft,
        minimapWidth,
        minimapHeightIsEditorHeight,
        minimapIsSampling,
        minimapScale,
        minimapLineHeight,
        minimapCanvasInnerWidth,
        minimapCanvasInnerHeight,
        minimapCanvasOuterWidth,
        minimapCanvasOuterHeight,
    }
}

/** Monaco `EditorLayoutInfoComputer.computeLayout` */
export function computeLayout(options: Opts, env: LayoutEnv): EditorLayoutInfo {
    const outerWidth = env.outerWidth | 0
    const outerHeight = env.outerHeight | 0
    const lineHeight = env.lineHeight | 0
    const lineNumbersDigitCount = env.lineNumbersDigitCount | 0
    const typicalHalfwidthCharacterWidth = env.typicalHalfwidthCharacterWidth
    const maxDigitWidth = env.maxDigitWidth
    const pixelRatio = env.pixelRatio
    const viewLineCount = env.viewLineCount

    const wordWrapOverride2 = options.wordWrapOverride2!
    const wordWrapOverride1 = (wordWrapOverride2 === 'inherit' ? options.wordWrapOverride1! : wordWrapOverride2)
    const wordWrap = (wordWrapOverride1 === 'inherit' ? options.wordWrap! : wordWrapOverride1)
    const wordWrapColumn = options.wordWrapColumn!
    const isDominatedByLongLines = env.isDominatedByLongLines

    const showGlyphMargin = options.glyphMargin!
    const showLineNumbers = (options.lineNumbers!.renderType !== 0 /* RenderLineNumbersType.Off */)
    const lineNumbersMinChars = options.lineNumbersMinChars!
    const scrollBeyondLastLine = options.scrollBeyondLastLine!
    const padding = options.padding!
    const minimap = options.minimap!

    const scrollbar = options.scrollbar!
    const verticalScrollbarWidth = scrollbar.verticalScrollbarSize
    const verticalScrollbarHasArrows = scrollbar.verticalHasArrows
    const scrollbarArrowSize = scrollbar.arrowSize
    const horizontalScrollbarHeight = scrollbar.horizontalScrollbarSize

    const folding = options.folding!
    const showFoldingDecoration = options.showFoldingControls! !== 'never'
    let lineDecorationsWidth = options.lineDecorationsWidth!
    if (folding && showFoldingDecoration) lineDecorationsWidth += 16

    let lineNumbersWidth = 0
    if (showLineNumbers) {
        const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars)
        lineNumbersWidth = Math.round(digitCount * maxDigitWidth)
    }
    let glyphMarginWidth = 0
    if (showGlyphMargin) glyphMarginWidth = lineHeight * env.glyphMarginDecorationLaneCount

    let glyphMarginLeft = 0
    let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth
    let decorationsLeft = lineNumbersLeft + lineNumbersWidth
    let contentLeft = decorationsLeft + lineDecorationsWidth
    const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth

    let isWordWrapMinified = false
    let isViewportWrapping = false
    let wrappingColumn = -1
    if (options.accessibilitySupport === AccessibilitySupport.Enabled && wordWrapOverride1 === 'inherit' && isDominatedByLongLines) {
        // 长行占多数的文档强制按视口宽度换行(0.55 起只在读屏开启时)
        isWordWrapMinified = true
        isViewportWrapping = true
    } else if (wordWrap === 'on' || wordWrap === 'bounded') {
        isViewportWrapping = true
    } else if (wordWrap === 'wordWrapColumn') {
        wrappingColumn = wordWrapColumn
    }

    const minimapLayout = computeMinimapLayout({
        outerWidth,
        outerHeight,
        lineHeight,
        typicalHalfwidthCharacterWidth,
        pixelRatio,
        scrollBeyondLastLine,
        paddingTop: padding.top,
        paddingBottom: padding.bottom,
        minimap,
        verticalScrollbarWidth,
        viewLineCount,
        remainingWidth,
        isViewportWrapping,
    }, env.memory || new ComputeOptionsMemory())

    if (minimapLayout.renderMinimap !== RenderMinimap.None && minimapLayout.minimapLeft === 0) {
        // minimap 画在左边,其余整体右移
        glyphMarginLeft += minimapLayout.minimapWidth
        lineNumbersLeft += minimapLayout.minimapWidth
        decorationsLeft += minimapLayout.minimapWidth
        contentLeft += minimapLayout.minimapWidth
    }
    const contentWidth = remainingWidth - minimapLayout.minimapWidth

    // 给光标留 2px
    const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth))
    const verticalArrowSize = (verticalScrollbarHasArrows ? scrollbarArrowSize : 0)

    if (isViewportWrapping) {
        // 算出真正的换行列
        wrappingColumn = Math.max(1, viewportColumn)
        if (wordWrap === 'bounded') wrappingColumn = Math.min(wrappingColumn, wordWrapColumn)
    }

    return {
        width: outerWidth,
        height: outerHeight,
        glyphMarginLeft,
        glyphMarginWidth,
        glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount,
        lineNumbersLeft,
        lineNumbersWidth,
        decorationsLeft,
        decorationsWidth: lineDecorationsWidth,
        contentLeft,
        contentWidth,
        minimap: minimapLayout,
        viewportColumn,
        isWordWrapMinified,
        isViewportWrapping,
        wrappingColumn,
        verticalScrollbarWidth,
        horizontalScrollbarHeight,
        overviewRuler: {
            top: verticalArrowSize,
            width: verticalScrollbarWidth,
            height: (outerHeight - 2 * verticalArrowSize),
            right: 0,
        },
    }
}

// ---- 每个选项的 compute ----

/** 有 compute 的选项:key → (env, 已算出的前序选项, validated 值, 字体信息) */
interface ComputeCtx {
    env: ComputeEnv
    fontInfo: FontInfo
    options: Opts
}

export const COMPUTERS: Record<string, (value: unknown, c: ComputeCtx) => unknown> = {
    accessibilitySupport: (value, c) => (value === AccessibilitySupport.Unknown ? c.env.accessibilitySupport : value),
    emptySelectionClipboard: (value, c) => (value as boolean) && c.env.emptySelectionClipboard,
    // fontVariations / fontSize / lineHeight 的最终值来自 fontInfo(吃了 zoom;fontVariations 吃了 fontWeight 的翻译)
    fontVariations: (_, c) => c.fontInfo.fontVariationSettings,
    fontInfo: (_, c) => c.fontInfo,
    fontSize: (_, c) => c.fontInfo.fontSize,
    lineDecorationsWidth: (value, c) => {
        const v = value as number
        if (v < 0) {
            // 负数表示 ch 的倍数
            return clampedInt(-v * c.fontInfo.typicalHalfwidthCharacterWidth, 10 /* defaultValue */, 0, 1000)
        }
        return v
    },
    lineHeight: (_, c) => c.fontInfo.lineHeight,
    editorClassName: (_, c) => {
        const o = c.options
        const classNames = ['monaco-editor']
        if (o.extraEditorClassName) classNames.push(o.extraEditorClassName)
        if (c.env.extraEditorClassName) classNames.push(c.env.extraEditorClassName)
        if (o.mouseStyle === 'default') classNames.push('mouse-default')
        else if (o.mouseStyle === 'copy') classNames.push('mouse-copy')
        if (o.showUnused) classNames.push('showUnused')
        if (o.showDeprecated) classNames.push('showDeprecated')
        return classNames.join(' ')
    },
    pixelRatio: (_, c) => c.env.pixelRatio,
    // 0.55 新增的三个计算项(Monaco effectiveCursorStyle / effectiveEditContext / effectiveAllowVariableFonts)
    effectiveCursorStyle: (_, c) => (c.env.inputMode === 'overtype' ? c.options.overtypeCursorStyle : c.options.cursorStyle),
    effectiveEditContext: (_, c) => c.env.editContextSupported && !!c.options.editContext,
    effectiveAllowVariableFonts: (_, c) => (c.env.accessibilitySupport === AccessibilitySupport.Enabled ? c.options.allowVariableFontsInAccessibilityMode : c.options.allowVariableFonts),
    layoutInfo: (_, c) => computeLayout(c.options, {
        memory: c.env.memory,
        outerWidth: c.env.outerWidth,
        outerHeight: c.env.outerHeight,
        isDominatedByLongLines: c.env.isDominatedByLongLines,
        lineHeight: c.fontInfo.lineHeight,
        viewLineCount: c.env.viewLineCount,
        lineNumbersDigitCount: c.env.lineNumbersDigitCount,
        typicalHalfwidthCharacterWidth: c.fontInfo.typicalHalfwidthCharacterWidth,
        maxDigitWidth: c.fontInfo.maxDigitWidth,
        pixelRatio: c.env.pixelRatio,
        glyphMarginDecorationLaneCount: c.env.glyphMarginDecorationLaneCount,
    }),
    wrappingInfo: (_, c) => {
        const layoutInfo = c.options.layoutInfo!
        return {
            isDominatedByLongLines: c.env.isDominatedByLongLines,
            isWordWrapMinified: layoutInfo.isWordWrapMinified,
            isViewportWrapping: layoutInfo.isViewportWrapping,
            wrappingColumn: layoutInfo.wrappingColumn,
        }
    },
    wrappingIndent: (value, c) => (c.options.accessibilitySupport === AccessibilitySupport.Enabled ? WrappingIndent.None : value),
    wrappingStrategy: (value, c) => (c.options.accessibilitySupport === AccessibilitySupport.Enabled ? 'advanced' : value),
}
