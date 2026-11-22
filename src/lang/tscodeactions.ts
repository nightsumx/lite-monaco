// TS Code Actions 最小集(M2.2)—— lightbulb + getCodeFixesAtPosition。
// 光标落在有 code fix 的诊断上时显示灯泡;点击/Mod-. 弹出操作列表。

import type { EditorView } from '../core/view/editorview'
import { diagnosticsField } from '../core/feature/diagnostics'
import { getOption } from '../core/options'
import type { HoverAction } from '../core/feature/hover'
import type { Diagnostic } from '../core/chrome/ruler'
import { getTSService, type TSServiceOptions } from './tsservice'
import { showActionList } from '../core/feature/actionlist'
import { materializeDoc, budgetForState } from '../core/perf'
import type { EditorState } from '../core/model/state'
import { tsTagField } from './tsdiagnostics'
import { tsFormatOptions } from './tsformatopts'
import { showEditorMessage } from './tsrename'
import { isTsCanceled, type TsAsyncService } from './tsprotocol'

export type TSCodeActionsOptions = TSServiceOptions

function applyEdits(
    view: EditorView,
    edits: { span: { start: number, length: number }, newText: string }[],
): boolean {
    if (!edits.length) return false
    const sorted = [...edits].sort((a, b) => b.span.start - a.span.start)
    view.dispatch(view.state.update({
        changes: sorted.map(e => ({
            from: e.span.start,
            to: e.span.start + e.span.length,
            insert: e.newText,
        })),
        userEvent: 'input.fix',
    }))
    return true
}

export interface CodeActionItem {
    description: string
    /** CodeActionKind:quick fix 是 'quickfix',重构是 TS 给的 kind(如 refactor.extract.function) */
    kind: string
    edits: { span: { start: number, length: number }, newText: string }[]
}

export function codeActionsFromFixes(
    fixes: readonly import('typescript').CodeFixAction[] | undefined,
    mainFile: string,
): CodeActionItem[] {
    if (!fixes?.length) return []
    const main = mainFile.replace(/\\/g, '/')
    const out: CodeActionItem[] = []
    for (const f of fixes) {
        const edits: CodeActionItem['edits'] = []
        for (const fc of f.changes ?? []) {
            const fn = fc.fileName.replace(/\\/g, '/')
            if (fn !== main && !fn.endsWith(main) && `/${fn}` !== main) continue
            for (const tc of fc.textChanges)
                edits.push({ span: tc.span, newText: tc.newText })
        }
        if (edits.length)
            out.push({ description: f.description, kind: 'quickfix', edits })
    }
    return out
}

function fileChangesToItem(
    packs: readonly { fileName: string, textChanges: readonly { span: { start: number, length: number }, newText: string }[] }[] | undefined,
    mainFile: string,
    description: string,
): CodeActionItem | null {
    if (!packs?.length) return null
    const main = mainFile.replace(/\\/g, '/')
    const edits: CodeActionItem['edits'] = []
    for (const fc of packs) {
        const fn = fc.fileName.replace(/\\/g, '/')
        if (fn !== main && !fn.endsWith(main) && `/${fn}` !== main) continue
        for (const tc of fc.textChanges)
            edits.push({ span: tc.span, newText: tc.newText })
    }
    return edits.length ? { description, kind: 'quickfix', edits } : null
}

