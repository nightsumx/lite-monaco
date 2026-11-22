// 只读编辑提示 —— 对齐 Monaco ReadOnlyMessageController + MessageController。
// 用户在 readOnly 编辑器里尝试输入/粘贴/剪切时,在光标旁弹出:
//   "Cannot edit in read-only editor"
//
// 触发:EditorView 在 beforeinput / 编辑类 key / cut|paste|drop 拒编时调 attemptReadOnlyEdit。

import type { EditorView } from '../view/editorview'
import { inheritThemeVars } from '../chrome/themevars'
import { alert } from './a11y'

const DEFAULT_MSG = 'Cannot edit in read-only editor'
const CSS_ID = 'cm-readonly-message-css'

// CSS 逐行对齐 Monaco messageController.css(contrib/message/browser/messageController.css)
// 类名/显隐规则与源码一致,禁止自创 up/down 语义:
//   .anchor.top   → border-bottom-color → 三角尖朝上
//   .anchor.below → border-top-color    → 三角尖朝下
//   tip 在光标上方(无 .below):藏 .top,显 .below → 尖朝下指光标
//   tip 在光标下方(有 .below):藏 .below,显 .top → 尖朝上指光标
const CSS = `
.cm-readonly-message {
  /* position 由 JS 设 fixed(allowEditorOverflow) */
  z-index: 10000;
  padding-bottom: 8px;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  line-height: 18px;
}
.cm-readonly-message.below {
  padding-bottom: 0;
  padding-top: 8px;
}
.cm-readonly-message .message {
  padding: 2px 4px;
  color: var(--lm-editorHoverWidget-foreground, #cccccc);
  background-color: var(--lm-editorHoverWidget-background, #252526);
  border: 1px solid var(--lm-inputValidation-infoBorder, #007acc);
  border-radius: 3px;
  white-space: nowrap;
}
.cm-readonly-message .anchor {
  width: 0 !important;
  height: 0 !important;
  border-color: transparent;
  border-style: solid;
  z-index: 1000;
  border-width: 8px;
  position: absolute;
  left: 2px;
}
/* 尖朝上(给 tip 在下方时用) */
.cm-readonly-message .anchor.top {
  border-bottom-color: var(--lm-inputValidation-infoBorder, #007acc);
}
/* 尖朝下(给 tip 在上方时用) —— Monaco 默认 */
.cm-readonly-message .anchor.below {
  border-top-color: var(--lm-inputValidation-infoBorder, #007acc);
}
/* 无 .below(tip 在上):藏朝上三角,留朝下三角
   有 .below(tip 在下):藏朝下三角 */
.cm-readonly-message:not(.below) .anchor.top,
.cm-readonly-message.below .anchor.below {
  display: none;
}
.cm-readonly-message.below .anchor.top {
  display: inherit;
  top: -8px;
}
@keyframes cm-readonly-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes cm-readonly-fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
.cm-readonly-message.fadeIn { animation: cm-readonly-fadeIn 150ms ease-out; }
.cm-readonly-message.fadeOut { animation: cm-readonly-fadeOut 100ms ease-out; }
`

function ensureCSS() {
    if (typeof document === 'undefined') return
    let s = document.getElementById(CSS_ID) as HTMLStyleElement | null
    if (!s) {
        s = document.createElement('style')
        s.id = CSS_ID
        document.head.appendChild(s)
    }
    // 允许热更样式(类名修正后立即覆盖)
    s.textContent = CSS
}

interface Host {
    el: HTMLElement | null
    closeTimer: ReturnType<typeof setTimeout> | null
    offs: (() => void)[]
}

const hosts = new WeakMap<EditorView, Host>()

// 编辑被只读拒绝时的旁听钩子(Monaco onDidAttemptReadOnlyEdit)。showReadOnlyMessage 是所有拒编路径的唯一入口。
const attemptListeners = new WeakMap<EditorView, Set<() => void>>()
export function onReadOnlyAttempt(view: EditorView, fn: () => void): () => void {
    let set = attemptListeners.get(view)
    if (!set) attemptListeners.set(view, set = new Set())
    set.add(fn)
    return () => { set!.delete(fn) }
}

