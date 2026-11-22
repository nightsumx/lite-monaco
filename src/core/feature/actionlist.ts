// Quick Fix(⌘.)/ 点灯泡弹出的下拉,对齐 Monaco ActionWidget + ActionList。
// 单独成文件、只依赖 themevars:tscodeactions 从 litemonaco.ts 早早被加载,若经 contextmenu → commands 引入,
// 会抢在 keymap 之前进入 commands → closebrackets → editorview → keymap 的环(浏览器里 cursorCharLeft TDZ)。

import type { EditorView } from '../view/editorview'
import { inheritThemeVars } from '../chrome/themevars'

// —— Action widget:Quick Fix(⌘.)/ 点灯泡弹出的下拉(对齐 Monaco ActionWidget + ActionList)——
//
// 实测 /tmp/lc-hunt/r5/O/m-qf4.ts、m-qf5.ts:
// - 锚点是一个点 { x, y }(视口坐标);下方放得下 → top = y + 2,否则翻上去 bottom = y;右边放不下 → 右缘贴 x
// - 每组前一行组标题(role=separator,VS Code codeActionWidget:Quick Fix / Extract / Inline / Rewrite / Move / More Actions…),
//   操作行带组图标(没有就是灯泡),第一个操作聚焦;焦点进列表
// - ↑↓ 循环跳过标题(Mac 另有 ⌃N / ⌃P);Home / End / PageUp / PageDown 不动;Enter 应用;Esc / ⇧Esc 关;
//   鼠标移上去聚焦,点击应用;点外面、窗口失焦、编辑器尺寸变化(Monaco onDidLayoutChange)、编辑器销毁都关,
//   编辑器滚动不关
// 挂 body + fixed(同右键菜单,不被 .cm-editor 的 overflow 裁);关闭后焦点回编辑器,再交出选中项。

export interface ActionListItem<T> {
    label: string
    value: T
    group?: string
    icon?: string
}

export function showActionList<T>(
    view: EditorView,
    anchor: { x: number, y: number },
    opts: { items: readonly ActionListItem<T>[] },
): Promise<T | null> {
    return new Promise(resolve => {
        const doc = view.dom.ownerDocument
        const win = doc.defaultView ?? window
        const mac = /Mac|iPhone|iPad/.test(win.navigator.platform)
        const root = doc.createElement('div')
        root.className = 'cm-action-widget'
        const list = doc.createElement('div')
        list.className = 'cm-action-list'
        list.setAttribute('role', 'listbox')
        list.setAttribute('aria-label', 'Action Widget')
        list.tabIndex = 0
        root.appendChild(list)
        const listId = `cm-action-list-${++actionListSeq}`
        const rows = opts.items.map((it, i) => {
            if (it.group && it.group !== opts.items[i - 1]?.group) {
                const h = doc.createElement('div')
                h.className = 'cm-action-header'
                h.setAttribute('role', 'separator')
                h.textContent = it.group
                list.appendChild(h)
            }
            const row = doc.createElement('div')
            row.className = 'cm-action-item'
            row.id = `${listId}-${i}`
            row.setAttribute('role', 'option')
            row.setAttribute('aria-label', it.label)
            row.title = 'Enter to Apply'
            const icon = doc.createElement('div')
            icon.className = `codicon codicon-${it.icon ?? 'light-bulb'}`
            const title = doc.createElement('span')
            title.className = 'cm-action-title'
            title.textContent = it.label
            row.append(icon, title)
            row.addEventListener('mousemove', () => { if (focused !== i) setFocus(i) })
            row.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
            row.addEventListener('click', e => { e.preventDefault(); finish(it.value) })
            list.appendChild(row)
            return row
        })

        let focused = -1
        const setFocus = (i: number) => {
            focused = i
            rows.forEach((r, j) => {
                r.classList.toggle('focused', j === i)
                r.setAttribute('aria-selected', j === i ? 'true' : 'false')
            })
            if (rows[i]) {
                list.setAttribute('aria-activedescendant', rows[i].id)
                rows[i].scrollIntoView?.({ block: 'nearest' })
            }
        }

        let closed = false
        const finish = (v: T | null) => {
            if (closed) return
            closed = true
            root.remove()
            win.removeEventListener('mousedown', onWinDown, true)
            win.removeEventListener('keydown', onKey, true)
            win.removeEventListener('blur', onBlur)
            offGeometry()
            offDestroy()
            if (view.dom.isConnected) view.focus()
            resolve(v)
        }
        const onWinDown = (e: MouseEvent) => {
            if (!(e.target instanceof Node && root.contains(e.target))) finish(null)
        }
        const onBlur = () => finish(null)
        const onKey = (e: KeyboardEvent) => {
            if (e.isComposing) return
            const n = rows.length
            const plain = !e.metaKey && !e.ctrlKey && !e.altKey
            if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) finish(null)
            else if ((e.key === 'ArrowDown' && plain && !e.shiftKey) || (mac && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n')) {
                if (n) setFocus((focused + 1) % n)
            }
            else if ((e.key === 'ArrowUp' && plain && !e.shiftKey) || (mac && e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p')) {
                if (n) setFocus((focused - 1 + n) % n)
            }
            else if (e.key === 'Enter' && plain) {
                const it = opts.items[focused]
                if (it) finish(it.value)
            }
            // 别的键(打字、Home/End…)Monaco 也吞掉,焦点在列表上不进编辑器
            else if (MODIFIER_ONLY.has(e.key)) return
            e.preventDefault()
            e.stopPropagation()
        }
        const offDestroy = view.onDestroy(() => finish(null))
        // onGeometry 也报 view zone 变化,只认 scrollDOM 尺寸真变了
        const size = { w: view.scrollDOM.clientWidth, h: view.scrollDOM.clientHeight }
        const offGeometry = view.onGeometry(() => {
            if (view.scrollDOM.clientWidth !== size.w || view.scrollDOM.clientHeight !== size.h) finish(null)
        })

        root.style.position = 'fixed'
        root.style.left = '0'
        root.style.top = '0'
        root.style.visibility = 'hidden'
        inheritThemeVars(view, root)
        doc.body.appendChild(root)
        const w = root.offsetWidth
        const h = root.offsetHeight
        const vw = win.innerWidth
        const vh = win.innerHeight
        let left = anchor.x
        if (left + w > vw) left = anchor.x - w >= 0 ? anchor.x - w : Math.max(0, vw - w)
        let top = anchor.y + 2
        if (top + h > vh) top = anchor.y - h >= 0 ? anchor.y - h : Math.max(0, vh - h)
        root.style.left = `${left}px`
        root.style.top = `${top}px`
        root.style.visibility = ''
        setFocus(0)
        list.focus({ preventScroll: true })
        win.addEventListener('mousedown', onWinDown, true)
        win.addEventListener('keydown', onKey, true)
        win.addEventListener('blur', onBlur)
    })
}

let actionListSeq = 0
const MODIFIER_ONLY = new Set(['Shift', 'Control', 'Alt', 'Meta'])
