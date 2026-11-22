// 剪贴板/拖放拦截 —— 纯文本路径,避免 contenteditable 原生 paste/cut/drop 破 DOM≡doc。
// 对齐 Monaco/CM6:主动 preventDefault + 读 text/plain + 走 state 命令,不让浏览器塞 HTML 进 DOM。
// 产品选择:只取纯文本(代码编辑器不该保留粗体/颜色)。
//
// 键盘 Cmd/Ctrl+C/X/V:走 keymap 命令(Clipboard API / 临时 textarea 兜底),
// 不依赖 keydown 放行后的 copy 事件——自定义选区时系统常不发/clipboardData 为空。
// 右键菜单 copy/paste 仍走 contentDOM 的 copy/cut/paste 事件。

import type { EditorView } from '../view/editorview'
import type { EditorState, Transaction } from '../model/state'
import { Facet } from '../model/state'
import { inputHandler } from '../view/editorview'
import { EditorSelection } from '../model/selection'
import { cachedRelTokens, rowTokens } from '../view/tokens'
import { keyOS } from '../keyos'
import { boolOption, stringOption } from '../edit/editoptions'
import { autoWhitespaceTrims } from '../edit/enter'
import { InputMode, overtypeRange } from '../edit/inputmode'
type CmdTarget = { state: EditorState, dispatch: (tr: Transaction) => void }

// Monaco copyWithSyntaxHighlighting,默认开。关了就只写 text/plain。
// 选项 `copyWithSyntaxHighlighting` 和这个 facet 任一为 false 都关(宿主可以只用其中一个)。
export const copyWithSyntaxHighlighting = Facet.define<boolean, boolean>({
    combine: vs => (vs.length ? vs[vs.length - 1] : true),
})

const copyLanguage = new WeakMap<EditorView, string>()

/** liteMonaco() 记下语言:plaintext 不写 text/html(Monaco getRichTextToCopy)。 */
export function setCopyLanguage(view: EditorView, lang: string): void {
    copyLanguage.set(view, lang)
}

// —— 复制元数据(对齐 Monaco InMemoryClipboardMetadataManager)——
// 最近一次从编辑器复制/剪切的文本 + 「是不是空选区整行复制」+ 多光标逐段文本。粘贴时文本相同才认,
// 外部程序改过剪贴板就当普通文本。模块级:同页多个编辑器之间也通(Monaco 同为单例)。
export interface CopyMeta { isFromEmptySelection: boolean, multicursorText: readonly string[] | null }
let lastCopied: { text: string, meta: CopyMeta } | null = null

export function rememberCopied(text: string, meta: CopyMeta): void {
    lastCopied = { text, meta }
}

function metaFor(text: string): CopyMeta | null {
    return lastCopied && lastCopied.text === text ? lastCopied.meta : null
}

/** 测试用:清掉复制元数据。 */
export function resetClipboardMeta(): void { lastCopied = null }

/** Monaco emptySelectionClipboard(默认 true):关了之后空选区不复制 / 不剪切整行,粘贴也不再插到行首 */
export function emptySelectionClipboard(state: EditorState): boolean {
    return boolOption(state, 'emptySelectionClipboard', true)
}

// 按 \r\n / \r / \n 切行(core 不用正则)
function splitLines(text: string): string[] {
    const out: string[] = []
    let start = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 13 || c === 10) {
            out.push(text.slice(start, i))
            if (c === 13 && text.charCodeAt(i + 1) === 10) i++
            start = i + 1
        }
    }
    out.push(text.slice(start))
    return out
}

