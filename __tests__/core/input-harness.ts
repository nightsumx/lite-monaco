// CM7 输入单测地基 —— 真实 DOM 变异驱动 + DOM≡doc 逐行双射不变式。
//
// 为什么存在:CM7 的 bug 本质都是「浏览器变异 DOM → observer flush → applyDOMChange → state」
// 这条状态机在某个输入序列下断裂(输入落错行、光标错位、空行嵌套 div)。这些用真页 eval 探针
// 复现慢且状态污染。这里把浏览器 insertText/回车/退格的确切 DOM 变异模式(实测自 execCommand)
// 忠实复现到 jsdom,手动 flush observer,每步断言 DOM 与 doc 逐行相等 + posFromDOM∘domAtPos 恒等。
//
// 实测的浏览器变异模式(见 git 记录的 execCommand 抓取):
//   · 行内插字符 → 命中文本节点的 characterData(nodeValue 改)
//   · 空行输入   → 有 <br> 锚点时同样是 characterData(<br> 旁生文本节点);无锚点则浏览器造嵌套 div(bug)
//   · 回车       → 当前行 div 被拆成两个 div(childList),选区落到新行开头
// 我们不模拟浏览器的中间垃圾节点(span/br 包裹),只复现「最终稳定 DOM」——因为 observer.flush
// 读的是当前 DOM 快照做 diff,不依赖中间过程。这正是 domobserver flushSoon 延迟一帧要等的稳定态。

import { expect } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { history } from '../../src/core/edit/history'
import { domAtPos, posFromDOM } from '../../src/core/view/dombridge'
import { checkBijection } from '../../src/core/view/invariants'

export function make(doc: string): EditorView {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [EditorState.allowMultipleSelections.of(true), history()],
        }),
        parent: host,
    })
}

// 虚拟化视口下的 view:桩 clientHeight/scrollTop 让 measureAndRender 走真正的视口计算路径
// (jsdom clientHeight=0 否则退化为全文),桩每个 .cm-line 的 offsetHeight=lineHeight 稳住行高
// 实测(免 heightChangeFlag 反复翻)。remeasure() 后 viewportStartLine 可 > 1、children 只覆盖窗口。
// 这是唯一能在单测里触发「文档大于视口」增量 patch 路径的办法。
export function makeScrolled(doc: string, opts: { clientHeight: number, scrollTop: number, lineHeight?: number, scrollHeight?: number }): EditorView {
    const lh = opts.lineHeight ?? 14
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({
            doc,
            extensions: [EditorState.allowMultipleSelections.of(true), history()],
        }),
        parent: host,
    })
    // 桩滚动容器几何(scrollDOM 是滚动真源)。scrollTop 可写(同步滚动测试要改)。
    Object.defineProperty(view.scrollDOM, 'clientHeight', { configurable: true, get: () => opts.clientHeight })
    let scrollTop = opts.scrollTop
    Object.defineProperty(view.scrollDOM, 'scrollTop', { configurable: true, get: () => scrollTop, set: v => { scrollTop = v } })
    // 桩 scrollHeight(minimap position() 读 docH)。缺省 doc.lines×lineHeight,大 doc 自然 docH≫panelH。
    const sh = opts.scrollHeight ?? (view.state.doc.lines * lh)
    Object.defineProperty(view.scrollDOM, 'scrollHeight', { configurable: true, get: () => sh })
    // 桩行高:每个 .cm-line 的 offsetHeight 返回固定 lineHeight,稳住 measureLineHeights。
    Object.defineProperty(view.contentDOM.ownerDocument.defaultView!.HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() { return (this as HTMLElement).classList?.contains('cm-line') ? lh : 0 },
    })
    view.oracle.lineHeight = lh
    // 抹掉构造时 jsdom 0 高度伪影,按 14px 估算重建 heightmap,再 measure 出真实虚拟化视口。
    view.resetHeights()
    view.remeasure()
    return view
}

