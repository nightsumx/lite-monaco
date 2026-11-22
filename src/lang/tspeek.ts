// Peek 面板 —— 照 Monaco ReferenceWidget:目标行下面一个 view zone,里面是标题栏 + 左边只读预览编辑器 + 右边引用树。

import { EditorView, decorations } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { EditorState, Facet, StateEffect, StateField, type Extension } from '../core/model/state'
import { Decoration, type DecorationSet } from '../core/model/decoration'
import { RangeSet } from '../core/model/rangeset'
import type { LocRow } from './tsactions'
import { lineNumberAt, lineStartsOf } from './tsbudget'
import { getOption } from '../core/options'
import { ReferencesModel } from './referencesmodel'

export interface PeekLocation extends LocRow {
    /** 全文(本文件或 VFS);拿不到是 null */
    text: string | null
}

export interface PeekOptions {
    /** 结果集的名字(Monaco ReferencesModel.title):References / Definitions / Type Definitions / Implementations */
    title: string
    locations: PeekLocation[]
    /** 本编辑器的文件(找最近的引用时先比路径前缀,同 Monaco nearestReference) */
    file?: string
    /** 本编辑器的文件是自动取名的(Monaco inmemory model):标题不显示它的路径,显示 "References" */
    inMemory?: boolean
    /** 面板位置(文档 offset);默认选区起点 */
    anchor?: number
    /** Monaco peekMode:双击引用在 peek 里跳过去(true),还是关掉 peek 选中它(false) */
    peekMode?: boolean
}

/** 预览编辑器:liteMonaco() 装的是同一个高亮器 / 主题 / 语言的只读编辑器;没装时用裸 EditorView */
export type PeekPreview = (parent: HTMLElement, doc: string, extensions: Extension[]) => EditorView
export const peekPreview = Facet.define<PeekPreview, PeekPreview | null>({ combine: vs => vs[0] ?? null })

// 预览里同文件的各处引用(Monaco .reference-decoration)
const refMark = Decoration.mark({ class: 'cm-peek-match' })
const setRefMarks = StateEffect.define<{ from: number, to: number }[]>()
const refMarks = StateField.define<DecorationSet>({
    create: () => RangeSet.empty,
    update: (v, tr) => {
        for (const e of tr.effects) if (e.is(setRefMarks)) return RangeSet.of(e.value.map(r => refMark.range(r.from, r.to)), true)
        return tr.docChanged ? v.map(tr.changes) : v
    },
})

// Monaco layoutData:预览和列表的比例跨 peek 沿用
const layoutData = { ratio: 0.7 }

// TS wordPattern 的分隔符(`$` 算词内),给列表的行预览往回找词头
const SEPARATORS = '`~!@#%^&*()-=+[{]}\\|;:\'",.<>/?'
const isWordChar = (c: string | undefined) => c != null && c !== ' ' && c !== '\t' && !SEPARATORS.includes(c)

// 每个编辑器至多一个 peek;close 摘 DOM、退监听(绑 view 生命周期,destroy 时自动关)
const peeks = new Map<EditorView, { close: () => void, where: () => number }>()

/** 关掉某个编辑器的 peek;不给 view → 全关 */
export function closePeek(view?: EditorView): void {
    if (view) { peeks.get(view)?.close(); return }
    for (const p of [...peeks.values()]) p.close()
}

/** 这个编辑器当前有没有打开 peek */
export function peekOpen(view: EditorView): boolean {
    return peeks.has(view)
}

// Monaco revealRangeInCenter(viewLines._computeScrollTopToRevealRange,Center)
function revealInCenter(view: EditorView, pos: number) {
    const h = view.scrollDOM.clientHeight
    if (!h) return
    const { top, bottom } = view.lineBlockAt(pos)
    const lh = view.oracle.lineHeight
    const context = lh > 0 ? Math.min(h / lh / 2, view.revealSurroundingLines) : 0
    const boxStart = top - context * lh
    const boxEnd = bottom + Math.max(0, context - 1) * lh
    view.scrollDOM.scrollTop = Math.max(0, (boxStart + boxEnd) / 2 - h / 2)
}