function getHost(view: EditorView): Host {
    let h = hosts.get(view)
    if (!h) {
        h = { el: null, closeTimer: null, offs: [] }
        hosts.set(view, h)
    }
    return h
}

/** 关闭当前只读提示 */
export function hideReadOnlyMessage(view: EditorView) {
    const h = hosts.get(view)
    if (!h?.el) return
    const el = h.el
    h.el = null
    for (const off of h.offs) off()
    h.offs = []
    if (h.closeTimer) {
        clearTimeout(h.closeTimer)
        h.closeTimer = null
    }
    el.classList.remove('fadeIn')
    el.classList.add('fadeOut')
    const done = () => el.remove()
    el.addEventListener('animationend', done, { once: true })
    setTimeout(done, 120)
}

/**
 * 在光标旁弹出 Monaco 式只读提示。
 * 非 readOnly 时 no-op。
 *
 * 定位对齐 Monaco MessageWidget:
 *   preference: [ABOVE, BELOW], allowEditorOverflow=true
 *   → 优先光标上方;fixed 定位可溢出 editor overflow:hidden
 *   → 仅窗口顶部放不下时才 BELOW(.below + 朝上三角)
 */
export function showReadOnlyMessage(view: EditorView, message = DEFAULT_MSG) {
    if (!view.state.readOnly) return
    const ls = attemptListeners.get(view)
    if (ls) for (const fn of [...ls]) {
        try { fn() } catch (err) { console.error(err) }
    }
    ensureCSS()
    hideReadOnlyMessage(view)

    const h = getHost(view)
    const head = view.state.selection.main.head
    const coords = view.caretCoords(head)

    // DOM 结构对齐 Monaco MessageWidget 一字不差:
    //   .monaco-editor-overlaymessage
    //     .anchor.top
    //     .message
    //     .anchor.below
    const el = document.createElement('div')
    el.className = 'cm-readonly-message fadeIn'
    const anchorTop = document.createElement('div')
    anchorTop.className = 'anchor top'
    const body = document.createElement('div')
    body.className = 'message'
    body.textContent = message
    const anchorBottom = document.createElement('div')
    anchorBottom.className = 'anchor below'
    el.append(anchorTop, body, anchorBottom)
    // Monaco MessageController:朗读走 aria.alert,浮层本身不带 role(否则读两遍)
    alert(view, message)

    // fixed + 挂 body:等价 allowEditorOverflow,不被 .cm-editor{overflow:hidden} 裁切
    el.style.position = 'fixed'
    inheritThemeVars(view, el)
    document.body.appendChild(el)

    const tt = el.getBoundingClientRect()
    let left = 8
    let top = 8
    let placeBelow = false
    if (coords) {
        left = coords.left - 6 // Monaco marginLeft: -6px
        // ABOVE: tip 底边(含 8px 三角垫)贴光标顶
        const aboveTop = coords.top - tt.height
        // 窗口顶部放得下 → ABOVE(尖朝下);否则 BELOW(尖朝上)
        if (aboveTop >= 4) {
            top = aboveTop
            placeBelow = false
        } else {
            top = coords.bottom
            placeBelow = true
        }
    }
    // 水平钳制在视口内
    left = Math.max(4, Math.min(left, window.innerWidth - tt.width - 4))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    // Monaco afterRender: BELOW → class 'below'
    el.classList.toggle('below', placeBelow)
    h.el = el

    // 关闭条件对齐 Monaco:光标动 / 失焦 / 滚动 / Escape / 模型变
    const close = () => hideReadOnlyMessage(view)
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault()
            close()
        }
    }
    view.contentDOM.addEventListener('keydown', onKey)
    view.contentDOM.addEventListener('blur', close)
    view.scrollDOM.addEventListener('scroll', close, { passive: true })
    const offTr = view.onTransaction(tr => {
        if (tr.selection || tr.docChanged) close()
    })
    h.offs.push(
        () => view.contentDOM.removeEventListener('keydown', onKey),
        () => view.contentDOM.removeEventListener('blur', close),
        () => view.scrollDOM.removeEventListener('scroll', close),
        offTr,
    )
}

