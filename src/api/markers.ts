// editor.setModelMarkers / getModelMarkers / removeAllMarkers / onDidChangeMarkers(Monaco MarkerService + MarkerDecorationsService)。
//
// 数据:全局一张表,key = (owner, resource uri),和 Monaco MarkerService 一样不跟编辑映射(getModelMarkers 返回的是当初设的行列)。
// 落到视图:model 附着在某个视图上时,把该 uri 的 marker 转成
//   - 严重度 Error / Warning / Info → `diagnosticsField` 里的 Diagnostic(`owner` 字段 = marker 的 owner,`source` = owner,
//     TS 自己的诊断(source 'ts',没有 owner)原样保留;随编辑映射,同 Monaco 的 marker 装饰)
//   - 严重度 Hint,或带 tags(Unnecessary / Deprecated)→ `markerTagField`:淡显 / 删除线 / 三个点 + marker hover(hoverMarkers)
// 范围规则照 MarkerDecorationsService._createDecorationRange:Hint(无 tag)只取起点后 2 列;范围先 validateRange;
// 空范围取该位置的单词;endColumn = MAX_VALUE 且从第 1 列起的整行 marker 起点挪到首个非空白列。

import { Position, Range } from './position'
import { Emitter } from './context'
import { Uri } from './uri'
import { modelAttachHooks, getModels, type ITextModel, type TextModel } from './model'
import * as core from '../core/index'
import type { Diagnostic, DiagnosticRelated } from '../core/chrome/ruler'
import type { HoverMarker } from '../core/feature/hover'
import type { IEvent } from './types'

export enum MarkerSeverity {
    Hint = 1,
    Info = 2,
    Warning = 4,
    Error = 8,
}
export enum MarkerTag {
    Unnecessary = 1,
    Deprecated = 2,
}

export interface IRelatedInformation {
    resource: Uri
    message: string
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

export interface IMarkerData {
    code?: string | { value: string, target: Uri }
    severity: MarkerSeverity
    message: string
    source?: string
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
    modelVersionId?: number
    relatedInformation?: IRelatedInformation[]
    tags?: MarkerTag[]
}

export interface IMarker extends IMarkerData {
    resource: Uri
    owner: string
}

export interface IMarkerStatData { errors: number, warnings: number, infos: number, unknowns: number }

export interface MarkerFilter {
    owner?: string
    resource?: Uri
    severities?: number
    take?: number
}

// ───────────── 存储(MarkerService) ─────────────

const byOwner = new Map<string, Map<string, IMarker[]>>() // owner → resource key → markers

/** Monaco MarkerService._toMarker:没有 message 的丢弃,行列往合法范围夹 */
function toMarker(owner: string, resource: Uri, data: IMarkerData): IMarker | undefined {
    let { startLineNumber, startColumn, endLineNumber, endColumn } = data
    if (!data.message) return undefined
    startLineNumber = startLineNumber > 0 ? startLineNumber : 1
    startColumn = startColumn > 0 ? startColumn : 1
    endLineNumber = endLineNumber >= startLineNumber ? endLineNumber : startLineNumber
    endColumn = endColumn > 0 ? endColumn : startColumn
    return {
        resource, owner, code: data.code, severity: data.severity, message: data.message, source: data.source,
        startLineNumber, startColumn, endLineNumber, endColumn, relatedInformation: data.relatedInformation, tags: data.tags,
    }
}

const emitter = new Emitter<readonly Uri[]>()
let pending: Map<string, Uri> | null = null
function fireChanged(resources: readonly Uri[]): void {
    // Monaco 用 DebounceEmitter(delay 0, 合并):同一轮里多次改动合成一次事件
    if (!pending) {
        pending = new Map()
        setTimeout(() => {
            const all = [...pending!.values()]
            pending = null
            emitter.fire(all)
        }, 0)
    }
    for (const r of resources) pending.set(r.toString(), r)
}

/** monaco.editor.onDidChangeMarkers */
export const onDidChangeMarkers: IEvent<readonly Uri[]> = emitter.event

function changeOne(owner: string, resource: Uri, markerData: readonly IMarkerData[]): void {
    const key = resource.toString()
    if (!markerData || markerData.length === 0) {
        const m = byOwner.get(owner)
        if (m?.delete(key)) {
            if (!m.size) byOwner.delete(owner)
            fireChanged([resource])
            syncUri(resource)
        }
        return
    }
    const markers: IMarker[] = []
    for (const d of markerData) {
        const m = toMarker(owner, resource, d)
        if (m) markers.push(m)
    }
    let m = byOwner.get(owner)
    if (!m) byOwner.set(owner, m = new Map())
    m.set(key, markers)
    fireChanged([resource])
    syncUri(resource)
}

/** monaco.editor.setModelMarkers(model, owner, markers):整体替换这个 owner 在这个 model 上的 marker */
export function setModelMarkers(model: ITextModel, owner: string, markers: IMarkerData[]): void {
    changeOne(owner, model.uri, markers)
}

/** monaco.editor.removeAllMarkers(owner):清掉这个 owner 的全部 marker(所有 resource) */
export function removeAllMarkers(owner: string): void {
    const m = byOwner.get(owner)
    if (!m) return
    const uris = [...m.keys()].map(k => Uri.parse(k))
    byOwner.delete(owner)
    fireChanged(uris)
    for (const u of uris) syncUri(u)
}

/** monaco.editor.getModelMarkers(filter) */
export function getModelMarkers(filter: { owner?: string, resource?: Uri, take?: number }): IMarker[] {
    return readMarkers(filter)
}

function readMarkers(filter: MarkerFilter = {}): IMarker[] {
    const { owner, resource } = filter
    let take = filter.take
    if (!take || take < 0) take = -1
    const out: IMarker[] = []
    const accept = (m: IMarker) => filter.severities === undefined || (filter.severities & m.severity) === m.severity
    const push = (list: readonly IMarker[]): boolean => {
        for (const m of list) {
            if (!accept(m)) continue
            if (out.push(m) === take) return true
        }
        return false
    }
    if (owner && resource) {
        push(byOwner.get(owner)?.get(resource.toString()) ?? [])
    } else if (owner) {
        for (const list of byOwner.get(owner)?.values() ?? []) if (push(list)) break
    } else if (resource) {
        const key = resource.toString()
        for (const mm of byOwner.values()) { const l = mm.get(key); if (l && push(l)) break }
    } else {
        outer: for (const mm of byOwner.values()) for (const l of mm.values()) if (push(l)) break outer
    }
    return out
}

// ───────────── 落到视图 ─────────────

export interface MarkerTagMark { from: number, to: number, tag: 'unnecessary' | 'deprecated' | 'hint', message: string, code?: string, owner: string, source?: string, related?: readonly DiagnosticRelated[] }

const setMarkerTags = core.StateEffect.define<MarkerTagMark[]>()
export const markerTagField = core.StateField.define<MarkerTagMark[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects) if (e.is(setMarkerTags)) return e.value
        if (!tr.docChanged || !val.length) return val
        const oldLen = tr.changes.length
        const out: MarkerTagMark[] = []
        for (const m of val) {
            if (m.to > oldLen) continue
            const from = tr.changes.mapPos(m.from, 1)
            const to = tr.changes.mapPos(m.to, -1)
            if (from < to) out.push(from === m.from && to === m.to ? m : { ...m, from, to })
        }
        return out
    },
})