// 视口相对子节点下标:contentDOM.children[i] ≡ 文档第 (viewportStartLine + i) 行。
// **仅无折叠时成立**:折叠(replace 装饰)把多 doc 行塌成一个 .cm-line,DOM 行数 < doc 行数,
// 此等式塌陷 → 输入原语会定位到错的 .cm-line(真页「折叠下方打字一堆 bug」的根因)。
// 定位 .cm-line 一律走 lineElForPos(经折叠感知的 domAtPos);此函数只留给「已知无折叠」的几何桩场景。
function childIndexForLine(view: EditorView, lineNumber: number): number {
    return lineNumber - view.viewportStartLine
}

// 折叠感知地定位承载 doc 位置 pos 的 .cm-line —— domAtPos 已把 widget(折叠)当占 N doc 字符的原子,
// 从它给的 DOM 锚点向上走到 .cm-line 即真实承载行,不做「doc 行号 − viewportStartLine」的塌陷算术。
// 虚拟化底边:domAtPos 可能返回 contentDOM 自身(视口外/边界),此时向上走不到 .cm-line,退回
// childIndexForLine(无折叠时精确;虚拟化视口窗口用 viewportStartLine 转视口相对下标)。
function lineElForPos(view: EditorView, pos: number): HTMLElement {
    const { node } = domAtPos(view.contentDOM, view.state.doc, pos)
    let el = (node.nodeType === 1 ? node : node.parentNode) as HTMLElement | null
    while (el && el !== view.contentDOM && el.parentElement !== view.contentDOM) el = el.parentElement
    if (el && el.parentElement === view.contentDOM) return el as HTMLElement
    const line = view.state.doc.lineAt(pos)
    return view.contentDOM.children[childIndexForLine(view, line.number)] as HTMLElement
}

// 带装饰 provider 的 view:测「装饰(mark 高亮 span / replace 折叠 widget)× 输入 Op」组合格。
// 输入原语(typeText/pressEnter/…)照常用——装饰每次 dispatch 重建时重应用,正是要测的真实路径。
export function makeWith(doc: string, providers: ((state: EditorState) => import('../../src/core/model/decoration').DecorationSet)[]): EditorView {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return new EditorView({
        state: EditorState.create({
            doc,
            extensions: [EditorState.allowMultipleSelections.of(true), history()],
        }),
        parent: host,
        decorationProviders: providers,
    })
}

// jsdom 的 MutationObserver 是异步微任务;手动 flush 同步推进观测管线。
export function flush(view: EditorView) {
    view.observer.flush()
}

function firstText(n: Node): Text | null {
    if (n.nodeType === 3) return n as Text
    for (const c of Array.from(n.childNodes)) { const r = firstText(c); if (r) return r }
    return null
}

// 收集 lineEl 内所有文本节点(深度优先),供多 span 行的落点定位。
function allText(lineEl: HTMLElement): Text[] {
    const out: Text[] = []
    const walk = (n: Node) => { if (n.nodeType === 3) out.push(n as Text); else for (const c of Array.from(n.childNodes)) walk(c) }
    walk(lineEl)
    return out
}

// 行内偏移 inLine 落在哪个文本节点的哪个本地偏移(多 span 行:浏览器改的是承载该点的那个 span 文本节点)。
// 无文本节点(空行)返回 null。落在节点边界时优先归到前一节点末尾(与浏览器 characterData 变异一致)。
function textNodeAt(lineEl: HTMLElement, inLine: number): { node: Text, offset: number } | null {
    const texts = allText(lineEl)
    if (!texts.length) return null
    let acc = 0
    for (const t of texts) {
        const len = t.length
        if (inLine <= acc + len) return { node: t, offset: inLine - acc }
        acc += len
    }
    const last = texts[texts.length - 1]
    return { node: last, offset: last.length }
}

// 把原生选区放到某 doc 位置(caret),经由 domAtPos 定位 DOM 锚点。
export function setCaret(view: EditorView, pos: number) {
    const { node, offset } = domAtPos(view.contentDOM, view.state.doc, pos)
    const sel = view.contentDOM.ownerDocument.getSelection()!
    sel.removeAllRanges()
    const range = view.contentDOM.ownerDocument.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    sel.addRange(range)
    view.observer.setSelectionRange({ node, offset }, { node, offset })
}

