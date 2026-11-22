// DiffEditor:Monaco 0.52 DiffEditorWidget。两侧各是一个 liteMonaco(),diff 用 computeLineDiff(advanced 算法)。
// 选项名 / 默认值 / 取值照 Monaco IDiffEditorOptions(core/diff/options.ts)。支持:
//   并排 + 行内(renderSideBySide / 窄于 renderSideBySideInlineBreakpoint 自动转行内)、可拖分隔条、gutter 里的 Revert、概览尺、
//   折叠未改区域(hideUnchangedRegions)、移动块(experimental.showMoves)、无障碍 diff 查看器(F7)、updateOptions 运行时改。
// 布局、装饰、对齐 view zone、gutter 菜单、概览尺、导航照 Monaco 源码和实测(/tmp/lc-hunt/h-host/d02~d10)。

import * as core from './core/index'
import { unfoldEffect } from './core/edit/fold'
import { WidgetType, type Decoration, type DecorationSet } from './core/model/decoration'
import type { Range } from './core/model/rangeset'
import { computeLineDiff, type LineRangeMapping, type MovedText } from './core/diff/linediff'
import {
    diffEditorDefaultOptions, splitDiffOptions, validateDiffEditorOptions,
    type IDiffEditorBaseOptions, type IDiffEditorOptions, type ResolvedDiffEditorOptions,
} from './core/diff/options'
import { RevealPreference, UnchangedRegion, toPairs, transferUnchangedRegions } from './core/diff/unchanged'
import { AccessibleDiffViewer } from './core/diff/accessible'
import { DeletedLinesWidget, HiddenLinesWidget, MovedCaptionWidget, type BreadcrumbItem, type DiffWidgetHost, type HiddenKind } from './core/diff/widgets'
import { OutlineModel } from './lang/outlinemodel'
import { CancellationTokenSource } from './lang/async'
import { languageFeatures, type DocumentSymbol } from './lang/languagefeatures'
import { resolveThemeColors, usableTheme, type ThemeColors } from './product/theme'
import { themeVars, applyThemeVars, ensureBaseCSS } from './product/themecss'
import { EditorType, registerDiffEditor } from './api/editorregistry'
import { liteMonaco, type LiteMonacoFeatures, type ShikiLike } from './litemonaco'
import { getContextKeyService, type IContextKey } from './api/contextkeys'
import type { LiteMonacoEditor } from './api/types'
import type { ITextModel } from './api/model'
import { getDefaultHighlighter } from './api/create'
import { lazyHighlighter } from './api/lazyhighlighter'
import { getTheme as getGlobalTheme, setTheme as setGlobalTheme, onDidColorThemeChange, resolveShikiThemeName } from './api/themes'
import type { IDisposable, IEvent } from './lang/tsapi'

export type { IDiffEditorBaseOptions, IDiffEditorOptions } from './core/diff/options'
export { diffEditorDefaultOptions } from './core/diff/options'

export interface DiffEditorOptions extends IDiffEditorBaseOptions {
    parent: Element
    highlighter: ShikiLike
    original: string
    modified: string
    lang?: string
    theme?: string
    colors?: ThemeColors
    /** 两侧共用;minimap 和折叠在 diff 里总是关(Monaco 同) */
    features?: LiteMonacoFeatures
    /** modified 侧只读;没有可执行的操作,gutter 菜单也不出 */
    readOnly?: boolean
    /** 两侧共用的 Monaco 编辑器选项(IEditorOptions) */
    options?: core.IEditorOptions
    /** 编辑后多久重算 diff(Monaco 200ms) */
    recomputeDebounceMs?: number
}

/** `createDiffEditor` 的构造项:Monaco 的 IStandaloneDiffEditorConstructionOptions(扁平的 IDiffEditorOptions)加上 lite-monaco 要的几项 */
export type DiffEditorConstructionOptions = IDiffEditorOptions & Pick<DiffEditorOptions, 'highlighter' | 'lang' | 'theme' | 'colors' | 'features' | 'recomputeDebounceMs'> & {
    original?: string
    modified?: string
}

/** Monaco ILineChange / ICharChange */
export interface ICharChange {
    readonly originalStartLineNumber: number
    readonly originalStartColumn: number
    readonly originalEndLineNumber: number
    readonly originalEndColumn: number
    readonly modifiedStartLineNumber: number
    readonly modifiedStartColumn: number
    readonly modifiedEndLineNumber: number
    readonly modifiedEndColumn: number
}
export interface ILineChange {
    readonly originalStartLineNumber: number
    readonly originalEndLineNumber: number
    readonly modifiedStartLineNumber: number
    readonly modifiedEndLineNumber: number
    readonly charChanges: ICharChange[] | undefined
}

/** Monaco IDocumentDiff:changes 用 lite-monaco 的 LineRangeMapping(1-based 半开行区间 + 绝对偏移的 innerChanges) */
export interface IDocumentDiff {
    readonly identical: boolean
    /** 超过 maxComputationTime 提前放弃了 */
    readonly quitEarly: boolean
    readonly changes: readonly LineRangeMapping[]
    readonly moves: readonly MovedText[]
}

/** Monaco IDiffEditorModel:两侧各一个 ITextModel */
export interface IDiffEditorModel {
    original: ITextModel
    modified: ITextModel
}
/** Monaco IDiffEditorViewModel(createViewModel 的返回):持有一对 model,可等 diff 算完 */
export interface IDiffEditorViewModel extends IDisposable {
    readonly model: IDiffEditorModel
    waitForDiff(): Promise<void>
}
/** Monaco IDiffEditorViewState */
export interface IDiffEditorViewState {
    original: ReturnType<LiteMonacoEditor['saveViewState']>
    modified: ReturnType<LiteMonacoEditor['saveViewState']>
    modelState?: unknown
}

/** diff 编辑器里能按 id 执行的动作(Monaco commands.ts + AccessibleDiffViewerNext/Prev) */
export const DIFF_EDITOR_ACTION_IDS = [
    'diffEditor.toggleCollapseUnchangedRegions',
    'diffEditor.collapseAllUnchangedRegions',
    'diffEditor.showAllUnchangedRegions',
    'diffEditor.expandAllUnchangedRegions',
    'diffEditor.toggleShowMovedCodeBlocks',
    'diffEditor.toggleUseInlineViewWhenSpaceIsLimited',
    'diffEditor.switchSide',
    'diffEditor.exitCompareMove',
    'editor.action.accessibleDiffViewer.next',
    'editor.action.accessibleDiffViewer.prev',
] as const

const GUTTER_W = 35
const OVERVIEW_W = 30
const LANE_W = 15
const MOVED_PADDING = 4

const setDiff = core.StateEffect.define<DecorationSet>()
const diffField = core.StateField.define<DecorationSet>({
    create: () => core.RangeSet.empty,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setDiff)) return e.value
        return tr.docChanged ? value.map(tr.changes) : value
    },
})
// 折叠区单独一个 field:拖手柄时每一帧都变,不要拖着 diff 装饰一起重建
const setHidden = core.StateEffect.define<DecorationSet>()
const hiddenField = core.StateField.define<DecorationSet>({
    create: () => core.RangeSet.empty,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setHidden)) return e.value
        return tr.docChanged ? value.map(tr.changes) : value
    },
})

class EmptyRange extends WidgetType {
    constructor(readonly cls: string) { super() }
    eq(other: WidgetType) { return other instanceof EmptyRange && other.cls === this.cls }
    toDOM() {
        const el = document.createElement('span')
        el.className = `${this.cls} diff-range-empty`
        return el
    }
}

/** useTrueInlineView:被删的文字画在修改侧原位(Monaco 的 before 装饰 + inline-deleted-text:删除线 + 红底) */
class InlineDeletedText extends WidgetType {
    constructor(readonly text: string) { super() }
    eq(other: WidgetType) { return other instanceof InlineDeletedText && other.text === this.text }
    toDOM() {
        const el = document.createElement('span')
        el.className = 'inline-deleted-text'
        el.textContent = this.text
        return el
    }
    ignoreEvent() { return true }
}

/** Monaco allowsTrueInlineDiffRendering:块里每处行内改动都在单行内,或原文侧是文档开头的空区间 */
function allowsTrueInline(x: LineRangeMapping, o: Doc, d: Doc): boolean {
    if (!x.innerChanges.length) return false
    return x.innerChanges.every(c =>
        (o.lineAt(c.originalFrom).number === o.lineAt(c.originalTo).number && d.lineAt(c.modifiedFrom).number === d.lineAt(c.modifiedTo).number)
        || (c.originalFrom === 0 && c.originalTo === 0))
}

/** 占在某行上方的一块空白里画的节点(被删行 / 移动说明):view zone 留位置,节点画在 scrollDOM 的覆盖层上,不进 contentDOM */
interface BlockItem { afterLine: number, height: number, el: HTMLElement }

type Doc = core.EditorState['doc']
type Zone = { afterLine: number, height: number }

// 1-based 行列,行超过末行 = 文末(Monaco validatePosition)
function lineStart(doc: Doc, n: number) { return n > doc.lines ? doc.length : doc.line(n).from }
function lineEnd(doc: Doc, n: number) { return doc.line(Math.min(n, doc.lines)).to }

// LineRangeMapping.toRangeMapping:整块换成一个字符区间
function blockRange(m: LineRangeMapping, o: Doc, d: Doc) {
    if (m.originalStart < m.originalEnd && m.modifiedStart < m.modifiedEnd)
        return { oFrom: o.line(m.originalStart).from, oTo: lineEnd(o, m.originalEnd - 1), mFrom: d.line(m.modifiedStart).from, mTo: lineEnd(d, m.modifiedEnd - 1) }
    if (m.originalStart === 1 || m.modifiedStart === 1)
        return { oFrom: lineStart(o, m.originalStart), oTo: lineStart(o, m.originalEnd), mFrom: lineStart(d, m.modifiedStart), mTo: lineStart(d, m.modifiedEnd) }
    return { oFrom: lineEnd(o, m.originalStart - 1), oTo: lineEnd(o, m.originalEnd - 1), mFrom: lineEnd(d, m.modifiedStart - 1), mTo: lineEnd(d, m.modifiedEnd - 1) }
}

const isInsertion = (m: LineRangeMapping) => m.originalStart === m.originalEnd
const isDeletion = (m: LineRangeMapping) => m.modifiedStart === m.modifiedEnd

/** Monaco translatePosition 的行号版:在 mappings 里把 src 侧的一行换成 dst 侧对应的行 */
function translateLine(line: number, mappings: readonly { s0: number, s1: number, d0: number, d1: number }[]): number {
    let delta = 0
    for (const m of mappings) {
        if (line < m.s0) break
        if (line < m.s1) return Math.min(m.d0 + (line - m.s0), Math.max(m.d0, m.d1 - 1))
        delta = m.d1 - m.s1
    }
    return line + delta
}

/** Monaco MovedBlocksLinesFeature.LinesLayout:把移动线分到几条竖轨上,互不重叠(最多 6 条) */
function layoutTracks(ranges: { top: number, bottom: number }[]): number[] {
    const perTrack: { top: number, bottom: number }[][] = []
    const out: number[] = []
    const overlap = (set: { top: number, bottom: number }[], r: { top: number, bottom: number }) =>
        set.reduce((n, s) => n + Math.max(0, Math.min(s.bottom, r.bottom) - Math.max(s.top, r.top)), 0)
    for (const r of ranges) {
        let idx = perTrack.findIndex(set => !set.some(s => s.top < r.bottom && r.top < s.bottom))
        if (idx === -1) {
            if (perTrack.length >= 6) {
                let best = 0, bestV = -1
                perTrack.forEach((set, i) => {
                    const v = overlap(set, r)
                    if (v > bestV) { bestV = v; best = i }
                })
                idx = best
            } else {
                idx = perTrack.length
                perTrack.push([])
            }
        }
        perTrack[idx].push(r)
        out.push(idx)
    }
    return out
}

/** Monaco DelegatingEditor:diff 编辑器自己没有的编辑器方法,全部转给 modified 侧(`_targetEditor`) */
const DELEGATED = [
    'getVisibleColumnFromPosition', 'getPosition', 'setPosition',
    'revealLine', 'revealLineInCenter', 'revealLineInCenterIfOutsideViewport', 'revealLineNearTop',
    'revealPosition', 'revealPositionInCenter', 'revealPositionInCenterIfOutsideViewport', 'revealPositionNearTop',
    'getSelection', 'getSelections', 'setSelection', 'setSelections',
    'revealLines', 'revealLinesInCenter', 'revealLinesInCenterIfOutsideViewport', 'revealLinesNearTop',
    'revealRange', 'revealRangeInCenter', 'revealRangeAtTop', 'revealRangeInCenterIfOutsideViewport', 'revealRangeNearTop', 'revealRangeNearTopIfOutsideViewport',
    'getSupportedActions', 'trigger', 'createDecorationsCollection', 'changeDecorations',
    // IStandaloneDiffEditor:命令、动作、上下文键都登记在 modified 侧(StandaloneDiffEditor2 同)
    'addCommand', 'addAction', 'createContextKey',
] as const
type Delegated = Pick<LiteMonacoEditor, typeof DELEGATED[number]>
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DiffEditor extends Delegated {}

