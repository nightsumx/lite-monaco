// CM7 materialize —— tile 树 → 真 contenteditable DOM。阶段4 第一刀。
//
// buildtile 决定「渲染成什么」(DOM-free spec),materialize 决定「DOM 长什么样」。CM6 把这两件
// 焊在 tile.ts 一个类里(每 tile 携 .dom + sync/track 增量缓存),正是它的可监测黑洞;CM7 拆成
// 「纯 spec(可枚举/toJSON) + 物化函数(吃 spec 产 DOM)」两层。
//
// 全量重建,无增量复用(TileCache/sync/track/freeNode 是阶段4 后续 docview 的性能优化,
// 当前先立正确的物化语义,元真理:没有真实增量消费者前不建缓存机器)。
// block widget:toDOM + data-cm-widget=占位 doc 长;contenteditable=false,不进行文本流。

import type { BlockTile, DocTile, InlineTile } from './buildtile'
import type { Attrs } from '../model/decoration'
import { BlockWidgetTile, InlineWidgetTile, LineTile, MarkTile, TextTile } from './buildtile'

function setAttrs(dom: HTMLElement, attrs: Attrs) {
    for (const name of Object.keys(attrs)) {
        if (name === 'style')
            dom.style.cssText = attrs[name]
        else
            dom.setAttribute(name, attrs[name])
    }
}

function materializeInline(tile: InlineTile): Node {
    if (tile instanceof TextTile)
        return document.createTextNode(tile.text)
    if (tile instanceof MarkTile) {
        const el = document.createElement(tile.mark.tagName)
        setAttrs(el, tile.mark.attrs)
        for (const child of tile.children) el.appendChild(materializeInline(child))
        return el
    }
    if (tile instanceof InlineWidgetTile) {
        if (tile.widget) {
            // widget 隐藏/替换 tile.length 个 doc 字符,但其 DOM(⋯ 等)可见长度不等于 doc 长。
            // 标记 data-cm-widget=length,让 dombridge 把它当占 length 个 doc 字符的原子块换算。
            const dom = tile.widget.toDOM()
            const el = dom.nodeType === 1
                ? dom as HTMLElement
                : (() => { const w = document.createElement('span'); w.appendChild(dom); return w })()
            el.setAttribute('data-cm-widget', String(tile.length))
            if (tile.from >= 0) el.setAttribute('data-cm-widget-from', String(tile.from))
            // widget 是原子:必须 contenteditable=false,否则浏览器把占位(⋯)当可编辑文本,
            // 回车/输入能拆穿 widget 破坏 data-cm-widget 结构 → domreader 读回丢隐藏原文
            // (真页 51→464 行的折叠回车 bug 根因)。CM6 同款(EditorView.editable widget 恒 false)。
            el.contentEditable = 'false'
            return el
        }
        throw new Error('CM7 materialize: inline widget 无 widget 对象')
    }
    throw new Error('CM7 materialize: 未知 inline tile')
}

// 行首缩进(Monaco wrappingIndent: 'same'):折行续行缩进到原行的缩进处。只记 CSS 变量,
// 由 `.cm-content.cm-lineWrapping .cm-line` 的 padding-left + 负 text-indent 生效(不折行时无影响)。
// 纯空格 → Nch;纯 tab → N×tab-size ch(落在 tab stop 上,负 text-indent 起点的 tab 仍对齐);
// 空格 tab 混排 → 不设(负 text-indent 下混排 tab 宽算不准,宁可续行顶格)。
function wrapIndent(tile: LineTile): string {
    let spaces = 0, tabs = 0
    for (const child of tile.children) {
        const text = child instanceof TextTile ? child.text
            : child instanceof MarkTile ? leadingText(child) : ''
        let i = 0
        while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
            if (text[i] === ' ') spaces++
            else tabs++
            i++
        }
        if (i < text.length || !(child instanceof TextTile || child instanceof MarkTile)) break
    }
    return indentCSS(spaces, tabs)
}

function indentCSS(spaces: number, tabs: number): string {
    if (spaces && tabs) return ''
    if (spaces) return `${spaces}ch`
    if (tabs) return `calc(${tabs}ch * var(--lm-tab-size, 4))`
    return ''
}