// Monaco _distributePasteToCursors:多光标时,复制时的逐段文本数正好等于光标数就一段一个;
// 否则(multiCursorPaste 'spread')去掉末尾一个换行后按行切,行数等于光标数也一行一个。
function distributePaste(text: string, count: number, meta: CopyMeta | null, pasteOnNewLine: boolean, spread: boolean): readonly string[] | null {
    if (pasteOnNewLine || count === 1) return null
    if (meta?.multicursorText && meta.multicursorText.length === count) return meta.multicursorText
    // multiCursorPaste 'full':不按行分给各光标,每个光标贴全文
    if (!spread) return null
    let t = text
    if (t.charCodeAt(t.length - 1) === 10) t = t.slice(0, -1)
    if (t.charCodeAt(t.length - 1) === 13) t = t.slice(0, -1)
    const lines = splitLines(t)
    return lines.length === count ? lines : null
}

/**
 * 算粘贴事务(对齐 Monaco TypeOperations.paste):
 *   - 多光标且能分发 → 光标按位置排序,各换一段,光标落各自插入末;
 *   - 文本来自单个空选区的整行复制(pasteOnNewLine)、当前选区为空、文本只有末尾一个换行
 *     → 插到光标所在行首,光标跟着往下挪(选区不变);
 *   - 否则每个选区换成整段文本,光标落插入末。
 */
export function pasteTransaction(state: EditorState, text: string): Transaction {
    const meta = metaFor(text)
    // Monaco:pasteOnNewLine = emptySelectionClipboard && metadata.isFromEmptySelection
    let pasteOnNewLine = emptySelectionClipboard(state) && !!meta?.isFromEmptySelection
    const ranges = state.selection.ranges
    const dist = distributePaste(text, ranges.length, meta, pasteOnNewLine, stringOption(state, 'multiCursorPaste', 'spread') !== 'full')
    // changes[i] 对应 ranges[i];preserve[i] = 行首插入、选区原样跟随
    const changes: { from: number, to: number, insert: string }[] = []
    const preserve: boolean[] = []
    if (dist) {
        const order = ranges.map((_, i) => i).sort((a, b) => ranges[a].from - ranges[b].from)
        order.forEach((ri, k) => { changes[ri] = { from: ranges[ri].from, to: ranges[ri].to, insert: dist[k] }; preserve[ri] = false })
    } else {
        ranges.forEach((r, i) => {
            if (pasteOnNewLine && !r.empty) pasteOnNewLine = false
            if (pasteOnNewLine && text.indexOf('\n') !== text.length - 1) pasteOnNewLine = false
            if (pasteOnNewLine) {
                const ls = state.doc.lineAt(r.head).from
                changes[i] = { from: ls, to: ls, insert: text }
            } else changes[i] = { from: r.from, to: r.to, insert: text }
            preserve[i] = pasteOnNewLine
        })
    }
    // overtype 模式(overtypeOnPaste 默认开):整段粘贴也吃掉后面等长文本(行首整行粘贴除外)
    if (InputMode.getInputMode() === 'overtype' && boolOption(state, 'overtypeOnPaste', true))
        changes.forEach((c, i) => { if (!preserve[i]) Object.assign(c, overtypeRange(state, c.from, c.to, c.insert.length)) })
    // 同一行多个光标的行首插入只插一次
    const uniq = changes.filter((c, i) => changes.findIndex(d => d.from === c.from && d.to === c.to && d.insert === c.insert) === i)
    const set = state.changes([...autoWhitespaceTrims(state, uniq), ...uniq])
    const out = ranges.map((r, i) => preserve[i]
        ? EditorSelection.range(set.mapPos(r.anchor, 1), set.mapPos(r.head, 1))
        : EditorSelection.cursor(set.mapPos(changes[i].to, 1)))
    return state.update({
        changes: set,
        selection: EditorSelection.create(out, state.selection.mainIndex),
        scrollIntoView: true,
        userEvent: 'input.paste',
    })
}

