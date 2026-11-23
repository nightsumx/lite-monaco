// TS 自动诊断 —— 防抖拉 syntactic + semantic diagnostics,写入 setDiagnostics(source:'ts')。
//
// 合并策略:保留 field 里 source !== 'ts' 的宿主诊断,只替换 source==='ts'。
// 大文档预算(M1.6):XL 只做语法诊断,防抖随体积拉长;JS 系照 Monaco javascriptDefaults 不跑语义诊断。

import type { EditorView } from '../core/view/editorview'
import type { Diagnostic } from '../core/chrome/ruler'
import { setDiagnostics, diagnosticsField } from '../core/feature/diagnostics'
import { getTSService, type TSServiceOptions } from './tsservice'
import { defaultsFor } from './tsapi'
import {
    diagnosticsPolicy,
    recordDiagPolicy,
    recordDiagRun,
    recordDiagSkipped,
} from './tsbudget'
import { materializeDoc } from '../core/perf'
import type { TsDiagnosticsRequest, TsDiagnosticsResult, TsTag, TsTagMark } from './tsdiagcore'
import { StateEffect, StateField, type EditorState } from '../core/model/state'
import { Decoration, type DecorationSet } from '../core/model/decoration'
import { RangeSet } from '../core/model/rangeset'
import { hoverMarkers } from '../core/feature/hover'

export {
    computeTsDiagnostics, tsDiagnosticToLit, tsDiagnosticToTags,
    type TsDiagnosticsRequest, type TsDiagnosticsResult, type TsRelated, type TsTag, type TsTagMark,
} from './tsdiagcore'

export type TSDiagnosticsOptions = TSServiceOptions & {
    /** 覆盖防抖 ms;默认跟 budget 策略 */
    debounceMs?: number
    /**
     * 诊断不交给本编辑器的语言服务,由宿主自己算:每次要诊断时带请求调它,拿回结果。返回 null = 这次不更新(宿主还没准备好、
     * 已被新请求取代),编辑器上已有的诊断保持原样。用在宿主另有一套检查(整个工程读完才报、按 tsconfig 各用各的编译选项、
     * 跑在别的 Worker 里),不想让交互用的语言服务排在它后面的时候。宿主那边用 computeTsDiagnostics 或自己的服务算
     */
    remote?: (req: TsDiagnosticsRequest) => Promise<TsDiagnosticsResult | null>
    /** 每轮诊断算完(或 onlyVisible 下清空)时调,给 marker 服务发一份(Monaco 每轮都 setModelMarkers,内容没变也发) */
    onResult?: (diagnostics: readonly Diagnostic[], tags: readonly TsTagMark[]) => void
}

export const setTsTags = StateEffect.define<TsTagMark[]>()
export const tsTagField = StateField.define<TsTagMark[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects) if (e.is(setTsTags)) return e.value
        if (!tr.docChanged || !val.length) return val
        const oldLen = tr.changes.length
        const out: TsTagMark[] = []
        for (const m of val) {
            if (m.to > oldLen) continue
            const from = tr.changes.mapPos(m.from, 1)
            const to = tr.changes.mapPos(m.to, -1)
            if (from < to) out.push(from === m.from && to === m.to ? m : { ...m, from, to })
        }
        return out
    },
})

/** Monaco 的类名:unnecessary → 淡显,deprecated → 删除线,hint → 前几个字下面三个点 */
export const TS_TAG_CLASS: Record<TsTag, string> = {
    unnecessary: 'cm-unnecessary',
    deprecated: 'cm-deprecated',
    hint: 'cm-squiggly-hint',
}
const tagMarks: Record<TsTag, Decoration> = {
    unnecessary: Decoration.mark({ class: TS_TAG_CLASS.unnecessary }),
    deprecated: Decoration.mark({ class: TS_TAG_CLASS.deprecated }),
    hint: Decoration.mark({ class: TS_TAG_CLASS.hint }),
}

export function tsTagDecorations(state: EditorState): DecorationSet {
    const marks = state.field(tsTagField, false)
    if (!marks?.length) return RangeSet.empty as DecorationSet
    const len = state.doc.length
    const ranges = marks
        .filter(m => m.from < m.to && m.to <= len)
        .map(m => tagMarks[m.tag].range(m.from, m.to))
    return RangeSet.of(ranges, true)
}

/**
 * 标签进 marker hover(Monaco 的 hint marker 也进 marker hover):交给 core 的诊断卡,和诊断合成一个源、按 Monaco 排序;
 * hint 级没有 View Problem(同 Monaco renderMarkerStatusbar),Quick Fix… 照常
 */
export const tsTagHoverMarkers = hoverMarkers.of(state => (state.field(tsTagField, false) ?? []).map(m => ({ ...m, severity: 'hint' as const, source: 'ts' })))

/** 合并:非 source==='ts' 保留 + 新 ts 列表(无 source 的宿主种子也保留) */
export function mergeDiagnostics(
    current: readonly Diagnostic[],
    tsDiags: readonly Diagnostic[],
): Diagnostic[] {
    const keep = current.filter(d => d.source !== 'ts')
    return [...keep, ...tsDiags]
}

