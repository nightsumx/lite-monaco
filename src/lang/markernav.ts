// 标记导航浮窗(Monaco MarkerController + MarkerNavigationWidget,gotoError/browser/*)
//
// F8 / Alt+F8(下一个)、Shift+F8 / Shift+Alt+F8(上一个):在标记所在行下面开一块 zone —— 箭头 + 边框 + 标题栏
// (严重级图标、文件名、"n of m problems"、↓ ↑ ×)+ 正文(消息、source(code)、相关位置)。Esc / Shift+Esc 关(closeMarkersNavigation)。
//
// 数据读 diagnosticsField(不另起一套),只含 error / warning / info。排序同 Monaco 独立编辑器(没有 problems.sortOrder 配置):
// 严重级优先(error → warning → info),同级按位置。光标收到标记起点(或已在标记里就不动),并滚到靠近顶部。
import type { EditorView } from '../core/view/editorview'
import { EditorSelection } from '../core/model/selection'
import { Facet } from '../core/model/state'
import { diagnosticsField, markerNavigation } from '../core/feature/diagnostics'
import type { Diagnostic, Severity } from '../core/chrome/ruler'
import { wordAtPosition } from '../core/edit/words'
import { detectKeyOS } from '../core/keyos'

export interface MarkerNavigationOptions {
    /** 标题栏的文件名(Monaco basename(model.uri));不给就不显示 */
    title?: () => string
}
export const markerNavigationTitle = Facet.define<() => string, (() => string) | null>({ combine: v => v[0] ?? null })

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

interface Marker { d: Diagnostic, from: number, to: number }

/** Monaco MarkerList 的排序 + 过滤:只要 error / warning / info;严重级优先,同级按起点 */
export function listMarkers(diags: readonly Diagnostic[]): Marker[] {
    return diags
        .filter(d => d.severity in RANK)
        .map(d => ({ d, from: d.from, to: d.to }))
        .sort((a, b) => RANK[a.d.severity] - RANK[b.d.severity] || a.from - b.from || a.to - b.to)
}

const controllers = new WeakMap<EditorView, Controller>()

class Controller {
    markers: Marker[] = []
    /** MarkerList._nextIdx */
    nextIdx = -1
    root: HTMLElement | null = null
    // 浮窗状态
    position = 0
    markerIdx = 0
    private parts: {
        arrow: HTMLElement, box: HTMLElement, head: HTMLElement, titleIcon: HTMLElement, filename: HTMLElement, meta: HTMLElement,
        body: HTMLElement, container: HTMLElement, message: HTMLElement, related: HTMLElement,
    } | null = null
    private lines = 1
    private offs: (() => void)[] = []
    private fieldRef: readonly Diagnostic[] | null = null

    constructor(readonly view: EditorView) {
        view.onDestroy(() => this.dispose())
    }

    get visible() { return !!this.root }

    private refresh() {
        const diags = this.view.state.field(diagnosticsField, false) ?? []
        this.fieldRef = diags
        this.markers = listMarkers(diags)
    }

    /** Monaco MarkerList._initIdx(单文件) */
    private initIdx(pos: number, fwd: boolean) {
        let found = false
        for (let i = 0; i < this.markers.length; i++) {
            let { from, to } = this.markers[i]
            if (from === to) {
                const w = wordAtPosition(this.view.state, from)
                if (w) { from = w.from; to = w.to }
            }
            if ((from <= pos && pos <= to) || pos <= from) { this.nextIdx = i; found = true; break }
        }
        if (!found) this.nextIdx = fwd ? 0 : this.markers.length - 1
        if (this.nextIdx < 0) this.nextIdx = this.markers.length - 1
    }

    /** MarkerList.move:true = 选中的标记变了 */
    private move(fwd: boolean, pos: number): boolean {
        const n = this.markers.length
        if (!n) return false
        const old = this.nextIdx
        if (this.nextIdx === -1) this.initIdx(pos, fwd)
        else this.nextIdx = fwd ? (this.nextIdx + 1) % n : (this.nextIdx - 1 + n) % n
        return old !== this.nextIdx
    }

    navigate(next: boolean): boolean {
        this.refresh()
        if (!this.markers.length) { this.close(false); return false }
        this.ensureSession()
        this.move(next, this.view.state.selection.main.head)
        const m = this.markers[this.nextIdx]
        if (!m) return false
        this.showAtMarker(m, this.nextIdx + 1, this.markers.length)
        return true
    }