export async function collectCodeActionsAt(
    view: EditorView,
    opts: TSCodeActionsOptions,
    pos?: number,
): Promise<CodeActionItem[]> {
    const session = getTSService(opts)
    // 请求期间文档变了,TS 给的位置就对不上:结尾比对这一份,变了返回空(同「没有 code action」)
    const state = view.state
    const docAt = state.doc
    const head = pos ?? state.selection.main.head
    session.update(materializeDoc(state))
    const svc = session.service()

    // 优先用诊断区间
    const diags = state.field(diagnosticsField, false) ?? []
    const hit = diags.find(d => d.source === 'ts' && head >= d.from && head <= d.to)
    const start = hit?.from ?? head
    const end = hit?.to ?? head
    const errorCodes: number[] = []
    if (hit?.code) {
        const m = /\((\d+)\)/.exec(hit.code)
        if (m) errorCodes.push(Number(m[1]))
    }
    if (!errorCodes.length) {
        try {
            const diags = [
                ...((await svc.getSyntacticDiagnostics(session.fileName)) ?? []),
                ...((await svc.getSemanticDiagnostics(session.fileName)) ?? []),
            ]
            for (const d of diags) {
                if (d.start == null) continue
                const to = d.start + (d.length ?? 1)
                if (head >= d.start && head <= to) errorCodes.push(d.code)
            }
        }
        catch { /* */ }
    }
    // 若无 code,仍试 fix
    let fixes: readonly import('typescript').CodeFixAction[] = []
    try {
        // (file, start, end, errorCodes, formatOptions, preferences)
        fixes = (await svc.getCodeFixesAtPosition(
            session.fileName,
            start,
            end,
            errorCodes,
            tsFormatOptions(state, 'codefix'),
            {},
        )) ?? []
    } catch {
        fixes = []
    }
    const out = codeActionsFromFixes(fixes, session.fileName)
    const fmt = tsFormatOptions(state, 'codefix')
    const seenFix = new Set<string>()
    for (const f of fixes) {
        if (f.fixId == null) continue
        const id = typeof f.fixId === 'string' ? f.fixId : JSON.stringify(f.fixId)
        if (seenFix.has(id)) continue
        seenFix.add(id)
        try {
            const pack = await svc.getCombinedCodeFix(
                { type: 'file', fileName: session.fileName },
                f.fixId,
                fmt,
                {},
            )
            const item = fileChangesToItem(pack?.changes, session.fileName, `Fix all: ${f.description}`)
            if (item) out.push(item)
        }
        catch { /* 无 combined */ }
    }
    const sel = state.selection.main
    const loc = sel.empty ? head : { pos: sel.from, end: sel.to }
    let infos: readonly import('typescript').ApplicableRefactorInfo[] = []
    try {
        infos = (await svc.getApplicableRefactors(session.fileName, loc, {}, 'invoked')) ?? []
    }
    catch { infos = [] }
    const main = session.fileName.replace(/\\/g, '/')
    for (const info of infos) {
        for (const a of info.actions) {
            if (a.notApplicableReason) continue
            let pack: import('typescript').RefactorEditInfo | undefined
            try {
                pack = (await svc.getEditsForRefactor(
                    session.fileName, fmt, loc, info.name, a.name, {},
                )) ?? undefined
            }
            catch { continue }
            const edits: CodeActionItem['edits'] = []
            for (const fc of pack?.edits ?? []) {
                const fn = fc.fileName.replace(/\\/g, '/')
                if (fn !== main && !fn.endsWith(main) && `/${fn}` !== main) continue
                for (const tc of fc.textChanges)
                    edits.push({ span: tc.span, newText: tc.newText })
            }
            if (edits.length)
                out.push({ description: a.description, kind: a.kind ?? '', edits })
        }
    }
    return view.state.doc === docAt ? out : []
}

/**
 * 键盘 ⌘. 的菜单锚点(Monaco CodeActionController.toCoords):光标所在行的左下角,视口坐标。
 * 行底取 heightMap 的行盒(caretCoords 是字形盒,比行矮);折行时用光标那一视觉行的底。
 */
export function cursorMenuAnchor(view: EditorView, pos: number): { x: number, y: number } {
    const c = view.caretCoords(pos)
    const sr = view.scrollDOM.getBoundingClientRect()
    const lb = view.lineBlockAt(pos)
    const lineBottom = sr.top + lb.bottom - view.scrollDOM.scrollTop
    const wrapped = !!c && c.bottom - c.top > 0 && lb.height > (c.bottom - c.top) * 1.8
    return { x: c ? c.left : sr.left, y: wrapped && c ? c.bottom : lineBottom }
}