// 把原生选区放成 [anchor, head] 非空范围。用于选区替换/删除类输入。
export function setSelection(view: EditorView, anchor: number, head: number) {
    const a = domAtPos(view.contentDOM, view.state.doc, anchor)
    const h = domAtPos(view.contentDOM, view.state.doc, head)
    const sel = view.contentDOM.ownerDocument.getSelection()!
    sel.removeAllRanges()
    const range = view.contentDOM.ownerDocument.createRange()
    range.setStart(a.node, a.offset)
    range.setEnd(h.node, h.offset)
    sel.addRange(range)
    view.observer.setSelectionRange({ node: a.node, offset: a.offset }, { node: h.node, offset: h.offset })
    // 让 state 选区与原生选区一致(applyDOMChange 的选区替换分支读 state.selection.main)。
    view.dispatch(view.state.update({ selection: { anchor, head } }))
}

// —— 忠实复现浏览器输入的 DOM 变异,再 flush ——

// 在 doc 位置 pos 处插入不含换行的文本(浏览器 insertText 的行内路径)。
// 变异命中该行的文本节点(有 <br> 空行锚点则替换 <br> 为文本),不制造嵌套结构。
export function typeText(view: EditorView, pos: number, text: string) {
    const doc = view.state.doc
    const line = doc.lineAt(pos)
    const lineEl = lineElForPos(view, pos)
    const inLine = pos - line.from
    // 多 span 行:改的是承载落点的那个 span 文本节点(浏览器 characterData 变异)。
    let hit = textNodeAt(lineEl, inLine)
    if (!hit) {
        // 空行:浏览器把文本插进 <br> 锚点旁,最终稳定态是一个文本节点占据该行。
        const tn = view.contentDOM.ownerDocument.createTextNode('')
        lineEl.insertBefore(tn, lineEl.firstChild)
        hit = { node: tn, offset: 0 }
    }
    const { node, offset } = hit
    const cur = node.nodeValue ?? ''
    node.nodeValue = cur.slice(0, offset) + text + cur.slice(offset)
    placeCaret(view, node, offset + text.length)
    flush(view)
}

// 选区替换:选中 [from,to] 后输入 text(浏览器选区非空时打字/粘贴的稳定态)。
// 变异命中该行文本节点:选中段被替换成 text。要求 from/to 同行(跨行替换另走 childList)。
export function replaceSelection(view: EditorView, from: number, to: number, text: string) {
    const doc = view.state.doc
    const line = doc.lineAt(from)
    const lineEl = view.contentDOM.children[childIndexForLine(view, line.number)] as HTMLElement
    const a = from - line.from
    const b = to - line.from
    const texts = allText(lineEl)
    if (!texts.length) {
        const tn = view.contentDOM.ownerDocument.createTextNode(text)
        lineEl.insertBefore(tn, lineEl.firstChild)
        placeCaret(view, tn, text.length)
        flush(view)
        return
    }
    // 多 span 行:删 [a,b) 横跨的字符,text 插到区间起点所在节点(浏览器把插入落到首个受影响 span)。
    let acc = 0
    let insertNode: Text | null = null
    let insertOffset = 0
    for (const t of texts) {
        const len = t.length
        const s = Math.max(0, a - acc)
        const e = Math.min(len, b - acc)
        if (s < e || (a >= acc && a <= acc + len && insertNode === null)) {
            const v = t.nodeValue ?? ''
            if (insertNode === null) {
                t.nodeValue = v.slice(0, s) + text + v.slice(Math.max(s, e))
                insertNode = t
                insertOffset = s + text.length
            }
            else if (s < e) {
                t.nodeValue = v.slice(0, s) + v.slice(e)
            }
        }
        acc += len
    }
    if (insertNode) placeCaret(view, insertNode, insertOffset)
    flush(view)
}