let diffEditorCounter = 0

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DiffEditor {
    readonly dom: HTMLElement
    originalView!: LiteMonacoEditor
    modifiedView!: LiteMonacoEditor
    private readonly opts: DiffEditorOptions
    private o: ResolvedDiffEditorOptions
    private editorOpts: core.IEditorOptions
    private readOnly: boolean
    private readonly panes: [HTMLElement, HTMLElement]
    private readonly gutter: HTMLElement
    private readonly overview: HTMLElement
    private readonly sash: HTMLElement
    private readonly movedSvg: SVGSVGElement
    private readonly viewerHost: HTMLElement
    private readonly revertArrows: HTMLElement
    private readonly fills: [HTMLElement, HTMLElement] = [document.createElement('div'), document.createElement('div')]
    private readonly slots: [core.Compartment, core.Compartment] = [new core.Compartment(), new core.Compartment()]
    private readonly viewer: AccessibleDiffViewer
    private viewerShould = false
    private sbs = true
    /** compactMode:第一次算完 diff 后定下"是不是只有增 / 删",之后不变(Monaco derivedConstOnceDefined) */
    private smartInline: boolean | undefined
    private mappings: LineRangeMapping[] = []
    private moves: MovedText[] = []
    private snap: [Doc, Doc] | undefined
    private identical = true
    private quitEarly = false
    private upToDate = false
    private regions: UnchangedRegion[] | undefined
    /** 折叠条面包屑的符号来源:modified 侧 OutlineModel 摊平后的列表(Monaco DiffEditorBreadcrumbsSource) */
    private crumbSymbols: DocumentSymbol[] = []
    private crumbCts: CancellationTokenSource | undefined
    private revealing = false
    private activeMove: MovedText | undefined
    private compareMove: MovedText | undefined
    /** Compare 视图里让两侧的移动块起点对齐的顶部空白(Monaco _originalTopPadding / _modifiedTopPadding) */
    private topPad: [number, number] = [0, 0]
    /** Monaco EditorContextKeys.comparingMovedCode:两侧各一份(sub editor 的 context key 服务各自独立) */
    private comparingKeys: IContextKey<boolean>[] = []
    private movedWidth = 0
    private zoneIds: [string[], string[]] = [[], []]
    private zones: [Zone[], Zone[]] = [[], []]
    private zoneAt: [Map<number, number>, Map<number, number>] = [new Map(), new Map()]
    // 同步滚动时写给对侧的值:对侧的 scroll 事件读到它就不再回写(两侧可滚高度不等时防止来回拉)
    private echo: [number, number] = [-1, -1]
    private hiddenBefore: [boolean, boolean] = [false, false]
    private items: [BlockItem[], BlockItem[]] = [[], []]
    private readonly layers: [HTMLElement, HTMLElement] = [document.createElement('div'), document.createElement('div')]
    private ratio: number | undefined
    private timer: ReturnType<typeof setTimeout> | undefined
    private cleanups: (() => void)[] = []
    private paneCleanups: (() => void)[] = []
    private readonly updateListeners = new Set<() => unknown>()
    private waiters: (() => void)[] = []
    private disposed = false
    private readonly id = ++diffEditorCounter
    private readonly modelListeners = new Set<(e: { oldModelUrl: null, newModelUrl: null }) => unknown>()
    private readonly disposeListeners = new Set<() => unknown>()

    constructor(opts: DiffEditorOptions) {
        this.opts = opts
        this.o = validateDiffEditorOptions(opts, diffEditorDefaultOptions)
        this.editorOpts = { ...opts.options }
        this.readOnly = opts.readOnly ?? (this.editorOpts as { readOnly?: boolean }).readOnly ?? false
        const doc = opts.parent.ownerDocument ?? document
        const root = opts.parent.getRootNode()
        ensureBaseCSS(root.nodeType === 11 ? root as ShadowRoot : doc)
        const hl: ShikiLike & Parameters<typeof resolveThemeColors>[0] = opts.highlighter
        this.themeName = opts.theme ?? 'dark-plus'
        this.colorsOverride = opts.colors
        const colors = resolveThemeColors(hl, usableTheme(hl, resolveShikiThemeName(this.themeName)), this.colorsOverride)
        this.dom = doc.createElement('div')
        this.dom.className = `monaco-diff-editor side-by-side ${colors.dark ? 'vs-dark' : 'vs'}`
        applyThemeVars(this.dom, themeVars(colors))
        this.colorKey = JSON.stringify(themeVars(colors))
        const original = doc.createElement('div')
        original.className = 'editor original'
        const modified = doc.createElement('div')
        modified.className = 'editor modified'
        this.panes = [original, modified]
        this.gutter = doc.createElement('div')
        this.gutter.className = 'gutter'
        this.overview = doc.createElement('div')
        this.overview.className = 'diffOverview'
        // Monaco style.css 按主题写死的底色,不是主题色
        this.overview.style.background = colors.dark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.03)'
        this.sash = doc.createElement('div')
        this.sash.className = 'diff-sash'
        this.movedSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
        this.movedSvg.setAttribute('class', 'moved-blocks-lines')
        this.viewerHost = doc.createElement('div')
        this.viewerHost.className = 'accessibleDiffViewer'
        this.revertArrows = doc.createElement('div')
        this.revertArrows.className = 'revert-arrows'
        this.revertArrows.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:10'
        this.dom.append(original, this.gutter, modified, this.movedSvg, this.overview, this.sash, this.viewerHost)
        modified.appendChild(this.revertArrows)
        opts.parent.appendChild(this.dom)
        for (const f of this.fills) f.className = 'cm-diffFillLayer'
        for (const l of this.layers) l.className = 'cm-diffBlockLayer'

        const viewerEl = doc.createElement('div')
        this.viewerHost.appendChild(viewerEl)
        this.viewer = new AccessibleDiffViewer(viewerEl, {
            getDiffs: () => toPairs(this.mappings),
            originalLineCount: () => this.originalView.state.doc.lines,
            modifiedLineCount: () => this.modifiedView.state.doc.lines,
            originalLine: n => this.originalView.state.doc.line(n).text,
            modifiedLine: n => this.modifiedView.state.doc.line(n).text,
            tabSize: () => this.modifiedView.state.tabSize,
            modifiedCursorLine: () => this.modifiedView.state.doc.lineAt(this.modifiedView.state.selection.main.head).number,
            lineHeight: () => this.modifiedView.oracle.lineHeight,
            canClose: () => !this.o.onlyShowAccessibleDiffViewer,
            setVisible: v => this.setViewerVisible(v),
            selectModifiedLine: line => {
                const d = this.modifiedView.state.doc
                this.modifiedView.dispatch(this.modifiedView.state.update({ selection: { anchor: lineStart(d, Math.min(line, d.lines)) } }))
            },
            revealOriginal: line => this.revealSideLine(0, line),
            revealModified: line => {
                if (line !== undefined) this.revealSideLine(1, line)
            },
            focusModified: () => this.modifiedView.focus(),
        })

        this.gutter.addEventListener('click', () => this.modifiedView.focus())
        this.gutter.addEventListener('wheel', e => this.forwardWheel(e), { passive: false })
        this.overview.addEventListener('wheel', e => this.forwardWheel(e), { passive: false })
        // Monaco delegateVerticalScrollbarPointerDown:当成按在 modified 的竖条上
        this.overview.addEventListener('pointerdown', e => {
            const bar = this.modifiedView.dom.querySelector(':scope > .cm-scrollbar')
            if (!bar) return
            e.preventDefault()
            bar.dispatchEvent(new PointerEvent('pointerdown', e))
        })
        this.sash.addEventListener('pointerdown', e => {
            if (!this.o.enableSplitViewResizing) return
            e.preventDefault()
            const startX = e.clientX
            const start = this.sashLeft()
            const cw = this.contentWidth()
            this.sash.classList.add('active')
            const move = (ev: PointerEvent) => {
                this.ratio = (start + ev.clientX - startX) / cw
                this.layout()
            }
            const up = () => {
                this.sash.classList.remove('active')
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
        })
        this.sash.addEventListener('dblclick', () => {
            if (!this.o.enableSplitViewResizing) return
            this.ratio = undefined
            this.layout()
        })
        // 点折叠区第一行的小箭头 = 重新折叠(Monaco 的 fold-unchanged 字形)
        this.dom.addEventListener('click', e => {
            const t = e.target as HTMLElement | null
            if (!t?.classList?.contains('fold-unchanged')) return
            const side = this.panes[0].contains(t) ? 0 : 1
            const lineEl = t.closest('.cm-gutterElement')
            const v = side ? this.modifiedView : this.originalView
            if (!lineEl) return
            const top = lineEl.getBoundingClientRect().top
            const at = v.posAtCoords?.({ x: v.contentDOM.getBoundingClientRect().left + 1, y: top + 1 })
            if (at == null) return
            const line = v.state.doc.lineAt(at).number
            const r = this.regions?.find(x => {
                const rng = side ? x.modifiedUnchangedRange : x.originalUnchangedRange
                return rng.start <= line && line < rng.end
            })
            if (!r) return
            r.collapseAll()
            this.applyHidden()
            e.stopPropagation()
        })
        this.mountPanes(opts.original, opts.modified)
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => this.layout())
            ro.observe(this.dom)
            this.cleanups.push(() => ro.disconnect())
        }
        // 注册 / 注销 documentSymbolProvider → 面包屑重取
        const symOff = languageFeatures.documentSymbolProvider.onDidChange(() => this.refreshBreadcrumbs())
        this.cleanups.push(() => symOff.dispose())
        this.layout()
        this.applyViewer()
        this.unregister = registerDiffEditor(this)
        // 主题跟着全局走(monaco.editor.setTheme):两侧编辑器自己会重装配,diff 外壳的底色 / 增删色得一起换
        const themeOff = onDidColorThemeChange(() => {
            this.themeName = getGlobalTheme()
            this.colorsOverride = undefined
            this.refreshColors()
        })
        this.cleanups.push(() => themeOff.dispose())
    }

    private unregister: (() => void) | undefined
    private themeName: string
    private colorsOverride: ThemeColors | undefined
    private colorKey = ''

    /**
     * 按当前主题重算外壳颜色(.vs / .vs-dark、增删底色、概览尺底色)。
     * 懒加载的 shiki 主题是异步装好的:装好之后两侧编辑器重装配、样式变量变了,由 mountPanes 里的观察器再调一次
     */
    private refreshColors() {
        if (this.disposed) return
        const colors = resolveThemeColors(this.opts.highlighter as Parameters<typeof resolveThemeColors>[0], usableTheme(this.opts.highlighter, resolveShikiThemeName(this.themeName)), this.colorsOverride)
        const vars = themeVars(colors)
        const key = JSON.stringify(vars)
        if (key === this.colorKey) return
        this.colorKey = key
        applyThemeVars(this.dom, vars)
        this.dom.classList.toggle('vs-dark', colors.dark)
        this.dom.classList.toggle('vs', !colors.dark)
        this.overview.style.background = colors.dark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.03)'
        this.paint()
    }

    // —— Monaco 的几个派生量 ——
    /** Monaco useTrueInlineDiffRendering:只在行内视图里生效 */
    private get trueInline() { return !this.sbs && !!this.o.experimental.useTrueInlineView }
    private get gutterW() { return this.o.renderGutterMenu && !this.readOnly ? GUTTER_W : 0 }
    private get ovW() { return this.o.renderOverviewRuler ? OVERVIEW_W : 0 }
    /** Monaco DiffEditorOptions.renderSideBySide:选项 + 宽度 + compactMode 的简单 diff */
    private computeSideBySide(): boolean {
        const o = this.o
        if (o.compactMode && this.smartInline) return false
        // 宽度 0 = 还没量到(未挂载 / 无布局),不当成"空间不够"
        const w = this.dom.clientWidth
        return o.renderSideBySide && !(o.useInlineViewWhenSpaceIsLimited && w > 0 && w <= o.renderSideBySideInlineBreakpoint)
    }
    private get showMoves() { return this.o.experimental.showMoves && this.sbs }
    private get wrapMode(): boolean {
        const w = this.o.diffWordWrap
        // inherit:跟编辑器自己的 wordWrap 选项(Monaco diffWordWrap 'inherit'),或 features.lineWrapping
        const ww = (this.editorOpts as { wordWrap?: string }).wordWrap
        return w === 'inherit' ? this.opts.features?.lineWrapping === true || (!!ww && ww !== 'off') : w === 'on'
    }

    /**
     * 某一侧编辑器的"覆盖层"(Monaco _adjustOptionsForSubEditor)。选项本身走编辑器自己的 updateOptions(sideRaw):
     * 只有它会触发视图层重算(字形边距、字体、折行);再额外塞一份 facet 层的选项,updateOptions 比较前后 facet 时
     * 看不到变化就直接返回,视图层永远不更新(并排 ↔ 行内之后原文侧的字形边距留着)。这里只管只读状态。
     */
    private sideExtension(i: 0 | 1): core.Extension {
        return core.EditorState.readOnly.of(this.sideRaw(i).readOnly as boolean)
    }

    /**
     * 某一侧编辑器的完整选项(Monaco DiffEditorEditors._adjustOptionsFor*):用户的编辑器选项 + diff 强制的几项。
     * 既进 facet(特性模块读),也走编辑器自己的 updateOptions(视图层的字体度量 / 行高 / 字形边距只认这条路,否则 fontSize 等选项在 diff 里不生效)
     */
    private sideRaw(i: 0 | 1): Record<string, unknown> {
        const e = this.editorOpts as core.IEditorOptions & { minimap?: Record<string, unknown> }
        const raw: Record<string, unknown> = { ...e, minimap: { ...e.minimap, enabled: false }, folding: false, inDiffEditor: true }
        if (this.o.hideUnchangedRegions.enabled) raw.stickyScroll = { enabled: false }
        // 两侧的尺寸由 diff 的布局(pane 宽高)决定;Monaco 由 diff 显式 layout 两侧,这里让两侧自己跟着 pane,用户的 automaticLayout 管的是 diff 外壳
        raw.automaticLayout = true
        raw.readOnly = i === 0 ? !this.sbs || !this.o.originalEditable : this.readOnly
        // 折行由 wrapFor 决定(Monaco wordWrapOverride:行内视图里藏起来的原文侧永远不折);用户的 'bounded' / 'wordWrapColumn' 保留
        const ww = (this.editorOpts as { wordWrap?: string }).wordWrap
        raw.wordWrap = this.wrapFor(i) ? (ww && ww !== 'off' ? ww : 'on') : 'off'
        // 并排时原文侧留一条字形边距(Monaco result.glyphMargin = renderSideBySide);行内时原文侧是藏起来的
        if (i === 0) raw.glyphMargin = this.sbs
        return raw
    }

    private mountPanes(original: string, modified: string) {
        const o = this.opts
        const sbs = this.computeSideBySide()
        this.sbs = sbs
        this.dom.classList.toggle('side-by-side', sbs)
        const keymap = [
            { key: 'F7', run: () => { this.accessibleDiffViewerNext(); return true } },
            { key: 'Shift-F7', run: () => { this.accessibleDiffViewerPrev(); return true } },
            { key: 'Escape', run: () => { if (!this.compareMove) return false; this.exitCompareMove(); return true } },
        ]
        const make = (i: 0 | 1, doc: string) => liteMonaco({
            highlighter: o.highlighter, lang: o.lang, theme: o.theme, colors: o.colors,
            features: { ...o.features, minimap: false, foldGutter: false, lineWrapping: this.wrapFor(i) },
            parent: this.panes[i], doc, keymap, options: this.sideRaw(i) as core.IEditorOptions,
            extensions: [diffField, hiddenField, core.decorations.of(s => s.field(diffField)), core.decorations.of(s => s.field(hiddenField)), this.slots[i].of(this.sideExtension(i))],
        })
        this.originalView = make(0, original)
        this.modifiedView = make(1, modified)
        const views = [this.originalView, this.modifiedView]
        // Monaco EditorContextKeys.comparingMovedCode(两侧编辑器各自的 context key 服务里都有)
        this.comparingKeys = views.map(v => getContextKeyService(v).createKey<boolean>('comparingMovedCode', false))
        for (const [i, v] of views.entries()) {
            const other = views[1 - i]
            const sd = v.scrollDOM
            const hl = sd.querySelector(':scope > .cm-highlightLayer')
            sd.insertBefore(this.fills[i], hl ? hl.nextSibling : sd.firstChild)
            sd.appendChild(this.layers[i])
            const onScroll = () => {
                // 行内视图里原文侧只露出一条行号(两侧行对齐),竖向照样同步;横向只有并排才同步
                if (sd.scrollTop !== this.echo[i]) {
                    this.echo[i] = -1
                    const osd = other.scrollDOM
                    if (osd.scrollTop !== sd.scrollTop) {
                        osd.scrollTop = sd.scrollTop
                        this.echo[1 - i] = osd.scrollTop
                    }
                    if (this.sbs && osd.scrollLeft !== sd.scrollLeft) osd.scrollLeft = sd.scrollLeft
                }
                this.paint()
            }
            sd.addEventListener('scroll', onScroll, { passive: true })
            this.paneCleanups.push(
                () => sd.removeEventListener('scroll', onScroll),
                v.onGeometry(() => { this.realignIfWrapChanged(); this.paint() }),
                v.onTransaction(tr => {
                    if (tr.docChanged) {
                        this.upToDate = false
                        this.remapRegions(i as 0 | 1, tr)
                        this.schedule()
                        this.paint()
                    } else if (tr.selection && v === this.modifiedView) this.paintGutter()
                    if (tr.selection || tr.docChanged) {
                        this.revealSelection(i as 0 | 1)
                        // 文档刚改:diff 还是编辑前的,行号对不上,等重算(recompute 按位置认回 activeMove / compareMove)
                        if (!tr.docChanged) this.updateActiveMove(i as 0 | 1)
                    }
                }),
            )
        }
        // 懒加载的主题装好 → 编辑器重装配,样式变量(style 属性)变了;外壳颜色跟着刷新
        const mo = new MutationObserver(() => this.refreshColors())
        mo.observe(this.modifiedView.dom, { attributes: true, attributeFilter: ['style'] })
        this.paneCleanups.push(() => mo.disconnect())
        this.recompute()
    }

    private wrapFor(i: 0 | 1): boolean {
        // 行内视图里被藏起来的原文侧从不折行(Monaco wordWrapOverride = 'off')
        return i === 0 && !this.sbs ? false : this.wrapMode
    }

    private forwardWheel(e: WheelEvent) {
        e.preventDefault()
        const sd = this.modifiedView.scrollDOM
        sd.scrollTop += e.deltaY
        sd.scrollLeft += e.deltaX
    }

    private schedule() {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.recompute(), this.opts.recomputeDebounceMs ?? 200)
    }

    private contentWidth() {
        return this.dom.clientWidth - this.ovW
    }

    // Monaco SashLayout._computeSashLeft
    private sashLeft() {
        const cw = this.contentWidth()
        const def = this.o.splitViewDefaultRatio
        const mid = Math.floor(def * cw)
        const left = !this.o.enableSplitViewResizing ? mid : Math.floor((this.ratio ?? def) * cw)
        if (cw <= 200) return mid
        return Math.min(Math.max(left, 100), cw - 100)
    }

    /** Monaco layout({width,height}):不传 = 按容器现在的大小重排 */
    layout(dimension?: { width: number, height: number }) {
        if (this.disposed) return
        if (dimension) {
            this.dom.style.width = `${dimension.width}px`
            this.dom.style.height = `${dimension.height}px`
        }
        const next = this.computeSideBySide()
        if (next !== this.sbs) {
            this.sbs = next
            this.applyMode()
        }
        const w = this.dom.clientWidth
        const ov = this.ovW
        const gutterW = this.gutterW
        const [original, modified] = this.panes
        this.overview.style.display = ov ? '' : 'none'
        this.sash.style.display = this.sbs ? '' : 'none'
        this.sash.style.pointerEvents = this.o.enableSplitViewResizing ? '' : 'none'
        this.gutter.style.display = gutterW ? '' : 'none'
        if (this.sbs) {
            const left = this.sashLeft()
            const moved = this.showMoves ? this.movedWidth : 0
            original.style.left = '0px'
            original.style.width = `${Math.max(0, left - gutterW - moved)}px`
            this.gutter.style.left = `${left - gutterW}px`
            modified.style.left = `${left}px`
            modified.style.width = `${Math.max(0, w - left - ov)}px`
            this.sash.style.left = `${left - gutterW - 2}px`
        } else {
            // Monaco 行内视图:原文侧编辑器只露出行号那一列(宽 = 它的行号栏),修改侧排在它右边;两侧行对齐,所以出两列行号
            const ow = this.inlineOriginalWidth()
            original.style.left = `${gutterW}px`
            original.style.width = `${ow}px`
            this.gutter.style.left = '0px'
            modified.style.left = `${gutterW + ow}px`
            modified.style.width = `${Math.max(0, w - gutterW - ow - ov)}px`
        }
        this.gutter.style.width = `${gutterW}px`
        original.style.overflow = this.sbs ? '' : 'hidden'
        original.style.pointerEvents = this.sbs ? '' : 'none'
        this.overview.style.left = `${w - ov}px`
        this.overview.style.width = `${ov}px`
        this.paint()
    }

    /** 行内视图里原文侧(只露行号)的宽:它的行号栏宽(行号关了 = 0) */
    private inlineOriginalWidth(): number {
        const m = this.modifiedView
        const lines = this.originalView.state.doc.lines
        const opt = (name: string) => (m as unknown as { getOption(n: string): unknown }).getOption(name)
        if ((opt('lineNumbers') as { renderType: number }).renderType === 0) return 0
        const minChars = opt('lineNumbersMinChars') as number
        return Math.round(Math.max(String(lines).length, minChars) * (m.oracle.charWidth || m.getLayoutInfo().lineNumbersWidth / Math.max(String(m.state.doc.lines).length, minChars)))
    }

    /** 并排 ↔ 行内:两侧选项、装饰、对齐方式都要换 */
    private applyMode() {
        this.dom.classList.toggle('side-by-side', this.sbs)
        this.originalView.reconfigure({ lineWrapping: this.wrapFor(0) })
        this.reconfigureSides()
        if (this.showMoves !== (this.moves.length > 0)) this.recompute()
        else this.render()
    }

    private reconfigureSides() {
        for (const [i, v] of [this.originalView, this.modifiedView].entries()) {
            v.dispatch(v.state.update({ effects: this.slots[i].reconfigure(this.sideExtension(i as 0 | 1)) }))
            v.updateOptions(this.sideRaw(i as 0 | 1) as core.IEditorOptions)
        }
    }

    /** 重新算 diff,再整体重画 */
    private recompute() {
        if (this.disposed) return
        clearTimeout(this.timer)
        const o = this.originalView
        const m = this.modifiedView
        const oDoc = o.state.doc
        const mDoc = m.state.doc
        const oText = oDoc.toString()
        const mText = mDoc.toString()
        const r = computeLineDiff(oText, mText, {
            ignoreTrimWhitespace: this.o.ignoreTrimWhitespace,
            maxComputationTimeMs: this.o.maxComputationTime,
            computeMoves: this.showMoves && this.o.diffAlgorithm !== 'legacy',
            algorithm: this.o.diffAlgorithm,
        })
        this.mappings = r.changes
        this.moves = r.moves
        this.quitEarly = r.hitTimeout
        this.identical = oText === mText
        this.snap = [oDoc, mDoc]
        this.upToDate = true
        if (this.smartInline === undefined) {
            this.smartInline = this.mappings.every(x => isInsertion(x) || isDeletion(x))
            if (this.o.compactMode && this.computeSideBySide() !== this.sbs) {
                this.sbs = !this.sbs
                this.applyMode()
                return
            }
        }
        // 重算后 MovedText 是新对象:按位置认回来。Compare 的那块按 modified 区间相交找(Monaco recompute 里
        // movedTextToCompare = moves.find(m => m.modified.intersect(current.modified))),编辑把块挪了几行也还认得
        if (this.activeMove) {
            const a = this.activeMove
            this.activeMove = this.moves.find(x => x.originalStart === a.originalStart && x.modifiedStart === a.modifiedStart)
        }
        if (this.compareMove) {
            const c = this.compareMove
            this.compareMove = this.moves.find(x => x.modifiedStart < c.modifiedEnd && c.modifiedStart < x.modifiedEnd)
        }
        this.refreshRegions()
        this.refreshBreadcrumbs()
        this.render()
        this.viewer.refresh()
        for (const fn of [...this.updateListeners]) fn()
        const w = this.waiters
        this.waiters = []
        for (const fn of w) fn()
    }

    /** 折行时两侧各行的视觉行数随宽度变(窗口拉宽、字体到达):对齐空白按旧行数算的就错了,行数变了就重排一次 */
    private wrapSig = ''
    private realignIfWrapChanged() {
        if (this.disposed || !(this.originalView.lineWrapping || this.modifiedView.lineWrapping)) return
        const sig = this.computeWrapSig()
        if (sig !== this.wrapSig) this.render()
    }

    private computeWrapSig(): string {
        const parts: number[] = []
        for (const x of this.mappings) {
            for (let n = x.originalStart; n < x.originalEnd; n++) parts.push(this.originalView.getBottomForLineNumber(n) - this.originalView.getTopForLineNumber(n))
            parts.push(-1)
            for (let n = x.modifiedStart; n < x.modifiedEnd; n++) parts.push(this.modifiedView.getBottomForLineNumber(n) - this.modifiedView.getTopForLineNumber(n))
            parts.push(-2)
        }
        return parts.join(',')
    }

    private render() {
        if (this.disposed) return
        const o = this.originalView
        const m = this.modifiedView
        const indicators = this.o.renderIndicators
        const sides = [
            { view: o, line: 'line-delete', char: 'char-delete', gutter: 'gutter-delete', sign: 'delete-sign codicon codicon-remove' },
            { view: m, line: 'line-insert', char: 'char-insert', gutter: 'gutter-insert', sign: 'insert-sign codicon codicon-add' },
        ]
        const lh = m.oracle.lineHeight
        const items: [BlockItem[], BlockItem[]] = [[], []]
        const captionExtra: [Map<number, number>, Map<number, number>] = [new Map(), new Map()]
        for (const [i, s] of sides.entries()) {
            const doc = s.view.state.doc
            const ranges: Range<Decoration>[] = []
            // Compare 视图(Monaco movedTextToCompare):只画这块里面的改动,其余的 diff 不着色
            const cmp = this.compareMove
            for (const x of cmp ? cmp.changes : this.mappings) {
                const start = i ? x.modifiedStart : x.originalStart
                const end = i ? x.modifiedEnd : x.originalEnd
                const otherEmpty = !cmp && (i ? x.originalStart === x.originalEnd : x.modifiedStart === x.modifiedEnd)
                const line = core.Decoration.line({
                    class: otherEmpty ? `${s.line} ${s.char}` : s.line,
                    gutterClass: s.gutter,
                    gutterMarker: indicators ? s.sign : undefined,
                })
                for (let n = start; n < end; n++) ranges.push(line.range(doc.line(n).from))
                if (otherEmpty || start === end) continue
                const trueInline = !cmp && i === 1 && this.trueInline && allowsTrueInline(x, this.originalView.state.doc, doc)
                for (const c of x.innerChanges) {
                    const from = i ? c.modifiedFrom : c.originalFrom
                    const to = i ? c.modifiedTo : c.originalTo
                    const n = doc.lineAt(from).number
                    if (!cmp && (n < start || n >= end)) continue
                    if (trueInline && c.originalTo > c.originalFrom) {
                        const text = this.originalView.state.doc.sliceString(c.originalFrom, c.originalTo)
                        ranges.push(core.Decoration.widget({ widget: new InlineDeletedText(text), side: -1 }).range(from))
                    }
                    if (from === to) {
                        if (!cmp && this.o.experimental.showEmptyDecorations && !trueInline) ranges.push(core.Decoration.widget({ widget: new EmptyRange(s.char), side: 1 }).range(from))
                    } else ranges.push(core.Decoration.mark({ class: s.char }).range(from, to))
                }
            }
            if (i === 1 && !this.sbs) this.inlineDeleted(items[1], lh)
            if (this.showMoves) this.movedDecorations(i as 0 | 1, ranges, items[i], captionExtra[i])
            s.view.dispatch(s.view.state.update({ effects: setDiff.of(core.RangeSet.of(ranges, true)) }))
        }
        this.items = items
        this.wrapSig = this.computeWrapSig()
        this.align(items, captionExtra)
        if (this.syncComparePadding()) this.align(items, captionExtra)
        for (const k of this.comparingKeys) k.set(!!this.compareMove)
        this.applyHidden()
        this.paint()
    }

    /**
     * Compare 视图:让两侧的移动块起点在同一高度(Monaco "update editor top offsets"):
     * 哪边的块靠下,另一边就在文档顶上垫一块空白。两侧 scrollTop 是锁在一起的,所以空白补上以后块就并排了;
     * 垫的是 modified 侧时顺带滚动 modified,让它正在看的内容不跳。返回是否改了空白(要重排一次 view zone)。
     */
    private syncComparePadding(): boolean {
        const cm = this.compareMove
        let next: [number, number] = [0, 0]
        if (cm && this.sbs) {
            const delta = (this.textTop(this.modifiedView, cm.modifiedStart) - this.topPad[1]) - (this.textTop(this.originalView, cm.originalStart) - this.topPad[0])
            next = delta > 0 ? [delta, 0] : delta < 0 ? [0, -delta] : [0, 0]
        }
        if (next[0] === this.topPad[0] && next[1] === this.topPad[1]) return false
        const dMod = next[1] - this.topPad[1]
        this.topPad = next
        // 先排好 view zone 再动滚动条(调用方重排);这里只记下要补的量,下一次布局后生效
        if (dMod) queueMicrotask(() => { if (!this.disposed) this.modifiedView.scrollDOM.scrollTop += dMod })
        return true
    }

    /** 行内视图:每个有原文行的改动,在修改侧对应行之前留一块空白,里面画"被删行" */
    private inlineDeleted(items: BlockItem[], lh: number) {
        const od = this.originalView.state.doc
        const md = this.modifiedView.state.doc
        for (const x of this.mappings) {
            if (x.originalEnd <= x.originalStart) continue
            if (this.trueInline && allowsTrueInline(x, od, md)) continue
            const lines: string[] = []
            for (let n = x.originalStart; n < x.originalEnd; n++) lines.push(od.line(n).text)
            const spans: { line: number, from: number, to: number }[] = []
            if (x.modifiedStart < x.modifiedEnd) {
                for (const c of x.innerChanges) {
                    const la = od.lineAt(c.originalFrom).number
                    const lb = od.lineAt(c.originalTo).number
                    for (let n = la; n <= lb; n++) {
                        if (n < x.originalStart || n >= x.originalEnd) continue
                        const ln = od.line(n)
                        spans.push({ line: n - x.originalStart, from: n === la ? c.originalFrom - ln.from : 0, to: n === lb ? c.originalTo - ln.from : ln.length })
                    }
                }
            } else {
                lines.forEach((l, i) => spans.push({ line: i, from: 0, to: l.length }))
            }
            const widget = new DeletedLinesWidget({
                lines, firstLineNumber: x.originalStart, spans, lineHeight: lh, tabSize: this.modifiedView.state.tabSize,
                indicators: this.o.renderIndicators, hideLineNumbers: this.o.compactMode,
            })
            items.push({ afterLine: x.modifiedStart - 1, height: lines.length * lh, el: widget.toDOM() as HTMLElement })
        }
    }

    /** 移动块:整块画框(第一行 / 末行补上下边)+ 起点上方一条 18px 说明 */
    private movedDecorations(i: 0 | 1, ranges: Range<Decoration>[], items: BlockItem[], extra: Map<number, number>) {
        const doc = (i ? this.modifiedView : this.originalView).state.doc
        const kind = i ? 'modified' : 'original'
        for (const mv of this.moves) {
            const start = i ? mv.modifiedStart : mv.originalStart
            const end = i ? mv.modifiedEnd : mv.originalEnd
            const active = mv === this.activeMove || mv === this.compareMove
            for (let n = start; n < end; n++) {
                const cls = `moved${i ? 'Modified' : 'Original'}${n === start ? ' moved-first' : ''}${n === end - 1 ? ' moved-last' : ''}${active ? ' currentMove' : ''}`
                ranges.push(core.Decoration.line({ class: cls }).range(doc.line(n).from))
            }
            items.push({ afterLine: start - 1, height: 18, el: new MovedCaptionWidget(kind, mv, mv === this.compareMove, this.host).toDOM() as HTMLElement })
            extra.set(start, (extra.get(start) ?? 0) + 18)
        }
        void MOVED_PADDING
    }

    // Monaco computeRangeAlignment(innerHunkAlignment = 并排):块内按未改动的行内文字再切几段,每段两侧补成一样高
    private align(items: [BlockItem[], BlockItem[]], captionExtra: [Map<number, number>, Map<number, number>]) {
        const o = this.originalView.state.doc
        const d = this.modifiedView.state.doc
        const lh = this.modifiedView.oracle.lineHeight
        const zones: [Zone[], Zone[]] = [[], []]
        const cm = this.compareMove
        // Monaco LineRange.delta(-1).deltaLength(2).contains(n):[start-1, end+1)
        const nearMove = (a: number, b: number, n: number) => a - 1 <= n && n < b + 1
        // 两个半开区间相交(相切也算,Monaco LineRange.intersect)
        const hit = (a: number, b: number, c: number, d: number) => Math.max(a, c) <= Math.min(b, d)
        if (this.sbs) {
            // 折行时一行占几个视觉行:按 heightMap 的实测/估高算(Monaco 对齐也是按视图里的真实行高),没折行就是行数 × 行高
            const rowsH = (v: LiteMonacoEditor, from: number, to: number) => {
                if (!v.lineWrapping) return (to - from) * lh
                let h = 0
                for (let n = from; n < to; n++) h += v.getBottomForLineNumber(n) - v.getTopForLineNumber(n)
                return h
            }
            const extra = (side: 0 | 1, from: number, to: number) => {
                let h = 0
                for (const [line, v] of captionExtra[side]) if (line >= from && line < to) h += v
                return h
            }
            const run = (x: LineRangeMapping, inMove: boolean) => {
                let first = true
                let lastO = x.originalStart
                let lastM = x.modifiedStart
                const emit = (oEx: number, mEx: number, force = false) => {
                    if (oEx < lastO || mEx < lastM) return
                    if (first) first = false
                    else if (!force && (oEx === lastO || mEx === lastM)) return
                    if (oEx === lastO && mEx === lastM) return
                    const delta = (rowsH(this.modifiedView, lastM, mEx) + extra(1, lastM, mEx)) - (rowsH(this.originalView, lastO, oEx) + extra(0, lastO, oEx))
                    // Compare 视图里,挨着移动块的普通对齐不要(块的对齐交给顶部空白和块内部的对齐)
                    // 块内部的对齐(inMove)只留与块相交的;普通对齐里挨着块的丢掉
                    const keep = inMove
                        ? cm && hit(lastO, oEx, cm.originalStart, cm.originalEnd) && hit(lastM, mEx, cm.modifiedStart, cm.modifiedEnd)
                        : true
                    if (keep) {
                        if (delta > 0) { if (inMove || !(cm && nearMove(cm.originalStart, cm.originalEnd, oEx - 1))) zones[0].push({ afterLine: oEx - 1, height: delta }) }
                        else if (delta < 0) { if (inMove || !(cm && nearMove(cm.modifiedStart, cm.modifiedEnd, mEx - 1))) zones[1].push({ afterLine: mEx - 1, height: -delta }) }
                    }
                    lastO = oEx
                    lastM = mEx
                }
                for (const c of x.innerChanges) {
                    const os = o.lineAt(c.originalFrom)
                    const ms = d.lineAt(c.modifiedFrom)
                    if (c.originalFrom > os.from && c.modifiedFrom > ms.from) emit(os.number, ms.number)
                    const oe = o.lineAt(c.originalTo)
                    if (c.originalTo < oe.to) emit(oe.number, d.lineAt(c.modifiedTo).number)
                }
                emit(x.originalEnd, x.modifiedEnd, true)
            }
            for (const x of this.mappings) run(x, false)
            // Compare 视图:块里面的改动按行内文字再对齐(Monaco alignmentsSyncedMovedText)
            if (cm) for (const x of cm.changes) run(x, true)
        }
        else {
            // 行内视图:修改侧在每处改动前放着被删行(整行)的块,原文侧(只露行号)要在原行之后垫出修改侧那几行,两列行号才对得上
            // (原文行 n_o 行;修改侧 = 被删块 n_o 行 + 修改行 n_m 行,没有被删块的真行内改动只有 n_m 行)
            for (const x of this.mappings) {
                const nO = x.originalEnd - x.originalStart
                const nM = x.modifiedEnd - x.modifiedStart
                const zone = nO > 0 ? items[1].find(it => it.afterLine === x.modifiedStart - 1 && it.el.classList.contains('inline-deleted-lines')) : undefined
                // 修改侧折行时一行占好几个视觉行:按实测高度算,不是行数 × 行高
                let mH = nM * lh
                if (this.modifiedView.lineWrapping) {
                    mH = 0
                    for (let n = x.modifiedStart; n < x.modifiedEnd; n++) mH += this.modifiedView.getBottomForLineNumber(n) - this.modifiedView.getTopForLineNumber(n)
                }
                const delta = (zone ? zone.height : 0) + mH - nO * lh
                if (delta > 0) zones[0].push({ afterLine: x.originalEnd - 1, height: delta })
                else if (delta < 0) zones[1].push({ afterLine: x.modifiedEnd - 1, height: -delta })
            }
        }
        for (const [i, v] of [this.originalView, this.modifiedView].entries()) {
            // Compare 视图的顶部空白
            if (this.topPad[i] > 0) zones[i].push({ afterLine: 0, height: this.topPad[i] })
            // 每个 afterLine 只留一个 view zone:对齐空白(斜纹)+ 该处的块节点(被删行 / 移动说明)的总高
            const total = new Map<number, number>()
            for (const z of zones[i]) total.set(z.afterLine, (total.get(z.afterLine) ?? 0) + z.height)
            for (const it of items[i]) total.set(it.afterLine, (total.get(it.afterLine) ?? 0) + it.height)
            const ids = [...total.keys()].map(k => `diff-zone-${k}`)
            const list = [
                ...[...total].map(([afterLine, height]) => ({ id: `diff-zone-${afterLine}`, zone: { afterLine, height } })),
                ...this.zoneIds[i].filter(id => !ids.includes(id)).map(id => ({ id, zone: null })),
            ]
            this.zoneIds[i] = ids
            this.zones[i] = zones[i]
            this.zoneAt[i] = total
            if (list.length) v.setViewZones(list)
        }
    }

    // —— 折叠未改区域 ——
    private refreshRegions() {
        const h = this.o.hideUnchangedRegions
        if (!h.enabled) {
            this.regions = undefined
            return
        }
        const od = this.originalView.state.doc.lines
        const md = this.modifiedView.state.doc.lines
        const fresh = UnchangedRegion.fromDiffs(this.mappings, od, md, h.minimumLineCount, h.contextLineCount)
        this.regions = transferUnchangedRegions(fresh, this.regions, od, md)
        if (this.pendingCollapsed) {
            const p = this.pendingCollapsed
            this.pendingCollapsed = undefined
            for (const r of this.regions) {
                const u = r.modifiedUnchangedRange
                const hit = p.find(x => Math.max(u.start, x.range[0]) <= Math.min(u.end, x.range[1]))
                if (hit) r.setHiddenModifiedRange({ start: hit.range[0], end: hit.range[1] })
            }
        }
    }

    /** 重取 modified 侧的大纲。没开折叠 / 没有 provider = 没有面包屑(Monaco 的 breadcrumbsSourceFactory 同理) */
    private refreshBreadcrumbs() {
        this.crumbCts?.dispose(true)
        this.crumbCts = undefined
        const model = this.modifiedView.getModel()
        const registry = languageFeatures.documentSymbolProvider
        if (!this.o.hideUnchangedRegions.enabled || !model || !registry.ordered(model).length) {
            if (this.crumbSymbols.length) { this.crumbSymbols = []; this.applyHidden() }
            return
        }
        const cts = this.crumbCts = new CancellationTokenSource()
        // provider 同步抛错时 create 也会同步抛:当它没给符号
        let pending: Promise<OutlineModel>
        try { pending = OutlineModel.create(registry, model, cts.token) } catch { pending = Promise.reject(new Error('outline')) }
        pending.then(m => {
            if (cts.token.isCancellationRequested || this.disposed) return
            this.crumbSymbols = m.asListOfDocumentSymbols()
            this.applyHidden()
        }, () => {})
    }

    /** Monaco getBreadcrumbItems:起点落在 range 里、终点落在 range 外的符号,范围大的(外层)在前 */
    getBreadcrumbItems(range: { start: number, end: number }): BreadcrumbItem[] {
        const inside = (n: number) => range.start <= n && n < range.end
        return this.crumbSymbols
            .filter(x => inside(x.range.startLineNumber) && !inside(x.range.endLineNumber))
            .sort((a, b) => (b.range.endLineNumber - b.range.startLineNumber) - (a.range.endLineNumber - a.range.startLineNumber))
            .map(x => ({ name: x.name, kind: x.kind, startLineNumber: x.range.startLineNumber }))
    }

    /** 整个文件都没改:不折叠(Monaco unchangedRegions 的特判) */
    private activeRegions(): UnchangedRegion[] {
        const rs = this.regions ?? []
        if (rs.length === 1 && rs[0].modifiedLineNumber === 1 && rs[0].lineCount === this.modifiedView.state.doc.lines) return []
        return rs
    }

    /** 编辑把行号挤歪了:区域起点跟着文档变化走,直到下一次 diff 重算 */
    private remapRegions(side: 0 | 1, tr: core.Transaction) {
        if (!this.regions?.length) return
        const v = side ? this.modifiedView : this.originalView
        const oldDoc = tr.startState.doc
        const nu = v.state.doc
        const next: UnchangedRegion[] = []
        for (const r of this.regions) {
            const first = side ? r.modifiedLineNumber : r.originalLineNumber
            const s = tr.changes.mapPos(lineStart(oldDoc, first), 1)
            const e = tr.changes.mapPos(lineStart(oldDoc, first + r.lineCount), -1)
            const newFirst = nu.lineAt(Math.min(s, nu.length)).number
            const endLine = e >= nu.length ? nu.lines + 1 : nu.lineAt(e).number + (e > nu.lineAt(e).from ? 1 : 0)
            const count = Math.max(0, endLine - newFirst)
            if (count <= 0) continue
            if (side) r.modifiedLineNumber = newFirst
            else r.originalLineNumber = newFirst
            const top = r.visibleLineCountTop, bottom = r.visibleLineCountBottom
            r.lineCount = count
            r.setState(top, bottom)
            next.push(r)
        }
        this.regions = next
        this.applyHidden()
    }

    private readonly host: DiffWidgetHost = {
        region: (side, firstLine) => this.regions?.find(r => (side ? r.modifiedLineNumber : r.originalLineNumber) === firstLine),
        regionsChanged: () => this.applyHidden(),
        revealLineCount: () => this.o.hideUnchangedRegions.revealLineCount,
        lineHeight: () => this.modifiedView.oracle.lineHeight,
        setDragging: r => {
            this.dom.classList.toggle('draggingUnchangedRegion', !!r?.isDragged)
            const fully = !!r && r.visibleLineCountTop + r.visibleLineCountBottom === r.lineCount
            const top = r?.isDragged === 'top'
            this.dom.classList.toggle('canMoveTop', r?.isDragged ? (top ? r.visibleLineCountTop > 0 : !fully) : false)
            this.dom.classList.toggle('canMoveBottom', r?.isDragged ? (top ? !fully : r.visibleLineCountBottom > 0) : false)
        },
        keepBottom: (side, endLine, fn) => {
            const v = side ? this.modifiedView : this.originalView
            const top = () => endLine > v.state.doc.lines ? v.metrics.height : this.textTop(v, endLine)
            const before = top()
            fn()
            this.applyHidden()
            v.scrollDOM.scrollTop += top() - before
        },
        revealModifiedLine: line => {
            if (!this.mappings.length) return
            for (const r of this.regions ?? []) {
                const h = r.getHiddenModifiedRange()
                if (h.start <= line && line < h.end) {
                    r.showModifiedLine(line, RevealPreference.FromBottom)
                    this.applyHidden()
                    return
                }
            }
        },
        toggleCompare: mv => {
            this.compareMove = this.compareMove === mv ? undefined : mv
            this.modifiedView.focus()
            this.render()
        },
    }

    private hiddenKind(i: number, idx: number, count: number): HiddenKind {
        if (!this.sbs && i === 0) return 'none'
        if (this.o.compactMode) return idx === 0 || idx === count - 1 ? 'none' : 'compact'
        return 'full'
    }

    /** 折叠区 → 两侧的块替换装饰(藏起来的行)+ 控制条 + 未改行底色 + 小折叠箭头 */
    private applyHidden() {
        if (this.disposed) return
        const regions = this.activeRegions()
        for (const [i, v] of [this.originalView, this.modifiedView].entries()) {
            const doc = v.state.doc
            const ranges: Range<Decoration>[] = []
            regions.forEach((r, idx) => {
                const all = i ? r.modifiedUnchangedRange : r.originalUnchangedRange
                const hidden = i ? r.getHiddenModifiedRange() : r.getHiddenOriginalRange()
                const bg = core.Decoration.line({ class: 'diff-unchanged-lines' })
                for (let n = all.start; n < all.end; n++) {
                    if (n >= hidden.start && n < hidden.end) continue
                    if (n <= doc.lines) ranges.push(bg.range(doc.line(n).from))
                }
                if (r.shouldHideControls() && all.start <= doc.lines) {
                    ranges.push(core.Decoration.line({ class: '', gutterMarker: 'fold-unchanged codicon codicon-fold' }).range(doc.line(all.start).from))
                }
                if (hidden.end <= hidden.start) return
                const from = lineStart(doc, hidden.start)
                const to = doc.line(Math.min(hidden.end - 1, doc.lines)).to
                if (from >= to) return
                const widget = new HiddenLinesWidget({
                    side: i as 0 | 1,
                    firstLine: all.start,
                    kind: this.hiddenKind(i, idx, regions.length),
                    hiddenCount: r.hiddenLineCount,
                    top: r.visibleLineCountTop,
                    bottom: r.visibleLineCountBottom,
                    lineCount: r.lineCount,
                    dragged: r.isDragged,
                    breadcrumbs: this.crumbSymbols.length ? this.getBreadcrumbItems(r.getHiddenModifiedRange()) : undefined,
                }, this.host)
                ranges.push(core.Decoration.replace({ widget }).range(from, to))
            })
            // 折叠改了行高,视图只在折叠类 effect 时重建 heightMap / gutter;unfoldEffect.of(0) 是没有折叠的行号,
            // 对折叠状态是空操作,只当"重算高度"的触发
            const has = ranges.some(r => (r.value as { isReplace?: boolean }).isReplace)
            const rebuild = has || this.hiddenBefore[i]
            this.hiddenBefore[i] = has
            const set = setHidden.of(core.RangeSet.of(ranges, true))
            v.dispatch(v.state.update({ effects: rebuild ? [set, unfoldEffect.of(0)] : [set] }))
        }
        this.paint()
    }

    /** 光标 / 选区落进折叠的行 → 把它们展开(Monaco ensureXLineIsVisible) */
    private revealSelection(side: 0 | 1) {
        if (this.revealing || !this.regions?.length) return
        const v = side ? this.modifiedView : this.originalView
        const doc = v.state.doc
        let changed = false
        this.revealing = true
        try {
            for (const r of v.state.selection.ranges) {
                for (const pos of [r.from, r.to]) {
                    const line = doc.lineAt(pos).number
                    for (const reg of this.regions) {
                        const hidden = side ? reg.getHiddenModifiedRange() : reg.getHiddenOriginalRange()
                        if (line < hidden.start || line >= hidden.end) continue
                        if (side) reg.showModifiedLine(line, RevealPreference.FromCloserSide)
                        else reg.showOriginalLine(line, RevealPreference.FromCloserSide)
                        changed = true
                    }
                }
            }
        } finally { this.revealing = false }
        if (changed) this.applyHidden()
    }

    /** 把某一侧的某一行露出来并放光标(无障碍查看器 Enter、导航) */
    private revealSideLine(side: 0 | 1, line: number) {
        const v = side ? this.modifiedView : this.originalView
        const doc = v.state.doc
        const n = Math.min(Math.max(1, line), doc.lines)
        v.dispatch(v.state.update({ selection: { anchor: doc.line(n).from } }))
        this.scrollToLine(v, n)
        v.focus()
    }

    private scrollToLine(v: core.EditorView, n: number) {
        const sd = v.scrollDOM
        const h = sd.clientHeight
        if (!h) return
        const top = this.textTop(v, n)
        sd.scrollTop = Math.max(0, top - h / 2)
    }

    collapseAllUnchangedRegions() {
        for (const r of this.regions ?? []) r.collapseAll()
        this.applyHidden()
    }
    showAllUnchangedRegions() {
        for (const r of this.regions ?? []) r.showAll()
        this.applyHidden()
    }
    /** gaps 里叫 expandAll…;Monaco 的方法名是 showAllUnchangedRegions */
    expandAllUnchangedRegions() { this.showAllUnchangedRegions() }
    /** Monaco `diffEditor.toggleCollapseUnchangedRegions`:翻 hideUnchangedRegions.enabled */
    toggleCollapseUnchangedRegions() {
        this.updateOptions({ hideUnchangedRegions: { enabled: !this.o.hideUnchangedRegions.enabled } })
    }
    toggleUseInlineViewWhenSpaceIsLimited() {
        this.updateOptions({ useInlineViewWhenSpaceIsLimited: !this.o.useInlineViewWhenSpaceIsLimited })
    }
    toggleShowMovedCodeBlocks() {
        this.updateOptions({ experimental: { showMoves: !this.o.experimental.showMoves } })
    }

    // —— 移动块 ——
    private updateActiveMove(side: 0 | 1) {
        if (!this.showMoves) return
        const v = side ? this.modifiedView : this.originalView
        const line = v.state.doc.lineAt(v.state.selection.main.head).number
        const mv = this.moves.find(m => side ? m.modifiedStart <= line && line < m.modifiedEnd : m.originalStart <= line && line < m.originalEnd)
        // Monaco:光标不在正比较的那块里 → 退出 Compare(movedText !== movedTextToCompare 就清掉),哪怕 activeMove 没变
        const leave = !!this.compareMove && this.compareMove !== mv
        if (mv === this.activeMove && !leave) return
        this.activeMove = mv
        if (leave) this.compareMove = undefined
        this.render()
    }

    exitCompareMove() {
        if (!this.compareMove) return
        this.compareMove = undefined
        this.render()
    }

    private paintMoves() {
        const svg = this.movedSvg
        svg.replaceChildren()
        if (!this.showMoves || !this.moves.length) {
            this.movedWidth = 0
            svg.style.display = 'none'
            return
        }
        const o = this.originalView, m = this.modifiedView
        const mid = (v: core.EditorView, s: number, e: number) => (this.textTop(v, s) + this.textTop(v, e)) / 2
        const lines = this.moves.map(mv => {
            const start = mid(o, mv.originalStart, mv.originalEnd)
            const end = mid(m, mv.modifiedStart, mv.modifiedEnd)
            const from = start - o.scrollDOM.scrollTop
            const to = end - m.scrollDOM.scrollTop
            return { mv, from, to, a: start, b: end, top: Math.min(start, end), bottom: Math.max(start, end) }
        })
        lines.sort((p, q) => {
            const pb = p.a > p.b, qb = q.a > q.b
            if (pb !== qb) return pb ? 1 : -1
            return (pb ? p.a : -p.b) - (qb ? q.a : -q.b)
        })
        const tracks = layoutTracks(lines)
        const trackCount = tracks.reduce((n, t) => Math.max(n, t + 1), 0)
        const padding = 10
        const vsb = this.originalView.dom.querySelector<HTMLElement>(':scope > .cm-scrollbar')?.offsetWidth ?? 0
        const contentLeft = this.modifiedView.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0
        const lineAreaWidth = (trackCount - 1) * 10 + padding * 2
        if (lineAreaWidth !== this.movedWidth) {
            this.movedWidth = lineAreaWidth
            queueMicrotask(() => this.layout())
        }
        const width = vsb + lineAreaWidth + (contentLeft - MOVED_PADDING)
        const NS = 'http://www.w3.org/2000/svg'
        lines.forEach((line, idx) => {
            const x = vsb + padding + tracks[idx] * 10
            const rect = document.createElementNS(NS, 'rect')
            rect.setAttribute('class', 'arrow-rectangle')
            rect.setAttribute('x', String(width - contentLeft))
            rect.setAttribute('y', String(line.to - 9))
            rect.setAttribute('width', String(contentLeft))
            rect.setAttribute('height', '18')
            svg.appendChild(rect)
            const g = document.createElementNS(NS, 'g')
            const path = document.createElementNS(NS, 'path')
            const active = line.mv === this.activeMove
            path.setAttribute('d', `M 0 ${line.from} L ${x} ${line.from} L ${x} ${line.to} L ${width - 15} ${line.to}`)
            if (active) path.setAttribute('class', 'currentMove')
            g.appendChild(path)
            const arrow = document.createElementNS(NS, 'polygon')
            arrow.setAttribute('class', active ? 'arrow currentMove' : 'arrow')
            arrow.setAttribute('points', `${width - 15},${line.to - 7.5} ${width},${line.to} ${width - 15},${line.to + 7.5}`)
            g.appendChild(arrow)
            svg.appendChild(g)
        })
        svg.style.display = ''
        svg.style.left = `${this.panes[0].offsetLeft + this.panes[0].offsetWidth - vsb}px`
        svg.style.height = `${this.dom.clientHeight}px`
        svg.style.width = `${vsb + contentLeft - MOVED_PADDING + lineAreaWidth}px`
    }

    // —— 无障碍 diff 查看器 ——
    private get viewerVisible() { return this.o.onlyShowAccessibleDiffViewer || this.viewerShould }

    private setViewerVisible(v: boolean) {
        this.viewerShould = v
        this.applyViewer()
    }

    private applyViewer() {
        const vis = this.viewerVisible
        if (vis !== this.viewer.isVisible) this.viewer.setVisible(vis)
        for (const el of [this.panes[0], this.panes[1], this.gutter, this.overview, this.sash, this.movedSvg]) el.style.visibility = vis ? 'hidden' : 'visible'
        this.viewerHost.style.pointerEvents = vis ? 'auto' : 'none'
    }

    /** F7:没显示就显示,已显示就跳到下一组改动 */
    accessibleDiffViewerNext() { this.viewer.next() }
    /** Shift+F7:总是显示,跳到上一组 */
    accessibleDiffViewerPrev() { this.viewer.prev() }

    private paint() {
        if (this.disposed) return
        this.measureGutters()
        this.paintFills()
        this.paintBlocks()
        this.paintGutter()
        this.paintOverview()
        this.paintMoves()
    }

    /** 折叠条左边的小格子要和行号栏一样宽 */
    private measureGutters() {
        const w = this.modifiedView.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0
        if (w) this.dom.style.setProperty('--diff-gutter-w', `${w}px`)
    }

    // 对齐空白里的斜纹(Monaco createFakeLinesDiv → .diagonal-fill),zone 在 heightmap 里有位置,不随视口重画
    private paintFills() {
        for (const [i, v] of [this.originalView, this.modifiedView].entries()) {
            const layer = this.fills[i]
            const sd = v.scrollDOM
            if (!sd.clientHeight) { layer.replaceChildren(); continue }
            const doc = v.state.doc
            const lr = layer.getBoundingClientRect()
            const cr = v.contentDOM.getBoundingClientRect()
            const dx = cr.left - lr.left
            const dy = cr.top - lr.top
            const width = Math.max(sd.scrollWidth, sd.clientWidth) - dx
            const frag = document.createDocumentFragment()
            for (const z of this.zones[i]) {
                const top = z.afterLine >= doc.lines ? v.lineBlockAt(doc.length).bottom : v.lineBlockAt(doc.line(z.afterLine + 1).from).top - z.height
                const n = document.createElement('div')
                n.className = 'diagonal-fill'
                n.style.cssText = `left:${dx}px;top:${dy + top}px;width:${width}px;height:${z.height}px`
                frag.appendChild(n)
            }
            // 字级改动(Monaco 是满行高的 className 装饰,画在正文下):mark 只留类钩子,按它的 x 范围和所在行画框
            for (const span of v.contentDOM.querySelectorAll('span.char-insert:not(.diff-range-empty), span.char-delete:not(.diff-range-empty)')) {
                const line = span.closest('.cm-line')
                if (!line) continue
                const r = span.getBoundingClientRect()
                const row = line.getBoundingClientRect()
                const n = document.createElement('div')
                n.className = span.classList.contains('char-insert') ? 'char-insert' : 'char-delete'
                n.style.cssText = `left:${r.left - lr.left}px;top:${row.top - lr.top}px;width:${r.width}px;height:${row.height}px`
                frag.appendChild(n)
            }
            layer.replaceChildren(frag)
        }
    }

    // 被删行 / 移动说明:zone 只留了空白,节点画在这一层。同一处的节点从空白顶部往下排,斜纹留在贴着下一行的那一段
    private paintBlocks() {
        for (const [i, v] of [this.originalView, this.modifiedView].entries()) {
            const layer = this.layers[i]
            const sd = v.scrollDOM
            if (!this.items[i].length) { layer.replaceChildren(); continue }
            if (!sd.clientHeight) { layer.replaceChildren(...this.items[i].map(it => it.el)); continue }
            const doc = v.state.doc
            const lr = layer.getBoundingClientRect()
            const cr = v.contentDOM.getBoundingClientRect()
            const dx = cr.left - lr.left
            const dy = cr.top - lr.top
            const width = Math.max(sd.scrollWidth, sd.clientWidth) - dx
            const used = new Map<number, number>()
            const gutterW = v.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0
            const frag = document.createDocumentFragment()
            for (const it of this.items[i]) {
                const total = this.zoneAt[i].get(it.afterLine) ?? it.height
                const base = it.afterLine >= doc.lines ? v.lineBlockAt(doc.length).bottom : v.lineBlockAt(doc.line(it.afterLine + 1).from).top - total
                const off = used.get(it.afterLine) ?? 0
                used.set(it.afterLine, off + it.height)
                // 被删行连行号一起画,号落在 gutter 那一列里,正文和修改侧对齐
                const gw = it.el.classList.contains('inline-deleted-lines') ? gutterW : 0
                it.el.style.cssText += `;position:absolute;left:${dx - gw}px;top:${dy + base + off}px;width:${width + gw}px;height:${it.height}px`
                frag.appendChild(it.el)
            }
            layer.replaceChildren(frag)
        }
    }

    // Monaco getTopForLineNumber(n):行 n 文字的顶,在它上方的对齐空白之下;n 超过末行时是末行之后的空白底
    private textTop(v: core.EditorView, n: number) {
        const doc = v.state.doc
        if (n > doc.lines) return v.lineBlockAt(doc.length).bottom + (this.zoneAt[v === this.modifiedView ? 1 : 0].get(doc.lines) ?? 0)
        return v.lineBlockAt(doc.line(n).from).top
    }

    private selectedChanges() {
        const v = this.modifiedView
        const sels = v.state.selection.ranges.filter(r => !r.empty)
        if (!sels.length) return []
        const doc = v.state.doc
        const out: LineRangeMapping['innerChanges'] = []
        for (const x of this.mappings) {
            const hit = sels.some(r => doc.lineAt(r.from).number < x.modifiedEnd && x.modifiedStart < doc.lineAt(r.to).number + 1)
            if (!hit) continue
            for (const c of x.innerChanges) if (sels.some(r => c.modifiedFrom < r.to && r.from < c.modifiedTo)) out.push(c)
        }
        return out
    }

    // Monaco DiffEditorGutter + EditorGutter + DiffToolBar
    private paintGutter() {
        this.paintRevertArrows()
        if (!this.gutterW) return
        const v = this.modifiedView
        const doc = v.state.doc
        const sd = v.scrollDOM
        const gr = this.gutter.getBoundingClientRect()
        const dy = v.contentDOM.getBoundingClientRect().top - gr.top
        const viewH = this.gutter.clientHeight
        const head = doc.lineAt(v.state.selection.main.head).number
        const selected = this.selectedChanges()
        const items = selected.length
            ? [{ start: doc.lineAt(selected[0].modifiedFrom).number, end: doc.lineAt(selected[selected.length - 1].modifiedTo).number + 1, showAlways: true, title: 'Revert Selection', run: () => this.revertChanges(selected) }]
            : this.mappings.map(x => ({ start: x.modifiedStart, end: x.modifiedEnd, showAlways: x.modifiedStart <= head && head < x.modifiedEnd, title: 'Revert Block', run: () => this.revertMapping(x) }))
        const vpFirst = doc.lineAt(v.viewport.from).number
        const vpEnd = doc.lineAt(v.viewport.to).number + 1
        const deco = document.createElement('div')
        deco.className = sd.scrollTop > 0 ? 'cm-scroll-decoration cm-visible' : 'cm-scroll-decoration'
        const frag = document.createDocumentFragment()
        frag.appendChild(deco)
        const placed: { buttons: HTMLElement, top: number, bottom: number }[] = []
        for (const it of items) {
            if (!(it.start < vpEnd && vpFirst < Math.max(it.end, it.start + 1))) continue
            const top = dy + (it.start <= doc.lines ? this.textTop(v, it.start) - (this.zoneAt[1].get(it.start - 1) ?? 0) : v.lineBlockAt(doc.length).bottom)
            const bottom = Math.max(top, dy + this.textTop(v, it.end === 1 ? it.start : it.end))
            const wrap = document.createElement('div')
            wrap.style.top = `${top}px`
            wrap.style.height = `${bottom - top}px`
            const item = document.createElement('div')
            item.className = it.showAlways ? 'gutterItem showAlways' : 'gutterItem'
            item.style.height = '20px'
            item.style.width = '34px'
            const bg = document.createElement('div')
            bg.className = 'background'
            const buttons = document.createElement('div')
            buttons.className = 'buttons'
            const actions = document.createElement('div')
            actions.className = 'actions-container'
            actions.setAttribute('role', 'toolbar')
            const action = document.createElement('div')
            action.className = 'action-item'
            const label = document.createElement('a')
            label.className = 'action-label codicon codicon-arrow-right'
            label.setAttribute('role', 'button')
            label.setAttribute('aria-label', it.title)
            label.title = it.title
            label.addEventListener('click', e => {
                e.preventDefault()
                it.run()
            })
            action.appendChild(label)
            actions.appendChild(action)
            buttons.appendChild(actions)
            item.append(bg, buttons)
            wrap.appendChild(item)
            frag.appendChild(wrap)
            placed.push({ buttons, top, bottom })
        }
        this.gutter.replaceChildren(frag)
        // DiffToolBar.layout:按钮放在块的竖向中间,块够高时夹在视口里
        for (const { buttons, top, bottom } of placed) {
            const itemH = buttons.clientHeight
            let at = top + (bottom - top) / 2 - itemH / 2
            const vpLo = itemH
            const vpHi = viewH - itemH - itemH
            const pLo = top + itemH
            const pHi = bottom - itemH - itemH
            if (vpLo <= vpHi && pLo < pHi) {
                at = Math.min(Math.max(at, vpLo), vpHi - 1)
                at = Math.min(Math.max(at, pLo), pHi - 1)
            }
            buttons.style.top = `${at - top}px`
        }
    }

    // Monaco shouldRenderOldRevertArrows:没有 gutter 菜单、并排、非只读、renderMarginRevertIcon 时,改动块首行的边栏里放一个回退箭头
    private paintRevertArrows() {
        const host = this.revertArrows
        // Compare 视图里不画回退箭头(Monaco revertButtonsFeature:movedTextToCompare 时直接 return)
        const show = this.o.renderMarginRevertIcon && this.sbs && !this.readOnly && !this.o.renderGutterMenu && !this.compareMove
        if (!show) {
            host.replaceChildren()
            return
        }
        const v = this.modifiedView
        const doc = v.state.doc
        const lh = v.oracle.lineHeight
        const frag = document.createDocumentFragment()
        const cr = v.contentDOM.getBoundingClientRect()
        const pr = this.panes[1].getBoundingClientRect()
        const dy = cr.top - pr.top
        for (const x of this.mappings) {
            if (x.modifiedStart > doc.lines) continue
            const a = document.createElement('div')
            a.className = 'arrow-revert-change codicon codicon-arrow-right'
            a.title = 'Revert Block'
            a.setAttribute('role', 'button')
            a.style.cssText = `position:absolute;left:0;top:${dy + this.textTop(v, x.modifiedStart)}px;width:${lh}px;height:${lh}px;line-height:${lh}px;text-align:center;cursor:pointer`
            a.addEventListener('mousedown', e => e.stopPropagation())
            a.addEventListener('click', e => {
                e.preventDefault()
                this.revertMapping(x)
            })
            frag.appendChild(a)
        }
        host.replaceChildren(frag)
    }

    // Monaco OverviewRulerFeature:两条 15px 的尺(original 删除色 / modified 插入色)+ modified 的视口滑块
    private paintOverview() {
        if (!this.o.renderOverviewRuler) return
        const h = this.dom.clientHeight
        const frag = document.createDocumentFragment()
        const lanes = [
            { view: this.originalView, color: 'var(--lm-diffEditorOverview-removedForeground)', cls: 'original' },
            { view: this.modifiedView, color: 'var(--lm-diffEditorOverview-insertedForeground)', cls: 'modified' },
        ]
        for (const [i, lane] of lanes.entries()) {
            const el = document.createElement('div')
            el.className = `${lane.cls} diffOverviewRuler`
            el.style.left = `${i * LANE_W}px`
            // 行内视图里原文侧看不见:删除量画在修改侧被删行块的位置上
            const inlineOrig = i === 0 && !this.sbs
            const v = inlineOrig ? this.modifiedView : lane.view
            const ratio = h / Math.max(1, v.metrics.height)
            const lh = v.oracle.lineHeight
            for (const x of this.mappings) {
                const start = inlineOrig ? x.modifiedStart : i ? x.modifiedStart : x.originalStart
                const count = (inlineOrig ? x.originalEnd - x.originalStart : (i ? x.modifiedEnd : x.originalEnd) - start)
                if (count <= 0) continue
                const y = inlineOrig ? this.textTop(v, start) - (this.zoneAt[1].get(start - 1) ?? 0) : this.textTop(v, start)
                let y1 = Math.floor(ratio * y)
                let y2 = Math.floor(ratio * (y + count * lh))
                if (y2 - y1 < 4) {
                    const mid = Math.floor((y1 + y2) / 2)
                    y1 = mid - 2
                    y2 = mid + 2
                }
                const z = document.createElement('div')
                z.style.cssText = `top:${y1}px;height:${y2 - y1}px;background:${lane.color}`
                el.appendChild(z)
            }
            frag.appendChild(el)
        }
        const sd = this.modifiedView.scrollDOM
        const g = core.vScrollGeometry(h, this.modifiedView.metrics.height, sd.scrollTop)
        const slider = document.createElement('div')
        slider.className = 'diffViewport'
        slider.style.top = `${g.hidden ? 0 : g.thumbTop}px`
        slider.style.height = `${g.hidden ? h : g.thumbHeight}px`
        frag.appendChild(slider)
        this.overview.replaceChildren(frag)
    }

    // —— 公开 API(Monaco IDiffEditor / IStandaloneDiffEditor) ——
    getOriginal(): string { return this.originalView.state.sliceDoc() }
    getModified(): string { return this.modifiedView.state.sliceDoc() }
    getMappings(): readonly LineRangeMapping[] { return this.mappings }
    getContainerDomNode(): HTMLElement { return this.dom }
    getOriginalEditor(): LiteMonacoEditor { return this.originalView }
    getModifiedEditor(): LiteMonacoEditor { return this.modifiedView }
    /** Monaco getEditorType:'vs.editor.IDiffEditor' */
    getEditorType(): string { return EditorType.IDiffEditor }
    /** 当前这一对 model(Monaco IDiffEditorModel):两侧编辑器各自的 ITextModel。换 model 之前没人要过 = 编辑器隐式建的那一对 */
    getModel(): IDiffEditorModel | null {
        const original = this.originalView.getModel()
        const modified = this.modifiedView.getModel()
        return original && modified ? { original, modified } : null
    }
    /**
     * Monaco setModel:IDiffEditorModel(两个 ITextModel)或 createViewModel 的结果;null = 清空。
     * 为兼容旧用法,`{ original: string, modified: string }` 仍然接受,等同 setModels(重建两侧,撤销栈归新文本)。
     */
    setModel(model: IDiffEditorModel | IDiffEditorViewModel | { original: string, modified: string } | null): void {
        const m = model && 'model' in model ? model.model : model
        if (m && typeof m.original === 'string' && typeof m.modified === 'string') { this.setModels(m.original, m.modified); return }
        const dm = m as IDiffEditorModel | null
        const old = this.getModel()
        if (dm && old && dm.original === old.original && dm.modified === old.modified) return
        const ev = { oldModelUrl: null, newModelUrl: null }
        this.originalView.setModel(dm ? dm.original : null)
        this.modifiedView.setModel(dm ? dm.modified : null)
        this.upToDate = false
        this.snap = undefined
        this.regions = undefined
        this.smartInline = undefined
        this.activeMove = undefined
        this.compareMove = undefined
        this.recompute()
        this.layout()
        for (const fn of [...this.modelListeners]) fn(ev)
    }
    /** Monaco createViewModel:不挂到编辑器上,只持有 model、能等 diff;setModel 接受它 */
    createViewModel(model: IDiffEditorModel): IDiffEditorViewModel {
        return { model, waitForDiff: () => this.waitForDiff(), dispose() { /* 没有额外资源 */ } }
    }
    /** Monaco onDidChangeModel */
    readonly onDidChangeModel: IEvent<void> = listener => {
        const fn = () => listener()
        this.modelListeners.add(fn)
        return { dispose: () => { this.modelListeners.delete(fn) } } satisfies IDisposable
    }
    /** Monaco onDidDispose */
    readonly onDidDispose: IEvent<void> = listener => {
        const fn = () => listener()
        this.disposeListeners.add(fn)
        return { dispose: () => { this.disposeListeners.delete(fn) } } satisfies IDisposable
    }
    /** Monaco getId:`<editorType>:v2:<序号>` */
    getId(): string { return `${this.getEditorType()}:v2:${this.id}` }
    /** Monaco onVisible / onHide:没有可见性相关的资源,空实现 */
    onVisible(): void {}
    onHide(): void {}
    /**
     * 两侧的视图状态(滚动、选区、折叠)+ diff 自己的 modelState(Monaco serializeState:每段未改区域当前折叠的 modified 行区间,
     * `{ collapsedRegions: [{ range: [start, endExclusive] }] }`)
     */
    saveViewState(): IDiffEditorViewState {
        const collapsedRegions = this.regions?.map(r => {
            const h = r.getHiddenModifiedRange()
            return { range: [h.start, h.end] as [number, number] }
        })
        return { original: this.originalView.saveViewState(), modified: this.modifiedView.saveViewState(), modelState: { collapsedRegions } }
    }
    restoreViewState(state: IDiffEditorViewState | null): void {
        if (!state || !state.original || !state.modified) return
        this.originalView.restoreViewState(state.original)
        this.modifiedView.restoreViewState(state.modified)
        const ranges = (state.modelState as { collapsedRegions?: { range: [number, number] }[] } | undefined)?.collapsedRegions
        if (!ranges) return
        // 区域要等 diff 算完才有:还没算完就先存着,refreshRegions 里补上
        if (this.regions) this.applyCollapsedRanges(ranges)
        else this.pendingCollapsed = ranges
    }
    private pendingCollapsed: { range: [number, number] }[] | undefined
    /** Monaco restoreSerializedState:每段区域找第一个与它相交(含相切)的存档区间,把折叠部分设成它 */
    private applyCollapsedRanges(ranges: { range: [number, number] }[]) {
        if (!this.regions) return
        for (const r of this.regions) {
            const u = r.modifiedUnchangedRange
            const hit = ranges.find(x => Math.max(u.start, x.range[0]) <= Math.min(u.end, x.range[1]))
            if (hit) r.setHiddenModifiedRange({ start: hit.range[0], end: hit.range[1] })
        }
        this.applyHidden()
    }
    handleInitialized(): void {
        this.originalView.handleInitialized()
        this.modifiedView.handleInitialized()
    }

    /** diff 算完(含编辑后的重算)触发。返回 IDisposable */
    readonly onDidUpdateDiff: IEvent<void> = listener => {
        const fn = () => listener()
        this.updateListeners.add(fn)
        return { dispose: () => { this.updateListeners.delete(fn) } } satisfies IDisposable
    }

    /** Monaco getLineChanges(已弃用,仍在 IDiffEditor 上):1-based 闭区间,纯插入 / 删除的那一侧 EndLineNumber 是 0 */
    getLineChanges(): ILineChange[] | null {
        if (!this.snap) return null
        const [od, md] = this.snap
        const pos = (doc: Doc, off: number): [number, number] => {
            const l = doc.lineAt(Math.min(off, doc.length))
            return [l.number, Math.min(off, doc.length) - l.from + 1]
        }
        return this.mappings.map(x => {
            const oEmpty = x.originalStart === x.originalEnd
            const mEmpty = x.modifiedStart === x.modifiedEnd
            const inner = oEmpty || mEmpty ? undefined : x.innerChanges
            return {
                originalStartLineNumber: oEmpty ? x.originalStart - 1 : x.originalStart,
                originalEndLineNumber: oEmpty ? 0 : x.originalEnd - 1,
                modifiedStartLineNumber: mEmpty ? x.modifiedStart - 1 : x.modifiedStart,
                modifiedEndLineNumber: mEmpty ? 0 : x.modifiedEnd - 1,
                charChanges: inner?.map(c => {
                    const [osl, osc] = pos(od, c.originalFrom), [oel, oec] = pos(od, c.originalTo)
                    const [msl, msc] = pos(md, c.modifiedFrom), [mel, mec] = pos(md, c.modifiedTo)
                    return {
                        originalStartLineNumber: osl, originalStartColumn: osc, originalEndLineNumber: oel, originalEndColumn: oec,
                        modifiedStartLineNumber: msl, modifiedStartColumn: msc, modifiedEndLineNumber: mel, modifiedEndColumn: mec,
                    }
                }),
            }
        })
    }

    /** Monaco getDiffComputationResult:当前这一次 diff 的结果(还没算过是 null) */
    getDiffComputationResult(): IDocumentDiff | null {
        if (!this.snap) return null
        return { identical: this.identical, quitEarly: this.quitEarly, changes: this.mappings, moves: this.moves }
    }

    /** diff 是最新的就马上 resolve,否则等下一次算完 */
    waitForDiff(): Promise<void> {
        if (this.upToDate) return Promise.resolve()
        return new Promise(resolve => this.waiters.push(resolve))
    }

    /** 滚到并选中第一处改动(Monaco revealFirstDiff:等 diff 算完) */
    revealFirstDiff(): void {
        void this.waitForDiff().then(() => {
            if (!this.disposed && this.mappings.length) this.goToMapping(this.mappings[0])
        })
    }

    /** Monaco updateOptions:只改传进来的;diff 自己的项校验、编辑器选项交给两侧 */
    updateOptions(changed: IDiffEditorOptions): void {
        const { diff, editor } = splitDiffOptions(changed as Record<string, unknown>)
        const prev = this.o
        const validated = validateDiffEditorOptions(diff, prev)
        // Monaco 在这里会把没传的 splitViewDefaultRatio 重置成 0.5;当成漏洞,保持现值
        if (diff.splitViewDefaultRatio === undefined) validated.splitViewDefaultRatio = prev.splitViewDefaultRatio
        this.o = validated
        if ('readOnly' in editor) this.readOnly = !!(editor as { readOnly?: boolean }).readOnly
        if (Object.keys(editor).length) this.editorOpts = core.mergeRawOptions(this.editorOpts, editor)
        const hu = this.o.hideUnchangedRegions
        if (hu.enabled !== prev.hideUnchangedRegions.enabled) this.regions = undefined
        const recompute = prev.diffAlgorithm !== this.o.diffAlgorithm || prev.ignoreTrimWhitespace !== this.o.ignoreTrimWhitespace
            || prev.maxComputationTime !== this.o.maxComputationTime || prev.experimental.showMoves !== this.o.experimental.showMoves
        if (prev.diffWordWrap !== this.o.diffWordWrap || 'wordWrap' in editor) {
            this.originalView.reconfigure({ lineWrapping: this.wrapFor(0) })
            this.modifiedView.reconfigure({ lineWrapping: this.wrapFor(1) })
        }
        this.reconfigureSides()
        const sbs = this.computeSideBySide()
        if (sbs !== this.sbs) {
            this.sbs = sbs
            this.dom.classList.toggle('side-by-side', sbs)
            this.originalView.reconfigure({ lineWrapping: this.wrapFor(0) })
            this.reconfigureSides()
            this.recompute()
        } else if (recompute) this.recompute()
        else {
            if (JSON.stringify(hu) !== JSON.stringify(prev.hideUnchangedRegions)) this.refreshRegions()
            if (hu.enabled !== prev.hideUnchangedRegions.enabled) this.refreshBreadcrumbs()
            this.render()
        }
        if ('onlyShowAccessibleDiffViewer' in diff) this.applyViewer()
        this.layout()
    }

    /** 按 id 执行一个动作(Monaco 的命令 id);不认识的返回 false */
    runAction(id: string, arg?: { mapping?: { innerChanges?: LineRangeMapping['innerChanges'] } }): boolean {
        switch (id) {
            // Monaco RevertHunkOrSelection(f1:false,没有默认快捷键;gutter 工具栏按钮的命令):arg.mapping.innerChanges 换回 original
            case 'diffEditor.revert': this.revertRangeMappings(arg?.mapping?.innerChanges ?? []); return true
            case 'diffEditor.toggleCollapseUnchangedRegions': this.toggleCollapseUnchangedRegions(); return true
            case 'diffEditor.collapseAllUnchangedRegions': this.collapseAllUnchangedRegions(); return true
            case 'diffEditor.showAllUnchangedRegions':
            case 'diffEditor.expandAllUnchangedRegions': this.showAllUnchangedRegions(); return true
            case 'diffEditor.toggleShowMovedCodeBlocks': this.toggleShowMovedCodeBlocks(); return true
            case 'diffEditor.toggleUseInlineViewWhenSpaceIsLimited': this.toggleUseInlineViewWhenSpaceIsLimited(); return true
            case 'diffEditor.switchSide': this.switchSide(); return true
            case 'diffEditor.exitCompareMove': this.exitCompareMove(); return true
            case 'editor.action.accessibleDiffViewer.next': this.accessibleDiffViewerNext(); return true
            case 'editor.action.accessibleDiffViewer.prev': this.accessibleDiffViewerPrev(); return true
            default: return false
        }
    }

    /** Monaco mapToOtherSide:焦点在哪边,就把那边的选区换算到另一边 */
    mapToOtherSide(): { destination: core.EditorView, destinationSelection: { anchor: number, head: number } | undefined } {
        const modFocus = this.modifiedView.hasFocus
        const source = modFocus ? this.modifiedView : this.originalView
        const destination = modFocus ? this.originalView : this.modifiedView
        const maps = this.mappings.map(x => modFocus
            ? { s0: x.modifiedStart, s1: x.modifiedEnd, d0: x.originalStart, d1: x.originalEnd }
            : { s0: x.originalStart, s1: x.originalEnd, d0: x.modifiedStart, d1: x.modifiedEnd })
        const sd = source.state.doc
        const dd = destination.state.doc
        const sel = source.state.selection.main
        const toPos = (pos: number) => {
            const l = sd.lineAt(pos)
            const n = Math.min(Math.max(1, translateLine(l.number, maps)), dd.lines)
            return dd.line(n).from + Math.min(pos - l.from, dd.line(n).length)
        }
        return { destination, destinationSelection: { anchor: toPos(sel.anchor), head: toPos(sel.head) } }
    }

    switchSide(): void {
        const { destination, destinationSelection } = this.mapToOtherSide()
        destination.focus()
        if (destinationSelection) destination.dispatch(destination.state.update({ selection: destinationSelection }))
    }

    focus(): void { this.modifiedView.focus() }
    hasTextFocus(): boolean { return this.originalView.hasFocus || this.modifiedView.hasFocus }

    /** 换一对文本(Monaco setModel):两侧重建,撤销栈、选区、滚动都归新模型 */
    setModels(original: string, modified: string) {
        for (const fn of this.paneCleanups) fn()
        this.paneCleanups = []
        this.originalView.destroy()
        this.modifiedView.destroy()
        this.zoneIds = [[], []]
        this.regions = undefined
        this.smartInline = undefined
        this.activeMove = undefined
        this.compareMove = undefined
        this.snap = undefined
        this.mountPanes(original, modified)
        this.layout()
    }

    /** Monaco revertRangeMappings(diffEditor.revert 命令 / gutter 的 Revert Block、Revert Selection 最后都走这里):
     *  diff 没算完就不动;每个字级改动把 modified 那段换回 original 那段,一次事务 */
    revertRangeMappings(changes: LineRangeMapping['innerChanges']) { this.revertChanges(changes) }

    private revertChanges(changes: LineRangeMapping['innerChanges']) {
        if (!this.upToDate || !changes.length) return
        const o = this.originalView.state
        const v = this.modifiedView
        v.dispatch(v.state.update({
            changes: changes.map(c => ({ from: c.modifiedFrom, to: c.modifiedTo, insert: o.sliceDoc(c.originalFrom, c.originalTo) })),
            userEvent: 'input',
        }))
    }

    /** 把这一块的 modified 换回 original(Monaco Revert Block) */
    revertMapping(m: LineRangeMapping) {
        const r = blockRange(m, this.originalView.state.doc, this.modifiedView.state.doc)
        this.revertChanges([{ originalFrom: r.oFrom, originalTo: r.oTo, modifiedFrom: r.mFrom, modifiedTo: r.mTo }])
    }

    /** Monaco revert(diff):同 revertMapping */
    revert(m: LineRangeMapping) { this.revertMapping(m) }

    goToNextChange(): boolean { return this.goToDiff('next') }
    goToPrevChange(): boolean { return this.goToDiff('previous') }

    // Monaco goToDiff + _goTo:按 modified 光标所在行找,光标放到块首行行首,块居中
    goToDiff(target: 'next' | 'previous'): boolean {
        const all = this.mappings
        if (!all.length) return false
        const v = this.modifiedView
        const cur = v.state.doc.lineAt(v.state.selection.main.head).number
        let prev: LineRangeMapping | undefined
        for (const x of all) if (x.modifiedStart < cur) prev = x
        const t = target === 'next' ? all.find(x => x.modifiedStart > cur) ?? all[0] : prev ?? all[all.length - 1]
        this.goToMapping(t)
        return true
    }

    private goToMapping(target: LineRangeMapping) {
        const v = this.modifiedView
        const doc = v.state.doc
        const line = Math.min(target.modifiedStart, doc.lines)
        v.dispatch(v.state.update({ selection: { anchor: doc.line(line).from } }))
        const sd = v.scrollDOM
        const h = sd.clientHeight
        if (h) {
            const lh = v.oracle.lineHeight
            const context = Math.min(h / lh / 2, v.revealSurroundingLines)
            const boxStart = this.textTop(v, target.modifiedStart) - context * lh
            const boxEnd = this.textTop(v, Math.min(target.modifiedEnd, doc.lines)) + lh + Math.max(0, context - 1) * lh
            sd.scrollTop = Math.max(0, (boxStart + boxEnd) / 2 - h / 2)
        }
    }

    destroy() {
        if (this.disposed || !this.dom.parentNode) return
        this.disposed = true
        for (const fn of [...this.disposeListeners]) fn()
        this.disposeListeners.clear()
        this.modelListeners.clear()
        this.unregister?.()
        clearTimeout(this.timer)
        this.crumbCts?.dispose(true)
        for (const fn of [...this.paneCleanups, ...this.cleanups]) fn()
        this.paneCleanups = []
        this.cleanups = []
        this.viewer.destroy()
        this.updateListeners.clear()
        this.originalView.destroy()
        this.modifiedView.destroy()
        this.dom.remove()
    }

    /** Monaco dispose */
    dispose() { this.destroy() }
}

