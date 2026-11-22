// 光标处 http(s) URL。词法扫，不解析源码。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'
import { OpenerService, type OpenerUri, type IOpenerEditorService, type IOpenerCommandService } from './openerservice'

export interface UrlHit { from: number, to: number, url: string }

function isUrlBreak(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
        || ch === '"' || ch === "'" || ch === '<' || ch === '>'
        || ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' || ch === '}'
}

function isTrail(ch: string): boolean {
    return ch === '.' || ch === ',' || ch === ';' || ch === ':' || ch === '!'
}

function startsHttp(text: string, i: number): boolean {
    return text[i] === 'h'
        && text[i + 1] === 't'
        && text[i + 2] === 't'
        && text[i + 3] === 'p'
        && (text[i + 4] === ':'
            || (text[i + 4] === 's' && text[i + 5] === ':'))
}

export function findUrlAt(text: string, pos: number): UrlHit | null {
    if (!text.length) return null
    let i = pos
    if (i >= text.length) i = text.length - 1
    if (i < 0) return null
    if (isUrlBreak(text[i]) && i > 0) i--
    let from = i
    while (from > 0 && !isUrlBreak(text[from - 1])) from--
    if (!startsHttp(text, from)) return null
    let to = from
    while (to < text.length && !isUrlBreak(text[to])) to++
    while (to > from && isTrail(text[to - 1])) to--
    if (to - from < 8) return null
    return { from, to, url: text.slice(from, to) }
}

export const selectLink: StateCommand = ({ state, dispatch }) => {
    const hit = findUrlAt(state.sliceDoc(), state.selection.main.head)
    if (!hit) return false
    if (state.selection.main.from === hit.from && state.selection.main.to === hit.to)
        return false
    dispatch(state.update({
        selection: EditorSelection.range(hit.from, hit.to),
        scrollIntoView: true,
        userEvent: 'select',
    }))
    return true
}

// ───────────────────────────────────────────────────────────────────────────
// 链接识别与点击(Monaco LinkComputer + LinkDetector + OpenLinkAction + registerLinkOpener)
//
// - computeLineLinks:LinkComputer 状态机的逐行移植(http:// https:// file://,大小写不敏感)。
// - `links` 选项(默认 true):识别出的链接画 detected-link 下划线;按住触发修饰键
//   (multiCursorModifier=altKey 时是 ⌘/Ctrl,ctrlCmd 时是 Alt)悬停变 detected-link-active;
//   修饰键 + 松开鼠标 = 打开。
// - 打开:先问 registerLinkOpener 注册的 opener(模块级,和 Monaco 的 editor.registerLinkOpener 一样),
//   没人认领 → http / https / mailto 走 window.open(noopener)。其他 scheme 默认不打开(Monaco 的 OpenerService 同样)。
// ───────────────────────────────────────────────────────────────────────────

import { StateEffect, StateField, type EditorState } from '../model/state'
import { Decoration, type DecorationSet } from '../model/decoration'
import { RangeSetBuilder } from '../model/rangeset'
import { CharacterClassifier } from '../model/characterclassifier'
import type { EditorView } from '../view/editorview'
import { getOption } from '../options'
import { resolvedMultiCursorModifier } from '../input/mouseselection'
import { lexicalDecorations } from './lexscan'
import type { ScanWindow } from '../view/scanwindow'
import type { HoverSource } from './hover'

export interface DetectedLink { from: number, to: number, url: string, tooltip?: string, provider?: ProviderLink }

/**
 * languages.registerLinkProvider 给的链接(Monaco Link:url 可以缺,点的时候才 resolveLink)。
 * 范围是文档偏移,随编辑映射;resolve() 失败时抛 Error('invalid' | 'missing'),同 Monaco Link.resolve。
 */
export interface ProviderLink { from: number, to: number, url?: string, tooltip?: string, resolve(): Promise<string> }
export const setProviderLinks = StateEffect.define<ProviderLink[]>()
export const providerLinkField = StateField.define<ProviderLink[]>({
    create: () => [],
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setProviderLinks)) return e.value
        if (!tr.docChanged || !v.length) return v
        const out: ProviderLink[] = []
        for (const l of v) {
            const from = tr.changes.mapPos(l.from, 1), to = tr.changes.mapPos(l.to, -1)
            if (to > from) out.push({ ...l, from, to })
        }
        return out
    },
})