/** 纯文本行的 --cm-wrap-indent(同 wrapIndent,给几何探针用)。 */
export function wrapIndentOfText(text: string): string {
    let spaces = 0, tabs = 0, i = 0
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
        if (text[i] === ' ') spaces++
        else tabs++
        i++
    }
    return indentCSS(spaces, tabs)
}

// mark 的完整文本(只取 TextTile / 嵌套 mark;遇 widget 截断,行首缩进不跨 widget)
function leadingText(mark: MarkTile): string {
    let out = ''
    for (const c of mark.children) {
        if (c instanceof TextTile) out += c.text
        else if (c instanceof MarkTile) out += leadingText(c)
        else return out + '\u0000'
    }
    return out
}

// Monaco base/common/strings.containsRTL(Unicode R / AL 类)。BMP 部分按它的正则逐段抄;
// 辅助平面(Adlam / Hanifi / Mende Kikakui / 古文字等)只按高代理项粗判,多出来的几个码位不影响显示。
const RTL_RANGES: readonly number[] = [
    0x5BE, 0x5BE, 0x5C0, 0x5C0, 0x5C3, 0x5C3, 0x5C6, 0x5C6, 0x5D0, 0x5F4, 0x608, 0x608, 0x60B, 0x60B, 0x60D, 0x60D,
    0x61B, 0x64A, 0x66D, 0x66F, 0x671, 0x6D5, 0x6E5, 0x6E6, 0x6EE, 0x6EF, 0x6FA, 0x710, 0x712, 0x72F, 0x74D, 0x7A5,
    0x7B1, 0x7EA, 0x7F4, 0x7F5, 0x7FA, 0x7FA, 0x7FE, 0x815, 0x81A, 0x81A, 0x824, 0x824, 0x828, 0x828, 0x830, 0x858,
    0x85E, 0x88E, 0x8A0, 0x8C9, 0x200F, 0x200F, 0xFB1D, 0xFB1D, 0xFB1F, 0xFB28, 0xFB2A, 0xFD3D, 0xFD50, 0xFDC7,
    0xFDF0, 0xFDFC, 0xFE70, 0xFEFC,
]
// 粗筛:RTL_RANGES 和那四个高代理项都落在这几段里。正则走引擎的原生扫描,比逐码元循环快几倍(纯拉丁的长行是常态);命中再逐个细判
const MAYBE_RTL = /[\u05be-\u08ff\u200f\ufb1d-\ufefc\ud802\ud803\ud83a\ud83b]/
export function containsRTL(text: string): boolean {
    if (!MAYBE_RTL.test(text)) return false
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c < 0x5BE) continue // 快路径:拉丁 / CJK 以外的绝大多数代码都在这里
        if (c === 0xD802 || c === 0xD803 || c === 0xD83A || c === 0xD83B) return true
        for (let k = 0; k < RTL_RANGES.length; k += 2)
            if (c >= RTL_RANGES[k] && c <= RTL_RANGES[k + 1]) return true
    }
    return false
}

function inlineText(tile: InlineTile): string {
    if (tile instanceof TextTile) return tile.text
    if (tile instanceof MarkTile) return tile.children.map(inlineText).join('')
    return ''
}

// Monaco viewLineRenderer:含 RTL 字符的 token 写成 <span dir=rtl style=unicode-bidi:isolate>。
// Monaco 的「token」是语言分词出来的一段;lite 的一级子节点还夹着装饰劈出来的碎片(选区 / 同词高亮 / 诊断 / tab stop / 尾随空格
// 这些带 class 的 mark,Monaco 里它们是叠加层或者不劈 token),所以不能一级子节点一个 token:
//  1. 先分组:相邻、「语法着色相同」的子节点是同一个 token(裸文本和带 class 的 mark 不带着色,透明;只有无 class、带 style 的 mark
//     是语法 token,按它的 style 区分)。选中 `abc ש` 里的 `ש` 不会把 `abc ` 劈出隔离外,tab stop / 行尾空格也留在它们所在的 token 里;
//  2. 含 RTL 的 token 进隔离 span,连续的含 RTL 的 token 并进同一个 span(装饰把一个 token 劈成几段着色相同的 mark 时,显示顺序不变);
//  3. 行首空白从第一个含 RTL 的 token 劈出来放在隔离外(Monaco splitLeadingWhitespaceFromRTL):缩进永远在左,不跟着 RTL 跑到右边。
// 真浏览器逐字形对拍见 scripts/browser-diff/scenarios/85-rtl.mjs。
function tokenKey(t: InlineTile): string | null {
    if (t instanceof TextTile) return ''
    if (t instanceof MarkTile) {
        const a = t.mark.attrs
        if (!a?.class) return a?.style ?? '' // 语法 token:无 class,靠 style(着色 / 字体样式)区分
        for (const c of t.children) { const k = tokenKey(c); if (k !== null) return k } // 装饰 mark:看里面
        return ''
    }
    return null // inline widget:自成一段
}

