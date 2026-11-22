// Diff 编辑器里的块 widget:折叠区的控制条、行内视图里被删的行、移动代码块的说明条。
// DOM 和 class 名照 Monaco(hideUnchangedRegionsFeature / movedBlocksLinesFeature / inlineDiffDeletedCodeMargin),CSS 在 diffcss.ts。
import { WidgetType } from '../model/decoration'
import type { UnchangedRegion } from './unchanged'
import type { MovedText } from './linediff'

/** widget 回头找 DiffEditor 要的东西。widget 本身只带数据(才能 eq 比较),状态一律按 key 现查 */
export interface DiffWidgetHost {
    /** 该侧以 firstLine 开头的区域(重算 diff 后对象会换,所以不能持有) */
    region(side: 0 | 1, firstLine: number): UnchangedRegion | undefined
    /** 区域状态改了,重画折叠 */
    regionsChanged(): void
    revealLineCount(): number
    lineHeight(): number
    /** 拖手柄时给根节点挂 draggingUnchangedRegion / canMoveTop / canMoveBottom(整个页面的光标跟着变) */
    setDragging(r: UnchangedRegion | undefined): void
    /** 改完 fn 之后保持 side 侧 endLine 那行的屏幕位置不动(底部手柄) */
    keepBottom(side: 0 | 1, endLine: number, fn: () => void): void
    toggleCompare(move: MovedText): void
    /** 面包屑点击:把 modified 侧的这一行从折叠区里露出来(Monaco ensureModifiedLineIsVisible(l, FromBottom)) */
    revealModifiedLine(line: number): void
}

/** 折叠条里的面包屑项(Monaco IDiffEditorBreadcrumbsSource.getBreadcrumbItems 的元素) */
export interface BreadcrumbItem { name: string, kind: number, startLineNumber: number }

/** Monaco SymbolKinds.toIcon:vscode SymbolKind 数值 → codicon 名;认不得的退回 symbol-property */
const SYMBOL_ICON: Record<number, string> = {
    0: 'symbol-file', 1: 'symbol-module', 2: 'symbol-namespace', 3: 'symbol-package', 4: 'symbol-class', 5: 'symbol-method',
    6: 'symbol-property', 7: 'symbol-field', 8: 'symbol-constructor', 9: 'symbol-enum', 10: 'symbol-interface', 11: 'symbol-function',
    12: 'symbol-variable', 13: 'symbol-constant', 14: 'symbol-string', 15: 'symbol-number', 16: 'symbol-boolean', 17: 'symbol-array',
    18: 'symbol-object', 19: 'symbol-key', 20: 'symbol-null', 21: 'symbol-enum-member', 22: 'symbol-struct', 23: 'symbol-event',
    24: 'symbol-operator', 25: 'symbol-type-parameter',
}
export const symbolIconName = (kind: number): string => SYMBOL_ICON[kind] ?? 'symbol-property'


export type HiddenKind = 'full' | 'compact' | 'none'

export interface HiddenParams {
    side: 0 | 1
    /** 区域首行(该侧行号),用来找回 region */
    firstLine: number
    kind: HiddenKind
    hiddenCount: number
    top: number
    bottom: number
    lineCount: number
    dragged: 'top' | 'bottom' | undefined
    /** 折叠区间里"开头在里面、结尾在外面"的符号(外层在前),画在 "N hidden lines" 后面 */
    breadcrumbs?: readonly BreadcrumbItem[]
}

const sameCrumbs = (a: readonly BreadcrumbItem[] = [], b: readonly BreadcrumbItem[] = []) =>
    a.length === b.length && a.every((x, i) => x.name === b[i].name && x.kind === b[i].kind && x.startLineNumber === b[i].startLineNumber)

/** Monaco CollapsedCodeOverlayWidget / CompactCollapsedCodeOverlayWidget,24px(紧凑 12px)一条 */
export class HiddenLinesWidget extends WidgetType {
    constructor(readonly p: HiddenParams, private readonly host: DiffWidgetHost) { super() }

    get estimatedHeight() { return this.p.kind === 'full' ? 24 : this.p.kind === 'compact' ? 12 : 0 }

