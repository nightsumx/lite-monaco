// 语义同符号高亮 —— getDocumentHighlights，不是字面同词。

import type { EditorView } from '../core/view/editorview'
import type { EditorState } from '../core/model/state'
import type { DecorationSet } from '../core/model/decoration'
import { Decoration } from '../core/model/decoration'
import { RangeSetBuilder } from '../core/model/rangeset'
import { StateEffect, StateField } from '../core/model/state'
import { getTSService, type TSServiceOptions } from './tsservice'
import { materializeDoc } from '../core/perf'
import { wordHighlightRanges } from '../core/feature/selectionlayer'

/** write:TS writtenReference(带初值的声明、赋值)= Monaco DocumentHighlightKind.Write;否则是 Text */
export interface HighlightMark { from: number, to: number, write?: boolean }

/** spans 可带 TS HighlightSpan.kind;同一段出现两次时写优先 */
export function highlightsToMarks(
    spans: { start: number, length: number, kind?: string }[],
): HighlightMark[] {
    const seen = new Map<string, HighlightMark>()
    const out: HighlightMark[] = []
    for (const s of spans) {
        if (s.length <= 0) continue
        const from = s.start
        const to = s.start + s.length
        const key = `${from}:${to}`
        const write = s.kind === 'writtenReference'
        const had = seen.get(key)
        if (had) { if (write) had.write = true; continue }
        const m: HighlightMark = write ? { from, to, write } : { from, to }
        seen.set(key, m)
        out.push(m)
    }
    out.sort((a, b) => a.from - b.from || a.to - b.to)
    return out
}

// Monaco tsMode DocumentHighlightAdapter:writtenReference → Write(wordHighlightStrong),其余 → Text(wordHighlightText)
const hlMark = Decoration.mark({ class: 'cm-wordHighlightText' })
const hlWriteMark = Decoration.mark({ class: 'cm-wordHighlightStrong' })

export function highlightDecorations(state: EditorState): DecorationSet {
    const marks = state.field(highlightField, false) ?? []
    const b = new RangeSetBuilder<Decoration>()
    for (const m of marks) {
        if (m.from < m.to && m.to <= state.doc.length)
            b.add(m.from, m.to, m.write ? hlWriteMark : hlMark)
    }
    return b.finish()
}

export const setHighlights = StateEffect.define<HighlightMark[]>()
export const highlightField = StateField.define<HighlightMark[]>({
    create: () => [],
    update: (val, tr) => {
        for (const e of tr.effects)
            if (e.is(setHighlights)) return e.value
        if (tr.docChanged) return []
        return val
    },
})

// Monaco TS 语言配置的 wordPattern(getWordAtPosition 用它,`$` 算词内字符)
const TS_WORD = /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g

/** Monaco model.getWordAtPosition:光标贴着(前或后)的词,列从 0 起 */
export function tsWordAt(text: string, col: number): { start: number, end: number } | null {
    TS_WORD.lastIndex = 0
    for (let m = TS_WORD.exec(text); m; m = TS_WORD.exec(text)) {
        if (m.index > col) break
        if (col <= m.index + m[0].length) return { start: m.index, end: m.index + m[0].length }
    }
    return null
}

/**
 * 对齐 Monaco WordHighlighter:
 *   光标变化 → 50ms(runDelayer)→ 用户移动(鼠标 / 键盘)才查,其余(打字、撤销、程序设选区)清掉;
 *   查之前要求有焦点、主选区单行、选区在一个词里(或正好包住它),否则清掉;
 *   光标还在现有高亮里 → 不动;否则清掉旧的,查完后距这次 run 至少 250ms 才画;
 *   内容变化立即清;失焦不清(保留到下一次光标 / 内容变化);聚焦时按当前选区查一次。
 */
export function tsHighlightSession(view: EditorView, opts: TSServiceOptions): () => void {
    const session = getTSService(opts)
    return highlightSession(view, async pos => {
        session.update(materializeDoc(view.state))
        const hits = await session.service().getDocumentHighlights(session.fileName, pos, [session.fileName])
        return hits?.flatMap(h => h.highlightSpans.map(s => ({ ...s.textSpan, kind: s.kind })))
    })
}

