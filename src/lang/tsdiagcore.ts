// TS 诊断 → lite-monaco 诊断的纯转换(不碰编辑器):Worker 里的语言服务和主线程共用同一份。
// 编辑器侧的会话、装饰、合并在 tsdiagnostics.ts。

import type { Diagnostic, DiagnosticRelated, Severity } from '../core/chrome/ruler'
import type { DiagnosticsOptions } from './tsapi'

/** 交给宿主算诊断(比如放进 Web Worker)时的请求:宿主用 computeTsDiagnostics 在自己那边的服务上算 */
export interface TsDiagnosticsRequest {
    fileName: string
    /** 编辑器此刻的全文 */
    text: string
    /** 'syntax':预算只允许语法诊断(大文件) */
    mode: 'full' | 'syntax'
    /** 是否要未使用淡显 / 废弃删除线 / hint 小点 */
    wantTags: boolean
    options: DiagnosticsOptions
}

/** 可以结构化克隆:能直接 postMessage */
export interface TsDiagnosticsResult {
    diagnostics: Diagnostic[]
    tags: TsTagMark[]
}

// —— 带标签的 TS 诊断(对齐 Monaco MarkerTag.Unnecessary / Deprecated 和 Hint 级 marker)——
// 未使用的符号(6133 等,reportsUnnecessary)淡显、废弃 API(reportsDeprecated)删除线、
// 其它 suggestion(80001 之类)画 hint 小点。不进 diagnosticsField:不是 error/warning/info,不上 ruler。
export type TsTag = 'unnecessary' | 'deprecated' | 'hint'
/** 诊断的 related information(Monaco DiagnosticsAdapter._convertRelatedInformation) */
export type TsRelated = DiagnosticRelated
export interface TsTagMark { from: number, to: number, tag: TsTag, message: string, code?: string, related?: readonly TsRelated[] }

/** TS 诊断 → 标签;没有标签的 suggestion 当 hint;别的级别不打标签返回 null */
export function tsDiagnosticToTags(
    d: import('typescript').Diagnostic,
    ts: typeof import('typescript'),
    fileName: string,
    docLen: number,
): TsTagMark[] {
    const lit = tsDiagnosticToLit(d, ts, fileName, docLen)
    if (!lit) return []
    const out: TsTagMark[] = []
    const base = { from: lit.from, to: lit.to, message: lit.message ?? '', code: lit.code, ...(lit.related ? { related: lit.related } : {}) }
    if (d.reportsUnnecessary) out.push({ ...base, tag: 'unnecessary' })
    if (d.reportsDeprecated) out.push({ ...base, tag: 'deprecated' })
    if (!out.length && d.category === ts.DiagnosticCategory.Suggestion) out.push({ ...base, tag: 'hint' })
    return out
}

/** related information → 行列 + basename;没有 file 的算本文件(Monaco:relatedResource 缺省 = 当前 model) */
function relatedOf(
    d: import('typescript').Diagnostic,
    ts: typeof import('typescript'),
    fileName: string,
): { related?: TsRelated[] } {
    if (!d.relatedInformation?.length) return {}
    const norm = (p: string) => '/' + p.replace(/\\/g, '/').replace(/^\/+/, '')
    const related: TsRelated[] = []
    for (const info of d.relatedInformation) {
        const file = info.file ?? d.file
        if (!file) continue
        const lc = file.getLineAndCharacterOfPosition(Math.max(0, Math.min(info.start ?? 0, file.text.length)))
        related.push({
            file: file.fileName.replace(/\\/g, '/').split('/').pop() ?? file.fileName,
            line: lc.line + 1,
            col: lc.character + 1,
            message: ts.flattenDiagnosticMessageText(info.messageText, '\n'),
            same: norm(file.fileName) === norm(fileName),
        })
    }
    return related.length ? { related } : {}
}

function catToSeverity(
    ts: typeof import('typescript'),
    cat: import('typescript').DiagnosticCategory,
): Severity {
    if (cat === ts.DiagnosticCategory.Error) return 'error'
    if (cat === ts.DiagnosticCategory.Warning) return 'warning'
    return 'info'
}

