// Context key(Monaco 的 IContextKey / ContextKeyExpr 最小子集)。H2。
//
// - `createContextKey(key, defaultValue)` → `IContextKey`(set / reset / get)。
// - `when` 表达式:`&&` `||` `!` `==` `!=` `===` `!==` `<` `<=` `>` `>=` `=~` `in` `not in`、括号、标识符、字面量
//   (语法照 Monaco `ContextKeyExpr.deserialize`;`a == true` / `a == false` 按 Monaco 当成「已定义 / 未定义」)。
// - 内置 key:Monaco `EditorContextKeys` 那一批 + 找 / 补全 / 片段 / 重命名等现有 UI 状态。
//   内置 key 每次求值时按当前 view 现算(不缓存),用户 createContextKey 同名的覆盖内置值。
//
// 求值入口 `getContextKeyService(view)`:commands.ts(键位的 when)和 actions.ts(precondition / 菜单)共用。
import type * as core from '../core/index'
import type { EditorContext } from './context'
import type { IDisposable, IEvent } from './types'
import { Emitter } from './context'
import { searchField } from '../core/feature/search'
import { peekSuggestUi } from '../core/feature/suggestwidget'
import { undoDepth, redoDepth } from '../core/edit/history'
import { tabFocusMoves } from '../core/edit/commands'
import { getOption } from '../core/options'
import { languageFeatures } from '../lang/languagefeatures'
import { hasDefinitionProvider } from '../lang/providers'

// ───────────── 公开类型 ─────────────

/** Monaco IContextKey */
export interface IContextKey<T extends ContextKeyValue = ContextKeyValue> {
    set(value: T): void
    reset(): void
    get(): T | undefined
}

export type ContextKeyValue = null | undefined | boolean | number | string | Array<null | undefined | boolean | number | string> | Record<string, null | undefined | boolean | number | string>

/** 求值时读 key 的入口 */
export interface IContext {
    getValue<T = unknown>(key: string): T | undefined
}

/** Monaco ContextKeyExpression 的最小形态 */
export interface IContextKeyExpression {
    evaluate(context: IContext): boolean
    serialize(): string
    keys(): string[]
}

export interface IContextKeyChangeEvent {
    readonly keys: readonly string[]
    affectsSome(keys: ReadonlySet<string>): boolean
}

/** 一个实例的 context key 服务(Monaco IContextKeyService 的子集) */
export interface IContextKeyService extends IContext {
    createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T>
    /** 空 / undefined = 恒真;字符串按 `when` 语法解析(带缓存) */
    contextMatchesRules(rules: string | IContextKeyExpression | null | undefined): boolean
    getContextKeyValue<T = unknown>(key: string): T | undefined
    readonly onDidChangeContext: IEvent<IContextKeyChangeEvent>
}

/** 实例上登记的方法 */
export interface IContextKeysApi {
    createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T>
}

// ───────────── 表达式 ─────────────

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | '=~' | 'in' | 'not in'

class Expr implements IContextKeyExpression {
    constructor(
        readonly kind: 'true' | 'defined' | 'not' | 'cmp' | 'and' | 'or',
        readonly key = '',
        readonly op?: Op,
        readonly value?: string,
        readonly children: readonly Expr[] = [],
    ) {}

    evaluate(ctx: IContext): boolean {
        switch (this.kind) {
            case 'true': return true
            case 'defined': return !!ctx.getValue(this.key)
            case 'not': return this.children.length ? !this.children[0].evaluate(ctx) : !ctx.getValue(this.key)
            case 'and': return this.children.every(c => c.evaluate(ctx))
            case 'or': return this.children.some(c => c.evaluate(ctx))
            case 'cmp': return this.compare(ctx)
        }
    }

    private compare(ctx: IContext): boolean {
        const left = ctx.getValue(this.key)
        const lit = this.value ?? ''
        switch (this.op) {
            case '==': return looseEq(left, lit)
            case '!=': return !looseEq(left, lit)
            case '<': return Number(left) < Number(lit)
            case '<=': return Number(left) <= Number(lit)
            case '>': return Number(left) > Number(lit)
            case '>=': return Number(left) >= Number(lit)
            case '=~': {
                const m = /^\/(.*)\/([a-z]*)$/s.exec(lit)
                try { return (m ? new RegExp(m[1], m[2]) : new RegExp(lit)).test(String(left ?? '')) } catch { return false }
            }
            case 'in':
            case 'not in': {
                // `key in other`:other 的值是数组 / 对象 / 字符串,看 key 的值在不在里面
                const other = ctx.getValue(lit)
                const needle = left
                let hit = false
                if (Array.isArray(other)) hit = other.includes(needle)
                else if (typeof other === 'string') hit = typeof needle === 'string' && other.includes(needle)
                else if (other && typeof other === 'object') hit = Object.prototype.hasOwnProperty.call(other, String(needle))
                return this.op === 'in' ? hit : !hit
            }
            default: return false
        }
    }

