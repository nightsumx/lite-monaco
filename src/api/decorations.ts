// 装饰 API(Monaco 的 deltaDecorations / createDecorationsCollection / getLineDecorations / getDecorationsInRange / removeDecorations …)。H2。
//
// 状态在一个 StateField 里:{ id → 区间 + Monaco 的 IModelDecorationOptions },随每笔事务的 changes 按 stickiness 映射,
// 所以装饰 id 稳定、位置跟着编辑走。增删走 `deltaEffect`(addToHistory:false,不进撤销栈)。
// 同一份状态派生出 core 的 DecorationSet(经 `decorations` facet 画出来)和 hover 源(hoverMessage)。
//
// IModelDecorationOptions 的映射(能映射的):
//   className → mark(isWholeLine 时是整行的 line 装饰)    inlineClassName → mark
//   beforeContentClassName / afterContentClassName → 区间两端的空 span widget(伪元素挂这里)
//   before / after(InjectedTextOptions) → 区间两端的注入文字 widget(content + inlineClassName)
//   isWholeLine → 起止行整行        showIfCollapsed → 空区间也画(零宽 widget 带 className)
//   marginClassName / lineNumberClassName → 行的 gutterClass(整个 gutter 行,不单指行号)
//   linesDecorationsClassName / firstLineDecorationClassName → 行号旁装饰列(gutterMarker)
//   glyphMarginClassName / glyphMargin.position / glyphMarginHoverMessage → line 装饰 spec 的 glyphClass / glyphLane / glyphHover(字形边距槽位由 view 画)
//   hoverMessage → hoverSources
//   stickiness(4 种)、collapseOnReplaceEdit
// 不能映射的(只存取,不影响显示):zIndex、inlineClassNameAffectsLetterSpacing、shouldFillLineOnLineBreak、blockClassName 等 block 系列
//   (blockClassName 近似成整行 class)、linesDecorationsTooltip、lineNumberHoverMessage、overviewRuler、minimap、hideInCommentTokens、hideInStringTokens、textDirection。
import type { IMarkdownString } from '../monaco/top-types'
import type { EditorContext } from './context'
import type { IDisposable, IEvent, IPosition, IRange } from './types'
import type * as core from '../core/index'
import type { Rope } from '../core/model/rope'
import { Range as ModelRange } from './position'
import { Emitter } from './context'
import { decorations as decorationsFacet } from '../core/view/editorview'
import { Decoration, WidgetType, type DecorationSet } from '../core/model/decoration'
import { RangeSet, Range as DRange } from '../core/model/rangeset'
import { StateEffect, StateField, Transaction } from '../core/model/state'
import { hoverSources, type HoverSource } from '../core/feature/hover'
import { renderMarkdown } from '../lang/tsmarkdown'
import { docOffset, docRange } from './commands'
import { getOption } from '../core/options'
import { forceMoveMarkers } from '../core/edit/history'
import { acceptEditOnNode } from '../core/edit/tracked'
import { modelAttachHooks, _setDetachedDecorationsFactory, type DetachedDecorations } from './model'
import { searchField, MATCHES_LIMIT } from '../core/feature/search'

// ───────────── 枚举(数值同 monaco.d.ts) ─────────────

export enum TrackedRangeStickiness {
    AlwaysGrowsWhenTypingAtEdges = 0,
    NeverGrowsWhenTypingAtEdges = 1,
    GrowsOnlyWhenTypingBefore = 2,
    GrowsOnlyWhenTypingAfter = 3,
}

export enum OverviewRulerLane { Left = 1, Center = 2, Right = 4, Full = 7 }
export enum MinimapPosition { Inline = 1, Gutter = 2 }
export enum MinimapSectionHeaderStyle { Normal = 1, Underlined = 2 }
export enum GlyphMarginLane { Left = 1, Center = 2, Right = 3 }

// ───────────── 类型 ─────────────

export type { IMarkdownString }

export interface IModelDecorationOverviewRulerOptions {
    color: string | { id: string } | undefined
    darkColor?: string | { id: string }
    position: OverviewRulerLane
}

export interface IModelDecorationMinimapOptions {
    color: string | { id: string } | undefined
    darkColor?: string | { id: string }
    position: MinimapPosition
    sectionHeaderStyle?: MinimapSectionHeaderStyle | null
    sectionHeaderText?: string | null
}

export interface InjectedTextOptions {
    content: string
    inlineClassName?: string | null
    inlineClassNameAffectsLetterSpacing?: boolean
    attachedData?: unknown
    cursorStops?: number | null
}

