// Monaco 的编辑器选项:名字、取值、默认值、校验、计算都和 monaco-editor 一致。
//
// 文件分工:
//   types.ts / generated.ts  由 scripts/gen-options.mjs 从 monaco-editor 导出(类型、枚举、默认值、简单选项的规格),勿手改
//   validate.ts              raw → validated:每个选项的 validate(辅助函数 boolean / clampedInt / stringSet… 同 Monaco)
//   compute.ts               validated → computed:依赖环境的 compute()(fontInfo / layoutInfo / wrappingInfo…)
//   merge.ts                 updateOptions 的合并语义(mergeRawOptions)、老选项迁移、ConfigurationChangedEvent
//
// 契约(其余模块只依赖这几个符号):
//   - `IEditorOptions`        宿主传进来的 raw 形态(updateOptions / LiteMonacoOptions.options),类型与 Monaco 同名同形
//   - `ComputedEditorOptions` 校验、计算之后的形态,即 Monaco `editor.getOption()` 返回的值,每个选项有精确类型
//   - `editorOptions`         Facet:每个提供者给一份 raw(后者按 updateOptions 的语义合并到前者上),输出 computed。没人提供时就是默认值
//   - `getOption(state, name)` / `getOptionById(state, EditorOption.x)`  读某选项的 computed 值;运行时 updateOptions 换了就跟着变
//   - `resolveEditorOptions(raw, env?)` raw → computed(纯函数)
//   - `mergeRawOptions(base, patch)` / `configurationChange(prev, next)`  Monaco updateOptions / onDidChangeConfiguration 的语义
//   - `EditorOption`          Monaco 的枚举(数值相同),`optionName(id)` 取名字
import { Facet, type EditorState } from '../model/state'
import { keyOS, type KeyOS } from '../keyos'
import { EDITOR_OPTION_NAMES } from './generated'
import { COMPUTERS, createBareFontInfo, defaultEnv, type ComputeEnv } from './compute'
import { defaultsFor, OPTION_KEYS, validateOptions } from './validate'
import { cloneAndMigrate, mergeRawOptions } from './merge'
import type { ComputedEditorOptionValues, EditorOption, EditorOptionKeyById, IEditorOptions } from './types'

export * from './types'
export { EDITOR_DEFAULTS, EDITOR_OPTION_NAMES, PLATFORM_DEFAULTS, OPTION_SPECS, type OptionSpec } from './generated'
export { validateOption, validateOptions, validateContext, VALIDATORS, OPTION_KEYS, type ValidateContext } from './validate'
export {
    ComputeOptionsMemory, computeLayout, computeContainedMinimapLineCount, createBareFontInfo, defaultEnv, estimateFontInfo,
    MINIMAP_GUTTER_WIDTH, type ComputeEnv, type LayoutEnv,
} from './compute'
export { applyRawUpdate, cloneAndMigrate, configurationChange, ConfigurationChangedEvent, mergeRawOptions, migrateOptions } from './merge'

/** 校验、计算后的选项表(= Monaco IComputedEditorOptions 里每个选项的值,按选项名取) */
export type ComputedEditorOptions = Readonly<ComputedEditorOptionValues>
/** Monaco IComputedEditorOptions:getOptions() 的返回——按名字取的值表 + 按 EditorOption 枚举取的 get(id) */
export type IComputedEditorOptions = ComputedEditorOptions & {
    get<K extends keyof EditorOptionKeyById>(id: K): ComputedEditorOptions[EditorOptionKeyById[K]]
    /** 兜底重载:Monaco 的返回类型是对泛型 T 的条件类型 FindComputedEditorOptionValueById<T>,结构上无法被具体映射满足,留这一条让 Monaco 的签名可赋值 */
    get<T extends EditorOption>(id: T): any
}

/** 当前平台的默认值(校验前的 validated 默认,Monaco 的 fontFamily / fontSize / renderFinalNewline 随平台变) */
export function platformDefaults(os: KeyOS = keyOS): Record<string, unknown> {
    return defaultsFor(os)
}