// VS Code codeActionWidget 的分组和顺序;kind 不在前几组的归 More Actions...
const ACTION_GROUPS: [kind: string, title: string, icon?: string][] = [
    ['quickfix', 'Quick Fix'],
    ['refactor.extract', 'Extract', 'wrench'],
    ['refactor.inline', 'Inline', 'wrench'],
    ['refactor.rewrite', 'Rewrite', 'wrench'],
    ['refactor.move', 'Move', 'wrench'],
    ['', 'More Actions...'],
]

// Quick Fix 下拉(Monaco action widget):贴着光标(⌘.)或灯泡(点击)弹出,列表本身见 core/feature/actionlist.ts。
function pickQuickFix(view: EditorView, items: CodeActionItem[], at: { x: number, y: number }): Promise<CodeActionItem | null> {
    const listed = items
        .map(it => ({ it, g: ACTION_GROUPS.findIndex(([k]) => !k || it.kind === k || it.kind.startsWith(`${k}.`)) }))
        .sort((a, b) => a.g - b.g)
    return showActionList(view, at, {
        items: listed.map(({ it, g }) => ({ label: it.description, value: it, group: ACTION_GROUPS[g][1], icon: ACTION_GROUPS[g][2] })),
    })
}

export async function runCodeActionsMenu(
    view: EditorView,
    opts: TSCodeActionsOptions,
    at?: { x: number, y: number },
    /** editor.action.refactor:只列 refactor.* 种类,没有时提示 "No refactorings available" */
    only?: 'refactor',
): Promise<boolean> {
    if (view.state.readOnly) return false
    const docAt = view.state.doc
    const all = await collectCodeActionsAt(view, opts)
    const items = only === 'refactor' ? all.filter(i => i.kind === 'refactor' || i.kind.startsWith('refactor.')) : all
    if (!items.length) {
        // Monaco CodeActionController:手动触发、什么都没有 → MessageController 在选区 head 处提示(实测 r7/monaco-quickfix.ts)
        showEditorMessage(view, view.state.selection.main.head, only === 'refactor' ? 'No refactorings available' : 'No code actions available')
        return false
    }
    const picked = await pickQuickFix(view, items, at ?? cursorMenuAnchor(view, view.state.selection.main.head))
    if (!picked || view.state.doc !== docAt) return false // 菜单开着时文档变了:位置作废
    return applyEdits(view, picked.edits)
}

/** 某条诊断上的 code fix(只要 quickfix,不含重构;对齐 Monaco markerCodeActionTrigger) */
export async function quickFixesForDiagnostic(
    view: EditorView,
    opts: TSCodeActionsOptions,
    diag: Diagnostic,
): Promise<CodeActionItem[]> {
    const m = diag.code ? /\((\d+)\)/.exec(diag.code) : null
    if (!m || diag.source !== 'ts') return []
    const session = getTSService(opts)
    const state = view.state
    session.update(materializeDoc(state))
    let fixes: readonly import('typescript').CodeFixAction[] = []
    try {
        fixes = (await session.service().getCodeFixesAtPosition(
            session.fileName, diag.from, diag.to, [Number(m[1])], tsFormatOptions(state, 'codefix'), {},
        )) ?? []
    } catch { fixes = [] }
    if (view.state.doc !== state.doc) return [] // 等结果期间文档变了
    return codeActionsFromFixes(fixes, session.fileName)
}

/** hover 诊断卡的 Quick Fix… 操作(没有 fix → 灰字 No quick fixes available) */
export function tsDiagnosticHoverActions(opts: TSCodeActionsOptions) {
    return async (view: EditorView, diag: Diagnostic): Promise<HoverAction[]> => {
        if (view.state.readOnly) return []
        const docAt = view.state.doc
        const items = await quickFixesForDiagnostic(view, opts, diag)
        if (!items.length) return [{ label: 'No quick fixes available', disabled: true }]
        return [{
            label: 'Quick Fix...',
            keybinding: /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? '⌘.' : 'Ctrl+.',
            // Monaco markerHoverParticipant:菜单贴着卡里那个 Quick Fix... 链接(at = 链接左下角)
            run: (v, at) => {
                void (async () => {
                    const picked = await pickQuickFix(v, items, at ?? cursorMenuAnchor(v, diag.from))
                    if (picked && v.state.doc === docAt) applyEdits(v, picked.edits)
                })()
            },
        }]
    }
}

