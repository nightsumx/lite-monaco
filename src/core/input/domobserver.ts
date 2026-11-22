// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 DOMObserver —— 观测 contenteditable 变异 + 选区 → applyDOMChange。
// 对齐 codeSrc/view/src/domobserver.ts 脊柱 + §5 化石 + Safari shadow 选区 + EditContext。

import type { EditorView } from '../view/editorview'
import { applyDOMChange, DOMChange, sameSelPos } from './domchange'
import { lineElAt } from '../view/dombridge'
import { applyDOMSelection, getSelection } from '../view/domutil'
import { browser } from '../browser'
import { EditContextManager, editContextSupported } from './editcontext'

const observeOptions: MutationObserverInit = {
    childList: true,
    characterData: true,
    subtree: true,
    characterDataOldValue: true,
}

export class DOMSelectionState {
    anchorNode: Node | null = null
    anchorOffset = 0
    focusNode: Node | null = null
    focusOffset = 0

    eq(sel: { anchorNode: Node | null, anchorOffset: number, focusNode: Node | null, focusOffset: number }) {
        return this.anchorNode === sel.anchorNode && this.anchorOffset === sel.anchorOffset &&
            this.focusNode === sel.focusNode && this.focusOffset === sel.focusOffset
    }

    setRange(sel: Selection) {
        this.set(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset)
    }

    set(anchorNode: Node | null, anchorOffset: number, focusNode: Node | null, focusOffset: number) {
        this.anchorNode = anchorNode
        this.anchorOffset = anchorOffset
        this.focusNode = focusNode
        this.focusOffset = focusOffset
    }
}

export class DOMObserver {
    private observer: MutationObserver
    private active = false
    private queue: MutationRecord[] = []
    selectionRange = new DOMSelectionState()
    selectionChanged = false
    // 正在把「聚焦时浏览器放在内容根上的选区」写回 state。挡住 selectionchange 重入。
    private focusCaretGuard = false
    /** 与 inputState.composing 同步：observer 层挂起 flush */
    composing = false
    /** 组字所在的 .cm-line(compositionstart 时记下);重绘时保住它 */
    compositionLine: HTMLElement | null = null
    // 刚结束组字的行:下一次 processRecords 无条件读它
    private dirtyLine: HTMLElement | null = null
    /** 正在把一次 DOM 变更应用进 state(期间 DOM 可能领先于 state) */
    applyingDOMChange = false
    private dom: HTMLElement
    private delayedFlush = -1
    private flushingAndroidKey = -1
    private delayedAndroidKey: { key: string, keyCode: number, force: boolean } | null = null
    editContext: EditContextManager | null = null

    constructor(private view: EditorView) {
        this.dom = view.contentDOM
        this.observer = new MutationObserver(muts => {
            for (const m of muts) this.queue.push(m)
            // §5: iOS composition 先删后插 / IE11 提前回调
            if (
                (browser.ie && browser.ie_version <= 11 || browser.ios && this.composing) &&
                muts.some(m =>
                    (m.type === 'childList' && m.removedNodes.length) ||
                    (m.type === 'characterData' && m.oldValue && m.oldValue.length > (m.target.nodeValue?.length ?? 0))
                )
            )
                this.flushSoon()
            else
                this.flush()
        })
        this.onSelectionChange = this.onSelectionChange.bind(this)
        view.contentDOM.ownerDocument.addEventListener('selectionchange', this.onSelectionChange)

        // H4: Android EditContext
        if (editContextSupported()) {
            try {
                this.editContext = new EditContextManager(view)
            } catch { /* 环境无完整 EditContext */ }
        }
        this.start()
    }

    start() {
        if (this.active) return
        this.observer.observe(this.dom, observeOptions)
        this.active = true
    }

    stop() {
        if (!this.active) return
        this.active = false
        this.observer.disconnect()
    }

    ignore<T>(f: () => T): T {
        if (!this.active) return f()
        // 组字期间 flush 挂起,用户的组字变异还积压在 queue 里。自家 DOM 写(f)结束后的 clear()
        // 只该丢 f 自己的记录,不能把积压的组字变异一起扔掉(否则提交文本 == 组字文本时没有新变异,
        // 提交整段丢失)。先把积压收进 queue,clear 后放回;记录指向的节点若被 f 换掉,readMutation 自然跳过。
        const kept = this.composing ? this.pendingRecords().slice() : null
        try {
            this.stop()
            return f()
        } finally {
            this.start()
            this.clear()
            if (kept) for (const m of kept) this.queue.push(m)
        }
    }