    eq(other: WidgetType) {
        if (!(other instanceof HiddenLinesWidget)) return false
        const a = this.p, b = other.p
        return a.side === b.side && a.firstLine === b.firstLine && a.kind === b.kind && a.hiddenCount === b.hiddenCount
            && a.top === b.top && a.bottom === b.bottom && a.lineCount === b.lineCount && a.dragged === b.dragged
            && sameCrumbs(a.breadcrumbs, b.breadcrumbs)
    }

    toDOM(): Node {
        const p = this.p
        const root = document.createElement('div')
        root.className = 'diff-hidden-lines-widget'
        root.style.height = `${this.estimatedHeight}px`
        if (p.kind === 'none') return root
        const text = `${p.hiddenCount} hidden lines`
        if (p.kind === 'compact') {
            const c = document.createElement('div')
            c.className = 'diff-hidden-lines-compact'
            const left = document.createElement('div')
            left.className = 'line-left'
            const t = document.createElement('div')
            t.className = 'text'
            t.textContent = text
            const right = document.createElement('div')
            right.className = 'line-right'
            c.append(left, t, right)
            root.appendChild(c)
            return root
        }
        const stop = (e: Event) => e.stopPropagation()
        root.addEventListener('mousedown', stop)
        root.addEventListener('pointerdown', stop)
        root.addEventListener('click', stop)
        const nodes = document.createElement('div')
        nodes.className = 'diff-hidden-lines' + (p.dragged ? ' dragging' : '')
        const top = document.createElement('div')
        top.className = 'top'
        top.title = 'Click or drag to show more above'
        const center = document.createElement('div')
        center.className = 'center'
        center.style.display = 'flex'
        const first = document.createElement('div')
        first.className = 'first'
        first.style.cssText = 'display:flex;justify-content:center;align-items:center;flex-shrink:0;width:var(--diff-gutter-w,0px)'
        const unfold = document.createElement('a')
        unfold.title = 'Show Unchanged Region'
        unfold.setAttribute('role', 'button')
        const icon = document.createElement('span')
        icon.className = 'codicon codicon-unfold'
        unfold.appendChild(icon)
        unfold.addEventListener('click', () => this.mutate(r => r.showAll()))
        first.appendChild(unfold)
        const others = document.createElement('div')
        others.className = 'others'
        others.style.cssText = 'display:flex;justify-content:center;align-items:center'
        const label = document.createElement('span')
        label.title = 'Double click to unfold'
        label.textContent = text
        label.addEventListener('dblclick', e => {
            if (e.button !== 0) return
            e.preventDefault()
            this.mutate(r => r.showAll())
        })
        others.appendChild(label)
        const crumbs = p.breadcrumbs ?? []
        if (crumbs.length) {
            const sep = document.createElement('span')
            sep.textContent = '\u00a0\u00a0|\u00a0\u00a0'
            others.appendChild(sep)
            crumbs.forEach((item, i) => {
                const el = document.createElement('div')
                el.className = 'breadcrumb-item'
                el.style.cssText = 'display:flex;align-items:center'
                const icon = document.createElement('span')
                icon.className = `codicon codicon-${symbolIconName(item.kind)}`
                el.append(icon, '\u00a0', item.name)
                if (i < crumbs.length - 1) {
                    const chevron = document.createElement('span')
                    chevron.className = 'codicon codicon-chevron-right'
                    el.appendChild(chevron)
                }
                el.addEventListener('click', () => this.host.revealModifiedLine(item.startLineNumber))
                others.appendChild(el)
            })
        }
        center.append(first, others)
        const bottom = document.createElement('div')
        bottom.className = 'bottom'
        bottom.title = 'Click or drag to show more below'
        bottom.setAttribute('role', 'button')
        const fully = p.top + p.bottom === p.lineCount
        bottom.classList.toggle('canMoveTop', !fully)
        bottom.classList.toggle('canMoveBottom', p.bottom > 0)
        top.classList.toggle('canMoveTop', p.top > 0)
        top.classList.toggle('canMoveBottom', !fully)
        if (p.dragged === 'top') top.classList.add('dragging')
        if (p.dragged === 'bottom') bottom.classList.add('dragging')
        top.addEventListener('mousedown', e => this.drag(e, 'top'))
        bottom.addEventListener('mousedown', e => this.drag(e, 'bottom'))
        nodes.append(top, center, bottom)
        root.appendChild(nodes)
        return root
    }