/** resolveEditorOptions 的环境输入:都是可选的,没给的取无头默认(见 compute.ts 的注释:哪些该由视图层提供) */
export interface ResolveEnv extends Partial<ComputeEnv> {
    /** 平台(默认值、行高黄金比、multiCursorModifier);默认当前平台 */
    os?: KeyOS
}

/**
 * raw → computed(纯函数)。与 Monaco 的 EditorConfiguration 同一顺序:
 * 拷贝并迁移老写法 → 每个选项各自 validate → 带环境 compute(按 EditorOption 顺序,后面的可以读前面的)。
 */
export function resolveEditorOptions(raw: IEditorOptions = {}, env: ResolveEnv = {}): ComputedEditorOptions {
    const os = env.os ?? keyOS
    const validated = validateOptions(cloneAndMigrate(raw), os)
    const e: ComputeEnv = { ...defaultEnv(os), ...env }
    const fontInfo = e.measureFont(createBareFontInfo(validated, e.pixelRatio, os, e.zoomLevel, e.isSimpleWidget))
    const out: Record<string, unknown> = {}
    OPTION_KEYS.forEach(key => {
        const compute = COMPUTERS[key]
        out[key] = compute ? compute(validated[key], { env: e, fontInfo, options: out as Partial<ComputedEditorOptionValues> }) : validated[key]
    })
    return out as unknown as ComputedEditorOptions
}

const MODEL_OPTION_KEYS = ['tabSize', 'indentSize', 'insertSpaces', 'detectIndentation', 'trimAutoWhitespace', 'maxTokenizationLineLength'] as const

/** 多个提供者的 raw 依次按 updateOptions 的语义合并(后者覆盖前者,嵌套对象深合并),再 resolve */
export const editorOptions = Facet.define<IEditorOptions, ComputedEditorOptions>({
    combine: values => {
        // standalone 的默认:Monaco editor.api.js 把 autoIndent 默认从 'full' 改成 'advanced'(规则不参与回车 / 打字)
        let raw: IEditorOptions = { autoIndent: 'advanced' }
        for (const v of values) raw = mergeRawOptions(raw, v)
        const out = resolveEditorOptions(raw)
        // IGlobalEditorOptions 里属于文本模型的几项(不在 EditorOption 里,validate 不认):原样带过去,由读的一侧(edit/editoptions.ts)按 Monaco 的 sanitize 规则归一化
        // (mergeRawOptions 只认 EditorOption 的键,所以直接从各提供者里取:后者覆盖前者,undefined 清回默认)
        for (const k of MODEL_OPTION_KEYS) {
            for (const v of values) if (Object.prototype.hasOwnProperty.call(v, k)) {
                const x = (v as Record<string, unknown>)[k]
                if (x === undefined) delete (out as Record<string, unknown>)[k]
                else (out as Record<string, unknown>)[k] = x
            }
        }
        return out
    },
})

/** 读某选项的 computed 值,返回精确类型:`getOption(state, 'find')` → Readonly<Required<IEditorFindOptions>> */
export function getOption<K extends keyof ComputedEditorOptions>(state: EditorState, name: K): ComputedEditorOptions[K]
/** 选项名在运行时才知道的调用方(`name: string`)用这个:拿到 unknown,自己收窄 */
export function getOption(state: EditorState, name: string): unknown
export function getOption(state: EditorState, name: string): unknown {
    return (state.facet(editorOptions) as unknown as Record<string, unknown>)[name]
}

/** 同 Monaco `editor.getOption(EditorOption.find)`:按枚举取 */
export function getOptionById<K extends keyof EditorOptionKeyById>(state: EditorState, id: K): ComputedEditorOptions[EditorOptionKeyById[K]] {
    return state.facet(editorOptions)[OPTION_KEYS[id] as EditorOptionKeyById[K]]
}

export function optionName(id: EditorOption): string {
    return EDITOR_OPTION_NAMES[id]
}