// 跨行选区替换/删除:选中 [from,to](跨多行)后输入 text(空串=删除)。
// 浏览器稳定态:选区首行 div 变成 before+text+after(合并后文本),选区跨过的其余行 div 全删。
// text 含换行则拆成多 div(粘贴多行覆盖跨行选区)。选区落到替换末尾。
export function replaceSelectionCrossLine(view: EditorView, from: number, to: number, text: string) {
    const doc = view.state.doc
    const fromLine = doc.lineAt(from)
    const toLine = doc.lineAt(to)
    const firstIdx = childIndexForLine(view, fromLine.number)
    const lastIdx = childIndexForLine(view, toLine.number)
    const before = (view.contentDOM.children[firstIdx].textContent ?? '').slice(0, from - fromLine.from)
    const after = (view.contentDOM.children[lastIdx].textContent ?? '').slice(to - toLine.from)
    const dochtml = view.contentDOM.ownerDocument
    const setLine = (el: HTMLElement, s: string) => {
        while (el.firstChild) el.removeChild(el.firstChild)
        if (s) el.appendChild(dochtml.createTextNode(s))
        else el.appendChild(dochtml.createElement('br'))
    }
    // 删掉选区跨过的除首行外全部行 div。
    for (let i = lastIdx; i > firstIdx; i--) view.contentDOM.children[i].remove()
    const firstEl = view.contentDOM.children[firstIdx] as HTMLElement
    const parts = text.split('\n')
    setLine(firstEl, before + parts[0] + (parts.length === 1 ? after : ''))
    let ref: ChildNode = firstEl
    let lastEl = firstEl
    for (let i = 1; i < parts.length; i++) {
        const el = dochtml.createElement('div')
        el.className = 'cm-line'
        const isLast = i === parts.length - 1
        setLine(el, isLast ? parts[i] + after : parts[i])
        ref.after(el)
        ref = el
        lastEl = el
    }
    const caretOffset = parts.length === 1 ? before.length + parts[0].length : parts[parts.length - 1].length
    const tn = firstText(lastEl)
    if (tn) placeCaret(view, tn, caretOffset)
    else placeCaret(view, lastEl, 0)
    flush(view)
}

// 在 doc 位置 pos 处删除 count 个字符(退格/删除的行内路径,不跨行)。
// 多 span 行:删可能横跨多个文本节点(浏览器移除中间 span、改两端);逐节点扣减。
export function deleteText(view: EditorView, pos: number, count: number) {
    const doc = view.state.doc
    const line = doc.lineAt(pos)
    const lineEl = view.contentDOM.children[childIndexForLine(view, line.number)] as HTMLElement
    const inLine = pos - line.from
    const texts = allText(lineEl)
    let acc = 0
    let remaining = count
    let caretNode: Text | null = null
    let caretOffset = 0
    for (const t of texts) {
        const len = t.length
        const start = Math.max(0, inLine - acc)
        if (remaining > 0 && start < len) {
            const del = Math.min(remaining, len - start)
            const v = t.nodeValue ?? ''
            t.nodeValue = v.slice(0, start) + v.slice(start + del)
            remaining -= del
            if (!caretNode) { caretNode = t; caretOffset = start }
        }
        acc += len
    }
    if (!caretNode) { const f = firstText(lineEl); if (f) { caretNode = f; caretOffset = inLine } }
    if (caretNode) placeCaret(view, caretNode, caretOffset)
    flush(view)
}

