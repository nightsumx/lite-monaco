// 参数 / 类型 inlay hint —— provideInlayHints → 行内 widget。

import type { EditorView } from '../core/view/editorview'
import type { EditorState, Transaction } from '../core/model/state'
import { MapMode } from '../core/model/change'
import type { DecorationSet } from '../core/model/decoration'
import { Decoration, WidgetType } from '../core/model/decoration'
import { RangeSetBuilder } from '../core/model/rangeset'
import { StateEffect, StateField } from '../core/model/state'
import { getTSService, type TSServiceOptions } from './tsservice'
import { defaultsFor, type InlayHintsOptions } from './tsapi'
import { materializeDoc } from '../core/perf'
import { getOption } from '../core/options'

/** kind / paddingLeft / paddingRight 对应 Monaco InlayHint.kind / paddingLeft / paddingRight(TS 的 whitespaceBefore / whitespaceAfter) */
export interface InlayMark { pos: number, text: string, kind?: 'Type' | 'Parameter' | 'Enum', paddingLeft?: boolean, paddingRight?: boolean }

export function hintsToMarks(
    hints: { position: number, text: string, kind?: string, whitespaceBefore?: boolean, whitespaceAfter?: boolean }[],
): InlayMark[] {
    return hints
        .filter(h => h.text)
        .map(h => {
            const m: InlayMark = { pos: h.position, text: h.text }
            if (h.kind === 'Type' || h.kind === 'Parameter' || h.kind === 'Enum') m.kind = h.kind
            if (h.whitespaceBefore) m.paddingLeft = true
            if (h.whitespaceAfter) m.paddingRight = true
            return m
        })
        .sort((a, b) => a.pos - b.pos)
}

// —— inlayHints.fontSize / fontFamily / padding(Monaco InlayHintsController._getLayoutInfo + 渲染样式)——
export interface InlayLayout { fontSize: number, fontFamily: string, padding: boolean, uniform: boolean }

/** fontSize:0 / <5 / 大于编辑器字号 → 编辑器字号;fontFamily 空 → 编辑器字体 */
export function inlayLayout(state: EditorState): InlayLayout {
    const o = (getOption(state, 'inlayHints') ?? {}) as { fontSize?: number, fontFamily?: string, padding?: boolean }
    const editorSize = Number(getOption(state, 'fontSize')) || 14
    const editorFamily = String(getOption(state, 'fontFamily') ?? '')
    let fontSize = o.fontSize ?? 0
    if (!fontSize || fontSize < 5 || fontSize > editorSize) fontSize = editorSize
    const fontFamily = o.fontFamily || editorFamily
    const padding = !!o.padding
    return { fontSize, fontFamily, padding, uniform: !padding && fontFamily === editorFamily && fontSize === editorSize }
}

class InlayWidget extends WidgetType {
    constructor(readonly mark: InlayMark, readonly layout: InlayLayout) { super() }
    eq(other: WidgetType) {
        if (!(other instanceof InlayWidget)) return false
        const a = this.mark, b = other.mark, x = this.layout, y = other.layout
        return a.text === b.text && a.kind === b.kind && !!a.paddingLeft === !!b.paddingLeft && !!a.paddingRight === !!b.paddingRight
            && x.fontSize === y.fontSize && x.fontFamily === y.fontFamily && x.padding === y.padding && x.uniform === y.uniform
    }
    toDOM() {
        const { mark, layout } = this
        const el = document.createElement('span')
        el.className = 'cm-inlayHint'
        if (mark.kind) el.classList.add(`cm-inlayHint-${mark.kind.toLowerCase()}`)
        el.textContent = mark.text
        if (!layout.uniform) {
            el.style.fontSize = `${layout.fontSize}px`
            if (layout.fontFamily) el.style.fontFamily = layout.fontFamily
            el.style.verticalAlign = 'middle'
        }
        if (layout.padding) {
            const q = Math.max(1, layout.fontSize / 4) | 0
            el.style.padding = `1px ${q}px`
            el.style.borderRadius = `${q}px`
        }
        // Monaco addInjectedWhitespace:宽 fontSize/3 的空白
        const gap = `${(layout.fontSize / 3) | 0}px`
        if (mark.paddingLeft) el.style.marginLeft = gap
        if (mark.paddingRight) el.style.marginRight = gap
        return el
    }
}

