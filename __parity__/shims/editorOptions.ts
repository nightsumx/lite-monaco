// Monaco editorOptions:原文件依赖 platform/accessibility 等缺失模块。垫片只提供测试用得到的枚举(值与 Monaco 一致)。
export enum EditorAutoIndentStrategy { None = 0, Keep = 1, Brackets = 2, Advanced = 3, Full = 4 }

// —— 配置/布局相关:全部转出 lite-monaco 的选项层 ——
import { computeLayout, EDITOR_DEFAULTS } from '../../src/core/options'
export { EditorOption, RenderLineNumbersType, RenderMinimap, WrappingIndent, ScrollbarVisibility } from '../../src/core/options'
// Monaco: EditorLayoutInfoComputer.computeLayout(options: IComputedEditorOptions, env) —— options 是带 _write 的表,这里取它的值表
export const EditorLayoutInfoComputer = {
    computeLayout: (options: { values: Record<string, unknown> }, env: Parameters<typeof computeLayout>[1]) => computeLayout(options.values as never, env),
}
// Monaco: EditorOptions.scrollbar.defaultValue 等(各选项的默认值)
export const EditorOptions: Record<string, { defaultValue: any }> = new Proxy({}, { get: (_t, k: string) => ({ defaultValue: EDITOR_DEFAULTS[k] }) })