// 在 doc 位置 pos 处回车:把所在行 div 拆成两个 cm-line div(浏览器 insertParagraph 的稳定态)。
// 空的下半行按空行锚点规则补 <br>。选区落到新行开头。
// widget 感知:contentEditable=false 的 widget 是原子,浏览器绝不拆穿它——按 DOM 子节点顺序切分
// (落点在 widget 前则整个 widget 归下半行,落点在其后则归上半行),而非按扁平 textContent。
export function pressEnter(view: EditorView, pos: number) {
    const doc = view.state.doc
    const dochtml = view.contentDOM.ownerDocument
    // 折叠感知:DOM 行数可 < doc 行数(塌陷块),不能用 doc 行号索引 children。经 domAtPos 定位
    // 承载 pos 的真实 .cm-line 及其视觉落点(widget=1 可见字符)。
    const lineEl = lineElForPos(view, pos)
    // 视觉长度:文本节点=字符数;widget(contenteditable=false,折叠 ⋯)=原子占 1 个视觉落点,浏览器
    // 绝不拆穿;**mark span**(高亮)不是 widget,仍按其文本长贡献(否则整段 span 被当 1 字符切错)。
    const isWidget = (n: Node): boolean => n.nodeType === 1 && (n as HTMLElement).getAttribute?.('contenteditable') === 'false'
    const visLen = (n: Node): number => n.nodeType === 3 ? (n.nodeValue ?? '').length : isWidget(n) ? 1 : (n.textContent ?? '').length
    // 视觉落点 = pos 在本 DOM 行内的视觉偏移(该行起始 doc pos 到 pos 的可见长度)。
    const line = doc.lineAt(pos)
    const inLine = pos - line.from

    const beforeNodes: Node[] = []
    const afterNodes: Node[] = []
    let acc = 0
    for (const child of Array.from(lineEl.childNodes)) {
        const len = visLen(child)
        if (acc + len <= inLine) { beforeNodes.push(child); acc += len; continue }
        if (acc >= inLine) { afterNodes.push(child); acc += len; continue }
        // 落点落在节点内部:切成两段。文本节点直接切;mark span(元素)克隆成两个同类 span 各承一半文本。
        const at = inLine - acc
        if (child.nodeType === 3) {
            const v = (child as Text).nodeValue ?? ''
            if (v.slice(0, at)) beforeNodes.push(dochtml.createTextNode(v.slice(0, at)))
            if (v.slice(at)) afterNodes.push(dochtml.createTextNode(v.slice(at)))
        } else {
            const v = child.textContent ?? ''
            if (v.slice(0, at)) { const l = (child as HTMLElement).cloneNode(false) as HTMLElement; l.textContent = v.slice(0, at); beforeNodes.push(l) }
            if (v.slice(at)) { const r = (child as HTMLElement).cloneNode(false) as HTMLElement; r.textContent = v.slice(at); afterNodes.push(r) }
        }
        acc += len
    }
    // 上半行:beforeNodes(空则 <br> 锚点)
    while (lineEl.firstChild) lineEl.removeChild(lineEl.firstChild)
    if (beforeNodes.length) beforeNodes.forEach(n => lineEl.appendChild(n))
    else lineEl.appendChild(dochtml.createElement('br'))
    // 下半行:新 cm-line div,承载 afterNodes
    const newEl = dochtml.createElement('div')
    newEl.className = 'cm-line'
    if (afterNodes.length) afterNodes.forEach(n => newEl.appendChild(n))
    else newEl.appendChild(dochtml.createElement('br'))
    lineEl.after(newEl)
    const caretNode = firstText(newEl) ?? newEl
    placeCaret(view, caretNode, 0)
    flush(view)
}

// 在某行行首退格:合并到上一行(浏览器 deleteContentBackward 的稳定态,实测自真页)。
// 浏览器把当前行 div 删掉,文本并入上一行 div;选区落到合并点。line 必须 > 1。
export function pressBackspaceLineStart(view: EditorView, line: number) {
    const idx = childIndexForLine(view, line)
    const curEl = view.contentDOM.children[idx] as HTMLElement
    const prevEl = view.contentDOM.children[idx - 1] as HTMLElement
    const prevText = prevEl.textContent ?? ''
    const curText = curEl.textContent ?? ''
    const dochtml = view.contentDOM.ownerDocument
    // 上一行重写为合并后文本(空则 <br> 锚点),删掉当前行 div。
    while (prevEl.firstChild) prevEl.removeChild(prevEl.firstChild)
    const merged = prevText + curText
    if (merged) prevEl.appendChild(dochtml.createTextNode(merged))
    else prevEl.appendChild(dochtml.createElement('br'))
    curEl.remove()
    const caretNode = merged ? firstText(prevEl)! : prevEl
    placeCaret(view, caretNode, prevText.length)
    flush(view)
}