/** 为每个 hint 画 widget。inlayHints.enabled=off 时不画;offUnlessPressed / onUnlessPressed 看修饰键状态(inlayPressedField) */
export function inlayDecorations(state: EditorState, marks: InlayMark[]): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    if (!inlayVisible(state)) return b.finish()
    const layout = inlayLayout(state)
    const len = state.doc.length
    // inlayHints.maximumLength(默认 43,0 = 不截断;Monaco InlayHintsController._updateHintsDecorators):同一行的提示文字长度累计,
    // 累计已超限的后续提示整个丢弃;越线的这一条砍到限长再补 '…'。padding 空白不计长
    const maxLength = ((getOption(state, 'inlayHints') ?? {}) as { maximumLength?: number }).maximumLength ?? 43
    let lineNo = 0, total = 0
    for (let m of marks) {
        if (m.pos < 0 || m.pos > len) continue
        if (maxLength) {
            const ln = state.doc.lineAt(m.pos).number
            if (ln !== lineNo) { lineNo = ln; total = 0 }
            if (total > maxLength) continue
            total += m.text.length
            const over = total - maxLength
            if (over > 0) m = { ...m, text: m.text.slice(0, -over) + '…' }
        }
        b.add(m.pos, m.pos, Decoration.widget({ widget: new InlayWidget(m, layout), side: -1 }))
    }
    return b.finish()
}

export type InlayEnabled = 'on' | 'off' | 'offUnlessPressed' | 'onUnlessPressed'
export const inlayEnabled = (state: EditorState): InlayEnabled =>
    ((getOption(state, 'inlayHints') as { enabled?: InlayEnabled } | undefined)?.enabled ?? 'on')

/** Ctrl+Alt(不带 Shift / Meta)是否正按着 —— Monaco ModifierKeyEmitter 的判据 */
export const setInlayPressed = StateEffect.define<boolean>()
export const inlayPressedField = StateField.define<boolean>({
    create: () => false,
    update: (v, tr) => {
        for (const e of tr.effects) if (e.is(setInlayPressed)) return e.value
        return v
    },
})

/** 此刻 hint 该不该画(Monaco RenderMode.Normal / Invisible) */
export function inlayVisible(state: EditorState): boolean {
    const mode = inlayEnabled(state)
    if (mode === 'off') return false
    if (mode === 'on') return true
    const pressed = state.field(inlayPressedField, false) ?? false
    return mode === 'offUnlessPressed' ? pressed : !pressed
}

export const setInlayHints = StateEffect.define<InlayMark[]>()
export const inlayField = StateField.define<InlayMark[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects)
            if (e.is(setInlayHints)) return e.value
        return mapInlayMarks(val, tr)
    },
})

/** 提示随编辑映射(TS 刷新前不漂到别的 token 中间);在提示处打字,提示留在新文本之前;所在处被删掉的丢弃 */
export function mapInlayMarks(marks: InlayMark[], tr: Transaction): InlayMark[] {
    if (!tr.docChanged || !marks.length) return marks
    const oldLen = tr.changes.length
    const out: InlayMark[] = []
    for (const m of marks) {
        if (m.pos > oldLen) continue
        const pos = tr.changes.mapPos(m.pos, -1, MapMode.TrackDel)
        if (pos != null) out.push(pos === m.pos ? m : { ...m, pos })
    }
    return out
}

export function inlayDecorationsFromField(state: EditorState): DecorationSet {
    return inlayDecorations(state, state.field(inlayField, false) ?? [])
}

export type TSInlayOptions = TSServiceOptions & {
    /** 宿主没调过 setInlayHintsOptions 时用的提示种类(旧开关 features.inlayHints 的 'literals');不给 = 不请求(Monaco 默认) */
    fallback?: InlayHintsOptions
}