/**
 * 灯泡放哪(对齐 Monaco LightBulbWidget.update):
 * - 光标行缩进够宽(> 22px)→ 本行第 1 列(画在缩进里,不盖代码)
 * - 否则看上一行 / 下一行是不是空行或缩进行,放到那一行的第 1 列(那行只有 1 个字符时放第 2 列)
 * - 上下都被代码挡住 → 放 gutter(Monaco 的 glyph margin)
 * 返回 { kind: 'inline', pos } 或 { kind: 'gutter', line }。
 */
export function lightbulbPlacement(
    lines: { text: (n: number) => string, count: number, folded?: (n: number) => boolean },
    lineNumber: number,
    column: number,
    indentPx: number,
    spaceWidth: number,
): { kind: 'inline', line: number, column: number } | { kind: 'gutter', line: number } | null {
    const folded = lines.folded ?? (() => false)
    let line = lineNumber
    let col = 1
    if (indentPx > 22) return { kind: 'inline', line, column: 1 }
    const emptyOrIndented = (n: number) => {
        const t = lines.text(n)
        return /^\s*$|^\s+/.test(t) || t.length <= col
    }
    if (lineNumber > 1 && !folded(lineNumber - 1)) {
        const endLine = lineNumber === lines.count
        const prev = emptyOrIndented(lineNumber - 1)
        const next = !endLine && emptyOrIndented(lineNumber + 1)
        const cur = emptyOrIndented(lineNumber)
        const notEmpty = !next && !prev
        if (!next && !prev) return { kind: 'gutter', line: lineNumber }
        else if (prev || endLine || (prev && !cur)) line -= 1
        else if (next || (notEmpty && cur)) line += 1
    } else if (lineNumber === 1 && (lineNumber === lines.count || (!emptyOrIndented(lineNumber + 1) && !emptyOrIndented(lineNumber)))) {
        return { kind: 'gutter', line: lineNumber }
    } else if (lineNumber < lines.count && !folded(lineNumber + 1)) {
        line += 1
    } else if (column * spaceWidth < 22) {
        return null // 上下都放不了、本行放会盖住光标
    }
    col = /^\S\s*$/.test(lines.text(line)) ? 2 : 1
    return { kind: 'inline', line, column: col }
}

// —— 灯泡的自动触发(Monaco CodeActionOracle + CodeActionModel,lightbulb.enabled 默认 onCode)——
// 光标位置变、或本文件的诊断(marker)更新 → 250ms 后按当前选区触发一次;期间再动就重新计时,所以连续打字时
// 一次也不请求。光标两侧都是空白 / 空行不请求。请求只问 TS 的 quick fix(monaco-typescript 的
// CodeActionAdaptor:getCodeFixesAtPosition,errorCodes = 和选区相交或相接的 marker 的 code,区间就是选区),
// 没有重构、没有 fix all;跟选区挨不上 marker 就没有 errorCode,TS 什么也不给,所以干脆不问。
// 灯泡在新结果出来前保持原样(Monaco 换位置不先藏),结果为空再藏。
const AUTO_TRIGGER_DELAY = 250
// 自动触发的单次 TS 调用上限。到点 TS 中断,这一版文档不再自动问(点灯泡 / ⌘. 不受限)
const AUTO_QUICKFIX_DEADLINE_MS = 30