    clear() {
        this.processRecords()
        this.queue.length = 0
        this.selectionChanged = false
    }

    private onSelectionChange() {
        this.view.syncView()
        const sel = getSelection(this.view.root)
        if (!sel) return
        // 组字卡死兜底:组字所在行已不在 DOM,或原生选区跳出了组字行 → 浏览器已放弃组字
        //(Chrome 组字节点被换掉时静默放弃,不发 compositionend)。结束组字并照常 flush。
        if (this.composing && !this.compositionAlive(sel.focusNode)) this.forceEndComposition()
        // H5: Safari shadow root 选区
        const range = this.readSelectionFromDOM(sel)
        if (!range || this.selectionRange.eq(range)) return
        // 聚焦 contenteditable 时浏览器把选区放在内容根上,不是用户选区。先写回,别读成文档开头。
        if (this.rejectUnplacedCaret(range)) return
        const local = this.dom.contains(range.anchorNode) || this.dom.contains(range.focusNode)
        this.selectionRange.set(range.anchorNode, range.anchorOffset, range.focusNode, range.focusOffset)
        if (local) this.selectionChanged = true
        // §5: IE11 / Chrome Android 删除选区时事件乱序
        if ((browser.ie && browser.ie_version <= 11 || browser.android && browser.chrome) &&
            !this.view.state.selection.main.empty &&
            this.view.inputState.lastKeyCode === 8)
            this.flushSoon()
        else
            this.flush()
    }

    readSelectionRange() {
        const sel = getSelection(this.view.root)
        if (!sel) return false
        const range = this.readSelectionFromDOM(sel)
        if (!range || this.selectionRange.eq(range)) return false
        if (this.rejectUnplacedCaret(range)) return false
        const local = this.dom.contains(range.anchorNode) || this.dom.contains(range.focusNode)
        this.selectionRange.set(range.anchorNode, range.anchorOffset, range.focusNode, range.focusOffset)
        if (local) this.selectionChanged = true
        return true
    }

    /** H5: Safari shadow DOM 选区 hack */
    private readSelectionFromDOM(selection: Selection): {
        anchorNode: Node | null, anchorOffset: number
        focusNode: Node | null, focusOffset: number
    } | null {
        // Safari + shadow root
        if (browser.safari && this.view.root.nodeType === 11) {
            const hacked = safariSelectionRangeHack(this.view, selection)
            if (hacked) return hacked
        }
        return {
            anchorNode: selection.anchorNode,
            anchorOffset: selection.anchorOffset,
            focusNode: selection.focusNode,
            focusOffset: selection.focusOffset,
        }
    }

    // 两端都在内容根上,且上次写下的选区不在根上:这是聚焦残留,不是用户把光标移到开头。
    // 按 state 写回原生选区。不走 observer.ignore(),以免正在 flush 时清掉还没读的变异。
    private rejectUnplacedCaret(range: { anchorNode: Node | null, focusNode: Node | null }): boolean {
        if (range.anchorNode !== this.dom || range.focusNode !== this.dom) return false
        if (this.selectionRange.anchorNode === this.dom && this.selectionRange.focusNode === this.dom) return false
        if (this.focusCaretGuard) return true
        this.focusCaretGuard = true
        try {
            const view = this.view
            const main = view.state.selection.main
            const anchor = view.domAtPos(main.anchor)
            const head = view.domAtPos(main.head)
            // 先记下写入点,同步的 selectionchange 才能判成没变。
            this.setSelectionRange(anchor, head)
            applyDOMSelection(view.root, view.contentDOM, anchor, head, main.empty)
        } finally {
            this.focusCaretGuard = false
        }
        return true
    }

    setSelectionRange(anchor: { node: Node, offset: number }, head: { node: Node, offset: number }) {
        this.selectionRange.set(anchor.node, anchor.offset, head.node, head.offset)
        this.selectionChanged = false
    }

    private pendingRecords(): MutationRecord[] {
        for (const m of this.observer.takeRecords()) this.queue.push(m)
        return this.queue
    }