    private region() { return this.host.region(this.p.side, this.p.firstLine) }

    private mutate(fn: (r: UnchangedRegion) => void) {
        const r = this.region()
        if (!r) return
        fn(r)
        this.host.regionsChanged()
    }

    /** Monaco 的手柄:按下不动 = 多露 revealLineCount 行;拖动 = 按行高取整地跟着走 */
    private drag(e: MouseEvent, which: 'top' | 'bottom') {
        if (e.button !== 0) return
        const r0 = this.region()
        if (!r0) return
        e.preventDefault()
        const startY = e.clientY
        let didMove = false
        const cur = which === 'top' ? r0.visibleLineCountTop : r0.visibleLineCountBottom
        const side = this.p.side
        const firstLine = this.p.firstLine
        const lh = this.host.lineHeight()
        const endLine = (r: UnchangedRegion) => (side ? r.modifiedLineNumber : r.originalLineNumber) + r.lineCount
        r0.isDragged = which
        this.host.setDragging(r0)
        this.host.regionsChanged()
        const win = (e.view ?? window) as Window
        const move = (ev: MouseEvent) => {
            const r = this.host.region(side, firstLine)
            if (!r) return
            const delta = ev.clientY - startY
            didMove = didMove || Math.abs(delta) > 2
            const lineDelta = Math.round(delta / lh)
            if (which === 'top') {
                r.visibleLineCountTop = Math.max(0, Math.min(cur + lineDelta, r.getMaxVisibleLineCountTop()))
                this.host.setDragging(r)
                this.host.regionsChanged()
            } else {
                const n = Math.max(0, Math.min(cur - lineDelta, r.getMaxVisibleLineCountBottom()))
                this.host.keepBottom(side, endLine(r), () => { r.visibleLineCountBottom = n })
                this.host.setDragging(r)
            }
        }
        const up = () => {
            win.removeEventListener('mousemove', move)
            win.removeEventListener('mouseup', up)
            const r = this.host.region(side, firstLine)
            if (r) {
                if (!didMove) {
                    if (which === 'top') {
                        r.showMoreAbove(this.host.revealLineCount())
                        r.isDragged = undefined
                        this.host.regionsChanged()
                    } else {
                        r.isDragged = undefined
                        this.host.keepBottom(side, endLine(r), () => r.showMoreBelow(this.host.revealLineCount()))
                    }
                } else {
                    r.isDragged = undefined
                    this.host.regionsChanged()
                }
            }
            this.host.setDragging(undefined)
        }
        win.addEventListener('mousemove', move)
        win.addEventListener('mouseup', up)
    }
}

export interface DeletedLinesParams {
    /** 被删的原行文字 */
    lines: string[]
    /** 第一行的原行号 */
    firstLineNumber: number
    /** 每行里被改的字符区间(char-delete),下标 = lines 的下标 */
    spans: { line: number, from: number, to: number }[]
    lineHeight: number
    tabSize: number
    /** 行号旁画 − */
    indicators: boolean
    hideLineNumbers: boolean
}

/** 行内(inline)视图里,修改侧编辑器中插入的"被删行"块(Monaco 的 inline-deleted view zone) */
export class DeletedLinesWidget extends WidgetType {
    constructor(readonly p: DeletedLinesParams) { super() }

    get estimatedHeight() { return this.p.lines.length * this.p.lineHeight }