export interface IModelDecorationOptions {
    /** Monaco 内部字段(公开 d.ts 没有,内部 ModelDecorationOptions 必填);lite-monaco 接受并存取,不影响渲染 */
    description?: string
    stickiness?: TrackedRangeStickiness
    className?: string | null
    shouldFillLineOnLineBreak?: boolean | null
    blockClassName?: string | null
    blockIsAfterEnd?: boolean | null
    blockDoesNotCollapse?: boolean | null
    blockPadding?: [top: number, right: number, bottom: number, left: number] | null
    hoverMessage?: IMarkdownString | IMarkdownString[] | null
    glyphMarginHoverMessage?: IMarkdownString | IMarkdownString[] | null
    lineNumberHoverMessage?: IMarkdownString | IMarkdownString[] | null
    isWholeLine?: boolean
    showIfCollapsed?: boolean
    collapseOnReplaceEdit?: boolean
    zIndex?: number
    overviewRuler?: IModelDecorationOverviewRulerOptions | null
    minimap?: IModelDecorationMinimapOptions | null
    glyphMarginClassName?: string | null
    glyphMargin?: { position: GlyphMarginLane } | null
    linesDecorationsClassName?: string | null
    linesDecorationsTooltip?: string | null
    firstLineDecorationClassName?: string | null
    lineNumberClassName?: string | null
    marginClassName?: string | null
    inlineClassName?: string | null
    inlineClassNameAffectsLetterSpacing?: boolean
    beforeContentClassName?: string | null
    afterContentClassName?: string | null
    after?: InjectedTextOptions | null
    before?: InjectedTextOptions | null
    /** 覆盖该装饰起点所在行的行高(px,上限 300;同 Monaco 只作用在起始行,折行的各视觉行都按这个高) */
    lineHeight?: number | null
    fontFamily?: string | null
    /** CSS 字号,如 '20px'(作用在装饰区间的文字上) */
    fontSize?: string | null
    fontWeight?: string | null
    fontStyle?: string | null
    hideInCommentTokens?: boolean | null
    hideInStringTokens?: boolean | null
    textDirection?: number | null
}

export interface IModelDeltaDecoration {
    range: IRange
    options: IModelDecorationOptions
}

export interface IModelDecoration {
    readonly id: string
    readonly ownerId: number
    readonly range: ModelRange
    readonly options: IModelDecorationOptions
    readonly isForValidation?: boolean
}

export interface IModelDecorationsChangedEvent {
    readonly affectsMinimap: boolean
    readonly affectsOverviewRuler: boolean
    readonly affectsGlyphMargin: boolean
    readonly affectsLineNumber: boolean
}

export interface IEditorDecorationsCollection {
    readonly onDidChange: IEvent<IModelDecorationsChangedEvent>
    length: number
    set(newDecorations: readonly IModelDeltaDecoration[]): string[]
    append(newDecorations: readonly IModelDeltaDecoration[]): string[]
    has(decoration: IModelDecoration): boolean
    getRange(index: number): ModelRange | null
    getRanges(): ModelRange[]
    clear(): void
}

/** 装在实例上的装饰方法 */
export interface IModelDecorationsChangeAccessor {
    addDecoration(range: IRange, options: IModelDecorationOptions): string
    changeDecoration(id: string, newRange: IRange): void
    changeDecorationOptions(id: string, newOptions: IModelDecorationOptions): void
    removeDecoration(id: string): void
    deltaDecorations(oldDecorations: readonly string[], newDecorations: readonly IModelDeltaDecoration[]): string[]
}

export interface IDecorationsApi {
    /** Monaco changeDecorations:回调里用 accessor 批量改装饰;返回回调的返回值(id 在 change* 后保持不变) */
    changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null
    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[]
    removeDecorations(decorationIds: string[]): void
    createDecorationsCollection(decorations?: readonly IModelDeltaDecoration[]): IEditorDecorationsCollection
    getLineDecorations(lineNumber: number): IModelDecoration[] | null
    /** Monaco 0.55:位置处的字号(字体装饰优先,否则编辑器字号);effectiveAllowVariableFonts 关 → null */
    getFontSizeAtPosition(position: IPosition): string | null
    getDecorationsInRange(range: IRange): IModelDecoration[] | null
    getDecorationOptions(id: string): IModelDecorationOptions | null
    getDecorationRange(id: string): ModelRange | null
    readonly onDidChangeModelDecorations: IEvent<IModelDecorationsChangedEvent>
}

/** H3 的 ITextModel 装饰方法转发到的实现(IModelDecorationsProvider 的超集) */
export interface IDecorationsProvider {
    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId?: number): string[]
    getDecorationOptions(id: string): IModelDecorationOptions | null
    getDecorationRange(id: string): ModelRange | null
    getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getDecorationsInRange(range: IRange, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean, onlyMinimapDecorations?: boolean, onlyMarginDecorations?: boolean): IModelDecoration[]
    getAllDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getAllMarginDecorations(ownerId?: number): IModelDecoration[]
    getOverviewRulerDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getInjectedTextDecorations(ownerId?: number): IModelDecoration[]
    getCustomLineHeightsDecorations(ownerId?: number): IModelDecoration[]
    readonly onDidChangeDecorations: IEvent<IModelDecorationsChangedEvent>
}

/** Monaco ModelDecorationOptions.affectsFont */
const affectsFont = (o: IModelDecorationOptions): boolean => !!(o.fontFamily || o.fontSize || o.fontWeight || o.fontStyle)
const isMarginDecoration = (o: IModelDecorationOptions): boolean => !!(o.glyphMarginClassName || o.linesDecorationsClassName || o.lineNumberClassName || o.marginClassName)

/** 一批装饰移动了位置(文档编辑把它们带走):按这批装饰各自涉及的面算 affects 标志 */
function affectsOfAll(entries: Iterable<{ options: IModelDecorationOptions }>): IModelDecorationsChangedEvent {
    let affectsMinimap = false, affectsOverviewRuler = false, affectsGlyphMargin = false, affectsLineNumber = false
    for (const { options: o } of entries) {
        affectsMinimap ||= !!o.minimap
        affectsOverviewRuler ||= !!o.overviewRuler
        affectsGlyphMargin ||= !!o.glyphMarginClassName
        affectsLineNumber ||= !!o.lineNumberClassName
    }
    return { affectsMinimap, affectsOverviewRuler, affectsGlyphMargin, affectsLineNumber }
}