/** Monaco CodeActionOracle._getRangeOfSelectionUnlessWhitespaceEnclosed(onCode):自动触发用的区间,null = 不触发 */
export function lightbulbTriggerRange(state: EditorState): { from: number, to: number } | null {
    const sel = state.selection.main
    // lightbulb.enabled:'off' 不自动触发;'on' 光标在空白里也触发(选区原样);'onCode'(默认)往下走
    const mode = (getOption(state, 'lightbulb') as { enabled?: string } | undefined)?.enabled
    if (mode === 'off') return null
    if (!sel.empty || mode === 'on') return { from: sel.from, to: sel.to }
    const line = state.doc.lineAt(sel.head)
    const t = line.text
    const col = sel.head - line.from
    const ws = (ch: string) => /\s/.test(ch)
    if (!t.length) return null
    if (col === 0) { if (ws(t[0])) return null }
    else if (col === t.length) { if (ws(t[t.length - 1])) return null }
    else if (ws(t[col - 1]) && ws(t[col])) return null
    return { from: sel.head, to: sel.head }
}

/**
 * 和 [from, to] 相交或相接的 TS marker 的 error code(Monaco Range.areIntersectingOrTouching)。
 * marker = 诊断 + 建议诊断的标签(未使用 6133 等,Monaco 里它们也是 marker)。
 */
export function markerCodesAt(state: EditorState, from: number, to: number): number[] {
    const out: number[] = []
    const add = (m: { from: number, to: number, code?: string }) => {
        if (m.to < from || m.from > to || !m.code) return
        const k = /\((\d+)\)$/.exec(m.code)
        if (k && !out.includes(Number(k[1]))) out.push(Number(k[1]))
    }
    for (const d of state.field(diagnosticsField, false) ?? []) if (d.source === 'ts') add(d)
    for (const t of state.field(tsTagField, false) ?? []) add(t)
    return out
}

/** monaco-typescript provideCodeActions:选区上这些 error code 的 quick fix(要建新文件的不要) */
export async function quickFixesAt(
    svc: TsAsyncService,
    fileName: string,
    state: EditorState,
    range: { from: number, to: number },
    codes: readonly number[],
): Promise<CodeActionItem[]> {
    // 不按 ts.getSupportedCodeFixes() 筛:JS 的 ts-ignore 修复登记了所有 error code,筛不掉什么
    const errorCodes = [...codes]
    if (!errorCodes.length) return []
    // Monaco CodeActionAdaptor:_convertOptions(model.getOptions()) → TabSize = IndentSize = 真 tabSize
    const fmt = tsFormatOptions(state, 'codefix')
    let fixes: readonly import('typescript').CodeFixAction[] = []
    try { fixes = (await svc.getCodeFixesAtPosition(fileName, range.from, range.to, errorCodes, fmt, {})) ?? [] }
    catch (e) {
        if (isTsCanceled(e)) throw e // withDeadline 到点,交给外层
        fixes = []
    }
    return codeActionsFromFixes(fixes.filter(f => !f.changes.some(c => c.isNewFile)), fileName)
}

/**
 * lightbulb overlay:光标处有 quick fix 时显示 codicon 灯泡(对齐 Monaco)。
 * 跟着滚动走;失焦、菜单打开时保持(Monaco 实测),没焦点时选区再变才藏。点击和 ⌘. 弹同一份列表(collectCodeActionsAt)。
 *
 * 主线程上跑 TS(Monaco 在 worker 里):code fix 内部要全文语义诊断,没缓存时是一次 30~170ms 的类型检查。
 * 所以只在本文件的语义诊断已经算过(诊断刚跑完,session.semanticReady)时问,问一次只剩几毫秒;
 * 没算过就等诊断跑完的通知(Monaco 的 onMarkerChanged 也会重新触发)。诊断该跑的时候还没跑(没装诊断、
 * 大文档只做语法检查)才自己问,那时用户已经停手一阵了。
 */
