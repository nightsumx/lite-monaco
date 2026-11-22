// updateOptions 的合并语义与配置变更事件。
// 照 Monaco:browser/config/editorConfiguration.js(EditorConfiguration.updateOptions、EditorOptionsUtil.applyUpdate /
// checkEquals、deepCloneAndMigrateOptions)、common/config/editorOptions.js(applyUpdate、ConfigurationChangedEvent)、
// browser/config/migrateOptions.js(老选项迁移)。
import { EDITOR_OPTION_NAMES } from './generated'
import { OPTION_KEYS } from './validate'
import type { ComputedEditorOptionValues, EditorOption, IEditorOptions } from './types'

type Obj = Record<string, unknown>

// ---- 深拷贝(Monaco base/common/objects.deepClone) ----

export function deepClone<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj
    if (obj instanceof RegExp) return obj
    const result: Obj | unknown[] = Array.isArray(obj) ? [] : {}
    Object.entries(obj).forEach(([key, value]) => {
        (result as Obj)[key] = value && typeof value === 'object' ? deepClone(value) : value
    })
    return result as T
}

/** Monaco base/common/objects.equals:深比较(对象按键,数组按位) */
function deepEqualsObjects(one: unknown, other: unknown): boolean {
    if (one === other) return true
    if (one === null || one === undefined || other === null || other === undefined) return false
    if (typeof one !== typeof other) return false
    if (typeof one !== 'object') return false
    if (Array.isArray(one) !== Array.isArray(other)) return false
    if (Array.isArray(one) && Array.isArray(other)) {
        if (one.length !== other.length) return false
        for (let i = 0; i < one.length; i++) if (!deepEqualsObjects(one[i], other[i])) return false
        return true
    }
    const a = one as Obj
    const b = other as Obj
    const oneKeys = Object.keys(a)
    const otherKeys = Object.keys(b)
    if (oneKeys.length !== otherKeys.length) return false
    for (const key of oneKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false
        if (!deepEqualsObjects(a[key], b[key])) return false
    }
    return true
}

// ---- 老选项迁移(Monaco migrateOptions.js) ----
// 没有搬 codeActionsOnSave / codeActionWidget 两条:它们是 VS Code 工作台的设置,不是编辑器选项。

function readPath(source: unknown, key: string): unknown {
    if (typeof source === 'undefined' || source === null) return undefined
    const dot = key.indexOf('.')
    if (dot >= 0) return readPath((source as Obj)[key.substring(0, dot)], key.substring(dot + 1))
    return (source as Obj)[key]
}

function writePath(target: Obj, key: string, value: unknown): void {
    const dot = key.indexOf('.')
    if (dot >= 0) {
        const first = key.substring(0, dot)
        target[first] = target[first] || {}
        writePath(target[first] as Obj, key.substring(dot + 1), value)
        return
    }
    target[key] = value
}

type Migrate = (value: unknown, read: (key: string) => unknown, write: (key: string, value: unknown) => void) => void
const MIGRATIONS: { key: string, migrate: Migrate }[] = []

function registerMigration(key: string, migrate: Migrate): void {
    MIGRATIONS.push({ key, migrate })
}

function registerSimpleMigration(key: string, values: [unknown, unknown][]): void {
    registerMigration(key, (value, _read, write) => {
        if (typeof value !== 'undefined') {
            for (const [oldValue, newValue] of values) {
                if (value === oldValue) {
                    write(key, newValue)
                    return
                }
            }
        }
    })
}