/**
 * TS 诊断 → lite-monaco 诊断。区间钳到文档长度(docLen 缺省取 TS 看到的文本长度):
 * 零长度诊断擑成 1 字符,文末的(`'}' expected`、`foo.`)往回取最后一个字符,绝不越过 docLen。
 */
export function tsDiagnosticToLit(
    d: import('typescript').Diagnostic,
    ts: typeof import('typescript'),
    fileName: string,
    docLen?: number,
): Diagnostic | null {
    if (!d.file || d.start == null) return null
    const fn = d.file.fileName.replace(/\\/g, '/')
    const main = fileName.replace(/\\/g, '/')
    const n = (p: string) => (p.startsWith('/') ? p : '/' + p)
    if (n(fn) !== n(main)) return null
    const max = docLen ?? d.file.text.length
    let start = Math.max(0, Math.min(d.start, max))
    let to = Math.min(max, start + Math.max(d.length ?? 0, 1))
    if (start >= to) {
        if (max === 0) return null
        start = max - 1
        to = max
    }
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    return {
        from: start,
        to,
        severity: catToSeverity(ts, d.category),
        message: msg,
        // Monaco marker 只有 code、没有 source → marker hover 显示 `(6387)`(markerHoverParticipant: source ? `${source}(${code})` : `(${code})`)
        code: d.code != null ? `(${d.code})` : undefined,
        source: 'ts',
        ...relatedOf(d, ts, fileName),
    }
}

/**
 * 在一个 TS 服务上算一个文件的诊断,转成 lite-monaco 的格式(语法 + 语义,可选 suggestion 标签)。
 * 编辑器自己的诊断会话用它;宿主把诊断放进 Worker 时,在 Worker 里用同一个函数,两边结果一致。出错返回 null。
 */
export function computeTsDiagnostics(
    svc: import('typescript').LanguageService,
    ts: typeof import('typescript'),
    fileName: string,
    docLen: number,
    syntaxOnly: boolean,
    wantTags: boolean,
    dopts: DiagnosticsOptions,
): TsDiagnosticsResult | null {
    let raw: import('typescript').Diagnostic[] = []
    let sug: import('typescript').Diagnostic[] = []
    try {
        // noSyntaxValidation / noSemanticValidation 分别关;JS 系默认 noSemanticValidation: true(javascriptDefaults)
        const syn = dopts.noSyntaxValidation ? [] : svc.getSyntacticDiagnostics(fileName) ?? []
        if (syntaxOnly || dopts.noSemanticValidation) {
            raw = [...syn]
        } else {
            const sem = svc.getSemanticDiagnostics(fileName) ?? []
            raw = [...syn, ...sem]
        }
        if (wantTags) sug = [...(svc.getSuggestionDiagnostics(fileName) ?? [])]
    } catch {
        return null
    }
    // diagnosticCodesToIgnore:语法 / 语义 / suggestion 一并过滤(Monaco DiagnosticsAdapter._doValidate)
    const ignore = dopts.diagnosticCodesToIgnore
    if (ignore?.length) {
        raw = raw.filter(d => !ignore.includes(d.code))
        sug = sug.filter(d => !ignore.includes(d.code))
    }
    const diagnostics: Diagnostic[] = []
    for (const d of raw) {
        const lit = tsDiagnosticToLit(d, ts, fileName, docLen)
        if (lit && lit.from < lit.to) diagnostics.push(lit)
    }
    diagnostics.sort((a, b) => a.from - b.from || a.to - b.to)
    const tags: TsTagMark[] = []
    if (wantTags) {
        // 语义诊断也可能带标签(开了 noUnusedLocals 时 6133 是 error + reportsUnnecessary)
        for (const d of [...raw, ...sug]) tags.push(...tsDiagnosticToTags(d, ts, fileName, docLen))
        tags.sort((a, b) => a.from - b.from || a.to - b.to)
    }
    return { diagnostics, tags }
}