// 把纯文本落到所有选区(见 pasteTransaction)。单选区、普通粘贴、多于一个字符时先问 inputHandler
// (formatOnPaste 之类);单个字符不问——Monaco 粘贴不走打字拦截(不会自动补括号)。
export function pasteText(view: EditorView, text: string): boolean {
    if (view.state.readOnly)
        return true
    view.observer.forceFlush()
    const { state } = view
    // 空串仍消费事件(防原生塞 HTML);空选区不写 doc,有选区时 Monaco 把选区换成空串(删掉)。
    if (!text) {
        if (state.selection.ranges.some(r => !r.empty)) view.dispatch(pasteTransaction(state, ''))
        return true
    }
    const meta = metaFor(text)
    if (state.selection.ranges.length === 1 && text.length > 1 && !(emptySelectionClipboard(state) && meta?.isFromEmptySelection && state.selection.main.empty)) {
        const sel = state.selection.main
        for (const handler of state.facet(inputHandler)) {
            if (handler(view, sel.from, sel.to, text))
                return true
        }
    }
    view.dispatch(pasteTransaction(state, text))
    return true
}

/**
 * 复制内容(对齐 Monaco getPlainTextToCopy + DeleteOperations.cut):
 *   - text:剪贴板文本。全是空选区 → 各光标所在行(同行只算一次)各带一个换行;
 *     有非空选区 → 各段按位置排序用换行连起来(混有空选区时空选区算整行、不带换行)。
 *   - ranges:剪切要删的区间。空选区删整行:不是末行 → 行首到下一行行首;末行且有上一行
 *     (而上一段剪切没碰到这行)→ 连同前一个换行;只有一行 → 行内容。
 *   - multicursorText:多段时的逐段文本(粘贴到同样多的光标时一段一个)。
 *   - isFromEmptySelection:单个空选区(粘贴时整行插到行首)。
 */
export function copiedRange(state: EditorState): { text: string, ranges: { from: number, to: number }[], multicursorText: string[] | null, isFromEmptySelection: boolean } {
    const doc = state.doc
    const sorted = state.selection.ranges.slice().sort((a, b) => a.from - b.from)
    const hasNonEmpty = sorted.some(r => !r.empty)
    const hasEmpty = sorted.some(r => r.empty)
    const emptyAsLine = emptySelectionClipboard(state)
    let text: string
    let multicursorText: string[] | null = null
    if (!hasNonEmpty) {
        text = ''
        // getPlainTextToCopy:全是空选区且 emptySelectionClipboard 关 → 什么也不复制
        if (!emptyAsLine) return { text, ranges: [], multicursorText: null, isFromEmptySelection: false }
        let prev = -1
        for (const r of sorted) {
            const line = doc.lineAt(r.from)
            if (line.number === prev) continue
            text += line.text + state.lineBreak
            prev = line.number
        }
    } else {
        const parts: string[] = []
        let prev = 0
        for (const r of sorted) {
            const ln = doc.lineAt(r.from).number
            if (r.empty) {
                if (hasEmpty && emptyAsLine && ln !== prev) parts.push(doc.lineAt(r.from).text)
            } else parts.push(state.sliceDoc(r.from, r.to))
            prev = ln
        }
        text = parts.join(state.lineBreak)
        if (parts.length > 1) multicursorText = parts
    }
    const ranges: { from: number, to: number }[] = []
    let lastCutEnd = -1
    for (const r of sorted) {
        if (!r.empty) { ranges.push({ from: r.from, to: r.to }); continue }
        if (!emptyAsLine) continue
        const line = doc.lineAt(r.head)
        let from: number, to: number
        if (line.number < doc.lines) { from = line.from; to = doc.line(line.number + 1).from }
        else if (line.number > 1 && doc.lineAt(Math.max(0, lastCutEnd)).number !== line.number) { from = line.from - 1; to = line.to }
        else { from = line.from; to = line.to }
        lastCutEnd = to
        if (from === to) continue
        // 同一行多个光标:Monaco 也只删一次(重复区间去掉)
        if (ranges.some(x => x.from === from && x.to === to)) continue
        ranges.push({ from, to })
    }
    const isFromEmptySelection = emptyAsLine && state.selection.ranges.length === 1 && state.selection.main.empty
    return { text, ranges, multicursorText, isFromEmptySelection }
}