// ───────────── 状态 ─────────────

interface Entry {
    id: string
    ownerId: number
    from: number
    to: number
    options: IModelDecorationOptions
    /** 稳定引用的 glyph hover(line 装饰 eq 按引用比) */
    glyphHover: IMarkdownString[] | undefined
}

interface DecoState {
    entries: ReadonlyMap<string, Entry>
    set: DecorationSet
}

interface Delta {
    remove: readonly string[]
    add: readonly Entry[]
}

const deltaEffect = StateEffect.define<Delta>()
const EMPTY_SET: DecorationSet = RangeSet.empty as DecorationSet

function asArray<T>(v: T | T[] | null | undefined): T[] {
    return v == null ? [] : Array.isArray(v) ? v : [v]
}

function words(...parts: (string | null | undefined)[]): string {
    return parts.filter((s): s is string => !!s).join(' ')
}

// widget:只有 class 的空 span / 带文字的注入 span
class SpanWidget extends WidgetType {
    /** collapsed:showIfCollapsed 的空区间装饰。Monaco 画成以光标位置为中心、半角字宽的框且不占版面:这里用一字宽的 inline-block 加两侧负外边距,净占宽 0 */
    constructor(readonly cls: string, readonly text: string, readonly collapsed = false) { super() }
    eq(other: SpanWidget): boolean { return other.cls === this.cls && other.text === this.text && other.collapsed === this.collapsed }
    get inlineText(): string | null { return this.text || null }
    toDOM(): Node {
        const el = document.createElement('span')
        el.className = this.cls
        if (this.text) el.textContent = this.text
        if (this.collapsed) el.style.cssText = 'display:inline-block;width:1ch;margin:0 -0.5ch;height:1lh;vertical-align:top'
        return el
    }
}

function lineSpec(e: Entry, lineNumber: number, firstLine: number, wholeLine: boolean) {
    const o = e.options
    const spec: Record<string, unknown> = {}
    const cls = wholeLine ? words(o.className, o.blockClassName) : ''
    if (cls) spec.class = cls
    const gutter = words(o.marginClassName, o.lineNumberClassName)
    if (gutter) spec.gutterClass = gutter
    const marker = words(o.linesDecorationsClassName, lineNumber === firstLine ? o.firstLineDecorationClassName : null)
    if (marker) spec.gutterMarker = marker
    if (o.glyphMarginClassName) {
        spec.glyphClass = o.glyphMarginClassName
        spec.glyphLane = o.glyphMargin?.position ?? GlyphMarginLane.Left
        if (e.glyphHover) spec.glyphHover = e.glyphHover
    }
    return Object.keys(spec).length ? spec : null
}

