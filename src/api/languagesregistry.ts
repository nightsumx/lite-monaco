// 语言注册表三层(Monaco common/languages/modesRegistry + common/services/{languagesAssociations,languagesRegistry,languageService} 同构):
//
//   ModesRegistry          languages.register 写入的原始登记表(只增不减)
//   languagesAssociations  扩展名 / 文件名 / 文件名模式 / 首行 → mime & 语言 id 的优先级规则(用户配置 > 平台登记;文件名 > 模式 > 最长扩展名;后注册者赢)
//   LanguagesRegistry      把原始登记合并成 id → {name, mimetypes, aliases, extensions, filenames…},带 LanguageIdCodec
//   LanguageService        对外服务(createById / createByFilepathOrFirstLine / getLanguageName …)
//
// languages.ts 的 register / getLanguages / guessLanguageId / getEncodedLanguageId 都落在这里。
// 语言关联是模块级全局表(同 Monaco):多个 LanguagesRegistry 共享它,任何一个重建都会先清掉平台登记再重放。

import { Emitter } from './context'
import type { IDisposable, IEvent } from './types'
import type { ILanguageExtensionPoint } from './languages'
import { getTokenizationRegistry } from './tokenization'

export const PLAINTEXT_LANGUAGE_ID = 'plaintext'
const NULL_LANGUAGE_ID = 'vs.editor.nullLanguage'

/** Monaco Mimes */
export const Mimes = { text: 'text/plain', binary: 'application/octet-stream', unknown: 'application/unknown' } as const

// ───────────── 文件关联 ─────────────

export interface ILanguageAssociation {
    readonly id: string
    readonly mime: string
    readonly filename?: string
    readonly extension?: string
    readonly filepattern?: string
    readonly firstline?: RegExp
}

/** 关联匹配只看这几个字段(vscode-uri 的 URI 和 lite-monaco 的 Uri 都满足) */
export interface IAssociationResource { readonly scheme: string, readonly path: string, readonly fsPath?: string }

interface AssociationItem extends ILanguageAssociation {
    readonly userConfigured: boolean
    readonly filenameLowercase?: string
    readonly extensionLowercase?: string
    readonly filepatternLowercase?: (path: string) => boolean
    readonly filepatternOnPath?: boolean
}

let registeredAssociations: AssociationItem[] = []
let nonUserRegisteredAssociations: AssociationItem[] = []
let userRegisteredAssociations: AssociationItem[] = []

/** glob → 谓词:`**` 跨目录,`*` / `?` 不跨 `/`,`{a,b}` 选择,`[abc]` 字符类。整串匹配(大小写由调用方先归一) */
export function globMatcher(glob: string): (path: string) => boolean {
    let re = ''
    let braces = 0
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === '*') {
            if (glob[i + 1] === '*') {
                // `**/` = 零或多层目录;其余 `**` = 任意串
                if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2 } else { re += '.*'; i += 1 }
            } else re += '[^/]*'
        } else if (c === '?') re += '[^/]'
        else if (c === '{') { braces++; re += '(?:' }
        else if (c === '}' && braces > 0) { braces--; re += ')' }
        else if (c === ',' && braces > 0) re += '|'
        else if (c === '[') {
            const j = glob.indexOf(']', i + 1)
            if (j < 0) re += '\\['
            else { re += '[' + glob.slice(i + 1, j).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']'; i = j }
        } else re += c.replace(/[.+^$()|\\\]]/g, '\\$&')
    }
    const rx = new RegExp('^' + re + '$')
    return p => rx.test(p)
}

function basenameOf(path: string): string {
    const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return i < 0 ? path : path.slice(i + 1)
}

function toItem(a: ILanguageAssociation, userConfigured: boolean): AssociationItem {
    return {
        ...a,
        userConfigured,
        filenameLowercase: a.filename?.toLowerCase(),
        extensionLowercase: a.extension?.toLowerCase(),
        filepatternLowercase: a.filepattern ? globMatcher(a.filepattern.toLowerCase()) : undefined,
        filepatternOnPath: a.filepattern ? a.filepattern.indexOf('/') >= 0 : false,
    }
}