// 剪切事务:各区间删掉,光标落各自删除处(Monaco ReplaceCommand)
function cutTransaction(state: EditorState, ranges: { from: number, to: number }[]): Transaction {
    const set = state.changes(ranges)
    const cursors = ranges.map(r => EditorSelection.cursor(set.mapPos(r.from, -1)))
    // 剪切不动的空选区(比如同一行第二个光标)跟着映射
    return state.update({
        changes: set,
        selection: cursors.length ? EditorSelection.create(cursors, Math.min(state.selection.mainIndex, cursors.length - 1)) : undefined,
        scrollIntoView: true,
        userEvent: 'delete.cut',
    })
}

// 写系统剪贴板:优先 async Clipboard API;失败则临时 textarea + execCommand。
export function writeClipboardText(text: string, view?: EditorView): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => { legacyWrite(text, view) })
        return
    }
    legacyWrite(text, view)
}

function legacyWrite(text: string, view?: EditorView): void {
    if (typeof document === 'undefined') return
    const prev = document.activeElement
    const sel = view?.state.selection
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;padding:0;border:none'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try { document.execCommand('copy') } catch { /* */ }
    ta.remove()
    // E1:临时 textarea 抢过焦点,交还。不交的话接下来的按键打到 body 上,字丢了。
    // view.focus() 在原生 focus 返回后再把 state 选区写回:聚焦 contenteditable 会把原生选区放到内容根上。
    if (view && prev === view.contentDOM) view.focus()
    else if (prev instanceof HTMLElement && prev.isConnected) prev.focus()
    if (view && sel && !view.state.selection.eq(sel))
        view.dispatch(view.state.update({ selection: sel }))
}

export async function readClipboardText(): Promise<string> {
    return (await readClipboard()) ?? ''
}

// 读不到(没权限、没 API)返回 null,和「剪贴板确实是空串」分开:空串粘贴会删掉选区(Monaco 同),读失败不能删
async function readClipboard(): Promise<string | null> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try { return await navigator.clipboard.readText() } catch { return null }
    }
    return null
}

function htmlEscape(text: string): string {
    let out = ''
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 38) out += '&amp;'
        else if (c === 60) out += '&lt;'
        else if (c === 62) out += '&gt;'
        else if (c === 0) out += '&#00;'
        else out += text[i]
    }
    return out
}

function expandTabs(text: string, tabSize: number, col0: number): string {
    let out = ''
    let col = col0
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\t') {
            const n = tabSize - col % tabSize
            for (let k = 0; k < n; k++) out += ' '
            col += n
        } else {
            out += text[i]
            col++
        }
    }
    return out
}

function copyFont(): { family: string, size: number, line: number } {
    if (keyOS === 'mac') return { family: "Menlo, Monaco, 'Courier New', monospace", size: 12, line: 18 }
    if (keyOS === 'win') return { family: "Consolas, 'Courier New', monospace", size: 14, line: 19 }
    return { family: "'Droid Sans Mono', 'monospace', monospace", size: 14, line: 19 }
}

function isView(target: CmdTarget): target is EditorView {
    return 'contentDOM' in target && 'dom' in target
}

