// BareFontInfo / FontInfo 两个类(common/config/fontInfo.ts,MIT,microsoft/vscode,= monaco-editor 0.55.1)。
// types.ts 里同名的是接口(形状);这里是 `monaco.editor.BareFontInfo` / `FontInfo` 真正的 class:构造 / _create / getId /
// getMassagedFontFamily / equals。compute.ts、fontinfo.ts 造字体信息都经这两个类,所以 getOption(fontInfo) instanceof FontInfo。
import { keyOS } from '../keyos'
import { EditorZoom } from '../view/viewapi'
import { FONT_VARIATIONS_OFF, FONT_VARIATIONS_TRANSLATE, defaultsFor } from './validate'
import type { BareFontInfo as BareFontInfoShape, FontInfo as FontInfoShape } from './types'

const GOLDEN_LINE_HEIGHT_RATIO = keyOS === 'mac' ? 1.5 : 1.35
const MINIMUM_LINE_HEIGHT = 8
/** 变了字段就要升(同 Monaco SERIALIZED_FONT_INFO_VERSION) */
export const SERIALIZED_FONT_INFO_VERSION = 2

export interface IBareFontInfoOptions {
    readonly pixelRatio: number
    readonly fontFamily: string
    readonly fontWeight: string
    readonly fontSize: number
    readonly fontFeatureSettings: string
    readonly fontVariationSettings: string
    readonly lineHeight: number
    readonly letterSpacing: number
}

/** 写进 CSS 的字体族:用户的族后面追加平台默认栈(Monaco 同:用户字体没有的字形——阿拉伯文、CJK、符号——按这条栈回退,而不是浏览器的泛型回退) */
export function massagedFontFamily(family: string): string {
    const fallback = defaultsFor(keyOS).fontFamily as string
    const quoted = /[,"']/.test(family) ? family : /[+ ]/.test(family) ? `"${family}"` : family
    return family !== fallback ? `${quoted}, ${fallback}` : quoted
}

export class BareFontInfo implements BareFontInfoShape {
    readonly _bareFontInfoBrand: void = undefined
    readonly pixelRatio: number
    readonly fontFamily: string
    readonly fontWeight: string
    readonly fontSize: number
    readonly fontFeatureSettings: string
    readonly fontVariationSettings: string
    readonly lineHeight: number
    readonly letterSpacing: number

    /** Monaco BareFontInfo._create:行高取整 / 保底、吃 EditorZoom、fontVariations 'translate' 换算 */
    static _create(fontFamily: string, fontWeight: string, fontSize: number, fontFeatureSettings: string, fontVariationSettings: string, lineHeight: number, letterSpacing: number, pixelRatio: number, ignoreEditorZoom: boolean): BareFontInfo {
        if (lineHeight === 0) lineHeight = GOLDEN_LINE_HEIGHT_RATIO * fontSize
        else if (lineHeight < MINIMUM_LINE_HEIGHT) lineHeight = lineHeight * fontSize // 小到不可能是像素行高的值按 em 算
        lineHeight = Math.round(lineHeight)
        if (lineHeight < MINIMUM_LINE_HEIGHT) lineHeight = MINIMUM_LINE_HEIGHT
        const editorZoomLevelMultiplier = 1 + (ignoreEditorZoom ? 0 : EditorZoom.getZoomLevel() * 0.1)
        fontSize *= editorZoomLevelMultiplier
        lineHeight *= editorZoomLevelMultiplier
        if (fontVariationSettings === FONT_VARIATIONS_TRANSLATE) {
            if (fontWeight === 'normal' || fontWeight === 'bold') {
                fontVariationSettings = FONT_VARIATIONS_OFF
            } else {
                fontVariationSettings = `'wght' ${parseInt(fontWeight, 10)}`
                fontWeight = 'normal'
            }
        }
        return new BareFontInfo({ pixelRatio, fontFamily, fontWeight, fontSize, fontFeatureSettings, fontVariationSettings, lineHeight, letterSpacing })
    }

    constructor(opts: IBareFontInfoOptions) {
        this.pixelRatio = opts.pixelRatio
        this.fontFamily = String(opts.fontFamily)
        this.fontWeight = String(opts.fontWeight)
        this.fontSize = opts.fontSize
        this.fontFeatureSettings = opts.fontFeatureSettings
        this.fontVariationSettings = opts.fontVariationSettings
        this.lineHeight = opts.lineHeight | 0
        this.letterSpacing = opts.letterSpacing
    }

    getId(): string {
        return `${this.pixelRatio}-${this.fontFamily}-${this.fontWeight}-${this.fontSize}-${this.fontFeatureSettings}-${this.fontVariationSettings}-${this.lineHeight}-${this.letterSpacing}`
    }

    getMassagedFontFamily(): string { return massagedFontFamily(this.fontFamily) }
}

export interface IFontInfoOptions extends IBareFontInfoOptions {
    readonly isMonospace: boolean
    readonly typicalHalfwidthCharacterWidth: number
    readonly typicalFullwidthCharacterWidth: number
    readonly canUseHalfwidthRightwardsArrow: boolean
    readonly spaceWidth: number
    readonly middotWidth: number
    readonly wsmiddotWidth: number
    readonly maxDigitWidth: number
}

export class FontInfo extends BareFontInfo implements FontInfoShape {
    readonly _editorStylingBrand: void = undefined
    readonly version: number = SERIALIZED_FONT_INFO_VERSION
    readonly isTrusted: boolean
    readonly isMonospace: boolean
    readonly typicalHalfwidthCharacterWidth: number
    readonly typicalFullwidthCharacterWidth: number
    readonly canUseHalfwidthRightwardsArrow: boolean
    readonly spaceWidth: number
    readonly middotWidth: number
    readonly wsmiddotWidth: number
    readonly maxDigitWidth: number

    constructor(opts: IFontInfoOptions, isTrusted: boolean) {
        super(opts)
        this.isTrusted = isTrusted
        this.isMonospace = opts.isMonospace
        this.typicalHalfwidthCharacterWidth = opts.typicalHalfwidthCharacterWidth
        this.typicalFullwidthCharacterWidth = opts.typicalFullwidthCharacterWidth
        this.canUseHalfwidthRightwardsArrow = opts.canUseHalfwidthRightwardsArrow
        this.spaceWidth = opts.spaceWidth
        this.middotWidth = opts.middotWidth
        this.wsmiddotWidth = opts.wsmiddotWidth
        this.maxDigitWidth = opts.maxDigitWidth
    }

    equals(other: FontInfo): boolean {
        return this.fontFamily === other.fontFamily
            && this.fontWeight === other.fontWeight
            && this.fontSize === other.fontSize
            && this.fontFeatureSettings === other.fontFeatureSettings
            && this.fontVariationSettings === other.fontVariationSettings
            && this.lineHeight === other.lineHeight
            && this.letterSpacing === other.letterSpacing
            && this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
            && this.typicalFullwidthCharacterWidth === other.typicalFullwidthCharacterWidth
            && this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow
            && this.spaceWidth === other.spaceWidth
            && this.middotWidth === other.middotWidth
            && this.wsmiddotWidth === other.wsmiddotWidth
            && this.maxDigitWidth === other.maxDigitWidth
    }
}