function addAssociation(a: ILanguageAssociation, userConfigured: boolean, warnOnOverwrite: boolean): void {
    const item = toItem(a, userConfigured)
    registeredAssociations.push(item)
    ;(userConfigured ? userRegisteredAssociations : nonUserRegisteredAssociations).push(item)
    if (!warnOnOverwrite || userConfigured) return
    for (const o of registeredAssociations) {
        if (o.mime === item.mime || o.userConfigured) continue
        if (item.extension && o.extension === item.extension) console.warn(`Overwriting extension <<${item.extension}>> to now point to mime <<${item.mime}>>`)
        if (item.filename && o.filename === item.filename) console.warn(`Overwriting filename <<${item.filename}>> to now point to mime <<${item.mime}>>`)
        if (item.filepattern && o.filepattern === item.filepattern) console.warn(`Overwriting filepattern <<${item.filepattern}>> to now point to mime <<${item.mime}>>`)
        if (item.firstline && o.firstline === item.firstline) console.warn(`Overwriting firstline <<${item.firstline}>> to now point to mime <<${item.mime}>>`)
    }
}

/** 平台登记(输给用户配置) */
export function registerPlatformLanguageAssociation(a: ILanguageAssociation, warnOnOverwrite = false): void { addAssociation(a, false, warnOnOverwrite) }
/** 用户配置(赢过平台登记) */
export function registerConfiguredLanguageAssociation(a: ILanguageAssociation): void { addAssociation(a, true, false) }
export function clearPlatformLanguageAssociations(): void {
    registeredAssociations = registeredAssociations.filter(a => a.userConfigured)
    nonUserRegisteredAssociations = []
}
export function clearConfiguredLanguageAssociations(): void {
    registeredAssociations = registeredAssociations.filter(a => !a.userConfigured)
    userRegisteredAssociations = []
}

interface IdAndMime { id: string, mime: string }

/** data: URI 的 `label:xxx` 元数据(Monaco DataUri.parseMetaData) */
function dataUriLabel(resource: IAssociationResource): string | undefined {
    const p = resource.path
    const meta = p.substring(0, p.indexOf(',') < 0 ? p.length : p.indexOf(','))
    for (const part of meta.split(';')) {
        const i = part.indexOf(':')
        if (i > 0 && part.slice(0, i) === 'label') return part.slice(i + 1)
    }
    return undefined
}

function getAssociations(resource: IAssociationResource | null, firstLine?: string): IdAndMime[] {
    let path: string | undefined
    if (resource) {
        switch (resource.scheme) {
            case 'file': path = resource.fsPath ?? resource.path; break
            case 'data': path = dataUriLabel(resource); break
            case 'vscode-notebook-cell': path = undefined; break // 单元格的语言与文件路径无关
            default: path = resource.path
        }
    }
    const unknown: IdAndMime = { id: 'unknown', mime: Mimes.unknown }
    if (!path) return [unknown]
    path = path.toLowerCase()
    const filename = basenameOf(path)
    const plain: IdAndMime = { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }

    // 1) 用户配置 2) 平台登记 3) 首行(最低)
    const configured = byPath(path, filename, userRegisteredAssociations)
    if (configured) return [configured, plain]
    const registered = byPath(path, filename, nonUserRegisteredAssociations)
    if (registered) return [registered, plain]
    if (firstLine) {
        const fl = byFirstline(firstLine)
        if (fl) return [fl, plain]
    }
    return [unknown]
}

function byPath(path: string, filename: string, list: AssociationItem[]): AssociationItem | undefined {
    let filenameMatch: AssociationItem | undefined
    let patternMatch: AssociationItem | undefined
    let extensionMatch: AssociationItem | undefined
    // 后注册的赢(microsoft/vscode#20074):倒着扫
    for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i]
        if (filename === a.filenameLowercase) { filenameMatch = a; break }
        if (a.filepattern && (!patternMatch || a.filepattern.length > patternMatch.filepattern!.length)) {
            if (a.filepatternLowercase!(a.filepatternOnPath ? path : filename)) patternMatch = a
        }
        if (a.extension && (!extensionMatch || a.extension.length > extensionMatch.extension!.length)) {
            if (filename.endsWith(a.extensionLowercase!)) extensionMatch = a
        }
    }
    return filenameMatch ?? patternMatch ?? extensionMatch
}

