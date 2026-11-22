// 无障碍 diff 查看器:照搬 Monaco browser/widget/diffEditor/components/accessibleDiffViewer.ts。
// 把改动按"相距小于 6 行"分组,一次显示一组(头行 + 上下各 3 行上下文 + 删除行 + 新增行),
// 上下键逐行走,Enter / Space 回到编辑器里对应位置,Esc 关闭。F7 / Shift+F7 在组之间走。
import type { RangePair } from './unchanged'

/** Monaco LineType */
export const LineType = { Header: 0, Unchanged: 1, Deleted: 2, Added: 3 } as const
export type LineType = typeof LineType[keyof typeof LineType]

export interface ViewElement {
    type: LineType
    originalLineNumber?: number
    modifiedLineNumber?: number
    /** Deleted / Added 才有:这行属于哪个改动 */
    diff?: RangePair
}

export interface ViewElementGroup {
    /** 这一组改动覆盖的行区间(两侧,半开) */
    range: RangePair
    lines: ViewElement[]
}

const viewElementGroupLineMargin = 3

/** Monaco computeViewElementGroups */
export function computeViewElementGroups(diffs: readonly RangePair[], originalLineCount: number, modifiedLineCount: number): ViewElementGroup[] {
    const result: ViewElementGroup[] = []
    // groupAdjacentBy:相邻两个改动之间的未改行 < 6 就归一组
    const groups: RangePair[][] = []
    for (const d of diffs) {
        const g = groups[groups.length - 1]
        if (g && d.modified.start - g[g.length - 1].modified.end < 2 * viewElementGroupLineMargin) g.push(d)
        else groups.push([d])
    }
    for (const g of groups) {
        const lines: ViewElement[] = [{ type: LineType.Header }]
        const first = g[0], last = g[g.length - 1]
        const origFull = {
            start: Math.max(1, first.original.start - viewElementGroupLineMargin),
            end: Math.min(last.original.end + viewElementGroupLineMargin, originalLineCount + 1),
        }
        const modFull = {
            start: Math.max(1, first.modified.start - viewElementGroupLineMargin),
            end: Math.min(last.modified.end + viewElementGroupLineMargin, modifiedLineCount + 1),
        }
        // forEachAdjacent:(undefined, g0), (g0, g1) … (gN, undefined)
        for (let i = 0; i <= g.length; i++) {
            const a = g[i - 1], b = g[i]
            const origRange = { start: a ? a.original.end : origFull.start, end: b ? b.original.start : origFull.end }
            const modRange = { start: a ? a.modified.end : modFull.start, end: b ? b.modified.start : modFull.end }
            for (let o = origRange.start; o < origRange.end; o++) {
                lines.push({ type: LineType.Unchanged, originalLineNumber: o, modifiedLineNumber: modRange.start + (o - origRange.start) })
            }
            if (b) {
                for (let o = b.original.start; o < b.original.end; o++) lines.push({ type: LineType.Deleted, diff: b, originalLineNumber: o })
                for (let m = b.modified.start; m < b.modified.end; m++) lines.push({ type: LineType.Added, diff: b, modifiedLineNumber: m })
            }
        }
        result.push({
            range: {
                original: { start: first.original.start, end: last.original.end },
                modified: { start: first.modified.start, end: last.modified.end },
            },
            lines,
        })
    }
    return result
}

/** 查看器要用到的编辑器能力。DiffEditor 实现它 */
export interface AccessibleDiffViewerHost {
    getDiffs(): readonly RangePair[]
    originalLineCount(): number
    modifiedLineCount(): number
    originalLine(n: number): string
    modifiedLine(n: number): string
    tabSize(): number
    /** 修改侧光标所在行 */
    modifiedCursorLine(): number
    lineHeight(): number
    /** 能不能关(onlyShowAccessibleDiffViewer 时不能) */
    canClose(): boolean
    setVisible(visible: boolean): void
    selectModifiedLine(line: number): void
    revealOriginal(line: number): void
    revealModified(line: number | undefined): void
    focusModified(): void
}

const clipCyclic = (n: number, len: number) => ((n % len) + len) % len
const clip = (n: number, len: number) => Math.max(0, Math.min(len - 1, n))

const plural = (n: number) => n === 0 ? 'no lines changed' : n === 1 ? '1 line changed' : `${n} lines changed`

export class AccessibleDiffViewer {
    private groups: ViewElementGroup[] = []
    private groupIdx = 0
    private elementIdx = 0
    private visible = false
    private readonly content: HTMLElement
    private readonly actions: HTMLElement
    private readonly onKey: (e: KeyboardEvent) => void