// 转发:diff 编辑器上的编辑器方法 = modified 侧的同名方法(Monaco DelegatingEditor)
for (const name of DELEGATED) {
    Object.defineProperty(DiffEditor.prototype, name, {
        configurable: true,
        writable: true,
        value: function (this: DiffEditor, ...args: unknown[]) {
            const target = this.modifiedView as unknown as Record<string, (...a: unknown[]) => unknown>
            return target[name](...args)
        },
    })
}

/**
 * Monaco `editor.createDiffEditor(container, options)`。选项是扁平的 IDiffEditorOptions(diff 自己的项 + 两侧编辑器的项);
 * lite-monaco 没有 ITextModel,文本用 `original` / `modified` 传,之后用 `setModel({original, modified})` 换。
 */
export function createDiffEditor(container: Element, options: DiffEditorConstructionOptions): DiffEditor {
    const { original, modified, highlighter, lang, theme, colors, features, recomputeDebounceMs, ...rest } = options
    const { diff, editor } = splitDiffOptions(rest as Record<string, unknown>)
    // Monaco 的 createDiffEditor 不要求前置配置:没传高亮器就用 setDefaultHighlighter 登记的,再没有就用懒加载 shiki;
    // 主题是全局的(同 createEditor):传了就设,没传用当前全局主题
    const themeName = theme ?? (editor as { theme?: string }).theme ?? getGlobalTheme()
    if (themeName !== getGlobalTheme()) setGlobalTheme(themeName)
    return new DiffEditor({
        ...diff,
        parent: container,
        highlighter: highlighter ?? getDefaultHighlighter() ?? lazyHighlighter,
        original: original ?? '',
        modified: modified ?? '',
        lang: lang ?? 'plaintext',
        theme: themeName, colors, features, recomputeDebounceMs,
        readOnly: (editor as { readOnly?: boolean }).readOnly,
        options: editor,
    })
}