// LinkComputer 的状态:Start=1 H=2 HT=3 HTT=4 HTTP=5 F=6 FI=7 FIL=8 BeforeColon=9 AfterColon=10 AlmostThere=11 End=12 Accept=13
const ST_START = 1
const ST_END = 12
const ST_ACCEPT = 13
const EDGES: Record<number, Record<string, number>> = {
    1: { h: 2, H: 2, f: 6, F: 6 },
    2: { t: 3, T: 3 },
    3: { t: 4, T: 4 },
    4: { p: 5, P: 5 },
    5: { s: 9, S: 9, ':': 10 },
    6: { i: 7, I: 7 },
    7: { l: 8, L: 8 },
    8: { e: 9, E: 9 },
    9: { ':': 10 },
    10: { '/': 11 },
    11: { '/': 12 },
}
const CLASS_NONE = 0
const CLASS_FORCE = 1
const CLASS_CANNOT_END = 2
const CLASSES = new CharacterClassifier<number>(CLASS_NONE)
// allow-any-unicode-next-line
for (const c of ' \t<>\'"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…|') CLASSES.set(c.charCodeAt(0), CLASS_FORCE)
for (const c of '.,;:') CLASSES.set(c.charCodeAt(0), CLASS_CANNOT_END)
const classOf = (ch: string) => CLASSES.get(ch.charCodeAt(0))

function createLink(line: string, begin: number, end: number): DetectedLink {
    // 不许以 . , ; : 结尾
    let last = end - 1
    do {
        if (classOf(line[last]) !== CLASS_CANNOT_END) break
        last--
    } while (last > begin)
    // ( [ { 包着的链接不带右括号
    if (begin > 0) {
        const before = line[begin - 1]
        const lastCh = line[last]
        if ((before === '(' && lastCh === ')') || (before === '[' && lastCh === ']') || (before === '{' && lastCh === '}')) last--
    }
    return { from: begin, to: last + 1, url: line.substring(begin, last + 1) }
}

/** 一行文本里的链接(偏移相对行首) */
export function computeLineLinks(line: string): DetectedLink[] {
    const result: DetectedLink[] = []
    const len = line.length
    let j = 0
    let begin = 0
    let beginCh = ''
    let state = ST_START
    let hasOpenParens = false
    let hasOpenSquare = false
    let inSquare = false
    let hasOpenCurly = false
    while (j < len) {
        let reset = false
        const ch = line[j]
        if (state === ST_ACCEPT) {
            let cls: number
            switch (ch) {
                case '(': hasOpenParens = true; cls = CLASS_NONE; break
                case ')': cls = hasOpenParens ? CLASS_NONE : CLASS_FORCE; break
                case '[': inSquare = true; hasOpenSquare = true; cls = CLASS_NONE; break
                case ']': inSquare = false; cls = hasOpenSquare ? CLASS_NONE : CLASS_FORCE; break
                case '{': hasOpenCurly = true; cls = CLASS_NONE; break
                case '}': cls = hasOpenCurly ? CLASS_NONE : CLASS_FORCE; break
                // ' " ` 只在链接被另一种引号包着时才允许出现在链接里
                case '\'': case '"': case '`':
                    if (beginCh === ch) cls = CLASS_FORCE
                    else if (beginCh === '\'' || beginCh === '"' || beginCh === '`') cls = CLASS_NONE
                    else cls = CLASS_FORCE
                    break
                case '*': cls = beginCh === '*' ? CLASS_FORCE : CLASS_NONE; break
                case ' ': cls = inSquare ? CLASS_NONE : CLASS_FORCE; break
                default: cls = classOf(ch)
            }
            if (cls === CLASS_FORCE) {
                result.push(createLink(line, begin, j))
                reset = true
            }
        }
        else if (state === ST_END) {
            let cls: number
            if (ch === '[') { hasOpenSquare = true; cls = CLASS_NONE } // authority 里的 ipv6
            else cls = classOf(ch)
            if (cls === CLASS_FORCE) reset = true
            else state = ST_ACCEPT
        }
        else {
            state = EDGES[state]?.[ch] ?? 0
            if (state === 0) reset = true
        }
        if (reset) {
            state = ST_START
            hasOpenParens = hasOpenSquare = hasOpenCurly = false
            begin = j + 1
            beginCh = ch
        }
        j++
    }
    if (state === ST_ACCEPT) result.push(createLink(line, begin, len))
    return result
}