export function showPeek(view: EditorView, opts: PeekOptions): void {
    // Monaco toggleWidget:在当前 peek 的位置上再开一次 = 关掉
    const prior = peeks.get(view)?.where()
    closePeek(view)
    const sel = view.state.selection.main
    if (prior != null && prior >= sel.from && prior <= sel.to) return
    const lineOf = (r: PeekLocation, pos: number) => {
        if (r.local) {
            const l = view.state.doc.lineAt(Math.min(pos, view.state.doc.length))
            return { number: l.number, from: l.from, text: l.text }
        }
        const text = r.text ?? ''
        const starts = lineStartsOf(text)
        const n = lineNumberAt(starts, pos)
        let end = n < starts.length ? starts[n] - 1 : text.length
        if (text[end - 1] === '\r') end--
        return { number: n, from: starts[n - 1], text: text.slice(starts[n - 1], end) }
    }
    // Monaco ReferencesModel:按文件、位置排序,去掉重复的,按文件分组;refs 是排好序的引用,groups[].refs 是它们的下标
    const model = new ReferencesModel(opts.locations.map(loc => {
        const a = lineOf(loc, loc.start)
        const b = lineOf(loc, loc.start + loc.length)
        return { uri: loc.file, loc, range: { startLineNumber: a.number, startColumn: loc.start - a.from + 1, endLineNumber: b.number, endColumn: loc.start + loc.length - b.from + 1 } }
    }), opts.title)
    if (model.isEmpty) return
    const refs = model.references.map(o => ({ ...o.link.loc }))
    const index = new Map(model.references.map((o, i) => [o, i]))
    const groups = model.groups.map(g => ({ file: String(g.uri), refs: g.children.map(o => index.get(o)!) }))
    const groupOf = (i: number) => groups.findIndex(g => g.refs.includes(i))

    // Monaco FilePreview.preview:起点往前 8 列所在的词开头 + 引用 + 行的其余部分,去掉首尾空白
    const preview = (r: PeekLocation) => {
        const a = lineOf(r, r.start)
        const end = r.start + r.length
        const b = lineOf(r, end)
        let w = Math.max(0, r.start - a.from - 8)
        while (w > 0 && isWordChar(a.text[w - 1])) w--
        return {
            before: a.text.slice(w, r.start - a.from).trimStart(),
            inside: r.local ? view.state.sliceDoc(r.start, end) : (r.text ?? '').slice(r.start, end),
            after: b.text.slice(end - b.from).trimEnd(),
        }
    }
    // Monaco nearestReference:路径公共前缀最长的,再比 |行差| × 100 + |列差|
    const nearest = (pos: number) => {
        const here = view.state.doc.lineAt(pos)
        const self = opts.file ?? refs.find(r => r.local)?.file ?? ''
        const ref = model.nearestReference(self, { lineNumber: here.number, column: pos - here.from + 1 })
        return ref ? index.get(ref)! : 0
    }

    const sd = view.scrollDOM
    const lh = () => view.lineBlockAt(where).height || 20
    let where = Math.min(opts.anchor ?? sel.from, view.state.doc.length)
    // 树的行:单个文件只列引用;多个文件列文件行(展开的带子引用)。引用行 = 引用下标,文件行 = -1 - 组号
    let selected = nearest(where)
    let focused = selected
    const expanded = new Set<number>()

    const root = document.createElement('div')
    root.className = 'cm-peek'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', opts.title)
    const arrow = document.createElement('div')
    arrow.className = 'cm-peek-arrow'
    const box = document.createElement('div')
    box.className = 'cm-peek-box'
    const head = document.createElement('div')
    head.className = 'cm-peek-head'
    const titleEl = document.createElement('div')
    titleEl.className = 'cm-peek-title'
    const filename = document.createElement('span')
    filename.className = 'cm-peek-filename'
    const dirname = document.createElement('span')
    dirname.className = 'cm-peek-dirname'
    const meta = document.createElement('span')
    meta.className = 'cm-peek-meta'
    meta.textContent = `${opts.title} (${refs.length})`
    titleEl.append(filename, dirname, meta)
    const actions = document.createElement('div')
    actions.className = 'cm-peek-actions'
    const closeBtn = document.createElement('a')
    closeBtn.className = 'cm-peek-close codicon codicon-close'
    closeBtn.setAttribute('role', 'button')
    closeBtn.title = 'Close'
    actions.append(closeBtn)
    head.append(titleEl, actions)
    const body = document.createElement('div')
    body.className = 'cm-peek-body'
    const previewHost = document.createElement('div')
    previewHost.className = 'cm-peek-preview'
    const sash = document.createElement('div')
    sash.className = 'cm-peek-sash'
    const tree = document.createElement('div')
    tree.className = 'cm-peek-tree'
    tree.tabIndex = 0
    tree.setAttribute('role', 'tree')
    // 列表字号同 Monaco:继承宿主页面(不是编辑器的 12px)
    const host = view.dom.parentElement
    if (host) tree.style.fontSize = getComputedStyle(host).fontSize
    body.append(previewHost, sash, tree)
    box.append(head, body)
    root.append(arrow, box)
    view.dom.appendChild(root)

    // 高 18 行(不超过 max(12, 视口行数 × 0.8));箭头 round(lh/3),上下各让出一个箭头高;标题栏 ceil(lh × 1.2);宽到正文右缘
    const zoneHeight = () => Math.min(18, Math.max(12, (sd.clientHeight / lh()) * 0.8)) * lh()
    let zone = 0
    let zoneLine = 0
    let previewW = 0
    const layout = () => {
        const h = zoneHeight()
        const line = view.state.doc.lineAt(where)
        if (h !== zone || line.number !== zoneLine) {
            zone = h
            zoneLine = line.number
            view.setViewZone('peek', { afterLine: line.number, height: h })
        }
        const er = view.dom.getBoundingClientRect()
        const sr = sd.getBoundingClientRect()
        const arrowH = Math.round(lh() / 3)
        const headH = Math.ceil(lh() * 1.2)
        const width = sr.right - er.left
        root.style.top = `${sr.top - er.top + view.lineBlockAt(where).bottom - sd.scrollTop}px`
        root.style.width = `${width}px`
        root.style.height = `${h}px`
        // 箭头指着 where(第 1 列挪到第 2 列,同 Monaco)
        const at = view.caretCoords(where === line.from && line.length > 0 ? where + 1 : where)
        arrow.style.left = `${(at ? at.left : sr.left) - er.left - arrowH}px`
        arrow.style.borderWidth = `${arrowH}px`
        arrow.style.top = `-${arrowH}px`
        box.style.top = `${arrowH}px`
        box.style.height = `${h - 2 * arrowH}px`
        head.style.height = `${headH}px`
        titleEl.style.lineHeight = `${headH}px`
        body.style.height = `${Math.round(h - 2 * arrowH - (headH + 2))}px`
        // SplitView:预览至少 200,列表至少 100
        previewW = Math.max(200, Math.min(width - 100, Math.round(width * layoutData.ratio)))
        previewHost.style.width = `${previewW}px`
        sash.style.left = `${previewW - 2}px`
    }
    // Monaco ZoneWidget._showImpl → revealRange([行 L, 行 L+1 第 1 列], Simple)(末行用 revealLineNearTop)。
    // viewLines._computeScrollTopToRevealRange:上留 context 行,下到行 L+1 底(zone 把它推到面板下面)再留
    // context-1 行 + 1 行(Simple);context = sticky scroll 的行数(view.revealSurroundingLines)。
    const revealZone = () => {
        const lb = view.lineBlockAt(where)
        const h = sd.clientHeight
        const context = Math.min(h / lh() / 2, view.revealSurroundingLines)
        const isLast = view.state.doc.lineAt(where).number === view.state.doc.lines
        const boxStart = lb.top - context * lh()
        const st = sd.scrollTop
        let next = st
        if (isLast) {
            const boxEnd = lb.bottom + Math.max(0, context - 1) * lh()
            next = Math.max(boxEnd - h, boxStart - Math.max(5 * lh(), h * 0.2))
        }
        else {
            const boxEnd = lb.bottom + zoneHeight() + lh() + Math.max(0, context - 1) * lh() + lh()
            if (boxEnd - boxStart > h || boxStart < st) next = boxStart
            else if (boxEnd > st + h) next = boxEnd - h
        }
        if (next !== st) sd.scrollTop = Math.max(0, next)
    }

    let pv: EditorView | null = null
    let pvFile: string | null = null
    const makePreview = (i: number) => {
        const r = refs[i]
        pv?.destroy()
        previewHost.textContent = ''
        const doc = r.local ? view.state.sliceDoc() : r.text ?? ''
        const ext: Extension[] = [refMarks, decorations.of(s => s.field(refMarks)), EditorState.readOnly.of(true)]
        const factory = view.state.facet(peekPreview)
        const p = factory
            ? factory(previewHost, doc, ext)
            : new EditorView({ state: EditorState.create({ doc, extensions: ext }), parent: previewHost, lineNumbers: true, drawSelection: true })
        pv = p
        pvFile = r.file
        const marks = groups[groupOf(i)].refs.map(k => refs[k]).filter(x => x.length > 0 && x.start + x.length <= doc.length)
        p.dispatch(p.state.update({ effects: setRefMarks.of(marks.map(x => ({ from: x.start, to: x.start + x.length }))) }))
        // Monaco 预览里双击 = open:关掉 peek,本文件的话光标落到双击处
        p.dom.addEventListener('mousedown', e => {
            if (e.detail !== 2) return
            const pos = p.posAtCoords({ x: e.clientX, y: e.clientY })
            setTimeout(() => {
                close()
                view.focus()
                if (!r.local || pos == null) return
                view.dispatch(view.state.update({ selection: EditorSelection.cursor(Math.min(pos, view.state.doc.length)), userEvent: 'select' }))
                revealInCenter(view, view.state.selection.main.head)
            })
        })
    }
    // Monaco _revealReference:标题换成引用所在文件,预览换文件或挪到引用处(光标收到起点,居中),列表选中它
    const reveal = (i: number) => {
        const r = refs[i]
        selected = i
        focused = i
        const g = groupOf(i)
        if (groups.length > 1 && !expanded.has(g)) { expanded.add(g); renderTree() }
        const slash = r.file.lastIndexOf('/')
        filename.textContent = r.local && opts.inMemory ? 'References' : r.file.slice(slash + 1)
        dirname.textContent = r.local && opts.inMemory ? '' : r.file.slice(0, slash) || '/'
        if (pvFile !== r.file || !pv) makePreview(i)
        if (pv) {
            const at = Math.min(r.start, pv.state.doc.length)
            pv.dispatch(pv.state.update({ selection: EditorSelection.cursor(at), userEvent: 'select' }))
            revealInCenter(pv, at)
        }
        paintTree()
    }
    // Monaco _gotoReference:编辑器光标到引用起点(居中),peek 挪到那一行(ZoneWidget.show 把选区设成 where),焦点回列表。
    // standalone 打不开别的文件 → 关掉
    const gotoRef = (i: number) => {
        const r = refs[i]
        if (!r.local) { close(); view.focus(); return }
        const at = Math.min(r.start, view.state.doc.length)
        where = at
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(at), userEvent: 'select' }))
        revealInCenter(view, at)
        layout()
        revealZone()
        layout()
        tree.focus()
    }
    // Monaco openReference:关掉 peek,选中整个引用
    const openRef = (i: number) => {
        const r = refs[i]
        close()
        view.focus()
        if (!r.local) return
        const len = view.state.doc.length
        view.dispatch(view.state.update({ selection: EditorSelection.range(Math.min(r.start, len), Math.min(r.start + r.length, len)), userEvent: 'select' }))
        revealInCenter(view, view.state.selection.main.from)
    }

    const rowEls = new Map<number, HTMLElement>()
    const rows = () => groups.length === 1
        ? refs.map((_, i) => i)
        : groups.flatMap((g, gi) => [-1 - gi, ...(expanded.has(gi) ? g.refs : [])])
    const toggle = (g: number) => {
        if (expanded.has(g)) expanded.delete(g)
        else expanded.add(g)
        renderTree()
    }
    function renderTree() {
        tree.textContent = ''
        rowEls.clear()
        for (const k of rows()) {
            const row = document.createElement('div')
            row.setAttribute('role', 'treeitem')
            if (k < 0) {
                const g = groups[-1 - k]
                const slash = g.file.lastIndexOf('/')
                const mem = refs[g.refs[0]].local && opts.inMemory
                row.className = 'cm-peek-file'
                row.setAttribute('aria-expanded', String(expanded.has(-1 - k)))
                const twistie = document.createElement('span')
                twistie.className = `cm-peek-twistie codicon codicon-chevron-${expanded.has(-1 - k) ? 'down' : 'right'}`
                const name = document.createElement('span')
                name.className = 'cm-peek-file-name'
                name.textContent = mem ? 'References' : g.file.slice(slash + 1)
                const dir = document.createElement('span')
                dir.className = 'cm-peek-file-dir'
                dir.textContent = mem ? '' : g.file.slice(0, slash) || '/'
                const count = document.createElement('span')
                count.className = 'cm-peek-count'
                count.textContent = String(g.refs.length)
                row.append(twistie, name, dir, count)
            } else {
                const p = preview(refs[k])
                row.className = groups.length === 1 ? 'cm-peek-ref' : 'cm-peek-ref cm-peek-ref-child'
                const hl = document.createElement('span')
                hl.className = 'cm-peek-hl'
                hl.textContent = p.inside
                row.append(p.before, hl, p.after)
            }
            // 单击显示,双击跳过去(peekMode)或打开
            row.addEventListener('mousedown', e => {
                e.preventDefault()
                tree.focus()
                if (k < 0) { focused = k; toggle(-1 - k); return }
                if (e.detail === 2) { if (opts.peekMode) gotoRef(k); else openRef(k); return }
                reveal(k)
            })
            tree.append(row)
            rowEls.set(k, row)
        }
        paintTree()
    }
    function paintTree() {
        for (const [k, row] of rowEls) {
            row.classList.toggle('cm-peek-ref-selected', k === selected)
            row.classList.toggle('cm-peek-ref-focused', k === focused)
        }
        rowEls.get(focused)?.scrollIntoView?.({ block: 'nearest' })
    }
    // 列表键位(Monaco list):↑↓ 只挪焦点不换预览、到头不绕回;Enter 显示焦点那一处;文件行 Enter / ←→ 收起展开
    tree.addEventListener('keydown', e => {
        const list = rows()
        const at = list.indexOf(focused)
        let next = at
        if (e.key === 'ArrowDown') next = Math.min(list.length - 1, at + 1)
        else if (e.key === 'ArrowUp') next = Math.max(0, at - 1)
        else if (e.key === 'Home') next = 0
        else if (e.key === 'End') next = list.length - 1
        else if (e.key === 'Enter') {
            if (focused >= 0) reveal(focused)
            else toggle(-1 - focused)
        }
        else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && focused < 0) {
            if (expanded.has(-1 - focused) !== (e.key === 'ArrowRight')) toggle(-1 - focused)
        }
        else return
        e.preventDefault()
        e.stopPropagation()
        if (next !== at && next >= 0) { focused = list[next]; paintTree() }
    })

    // F4 / ⇧F4(peek 开着时 F12 / ⇧F12 也是):从 peek 位置最近的引用走到下一处 / 上一处(绕回),编辑器光标跟过去
    const step = (forward: boolean) => {
        const i = (nearest(where) + (forward ? 1 : -1) + refs.length) % refs.length
        const editorFocus = view.hasFocus
        const previewFocus = pv?.hasFocus ?? false
        reveal(i)
        gotoRef(i)
        if (editorFocus) view.focus()
        else if (previewFocus) pv?.focus()
    }
    const onKeyCapture = (e: KeyboardEvent) => {
        if ((e.key !== 'F4' && e.key !== 'F12') || e.altKey || e.ctrlKey || e.metaKey) return
        e.preventDefault()
        e.stopPropagation()
        step(!e.shiftKey)
    }
    // Esc:编辑器 / 预览自己没用掉(补全、查找没开)才关
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        close()
        view.focus()
    }
    view.dom.addEventListener('keydown', onKeyCapture, true)
    view.dom.addEventListener('keydown', onKey)
    closeBtn.addEventListener('mousedown', e => e.preventDefault())
    closeBtn.addEventListener('click', () => {
        close()
        view.focus()
    })
    // 正文里的滚轮不给外面的编辑器(预览 alwaysConsumeMouseWheel,列表自己滚)
    body.addEventListener('wheel', e => {
        if (pv && e.target instanceof Node && pv.dom.contains(e.target)) e.preventDefault()
        e.stopPropagation()
    }, { passive: false })
    // 拖 sash 改比例(Monaco SplitView;比例记在 layoutData,下次打开沿用)
    sash.addEventListener('mousedown', e => {
        e.preventDefault()
        const x0 = e.clientX
        const w0 = previewW
        const width = root.getBoundingClientRect().width
        const move = (m: MouseEvent) => {
            layoutData.ratio = Math.max(200, Math.min(width - 100, w0 + m.clientX - x0)) / width
            layout()
        }
        const up = () => {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
    })

    sd.addEventListener('scroll', layout, { passive: true })
    const offTr = view.onTransaction(tr => {
        if (tr.docChanged) {
            where = tr.changes.mapPos(where)
            for (const r of refs) {
                if (!r.local) continue
                const end = tr.changes.mapPos(r.start + r.length, -1)
                r.start = tr.changes.mapPos(r.start, 1)
                r.length = Math.max(0, end - r.start)
            }
            // 预览是本文件时跟着改(Monaco 预览和编辑器是同一个 model)
            if (pv && refs.find(r => r.file === pvFile)?.local) pv.dispatch(pv.state.update({ changes: tr.changes }))
            renderTree()
        }
        layout()
    })
    const offGeo = view.onGeometry(() => layout())
    let closed = false
    const offDestroy = view.onDestroy(() => close())
    function close() {
        if (closed) return
        closed = true
        view.dom.removeEventListener('keydown', onKeyCapture, true)
        view.dom.removeEventListener('keydown', onKey)
        sd.removeEventListener('scroll', layout)
        offTr()
        offGeo()
        offDestroy()
        pv?.destroy()
        view.setViewZone('peek', null)
        root.remove()
        if (peeks.get(view)?.close === close) peeks.delete(view)
    }
    peeks.set(view, { close, where: () => where })

    layout()
    revealZone()
    layout()
    renderTree()
    reveal(selected)
    tree.focus()
    // peekWidgetDefaultFocus: 'editor' → 打开后焦点在预览编辑器(默认 'tree' 在引用列表)
    if (getOption(view.state, 'peekWidgetDefaultFocus') === 'editor') (pv as EditorView | null)?.focus()
}

/** 把 LocRow + 取全文 变成 PeekLocation */
export function toPeekLocations(
    rows: LocRow[],
    getText: (file: string) => string | null,
): PeekLocation[] {
    return rows.map(r => ({ ...r, text: getText(r.file) }))
}