// 在 doc 位置 pos 处粘贴含换行的多行文本(浏览器 insertFromPaste 的稳定态)。
// 所在行按第一段拆开,中间段各成新 cm-line div,最后一段接原行尾。选区落到粘贴末尾。
export function pasteMultiline(view: EditorView, pos: number, text: string) {
    const doc = view.state.doc
    const line = doc.lineAt(pos)
    const idx = childIndexForLine(view, line.number)
    const lineEl = view.contentDOM.children[idx] as HTMLElement
    const inLine = pos - line.from
    const full = lineEl.textContent ?? ''
    const before = full.slice(0, inLine)
    const after = full.slice(inLine)
    const parts = text.split('\n')
    const dochtml = view.contentDOM.ownerDocument
    const setLine = (el: HTMLElement, s: string) => {
        while (el.firstChild) el.removeChild(el.firstChild)
        if (s) el.appendChild(dochtml.createTextNode(s))
        else el.appendChild(dochtml.createElement('br'))
    }
    // 首段接 before
    setLine(lineEl, before + parts[0])
    // 中间/末段各成新 div,插在本行之后
    let ref: ChildNode = lineEl
    let lastEl = lineEl
    for (let i = 1; i < parts.length; i++) {
        const el = dochtml.createElement('div')
        el.className = 'cm-line'
        const isLast = i === parts.length - 1
        setLine(el, isLast ? parts[i] + after : parts[i])
        ref.after(el)
        ref = el
        lastEl = el
    }
    const caretOffset = parts.length === 1 ? before.length + parts[0].length : parts[parts.length - 1].length
    const tn = firstText(lastEl)
    if (tn) placeCaret(view, tn, caretOffset)
    else placeCaret(view, lastEl, 0)
    flush(view)
}

// IME 一段选词:compositionstart → 逐个中间态(拼音码)flush → compositionend 落定最终字。
// stages 是中间态文本序列(如 ['ni','你']),final 是落定的最终 DOM 文本。都作用在 pos 所在行的
// 首文本节点上(从 pos 处起替换)。中间态期间 state 不动(composing 挂起 flush),落定异步一次性读。
export async function imeCompose(view: EditorView, pos: number, stages: string[], final: string) {
    const doc = view.state.doc
    const line = doc.lineAt(pos)
    const lineEl = view.contentDOM.children[childIndexForLine(view, line.number)] as HTMLElement
    const inLine = pos - line.from
    // 多 span 行:落在承载该点的 span 文本节点,用其本地偏移拼接(不用全行偏移)。
    let hit = textNodeAt(lineEl, inLine)
    if (!hit) {
        const tn = view.contentDOM.ownerDocument.createTextNode('')
        lineEl.insertBefore(tn, lineEl.firstChild)
        hit = { node: tn, offset: 0 }
    }
    const tn = hit.node
    const local = hit.offset
    const base = tn.nodeValue ?? ''
    const head = base.slice(0, local)
    const tail = base.slice(local)
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart'))
    for (const s of stages) {
        tn.nodeValue = head + s + tail
        placeCaret(view, tn, local + s.length)
        flush(view)
    }
    tn.nodeValue = head + final + tail
    placeCaret(view, tn, local + final.length)
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend'))
    await Promise.resolve()
}

function placeCaret(view: EditorView, node: Node, offset: number) {
    const sel = view.contentDOM.ownerDocument.getSelection()!
    sel.removeAllRanges()
    const range = view.contentDOM.ownerDocument.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    sel.addRange(range)
    view.observer.setSelectionRange({ node, offset }, { node, offset })
}

// —— 不变式:DOM ≡ doc 逐行双射 + pos 往返恒等 ——

// 逐行双射断言 —— 与运行时闸门共用唯一谓词 checkBijection(invariants.ts),不可能漂移。
// 全文映射(viewportStartLine=1)与虚拟化视口窗口都由同一 widget 感知的覆盖累加校验。
// 两名保留(~99 处调用点不改):全文 / 虚拟化语义相同,谓词自适应视口。
export function expectDOMMatchesDoc(view: EditorView) {
    expect(checkBijection(view)).toBeNull()
}
export const expectDOMMatchesViewport = expectDOMMatchesDoc

// 断言每个 doc 位置 posFromDOM(domAtPos(pos)) === pos(往返双射)。
export function expectPosRoundtrip(view: EditorView) {
    const doc = view.state.doc
    for (let pos = 0; pos <= doc.length; pos++) {
        const { node, offset } = domAtPos(view.contentDOM, doc, pos)
        const back = posFromDOM(view.contentDOM, doc, node, offset)
        expect(back).toBe(pos)
    }
}

// 一步到位:断言当前 view 满足全部不变式。每个输入操作后调用。
export function expectInvariants(view: EditorView) {
    expectDOMMatchesDoc(view)
    expectPosRoundtrip(view)
}
