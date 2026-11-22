// F2 重命名的内嵌输入框(对齐 Monaco RenameWidget)+ 编辑器内提示条(对齐 Monaco MessageController)。
//
// 输入框:贴在符号所在行的行盒下沿(放不下放上沿),左缘对齐符号起点;初值是光标下的词,全选(编辑器里选了名字的一部分
// 就只选那部分);Enter / ⌘Enter 确认,Escape / ⇧Escape 取消;失焦、文档变化、光标移动、编辑器销毁、符号行滚出视口都取消。
// 新名等于旧名或全是空白 → 当取消。宽度 size = max(名字长度 × 1.1, 20),框至少 200px。

import type { EditorView } from '../core/view/editorview'
import { inheritThemeVars } from '../core/chrome/themevars'

export interface RenameInputRequest {
    /** 符号区间(文档 offset) */
    from: number
    to: number
    /** 旧名(输入框初值) */
    name: string
}

const active = new WeakMap<EditorView, () => void>()

// Monaco content widget:行在视口外 → 不画(RenameWidget 就此取消)
function place(view: EditorView, el: HTMLElement, pos: number): boolean {
    const sd = view.scrollDOM
    const blk = view.lineBlockAt(pos)
    if (blk.bottom <= sd.scrollTop || blk.top >= sd.scrollTop + sd.clientHeight) return false
    const c = view.caretCoords(pos)
    if (!c) return false
    const er = view.dom.getBoundingClientRect()
    const lineTop = sd.getBoundingClientRect().top + blk.top - sd.scrollTop
    const lineBottom = lineTop + blk.height
    const h = el.getBoundingClientRect().height || 26
    const fitsBelow = lineBottom + h + 4 <= Math.max(er.bottom, (view.dom.ownerDocument.defaultView?.innerHeight ?? 0))
    const top = fitsBelow || lineTop - h < er.top ? lineBottom : lineTop - h
    el.style.left = `${Math.max(0, c.left - er.left)}px`
    el.style.top = `${top - er.top}px`
    return true
}

/** 弹出内嵌输入框;确认 → 新名,取消 → null */
export function renameInput(view: EditorView, req: RenameInputRequest): Promise<string | null> {
    active.get(view)?.()
    return new Promise(resolve => {
        const box = document.createElement('div')
        box.className = 'cm-rename-box'
        // 结构定位(颜色/边框归主题 CSS):贴在 view.dom 里按坐标摆
        box.style.position = 'absolute'
        box.style.zIndex = '40'
        const field = document.createElement('div')
        field.className = 'cm-rename-field'
        const input = document.createElement('input')
        input.className = 'cm-rename-input'
        input.type = 'text'
        input.spellcheck = false
        input.value = req.name
        input.size = Math.max(Math.round(req.name.length * 1.1), 20)
        input.setAttribute('aria-label', 'Rename input. Type new name and press Enter to commit.')
        field.appendChild(input)
        box.appendChild(field)
        inheritThemeVars(view, box)
        view.dom.appendChild(box)
        place(view, box, req.from)

        // 编辑器里选了名字的一部分(单行、在符号内)→ 只选那部分
        const sel = view.state.selection.main
        let selStart = 0
        let selEnd = req.name.length
        if (!sel.empty && sel.from >= req.from && sel.to <= req.to) {
            selStart = sel.from - req.from
            selEnd = sel.to - req.from
        }

        let done = false
        const finish = (v: string | null, focusEditor: boolean) => {
            if (done) return
            done = true
            active.delete(view)
            offTr()
            offDestroy()
            view.scrollDOM.removeEventListener('scroll', onScroll)
            box.remove()
            if (focusEditor && view.dom.isConnected) view.focus()
            resolve(v)
        }
        const accept = () => {
            const next = input.value
            if (next === req.name || !next.trim()) { finish(null, true); return }
            finish(next, true)
        }
        input.addEventListener('keydown', e => {
            // 带 ⌘/Ctrl 的键放行冒泡:宿主 keymap 在 rename 框里也生效(Monaco addCommand 同),并照样到 window
            if (!(e.metaKey || e.ctrlKey)) e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); accept() }
            else if (e.key === 'Escape') { e.preventDefault(); finish(null, true) }
        })
        input.addEventListener('blur', () => {
            // 焦点去了别处(不是窗口整体失焦)才取消;窗口失焦回来还能接着输
            setTimeout(() => {
                if (done) return
                const doc = view.dom.ownerDocument
                if (doc.activeElement === input) return
                finish(null, !doc.hasFocus())
            }, 0)
        })
        const onScroll = () => { if (!place(view, box, req.from)) finish(null, true) }
        view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
        const offTr = view.onTransaction(tr => {
            if (tr.docChanged || tr.selection) finish(null, false)
        })
        const offDestroy = view.onDestroy(() => finish(null, false))
        active.set(view, () => finish(null, false))

        input.focus()
        input.setSelectionRange(selStart, selEnd)
    })
}

/** 正在显示的重命名框(测试 / 宿主判断用) */
export function renameInputOpen(view: EditorView): boolean {
    return active.has(view)
}

const messages = new WeakMap<EditorView, () => void>()

/** 光标处的一行提示(如 "You cannot rename this element.");光标动、打字、失焦、销毁时关(Monaco MessageController) */
export function showEditorMessage(view: EditorView, pos: number, text: string): void {
    messages.get(view)?.()
    const el = document.createElement('div')
    el.className = 'cm-editor-message'
    el.style.position = 'absolute'
    el.style.zIndex = '40'
    el.setAttribute('role', 'alert')
    el.textContent = text
    inheritThemeVars(view, el)
    view.dom.appendChild(el)
    const c = view.caretCoords(pos)
    if (c) {
        const er = view.dom.getBoundingClientRect()
        el.style.left = `${Math.max(0, c.left - er.left)}px`
        const h = el.getBoundingClientRect().height || 22
        el.style.top = `${c.top - er.top - h < 0 ? c.bottom - er.top : c.top - er.top - h}px`
    }
    let closed = false
    const close = () => {
        if (closed) return
        closed = true
        messages.delete(view)
        offTr()
        offDestroy()
        view.contentDOM.removeEventListener('blur', close)
        el.remove()
    }
    const offTr = view.onTransaction(tr => { if (tr.docChanged || tr.selection) close() })
    const offDestroy = view.onDestroy(close)
    view.contentDOM.addEventListener('blur', close)
    messages.set(view, close)
}