    /** 暴露给 InputState.endComposition：是否有未处理 mutation */
    hasPendingRecords(): boolean {
        return this.pendingRecords().length > 0
    }

    processRecords(): { from: number, to: number } {
        const records = this.pendingRecords()
        if (records.length) this.queue = []
        let from = -1, to = -1
        // 刚结束的组字行:即使没有新变异(提交文本 == 最后组字文本)也必须读一次
        const dirty = this.dirtyLine
        this.dirtyLine = null
        if (dirty) {
            const line = lineElAt(this.view.contentDOM, dirty)
            if (line) from = to = line.index
        }
        for (const rec of records) {
            const range = this.readMutation(rec)
            if (!range) continue
            if (from === -1) { from = range.from; to = range.to }
            else { from = Math.min(range.from, from); to = Math.max(range.to, to) }
        }
        return { from, to }
    }

    private readMutation(rec: MutationRecord): { from: number, to: number } | null {
        const line = lineElAt(this.view.contentDOM, rec.target)
        if (!line) {
            if (rec.target === this.view.contentDOM) {
                const n = this.view.contentDOM.children.length
                return n ? { from: 0, to: n - 1 } : null
            }
            return null
        }
        return { from: line.index, to: line.index }
    }

    readChange(): DOMChange | null {
        const { from, to } = this.processRecords()
        const newSel = this.selectionChanged
        if (from < 0 && !newSel) return null
        this.selectionChanged = false
        return new DOMChange(this.view, from, to)
    }

    startComposition() {
        // EditContext 自己管 composition（textupdate 路径）
        if (this.editContext) return
        this.composing = true
        // 记下组字所在行:组字期间重绘要原样保住这个节点(换掉它 Chrome 会静默放弃组字)
        const sel = getSelection(this.view.root)
        const line = sel?.focusNode ? lineElAt(this.dom, sel.focusNode) : null
        this.compositionLine = line ? line.el : null
        this.view.inputState.startComposition()
    }

    endComposition() {
        if (this.editContext) return
        const wasComposing = this.composing
        this.composing = false
        const line = this.compositionLine
        this.compositionLine = null
        // 组字行要读一次:提交文本恰好等于最后的组字文本时浏览器不再产生变异
        if (wasComposing && line && line.parentNode === this.dom) this.dirtyLine = line
        const pending = this.hasPendingRecords() || this.dirtyLine != null
        this.view.inputState.endComposition(this.view, pending)
    }

    /**
     * 强制结束组字并把 DOM 里的组字文本读进 state。浏览器没发 compositionend 就放弃组字时用
     * (点别处、失焦、非组字输入、组字节点被换掉)。不在组字中则什么都不做。
     */
    forceEndComposition() {
        if (!this.composing) return
        this.endComposition()
        this.flush()
    }

    /** 组字是否还活着:组字行仍在 DOM 里,且原生选区(若给出)在这行内 */
    compositionAlive(focusNode?: Node | null): boolean {
        const line = this.compositionLine
        if (!line) return true // 没记到行(选区不在内容里开始的组字):不判
        if (line.parentNode !== this.dom) return false
        if (focusNode && this.dom.contains(focusNode) && !line.contains(focusNode)) return false
        return true
    }

    flush(readSelection = true): boolean {
        // 组字中间态挂起（拼音未确认）
        if (this.composing) return false
        this.view.syncView()
        if (readSelection) this.readSelectionRange()
        const domChange = this.readChange()
        if (!domChange) return false
        const startState = this.view.state
        // 处理期间 DOM 里还留着浏览器的原生插入(可能不被 state 采纳),update 的双射闸门推迟到修复之后
        this.applyingDOMChange = domChange.domChanged
        let handled: boolean
        try {
            handled = applyDOMChange(this.view, domChange)
        } finally {
            this.applyingDOMChange = false
        }
        if (this.view.state === startState &&
            (domChange.domChanged || domChange.newSel && !sameSelPos(this.view.state.selection, domChange.newSel.main)))
            this.view.resetDOM()
        // state 动了但没完全采纳浏览器的原生插入(闭括号过键只移光标、输入处理器改写了插入):
        // DOM 里留着 state 没有的字符,下次编辑会被当成用户输入写进文档。逐行比对,不一致就重画。
        else if (domChange.domChanged) {
            this.view.repairDOM()
            this.view.checkInvariants()
        }
        return handled
    }

