// 语言注册表与语言配置(Monaco `monaco.languages.{register,getLanguages,setLanguageConfiguration}` +
// `monaco.editor.{setModelLanguage,onDidChangeModelLanguage}`)。
//
// 两张表:
//   - 语言列表(ILanguageExtensionPoint):id / 扩展名 / 文件名 / 首行 / 别名 / mime,按扩展名等推断 createModel 的语言
//   - 语言配置(LanguageConfiguration):按 languageId 存。`liteMonaco()` 装配时优先读它,取代硬编码表
//     (行注释 / 折叠标记 / 缩进规则 / onEnter 规则 / 括号 / 自动配对 / 包裹对 / 彩虹括号 / 词定义 / autoCloseBefore)。
//     真正的消费在 `src/lang/langconfig.ts`(把配置翻译成 core 的 facet),这里只管存、发事件、通知热更新。
//
// 配置变了:fire `onDidChangeLanguageConfiguration`,同时让所有语言是该 id 的实例重装配(host.reassemble)。
// Monaco 的 setLanguageConfiguration 返回 IDisposable(dispose 即撤销这次设置),同名再设会盖过前一次。

import { Emitter } from './context'
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from './modelsearch'
import { ModesRegistry, getLanguageService, type IAssociationResource } from './languagesregistry'
import type { IDisposable, IEvent } from './types'
import type { Uri } from './uri'

// ───────────── 类型(Monaco languages.LanguageConfiguration 同形) ─────────────

export type CharacterPair = [string, string]

export interface CommentRule {
    lineComment?: string | { comment: string, noIndent?: boolean } | null
    blockComment?: CharacterPair | null
}

export interface IAutoClosingPair {
    open: string
    close: string
}
export interface IAutoClosingPairConditional extends IAutoClosingPair {
    notIn?: string[]
}

export interface IndentationRule {
    decreaseIndentPattern: RegExp
    increaseIndentPattern: RegExp
    indentNextLinePattern?: RegExp | null
    unIndentedLinePattern?: RegExp | null
}

export enum IndentAction {
    None = 0,
    Indent = 1,
    IndentOutdent = 2,
    Outdent = 3,
}
export interface EnterAction {
    indentAction: IndentAction
    appendText?: string
    removeText?: number
}
export interface OnEnterRule {
    beforeText: RegExp
    afterText?: RegExp
    previousLineText?: RegExp
    action: EnterAction
}

export interface FoldingMarkers {
    start: RegExp
    end: RegExp
}
export interface FoldingRules {
    offSide?: boolean
    markers?: FoldingMarkers
}

export interface LanguageConfiguration {
    comments?: CommentRule
    brackets?: CharacterPair[]
    wordPattern?: RegExp
    indentationRules?: IndentationRule
    onEnterRules?: OnEnterRule[]
    autoClosingPairs?: IAutoClosingPairConditional[]
    surroundingPairs?: IAutoClosingPair[]
    colorizedBracketPairs?: CharacterPair[]
    autoCloseBefore?: string
    folding?: FoldingRules
    /** 旧式文档注释(Monaco 内部字段):docComment.open 当作一个额外的自动补闭对 */
    __electricCharacterSupport?: { docComment?: { open: string, close?: string } }
}

export interface ILanguageExtensionPoint {
    id: string
    extensions?: string[]
    filenames?: string[]
    filenamePatterns?: string[]
    firstLine?: string
    aliases?: string[]
    mimetypes?: string[]
    configuration?: Uri
}

export interface ILanguageExtensionPointWithConfig extends ILanguageExtensionPoint {}

export interface ILanguageChangedEvent {
    readonly languageId: string
}

// ───────────── 语言列表 ─────────────

const PLAINTEXT: ILanguageExtensionPoint = {
    id: 'plaintext',
    extensions: ['.txt'],
    aliases: ['Plain Text', 'text'],
    mimetypes: ['text/plain'],
}

