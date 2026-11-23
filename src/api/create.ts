// editor.create 的薄封装(H1):`createEditor(container, options)`,选项形态是 IStandaloneEditorConstructionOptions。
//
//   value / language    → doc / lang(没给 language 是 'plaintext',同 Monaco)
//   model               → 先按 model 的内容和语言建,再 setModel(model):换行符、撤销栈、选区、折叠、缩进都带过来;
//                         编辑器自己建的临时 model 随即销毁(Monaco:编辑器拥有自己建的 model,换走就销毁)
//   theme               → 全局 setTheme(Monaco 的 theme 选项是全局的,别的实例一起换);没给就用当前全局主题(默认 'vs')
//   dimension           → layout(dimension)
//   overflowWidgetsDomNode / ariaContainerElement → 原样进 options。前者 widgets.ts 读;后者接受但不生效
//                         (a11y live region 一直在编辑器自己的 DOM 里,读屏同样读得到)
//   autoDetectHighContrast / accessibilityHelpUrl → 接受,不生效(没有对应物)
//   其余              → 原样当 IEditorOptions(含 tabSize/insertSpaces/detectIndentation 等文本模型选项)
//   highlighter / features / colors / keymap / extensions … → lite-monaco 自己的,透传给 liteMonaco()
// highlighter 没给就用 setDefaultHighlighter 登记的那个;都没有就用懒加载 shiki 的默认高亮器(lazyhighlighter.ts)。
import { liteMonaco, type LiteMonacoOptions, type ShikiLike } from '../litemonaco'
import type { IEditorOptions } from '../core/options'
import type { LiteMonacoEditor } from './types'
import { resolveLanguageId, type ITextModel, type PublicTextModel } from './model'
import { guessLanguageId } from './languages'
import { getTheme, setTheme } from './themes'
import { lazyHighlighter } from './lazyhighlighter'

/** IGlobalEditorOptions 里不在 EditorOption 里的那几个(文本模型选项) */
export interface IGlobalEditorOptions {
    tabSize?: number
    indentSize?: number | 'tabSize'
    insertSpaces?: boolean
    detectIndentation?: boolean
    trimAutoWhitespace?: boolean
    largeFileOptimizations?: boolean
    /** 旧的 true / false 照样收(运行时迁移成 'matchingDocuments' / 'off',同 Monaco) */
    wordBasedSuggestions?: 'off' | 'currentDocument' | 'matchingDocuments' | 'allDocuments'
}

export interface IStandaloneEditorConstructionOptions extends IEditorOptions, IGlobalEditorOptions {
    value?: string
    language?: string
    theme?: string
    /** Monaco 的 ITextModel 形态即可(类型层不要求带 lite 内部成员);运行时必须是 lite-monaco 的 createModel 产物 */
    model?: PublicTextModel | null
    dimension?: { width: number, height: number }
    ariaContainerElement?: HTMLElement
    overflowWidgetsDomNode?: HTMLElement
    autoDetectHighContrast?: boolean
    accessibilityHelpUrl?: string
    // ── lite-monaco 自己的(Monaco 里没有) ──
    highlighter?: ShikiLike
    features?: LiteMonacoOptions['features']
    colors?: LiteMonacoOptions['colors']
    keymap?: LiteMonacoOptions['keymap']
    extensions?: LiteMonacoOptions['extensions']
    diagnostics?: LiteMonacoOptions['diagnostics']
    tsFiles?: LiteMonacoOptions['tsFiles']
    fileName?: LiteMonacoOptions['fileName']
}

let defaultHighlighter: ShikiLike | undefined
/** 登记 createEditor 缺省用的高亮器 */
export function setDefaultHighlighter(hl: ShikiLike | undefined): void { defaultHighlighter = hl }
/** createDiffEditor 缺省用:setDefaultHighlighter 登记的那个 */
export function getDefaultHighlighter(): ShikiLike | undefined { return defaultHighlighter }

const LITE_MONACO_KEYS = ['highlighter', 'features', 'colors', 'keymap', 'extensions', 'diagnostics', 'tsFiles', 'fileName'] as const

// 第三个参数是 Monaco 的 IEditorOverrideServices(换掉编辑器内部的服务)。lite-monaco 没有服务容器,收下不用;
// 签名留着,照 Monaco 写的调用(比如 @monaco-editor/react 每次都传 overrideServices)类型和运行都照常
export function createEditor(container: HTMLElement, options: IStandaloneEditorConstructionOptions = {}, _override?: { [index: string]: unknown }): LiteMonacoEditor {
    const { value, language, theme, model, dimension, ...rest } = options
    // 没传也没登记:用懒加载 shiki 的默认高亮器(同 Monaco,create 不需要前置配置)
    const highlighter = options.highlighter ?? defaultHighlighter ?? lazyHighlighter
    const own: Record<string, unknown> = {}
    const monacoOptions: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
        if ((LITE_MONACO_KEYS as readonly string[]).includes(k)) own[k] = v
        else if (k !== 'autoDetectHighContrast' && k !== 'accessibilityHelpUrl') monacoOptions[k] = v
    }
    // 主题是全局的:先设(此时本实例还没登记,不会多重装配一次),再用当前主题名建
    if (theme && theme !== getTheme()) setTheme(theme)
    const ed = liteMonaco({
        parent: container,
        highlighter,
        // 带 model 时先建空编辑器,内容整篇由 setModel 带过来(不再 getValue + 切行 + 建树白做一遍:大文件上是几十到上百毫秒)
        doc: model ? '' : value ?? '',
        noModel: !!model,
        // 同 Monaco 的 createTextModel:mime 换成 id,没给(含空串)按首行猜,再没有是 plaintext
        lang: model ? model.getLanguageId() : resolveLanguageId(language) || guessLanguageId(null, (value ?? '').split(/\r\n|\r|\n/, 1)[0]) || 'plaintext',
        theme: theme ?? getTheme(),
        options: monacoOptions as IEditorOptions,
        ...own,
    })
    if (model) ed.setModel(model as ITextModel)
    if (dimension) ed.layout(dimension)
    markContainer(container, ed)
    return ed
}

let keybindingContexts = 0

/**
 * Monaco codeEditorWidget 在容器上写的两个属性:data-mode-id(当前 model 的语言,换 model / 换语言跟着变,没 model 时去掉)
 * 和 data-keybinding-context(这个编辑器的快捷键上下文编号);销毁时都去掉。有人拿 [data-mode-id="…"] 写样式
 */
function markContainer(container: HTMLElement, ed: LiteMonacoEditor): void {
    const unmark = markKeybindingContext(container)
    const sync = () => {
        const m = ed.getModel()
        if (m) container.setAttribute('data-mode-id', m.getLanguageId())
        else container.removeAttribute('data-mode-id')
    }
    sync()
    const subs = [ed.onDidChangeModel(sync), ed.onDidChangeModelLanguage(sync)]
    ed.onDidDispose(() => {
        for (const s of subs) s.dispose()
        container.removeAttribute('data-mode-id')
        unmark()
    })
}

/** 容器上的 data-keybinding-context(Monaco 每个编辑器、diff 编辑器各占一个编号);返回去掉它的函数 */
export function markKeybindingContext(container: Element): () => void {
    container.setAttribute('data-keybinding-context', String(++keybindingContexts))
    return () => container.removeAttribute('data-keybinding-context')
}