// 第一个含 RTL 的 token 开头若有空白:空白放到 el 里(隔离 span 外),剩下的节点返回
function peelLeadingSpace(el: HTMLElement, nodes: Node[]): Node[] {
    while (nodes.length) {
        const node = nodes[0]
        const t = node.nodeType === 3 ? node as Text : node.nodeType === 1 && node.firstChild?.nodeType === 3 ? node.firstChild as Text : null
        if (!t) break
        if (nodes.length > 1 && node === t && /^[ \t]+$/.test(t.data)) { el.appendChild(t); nodes = nodes.slice(1); continue } // 整段都是空白
        const m = /^[ \t]+(?=[^ \t])/.exec(t.data)
        if (!m) break
        const lead = m[0].length
        if (node === t) el.appendChild(document.createTextNode(t.data.slice(0, lead)))
        else { // 带着同样的 mark 样式放空白
            const shell = (node as HTMLElement).cloneNode(false) as HTMLElement
            shell.appendChild(document.createTextNode(t.data.slice(0, lead)))
            el.appendChild(shell)
        }
        t.data = t.data.slice(lead)
        break
    }
    return nodes
}

function appendLineChildren(el: HTMLElement, children: readonly InlineTile[]): void {
    const runs: { kids: InlineTile[], key: string | null, rtl: boolean }[] = []
    for (const child of children) {
        const key = tokenKey(child)
        const rtl = containsRTL(inlineText(child))
        const last = runs[runs.length - 1]
        if (last && key !== null && last.key === key) { last.kids.push(child); last.rtl ||= rtl }
        else runs.push({ kids: [child], key, rtl })
    }
    let iso: HTMLElement | null = null
    runs.forEach((run, i) => {
        let nodes = run.kids.map(materializeInline)
        if (!run.rtl) {
            iso = null
            for (const n of nodes) el.appendChild(n)
            return
        }
        if (!iso) {
            if (i === 0) nodes = peelLeadingSpace(el, nodes)
            iso = document.createElement('span')
            iso.setAttribute('dir', 'rtl')
            iso.style.unicodeBidi = 'isolate'
            el.appendChild(iso)
        }
        for (const n of nodes) iso.appendChild(n)
    })
}

function materializeBlock(tile: BlockTile): HTMLElement {
    if (tile instanceof LineTile) {
        const el = document.createElement('div')
        setAttrs(el, tile.attrs)
        appendLineChildren(el, tile.children)
        // 空行必须有可编辑锚点(<br>):否则 contenteditable 往空 div 输入时,浏览器
        // 造嵌套 <div> 而非在原 div 内插文本,破坏「children[i] ≡ 行 i」→ 输入落错行。
        if (!el.firstChild) el.appendChild(document.createElement('br'))
        const indent = wrapIndent(tile)
        if (indent) el.style.setProperty('--cm-wrap-indent', indent)
        return el
    }
    if (tile instanceof BlockWidgetTile) {
        let el: HTMLElement
        if (tile.widget) {
            const dom = tile.widget.toDOM()
            el = dom.nodeType === 1
                ? dom as HTMLElement
                : (() => { const w = document.createElement('div'); w.appendChild(dom); return w })()
        }
        else {
            el = document.createElement('div')
        }
        el.classList.add('cm-blockWidget')
        el.setAttribute('data-cm-widget', String(tile.length))
        el.contentEditable = 'false'
        return el
    }
    throw new Error('CM7 materialize: 未知 block tile')
}

// tile 树 → contenteditable 内容根(.cm-content)。纯物化,无副作用挂载——调用方自行 appendChild。
export function materialize(doc: DocTile): HTMLElement {
    const content = document.createElement('div')
    content.className = 'cm-content'
    content.setAttribute('contenteditable', 'true')
    for (const block of doc.children) content.appendChild(materializeBlock(block))
    return content
}