const TAG_CLASS = { unnecessary: 'cm-unnecessary', deprecated: 'cm-deprecated', hint: 'cm-squiggly-hint' } as const
const tagMarks = {
    unnecessary: core.Decoration.mark({ class: TAG_CLASS.unnecessary }),
    deprecated: core.Decoration.mark({ class: TAG_CLASS.deprecated }),
    hint: core.Decoration.mark({ class: TAG_CLASS.hint }),
}
function markerTagDecorations(state: core.EditorState) {
    const marks = state.field(markerTagField, false)
    if (!marks?.length) return core.RangeSet.empty as ReturnType<typeof core.shikiDecorations>
    const len = state.doc.length
    return core.RangeSet.of(
        marks.filter(m => m.from < m.to && m.to <= len).map(m => tagMarks[m.tag].range(m.from, m.to)),
        true,
    ) as ReturnType<typeof core.shikiDecorations>
}

/** 装进 lite-monaco 的装配(assemble):marker 的 tag 层 + 它们的 hover 条目。诊断层用 diagnosticsField(那边已经装了) */
export function markerExtensions(): core.Extension[] {
    return [
        markerTagField,
        core.decorations.of(markerTagDecorations),
        core.hoverMarkers.of(state => (state.field(markerTagField, false) ?? []).map(m => ({ ...m, severity: 'hint' as const } as HoverMarker))),
    ]
}