    serialize(): string {
        switch (this.kind) {
            case 'true': return 'true'
            case 'defined': return this.key
            case 'not': return this.children.length ? `!(${this.children[0].serialize()})` : `!${this.key}`
            case 'and': return this.children.map(c => c.kind === 'or' ? `(${c.serialize()})` : c.serialize()).join(' && ')
            case 'or': return this.children.map(c => c.serialize()).join(' || ')
            case 'cmp': return `${this.key} ${this.op} ${this.op === '=~' ? this.value : JSON.stringify(this.value)}`
        }
    }

    keys(): string[] {
        const out = new Set<string>()
        const walk = (e: Expr) => {
            if (e.key) out.add(e.key)
            if (e.kind === 'cmp' && (e.op === 'in' || e.op === 'not in') && e.value) out.add(e.value)
            e.children.forEach(walk)
        }
        walk(this)
        return [...out]
    }
}

function looseEq(left: unknown, lit: string): boolean {
    if (left === undefined || left === null) return lit === '' || lit === 'null' || lit === 'undefined'
    return String(left) === lit
}

// 词法:标识符 / 值是一段「不含空白、括号、&&、||」的字符;引号串整体当字面量;`/re/flags` 当正则字面量
type Tok = { t: 'op' | 'word' | 'str' | 'regex', v: string }

function tokenize(src: string): Tok[] {
    const out: Tok[] = []
    let i = 0
    const n = src.length
    while (i < n) {
        const c = src[i]
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
        if (c === '&' && src[i + 1] === '&') { out.push({ t: 'op', v: '&&' }); i += 2; continue }
        if (c === '|' && src[i + 1] === '|') { out.push({ t: 'op', v: '||' }); i += 2; continue }
        if (c === '(' || c === ')') { out.push({ t: 'op', v: c }); i++; continue }
        if (c === '!' && src[i + 1] !== '=') { out.push({ t: 'op', v: '!' }); i++; continue }
        if (c === '=' && src[i + 1] === '~') { out.push({ t: 'op', v: '=~' }); i += 2; continue }
        if (c === '=' || c === '!') {
            // == === != !==
            let j = i + 1
            while (src[j] === '=') j++
            out.push({ t: 'op', v: c === '=' ? '==' : '!=' })
            i = j
            continue
        }
        if (c === '<' || c === '>') {
            if (src[i + 1] === '=') { out.push({ t: 'op', v: `${c}=` }); i += 2 }
            else { out.push({ t: 'op', v: c }); i++ }
            continue
        }
        if (c === '\'' || c === '"') {
            let j = i + 1
            let s = ''
            while (j < n && src[j] !== c) { if (src[j] === '\\' && j + 1 < n) j++; s += src[j++] }
            out.push({ t: 'str', v: s })
            i = j + 1
            continue
        }
        if (c === '/' && out.length && out[out.length - 1].v === '=~') {
            let j = i + 1
            while (j < n && !(src[j] === '/' && src[j - 1] !== '\\')) j++
            j++
            while (j < n && src[j] >= 'a' && src[j] <= 'z') j++
            out.push({ t: 'regex', v: src.slice(i, j) })
            i = j
            continue
        }
        let j = i
        while (j < n && ' \t\n\r()'.indexOf(src[j]) < 0 && !(src[j] === '&' && src[j + 1] === '&') && !(src[j] === '|' && src[j + 1] === '|')
            && !((src[j] === '=' || src[j] === '!' || src[j] === '<' || src[j] === '>') && (j > i) && (src[j] === '=' ? true : src[j] === '!' ? src[j + 1] === '=' : true))) j++
        if (j === i) j = i + 1
        out.push({ t: 'word', v: src.slice(i, j) })
        i = j
    }
    return out
}

class Parser {
    private p = 0
    constructor(private readonly toks: Tok[]) {}

    parse(): Expr {
        const e = this.or()
        if (this.p < this.toks.length) throw new SyntaxError(`when 表达式多余的内容: ${this.toks[this.p].v}`)
        return e
    }