function byFirstline(firstLine: string): AssociationItem | undefined {
    if (firstLine.charCodeAt(0) === 0xFEFF) firstLine = firstLine.slice(1)
    if (!firstLine.length) return undefined
    for (let i = registeredAssociations.length - 1; i >= 0; i--) {
        const a = registeredAssociations[i]
        if (!a.firstline) continue
        if (firstLine.match(a.firstline)?.length) return a
    }
    return undefined
}

/** 按注册的关联给文件猜最合适的 mime 列表(命中 → [mime, text/plain];没命中 → [application/unknown]) */
export function getMimeTypes(resource: IAssociationResource | null, firstLine?: string): string[] {
    return getAssociations(resource, firstLine).map(i => i.mime)
}
/** 同 getMimeTypes,返回语言 id */
export function getLanguageIds(resource: IAssociationResource | null, firstLine?: string): string[] {
    return getAssociations(resource, firstLine).map(i => i.id)
}

// ───────────── ModesRegistry ─────────────

class ModesRegistryImpl {
    private readonly _languages: ILanguageExtensionPoint[] = []
    private readonly _onDidChange = new Emitter<void>()
    readonly onDidChangeLanguages: IEvent<void> = this._onDidChange.event
    registerLanguage(def: ILanguageExtensionPoint): IDisposable {
        this._languages.push(def)
        this._onDidChange.fire()
        return { dispose: () => { const i = this._languages.indexOf(def); if (i >= 0) { this._languages.splice(i, 1); this._onDidChange.fire() } } }
    }
    registerLanguages(defs: ILanguageExtensionPoint[]): void {
        this._languages.push(...defs)
        this._onDidChange.fire()
    }
    getLanguages(): ILanguageExtensionPoint[] { return this._languages }
}
export const ModesRegistry = new ModesRegistryImpl()

// ───────────── LanguagesRegistry ─────────────

const hasOwn = Object.prototype.hasOwnProperty

interface ResolvedLanguage {
    identifier: string
    name: string | null
    mimetypes: string[]
    aliases: string[]
    extensions: string[]
    filenames: string[]
    configurationFiles: unknown[]
}

/** languageId 字符串 ↔ 数字(Null = 0, PlainText = 1,其余按首次注册顺序从 2 起) */
export class LanguageIdCodec {
    private _next = 2
    private readonly _byId: string[] = []
    private readonly _byName = new Map<string, number>()
    constructor() {
        this._set(NULL_LANGUAGE_ID, 0)
        this._set(PLAINTEXT_LANGUAGE_ID, 1)
    }
    private _set(lang: string, id: number): void { this._byId[id] = lang; this._byName.set(lang, id) }
    register(lang: string): void { if (!this._byName.has(lang)) this._set(lang, this._next++) }
    encodeLanguageId(languageId: string): number { return this._byName.get(languageId) || 0 }
    decodeLanguageId(id: number): string { return this._byId[id] || NULL_LANGUAGE_ID }
}

function compareIgnoreCase(a: string, b: string): number {
    const x = a.toLowerCase(), y = b.toLowerCase()
    return x < y ? -1 : x > y ? 1 : 0
}

function regExpLeadsToEndlessLoop(re: RegExp): boolean {
    if (re.source === '^' || re.source === '^$' || re.source === '$' || re.source === '^\\s*$') return false
    const m = re.exec('')
    return !!(m && re.lastIndex === 0)
}

export interface ILanguageNameIdPair { readonly languageName: string, readonly languageId: string }

export class LanguagesRegistry {
    private readonly _onDidChange = new Emitter<void>()
    readonly onDidChange: IEvent<void> = this._onDidChange.event
    readonly languageIdCodec = new LanguageIdCodec()
    private readonly _warnOnOverwrite: boolean
    private _languages: { [id: string]: ResolvedLanguage } = {}
    private _mimeTypesMap: { [mime: string]: string } = {}
    private _nameMap: { [name: string]: string } = {}
    private _lowercaseNameMap: { [name: string]: string } = {}
    private _sub: IDisposable | null = null