    /** Monaco showAtMarker(marker):从标记起点找到它在列表里的位置再显示 */
    showAt(pos: number): boolean {
        this.refresh()
        if (!this.markers.length) return false
        this.ensureSession()
        // 优先选正好包着 pos 的标记(混合严重级时 Monaco 的 _initIdx 可能选到别处);没有再按 _initIdx 找下一个
        const exact = this.markers.findIndex(m => m.from <= pos && pos <= m.to)
        if (exact >= 0) this.nextIdx = exact
        else { this.nextIdx = -1; this.move(true, pos) }
        const m = this.markers[this.nextIdx]
        if (!m) return false
        this.showAtMarker(m, this.nextIdx + 1, this.markers.length)
        return true
    }

    private ensureSession() {
        if (this.root) return
        this.build()
        const v = this.view
        // 光标移出选中标记 → resetIndex(下一次 F8 从光标位置重新找)
        const offTr = v.onTransaction(tr => {
            if (!this.root) return
            if (tr.docChanged) this.position = tr.changes.mapPos(this.position, 1)
            const cur = this.markers[this.nextIdx]
            if (tr.selection || tr.docChanged) {
                const h = v.state.selection.main.head
                if (!cur || h < cur.from || h > cur.to) this.nextIdx = -1
            }
            // 标记变了(或文档编辑把它们映射了):按浮窗位置找标记,找到就更新内容,否则标灰(stale)
            const diags = v.state.field(diagnosticsField, false) ?? []
            if (diags !== this.fieldRef) {
                this.refresh()
                const hit = this.markers.findIndex(m => m.from <= this.position && this.position <= m.to)
                if (hit >= 0) { this.markerIdx = hit + 1; this.updateMarker(this.markers[hit]) }
                else this.showStale()
            }
            this.layout()
        })
        const offGeo = v.onGeometry(() => this.layout())
        this.offs.push(offTr, offGeo)
    }

