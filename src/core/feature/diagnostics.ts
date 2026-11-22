// CM7 诊断 —— 状态(setDiagnostics effect + diagnosticsField)+ 波浪线 provider。
//
// lite-monaco 砍了 LSP/TS worker,诊断主要靠外部喂:view.dispatch({effects: setDiagnostics.of([...])})。
// 也可由装配层防抖拉 TS semantic diagnostics 再 setDiagnostics(source: 'ts')。
//
// 契约(M1.1):
//   · setDiagnostics 全量替换列表
//   · 文档变更时 **map 区间**(对齐 Monaco markers);整段被删掉的诊断丢弃
//   · 波浪线 + overview ruler + diagnostic hover 同源读 diagnosticsField

import type { DecorationSet } from '../model/decoration'
import type { EditorState, StateCommand, Transaction } from '../model/state'
import { EditorSelection } from '../model/selection'
import { Decoration } from '../model/decoration'
import { RangeSetBuilder } from '../model/rangeset'
import { Facet, StateEffect, StateField } from '../model/state'
import type { Severity, Diagnostic } from '../chrome/ruler'

export const setDiagnostics = StateEffect.define<Diagnostic[]>()

/**
 * 把诊断区间随 ChangeSet 映射;from>=to 或被删光则丢弃。
 * 先钳到旧文档长度再映射:宿主/异步源给的越界区间(比如文末零长度诊断被撑成 len+1)
 * 不能让 mapPos 抛 RangeError —— 那会让整个 dispatch 失败,编辑器锁死。
 */
export function mapDiagnostics(diags: readonly Diagnostic[], tr: Transaction): Diagnostic[] {
    if (!tr.docChanged || !diags.length) return diags as Diagnostic[]
    const oldLen = tr.changes.length
    const len = tr.changes.newLength
    const out: Diagnostic[] = []
    for (const d of diags) {
        const from = tr.changes.mapPos(Math.max(0, Math.min(d.from, oldLen)), 1)
        const to = tr.changes.mapPos(Math.max(0, Math.min(d.to, oldLen)), -1)
        if (from >= to) continue
        const a = Math.max(0, Math.min(from, len))
        const b = Math.max(0, Math.min(to, len))
        if (a >= b) continue
        if (a === d.from && b === d.to) out.push(d)
        else out.push({ ...d, from: a, to: b })
    }
    return out
}

function sortedDiags(state: EditorState) {
    const diags = state.field(diagnosticsField, false) ?? []
    return diags.filter(d => d.to > d.from).slice().sort((a, b) => a.from - b.from || a.to - b.to)
}

/**
 * Monaco MarkerController(editor.action.marker.next / prev / nextInFiles / prevInFiles):装了它,
 * goToNextProblem / goToPrevProblem 在真实 EditorView 上改走标记导航浮窗(MarkerNavigationWidget,见 lang/markernav.ts);
 * 没装(裸 state、没有语言层)退回「选中下一条诊断」。
 */
export type MarkerNavigationHandler = (view: any, next: boolean, multiFile: boolean) => boolean
export const markerNavigation = Facet.define<MarkerNavigationHandler, MarkerNavigationHandler | null>({
    combine: v => v[0] ?? null,
})
const viaWidget = (target: unknown, next: boolean): boolean | undefined => {
    const t = target as { state: EditorState, dom?: unknown }
    if (!t.dom) return undefined
    const h = t.state.facet(markerNavigation)
    return h ? h(t, next, false) : undefined
}

export const goToNextProblem: StateCommand = (target) => {
    const w = viaWidget(target, true)
    if (w !== undefined) return w
    const { state, dispatch } = target
    const diags = sortedDiags(state)
    if (!diags.length) return false
    const head = state.selection.main.head
    const next = diags.find(d => d.from > head) ?? diags[0]
    dispatch(state.update({
        selection: EditorSelection.range(next.from, next.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

export const goToPrevProblem: StateCommand = (target) => {
    const w = viaWidget(target, false)
    if (w !== undefined) return w
    const { state, dispatch } = target
    const diags = sortedDiags(state)
    if (!diags.length) return false
    const head = state.selection.main.head
    let prev = null as typeof diags[0] | null
    for (const d of diags) {
        if (d.from < head) prev = d
        else break
    }
    const hit = prev ?? diags[diags.length - 1]
    dispatch(state.update({
        selection: EditorSelection.range(hit.from, hit.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

export const diagnosticsField = StateField.define<Diagnostic[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects) if (e.is(setDiagnostics)) return e.value
        return mapDiagnostics(val, tr)
    },
})

// severity → Decoration.mark 按 kind 缓存;颜色/波浪走 CSS class(theme 注 SVG),provider 不带色彩参数。
const squiggleByKind = new Map<Severity, Decoration>()
function squiggleMark(severity: Severity): Decoration {
    let m = squiggleByKind.get(severity)
    if (!m) {
        m = Decoration.mark({ class: `cm-diagnostic cm-diagnostic-${severity}` })
        squiggleByKind.set(severity, m)
    }
    return m
}

// 波浪线 provider:读 diagnosticsField,按 from 升序 + clamp 到 doc 长度喂 RangeSetBuilder。
export function diagnosticSquiggles(state: EditorState): DecorationSet {
    const diags = state.field(diagnosticsField, false) ?? []
    const len = state.doc.length
    const builder = new RangeSetBuilder<Decoration>()
    for (const d of [...diags].sort((a, b) => a.from - b.from)) {
        const from = Math.max(0, Math.min(d.from, len))
        const to = Math.max(0, Math.min(d.to, len))
        if (from < to) builder.add(from, to, squiggleMark(d.severity))
    }
    return builder.finish()
}