registerSimpleMigration('wordWrap', [[true, 'on'], [false, 'off']])
registerSimpleMigration('lineNumbers', [[true, 'on'], [false, 'off']])
registerSimpleMigration('cursorBlinking', [['visible', 'solid']])
registerSimpleMigration('renderWhitespace', [[true, 'boundary'], [false, 'none']])
registerSimpleMigration('renderLineHighlight', [[true, 'line'], [false, 'none']])
registerSimpleMigration('acceptSuggestionOnEnter', [[true, 'on'], [false, 'off']])
registerSimpleMigration('tabCompletion', [[false, 'off'], [true, 'onlySnippets']])
registerSimpleMigration('hover', [[true, { enabled: true }], [false, { enabled: false }]])
registerSimpleMigration('parameterHints', [[true, { enabled: true }], [false, { enabled: false }]])
registerSimpleMigration('autoIndent', [[false, 'advanced'], [true, 'full']])
registerSimpleMigration('matchBrackets', [[true, 'always'], [false, 'never']])
registerSimpleMigration('renderFinalNewline', [[true, 'on'], [false, 'off']])
registerSimpleMigration('cursorSmoothCaretAnimation', [[true, 'on'], [false, 'off']])
registerSimpleMigration('occurrencesHighlight', [[true, 'singleFile'], [false, 'off']])
registerSimpleMigration('wordBasedSuggestions', [[true, 'matchingDocuments'], [false, 'off']])
registerMigration('autoClosingBrackets', (value, read, write) => {
    if (value === false) {
        write('autoClosingBrackets', 'never')
        if (typeof read('autoClosingQuotes') === 'undefined') write('autoClosingQuotes', 'never')
        if (typeof read('autoSurround') === 'undefined') write('autoSurround', 'never')
    }
})
registerMigration('renderIndentGuides', (value, read, write) => {
    if (typeof value !== 'undefined') {
        write('renderIndentGuides', undefined)
        if (typeof read('guides.indentation') === 'undefined') write('guides.indentation', !!value)
    }
})
registerMigration('highlightActiveIndentGuide', (value, read, write) => {
    if (typeof value !== 'undefined') {
        write('highlightActiveIndentGuide', undefined)
        if (typeof read('guides.highlightActiveIndentation') === 'undefined') write('guides.highlightActiveIndentation', !!value)
    }
})
const SUGGEST_FILTERED_TYPES: Record<string, string> = {
    method: 'showMethods',
    function: 'showFunctions',
    constructor: 'showConstructors',
    deprecated: 'showDeprecated',
    field: 'showFields',
    variable: 'showVariables',
    class: 'showClasses',
    struct: 'showStructs',
    interface: 'showInterfaces',
    module: 'showModules',
    property: 'showProperties',
    event: 'showEvents',
    operator: 'showOperators',
    unit: 'showUnits',
    value: 'showValues',
    constant: 'showConstants',
    enum: 'showEnums',
    enumMember: 'showEnumMembers',
    keyword: 'showKeywords',
    text: 'showWords',
    color: 'showColors',
    file: 'showFiles',
    reference: 'showReferences',
    folder: 'showFolders',
    typeParameter: 'showTypeParameters',
    snippet: 'showSnippets',
}
registerMigration('suggest.filteredTypes', (value, read, write) => {
    if (value && typeof value === 'object') {
        for (const entry of Object.entries(SUGGEST_FILTERED_TYPES)) {
            const v = (value as Obj)[entry[0]]
            if (v === false) {
                if (typeof read(`suggest.${entry[1]}`) === 'undefined') write(`suggest.${entry[1]}`, false)
            }
        }
        write('suggest.filteredTypes', undefined)
    }
})
registerMigration('quickSuggestions', (input, _read, write) => {
    if (typeof input === 'boolean') {
        const value = input ? 'on' : 'off'
        write('quickSuggestions', { comments: value, strings: value, other: value })
    }
})
registerMigration('experimental.stickyScroll.enabled', (value, read, write) => {
    if (typeof value === 'boolean') {
        write('experimental.stickyScroll.enabled', undefined)
        if (typeof read('stickyScroll.enabled') === 'undefined') write('stickyScroll.enabled', value)
    }
})
registerMigration('experimental.stickyScroll.maxLineCount', (value, read, write) => {
    if (typeof value === 'number') {
        write('experimental.stickyScroll.maxLineCount', undefined)
        if (typeof read('stickyScroll.maxLineCount') === 'undefined') write('stickyScroll.maxLineCount', value)
    }
})
registerMigration('lightbulb.enabled', (value, _read, write) => {
    if (typeof value === 'boolean') write('lightbulb.enabled', value ? undefined : 'off')
})
// 0.55:inlineSuggest.edits.codeShifting(布尔)→ allowCodeShifting('always' / 'never')
registerMigration('inlineSuggest.edits.codeShifting', (value, _read, write) => {
    if (typeof value === 'boolean') {
        write('inlineSuggest.edits.codeShifting', undefined)
        write('inlineSuggest.edits.allowCodeShifting', value ? 'always' : 'never')
    }
})
// 0.55 还有三条迁移不进来:editor.experimentalEditContextEnabled(key 带 'editor.' 前缀,standalone 的 raw 里读不到,Monaco 里也是空操作)、
// codeActionsOnSave / codeActionWidget.includeNearbyQuickfixes(不是 IEditorOptions 的选项,属于宿主设置)

/** Monaco `migrateOptions`:原地把老写法(`lineNumbers: true`、`hover: false`、`quickSuggestions: false`…)改成新写法 */
export function migrateOptions(options: IEditorOptions): void {
    const target = options as Obj
    for (const { key, migrate } of MIGRATIONS) {
        migrate(readPath(target, key), k => readPath(target, k), (k, v) => writePath(target, k, v))
    }
}

/** Monaco `deepCloneAndMigrateOptions`:拷一份再迁移,不动入参 */
export function cloneAndMigrate(options: IEditorOptions): IEditorOptions {
    const clone = deepClone(options)
    migrateOptions(clone)
    return clone
}

// ---- applyUpdate ----

/** Monaco ApplyUpdateResult(`monaco.editor.ApplyUpdateResult`) */
export class ApplyUpdateResult<T> {
    constructor(readonly newValue: T, readonly didChange: boolean) { }
}

