// `monaco.editor.EditorOptions`:每个选项一个 `{ id, name, defaultValue, applyUpdate }`(IEditorOption)。
// 对象的键(导出名)来自 optionkeys.ts(照 monaco.d.ts 抄的,和选项名不总相同:bracketPairGuides / fontLigatures2 / unicodeHighlight …);
// id → name 用 EDITOR_OPTION_NAMES,默认值用本平台的 defaultsFor,applyUpdate 就是 merge.ts 里 updateOptions 用的那两个。
// 计算项(fontInfo / layoutInfo …)Monaco 里 name 是 '_never_',默认值是各自构造时给的占位值,这里同样给占位值。
import { keyOS } from '../keyos'
import { EDITOR_OPTION_NAMES } from './generated'
import { FontInfo } from './fontclasses'
import { EDITOR_OPTIONS_KEYS, type ComputedKeyOf, type EditorOptionsKey } from './optionkeys'
import { applyUnicodeHighlightUpdate, applyUpdate, ApplyUpdateResult } from './merge'
import { defaultsFor } from './validate'
import { EditorOption, RenderMinimap, TextEditorCursorStyle, type ComputedEditorOptionValues } from './types'

export interface IEditorOptionObject<K extends EditorOption = EditorOption, V = unknown> {
    readonly id: K
    readonly name: string
    defaultValue: V
    /** Might modify `value`. */
    applyUpdate(value: V | undefined, update: V): ApplyUpdateResult<V>
}

/** 计算项的占位默认值(Monaco 各 ComputedEditorOption 构造时传的) */
function computedDefault(id: number): unknown {
    switch (id) {
        case EditorOption.fontInfo:
            return new FontInfo({ pixelRatio: 0, fontFamily: '', fontWeight: '', fontSize: 0, fontFeatureSettings: '', fontVariationSettings: '', lineHeight: 0, letterSpacing: 0, isMonospace: false, typicalHalfwidthCharacterWidth: 0, typicalFullwidthCharacterWidth: 0, canUseHalfwidthRightwardsArrow: false, spaceWidth: 0, middotWidth: 0, wsmiddotWidth: 0, maxDigitWidth: 0 }, false)
        case EditorOption.editorClassName: return ''
        case EditorOption.pixelRatio: return 1
        case EditorOption.effectiveCursorStyle: return TextEditorCursorStyle.Line
        case EditorOption.effectiveEditContext: return false
        case EditorOption.effectiveAllowVariableFonts: return false
        case EditorOption.wrappingInfo: return { isDominatedByLongLines: false, isWordWrapMinified: false, isViewportWrapping: false, wrappingColumn: -1 }
        case EditorOption.layoutInfo: return {
            width: 0, height: 0, glyphMarginLeft: 0, glyphMarginWidth: 0, glyphMarginDecorationLaneCount: 0,
            lineNumbersLeft: 0, lineNumbersWidth: 0, decorationsLeft: 0, decorationsWidth: 0, contentLeft: 0, contentWidth: 0,
            minimap: { renderMinimap: RenderMinimap.None, minimapLeft: 0, minimapWidth: 0, minimapHeightIsEditorHeight: false, minimapIsSampling: false, minimapScale: 1, minimapLineHeight: 1, minimapCanvasInnerWidth: 0, minimapCanvasInnerHeight: 0, minimapCanvasOuterWidth: 0, minimapCanvasOuterHeight: 0 },
            viewportColumn: 0, isWordWrapMinified: false, isViewportWrapping: false, wrappingColumn: -1, verticalScrollbarWidth: 0, horizontalScrollbarHeight: 0,
            overviewRuler: { top: 0, width: 0, height: 0, right: 0 },
        }
        default: return undefined
    }
}

function build(): Record<EditorOptionsKey, IEditorOptionObject<EditorOption, unknown>> {
    const defaults = defaultsFor(keyOS)
    const out = {} as Record<EditorOptionsKey, IEditorOptionObject<EditorOption, unknown>>
    for (const [key, , , id] of EDITOR_OPTIONS_KEYS as readonly (readonly [EditorOptionsKey, string, string, number])[]) {
        const name = EDITOR_OPTION_NAMES[id]
        const defaultValue = name === '_never_' ? computedDefault(id) : defaults[name]
        out[key] = {
            id, name, defaultValue,
            applyUpdate: name === 'unicodeHighlight'
                ? (value, update) => applyUnicodeHighlightUpdate(value, update) as ApplyUpdateResult<never>
                : (value, update) => applyUpdate(value, update) as ApplyUpdateResult<never>,
        }
    }
    return out
}

/** 每个键:id 是对应的 EditorOption 成员,defaultValue 是该选项 computed 形态的类型 */
export type EditorOptionsType = {
    [R in typeof EDITOR_OPTIONS_KEYS[number] as R[0]]: IEditorOptionObject<typeof EditorOption[R[1]], NonNullable<ComputedEditorOptionValues[ComputedKeyOf[R[0]] & keyof ComputedEditorOptionValues]>>
}
export const EditorOptions = build() as unknown as EditorOptionsType