/** 整篇文本的链接(文档偏移);text 从 offset 起、按整行切 */
function scanLinks(text: string, offset: number, out: (from: number, to: number, url: string) => void): void {
    let lineStart = 0
    while (lineStart <= text.length) {
        let nl = text.indexOf('\n', lineStart)
        if (nl < 0) nl = text.length
        const line = text.slice(lineStart, nl)
        if (line.includes('://')) for (const l of computeLineLinks(line)) out(offset + lineStart + l.from, offset + lineStart + l.to, l.url)
        lineStart = nl + 1
    }
}

/** `links` 选项开着时,pos 所在行里包着 pos 的链接(两端含,同 Monaco decoration 命中);provider 的链接优先,盖住的文本链接让位 */
export function linkAt(state: EditorState, pos: number): DetectedLink | null {
    if (getOption(state, 'links') === false) return null
    if (pos < 0 || pos > state.doc.length) return null
    const provided = state.field(providerLinkField, false)
    if (provided?.length) {
        const p = provided.find(l => l.from <= pos && pos <= l.to)
        if (p) return { from: p.from, to: p.to, url: p.url ?? '', tooltip: p.tooltip, provider: p }
    }
    const l = textLinkAt(state, pos)
    // Monaco LinksList._union:相交 / 相接的两条,provider 的留下
    return l && provided?.some(p => p.from <= l.to && l.from <= p.to) ? null : l
}

function textLinkAt(state: EditorState, pos: number): DetectedLink | null {
    const line = state.doc.lineAt(pos)
    const text = line.text
    if (!text.includes('://')) return null
    for (const l of computeLineLinks(text)) {
        if (pos - line.from >= l.from && pos - line.from <= l.to) return { from: line.from + l.from, to: line.from + l.to, url: l.url }
    }
    return null
}

const linkScan = lexicalDecorations((text, offset, b) => {
    scanLinks(text, offset, (from, to) => { if (to > from) b.add(from, to, Decoration.mark({ class: 'detected-link' })) })
})
const NO_LINKS: DecorationSet = new RangeSetBuilder<Decoration>().finish()

const providerLinkMark = Decoration.mark({ class: 'detected-link' })
/** languages.registerLinkProvider 的链接下划线(装进 decorations facet) */
export function providerLinkDecorations(state: EditorState): DecorationSet {
    const ls = state.field(providerLinkField, false)
    if (!ls?.length || getOption(state, 'links') === false) return NO_LINKS
    const b = new RangeSetBuilder<Decoration>()
    for (const l of [...ls].sort((a, c) => a.from - c.from || a.to - c.to))
        if (l.from < l.to && l.to <= state.doc.length) b.add(l.from, l.to, providerLinkMark)
    return b.finish()
}

/** 装进 decorations facet:`links` 为 false 不画 */
export function linkDecorations(state: EditorState, view?: { viewport: { from: number, to: number }, scanWindow?: ScanWindow }): DecorationSet {
    return getOption(state, 'links') === false ? NO_LINKS : linkScan(state, view)
}

export const setActiveLink = StateEffect.define<{ from: number, to: number } | null>()
export const activeLinkField = StateField.define<{ from: number, to: number } | null>({
    create: () => null,
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setActiveLink)) return e.value
        return tr.docChanged ? null : v
    },
})

/** 按住触发修饰键悬停的那条链接(detected-link-active),也装进 decorations facet */
export function activeLinkDecorations(state: EditorState): DecorationSet {
    const a = state.field(activeLinkField, false)
    if (!a || getOption(state, 'links') === false || a.from >= a.to || a.to > state.doc.length) return NO_LINKS
    const b = new RangeSetBuilder<Decoration>()
    b.add(a.from, a.to, Decoration.mark({ class: 'detected-link-active' }))
    return b.finish()
}

const isMacPlatform = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Monaco hasTriggerModifier:multiCursorModifier=altKey 时是 ⌘(mac)/ Ctrl,ctrlCmd 时是 Alt */
export function hasLinkModifier(state: EditorState, e: { altKey: boolean, ctrlKey: boolean, metaKey: boolean }): boolean {
    return resolvedMultiCursorModifier(state) === 'alt' ? (isMacPlatform ? e.metaKey : e.ctrlKey) : e.altKey
}

/** 链接 hover 卡文案(Monaco getHoverMessage):「Follow link (cmd + click)」 */
export function linkHoverText(state: EditorState, url: string): { label: string, kb: string } {
    const useMeta = resolvedMultiCursorModifier(state) === 'alt'
    const label = /^command:/i.test(url) ? 'Execute command' : 'Follow link'
    const kb = useMeta ? (isMacPlatform ? 'cmd + click' : 'ctrl + click') : (isMacPlatform ? 'option + click' : 'alt + click')
    return { label, kb }
}