    private build() {
        const doc = this.view.dom.ownerDocument
        const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement) => {
            const e = doc.createElement(tag)
            e.className = cls
            parent?.appendChild(e)
            return e
        }
        const root = el('div', 'cm-peek cm-marker-nav')
        const arrow = el('div', 'cm-peek-arrow', root)
        const box = el('div', 'cm-peek-box', root)
        const head = el('div', 'cm-peek-head', box)
        const titleEl = el('div', 'cm-peek-title', head)
        const titleIcon = el('span', 'cm-marker-nav-icon codicon', titleEl)
        const filename = el('span', 'cm-peek-filename', titleEl)
        const meta = el('span', 'cm-peek-meta', titleEl)
        const actions = el('div', 'cm-peek-actions', head)
        // Monaco ActionBar:role=toolbar,每个动作是带名字(含键帽)的 button
        actions.setAttribute('role', 'toolbar')
        actions.setAttribute('aria-orientation', 'horizontal')
        // 标题栏动作(MarkerNavigationWidget.TitleMenu):下一个、上一个,再是 PeekViewWidget 的关闭
        const mac = detectKeyOS(doc.defaultView?.navigator.platform ?? '') === 'mac'
        const mkAction = (cls: string, title: string, run: () => void) => {
            const a = el('a', `cm-peek-action codicon ${cls}`, actions)
            a.setAttribute('role', 'button')
            a.setAttribute('aria-label', title)
            a.title = title
            a.addEventListener('mousedown', e => e.preventDefault())
            a.addEventListener('click', e => { e.preventDefault(); run(); this.view.focus() })
            return a
        }
        mkAction('codicon-arrow-down cm-marker-nav-next', `Go to Next Problem (Error, Warning, Info) (${mac ? '⌥F8' : 'Alt+F8'})`, () => { this.navigate(true) })
        mkAction('codicon-arrow-up cm-marker-nav-prev', `Go to Previous Problem (Error, Warning, Info) (${mac ? '⇧⌥F8' : 'Shift+Alt+F8'})`, () => { this.navigate(false) })
        const closeBtn = mkAction('codicon-close cm-peek-close', 'Close', () => this.close(true))
        closeBtn.setAttribute('aria-label', 'Close')
        const body = el('div', 'cm-peek-body cm-marker-nav-body', box)
        body.tabIndex = 0
        body.setAttribute('role', 'tooltip')
        const container = el('div', 'cm-marker-nav-container', body)
        const message = el('div', 'cm-marker-nav-message', container)
        message.setAttribute('aria-live', 'assertive')
        message.setAttribute('role', 'alert')
        const related = el('div', 'cm-marker-nav-related', container)
        related.addEventListener('click', e => {
            const t = e.target as HTMLElement
            const idx = t.dataset?.relatedIndex
            if (idx == null) return
            e.preventDefault()
            const r = this.markers[this.markerIdx - 1]?.d.related?.[Number(idx)]
            if (r?.same) {
                const line = this.view.state.doc.line(Math.max(1, Math.min(this.view.state.doc.lines, r.line)))
                const pos = Math.min(line.to, line.from + Math.max(0, r.col - 1))
                this.close(false)
                this.view.dispatch(this.view.state.update({ selection: EditorSelection.single(pos), scrollIntoView: true, userEvent: 'select' }))
                this.view.focus()
            }
        })
        this.view.dom.appendChild(root)
        this.root = root
        this.parts = { arrow, box, head, titleIcon, filename, meta, body, container, message, related }
        // Esc / Shift+Esc = closeMarkersNavigation(优先于其它 Esc 处理)
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.altKey || e.ctrlKey || e.metaKey) return
            e.preventDefault()
            e.stopPropagation()
            this.close(true)
        }
        this.view.dom.addEventListener('keydown', onKey, true)
        this.offs.push(() => this.view.dom.removeEventListener('keydown', onKey, true))
    }

    private fill(m: Marker) {
        const p = this.parts!
        const { message, source, code, related } = m.d
        const lines = (message ?? '').split(/\r\n|\r|\n/)
        p.message.textContent = ''
        let last: HTMLElement = p.message
        for (const line of lines) {
            last = this.view.dom.ownerDocument.createElement('div')
            last.textContent = line
            if (line === '') last.style.height = '1em'
            p.message.appendChild(last)
        }
        if (source || code) {
            const details = this.view.dom.ownerDocument.createElement('span')
            details.className = 'cm-marker-nav-details'
            if (source) {
                const s = this.view.dom.ownerDocument.createElement('span')
                s.className = 'cm-marker-nav-source'
                s.textContent = source
                details.appendChild(s)
            }
            if (code) {
                const c = this.view.dom.ownerDocument.createElement('span')
                c.className = 'cm-marker-nav-code'
                c.textContent = `(${code})`
                details.appendChild(c)
            }
            last.appendChild(details)
        }
        p.message.setAttribute('aria-label', this.ariaLabel(m))
        p.related.textContent = ''
        this.lines = lines.length
        if (related?.length) {
            const wrap = this.view.dom.ownerDocument.createElement('div')
            wrap.className = 'cm-marker-nav-related-list'
            this.lines += 1
            related.forEach((r, i) => {
                const row = this.view.dom.ownerDocument.createElement('div')
                const a = this.view.dom.ownerDocument.createElement('a')
                a.className = 'cm-marker-nav-filename'
                a.textContent = `${r.file}(${r.line}, ${r.col}): `
                a.dataset.relatedIndex = String(i)
                const t = this.view.dom.ownerDocument.createElement('span')
                t.textContent = r.message
                row.append(a, t)
                wrap.appendChild(row)
                this.lines += 1
            })
            p.related.appendChild(wrap)
        }
        this.lines = Math.min(17, this.lines)
    }

    private ariaLabel(m: Marker): string {
        const sev = m.d.severity === 'error' ? 'Error' : m.d.severity === 'warning' ? 'Warning' : 'Info'
        const line = this.view.state.doc.lineAt(Math.min(m.from, this.view.state.doc.length))
        return `${line.text}, ${sev} at ${line.number}:${m.from - line.from + 1}. `
    }

    private showAtMarker(m: Marker, idx: number, total: number) {
        const p = this.parts!
        const root = this.root!
        root.classList.remove('stale')
        this.markerIdx = idx
        this.fill(m)
        root.classList.remove('cm-marker-nav-error', 'cm-marker-nav-warning', 'cm-marker-nav-info')
        root.classList.add(`cm-marker-nav-${m.d.severity}`)
        // 光标已在标记里就留着,否则收到标记起点
        const head = this.view.state.selection.main.head
        const pos = m.from <= head && head <= m.to ? head : m.from
        this.position = pos
        const title = this.view.state.facet(markerNavigationTitle)?.() ?? ''
        p.filename.textContent = title
        p.meta.textContent = total > 1 ? `${idx} of ${total} problems` : `${idx} of ${total} problem`
        if (!title) p.meta.classList.add('cm-marker-nav-notitle'); else p.meta.classList.remove('cm-marker-nav-notitle')
        p.titleIcon.className = `cm-marker-nav-icon codicon codicon-${m.d.severity}`
        this.view.dispatch(this.view.state.update({ selection: EditorSelection.single(pos), userEvent: 'select' }))
        this.layout()
        this.revealNearTop(pos)
        this.view.focus()
    }

    private updateMarker(m: Marker) {
        this.root?.classList.remove('stale')
        this.fill(m)
        this.layout()
    }

    private showStale() {
        this.root?.classList.add('stale')
        this.layout()
    }

    private lh() { return this.view.lineBlockAt(Math.min(this.position, this.view.state.doc.length)).height || 20 }

    /** Monaco editor.revealPositionNearTop */
    private revealNearTop(pos: number) {
        const sd = this.view.scrollDOM
        const lb = this.view.lineBlockAt(pos)
        const h = sd.clientHeight
        const top = sd.scrollTop
        if (h && lb.top >= top && lb.bottom + this.zoneHeight() <= top + h && lb.top - top < h / 2) return
        sd.scrollTop = Math.max(0, lb.top - h / 5)
    }

    /** 3 + 消息行数(最多 17),不超过 max(12, 视口行数 × 0.8) */
    private zoneHeight() {
        const lh = this.lh()
        const want = 3 + this.lines
        const max = Math.max(12, (this.view.scrollDOM.clientHeight / lh) * 0.8)
        return Math.min(want, max) * lh
    }

    private zoneLine = 0
    private zone = 0
    layout() {
        const p = this.parts
        const root = this.root
        if (!p || !root) return
        const view = this.view
        const pos = Math.min(this.position, view.state.doc.length)
        const line = view.state.doc.lineAt(pos)
        const lh = this.lh()
        const h = this.zoneHeight()
        if (h !== this.zone || line.number !== this.zoneLine) {
            this.zone = h
            this.zoneLine = line.number
            view.setViewZone('markernav', { afterLine: line.number, height: h })
        }
        const er = view.dom.getBoundingClientRect()
        const sd = view.scrollDOM
        const sr = sd.getBoundingClientRect()
        const arrowH = Math.round(lh / 3)
        const headH = Math.ceil(lh * 1.2)
        const width = sr.right - er.left
        root.style.top = `${sr.top - er.top + view.lineBlockAt(pos).bottom - sd.scrollTop}px`
        root.style.width = `${width}px`
        root.style.height = `${h}px`
        const at = view.caretCoords(pos === line.from && line.length > 0 ? pos + 1 : pos)
        p.arrow.style.left = `${(at ? at.left : sr.left) - er.left - arrowH}px`
        p.arrow.style.borderWidth = `${arrowH}px`
        p.arrow.style.top = `-${arrowH}px`
        p.box.style.top = `${arrowH}px`
        p.box.style.height = `${h - 2 * arrowH}px`
        p.head.style.height = `${headH}px`
        const bodyH = Math.round(h - 2 * arrowH - (headH + 2))
        p.body.style.height = `${bodyH}px`
        p.container.style.height = `${bodyH}px`
        p.body.style.fontFamily = 'inherit'
    }

    close(focus: boolean): void {
        if (!this.root) return
        for (const off of this.offs.splice(0)) off()
        this.root.remove()
        this.root = null
        this.parts = null
        this.nextIdx = -1
        this.zone = 0
        this.zoneLine = 0
        if (this.view.dom.isConnected) this.view.setViewZone('markernav', null)
        if (focus) this.view.focus()
    }

    dispose() { this.close(false) }
}