/** Monaco _createDecorationRange */
function decorationRange(model: ITextModel, m: IMarker): Range {
    const hasTag = (t: MarkerTag) => !!m.tags?.includes(t)
    let ret = Range.lift({ startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn })!
    if (m.severity === MarkerSeverity.Hint && !hasTag(MarkerTag.Unnecessary) && !hasTag(MarkerTag.Deprecated)) {
        ret = ret.setEndPosition(ret.startLineNumber, ret.startColumn + 2)
    }
    ret = model.validateRange(ret)
    if (ret.isEmpty()) {
        const maxColumn = model.getLineLastNonWhitespaceColumn(ret.startLineNumber) || model.getLineMaxColumn(ret.startLineNumber)
        if (maxColumn === 1 || ret.endColumn >= maxColumn) return ret
        const word = model.getWordAtPosition(ret.getStartPosition())
        if (word) ret = new Range(ret.startLineNumber, word.startColumn, ret.endLineNumber, word.endColumn)
    } else if (m.endColumn === Number.MAX_VALUE && m.startColumn === 1 && ret.startLineNumber === ret.endLineNumber) {
        const minColumn = model.getLineFirstNonWhitespaceColumn(m.startLineNumber)
        if (minColumn < ret.endColumn) ret = new Range(ret.startLineNumber, minColumn, ret.endLineNumber, ret.endColumn)
    }
    return ret
}

function codeText(m: IMarker): string | undefined {
    const code = typeof m.code === 'string' ? m.code : m.code?.value
    if (m.source && code) return `${m.source}(${code})`
    return m.source || code || undefined
}

function offsetOf(model: ITextModel, p: Position): number {
    // doc 偏移:行首偏移 + 列(不含 CRLF 补偿)
    let off = 0
    const view = (model as TextModel).attachedView
    if (view) return view.state.doc.line(p.lineNumber).from + p.column - 1
    for (let l = 1; l < p.lineNumber; l++) off += model.getLineLength(l) + 1
    return off + p.column - 1
}

function relatedOf(model: ITextModel, m: IMarker): { related?: DiagnosticRelated[] } {
    if (!m.relatedInformation?.length) return {}
    const related = m.relatedInformation.map(r => ({
        file: r.resource.path.split('/').pop() || r.resource.toString(),
        line: r.startLineNumber,
        col: r.startColumn,
        message: r.message,
        same: r.resource.toString() === model.uri.toString(),
    }))
    return { related }
}

/** 把这个 model 当前的 marker 同步进它所在的视图;视图上不是 marker 层放的诊断(没有 owner 的)原样保留 */
function syncModel(model: TextModel): void {
    const view = model.attachedView
    if (!view || model.isDisposed()) return
    const state = view.state
    if (!state.field(core.diagnosticsField, false) && !state.field(markerTagField, false)) return
    const diags: Diagnostic[] = []
    const tags: MarkerTagMark[] = []
    for (const m of readMarkers({ resource: model.uri })) {
        const r = decorationRange(model, m)
        const from = offsetOf(model, r.getStartPosition()), to = offsetOf(model, r.getEndPosition())
        const code = codeText(m)
        const common = { from, to, message: m.message, ...(code ? { code } : {}), owner: m.owner, source: m.owner, ...relatedOf(model, m) }
        const isHint = m.severity === MarkerSeverity.Hint
        if (!isHint) diags.push({ ...common, severity: m.severity === MarkerSeverity.Error ? 'error' : m.severity === MarkerSeverity.Warning ? 'warning' : 'info' })
        if (m.tags?.includes(MarkerTag.Unnecessary)) tags.push({ ...common, tag: 'unnecessary' })
        if (m.tags?.includes(MarkerTag.Deprecated)) tags.push({ ...common, tag: 'deprecated' })
        if (isHint && !m.tags?.length) tags.push({ ...common, tag: 'hint' })
    }
    const effects: core.StateEffect<unknown>[] = []
    const cur = state.field(core.diagnosticsField, false)
    if (cur) {
        const keep = cur.filter(d => !d.owner)
        if (keep.length !== cur.length || diags.length) effects.push(core.setDiagnostics.of([...keep, ...diags]) as core.StateEffect<unknown>)
    }
    // 标记没变(都是空)就不派发:挂载时 model 一建好就同步一次,空事务会白白多一次宿主 dispatch
    const curTags = state.field(markerTagField, false)
    if (curTags && (curTags.length || tags.length)) effects.push(setMarkerTags.of(tags) as core.StateEffect<unknown>)
    if (effects.length) view.dispatch(state.update({ effects, annotations: [core.Transaction.addToHistory.of(false)] }))
}

function syncUri(resource: Uri): void {
    const key = resource.toString()
    for (const m of getModels()) if (m.uri.toString() === key) syncModel(m as TextModel)
}

modelAttachHooks.add((model, attached) => { if (attached) syncModel(model) })

/** 统计(Monaco IMarkerService.getStatistics) */
export function getMarkerStatistics(): IMarkerStatData {
    const s = { errors: 0, warnings: 0, infos: 0, unknowns: 0 }
    for (const m of readMarkers()) {
        if (m.severity === MarkerSeverity.Error) s.errors++
        else if (m.severity === MarkerSeverity.Warning) s.warnings++
        else if (m.severity === MarkerSeverity.Info) s.infos++
        else s.unknowns++
    }
    return s
}