    constructor(readonly dom: HTMLElement, private readonly host: AccessibleDiffViewerHost) {
        dom.className = 'monaco-component diff-review monaco-editor-background'
        dom.style.visibility = 'hidden'
        this.actions = document.createElement('div')
        this.actions.className = 'diff-review-actions'
        this.content = document.createElement('div')
        this.content.className = 'diff-review-content'
        this.content.setAttribute('role', 'code')
        dom.append(this.content, this.actions)
        this.onKey = e => {
            // Monaco:无修饰键、Ctrl/Cmd、Alt 三种组合都认(Esc 另认 Shift);其余不处理
            const cmd = e.ctrlKey || e.metaKey
            const single = !(cmd && e.altKey)
            const noShift = single && !e.shiftKey
            if (e.key === 'ArrowDown' && noShift) {
                e.preventDefault()
                this.goToLineDelta(1)
            } else if (e.key === 'ArrowUp' && noShift) {
                e.preventDefault()
                this.goToLineDelta(-1)
            } else if (e.key === 'Escape' && single) {
                e.preventDefault()
                this.closeFromView()
            } else if ((e.key === ' ' || e.key === 'Enter') && !cmd && !e.altKey && !e.shiftKey) {
                e.preventDefault()
                this.revealCurrent()
            }
        }
        dom.addEventListener('keydown', this.onKey)
    }

    get isVisible() { return this.visible }
    get currentGroupIndex() { return this.groupIdx }
    get currentElementIndex() { return this.elementIdx }
    get currentGroups(): readonly ViewElementGroup[] { return this.groups }

    /** DiffEditor 把 visible 变化的结果交给它:true → 建模型 + 渲染,false → 清空 */
    setVisible(visible: boolean) {
        this.visible = visible
        this.dom.style.visibility = visible ? 'visible' : 'hidden'
        if (!visible) {
            this.groups = []
            this.groupIdx = 0
            this.elementIdx = 0
            this.content.replaceChildren()
            this.actions.replaceChildren()
            return
        }
        this.groupIdx = 0
        this.elementIdx = 0
        this.recompute()
    }

    /** diff 结果变了(只在可见时有意义) */
    refresh() {
        if (this.visible) this.recompute()
    }

    /** Monaco AccessibleDiffViewer.next():没显示就显示;已经显示就跳到下一组 */
    next() {
        const was = this.visible
        this.host.setVisible(true)
        if (was) this.goToGroupDelta(1)
    }
    /** Monaco AccessibleDiffViewer.prev():总是显示,跳到上一组 */
    prev() {
        this.host.setVisible(true)
        this.goToGroupDelta(-1)
    }
    close() { this.host.setVisible(false) }

    private recompute() {
        this.groups = computeViewElementGroups(this.host.getDiffs(), this.host.originalLineCount(), this.host.modifiedLineCount())
        const line = this.host.modifiedCursorLine()
        const idx = this.groups.findIndex(g => line < g.range.modified.end)
        if (idx !== -1) this.groupIdx = idx
        else this.groupIdx = clip(this.groupIdx, this.groups.length)
        this.elementIdx = clip(this.elementIdx, this.groups[this.groupIdx]?.lines.length ?? 0)
        this.render()
    }

    private goToGroupDelta(delta: number) {
        if (this.groups.length <= 1) return
        this.groupIdx = clipCyclic(this.groupIdx + delta, this.groups.length)
        this.elementIdx = 0
        this.render()
    }

    private goToLineDelta(delta: number) {
        const group = this.groups[this.groupIdx]
        if (!group || group.lines.length <= 1) return
        this.elementIdx = clip(this.elementIdx + delta, group.lines.length)
        this.updateSelection()
    }

    private goToLine(el: ViewElement) {
        const group = this.groups[this.groupIdx]
        const idx = group ? group.lines.indexOf(el) : -1
        if (idx === -1) return
        this.elementIdx = idx
        this.markSelected(false)
        this.selectInEditor()
    }

    private get currentElement(): ViewElement | undefined {
        return this.groups[this.groupIdx]?.lines[this.elementIdx]
    }

    private closeFromView() {
        if (!this.host.canClose()) return
        this.host.setVisible(false)
        this.host.focusModified()
    }

    private revealCurrent() {
        if (!this.host.canClose()) return
        this.host.setVisible(false)
        const el = this.currentElement
        if (!el) return
        if (el.type === LineType.Deleted) this.host.revealOriginal(el.originalLineNumber!)
        else this.host.revealModified(el.type !== LineType.Header ? el.modifiedLineNumber : undefined)
    }

    /** 选中的元素同步到修改侧编辑器的光标(让 revert / stage 这类命令对得上) */
    private selectInEditor() {
        const el = this.currentElement
        if (el && el.type !== LineType.Header) this.host.selectModifiedLine(el.modifiedLineNumber ?? el.diff!.modified.start)
    }

    private markSelected(focus: boolean) {
        const rows = this.content.querySelectorAll<HTMLElement>('.diff-review-row')
        rows.forEach((row, i) => {
            const sel = i === this.elementIdx
            row.tabIndex = sel ? 0 : -1
            if (sel && focus) row.focus()
        })
    }