// —— opener 注册(editor.registerLinkOpener)——
// 点链接走 Monaco 的 OpenerService(core/feature/openerservice.ts):validators → openers 链(后注册先问)→ 默认(外部 / command: / 编辑器)。
/** 最小 Uri(Monaco 传 URI 对象;这里给同名字段 + with / toString) */
export interface LinkUri extends OpenerUri { scheme: string, authority: string, path: string, query: string, fragment: string, toString(): string }
export interface ILinkOpener { open(resource: LinkUri): boolean | Promise<boolean> }

class LinkUriImpl implements LinkUri {
    constructor(
        readonly scheme: string, readonly authority: string, readonly path: string,
        readonly query: string, readonly fragment: string, private readonly raw?: string,
    ) {}
    with(c: { scheme?: string, authority?: string, path?: string, query?: string, fragment?: string }): LinkUri {
        return new LinkUriImpl(c.scheme ?? this.scheme, c.authority ?? this.authority, c.path ?? this.path, c.query ?? this.query, c.fragment ?? this.fragment)
    }
    toString(): string {
        if (this.raw !== undefined) return this.raw
        return `${this.scheme}:${this.authority || this.scheme === 'file' ? '//' + this.authority : ''}${this.path}${this.query ? '?' + this.query : ''}${this.fragment ? '#' + this.fragment : ''}`
    }
}

