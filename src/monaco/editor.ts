// monaco.editor 命名空间(对位 monaco-editor 0.55.1 monaco.d.ts 的 `declare namespace editor`)。
// 只做名字映射/再导出,不放实现。缺口清单由 scripts/api-gap.mjs 对照官方 d.ts 机器生成。
export { createEditor as create } from '../api/create'
export { createDiffEditor } from '../diffeditor'
export { addEditorAction } from '../api/actions'
export { addKeybindingRule, addKeybindingRules } from '../api/commands'
export {
    createModel, getModel, getModels, onDidCreateModel, onWillDisposeModel, onDidChangeModelLanguage,
    EndOfLinePreference, DefaultEndOfLine, EndOfLineSequence, TextModelResolvedOptions, FindMatch,
} from '../api/model'
export { setModelLanguage } from '../api/languages'
export { setModelMarkers, removeAllMarkers, getModelMarkers, onDidChangeMarkers } from '../api/markers'
export { defineTheme, setTheme } from '../api/themes'
export { registerLinkOpener } from '../core/feature/link'
export { registerEditorOpener } from '../api/openers'
export { TrackedRangeStickiness, OverviewRulerLane, MinimapPosition, MinimapSectionHeaderStyle, GlyphMarginLane } from '../api/decorations'
export { ContentWidgetPositionPreference, OverlayWidgetPositionPreference, PositionAffinity } from '../api/widgets'
export { ScrollType, MouseTargetType, CursorChangeReason, EditorZoom } from '../core/view/viewapi'
export { EditorOption, ConfigurationChangedEvent } from '../core/options'
export {
    AccessibilitySupport, EditorAutoIndentStrategy, InjectedTextCursorStops, RenderLineNumbersType, RenderMinimap,
    ScrollbarVisibility, ShowLightbulbIconMode, TextDirection, TextEditorCursorBlinkingStyle, TextEditorCursorStyle, WrappingIndent,
} from './enums'
// 类型出口(接口/类型别名,由 scripts/gen-monaco-types.ts 生成;枚举/类是上面的值导出)
export type * from './editor-types'
// 静态一族:编辑器登记 / 全局命令 / 字体 / colorize(见 api/editorregistry.ts、api/colorizer.ts)
export { onDidCreateEditor, onDidCreateDiffEditor, getEditors, getDiffEditors, addCommand, registerCommand, EditorType } from '../api/editorregistry'
export { colorize, colorizeElement, colorizeModelLine, tokenize } from '../api/colorizer'
export { remeasureFonts } from '../core/view/fontinfo'
export { ApplyUpdateResult } from '../core/options/merge'
export { EditorOptions } from '../core/options/editoroptions'
export { FontInfo, BareFontInfo } from '../core/options/fontclasses'
