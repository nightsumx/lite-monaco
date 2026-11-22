// TS 语义补全 —— 全量 lib + 多文件 VFS + auto-import codeActions + snippet insertText。

import type { TSServiceOptions } from './tsservice'

export type TSCompletionOptions = TSServiceOptions

/** entriesToCompletions 的产物(纯映射,无细节 / codeActions) */
export interface Completion {
    label: string
    apply: string
    kind: string
    detail?: string
    sortText: string
    filterText?: string
}

// TS ScriptElementKind → 补全 kind,逐条照 Monaco 0.52 SuggestAdapter.convertKind(tsMode.ts):
// 没列出的(const/let/parameter/type/alias/enum member/local function…)一律 Property,和 Monaco 图标一致。
const KIND_MAP: Record<string, string> = {
    'primitive type': 'keyword', 'keyword': 'keyword',
    'var': 'variable', 'local var': 'variable',
    'property': 'field', 'getter': 'field', 'setter': 'field',
    'function': 'function', 'method': 'function', 'construct': 'function', 'call': 'function', 'index': 'function',
    'enum': 'enum',
    'module': 'module',
    'class': 'class',
    'interface': 'interface',
    'warning': 'file',
}

export function mapTSKind(kind: string): string {
    return KIND_MAP[kind] ?? 'property'
}

// 同一张表的 CompletionItemKind 数值形态(Monaco languages.CompletionItemKind)
const KIND_NUM: Record<string, number> = {
    keyword: 17, variable: 4, field: 3, function: 1, enum: 15, module: 8, class: 5, interface: 7, file: 20, property: 9,
}
export function mapTSKindNum(kind: string): number {
    return KIND_NUM[mapTSKind(kind)]
}

/** 测试/外部用:纯映射 TS entry → Completion(无 details/codeActions) */
export function entriesToCompletions(
    entries: readonly {
        name: string
        kind: string
        sortText?: string
        insertText?: string
        filterText?: string
        isRecommended?: true
        labelDetails?: { detail?: string, description?: string }
        sourceDisplay?: readonly { text: string }[]
    }[],
    details?: ReadonlyMap<string, string>,
): Completion[] {
    const out: Completion[] = []
    for (const e of entries) {
        if (!e.name) continue
        const kind = mapTSKind(e.kind)
        let detail = e.labelDetails?.description || e.labelDetails?.detail || details?.get(e.name) || ''
        if (!detail && e.sourceDisplay?.length) detail = partsToString(e.sourceDisplay)
        out.push({
            label: e.name,
            apply: e.insertText || e.name,
            kind,
            detail: detail || undefined,
            sortText: e.sortText ?? '',
            filterText: e.filterText || undefined,
        })
    }
    return out
}

export function partsToString(parts: readonly { text: string }[] | undefined): string {
    if (!parts?.length) return ''
    let s = ''
    for (const p of parts) s += p.text
    return s.replace(/\s+/g, ' ').trim()
}

/** 把 TS CodeAction 改成 editor 绝对偏移 edits(仅本文件) */
export function codeActionsToChanges(
    actions: readonly {
        changes?: readonly {
            fileName: string
            textChanges: readonly { span: { start: number, length: number }, newText: string }[]
        }[]
    }[] | undefined,
    mainFile: string,
): { from: number, to: number, insert: string }[] {
    if (!actions?.length) return []
    const out: { from: number, to: number, insert: string }[] = []
    const main = mainFile.replace(/\\/g, '/')
    for (const act of actions) {
        for (const fc of act.changes ?? []) {
            const fn = fc.fileName.replace(/\\/g, '/')
            if (fn !== main && !fn.endsWith(main) && main !== fn) {
                // 允许末尾匹配 /main.ts
                if (!fn.endsWith(main.slice(main.lastIndexOf('/')))) continue
            }
            for (const tc of fc.textChanges) {
                out.push({
                    from: tc.span.start,
                    to: tc.span.start + tc.span.length,
                    insert: tc.newText,
                })
            }
        }
    }
    // 从后往前排,避免偏移
    out.sort((a, b) => b.from - a.from || b.to - a.to)
    return out
}

// Monaco 不传偏好。insertText 类偏好(`[Symbol]`、`?.x`、成员/方法片段、整句 import)
// 要配合 replacementSpan 改写 `.` 前的文本,这里不做 → 不开,否则接受后得到 `Math.[Symbol]`。
// 只多开 auto-import(多文件 VFS 才有;细节里的 codeActions 在接受时应用)。取细节时传同一份偏好。
export const PREFS = {
    includeCompletionsForModuleExports: true,
    useLabelDetailsInCompletionEntries: true,
    includePackageJsonAutoImports: 'auto',
    importModuleSpecifierEnding: 'minimal',
} as import('typescript').GetCompletionsAtPositionOptions