    constructor(useModesRegistry = true, warnOnOverwrite = false) {
        this._warnOnOverwrite = warnOnOverwrite
        if (useModesRegistry) {
            this._initializeFromRegistry()
            this._sub = ModesRegistry.onDidChangeLanguages(() => this._initializeFromRegistry())
        }
    }

    dispose(): void {
        this._sub?.dispose()
        this._sub = null
        this._onDidChange.dispose()
    }

    private _initializeFromRegistry(): void {
        this._languages = {}
        this._mimeTypesMap = {}
        this._nameMap = {}
        this._lowercaseNameMap = {}
        clearPlatformLanguageAssociations()
        this._registerLanguages(ModesRegistry.getLanguages().slice())
    }

    registerLanguage(desc: ILanguageExtensionPoint): IDisposable { return ModesRegistry.registerLanguage(desc) }

    _registerLanguages(desc: ILanguageExtensionPoint[]): void {
        for (const d of desc) this._registerLanguage(d)
        // 重建快速表
        this._mimeTypesMap = {}
        this._nameMap = {}
        this._lowercaseNameMap = {}
        for (const langId of Object.keys(this._languages)) {
            const l = this._languages[langId]
            if (l.name) this._nameMap[l.name] = l.identifier
            for (const a of l.aliases) this._lowercaseNameMap[a.toLowerCase()] = l.identifier
            for (const m of l.mimetypes) this._mimeTypesMap[m] = l.identifier
        }
        this._onDidChange.fire()
    }

    private _registerLanguage(lang: ILanguageExtensionPoint): void {
        const id = lang.id
        let resolved: ResolvedLanguage
        if (hasOwn.call(this._languages, id)) resolved = this._languages[id]
        else {
            this.languageIdCodec.register(id)
            resolved = { identifier: id, name: null, mimetypes: [], aliases: [], extensions: [], filenames: [], configurationFiles: [] }
            this._languages[id] = resolved
        }
        this._mergeLanguage(resolved, lang)
    }