export function tsDiagnosticsSession(
    view: EditorView,
    opts: TSDiagnosticsOptions,
): () => void {
    const session = getTSService(opts)
    // typescriptDefaults / javascriptDefaults.setDiagnosticsOptions:每次运行时读,改了 onDidChange 重算
    const defaults = defaultsFor(opts.lang)
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false

    const run = async () => {
        const my = ++seq
        const dopts = defaults.getDiagnosticsOptions()
        // onlyVisible:编辑器没挂在页面上就不诊断,并清掉自己的结果(Monaco maybeValidate / onDidChangeAttached);
        // modeConfiguration.diagnostics 为假:Monaco 不装 DiagnosticsAdapter(按真假判断,setModeConfiguration({}) 也算关)
        if ((dopts.onlyVisible && !view.dom.isConnected) || !defaults.modeConfiguration.diagnostics) {
            const cur = view.state.field(diagnosticsField, false) ?? []
            const kept = mergeDiagnostics(cur, [])
            const effects = []
            if (kept.length !== cur.length) effects.push(setDiagnostics.of(kept))
            if ((view.state.field(tsTagField, false) ?? []).length) effects.push(setTsTags.of([]))
            if (effects.length) view.dispatch(view.state.update({ effects }))
            opts.onResult?.([], [])
            return
        }
        const docLen = view.state.doc.length
        const lines = view.state.doc.lines
        const policy = diagnosticsPolicy(docLen, lines)
        recordDiagPolicy(policy, docLen, lines)

        if (policy.mode === 'off') {
            recordDiagSkipped()
            return
        }

        const wantTags = view.state.field(tsTagField, false) !== undefined && policy.mode !== 'syntax' && !dopts.noSuggestionDiagnostics
        // 诊断在服务一侧算(Worker 里):请求前先把最新全文贴过去
        const sentDoc = view.state.doc
        const text = materializeDoc(view.state)
        session.update(text)
        let result: TsDiagnosticsResult | null
        try {
            result = opts.remote
                ? await opts.remote({ fileName: session.fileName, text, mode: policy.mode === 'syntax' ? 'syntax' : 'full', wantTags, options: dopts })
                : await session.service().$diagnostics(session.fileName, docLen, policy.mode === 'syntax', wantTags, dopts) as TsDiagnosticsResult | null
        } catch {
            return
        }
        if (disposed || my !== seq || !result) return
        // 回来时文档又变了:这份诊断按旧文本算的,等下一轮(debounce 已排)
        if (view.state.doc !== sentDoc) return
        recordDiagRun(policy.mode)
        const tsDiags = result.diagnostics
        const cur = view.state.field(diagnosticsField, false) ?? []
        const next = mergeDiagnostics(cur, tsDiags)
        const effects = []
        if (!sameDiags(cur, next)) effects.push(setDiagnostics.of(next))
        if (wantTags) {
            const tags = result.tags
            if (!sameTags(view.state.field(tsTagField), tags)) effects.push(setTsTags.of(tags))
        } else if (dopts.noSuggestionDiagnostics && (view.state.field(tsTagField, false) ?? []).length) {
            // 运行时打开 noSuggestionDiagnostics:已有的淡显 / 删除线 / hint 点撤掉
            effects.push(setTsTags.of([]))
        }
        if (effects.length) view.dispatch(view.state.update({ effects }))
        opts.onResult?.(tsDiags, wantTags ? result.tags : [])
    }

    const schedule = () => {
        if (timer) clearTimeout(timer)
        const docLen = view.state.doc.length
        const lines = view.state.doc.lines
        const policy = diagnosticsPolicy(docLen, lines)
        const ms = opts.debounceMs ?? policy.debounceMs
        timer = setTimeout(() => { void run() }, ms)
    }

    const off = view.onTransaction((tr) => {
        if (tr.docChanged) schedule()
    })
    // 共享项目里别的文件变了(另一个编辑器打开/编辑了被 import 的文件、宿主 setTsFiles):重算本文件
    const offProject = session.onProjectChange(() => { if (!disposed) schedule() })
    const offDefaults = defaults.onDidChange(() => { if (!disposed) schedule() })

    schedule()

    return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        off()
        offProject()
        offDefaults.dispose()
    }
}

function sameDiags(a: readonly Diagnostic[], b: readonly Diagnostic[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i]
        if (x.from !== y.from || x.to !== y.to || x.severity !== y.severity
            || x.message !== y.message || x.code !== y.code || x.source !== y.source
            || JSON.stringify(x.related ?? null) !== JSON.stringify(y.related ?? null))
            return false
    }
    return true
}

function sameTags(a: readonly TsTagMark[], b: readonly TsTagMark[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i]
        if (x.from !== y.from || x.to !== y.to || x.tag !== y.tag || x.message !== y.message || x.code !== y.code) return false
        // related 的行列不跟编辑映射:声明挤了位置也要换新的
        if (JSON.stringify(x.related ?? null) !== JSON.stringify(y.related ?? null)) return false
    }
    return true
}