    private updateSelection() {
        this.markSelected(true)
        this.selectInEditor()
    }

    private render() {
        this.actions.replaceChildren()
        if (this.host.canClose()) {
            const close = document.createElement('a')
            close.className = 'action-label close-diff-review codicon codicon-close'
            close.setAttribute('role', 'button')
            close.setAttribute('aria-label', 'Close')
            close.title = 'Close'
            close.tabIndex = 0
            close.addEventListener('click', () => this.closeFromView())
            this.actions.appendChild(close)
        }
        const table = document.createElement('div')
        table.className = 'diff-review-table'
        table.setAttribute('role', 'list')
        table.setAttribute('aria-label', 'Accessible Diff Viewer. Use arrow up and down to navigate.')
        this.content.replaceChildren(table)
        const group = this.groups[this.groupIdx]
        if (!group) return
        const lineHeight = this.host.lineHeight()
        for (const item of group.lines) {
            const row = item.type === LineType.Header ? this.headerRow(group) : this.lineRow(item, lineHeight)
            table.appendChild(row)
            row.addEventListener('focus', () => this.goToLine(item))
        }
        this.markSelected(true)
        this.selectInEditor()
    }

    private headerRow(group: ViewElementGroup): HTMLElement {
        const header = document.createElement('div')
        header.className = 'diff-review-row'
        header.setAttribute('role', 'listitem')
        const r = group.range
        const oLen = r.original.end - r.original.start
        const mLen = r.modified.end - r.modified.start
        header.setAttribute('aria-label', `Difference ${this.groupIdx + 1} of ${this.groups.length}: original line ${r.original.start}, ${plural(oLen)}, modified line ${r.modified.start}, ${plural(mLen)}`)
        const cell = document.createElement('div')
        cell.className = 'diff-review-cell diff-review-summary'
        cell.textContent = `${this.groupIdx + 1}/${this.groups.length}: @@ -${r.original.start},${oLen} +${r.modified.start},${mLen} @@`
        header.appendChild(cell)
        return header
    }

    private lineRow(item: ViewElement, lineHeight: number): HTMLElement {
        let rowClass = 'diff-review-row'
        let numExtra = ''
        let icon: string | null = null
        if (item.type === LineType.Added) {
            rowClass = 'diff-review-row line-insert'
            numExtra = ' char-insert'
            icon = 'codicon codicon-add'
        } else if (item.type === LineType.Deleted) {
            rowClass = 'diff-review-row line-delete'
            numExtra = ' char-delete'
            icon = 'codicon codicon-remove'
        }
        const row = document.createElement('div')
        row.className = rowClass
        row.setAttribute('role', 'listitem')
        const cell = document.createElement('div')
        cell.className = 'diff-review-cell'
        cell.style.height = `${lineHeight}px`
        row.appendChild(cell)
        const num = (n: number | undefined, extraStyle?: string) => {
            const span = document.createElement('span')
            span.className = 'diff-review-line-number' + numExtra
            if (extraStyle) span.style.cssText = extraStyle
            span.textContent = n !== undefined ? String(n) : '\u00a0'
            return span
        }
        cell.appendChild(num(item.originalLineNumber))
        cell.appendChild(num(item.modifiedLineNumber, 'padding-right:10px'))
        const spacer = document.createElement('span')
        spacer.className = 'diff-review-spacer'
        if (icon) {
            const ic = document.createElement('span')
            ic.className = icon
            ic.textContent = '\u00a0\u00a0'
            spacer.appendChild(ic)
        } else spacer.textContent = '\u00a0\u00a0'
        cell.appendChild(spacer)

        const modified = item.modifiedLineNumber !== undefined
        let text = modified ? this.host.modifiedLine(item.modifiedLineNumber!) : this.host.originalLine(item.originalLineNumber!)
        const tab = ' '.repeat(Math.max(1, this.host.tabSize()))
        const lineEl = document.createElement('span')
        lineEl.className = 'diff-review-line'
        lineEl.textContent = text.replace(/\t/g, tab)
        cell.appendChild(lineEl)
        if (text.length === 0) text = 'blank'
        switch (item.type) {
            case LineType.Unchanged:
                row.setAttribute('aria-label', item.originalLineNumber === item.modifiedLineNumber
                    ? `${text} unchanged line ${item.originalLineNumber}`
                    : `${text} original line ${item.originalLineNumber} modified line ${item.modifiedLineNumber}`)
                break
            case LineType.Added:
                row.setAttribute('aria-label', `+ ${text} modified line ${item.modifiedLineNumber}`)
                break
            case LineType.Deleted:
                row.setAttribute('aria-label', `- ${text} original line ${item.originalLineNumber}`)
                break
        }
        return row
    }

    destroy() {
        this.dom.removeEventListener('keydown', this.onKey)
        this.dom.replaceChildren()
        this.dom.remove()
    }
}