    private peek(): Tok | undefined { return this.toks[this.p] }
    private isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === 'op' && t.v === v }

    private or(): Expr {
        const parts = [this.and()]
        while (this.isOp('||')) { this.p++; parts.push(this.and()) }
        return parts.length === 1 ? parts[0] : new Expr('or', '', undefined, undefined, parts)
    }

    private and(): Expr {
        const parts = [this.unary()]
        while (this.isOp('&&')) { this.p++; parts.push(this.unary()) }
        return parts.length === 1 ? parts[0] : new Expr('and', '', undefined, undefined, parts)
    }

    private unary(): Expr {
        if (this.isOp('!')) {
            this.p++
            const inner = this.unary()
            // `!key` 保持简单形态(便于 serialize / keys)
            return inner.kind === 'defined' ? new Expr('not', inner.key) : new Expr('not', '', undefined, undefined, [inner])
        }
        return this.primary()
    }

    private primary(): Expr {
        const t = this.peek()
        if (!t) throw new SyntaxError('when 表达式不完整')
        if (t.t === 'op' && t.v === '(') {
            this.p++
            const e = this.or()
            if (!this.isOp(')')) throw new SyntaxError('when 表达式缺少 )')
            this.p++
            return e
        }
        if (t.t !== 'word') throw new SyntaxError(`when 表达式里不该出现: ${t.v}`)
        this.p++
        const key = t.v
        const next = this.peek()
        // `key not in other`
        if (next && next.t === 'word' && next.v === 'not' && this.toks[this.p + 1]?.v === 'in') {
            this.p += 2
            return new Expr('cmp', key, 'not in', this.value())
        }
        if (next && next.t === 'word' && next.v === 'in') {
            this.p++
            return new Expr('cmp', key, 'in', this.value())
        }
        if (next && next.t === 'op' && ['==', '!=', '<', '<=', '>', '>=', '=~'].includes(next.v)) {
            this.p++
            const op = next.v as Op
            const raw = this.peek()
            const value = this.value()
            // Monaco:`key == true` / `key != false` 等价于「已定义」,反之亦然(只对未加引号的 true / false)
            if (raw && raw.t === 'word' && (op === '==' || op === '!=') && (value === 'true' || value === 'false')) {
                const positive = (op === '==') === (value === 'true')
                return positive ? new Expr('defined', key) : new Expr('not', key)
            }
            return new Expr('cmp', key, op, value)
        }
        if (key === 'true') return new Expr('true')
        if (key === 'false') return new Expr('not', '', undefined, undefined, [new Expr('true')])
        return new Expr('defined', key)
    }

    private value(): string {
        const t = this.peek()
        if (!t || t.t === 'op') throw new SyntaxError('when 表达式缺少比较值')
        this.p++
        return t.v
    }
}

const parseCache = new Map<string, Expr>()

/** Monaco ContextKeyExpr 的最小子集 */
export const ContextKeyExpr = {
    /** 解析 `when` 字符串;空串 / undefined → undefined(恒真)。语法错误抛 SyntaxError */
    deserialize(when: string | null | undefined): IContextKeyExpression | undefined {
        if (when == null) return undefined
        const src = when.trim()
        if (!src) return undefined
        let e = parseCache.get(src)
        if (!e) {
            e = new Parser(tokenize(src)).parse()
            if (parseCache.size > 500) parseCache.clear()
            parseCache.set(src, e)
        }
        return e
    },
    has(key: string): IContextKeyExpression { return new Expr('defined', key) },
    not(key: string): IContextKeyExpression { return new Expr('not', key) },
    equals(key: string, value: unknown): IContextKeyExpression {
        if (value === true) return new Expr('defined', key)
        if (value === false) return new Expr('not', key)
        return new Expr('cmp', key, '==', String(value))
    },
    notEquals(key: string, value: unknown): IContextKeyExpression {
        if (value === true) return new Expr('not', key)
        if (value === false) return new Expr('defined', key)
        return new Expr('cmp', key, '!=', String(value))
    },
    and(...exprs: (IContextKeyExpression | undefined)[]): IContextKeyExpression | undefined {
        const list = exprs.filter((e): e is Expr => !!e)
        return list.length === 0 ? undefined : list.length === 1 ? list[0] : new Expr('and', '', undefined, undefined, list)
    },
    or(...exprs: (IContextKeyExpression | undefined)[]): IContextKeyExpression | undefined {
        const list = exprs.filter((e): e is Expr => !!e)
        return list.length === 0 ? undefined : list.length === 1 ? list[0] : new Expr('or', '', undefined, undefined, list)
    },
}