/** 一次查询:undefined / null = 这个位置没有语义高亮,退回文本同词;空数组 = 有结果但没有高亮(不退) */
export type HighlightQuery = (pos: number) => Promise<{ start: number, length: number, kind?: string }[] | null | undefined>

/** WordHighlighter 的时序壳(50ms / 250ms / 仅用户移动 / 需焦点 / 文档变清掉);怎么查由 query 决定 */
export function highlightSession(view: EditorView, query: HighlightQuery, enabled: () => boolean = () => true): () => void {
    let delayTimer: ReturnType<typeof setTimeout> | null = null
    let renderTimer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    let disposed = false
    // Monaco WordHighlighter.query:上一次有效查询(失焦时有它才保留)
    let queried = false
    let lastRunAt = 0

    const marks = () => view.state.field(highlightField, false) ?? []
    const setMarks = (m: HighlightMark[]) => {
        if (!sameMarks(marks(), m)) view.dispatch(view.state.update({ effects: setHighlights.of(m) }))
    }
    const stopAll = () => {
        seq++
        if (renderTimer) { clearTimeout(renderTimer); renderTimer = null }
        if (marks().length) setMarks([])
    }

    const compute = async (pos: number, my: number) => {
        const sentDoc = view.state.doc
        let spans: { start: number, length: number, kind?: string }[] = []
        try {
            const hits = await query(pos)
            // 回来时文档变了:位置不对应,丢掉
            if (disposed || my !== seq || view.state.doc !== sentDoc) return
            // Monaco getOccurrencesAtPosition:provider 给 undefined / null 才问下一个(空数组不算)→ 注释、关键字上
            // 都没有就退回 TextualDocumentHighlightProvider(全文整词同词,Text)
            spans = hits ?? wordHighlightRanges(view.state).map(r => ({ start: r.from, length: r.to - r.from }))
        }
        catch { spans = [] }
        if (disposed || my !== seq || view.state.doc !== sentDoc) return
        const next = highlightsToMarks(spans)
        const wait = lastRunAt + 250 - Date.now()
        if (wait <= 0) { setMarks(next); return }
        renderTimer = setTimeout(() => {
            renderTimer = null
            if (!disposed && my === seq) setMarks(next)
        }, wait)
    }

    const run = () => {
        if (!enabled()) {
            queried = false
            stopAll()
            return
        }
        if (!view.hasFocus) {
            if (!queried) stopAll()
            return
        }
        const state = view.state
        const sel = state.selection.main
        const line = state.doc.lineAt(sel.from)
        const word = sel.to <= line.to ? tsWordAt(line.text, sel.from - line.from) : null
        if (!word || line.from + word.start > sel.from || line.from + word.end < sel.to) {
            queried = false
            stopAll()
            return
        }
        queried = true
        lastRunAt = Date.now()
        if (marks().some(m => m.from <= sel.head && sel.head <= m.to)) return
        stopAll()
        void compute(sel.head, seq)
    }

    const delay = (fn: () => void) => {
        if (delayTimer) clearTimeout(delayTimer)
        delayTimer = setTimeout(() => { delayTimer = null; if (!disposed) fn() }, 50)
    }
    const off = view.onTransaction(tr => {
        // highlightField 在改文档的事务里已清空;别的行上的高亮 DOM 由视图对比新旧装饰当场重画(editorview repaintChangedDecos)
        if (tr.docChanged) stopAll()
        if (!tr.docChanged && !tr.selection) return
        // Monaco CursorChangeReason.Explicit = 用户的光标命令;lite-monaco 里是 select / select.pointer
        const explicit = !tr.docChanged && tr.isUserEvent('select')
        delay(() => explicit && view.hasFocus ? run() : stopAll())
    })
    const onFocus = () => delay(run)
    view.contentDOM.addEventListener('focus', onFocus)
    return () => {
        disposed = true
        if (delayTimer) clearTimeout(delayTimer)
        if (renderTimer) clearTimeout(renderTimer)
        view.contentDOM.removeEventListener('focus', onFocus)
        off()
    }
}

function sameMarks(a: HighlightMark[], b: HighlightMark[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++)
        if (a[i].from !== b[i].from || a[i].to !== b[i].to) return false
    return true
}
