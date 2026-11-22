// 从 node_modules/monaco-editor 生成 src/core/options/{types,generated}.ts。
//   node scripts/gen-options.mjs
// types.ts   :monaco.d.ts 里选项相关的类型和枚举(IEditorOptions、EditorOption…),原样拷贝。
// generated.ts:各选项的 Monaco 默认值(computed 形态,三个平台)、名字表(下标 = EditorOption 值)、
//               简单选项的取值规格(布尔 / 整数范围 / 枚举)。
// 复杂选项(lineNumbers、quickSuggestions、padding…)的 raw → computed 校验手写在 validate.ts,
// 并由 __tests__/core/options-conformance.test.ts 对着 Monaco 自己的 validate 逐项比对。
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const monaco = path.join(root, 'node_modules/monaco-editor')
const outDir = path.join(root, 'src/core/options')

// ---- types.ts ----
const src = fs.readFileSync(path.join(monaco, 'monaco.d.ts'), 'utf8')
const sf = ts.createSourceFile('m.d.ts', src, ts.ScriptTarget.Latest, true)
const decls = new Map()
let editorOptionsConst
function walk(node, p) {
    node.forEachChild(c => {
        if (ts.isModuleDeclaration(c) && c.body) {
            const np = p ? p + '.' + c.name.text : c.name.text
            if (ts.isModuleDeclaration(c.body)) walk({ forEachChild: f => f(c.body) }, np)
            else walk(c.body, np)
        } else if (p === 'monaco.editor' || p === 'editor') { // 0.52 是 `declare namespace monaco.editor`,0.55 起是顶层 `declare namespace editor`
            const nm = c.name && c.name.text
            if (nm && (ts.isInterfaceDeclaration(c) || ts.isEnumDeclaration(c) || ts.isTypeAliasDeclaration(c) || ts.isClassDeclaration(c))) decls.set(nm, c)
            // `export const EditorOptions: { name: IEditorOption<EditorOption.id, Value> }` —— 各选项 computed 值的精确类型来源
            if (ts.isVariableStatement(c)) for (const d of c.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.name.text === 'EditorOptions') editorOptionsConst = d
            }
        }
    })
}
walk(sf, '')
function refs(node, set) {
    if (ts.isTypeReferenceNode(node)) {
        const t = node.typeName
        set.add(ts.isIdentifier(t) ? t.text : t.left.text)
    }
    // class X extends Y:继承子句里的 Y 是 ExpressionWithTypeArguments,不是 TypeReference
    if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) set.add(node.expression.text)
    node.forEachChild(c => refs(c, set))
}
const roots = ['IEditorOptions', 'IGlobalEditorOptions', 'EditorOption', 'IDiffEditorOptions', 'IDiffEditorBaseOptions']
// computed 值的类型(EditorOptions 常量里 IEditorOption<_, V> 的 V)引用到的类型也要带上
for (const m of editorOptionsConst.type.members) {
    const s2 = new Set()
    refs(m.type.typeArguments[1], s2)
    for (const x of s2) if (decls.has(x)) roots.push(x)
}
const need = new Set(roots)
const queue = [...roots]
while (queue.length) {
    const d = decls.get(queue.pop())
    if (!d) continue
    const s = new Set()
    refs(d, s)
    for (const x of s) if (decls.has(x) && !need.has(x)) { need.add(x); queue.push(x) }
}
let types = `// 由 scripts/gen-options.mjs 从 monaco-editor ${JSON.parse(fs.readFileSync(path.join(monaco, 'package.json'), 'utf8')).version} 的 monaco.d.ts 拷出,勿手改。\n`
types += `// 选项相关的接口、类型别名、枚举与 Monaco 同名同形;枚举数值也相同(EditorOption 的值就是 Monaco 的)。\n`
types += `/* eslint-disable */\n\n`
types += `/** 与 monaco.IMarkdownString 同形 */\nexport interface IMarkdownString { readonly value: string; readonly isTrusted?: boolean; readonly supportThemeIcons?: boolean; readonly supportHtml?: boolean }\n\n`
for (const n of [...need].sort()) {
    const d = decls.get(n)
    const full = d.getFullText(sf)
    const m = full.match(/^\s*(\/\*\*[\s\S]*?\*\/)/)
    // d.ts 里的 FontInfo / BareFontInfo 是 class(只有字段),这里是纯数据,改成 interface
    const text = d.getText(sf).replace(/^export\s+/, '').replace(/^class\s/, 'interface ')
    types += (m ? m[1] + '\n' : '') + 'export ' + text + '\n\n'
}
// types.ts 在下面补完 computed 值类型表之后再写

// ---- generated.ts ----
// 平台相关的默认值(字体、字号、renderFinalNewline)读 platform.js 的 isMacintosh / isLinux,而它在进程里只算一次,
// 所以每个平台起一个子进程(把 process.platform 先改掉再加载)。
function dump(plat) {
    const file = path.join(monaco, 'esm/vs/editor/common/config/editorOptions.js')
    const code = `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(plat)} })
const m = await import(${JSON.stringify(file)})
const out = {}
for (const o of Object.values(m.EditorOptions)) out[o.id] = { id: o.id, name: o.name, cls: o.constructor.name, defaultValue: o.defaultValue, _allowedValues: o._allowedValues, minimum: o.minimum, maximum: o.maximum, map: o._allowedValues && o.constructor.name === 'EditorEnumOption' ? Object.fromEntries(o._allowedValues.map(v => [v, o.validate(v)])) : undefined }
process.stdout.write(JSON.stringify(out))`
    const json = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { maxBuffer: 1 << 26 }).toString())
    return Object.values(json)
}
const mac = dump('darwin')
const win = dump('win32')
const lin = dump('linux')