/** Monaco 的通用 applyUpdate:对象逐键递归合并(原地改 value),数组 / 原始值 / null 整体替换 */
export function applyUpdate(value: unknown, update: unknown): ApplyUpdateResult<unknown> {
    if (typeof value !== 'object' || typeof update !== 'object' || !value || !update) {
        return new ApplyUpdateResult(update, value !== update)
    }
    if (Array.isArray(value) || Array.isArray(update)) {
        const arrayEquals = Array.isArray(value) && Array.isArray(update) && value.length === update.length && value.every((v, i) => v === update[i])
        return new ApplyUpdateResult(update, !arrayEquals)
    }
    let didChange = false
    const target = value as Obj
    for (const key in update) {
        if (Object.prototype.hasOwnProperty.call(update, key)) {
            const result = applyUpdate(target[key], (update as Obj)[key])
            if (result.didChange) {
                target[key] = result.newValue
                didChange = true
            }
        }
    }
    return new ApplyUpdateResult(value, didChange)
}

/** unicodeHighlight 专用:allowedCharacters / allowedLocales 当整体替换,不逐键合并(Monaco UnicodeHighlight.applyUpdate) */
export function applyUnicodeHighlightUpdate(value: unknown, update: unknown): ApplyUpdateResult<unknown> {
    let didChange = false
    const u = update as Obj | undefined
    if (u && u.allowedCharacters && value) {
        if (!deepEqualsObjects((value as Obj).allowedCharacters, u.allowedCharacters)) {
            value = { ...(value as Obj), allowedCharacters: u.allowedCharacters }
            didChange = true
        }
    }
    if (u && u.allowedLocales && value) {
        if (!deepEqualsObjects((value as Obj).allowedLocales, u.allowedLocales)) {
            value = { ...(value as Obj), allowedLocales: u.allowedLocales }
            didChange = true
        }
    }
    const result = applyUpdate(value, update)
    if (didChange) return new ApplyUpdateResult(result.newValue, true)
    return result
}

/**
 * Monaco `EditorOptionsUtil.applyUpdate`:把 update 里**认识的选项**合并进 options(原地改),返回有没有变化。
 * update 里不是选项名的键被忽略。update 应已 cloneAndMigrate 过。
 */
export function applyRawUpdate(options: IEditorOptions, update: IEditorOptions): boolean {
    let changed = false
    const target = options as Obj
    const src = update as Obj
    for (const name of EDITOR_OPTION_NAMES) {
        if (name === '_never_') continue
        if (Object.prototype.hasOwnProperty.call(src, name)) {
            const result = name === 'unicodeHighlight'
                ? applyUnicodeHighlightUpdate(target[name], src[name])
                : applyUpdate(target[name], src[name])
            target[name] = result.newValue
            changed = changed || result.didChange
        }
    }
    return changed
}

/**
 * Monaco `updateOptions` 的合并语义(纯函数,不改入参):patch 先拷贝并迁移老写法,再逐选项合并进 base 的拷贝 ——
 * 嵌套对象(find / minimap / scrollbar…)深合并,数组与原始值整体替换,`undefined` 把该字段清回默认,
 * unicodeHighlight 的 allowedCharacters / allowedLocales 整体替换,不是选项名的键丢弃。
 */
export function mergeRawOptions(base: IEditorOptions, patch: IEditorOptions): IEditorOptions {
    const out = deepClone(base)
    applyRawUpdate(out, cloneAndMigrate(patch))
    return out
}

// ---- 配置变更事件 ----

/** Monaco `ConfigurationChangedEvent` 的形态:`hasChanged(id)`;另带新的 computed 表和变了的选项集合 */
export class ConfigurationChangedEvent {
    /** 变了的选项(EditorOption 的值) */
    readonly changed: ReadonlySet<EditorOption>
    constructor(private readonly _values: readonly boolean[], /** 变更后的 computed 选项 */ readonly options: Readonly<ComputedEditorOptionValues>) {
        const changed = new Set<EditorOption>()
        _values.forEach((c, id) => { if (c) changed.add(id) })
        this.changed = changed
    }
    hasChanged(id: EditorOption): boolean {
        return this._values[id]
    }
}

/** Monaco `EditorOptionsUtil._deepEquals`(注意数组按 === 逐项比较,所以 rulers 这类数组里是对象时,重新校验后总算"变了") */
function monacoDeepEquals(a: unknown, b: unknown): boolean {
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return a === b
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && (a === b || (a.length === b.length && a.every((v, i) => v === b[i])))
    }
    if (Object.keys(a).length !== Object.keys(b).length) return false
    for (const key in a) {
        if (!monacoDeepEquals((a as Obj)[key], (b as Obj)[key])) return false
    }
    return true
}

/** Monaco `EditorOptionsUtil.checkEquals`:逐选项比较前后两份 computed。一点都没变 → null(Monaco 不发事件) */
export function configurationChange(prev: Readonly<ComputedEditorOptionValues>, next: Readonly<ComputedEditorOptionValues>): ConfigurationChangedEvent | null {
    const result: boolean[] = []
    let somethingChanged = false
    const a = prev as unknown as Obj
    const b = next as unknown as Obj
    OPTION_KEYS.forEach((key, id) => {
        const changed = !monacoDeepEquals(a[key], b[key])
        result[id] = changed
        if (changed) somethingChanged = true
    })
    return somethingChanged ? new ConfigurationChangedEvent(result, next) : null
}