/** lite-monaco 自带高亮 / 配置表认识的语言(shiki 的语言 id)。register() 没登记的也能用,这里只是 getLanguages() 的种子 */
const SEED: ILanguageExtensionPoint[] = [
    PLAINTEXT,
    { id: 'typescript', extensions: ['.ts', '.tsx', '.mts', '.cts'], aliases: ['TypeScript', 'ts', 'typescript'], mimetypes: ['text/typescript'] },
    { id: 'javascript', extensions: ['.js', '.es6', '.jsx', '.mjs', '.cjs'], firstLine: '^#!.*\\bnode', filenames: ['jakefile'], aliases: ['JavaScript', 'javascript', 'js'], mimetypes: ['text/javascript'] },
    { id: 'json', extensions: ['.json', '.bowerrc', '.jshintrc', '.jscsrc', '.eslintrc', '.babelrc', '.har'], aliases: ['JSON', 'json'], mimetypes: ['application/json'] },
    { id: 'html', extensions: ['.html', '.htm', '.shtml', '.xhtml', '.mdoc', '.jsp', '.asp', '.aspx', '.jshtm'], aliases: ['HTML', 'htm', 'html', 'xhtml'], mimetypes: ['text/html', 'text/x-jshtm', 'text/template', 'text/ng-template'] },
    { id: 'css', extensions: ['.css'], aliases: ['CSS', 'css'], mimetypes: ['text/css'] },
    { id: 'scss', extensions: ['.scss'], aliases: ['Sass', 'scss'], mimetypes: ['text/x-scss', 'text/scss'] },
    { id: 'less', extensions: ['.less'], aliases: ['Less', 'less'], mimetypes: ['text/x-less', 'text/less'] },
    { id: 'markdown', extensions: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.mdtxt', '.mdtext'], aliases: ['Markdown', 'markdown'] },
    { id: 'python', extensions: ['.py', '.rpy', '.pyw', '.cpy', '.gyp', '.gypi'], firstLine: '^#!\\s*/?.*\\bpython[0-9.-]*\\b', aliases: ['Python', 'py'] },
    { id: 'ruby', extensions: ['.rb', '.rbx', '.rjs', '.gemspec', '.pp'], filenames: ['rakefile', 'gemfile'], firstLine: '^#!\\s*/.*\\bruby\\b', aliases: ['Ruby', 'rb'] },
    { id: 'java', extensions: ['.java', '.jav'], aliases: ['Java', 'java'], mimetypes: ['text/x-java-source', 'text/x-java'] },
    { id: 'kotlin', extensions: ['.kt', '.kts'], aliases: ['Kotlin', 'kotlin'] },
    { id: 'csharp', extensions: ['.cs', '.csx', '.cake'], aliases: ['C#', 'csharp'] },
    { id: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h', '.ino', '.inl', '.ipp'], aliases: ['C++', 'Cpp', 'cpp'] },
    { id: 'c', extensions: ['.c', '.i'], aliases: ['C', 'c'] },
    { id: 'go', extensions: ['.go'], aliases: ['Go'] },
    { id: 'rust', extensions: ['.rs', '.rlib'], aliases: ['Rust', 'rust'] },
    { id: 'php', extensions: ['.php', '.php4', '.php5', '.phtml', '.ctp'], firstLine: '^#!\\s*/.*\\bphp\\b', aliases: ['PHP', 'php'] },
    { id: 'swift', extensions: ['.swift'], aliases: ['Swift', 'swift'] },
    { id: 'shell', extensions: ['.sh', '.bash'], aliases: ['Shell', 'sh'] },
    { id: 'sql', extensions: ['.sql'], aliases: ['SQL'] },
    { id: 'yaml', extensions: ['.yaml', '.yml'], aliases: ['YAML', 'yaml', 'yml'], mimetypes: ['application/x-yaml', 'text/x-yaml'] },
    { id: 'xml', extensions: ['.xml', '.xsd', '.dtd', '.ascx', '.csproj', '.config', '.props', '.targets', '.wxi', '.wxl', '.wxs', '.xaml', '.svg', '.svgz', '.opf', '.xslt', '.xsl'], aliases: ['XML', 'xml'], mimetypes: ['text/xml', 'application/xml'] },
    { id: 'lua', extensions: ['.lua'], aliases: ['Lua', 'lua'] },
    { id: 'dart', extensions: ['.dart'], aliases: ['Dart', 'dart'] },
    { id: 'toml', extensions: ['.toml'], aliases: ['TOML', 'toml'] },
    { id: 'ini', extensions: ['.ini', '.properties', '.gitconfig'], aliases: ['Ini', 'ini'] },
]

ModesRegistry.registerLanguages(SEED)

const emitRegistry = new Emitter<void>()
/** languages.onDidChange:注册了新语言 */
export const onDidChangeLanguages: IEvent<void> = emitRegistry.event

/** monaco.languages.register:同 id 再注册是合并(LanguagesRegistry._mergeLanguage:扩展名等并集) */
export function register(language: ILanguageExtensionPoint): void {
    ModesRegistry.registerLanguage({ ...language })
    emitRegistry.fire()
}

/** monaco.languages.getLanguages:同 id 的多次登记合并成一条 */
export function getLanguages(): ILanguageExtensionPoint[] {
    const merged = new Map<string, ILanguageExtensionPoint>()
    const union = (a?: string[], b?: string[]) => b?.length ? [...new Set([...(a ?? []), ...b])] : a
    for (const l of ModesRegistry.getLanguages()) {
        const prev = merged.get(l.id)
        merged.set(l.id, !prev ? { ...l } : {
            ...prev,
            ...l,
            extensions: union(prev.extensions, l.extensions),
            filenames: union(prev.filenames, l.filenames),
            filenamePatterns: union(prev.filenamePatterns, l.filenamePatterns),
            aliases: union(prev.aliases, l.aliases),
            mimetypes: union(prev.mimetypes, l.mimetypes),
        })
    }
    return [...merged.values()]
}

/** 这个 id 是否登记过 */
export function isRegisteredLanguage(languageId: string): boolean {
    return getLanguageService().isRegisteredLanguageId(languageId)
}

/** monaco.languages.getEncodedLanguageId:语言 id → 数字(0 = null,1 = plaintext,其余按首次登记顺序);没登记的得 0 */
export function getEncodedLanguageId(languageId: string): number {
    return getLanguageService().languageIdCodec.encodeLanguageId(languageId)
}

/**
 * Monaco `languageService.createByFilepathOrFirstLine`:按文件名 / 扩展名 / 首行猜语言;猜不到返回 null。
 * 参数可以是路径串或带 scheme/path 的 Uri(data: URI 取 label 元数据;vscode-notebook-cell 不看路径)。
 */
export function guessLanguageId(resource: string | IAssociationResource | null, firstLine?: string): string | null {
    const res = typeof resource === 'string' ? { scheme: 'file', path: resource } : resource
    const id = getLanguageService().guessLanguageIdByFilepathOrFirstLine(res, firstLine)
    return id && id !== 'unknown' && isRegisteredLanguage(id) ? id : null
}

// ───────────── 语言配置 ─────────────

// 每个语言一叠配置,按 (priority, 注册顺序) 升序;最后一份生效(同 Monaco:高优先级排后面,同级后注册的排后面)
interface ConfigEntry { cfg: LanguageConfiguration, priority: number }
const configs = new Map<string, ConfigEntry[]>()
const versions = new Map<string, number>()
const emitConfig = new Emitter<ILanguageChangedEvent>()
/** languages.onDidChangeLanguageConfiguration(Monaco 没有对外的同名事件,ITextModel.onDidChangeLanguageConfiguration 由它转发) */
export const onDidChangeLanguageConfiguration: IEvent<ILanguageChangedEvent> = emitConfig.event

/**
 * 订阅「某语言的配置变了」的内部钩子,给装配层(litemonaco.ts / langconfig.ts)用:
 * 对着所有语言是 languageId 的实例 host.reassemble()。与公开事件分开,保证它先于用户监听器跑(用户拿到事件时配置已经生效)
 */
type Applier = (languageId: string) => void
const appliers = new Set<Applier>()
export function onLanguageConfigApplied(fn: Applier): IDisposable {
    appliers.add(fn)
    return { dispose: () => { appliers.delete(fn) } }
}

function bump(languageId: string): void {
    versions.set(languageId, (versions.get(languageId) ?? 0) + 1)
    for (const fn of [...appliers]) {
        try { fn(languageId) } catch (e) { console.error(e) }
    }
    emitConfig.fire({ languageId })
}

/** 配置版本号:每次改动 +1,装配层拿它当 facet 值 / 缓存 key */
export function languageConfigurationVersion(languageId: string): number {
    return versions.get(languageId) ?? 0
}

/**
 * monaco.languages.setLanguageConfiguration。后设的盖过先设的(整份替换,不逐字段合并 —— Monaco 的 RichEditSupport 也是整份);
 * 返回的 IDisposable.dispose() 撤销这一次(回到更早的那份,没有就回到 lite-monaco 的内置表)。
 */
export function setLanguageConfiguration(languageId: string, configuration: LanguageConfiguration, priority = 100): IDisposable {
    const stack = configs.get(languageId) ?? []
    const entry: ConfigEntry = { cfg: configuration, priority }
    // 插到第一个优先级更高的前面 = 同级按注册顺序、高优先级靠后
    let at = stack.length
    while (at > 0 && stack[at - 1].priority > priority) at--
    stack.splice(at, 0, entry)
    configs.set(languageId, stack)
    bump(languageId)
    return {
        dispose: () => {
            const s = configs.get(languageId)
            const i = s ? s.indexOf(entry) : -1
            if (!s || i < 0) return
            s.splice(i, 1)
            if (!s.length) configs.delete(languageId)
            bump(languageId)
        },
    }
}

/** 当前生效的语言配置(没设过返回 undefined → 走 lite-monaco 内置表) */
export function getLanguageConfiguration(languageId: string): LanguageConfiguration | undefined {
    const s = configs.get(languageId)
    return s?.[s.length - 1].cfg
}

// 语言 id 的别名:LINE_COMMENT 之类的表里 ts / py 这类缩写和全名并存;配置按用户给的 id 存,查的时候原样和小写各试一次
export function languageConfigurationFor(languageId: string): LanguageConfiguration | undefined {
    return getLanguageConfiguration(languageId) ?? getLanguageConfiguration(languageId.toLowerCase())
}

// ───────────── 词定义 ─────────────

/** 语言的词定义:配置里的 wordPattern,否则 Monaco 默认(DEFAULT_WORD_REGEXP) */
export function getWordDefinition(languageId: string): RegExp {
    const cfg = languageConfigurationFor(languageId)
    return cfg?.wordPattern ? ensureValidWordDefinition(cfg.wordPattern) : DEFAULT_WORD_REGEXP
}

// ───────────── 全局模型语言事件(editor.onDidChangeModelLanguage)+ setModelLanguage ─────────────

/** 防循环依赖:model.ts 启动时把「改语言」的实现登记进来,这里只做 setModelLanguage 的转发 */
export interface ModelLanguageHost {
    setLanguage(model: unknown, languageId: string, source?: string): void
}
let modelHost: ModelLanguageHost | null = null
export function _setModelLanguageHost(h: ModelLanguageHost): void { modelHost = h }

export function setModelLanguage(model: unknown, languageId: string): void {
    if (!modelHost) throw new Error('model module not loaded')
    // 同 Monaco 的 editor.setModelLanguage:mime 换成 id,空的是 plaintext(没登记的 id 原样留着,见 model.ts 的 resolveLanguageId)
    modelHost.setLanguage(model, (languageId && getLanguageService().getLanguageIdByMimeType(languageId)) || languageId || 'plaintext', 'api')
}