    private _mergeLanguage(resolved: ResolvedLanguage, lang: ILanguageExtensionPoint): void {
        const langId = lang.id
        let primaryMime: string | null = null
        if (Array.isArray(lang.mimetypes) && lang.mimetypes.length > 0) {
            resolved.mimetypes.push(...lang.mimetypes)
            primaryMime = lang.mimetypes[0]
        }
        if (!primaryMime) {
            primaryMime = `text/x-${langId}`
            resolved.mimetypes.push(primaryMime)
        }

        if (Array.isArray(lang.extensions)) {
            // 带 configuration 的是「主」语言定义:扩展名排前面
            resolved.extensions = lang.configuration ? lang.extensions.concat(resolved.extensions) : resolved.extensions.concat(lang.extensions)
            for (const extension of lang.extensions) registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, extension }, this._warnOnOverwrite)
        }
        if (Array.isArray(lang.filenames)) {
            for (const filename of lang.filenames) {
                registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, filename }, this._warnOnOverwrite)
                resolved.filenames.push(filename)
            }
        }
        if (Array.isArray(lang.filenamePatterns)) {
            for (const filepattern of lang.filenamePatterns) registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, filepattern }, this._warnOnOverwrite)
        }
        if (typeof lang.firstLine === 'string' && lang.firstLine.length > 0) {
            let src = lang.firstLine
            if (src.charAt(0) !== '^') src = '^' + src
            try {
                const firstline = new RegExp(src)
                if (!regExpLeadsToEndlessLoop(firstline)) registerPlatformLanguageAssociation({ id: langId, mime: primaryMime, firstline }, this._warnOnOverwrite)
            } catch (err) {
                console.warn(`[${lang.id}]: Invalid regular expression \`${src}\`: `, err)
            }
        }

        resolved.aliases.push(langId)
        let langAliases: Array<string | null> | null = null
        if (Array.isArray(lang.aliases)) langAliases = lang.aliases.length === 0 ? [null] : lang.aliases // 空数组 = 不要名字
        if (langAliases !== null) {
            for (const a of langAliases) if (a && a.length > 0) resolved.aliases.push(a)
        }
        const containsAliases = langAliases !== null && langAliases.length > 0
        if (!(containsAliases && langAliases![0] === null)) {
            const bestName = (containsAliases ? langAliases![0] : null) || langId
            if (containsAliases || !resolved.name) resolved.name = bestName
        }
        if (lang.configuration) resolved.configurationFiles.push(lang.configuration)
    }

    isRegisteredLanguageId(languageId: string | null | undefined): boolean {
        return !!languageId && hasOwn.call(this._languages, languageId)
    }
    getRegisteredLanguageIds(): string[] { return Object.keys(this._languages) }
    getSortedRegisteredLanguageNames(): ILanguageNameIdPair[] {
        const out: ILanguageNameIdPair[] = []
        for (const languageName of Object.keys(this._nameMap)) out.push({ languageName, languageId: this._nameMap[languageName] })
        out.sort((a, b) => compareIgnoreCase(a.languageName, b.languageName))
        return out
    }
    getLanguageName(languageId: string): string | null {
        return hasOwn.call(this._languages, languageId) ? this._languages[languageId].name : null
    }
    getMimeType(languageId: string): string | null {
        return hasOwn.call(this._languages, languageId) ? this._languages[languageId].mimetypes[0] || null : null
    }
    getExtensions(languageId: string): ReadonlyArray<string> {
        return hasOwn.call(this._languages, languageId) ? this._languages[languageId].extensions : []
    }
    getFilenames(languageId: string): ReadonlyArray<string> {
        return hasOwn.call(this._languages, languageId) ? this._languages[languageId].filenames : []
    }
    getConfigurationFiles(languageId: string): ReadonlyArray<unknown> {
        return hasOwn.call(this._languages, languageId) ? this._languages[languageId].configurationFiles || [] : []
    }
    getLanguageIdByLanguageName(languageName: string): string | null {
        const k = languageName.toLowerCase()
        return hasOwn.call(this._lowercaseNameMap, k) ? this._lowercaseNameMap[k] : null
    }
    getLanguageIdByMimeType(mimeType: string | null | undefined): string | null {
        if (!mimeType) return null
        return hasOwn.call(this._mimeTypesMap, mimeType) ? this._mimeTypesMap[mimeType] : null
    }
    guessLanguageIdByFilepathOrFirstLine(resource: IAssociationResource | null, firstLine?: string): string[] {
        if (!resource && !firstLine) return []
        return getLanguageIds(resource, firstLine)
    }
}

// ───────────── LanguageService ─────────────

export interface ILanguageSelection {
    readonly languageId: string
    readonly onDidChange: IEvent<string>
}

/** 语言选择:languageId 随注册表变化(比如先 createByFilepath、后注册了对应语言) */
class LanguageSelection implements ILanguageSelection {
    readonly onDidChange: IEvent<string>
    constructor(onDidChangeLanguages: IEvent<void>, private readonly _selector: () => string) {
        this.onDidChange = (listener, thisArg) => {
            let last = _selector()
            return onDidChangeLanguages(() => {
                const v = _selector()
                if (v === last) return
                last = v
                thisArg === undefined ? listener(v) : listener.call(thisArg, v)
            })
        }
    }
    get languageId(): string { return this._selector() }
}

export class LanguageService {
    private readonly _onDidChange = new Emitter<void>()
    readonly onDidChange: IEvent<void> = this._onDidChange.event
    private readonly _onDidRequestBasicLanguageFeatures = new Emitter<string>()
    readonly onDidRequestBasicLanguageFeatures: IEvent<string> = this._onDidRequestBasicLanguageFeatures.event
    private readonly _requestedBasicLanguages = new Set<string>()
    private readonly _onDidRequestRichLanguageFeatures = new Emitter<string>()
    readonly onDidRequestRichLanguageFeatures: IEvent<string> = this._onDidRequestRichLanguageFeatures.event
    private readonly _requestedRichLanguages = new Set<string>()
    protected readonly _registry: LanguagesRegistry
    private readonly _sub: IDisposable
    readonly languageIdCodec: LanguageIdCodec