/** 字体类装饰选项 → 行内 style(值里的分号 / 引号 / 花括号会逃出声明,直接丢掉) */
function fontCss(o: IModelDecorationOptions): string {
    const safe = (v: string | null | undefined) => (v ? v.replace(/[;{}"'<>]/g, '') : '')
    const parts: string[] = []
    const add = (k: string, v: string | null | undefined) => { const x = safe(v); if (x) parts.push(`${k}:${x}`) }
    add('font-family', o.fontFamily); add('font-size', o.fontSize); add('font-weight', o.fontWeight); add('font-style', o.fontStyle)
    return parts.join(';')
}

/** 0.55 的两个开关对装饰的影响:allowVariableLineHeights 关 → 忽略 lineHeight;effectiveAllowVariableFonts 关 → 忽略 fontFamily / fontSize / fontWeight / fontStyle */
interface DecoFlags { lineHeights: boolean, fonts: boolean }
const ALL_ALLOWED: DecoFlags = { lineHeights: true, fonts: true }

/** Monaco validateRange 的代理对规则:端点落在代理对中间就退回前面,装饰(mark / 前后内容)不能把一个字符劈成两半 */
function snapPair(doc: Rope, pos: number): number {
    if (pos <= 0 || pos >= doc.length) return pos
    const s = doc.sliceString(pos - 1, pos + 1)
    const hi = s.charCodeAt(0), lo = s.charCodeAt(1)
    return hi >= 0xD800 && hi <= 0xDBFF && lo >= 0xDC00 && lo <= 0xDFFF ? pos - 1 : pos
}

// 文档里有没有代理对:没有就不必逐个端点去切文本判断(装饰几万条时这一步占了建集合一半时间)。Rope 不可变,按文档记
const surrogateMemo = new WeakMap<Rope, boolean>()
const SURROGATE_RE = /[\uD800-\uDBFF]/
function docHasSurrogate(doc: Rope): boolean {
    let r = surrogateMemo.get(doc)
    if (r === undefined) {
        const lines: string[] = []
        doc.flatten(lines)
        r = false
        for (let i = 0; i < lines.length && !r; i++) r = SURROGATE_RE.test(lines[i])
        surrogateMemo.set(doc, r)
    }
    return r
}

// 只有 class 的 mark 装饰是不可变的,同名 class 共用一个对象(几万条同样式的装饰不必各建一个)
const classMarks = new Map<string, Decoration>()
const boxMarks = new Map<string, Decoration>()
function classMark(cls: string, box: boolean): Decoration {
    const m = box ? boxMarks : classMarks
    let d = m.get(cls)
    if (!d) {
        if (m.size >= 1024) m.clear()
        m.set(cls, d = Decoration.mark({ class: box ? `${cls} cm-decoBox` : cls }))
    }
    return d
}

function pushEntry(e: Entry, doc: Rope, out: DRange<Decoration>[], flags: DecoFlags, snap = true): void {
    const o = e.options
    const from = snap ? snapPair(doc, e.from) : e.from, to = snap ? snapPair(doc, e.to) : e.to
    const empty = from === to
    // 行级:isWholeLine 的 class,以及 margin / lines decorations / glyph(起止行逐行)
    const wholeLine = !!o.isWholeLine
    const needLines = (wholeLine && (o.className || o.blockClassName)) || o.marginClassName || o.lineNumberClassName
        || o.linesDecorationsClassName || o.firstLineDecorationClassName || o.glyphMarginClassName
    if (needLines) {
        const first = doc.lineAt(from).number
        const last = doc.lineAt(to).number
        for (let n = first; n <= last; n++) {
            const spec = lineSpec(e, n, first, wholeLine)
            if (spec) out.push(DRange.create(doc.line(n).from, doc.line(n).from, Decoration.line(spec)))
        }
    }
    if (o.lineHeight && flags.lineHeights) {
        const at = doc.lineAt(from).from
        out.push(DRange.create(at, at, Decoration.line({ lineHeight: o.lineHeight, attributes: { style: `line-height:${o.lineHeight}px;min-height:${o.lineHeight}px` } })))
    }
    const fontStyle = flags.fonts ? fontCss(o) : ''
    if (fontStyle && !empty) out.push(DRange.create(from, to, Decoration.mark({ attributes: { style: fontStyle } })))
    if (!empty) {
        // Monaco:className 是满行高的 .cdr 块(行盒),inlineClassName 是字体框的行内 span。
        // className 的 mark 加 cm-decoBox(竖向 padding 补到行高,见 themecss / EditorView 的 --lm-deco-pad),inline 的单独一层
        // normalizeOptions 已把 className 一类压成单空格的字符串或 null,单个值不必再 words() 拼一遍
        const boxCls = !wholeLine ? o.className : null
        const inl = o.inlineClassName
        if (boxCls) out.push(DRange.create(from, to, classMark(boxCls, true)))
        if (inl) out.push(DRange.create(from, to, classMark(inl, false)))
    } else if (o.showIfCollapsed) {
        const cls = words(o.className, o.inlineClassName)
        if (cls) out.push(DRange.create(from, to, Decoration.widget({ widget: new SpanWidget(cls, '', true), side: -1 })))
    }
    if (o.beforeContentClassName) out.push(DRange.create(from, from, Decoration.widget({ widget: new SpanWidget(o.beforeContentClassName, ''), side: -1 })))
    // Monaco getInjectedTextInInterval:空区间的注入文字只有 showIfCollapsed 才显示(否则整条被滤掉)
    const injectOk = !empty || !!o.showIfCollapsed
    if (injectOk && o.before?.content) out.push(DRange.create(from, from, Decoration.widget({ widget: new SpanWidget(words(o.before.inlineClassName), o.before.content), side: -1 })))
    if (o.afterContentClassName) out.push(DRange.create(to, to, Decoration.widget({ widget: new SpanWidget(o.afterContentClassName, ''), side: 1 })))
    if (injectOk && o.after?.content) out.push(DRange.create(to, to, Decoration.widget({ widget: new SpanWidget(words(o.after.inlineClassName), o.after.content), side: 1 })))
}

function buildSet(entries: ReadonlyMap<string, Entry>, doc: Rope, flags: DecoFlags = ALL_ALLOWED): DecorationSet {
    if (!entries.size) return EMPTY_SET
    const ranges: DRange<Decoration>[] = []
    const snap = entries.size <= 64 || docHasSurrogate(doc)
    for (const e of entries.values()) pushEntry(e, doc, ranges, flags, snap)
    return ranges.length ? RangeSet.of(ranges, true) as DecorationSet : EMPTY_SET
}

type EditList = [number, number, number, boolean][]

/** 一笔事务的编辑清单(每条装饰都要按它平移,清单只做一遍,不再每条装饰各建一份) */
function editList(changes: { iterChanges(f: (fa: number, ta: number, fb: number, tb: number) => void): void }, forced?: readonly (readonly [number, number])[]): EditList {
    const list: EditList = []
    changes.iterChanges((fa, ta, fb, tb) => {
        // 相邻的编辑可能在 ChangeSet 里并成一笔:只要有一条 forceMoveMarkers 的编辑落在这一笔内就算强制
        list.push([fa, ta, tb - fb, !!forced && forced.some(([f, t]) => f >= fa && t <= ta)])
    })
    return list
}

function mapEntry(e: Entry, list: EditList): Entry {
    // Monaco 按位置从后往前逐笔应用编辑,前面的偏移不受后面的影响
    let from = e.from, to = e.to
    const stickiness = e.options.stickiness ?? 0
    const collapse = !!e.options.collapseOnReplaceEdit
    for (let i = list.length - 1; i >= 0; i--) {
        const [fa, ta, len, force] = list[i]
        if (to < fa) continue // 整条在这笔编辑之前:不受它影响(几万条装饰里绝大多数是这种)
        ;[from, to] = acceptEditOnNode(from, to, stickiness, collapse, fa, ta, len, force)
    }
    return from === e.from && to === e.to ? e : { ...e, from, to }
}

function mapEntries(entries: ReadonlyMap<string, Entry>, tr: Transaction): Map<string, Entry> {
    const list = editList(tr.changes as never, tr.annotation(forceMoveMarkers))
    const next = new Map<string, Entry>()
    for (const [id, e] of entries) next.set(id, mapEntry(e, list))
    return next
}

const decoField = StateField.define<DecoState>({
    create: () => ({ entries: new Map(), set: EMPTY_SET }),
    update(v, tr) {
        let entries = v.entries
        let changed = false
        if (tr.docChanged && entries.size) {
            entries = mapEntries(entries, tr)
            changed = true
        }
        for (const eff of tr.effects) {
            if (!eff.is(deltaEffect)) continue
            if (!changed) { entries = new Map(entries); changed = true }
            const m = entries as Map<string, Entry>
            for (const id of eff.value.remove) m.delete(id)
            for (const e of eff.value.add) m.set(e.id, e)
        }
        return changed ? { entries, set: buildSet(entries, tr.newDoc) } : v
    },
})

function hoverEntries(state: core.EditorState, pos: number): Entry[] {
    const st = state.field(decoField, false)
    if (!st || !st.entries.size) return []
    const doc = state.doc
    const line = doc.lineAt(pos)
    const out: Entry[] = []
    for (const e of st.entries.values()) {
        if (!e.options.hoverMessage) continue
        if (e.options.isWholeLine) {
            if (line.number >= doc.lineAt(e.from).number && line.number <= doc.lineAt(e.to).number) out.push(e)
        } else if (pos >= e.from && pos < e.to) out.push(e)
    }
    return out
}

const decoHover: HoverSource = (state, pos) => {
    const hits = hoverEntries(state, pos)
    if (!hits.length) return null
    const doc = state.doc
    const from = Math.min(...hits.map(h => h.options.isWholeLine ? doc.lineAt(h.from).from : h.from))
    const to = Math.max(...hits.map(h => h.options.isWholeLine ? doc.lineAt(h.to).to : h.to))
    return {
        pos: from,
        end: to,
        create: () => {
            const root = document.createElement('div')
            root.className = 'cm-decoration-hover'
            for (const h of hits) {
                for (const md of asArray(h.options.hoverMessage)) root.appendChild(renderMarkdown(md.value))
            }
            return root
        },
    }
}

// 选项关掉 allowVariableLineHeights / allowVariableFonts 时,field 里那份(全放行)不能直接画:按 DecoState 缓存一份过滤后的
const gatedSets = new WeakMap<DecoState, { flags: DecoFlags, set: DecorationSet }>()
function currentSet(state: core.EditorState): DecorationSet {
    const st = state.field(decoField, false)
    if (!st) return EMPTY_SET
    const o = getOption(state, 'allowVariableLineHeights') as boolean
    const fonts = getOption(state, 'effectiveAllowVariableFonts') as boolean
    if (o && fonts) return st.set
    const hit = gatedSets.get(st)
    if (hit && hit.flags.lineHeights === o && hit.flags.fonts === fonts) return hit.set
    const flags = { lineHeights: o, fonts }
    const set = buildSet(st.entries, state.doc, flags)
    gatedSets.set(st, { flags, set })
    return set
}

/** 装饰能力需要的 state 扩展:状态字段 + 画出来的 decorations 源 + hover 源。liteMonaco() 已装进去;自己拼 EditorState 时加上它 */
export const decorationsExtension: core.Extension = [
    decoField,
    decorationsFacet.of(currentSet),
    hoverSources.of(decoHover),
]

// ───────────── 实现 ─────────────

const owners = new WeakMap<core.EditorView, number>()
let ownerCounter = 0
const providers = new WeakMap<core.EditorView, DecorationsImpl>()

function ownerOf(view: core.EditorView): number {
    let id = owners.get(view)
    if (!id) owners.set(view, id = ++ownerCounter)
    return id
}

function validate(doc: Rope, r: IRange): { from: number, to: number } {
    const a = docOffset(doc, r.startLineNumber, r.startColumn)
    const b = docOffset(doc, r.endLineNumber, r.endColumn)
    return a <= b ? { from: a, to: b } : { from: b, to: a }
}

/**
 * Monaco ModelDecorationOptions:已补齐默认值的不可变选项对象。register / createDynamic 造出来的实例传进
 * deltaDecorations 原样保留(getAllDecorations().options 与注册的是同一个对象,可以按引用认)。
 * 不在 monaco.d.ts 公开面里,折叠这类内部特性按引用区分「几种固定样式」时用。
 */
export class ModelDecorationOptions implements IModelDecorationOptions {
    declare description: string
    static register(options: IModelDecorationOptions): ModelDecorationOptions { return new ModelDecorationOptions(options) }
    static createDynamic(options: IModelDecorationOptions): ModelDecorationOptions { return new ModelDecorationOptions(options) }
    private constructor(options: IModelDecorationOptions) { Object.assign(this, normalizeOptions(options)) }
}

/** Monaco LINE_HEIGHT_CEILING */
const LINE_HEIGHT_CEILING = 300

function normalizeOptions(o: IModelDecorationOptions): IModelDecorationOptions {
    if (o instanceof ModelDecorationOptions) return o
    // 同 Monaco ModelDecorationOptions:默认值补齐,className 一类去掉多余空白
    const clean = (s: string | null | undefined) => (s ? s.trim().replace(/\s+/g, ' ') : null)
    return {
        ...o,
        description: o.description,
        stickiness: o.stickiness || TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
        zIndex: o.zIndex || 0,
        className: clean(o.className),
        inlineClassName: clean(o.inlineClassName),
        marginClassName: clean(o.marginClassName),
        glyphMarginClassName: clean(o.glyphMarginClassName),
        linesDecorationsClassName: clean(o.linesDecorationsClassName),
        firstLineDecorationClassName: clean(o.firstLineDecorationClassName),
        lineNumberClassName: clean(o.lineNumberClassName),
        beforeContentClassName: clean(o.beforeContentClassName),
        afterContentClassName: clean(o.afterContentClassName),
        blockClassName: clean(o.blockClassName),
        lineHeight: o.lineHeight ? Math.min(o.lineHeight, LINE_HEIGHT_CEILING) : o.lineHeight,
        hoverMessage: o.hoverMessage || null,
        glyphMarginHoverMessage: o.glyphMarginHoverMessage || null,
        isWholeLine: o.isWholeLine || false,
        showIfCollapsed: o.showIfCollapsed || false,
        collapseOnReplaceEdit: o.collapseOnReplaceEdit || false,
        inlineClassNameAffectsLetterSpacing: o.inlineClassNameAffectsLetterSpacing || false,
    }
}

const FIND_MATCH_OPTIONS = normalizeOptions({ description: 'find-match', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'findMatch' })
const FIND_CURRENT_OPTIONS = normalizeOptions({ description: 'current-find-match', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: 'currentFindMatch' })

// 查找命中(Monaco FindDecorations:findMatch / currentFindMatch)。lite-monaco 的命中表在 searchField 里,
// 查找会话开着时按它现算成模型装饰,id 是 `find:<序号>`;不进 decoField(画出来的是 searchPanel 的命中框层)。
// 只给前 MATCHES_LIMIT 个(同 Monaco);空命中(^ $)也在,和 Monaco 一样没有可画宽度但有装饰
function findEntriesOf(view: core.EditorView): Entry[] {
    const sf = view.state.field(searchField, false)
    if (!sf?.open || !sf.matches.length) return []
    const owner = ownerOf(view)
    const cur = sf.highlighted ? sf.currentMatch : -1
    const out: Entry[] = []
    for (let i = 0; i < sf.matches.length && i < MATCHES_LIMIT; i++) {
        const m = sf.matches[i]
        out.push({
            id: `find:${i}`, ownerId: owner, from: m.from, to: m.to, glyphHover: undefined,
            options: i === cur ? FIND_CURRENT_OPTIONS : FIND_MATCH_OPTIONS,
        })
    }
    return out
}

/** 装饰实现读写的那份存储:附着时是视图 state 里的 decoField,脱机时是 model 自己的一张表 */
interface DecoHost {
    doc(): Rope
    entries(): ReadonlyMap<string, Entry>
    commit(delta: Delta): void
    /** 查找命中(只有视图有) */
    find?(): Entry[]
}

function viewHost(view: core.EditorView): DecoHost {
    return {
        doc: () => view.state.doc,
        entries() {
            const st = view.state.field(decoField, false)
            if (!st) throw new Error('lite-monaco: 装饰扩展没装进 EditorState(decorationsExtension)')
            return st.entries
        },
        commit: (delta) => {
            // 行高 / 字号装饰改的是块高:普通装饰 effect 只涂色不动 heightMap,这里要通知视图重排
            const old = view.state.field(decoField, false)?.entries
            const heightful = (o: IModelDecorationOptions) => !!(o.lineHeight || o.fontSize)
            const touches = delta.add.some(e => heightful(e.options)) || delta.remove.some(id => { const e = old?.get(id); return !!e && heightful(e.options) })
            view.dispatch(view.state.update({ effects: [deltaEffect.of(delta)], annotations: [Transaction.addToHistory.of(false)] }))
            if (touches) view.refreshHeights()
        },
        find: () => findEntriesOf(view),
    }
}

class DecorationsImpl implements IDecorationsProvider {
    private counter = 0
    readonly changes = new Emitter<IModelDecorationsChangedEvent>()
    readonly onDidChangeDecorations: IEvent<IModelDecorationsChangedEvent> = this.changes.event
    /** 本次变更是否由集合自己触发(集合的 onDidChange 不响应自己) */
    selfChanging = 0

    constructor(private readonly host: DecoHost) {}

    private field(): { entries: ReadonlyMap<string, Entry> } { return { entries: this.host.entries() } }

    private toDecoration(e: Entry): IModelDecoration {
        const doc = this.host.doc()
        return { id: e.id, ownerId: e.ownerId, range: docRange(doc, e.from, e.to), options: e.options, isForValidation: false }
    }

    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId = 0): string[] {
        const st = this.field()
        const doc = this.host.doc()
        const remove = oldDecorations.filter(id => st.entries.has(id))
        const add: Entry[] = []
        const ids: string[] = []
        let affects = { affectsMinimap: false, affectsOverviewRuler: false, affectsGlyphMargin: false, affectsLineNumber: false }
        const touch = (o: IModelDecorationOptions) => {
            affects = {
                affectsMinimap: affects.affectsMinimap || !!o.minimap,
                affectsOverviewRuler: affects.affectsOverviewRuler || !!o.overviewRuler,
                affectsGlyphMargin: affects.affectsGlyphMargin || !!o.glyphMarginClassName,
                affectsLineNumber: affects.affectsLineNumber || !!o.lineNumberClassName,
            }
        }
        for (const id of remove) touch(st.entries.get(id)!.options)
        for (const d of newDecorations) {
            const { from, to } = validate(doc, d.range)
            const options = normalizeOptions(d.options)
            touch(options)
            const id = String(++this.counter)
            const gh = asArray(options.glyphMarginHoverMessage)
            add.push({ id, ownerId, from, to, options, glyphHover: gh.length ? gh : undefined })
            ids.push(id)
        }
        if (remove.length || add.length) {
            this.host.commit({ remove, add })
            this.changes.fire(affects)
        }
        return ids
    }

    removeAllDecorationsWithOwnerId(ownerId: number): void {
        const ids = [...this.field().entries.values()].filter(e => e.ownerId === ownerId).map(e => e.id)
        if (ids.length) this.deltaDecorations(ids, [], ownerId)
    }

    /** 原位改一条装饰的范围 / 选项,id 不变(Monaco changeDecoration / changeDecorationOptions) */
    redefine(id: string, range: IRange | undefined, options: IModelDecorationOptions | undefined): void {
        const e = this.field().entries.get(id)
        if (!e) return
        const { from, to } = range ? validate(this.host.doc(), range) : e
        const opts = options ? normalizeOptions(options) : e.options
        const gh = asArray(opts.glyphMarginHoverMessage)
        const next: Entry = { ...e, from, to, options: opts, glyphHover: gh.length ? gh : undefined }
        this.host.commit({ remove: [id], add: [next] })
        const o = [e.options, opts]
        this.changes.fire({
            affectsMinimap: o.some(x => !!x.minimap), affectsOverviewRuler: o.some(x => !!x.overviewRuler),
            affectsGlyphMargin: o.some(x => !!x.glyphMarginClassName), affectsLineNumber: o.some(x => !!x.lineNumberClassName),
        })
    }

    getDecorationOptions(id: string): IModelDecorationOptions | null {
        return this.entryById(id)?.options ?? null
    }

    getDecorationRange(id: string): ModelRange | null {
        const e = this.entryById(id)
        return e ? docRange(this.host.doc(), e.from, e.to) : null
    }

    private findEntries(): Entry[] { return this.host.find?.() ?? [] }

    private entryById(id: string): Entry | undefined {
        if (id.startsWith('find:')) return this.findEntries()[Number(id.slice(5))]
        return this.field().entries.get(id)
    }

    private collect(ownerId: number, filter: (e: Entry) => boolean): IModelDecoration[] {
        const out: Entry[] = []
        for (const e of this.field().entries.values()) {
            if (ownerId !== 0 && e.ownerId !== ownerId) continue
            if (filter(e)) out.push(e)
        }
        for (const e of this.findEntries()) {
            if (ownerId !== 0 && e.ownerId !== ownerId) continue
            if (filter(e)) out.push(e)
        }
        // Monaco 按位置排序(起点,再终点)
        out.sort((a, b) => a.from - b.from || a.to - b.to)
        return out.map(e => this.toDecoration(e))
    }

    getLineDecorations(lineNumber: number, ownerId = 0, filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] {
        return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation, filterFontDecorations)
    }

    getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId = 0, _filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] {
        const doc = this.host.doc()
        const a = Math.min(Math.max(1, startLineNumber), doc.lines)
        const b = Math.min(Math.max(1, endLineNumber), doc.lines)
        const lo = doc.line(a).from
        const hi = doc.line(Math.max(a, b)).to
        return this.collect(ownerId, e => e.from <= hi && e.to >= lo && !(filterFontDecorations && affectsFont(e.options)))
    }

    /** onlyMinimapDecorations / onlyMarginDecorations 同 Monaco:只留带 minimap / 带 margin 类的装饰;filterFontDecorations 去掉改字体的装饰 */
    getDecorationsInRange(range: IRange, ownerId = 0, _filterOutValidation = false, filterFontDecorations = false, onlyMinimapDecorations = false, onlyMarginDecorations = false): IModelDecoration[] {
        const { from, to } = validate(this.host.doc(), range)
        return this.collect(ownerId, e => e.from <= to && e.to >= from
            && (!onlyMinimapDecorations || !!e.options.minimap) && (!onlyMarginDecorations || isMarginDecoration(e.options)) && !(filterFontDecorations && affectsFont(e.options)))
    }

    getAllDecorations(ownerId = 0, _filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] {
        return this.collect(ownerId, e => !(filterFontDecorations && affectsFont(e.options)))
    }

    getAllMarginDecorations(ownerId = 0): IModelDecoration[] {
        return this.collect(ownerId, e => isMarginDecoration(e.options))
    }

    getOverviewRulerDecorations(ownerId = 0, _filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] {
        return this.collect(ownerId, e => !!e.options.overviewRuler?.color && !(filterFontDecorations && affectsFont(e.options)))
    }

    getInjectedTextDecorations(ownerId = 0): IModelDecoration[] {
        return this.collect(ownerId, e => !!(e.options.before || e.options.after))
    }

    /** Monaco getCustomLineHeightsDecorations:带 lineHeight 的装饰 */
    getCustomLineHeightsDecorations(ownerId = 0): IModelDecoration[] {
        return this.collect(ownerId, e => !!e.options.lineHeight)
    }
}

