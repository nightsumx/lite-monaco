// 文本模型选项 tabSize / indentSize / insertSpaces / detectIndentation(Monaco IGlobalEditorOptions,不在 EditorOption 里)。
//
// 对齐 Monaco:
//   ModelService._readModelOptions   tabSize 取整且 ≥ 1;indentSize 为 'tabSize' 或 ≥ 1 的整数;insertSpaces 布尔
//   TextModel.resolveOptions         detectIndentation(默认 true)时按内容猜 tabSize / insertSpaces,indentSize 跟着 tabSize
//
// lite-monaco 的缩进真源是 EditorState.tabSize / indentUnit / indentSizeFacet(很多处直接读 state.tabSize),这些 Facet
// 没有「从别的 Facet 算」的机制,所以由创建时的选项算出来,以扩展的形式放进 state(liteMonaco() 在装配时加)。
// 与 Monaco 的一点区别:内容里没有缩进线索(空文档、没有缩进行)时,猜测不盖掉宿主用 EditorState.tabSize.of / indentUnit.of 配的值。
// 之后的运行时改动走 indentOptions 槽(applyIndentOptions / Detect Indentation 命令),槽排在最前,优先。

import type { Extension } from '../model/state'
import { EditorState } from '../model/state'
import { indentSizeFacet } from './enter'
import { detectIndentationHints } from './indent'

export interface ModelOptionsInput {
    tabSize?: unknown
    indentSize?: unknown
    insertSpaces?: unknown
    detectIndentation?: unknown
}

export interface ResolvedModelOptions { tabSize?: number, indentSize?: number | 'tabSize', insertSpaces?: boolean }

function int(v: unknown): number | undefined {
    const n = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' ? parseInt(v, 10) : NaN
    return Number.isNaN(n) ? undefined : n
}

function bool(v: unknown): boolean | undefined {
    if (v === undefined || v === null) return undefined
    return v === 'false' ? false : Boolean(v)
}

/** 选项 + 文档内容 → 有效的 tabSize / indentSize / insertSpaces(没指定且没线索的字段缺省) */
export function resolveModelOptions(raw: ModelOptionsInput | undefined, docLines?: string[]): ResolvedModelOptions {
    const o = raw ?? {}
    let tabSize = int(o.tabSize)
    if (tabSize !== undefined && tabSize < 1) tabSize = 1
    let indentSize: number | 'tabSize' | undefined
    if (o.indentSize === 'tabSize') indentSize = 'tabSize'
    else { const n = int(o.indentSize); if (n !== undefined) indentSize = Math.max(n, 1) }
    let insertSpaces = bool(o.insertSpaces)
    const detect = bool(o.detectIndentation) ?? true
    if (detect && docLines) {
        const g = detectIndentationHints(docLines)
        if (g.insertSpaces !== undefined) insertSpaces = g.insertSpaces
        if (g.tabSize !== undefined) { tabSize = g.tabSize; indentSize = 'tabSize' }
    }
    return { tabSize, indentSize, insertSpaces }
}

/** 文本的前 max 行(\r\n | \r | \n 切):只扫到第 max 个换行,不碰后面的几十 MB */
export function headLines(text: string, max: number): string[] {
    const out: string[] = []
    let start = 0
    if (text.indexOf('\r') < 0) {
        // 没有 \r(最常见):indexOf 是原生扫描,比逐字符 charCodeAt 快几倍(500 个 2000 行的 model:100 ms → 几 ms)
        for (let i = text.indexOf('\n'); i >= 0 && out.length < max; i = text.indexOf('\n', start)) {
            out.push(text.slice(start, i))
            start = i + 1
        }
    } else {
        for (let i = 0; i < text.length && out.length < max; i++) {
            const c = text.charCodeAt(i)
            if (c === 10 || c === 13) {
                out.push(text.slice(start, i))
                if (c === 13 && text.charCodeAt(i + 1) === 10) i++
                start = i + 1
            }
        }
    }
    if (out.length < max) out.push(text.slice(start))
    return out
}

/** 把解析好的模型选项变成 state 扩展;全缺省返回空数组(不动宿主的配置) */
export function modelOptionsExtension(raw: ModelOptionsInput | undefined, doc?: string): Extension {
    // 只看前 10000 行(guessIndentation 同)
    const lines = doc === undefined ? undefined : headLines(doc, 10000)
    const r = resolveModelOptions(raw, lines)
    const out: Extension[] = []
    if (r.tabSize !== undefined) out.push(EditorState.tabSize.of(r.tabSize))
    const size = r.indentSize ?? (r.tabSize !== undefined ? 'tabSize' : undefined)
    if (size !== undefined || r.insertSpaces !== undefined) {
        if (size !== undefined) out.push(indentSizeFacet.of(size))
        const resolvedSize = size === undefined || size === 'tabSize' ? r.tabSize ?? 4 : size
        // insertSpaces 缺省 = true(Monaco EDITOR_MODEL_DEFAULTS)
        out.push(EditorState.indentUnit.of(r.insertSpaces === false ? '\t' : ' '.repeat(resolvedSize)))
    }
    return out
}