const names = []
const defaults = {}
const specs = {}
for (const o of mac) {
    names[o.id] = o.name
    if (o.name === '_never_') continue // 计算项(fontInfo / layoutInfo / effectiveXxx…)没有 raw 名字也没有校验,不进默认值 / 规格表
    defaults[o.name] = o.defaultValue
    const cls = o.cls
    if (cls === 'EditorBooleanOption') specs[o.name] = { t: 'bool' }
    else if (cls === 'EditorIntOption') specs[o.name] = { t: 'int', min: o.minimum, max: o.maximum }
    else if (cls === 'EditorFloatOption') specs[o.name] = { t: 'float' }
    else if (cls === 'EditorStringOption') specs[o.name] = { t: 'string' }
    else if (cls === 'EditorStringEnumOption') specs[o.name] = { t: 'enum', values: o._allowedValues }
    else if (cls === 'EditorEnumOption') {
        specs[o.name] = { t: 'enumMap', values: o._allowedValues, map: o.map }
    }
}
const byPlat = { win: {}, linux: {} }
for (const [label, set] of [['win', win], ['linux', lin]]) {
    for (const o of set) {
        if (o.name === '_never_') continue
        if (JSON.stringify(o.defaultValue) !== JSON.stringify(defaults[o.name])) byPlat[label][o.name] = o.defaultValue
    }
}
// ---- types.ts 补完:每个选项 computed 值的精确类型 ----
// 来源是 monaco.d.ts 的 `EditorOptions: { name: IEditorOption<EditorOption.id, Value> }`。d.ts 里有几处写得太宽
// (rulers: {}、unicodeHighlight: any、wordSegmenterLocales: {}、readOnlyMessage: any),用 VALUE_OVERRIDES 收紧成校验后的真实形态。
// 没有名字的计算项(`_never_`:fontInfo、layoutInfo…)用 EditorOption 成员名当 key。
const enumValues = {}
for (const m of decls.get('EditorOption').members) enumValues[m.name.text] = Number(m.initializer.text)
const VALUE_OVERRIDES = {
    rulers: 'IRulerOption[]',
    wordSegmenterLocales: 'string[]',
    readOnlyMessage: 'IMarkdownString | undefined',
    placeholder: 'string | undefined',
    unicodeHighlight: 'Required<IUnicodeHighlightOptions>',
}
const keyOf = (id, member) => (names[id] === '_never_' ? member : names[id])
const valueLines = []
const idLines = []
for (const m of editorOptionsConst.type.members) {
    const [idRef, valueType] = m.type.typeArguments
    const member = idRef.getText(sf).replace(/^EditorOption\./, '')
    const id = enumValues[member]
    const key = keyOf(id, member)
    valueLines.push(`    ${key}: ${VALUE_OVERRIDES[key] ?? valueType.getText(sf)}`)
    idLines.push(`    ${id}: '${key}'`)
}
types += `/** 每个选项 computed 值(editor.getOption() 返回的形态)的类型,key = 选项名(没有名字的计算项用 EditorOption 成员名) */\n`
types += `export interface ComputedEditorOptionValues {\n${valueLines.join('\n')}\n}\n\n`
types += `/** EditorOption 的值 → ComputedEditorOptionValues 的 key */\n`
types += `export interface EditorOptionKeyById {\n${idLines.join('\n')}\n}\n`
fs.writeFileSync(path.join(outDir, 'types.ts'), types)

const j = v => JSON.stringify(v, null, 4)
const gen = `// 由 scripts/gen-options.mjs 从 monaco-editor ${JSON.parse(fs.readFileSync(path.join(monaco, 'package.json'), 'utf8')).version} 的 EditorOptions 导出,勿手改。
/* eslint-disable */

/** 下标 = EditorOption 的值,内容 = 选项名 */
export const EDITOR_OPTION_NAMES: readonly string[] = ${j(names)}

/** 各选项的默认值(computed 形态,即 editor.getOption() 在不设任何选项时返回的值)。取 macOS 的;和平台相关的见 PLATFORM_DEFAULTS */
export const EDITOR_DEFAULTS: Record<string, any> = ${j(defaults)}

/** 与 macOS 不同的默认值(Monaco 的 fontFamily / fontSize / renderFinalNewline 随平台变) */
export const PLATFORM_DEFAULTS: { win: Record<string, any>, linux: Record<string, any> } = ${j(byPlat)}

/** 简单选项(布尔 / 整数 / 浮点 / 字符串 / 枚举)的取值规格。其余选项由 validate.ts 手写校验 */
export type OptionSpec =
    | { t: 'bool' }
    | { t: 'int', min: number, max: number }
    | { t: 'float' }
    | { t: 'string' }
    | { t: 'enum', values: readonly string[] }
    | { t: 'enumMap', values: readonly string[], map: Record<string, any> }
export const OPTION_SPECS: Record<string, OptionSpec> = ${j(specs)}
`
fs.writeFileSync(path.join(outDir, 'generated.ts'), gen)
console.log('types', need.size, 'names', names.length, 'simple specs', Object.keys(specs).length)