/** 取(必要时建)实例的装饰实现;H3 的 model 经 `setDecorationsProvider` 接它 */
export function getDecorationsApi(view: core.EditorView): IDecorationsProvider {
    let impl = providers.get(view)
    if (!impl) {
        impl = new DecorationsImpl(viewHost(view))
        providers.set(view, impl)
        view.onDestroy(() => { providers.get(view)?.changes.dispose(); providers.delete(view) })
    }
    return impl
}

/** 脱机 model 的装饰表:一张 id → 区间的表,随每笔事务的 changes 按 stickiness 映射(逻辑同视图里的 decoField) */
_setDetachedDecorationsFactory((getDoc): DetachedDecorations => {
    let entries: ReadonlyMap<string, Entry> = new Map()
    const impl = new DecorationsImpl({
        doc: getDoc,
        entries: () => entries,
        commit(delta) {
            const next = new Map(entries)
            for (const id of delta.remove) next.delete(id)
            for (const e of delta.add) next.set(e.id, e)
            entries = next
        },
    })
    return Object.assign(impl, {
        mapTransaction(tr: Transaction) {
            if (!entries.size) return
            entries = mapEntries(entries, tr)
            impl.changes.fire(affectsOfAll(entries.values()))
        },
    }) as unknown as DetachedDecorations
})