    constructor(warnOnOverwrite = false) {
        this._registry = new LanguagesRegistry(true, warnOnOverwrite)
        this.languageIdCodec = this._registry.languageIdCodec
        this._sub = this._registry.onDidChange(() => this._onDidChange.fire())
    }

    dispose(): void {
        this._sub.dispose()
        this._registry.dispose()
        this._onDidChange.dispose()
        this._onDidRequestBasicLanguageFeatures.dispose()
        this._onDidRequestRichLanguageFeatures.dispose()
    }

    registerLanguage(def: ILanguageExtensionPoint): IDisposable { return this._registry.registerLanguage(def) }
    isRegisteredLanguageId(languageId: string | null | undefined): boolean { return this._registry.isRegisteredLanguageId(languageId) }
    getRegisteredLanguageIds(): string[] { return this._registry.getRegisteredLanguageIds() }
    getSortedRegisteredLanguageNames(): ILanguageNameIdPair[] { return this._registry.getSortedRegisteredLanguageNames() }
    getLanguageName(languageId: string): string | null { return this._registry.getLanguageName(languageId) }
    getMimeType(languageId: string): string | null { return this._registry.getMimeType(languageId) }
    getExtensions(languageId: string): ReadonlyArray<string> { return this._registry.getExtensions(languageId) }
    getFilenames(languageId: string): ReadonlyArray<string> { return this._registry.getFilenames(languageId) }
    getConfigurationFiles(languageId: string): ReadonlyArray<unknown> { return this._registry.getConfigurationFiles(languageId) }
    getLanguageIdByLanguageName(languageName: string): string | null { return this._registry.getLanguageIdByLanguageName(languageName) }
    getLanguageIdByMimeType(mimeType: string | null | undefined): string | null { return this._registry.getLanguageIdByMimeType(mimeType) }
    guessLanguageIdByFilepathOrFirstLine(resource: IAssociationResource | null, firstLine?: string): string | null {
        return this._registry.guessLanguageIdByFilepathOrFirstLine(resource, firstLine)[0] ?? null
    }

    createById(languageId: string | null | undefined): ILanguageSelection {
        return new LanguageSelection(this.onDidChange, () => this._resolve(languageId))
    }
    createByMimeType(mimeType: string | null | undefined): ILanguageSelection {
        return new LanguageSelection(this.onDidChange, () => this._resolve(this.getLanguageIdByMimeType(mimeType)))
    }
    createByFilepathOrFirstLine(resource: IAssociationResource | null, firstLine?: string): ILanguageSelection {
        return new LanguageSelection(this.onDidChange, () => this._resolve(this.guessLanguageIdByFilepathOrFirstLine(resource, firstLine)))
    }
    /** 没登记的语言一律回落 plaintext */
    private _resolve(languageId: string | null | undefined): string {
        return !languageId || !this.isRegisteredLanguageId(languageId) ? PLAINTEXT_LANGUAGE_ID : languageId
    }

    requestBasicLanguageFeatures(languageId: string): void {
        if (this._requestedBasicLanguages.has(languageId)) return
        this._requestedBasicLanguages.add(languageId)
        this._onDidRequestBasicLanguageFeatures.fire(languageId)
    }

    /** Monaco LanguageService.requestRichLanguageFeatures:model 第一次用上某语言时调;每个语言只发一次 */
    requestRichLanguageFeatures(languageId: string): void {
        if (this._requestedRichLanguages.has(languageId)) return
        this._requestedRichLanguages.add(languageId)
        // 先要基础能力,再创建分词器(懒工厂在这里被触发),最后才通知「富特性」
        this.requestBasicLanguageFeatures(languageId)
        void getTokenizationRegistry().getOrCreate?.(languageId)
        this._onDidRequestRichLanguageFeatures.fire(languageId)
    }
}

/** 进程内共享的那一份(languages.getEncodedLanguageId / createModel 的语言推断都走它);首次用到才建 */
let defaultService: LanguageService | null = null
export function getLanguageService(): LanguageService { return defaultService ??= new LanguageService() }