// 单选区(空光标先扩成整行)拼 Monaco getRichTextToCopy 的那层 div。多选区、plaintext、超 64K 不写。
function richHtml(view: EditorView): string | null {
    if (!view.state.facet(copyWithSyntaxHighlighting) || !boolOption(view.state, 'copyWithSyntaxHighlighting', true)) return null
    if (copyLanguage.get(view) === 'plaintext') return null
    const sel = view.state.selection
    if (sel.ranges.length !== 1) return null
    const doc = view.state.doc
    let range = sel.main
    if (range.empty) {
        if (!emptySelectionClipboard(view.state)) return null
        const line = doc.lineAt(range.head)
        range = EditorSelection.range(line.from, line.to)
    }
    if (range.to - range.from >= 65536) return null
    const fg = view.dom.style.getPropertyValue('--lm-editor-foreground').trim() || '#d4d4d4'
    const bg = view.dom.style.getPropertyValue('--lm-editor-background').trim() || '#1e1e1e'
    const font = copyFont()
    const cached = cachedRelTokens()
    const tabSize = view.state.tabSize
    const startLine = doc.lineAt(range.from)
    const endLine = range.to > range.from ? doc.lineAt(range.to - 1) : startLine
    let body = ''
    for (let n = startLine.number; n <= endLine.number; n++) {
        const line = doc.line(n)
        const fromCol = n === startLine.number ? range.from - line.from : 0
        const toCol = n === endLine.number ? Math.min(line.length, range.to - line.from) : line.length
        if (fromCol >= toCol) {
            if (!line.length) body += '<br>'
            continue
        }
        const rel = cached && cached.lines[n - 1] === line.text ? rowTokens(cached.rel[n - 1], line.text) : null
        let spans = ''
        if (rel) {
            for (const tok of rel) {
                const a = Math.max(tok.offset, fromCol)
                const b = Math.min(tok.offset + tok.content.length, toCol)
                if (a >= b) continue
                const color = tok.color || fg
                spans += `<span style="color: ${color};">${htmlEscape(expandTabs(line.text.slice(a, b), tabSize, a))}</span>`
            }
        }
        if (!spans)
            spans = `<span style="color: ${fg};">${htmlEscape(expandTabs(line.text.slice(fromCol, toCol), tabSize, fromCol))}</span>`
        body += `<div>${spans}</div>`
    }
    return `<div style="color: ${fg};background-color: ${bg};font-family: ${font.family};font-weight: normal;font-size: ${font.size}px;line-height: ${font.line}px;white-space: pre;">${body}</div>`
}

function writeClipboard(text: string, html: string | null, view?: EditorView): void {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (html && clip && typeof clip.write === 'function' && typeof ClipboardItem === 'function') {
        const item = new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
        })
        void clip.write([item]).catch(() => { legacyWrite(text, view) })
        return
    }
    writeClipboardText(text, view)
}

interface ClipSink { clearData(): void, setData(type: string, value: string): void }

// cut=true 时写剪贴板后删区间;cut=false 只拷。返回是否消费了事件。
export function cutOrCopy(view: EditorView, data: ClipSink | null, cut: boolean): boolean {
    const { text, ranges, multicursorText, isFromEmptySelection } = copiedRange(view.state)
    if (!text && !ranges.length)
        return false
    rememberCopied(text, { isFromEmptySelection, multicursorText })
    const html = richHtml(view)
    if (data) {
        data.clearData()
        data.setData('text/plain', text)
        if (html) data.setData('text/html', html)
    } else {
        writeClipboard(text, html, view)
    }
    if (cut && !view.state.readOnly && ranges.length) {
        view.observer.forceFlush()
        view.dispatch(cutTransaction(view.state, ranges))
    }
    return true
}

// keymap:Mod-c / Mod-x / Mod-v —— 在 keydown 同步消费,不依赖后续 copy/paste 事件。
export function copyCommand(target: CmdTarget): boolean {
    const { text, ranges, multicursorText, isFromEmptySelection } = copiedRange(target.state)
    if (!text && !ranges.length) return true
    rememberCopied(text, { isFromEmptySelection, multicursorText })
    writeClipboard(text, isView(target) ? richHtml(target) : null, isView(target) ? target : undefined)
    return true
}