// model 挂上 / 摘下视图时接 / 断装饰实现:ITextModel.deltaDecorations / getLineDecorations… 转发到该视图的装饰集
// (没挂视图的 model 没有装饰集,这些方法返回空;Monaco 的独立 model 自带装饰树,lite-monaco 的 model 是视图的薄视图)
modelAttachHooks.add((model, attached) => {
    const view = model.attachedView
    if (attached && view) model.setDecorationsProvider(getDecorationsApi(view) as never)
    else model.setDecorationsProvider(null)
})

export function installDecorations(ctx: EditorContext): void {
    const view = ctx.view
    const impl = getDecorationsApi(view) as DecorationsImpl
    const owner = ownerOf(view)
    const api = ctx.api as unknown as IDecorationsApi

    // 编辑让装饰挪了位置也算 onDidChangeModelDecorations(有装饰时)
    const off = view.onTransaction((tr) => {
        const all = view.state.field(decoField, false)?.entries
        if (tr.docChanged && all?.size) impl.changes.fire(affectsOfAll(all.values()))
    })
    ctx.onDispose(off)

    api.deltaDecorations = (oldDecorations, newDecorations) => impl.deltaDecorations(oldDecorations, newDecorations, owner)
    api.removeDecorations = (ids) => { impl.deltaDecorations(ids, [], owner) }
    api.changeDecorations = <T,>(callback: (a: IModelDecorationsChangeAccessor) => T): T | null => {
        const accessor: IModelDecorationsChangeAccessor = {
            addDecoration: (range, options) => impl.deltaDecorations([], [{ range, options }], owner)[0],
            changeDecoration: (id, range) => impl.redefine(id, range, undefined),
            changeDecorationOptions: (id, options) => impl.redefine(id, undefined, options),
            removeDecoration: (id) => { impl.deltaDecorations([id], [], owner) },
            deltaDecorations: (o, n) => impl.deltaDecorations([...o], [...n], owner),
        }
        return callback(accessor) ?? null
    }
    api.getFontSizeAtPosition = (position) => {
        if (getOption(view.state, 'effectiveAllowVariableFonts') !== true) return null
        const r = { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column }
        const hit = impl.getDecorationsInRange(r, owner).find(d => d.options.fontSize)
        return hit?.options.fontSize ?? `${view.fontInfo().fontSize}px`
    }
    api.getLineDecorations = (lineNumber) => impl.getLineDecorations(lineNumber, owner)
    api.getDecorationsInRange = (range) => impl.getDecorationsInRange(range, owner)
    api.getDecorationOptions = (id) => impl.getDecorationOptions(id)
    api.getDecorationRange = (id) => impl.getDecorationRange(id)
    ;(api as { onDidChangeModelDecorations: IEvent<IModelDecorationsChangedEvent> }).onDidChangeModelDecorations = impl.onDidChangeDecorations

    api.createDecorationsCollection = (initial) => {
        let ids: string[] = []
        const changeEmitter = ctx.events.emitter<IModelDecorationsChangedEvent>()
        const sub: IDisposable = impl.onDidChangeDecorations((e) => {
            if (impl.selfChanging) return
            changeEmitter.fire(e)
        })
        ctx.onDispose(() => sub.dispose())
        const mutate = <T>(fn: () => T): T => {
            impl.selfChanging++
            try { return fn() } finally { impl.selfChanging-- }
        }
        const collection: IEditorDecorationsCollection = {
            onDidChange: changeEmitter.event,
            get length() { return ids.length },
            set(newDecorations) {
                ids = mutate(() => impl.deltaDecorations(ids, newDecorations as IModelDeltaDecoration[], owner))
                return ids
            },
            append(newDecorations) {
                const added = mutate(() => impl.deltaDecorations([], newDecorations as IModelDeltaDecoration[], owner))
                ids = ids.concat(added)
                return added
            },
            has(decoration) { return ids.includes(decoration.id) },
            getRange(index) {
                if (index >= ids.length) return null
                return impl.getDecorationRange(ids[index])
            },
            getRanges() {
                const out: ModelRange[] = []
                for (const id of ids) {
                    const r = impl.getDecorationRange(id)
                    if (r) out.push(r)
                }
                return out
            },
            clear() {
                mutate(() => impl.deltaDecorations(ids, [], owner))
                ids = []
            },
        }
        if (initial) collection.set(initial)
        return collection
    }
}