// ───────────── 内置 key ─────────────

/** 内置 key 的取值(每次现算)。key 名和 Monaco `EditorContextKeys` / 各 contrib 一致 */
const BUILTIN: Record<string, (view: core.EditorView, ctx: ServiceHost) => unknown> = {
    editorTextFocus: v => v.hasFocus,
    // Monaco:编辑器或它的挂件(查找框、补全列表…)有焦点
    editorFocus: v => v.hasFocus || withinEditor(v),
    textInputFocus: v => v.hasFocus || withinEditor(v),
    editorReadonly: v => v.state.readOnly,
    editorHasSelection: v => v.state.selection.ranges.some(r => !r.empty),
    editorHasMultipleSelections: v => v.state.selection.ranges.length > 1,
    editorTabMovesFocus: v => tabFocusMoves() || v.inputState.tabFocusMode > 0,
    editorColumnSelection: v => getOption(v.state, 'columnSelection') === true,
    editorLangId: (_v, h) => h.languageId(),
    isInEmbeddedEditor: () => false,
    inDiffEditor: () => false,
    editorSimpleInput: () => false,
    canUndo: v => undoDepth(v.state) > 0,
    canRedo: v => redoDepth(v.state) > 0,
    // 查找
    findWidgetVisible: v => !!v.state.field(searchField, false)?.open,
    findInputFocussed: v => activeMatches(v, '.cm-find-input[main-field]'),
    replaceInputFocussed: v => activeMatches(v, '.cm-replace-input-box .cm-find-input'),
    // 补全 / 片段
    // 补全:控件状态在 core 的 SuggestUi。片段三个 key 由 SnippetController2 自己 createKey 维护(createKey 盖过这里);没装补全时恒 false(Monaco RawContextKey 缺省值)
    inSnippetMode: () => false,
    hasNextTabstop: () => false,
    hasPrevTabstop: () => false,
    suggestWidgetVisible: v => !!peekSuggestUi(v)?.state.open,
    suggestWidgetMultipleSuggestions: v => (peekSuggestUi(v)?.state.count ?? 0) > 1,
    suggestWidgetHasFocusedSuggestion: v => { const s = peekSuggestUi(v)?.state; return !!s?.open && !s.message && s.focused },
    // 重命名 / 悬浮 / 参数提示:按 DOM 判(这几个挂件没有对应的状态字段)
    renameInputVisible: v => !!v.dom.querySelector('.cm-rename-box'),
    renameInputFocused: v => activeMatches(v, '.cm-rename-input'),
    editorHoverVisible: v => !!v.dom.ownerDocument.querySelector('.cm-tooltip-hover'),
    parameterHintsVisible: v => !!v.dom.ownerDocument.querySelector('.cm-signature-help'),
    stickyScrollVisible: v => !!v.dom.querySelector('.cm-sticky-scroll:not([hidden])'),
    // 提供者(有没有由语言层 / registerXxxProvider 决定;这里只给个保守的默认)
    editorHasCompletionItemProvider: () => false,
    editorHasHoverProvider: v => hasProvider(v, 'hoverProvider'),
    editorHasDefinitionProvider: (_v, h) => hasDefinitionProvider(h.languageId()),
    editorHasDeclarationProvider: v => hasProvider(v, 'declarationProvider'),
    editorHasImplementationProvider: v => hasProvider(v, 'implementationProvider'),
    editorHasTypeDefinitionProvider: v => hasProvider(v, 'typeDefinitionProvider'),
    editorHasDocumentHighlightProvider: v => hasProvider(v, 'documentHighlightProvider'),
    editorHasCodeLensProvider: v => hasProvider(v, 'codeLensProvider'),
    editorHasReferenceProvider: v => hasProvider(v, 'referenceProvider'),
    editorHasRenameProvider: v => hasProvider(v, 'renameProvider'),
    // Monaco:整篇格式化 = 文档格式化器或范围格式化器(范围的充当整篇);选区格式化 = 范围格式化器
    editorHasDocumentFormattingProvider: v => hasProvider(v, 'documentFormattingEditProvider') || hasProvider(v, 'documentRangeFormattingEditProvider'),
    editorHasDocumentSelectionFormattingProvider: v => hasProvider(v, 'documentRangeFormattingEditProvider'),
    editorHasMultipleDocumentFormattingProvider: v => countProviders(v, 'documentFormattingEditProvider') + countProviders(v, 'documentRangeFormattingEditProvider') > 1,
    editorHasMultipleDocumentSelectionFormattingProvider: v => countProviders(v, 'documentRangeFormattingEditProvider') > 1,
    editorHasCodeActionsProvider: () => false,
    editorHasSignatureHelpProvider: v => hasProvider(v, 'signatureHelpProvider'),
    editorHasInlayHintsProvider: () => false,
}