    forceFlush() {
        if (this.delayedFlush >= 0) {
            this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.delayedFlush)
            this.delayedFlush = -1
        }
        this.clearDelayedAndroidKey()
        this.flush()
    }

    flushSoon() {
        if (this.delayedFlush < 0)
            this.delayedFlush = this.view.dom.ownerDocument.defaultView!.requestAnimationFrame(() => {
                this.delayedFlush = -1
                this.flush()
            })
    }

    delayAndroidKey(key: string, keyCode: number) {
        if (!this.delayedAndroidKey) {
            const flush = () => {
                const k = this.delayedAndroidKey
                if (k) {
                    this.clearDelayedAndroidKey()
                    this.view.inputState.lastKeyCode = k.keyCode
                    this.view.inputState.lastKeyTime = Date.now()
                    // 兼容旧字段
                    this.view.lastKeyCode = k.keyCode
                    this.view.lastKeyTime = Date.now()
                    const flushed = this.flush()
                    if (!flushed && k.force)
                        this.dispatchKey(k.key, k.keyCode)
                }
            }
            this.flushingAndroidKey = this.view.dom.ownerDocument.defaultView!.requestAnimationFrame(flush)
        }
        if (!this.delayedAndroidKey || key === 'Enter')
            this.delayedAndroidKey = {
                key, keyCode,
                force: this.lastChange < Date.now() - 50 || !!this.delayedAndroidKey?.force,
            }
    }

    private get lastChange(): number {
        return this.view.inputState.lastKeyTime
    }

    clearDelayedAndroidKey() {
        if (this.flushingAndroidKey >= 0) {
            this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.flushingAndroidKey)
            this.flushingAndroidKey = -1
        }
        this.delayedAndroidKey = null
    }

    private dispatchKey(key: string, keyCode: number) {
        const ev = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true })
        ;(ev as KeyboardEvent & { synthetic?: boolean }).synthetic = true
        this.view.contentDOM.dispatchEvent(ev)
    }

    afterTransaction(docChanged: boolean, selectionSet: boolean) {
        this.editContext?.afterTransaction(docChanged, selectionSet)
    }

    destroy() {
        this.stop()
        if (this.delayedFlush >= 0) this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.delayedFlush)
        this.clearDelayedAndroidKey()
        this.editContext?.destroy()
        this.editContext = null
        this.dom.ownerDocument.removeEventListener('selectionchange', this.onSelectionChange)
    }
}

// H5: Safari Selection/shadow DOM（CM6 #414）
function safariSelectionRangeHack(view: EditorView, selection: Selection): {
    anchorNode: Node | null, anchorOffset: number
    focusNode: Node | null, focusOffset: number
} | null {
    const anySel = selection as Selection & {
        getComposedRanges?: (root: Document | ShadowRoot) => StaticRange[]
    }
    if (anySel.getComposedRanges) {
        const range = anySel.getComposedRanges(view.root)[0]
        if (range) return buildSelectionRangeFromRange(view, range)
    }

    let found: StaticRange | null = null
    function read(event: Event) {
        event.preventDefault()
        event.stopImmediatePropagation()
        found = (event as InputEvent & { getTargetRanges(): StaticRange[] }).getTargetRanges?.()[0] ?? null
    }
    view.contentDOM.addEventListener('beforeinput', read, true)
    try {
        view.dom.ownerDocument.execCommand('indent')
    } catch { /* */ }
    view.contentDOM.removeEventListener('beforeinput', read, true)
    return found ? buildSelectionRangeFromRange(view, found) : null
}

function buildSelectionRangeFromRange(view: EditorView, range: StaticRange) {
    let anchorNode = range.startContainer, anchorOffset = range.startOffset
    let focusNode = range.endContainer, focusOffset = range.endOffset
    try {
        const curAnchor = view.domAtPos(view.state.selection.main.anchor)
        if (curAnchor.node === focusNode && curAnchor.offset === focusOffset)
            [anchorNode, anchorOffset, focusNode, focusOffset] =
                [focusNode, focusOffset, anchorNode, anchorOffset]
    } catch { /* */ }
    return { anchorNode, anchorOffset, focusNode, focusOffset }
}