    eq(other: WidgetType) {
        if (!(other instanceof DeletedLinesWidget)) return false
        const a = this.p, b = other.p
        return a.firstLineNumber === b.firstLineNumber && a.lineHeight === b.lineHeight && a.tabSize === b.tabSize
            && a.indicators === b.indicators && a.hideLineNumbers === b.hideLineNumbers
            && a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])
            && a.spans.length === b.spans.length && a.spans.every((s, i) => s.line === b.spans[i].line && s.from === b.spans[i].from && s.to === b.spans[i].to)
    }

    toDOM(): Node {
        const p = this.p
        const root = document.createElement('div')
        root.className = 'inline-deleted-lines'
        const tab = ' '.repeat(Math.max(1, p.tabSize))
        const expand = (s: string) => s.replace(/\t/g, tab)
        p.lines.forEach((line, i) => {
            const row = document.createElement('div')
            row.className = 'inline-deleted-line line-delete'
            row.style.height = `${p.lineHeight}px`
            row.style.lineHeight = `${p.lineHeight}px`
            if (!p.hideLineNumbers) {
                const num = document.createElement('span')
                num.className = 'inline-deleted-margin-view-zone'
                num.textContent = String(p.firstLineNumber + i)
                row.appendChild(num)
            }
            if (p.indicators) {
                const sign = document.createElement('span')
                sign.className = 'delete-sign codicon codicon-remove'
                row.appendChild(sign)
            }
            const text = document.createElement('span')
            text.className = 'inline-deleted-text-line'
            let at = 0
            const spans = p.spans.filter(s => s.line === i).sort((a, b) => a.from - b.from)
            for (const s of spans) {
                if (s.from > at) text.appendChild(document.createTextNode(expand(line.slice(at, s.from))))
                if (s.to > s.from) {
                    const m = document.createElement('span')
                    m.className = 'char-delete'
                    m.textContent = expand(line.slice(s.from, s.to))
                    text.appendChild(m)
                } else {
                    const m = document.createElement('span')
                    m.className = 'char-delete diff-range-empty'
                    text.appendChild(m)
                }
                at = Math.max(at, s.to)
            }
            if (at < line.length) text.appendChild(document.createTextNode(expand(line.slice(at))))
            row.appendChild(text)
            root.appendChild(row)
        })
        return root
    }
}

/** Monaco MovedBlockOverlayWidget:移动块起点上方 18px 的说明 "Code moved to line 3-9 | Compare" */
export class MovedCaptionWidget extends WidgetType {
    constructor(
        readonly kind: 'original' | 'modified',
        readonly move: MovedText,
        readonly active: boolean,
        private readonly host: DiffWidgetHost,
    ) { super() }

    get estimatedHeight() { return 18 }

    get text() {
        const m = this.move
        const withChanges = m.changes.length > 0 ? ' with changes' : ''
        return this.kind === 'original'
            ? `Code moved${withChanges} to line ${m.modifiedStart}-${m.modifiedEnd - 1}`
            : `Code moved${withChanges} from line ${m.originalStart}-${m.originalEnd - 1}`
    }

    eq(other: WidgetType) {
        return other instanceof MovedCaptionWidget && other.kind === this.kind && other.active === this.active && other.text === this.text
            && other.move.originalStart === this.move.originalStart && other.move.modifiedStart === this.move.modifiedStart
    }

    toDOM(): Node {
        const root = document.createElement('div')
        root.className = 'diff-hidden-lines-widget'
        root.style.height = '18px'
        const block = document.createElement('div')
        block.className = 'diff-moved-code-block'
        block.style.marginRight = '4px'
        const bar = document.createElement('div')
        bar.className = 'action-bar'
        const caption = document.createElement('span')
        caption.className = 'action-label disabled'
        caption.textContent = this.text
        const compare = document.createElement('a')
        compare.className = 'action-label' + (this.active ? ' checked' : '')
        compare.setAttribute('role', 'button')
        compare.setAttribute('aria-pressed', String(this.active))
        compare.title = 'Compare'
        const ic = document.createElement('span')
        ic.className = 'codicon codicon-compare-changes'
        compare.append(ic, document.createTextNode(' Compare'))
        compare.addEventListener('click', e => {
            e.stopPropagation()
            this.host.toggleCompare(this.move)
        })
        for (const t of ['mousedown', 'pointerdown']) block.addEventListener(t, e => e.stopPropagation())
        bar.append(caption, compare)
        block.appendChild(bar)
        root.appendChild(block)
        return root
    }
}