export function codeActionsLightbulb(
    view: EditorView,
    opts: TSCodeActionsOptions,
): () => void {
    const btn = document.createElement('div')
    btn.className = 'cm-lightbulb codicon codicon-light-bulb'
    btn.setAttribute('role', 'button')
    btn.title = `Show Code Actions (${/Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? '⌘.' : 'Ctrl+.'})`
    btn.textContent = '\uea61' // codicon light-bulb 码位,字体由 .codicon[class*="codicon-"] 给
    btn.style.display = 'none'
    view.dom.appendChild(btn)

    const session = getTSService(opts)
    let timer: ReturnType<typeof setTimeout> | null = null
    let fallback: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    // 当前显示在哪(行号 + 行内列,Monaco 的 content widget 按行列定位,编辑后不跟着挪);滚动时据此重新定位
    let shown: { kind: 'inline' | 'gutter', line: number, col: number } | null = null
    // 这一版文档上自动请求超过时限被中断过:别再问,等文档变
    let timedOut: unknown = null

    const hide = () => { btn.style.display = 'none'; shown = null }
    const focused = () => view.dom.ownerDocument.activeElement === view.contentDOM || view.contentDOM.contains(view.dom.ownerDocument.activeElement)

    const layout = () => {
        if (!shown) return
        const doc = view.state.doc
        const l = doc.line(Math.min(shown.line, doc.lines))
        const c = view.caretCoords(Math.min(l.to, l.from + shown.col))
        if (!c) { btn.style.display = 'none'; return } // 滚出视口
        const er = view.dom.getBoundingClientRect()
        const vr = view.scrollDOM.getBoundingClientRect()
        // Monaco 的灯泡是行盒顶上的 16×16(gutter 里 20×20),不是字形盒
        const top = vr.top + view.lineBlockAt(l.from).top - view.scrollDOM.scrollTop
        if (c.bottom <= vr.top || c.top >= vr.bottom) { btn.style.display = 'none'; return }
        btn.style.display = ''
        btn.classList.toggle('cm-lightbulb-gutter', shown.kind === 'gutter')
        let left = c.left - er.left
        if (shown.kind === 'gutter') {
            const g = view.dom.querySelector('.cm-gutters')
            left = g ? g.getBoundingClientRect().left - er.left : 0
        }
        btn.style.left = `${Math.max(0, left)}px`
        btn.style.top = `${top - er.top}px`
    }

    const place = () => {
        const state = view.state
        const head = state.selection.main.head
        const line = state.doc.lineAt(head)
        const textOf = (n: number) => state.doc.line(n).text
        const firstNonWs = line.text.search(/\S/)
        const indentEnd = line.from + (firstNonWs < 0 ? line.text.length : firstNonWs)
        const c0 = view.caretCoords(line.from)
        const c1 = view.caretCoords(indentEnd)
        const indentPx = c0 && c1 ? c1.left - c0.left : 0
        const cw = (() => {
            const a = view.caretCoords(line.from)
            const b = line.length ? view.caretCoords(line.from + 1) : null
            return a && b && b.left > a.left ? b.left - a.left : 8
        })()
        const folded = (n: number) => {
            if (n <= 2) return false
            const a = view.caretCoords(state.doc.line(n).from)
            const b = view.caretCoords(state.doc.line(n - 1).from)
            return !!a && !!b && a.top === b.top
        }
        const r = lightbulbPlacement({ text: textOf, count: state.doc.lines, folded }, line.number, head - line.from + 1, indentPx, cw)
        if (!r) { hide(); return }
        shown = r.kind === 'gutter' ? { kind: 'gutter', line: r.line, col: 0 } : { kind: 'inline', line: r.line, col: r.column - 1 }
        layout()
    }

    const off = () => (budgetForState(view.state).lightbulbDebounceMs <= 0 || view.state.readOnly) // XL 文档关灯泡;只读没有 code action

    // 到点:选区 → marker code → (语义诊断已缓存时)问 TS。force = 等诊断等过头了,自己算
    const run = async (my: number, force: boolean) => {
        const state = view.state
        const range = lightbulbTriggerRange(state)
        const codes = range ? markerCodesAt(state, range.from, range.to) : []
        if (!range || !codes.length) { hide(); return }
        session.update(materializeDoc(state))
        const svc = session.service()
        if (!force && !session.semanticReady()) {
            // 诊断(按它自己的防抖)跑完会通知,那时再触发;一直没来就自己算
            if (fallback) clearTimeout(fallback)
            fallback = setTimeout(() => { fallback = null; if (my === seq) void run(my, true) }, budgetForState(state).diagDebounceMs + AUTO_TRIGGER_DELAY)
            return
        }
        if (timedOut === view.state.doc) { hide(); return }
        // 先同步 program(按改动重解析,和诊断 / 悬停共用;冷启动第一次要建 lib),单独一个任务,不算进时限;
        // 让一帧再做检查
        try { await svc.$warm() } catch { return }
        await new Promise(r => setTimeout(r, 0))
        if (my !== seq || !view.dom.isConnected) return
        if (materializeDoc(view.state) !== materializeDoc(state)) return // 期间文档变了:等它的 schedule
        const docAt = view.state.doc
        const list = await session.withDeadline(AUTO_QUICKFIX_DEADLINE_MS, s => quickFixesAt(s, session.fileName, view.state, range, codes))
        if (my !== seq || !view.dom.isConnected || view.state.doc !== docAt) return // 等结果期间文档变了:丢弃,等它的 schedule
        if (!list) { timedOut = view.state.doc; hide(); return }
        if (!list.length) { hide(); return }
        place()
    }

    const schedule = () => {
        if (timer) clearTimeout(timer)
        if (fallback) { clearTimeout(fallback); fallback = null }
        const my = ++seq
        if (off() || !focused()) { hide(); return } // 没焦点不显示
        timer = setTimeout(() => { timer = null; void run(my, false) }, AUTO_TRIGGER_DELAY)
    }

    btn.addEventListener('mousedown', e => {
        e.preventDefault() // 不抢编辑器焦点(Monaco 点灯泡后 editor.focus())
        e.stopPropagation()
    })
    // Monaco LightBulbWidget:菜单 x = 点击处,y = 灯泡底 + floor(行高 / 3)(灯泡在光标上一行时再加一行)
    btn.addEventListener('click', e => {
        const r = btn.getBoundingClientRect()
        const head = view.state.selection.main.head
        const lh = view.lineBlockAt(head).height || r.height
        let pad = Math.floor(lh / 3)
        if (shown && shown.line < view.state.doc.lineAt(head).number) pad += lh
        const at = { x: e.clientX, y: r.bottom + pad }
        void (async () => {
            if (view.state.readOnly) return
            const docAt = view.state.doc
            const list = await collectCodeActionsAt(view, opts)
            if (!list.length) return
            const picked = await pickQuickFix(view, list, at)
            if (picked && view.state.doc === docAt) applyEdits(view, picked.edits)
        })()
    })

    const offTr = view.onTransaction((tr) => {
        // Monaco LightBulbWidget:内容变了、灯泡那一行已经不在(行号 >= 行数)就藏
        if (tr.docChanged && shown && shown.line >= view.state.doc.lines) hide()
        const markersChanged = tr.startState.field(diagnosticsField, false) !== view.state.field(diagnosticsField, false)
            || tr.startState.field(tsTagField, false) !== view.state.field(tsTagField, false)
        if (tr.docChanged || tr.selection || markersChanged) schedule()
    })
    // 诊断跑完(Monaco onMarkerChanged → _tryAutoTrigger,同样重新计时)
    const offSem = session.onSemanticChecked(schedule)
    const offGeom = view.onGeometry(layout)
    const onScroll = () => layout()
    const onFocus = () => schedule()
    const onBlur = () => { if (timer) clearTimeout(timer); timer = null; seq++ }
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    view.contentDOM.addEventListener('focus', onFocus)
    view.contentDOM.addEventListener('blur', onBlur)
    schedule()

    return () => {
        if (timer) clearTimeout(timer)
        if (fallback) clearTimeout(fallback)
        seq++
        offTr()
        offSem()
        offGeom()
        view.scrollDOM.removeEventListener('scroll', onScroll)
        view.contentDOM.removeEventListener('focus', onFocus)
        view.contentDOM.removeEventListener('blur', onBlur)
        btn.remove()
    }
}