/** Tab / Shift+Tab 把焦点交给文档顺序里的下一个 / 上一个可聚焦元素。from 自己和它的子树不算。 */
export function focusNextTabbable(from: HTMLElement, backward: boolean): boolean {
    const nodes = from.ownerDocument.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')
    const before: HTMLElement[] = []
    const after: HTMLElement[] = []
    for (const el of nodes) {
        if (el === from || from.contains(el) || el.contains(from)) continue
        if (el.tabIndex < 0) continue
        if ((el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || el instanceof HTMLOptGroupElement || el instanceof HTMLOptionElement) && el.disabled) continue
        const pos = from.compareDocumentPosition(el)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) after.push(el)
        else if (pos & Node.DOCUMENT_POSITION_PRECEDING) before.push(el)
    }
    const target = backward ? before[before.length - 1] : after[0]
    if (!target) return false
    target.focus()
    return true
}

/** 是否编辑类 beforeinput */
export function isEditInputType(inputType: string): boolean {
    if (!inputType) return false
    if (inputType.startsWith('insert')) return true
    if (inputType.startsWith('delete')) return true
    if (inputType.startsWith('format')) return true
    if (inputType === 'historyUndo' || inputType === 'historyRedo') return true
    return false
}

/**
 * 挂只读拒编监听。返回卸载函数。
 * EditorView 构造时默认挂上;非 readOnly 时回调立刻 return。
 */
export function installReadOnlyMessage(view: EditorView): () => void {
    const onBeforeInput = (e: InputEvent) => {
        if (!view.state.readOnly) return
        if (!isEditInputType(e.inputType)) return
        e.preventDefault()
        showReadOnlyMessage(view)
    }
    const onKeyDown = (e: KeyboardEvent) => {
        if (!view.state.readOnly) return
        if (e.isComposing || e.defaultPrevented) return
        // 可打印 / 退格删 / 回车。Tab 在只读时是移焦点(Monaco),不弹这条
        const editKey =
            e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter' ||
            (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
        if (!editKey) return
        // 让 keymap 先跑;若命令处理了(preventDefault)则不弹
        // 用 setTimeout 0 看是否被 preventDefault——更稳:直接弹,命令返回 false 时用户期望提示
        showReadOnlyMessage(view)
    }
    const onClipboard = (e: Event) => {
        if (!view.state.readOnly) return
        // copy 允许;cut/paste 拒
        if (e.type === 'copy') return
        e.preventDefault()
        showReadOnlyMessage(view)
    }
    const onDrop = (e: DragEvent) => {
        if (!view.state.readOnly) return
        e.preventDefault()
        showReadOnlyMessage(view)
    }

    view.contentDOM.addEventListener('beforeinput', onBeforeInput)
    // keydown 捕获阶段太早;用 bubble 且不 preventDefault 编辑键(只读时本来也无命令生效)
    view.contentDOM.addEventListener('keydown', onKeyDown)
    view.contentDOM.addEventListener('cut', onClipboard)
    view.contentDOM.addEventListener('paste', onClipboard)
    view.contentDOM.addEventListener('drop', onDrop)

    return () => {
        view.contentDOM.removeEventListener('beforeinput', onBeforeInput)
        view.contentDOM.removeEventListener('keydown', onKeyDown)
        view.contentDOM.removeEventListener('cut', onClipboard)
        view.contentDOM.removeEventListener('paste', onClipboard)
        view.contentDOM.removeEventListener('drop', onDrop)
        hideReadOnlyMessage(view)
        hosts.delete(view)
    }
}