function controllerFor(view: EditorView): Controller {
    let c = controllers.get(view)
    if (!c) { c = new Controller(view); controllers.set(view, c) }
    return c
}

/** editor.action.marker.next / prev(单文件里 nextInFiles / prevInFiles 是一回事) */
export function navigateMarker(view: EditorView, next: boolean, _multiFile = false): boolean {
    return controllerFor(view).navigate(next)
}
/** 在 pos 处所在的标记上开浮窗(Monaco MarkerController.showAtMarker,hover 的 "View Problem" 用) */
export function showMarkerAt(view: EditorView, pos: number): boolean {
    return controllerFor(view).showAt(pos)
}
/** closeMarkersNavigation */
export function closeMarkersNavigation(view: EditorView): boolean {
    const c = controllers.get(view)
    if (!c?.visible) return false
    c.close(true)
    return true
}
/** markersNavigationVisible 上下文键 */
export function markersNavigationVisible(view: EditorView): boolean {
    return controllers.get(view)?.visible ?? false
}

/** 装进编辑器:F8 等命令改走浮窗;标题栏文件名 */
export function markerNavigationExtension(opts: MarkerNavigationOptions = {}) {
    return [
        markerNavigation.of((view, next, multi) => navigateMarker(view as EditorView, next, multi)),
        ...(opts.title ? [markerNavigationTitle.of(opts.title)] : []),
    ]
}