export function cutCommand(target: CmdTarget): boolean {
    const view = target as EditorView
    const { text, ranges, multicursorText, isFromEmptySelection } = copiedRange(target.state)
    if (!text && !ranges.length) return true
    rememberCopied(text, { isFromEmptySelection, multicursorText })
    writeClipboard(text, isView(target) ? richHtml(target) : null, isView(target) ? target : undefined)
    // Monaco:只读时剪切照样复制,再弹「Cannot edit in read-only editor」
    if (target.state.readOnly) {
        if (typeof view.attemptReadOnlyEdit === 'function') view.attemptReadOnlyEdit()
    }
    else if (ranges.length) {
        if (typeof view.observer?.forceFlush === 'function') view.observer.forceFlush()
        target.dispatch(cutTransaction(target.state, ranges))
    }
    return true
}

export function pasteCommand(target: CmdTarget): boolean {
    const view = target as EditorView
    if (target.state.readOnly) {
        if (typeof view.attemptReadOnlyEdit === 'function') view.attemptReadOnlyEdit()
        return true
    }
    if (typeof view.observer?.forceFlush !== 'function') return false
    void readClipboard().then(text => {
        if (text !== null) pasteText(view, text)
    })
    return true
}

// drop:永远 preventDefault(防原生塞 HTML 破双射)。有 text/plain 时插到主光标
// (无 posAtCoords 时落点 = 当前选区,不猜坐标;有坐标映射后再换精确落点)。
export function dropText(view: EditorView, text: string): boolean {
    if (view.state.readOnly)
        return true
    if (!text)
        return true
    view.observer.forceFlush()
    view.dispatch(view.state.update(
        view.state.replaceSelection(text),
        { scrollIntoView: true, userEvent: 'input.drop' },
    ))
    return true
}

// 装到 contentDOM 上的事件 handler。返回 true = 已 preventDefault。
export function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    if (view.state.readOnly) {
        event.preventDefault()
        if (typeof view.attemptReadOnlyEdit === 'function') view.attemptReadOnlyEdit() // Monaco:只读里粘贴弹「Cannot edit in read-only editor」
        return true
    }
    const data = event.clipboardData
    if (!data) {
        // 无 clipboardData 时走 async API(右键菜单少见,但保险)
        event.preventDefault()
        void readClipboardText().then(text => { if (text) pasteText(view, text) })
        return true
    }
    const text = data.getData('text/plain') || data.getData('text/uri-list')
    event.preventDefault()
    pasteText(view, text)
    return true
}

export function handleCopy(view: EditorView, event: ClipboardEvent): boolean {
    const data = event.clipboardData
    if (!cutOrCopy(view, data, false))
        return false
    event.preventDefault()
    return true
}

export function handleCut(view: EditorView, event: ClipboardEvent): boolean {
    const data = event.clipboardData
    if (!cutOrCopy(view, data, true))
        return false
    event.preventDefault()
    return true
}

export function handleDrop(view: EditorView, event: DragEvent): boolean {
    // 永远拦原生 drop(否则浏览器塞 HTML/文件进 contenteditable 破双射)。
    event.preventDefault()
    if (view.state.readOnly)
        return true
    const dt = event.dataTransfer
    if (!dt)
        return true
    const text = dt.getData('text/plain') || dt.getData('Text')
    if (!text) return true
    // F6:外部拖入插在落点,光标落在插入文本之后(Monaco dropIntoEditor 同);拿不到坐标时退回插在选区
    // 合成事件可能没有坐标(clientX undefined)→ 不算落点
    const pos = Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ? view.posAtCoords({ x: event.clientX, y: event.clientY }) : null
    if (pos != null && !view.state.readOnly) {
        view.observer.forceFlush()
        view.dispatch(view.state.update({
            changes: { from: pos, insert: text },
            selection: { anchor: pos + text.length },
            scrollIntoView: true,
            userEvent: 'input.drop',
        }))
        return true
    }
    dropText(view, text)
    return true
}

// dragover 不 preventDefault 时浏览器拒收 drop。必须认领。
export function handleDragOver(_view: EditorView, event: DragEvent): boolean {
    event.preventDefault()
    if (event.dataTransfer)
        event.dataTransfer.dropEffect = 'copy'
    return true
}