function parseUri(url: string): LinkUri | null {
    let u: URL
    try { u = new URL(url) } catch { return null }
    return new LinkUriImpl(
        u.protocol.replace(/:$/, ''),
        (u.username ? `${u.username}${u.password ? `:${u.password}` : ''}@` : '') + u.host,
        u.pathname, u.search.replace(/^\?/, ''), u.hash.replace(/^#/, ''), url,
    )
}

const noEditor: IOpenerEditorService = { openCodeEditor: () => false, getFocusedCodeEditor: () => null }
const noCommands: IOpenerCommandService = { executeCommand: () => undefined }
let linkOpenerService: OpenerService | null = null
/** 点链接共用的那一个 OpenerService(Monaco 的 IOpenerService 单例) */
export function getLinkOpenerService(): OpenerService {
    if (linkOpenerService) return linkOpenerService
    const svc = linkOpenerService = new OpenerService(noEditor, noCommands, v => parseUri(v) ?? new LinkUriImpl('', '', v, '', ''))
    // 链接文本里的空格不合法,开之前编成 %20(原 openLinkUrl 的行为)
    svc.setDefaultExternalOpener({
        openExternal: async (href, ctx) => {
            const w = ctx.window ?? (typeof window !== 'undefined' ? window : null)
            if (!w) return false
            w.open(href.replace(/ /g, '%20'), '_blank', 'noopener,noreferrer')
            return true
        },
    })
    return svc
}

/** 对应 Monaco `editor.registerLinkOpener`:模块级,所有编辑器共用;后注册的先问;返回的对象 dispose() 取消注册 */
export function registerLinkOpener(opener: ILinkOpener): { dispose(): void } {
    return getLinkOpenerService().registerOpener({
        // 单个 opener 抛错 = 没接管,交给下一个(链路不断)
        open: async t => { const u = typeof t === 'string' ? parseUri(t) : t; if (!u) return false; try { return await opener.open(u as LinkUri) } catch { return false } },
    })
}

/** 打开一个链接地址:opener 链(后注册先问)→ 默认(http / https / mailto 用 window.open)。不合法 → false */
export async function openLinkUrl(url: string, win?: Window | null): Promise<boolean> {
    if (!parseUri(url.replace(/ /g, '%20'))) return false
    try { return await getLinkOpenerService().open(url, { fromUserGesture: true, window: win }) } catch { return false }
}

/** 打开一条检测到的链接:provider 的先 resolve(缺 url 时问 resolveLink),失败只警告(Monaco notificationService.warn) */
export async function openDetectedLink(l: DetectedLink, win?: Window | null): Promise<boolean> {
    if (!l.provider) return openLinkUrl(l.url, win)
    let url: string
    try { url = await l.provider.resolve() }
    catch (err) {
        const m = err instanceof Error ? err.message : String(err)
        if (m === 'invalid') console.warn(`Failed to open this link because it is not well-formed: ${l.url}`)
        else if (m === 'missing') console.warn('Failed to open this link because its target is missing.')
        else console.error(err)
        return false
    }
    return openLinkUrl(url, win)
}

/** editor.action.openLink(OpenLinkAction):打开光标处的链接 */
export function openLink(view: EditorView): boolean {
    const l = linkAt(view.state, view.state.selection.main.head)
    if (!l) return false
    void openDetectedLink(l, view.dom.ownerDocument.defaultView)
    return true
}

/** Monaco 命令 id → 动作 */
export const LINK_COMMANDS: Record<string, (view: EditorView) => boolean> = {
    'editor.action.openLink': openLink,
}

/** hover 卡:链接上给「Follow link (cmd + click)」;链接点击也走 opener 链 */
export const linkHoverSource: HoverSource = (state, pos) => {
    const l = linkAt(state, pos)
    if (!l) return null
    const { label: defaultLabel, kb } = linkHoverText(state, l.url)
    const label = l.tooltip ? l.tooltip : defaultLabel
    return {
        pos: l.from,
        end: l.to,
        above: true,
        create: (view) => {
            const dom = document.createElement('div')
            dom.className = 'cm-link-hover'
            // 没有 url(点的时候才 resolveLink):只出文字,同 Monaco appendText
            if (!l.url) { dom.textContent = `${label} (${kb})`; return dom }
            const a = document.createElement('a')
            a.textContent = label
            a.href = l.url.replace(/ /g, '%20')
            a.title = /^command:/i.test(l.url) ? `Execute command ${/^command:([^?#]+)/i.exec(l.url)?.[1] ?? ''}` : ''
            a.style.cursor = 'pointer'
            a.addEventListener('click', (e) => {
                e.preventDefault()
                void openDetectedLink(l, view?.dom.ownerDocument.defaultView)
            })
            dom.append(a, document.createTextNode(` (${kb})`))
            return dom
        },
    }
}

/** 挂载器(装在 overlays 里):修饰键 + 悬停 → 激活;修饰键 + 松开鼠标 → 打开 */
export function linkDetector(view: EditorView): () => void {
    const win = view.dom.ownerDocument.defaultView
    const content = view.contentDOM
    let last: { x: number, y: number } | null = null
    let modifier = false
    const setActive = (v: { from: number, to: number } | null) => {
        const cur = view.state.field(activeLinkField, false)
        if (!cur && !v) return
        if (cur && v && cur.from === v.from && cur.to === v.to) return
        view.dispatch(view.state.update({ effects: setActiveLink.of(v) }))
    }
    const refresh = () => {
        if (!modifier || !last || getOption(view.state, 'links') === false) { setActive(null); return }
        const pos = view.posAtCoords({ x: last.x, y: last.y }, false)
        const l = pos == null ? null : linkAt(view.state, pos)
        setActive(l ? { from: l.from, to: l.to } : null)
    }
    const onMove = (e: MouseEvent) => {
        last = { x: e.clientX, y: e.clientY }
        modifier = hasLinkModifier(view.state, e)
        refresh()
    }
    const onKey = (e: KeyboardEvent) => {
        const m = hasLinkModifier(view.state, e)
        if (m === modifier) return
        modifier = m
        refresh()
    }
    const onLeave = () => { last = null; setActive(null) }
    const onUp = (e: MouseEvent) => {
        // mouseMiddleClickAction(Monaco ClickLinkMouseEvent):'openLink' 中键直接开链接;'ctrlLeftClick' 中键当 Ctrl/Cmd+左键;'default' 不管
        const mid = getOption(view.state, 'mouseMiddleClickAction')
        const middle = e.button === 1 && (mid === 'openLink' || mid === 'ctrlLeftClick')
        if (!middle && (e.button !== 0 || !hasLinkModifier(view.state, e))) return
        if (getOption(view.state, 'links') === false) return
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false)
        const l = pos == null ? null : linkAt(view.state, pos)
        if (l) void openDetectedLink(l, win)
    }
    content.addEventListener('mousemove', onMove)
    content.addEventListener('mouseleave', onLeave)
    content.addEventListener('mouseup', onUp)
    win?.addEventListener('keydown', onKey, true)
    win?.addEventListener('keyup', onKey, true)
    win?.addEventListener('blur', onLeave)
    return () => {
        content.removeEventListener('mousemove', onMove)
        content.removeEventListener('mouseleave', onLeave)
        content.removeEventListener('mouseup', onUp)
        win?.removeEventListener('keydown', onKey, true)
        win?.removeEventListener('keyup', onKey, true)
        win?.removeEventListener('blur', onLeave)
        setActive(null)
    }
}