const modelOfView = (v: core.EditorView) => (v as unknown as { getModel?: () => unknown }).getModel?.() as never
function hasProvider(v: core.EditorView, field: keyof typeof languageFeatures): boolean {
    const m = modelOfView(v)
    return !!m && (languageFeatures[field] as unknown as { has(m: never): boolean }).has(m)
}
function countProviders(v: core.EditorView, field: keyof typeof languageFeatures): number {
    const m = modelOfView(v)
    return m ? (languageFeatures[field] as unknown as { all(m: never): unknown[] }).all(m).length : 0
}

function withinEditor(v: core.EditorView): boolean {
    const a = v.dom.ownerDocument.activeElement
    return !!a && v.dom.contains(a)
}

function activeMatches(v: core.EditorView, selector: string): boolean {
    const a = v.dom.ownerDocument.activeElement
    return !!a && v.dom.contains(a) && a.matches(selector)
}

export const BUILTIN_CONTEXT_KEYS: readonly string[] = Object.keys(BUILTIN)

interface ServiceHost {
    languageId(): string
}

// ───────────── 服务 ─────────────

class ContextKeyService implements IContextKeyService {
    private readonly values = new Map<string, unknown>()
    private readonly changes = new Emitter<IContextKeyChangeEvent>()
    readonly onDidChangeContext: IEvent<IContextKeyChangeEvent> = this.changes.event
    // 供 commands / actions 在 key 变化时重算(键位 when 的签名等)
    version = 0

    constructor(private readonly view: core.EditorView, private readonly host: ServiceHost) {}

    getValue<T = unknown>(key: string): T | undefined {
        if (this.values.has(key)) return this.values.get(key) as T
        const fn = BUILTIN[key]
        if (fn) {
            try { return fn(this.view, this.host) as T } catch { return undefined }
        }
        return undefined
    }

    getContextKeyValue<T = unknown>(key: string): T | undefined { return this.getValue<T>(key) }

    contextMatchesRules(rules: string | IContextKeyExpression | null | undefined): boolean {
        if (rules == null) return true
        let expr: IContextKeyExpression | undefined
        try { expr = typeof rules === 'string' ? ContextKeyExpr.deserialize(rules) : rules } catch (e) {
            console.error(e)
            return false
        }
        return expr ? expr.evaluate(this) : true
    }

    createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
        const self = this
        const initial = defaultValue
        if (initial !== undefined) this.write(key, initial)
        else this.values.delete(key)
        return {
            set(value: T) { self.write(key, value) },
            reset() {
                if (initial === undefined) { self.values.delete(key); self.fire(key) }
                else self.write(key, initial)
            },
            get() { return self.values.has(key) ? self.values.get(key) as T : (BUILTIN[key] ? self.getValue<T>(key) : undefined) },
        }
    }

    private write(key: string, value: unknown) {
        if (this.values.has(key) && this.values.get(key) === value) return
        this.values.set(key, value)
        this.fire(key)
    }

    private fire(key: string) {
        this.version++
        this.changes.fire({ keys: [key], affectsSome: keys => keys.has(key) })
    }

    dispose() { this.changes.dispose() }
}

const services = new WeakMap<core.EditorView, ContextKeyService>()

/**
 * 取(必要时建)实例的 context key 服务。
 * `languageId`:内置 key `editorLangId` 的来源;H3 的 `getLanguageId` 装好后自动用它。
 */
export function getContextKeyService(view: core.EditorView): IContextKeyService {
    let s = services.get(view)
    if (!s) {
        s = new ContextKeyService(view, {
            languageId: () => {
                const fn = (view as unknown as { getLanguageId?: () => string }).getLanguageId
                try { return typeof fn === 'function' ? fn.call(view) : '' } catch { return '' }
            },
        })
        services.set(view, s)
        view.onDestroy(() => { services.get(view)?.dispose(); services.delete(view) })
    }
    return s
}

export function installContextKeys(ctx: EditorContext): void {
    const service = getContextKeyService(ctx.view)
    const api = ctx.api as unknown as IContextKeysApi
    api.createContextKey = <T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T | undefined) => service.createKey<T>(key, defaultValue)
}

export type { IDisposable }