export function tsInlaySession(view: EditorView, opts: TSInlayOptions): () => void {
    const session = getTSService(opts)
    const defaults = defaultsFor(opts.lang)
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false

    const clear = () => {
        if ((view.state.field(inlayField, false) ?? []).length) view.dispatch(view.state.update({ effects: setInlayHints.of([]) }))
    }

    const run = async () => {
        const my = ++seq
        // inlayHints.enabled=off:不请求,清掉已有的;TS 选项空 = Monaco 默认不出 hint
        const prefs = Object.keys(defaults.inlayHintsOptions).length ? defaults.inlayHintsOptions : opts.fallback
        if (inlayEnabled(view.state) === 'off' || !prefs || !Object.keys(prefs).length) { clear(); return }
        const sentDoc = view.state.doc
        session.update(materializeDoc(view.state))
        let raw: InlayMark[] = []
        try {
            const hints = await session.service().provideInlayHints(session.fileName, { start: 0, length: sentDoc.length }, prefs) ?? []
            raw = hintsToMarks(hints.map(h => ({
                position: h.position, text: h.text, kind: h.kind, whitespaceBefore: h.whitespaceBefore, whitespaceAfter: h.whitespaceAfter,
            })))
        }
        catch { return }
        // 回来时文档又变了:位置按旧文本算的,丢掉(下一轮防抖已排)
        if (disposed || my !== seq || view.state.doc !== sentDoc) return
        const marks = raw
        const cur = view.state.field(inlayField, false) ?? []
        if (sameMarks(cur, marks)) return
        view.dispatch(view.state.update({ effects: setInlayHints.of(marks) }))
    }

    const schedule = (ms = 360) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { void run() }, ms)
    }
    let lastMode = inlayEnabled(view.state)
    const off = view.onTransaction(tr => {
        if (tr.docChanged) schedule()
        // 运行时 updateOptions 换了 inlayHints.enabled:off→别的要重新请求,变 off 要清掉
        const mode = inlayEnabled(view.state)
        if (mode !== lastMode) {
            const wasOff = lastMode === 'off'
            lastMode = mode
            if (mode === 'off' || wasOff) schedule(0)
        }
    })
    const offDefaults = defaults.onDidChange(() => { if (!disposed) schedule(0) })

    // offUnlessPressed / onUnlessPressed:Ctrl+Alt(不带 Shift / Meta)按下 / 松开(Monaco ModifierKeyEmitter)
    const win = view.dom.ownerDocument.defaultView
    const onKey = (e: KeyboardEvent) => {
        const pressed = e.altKey && e.ctrlKey && !(e.shiftKey || e.metaKey)
        const mode = inlayEnabled(view.state)
        if (mode !== 'offUnlessPressed' && mode !== 'onUnlessPressed') return
        if ((view.state.field(inlayPressedField, false) ?? false) === pressed) return
        view.dispatch(view.state.update({ effects: setInlayPressed.of(pressed) }))
    }
    const onBlur = () => {
        if (view.state.field(inlayPressedField, false)) view.dispatch(view.state.update({ effects: setInlayPressed.of(false) }))
    }
    win?.addEventListener('keydown', onKey, true)
    win?.addEventListener('keyup', onKey, true)
    win?.addEventListener('blur', onBlur)
    schedule()
    return () => {
        disposed = true
        if (timer) clearTimeout(timer)
        off()
        offDefaults.dispose()
        win?.removeEventListener('keydown', onKey, true)
        win?.removeEventListener('keyup', onKey, true)
        win?.removeEventListener('blur', onBlur)
    }
}

function sameMarks(a: InlayMark[], b: InlayMark[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++)
        if (a[i].pos !== b[i].pos || a[i].text !== b[i].text || a[i].kind !== b[i].kind
            || !!a[i].paddingLeft !== !!b[i].paddingLeft || !!a[i].paddingRight !== !!b[i].paddingRight) return false
    return true
}
