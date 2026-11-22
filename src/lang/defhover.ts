// Ctrl/⌘ + 悬停 / 点击跳转定义(Monaco GotoDefinitionAtPositionEditorContribution)
//
// - 按住「跳定义修饰键」(multiCursorModifier=altKey 时是 Ctrl/⌘,ctrlCmd 时是 Alt)悬停在词上:
//   词下划线(.cm-definition-link)+ 手型光标(contentDOM 上 .cm-definition-link-active),并带上定义预览给 hover 卡。
// - 点击:definitionLinkOpensInPeek=true → Peek Definition,否则 Go to Definition;没定义时不弹消息(muteMessage)。
// - editor.action.showDefinitionPreviewHover:在光标处直接弹出定义预览 hover。
import { StateEffect, StateField, type EditorState } from '../core/model/state'
import { Decoration, type DecorationSet } from '../core/model/decoration'
import { RangeSetBuilder } from '../core/model/rangeset'
import type { EditorView } from '../core/view/editorview'
import { getOption } from '../core/options'
import { resolvedMultiCursorModifier } from '../core/input/mouseselection'
import { showHover, type HoverSource } from '../core/feature/hover'
import type { DefinitionPreview } from './tsactions'

/** 点击 / 悬停 / 预览只用到这三个(TSActions 与 providers.ts 的 DefinitionActionsLike 都满足) */
export interface DefinitionActions {
    definitionPreviewAt(view: EditorView, pos: number): Promise<DefinitionPreview | null>
    goToDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
    peekDefinition(view: EditorView, opts?: { muteMessage?: boolean }): Promise<boolean>
}

export interface DefinitionLink { from: number, to: number, preview: DefinitionPreview | null }

export const setDefinitionLink = StateEffect.define<DefinitionLink | null>()
export const definitionLinkField = StateField.define<DefinitionLink | null>({
    create: () => null,
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setDefinitionLink)) return e.value
        return tr.docChanged || tr.selection ? null : v
    },
})

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** 事件上「跳定义」修饰键是否按着(与 mouseselection 的 hasDefinitionModifier 同判据) */
export function hasDefinitionModifier(state: EditorState, e: { altKey: boolean, ctrlKey: boolean, metaKey: boolean }): boolean {
    return resolvedMultiCursorModifier(state) === 'alt' ? (isMac ? e.metaKey : e.ctrlKey) : e.altKey
}

export function definitionLinkDecorations(state: EditorState): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    const l = state.field(definitionLinkField, false)
    if (l && l.from < l.to && l.to <= state.doc.length) b.add(l.from, l.to, Decoration.mark({ class: 'cm-definition-link' }))
    return b.finish()
}

/** hover 卡里的定义预览(Monaco 把预览作为 link 装饰的 hoverMessage)。只在该词是当前 link 时出现 */
export const definitionPreviewHoverSource: HoverSource = (state, pos) => {
    const l = state.field(definitionLinkField, false)
    const p = l?.preview
    if (!l || !p || pos < l.from || pos > l.to) return null
    return {
        pos: l.from, end: l.to, above: true,
        create: () => {
            const dom = document.createElement('div')
            dom.className = 'cm-definition-preview'
            const pre = document.createElement('pre')
            pre.className = 'cm-definition-preview-code'
            pre.textContent = p.text
            dom.appendChild(pre)
            const foot = document.createElement('div')
            foot.className = 'cm-definition-preview-foot'
            foot.textContent = p.count > 1 ? `Click to show ${p.count} definitions.` : (p.local ? `Line ${p.line}` : `${p.file}:${p.line || '?'}`)
            dom.appendChild(foot)
            return dom
        },
    }
}

/** 点击跳转(clickDefinitionHandler 的实现):definitionLinkOpensInPeek 决定 peek 还是跳 */
export function clickDefinition(actions: DefinitionActions): (view: EditorView) => boolean {
    return view => {
        if (getOption(view.state, 'definitionLinkOpensInPeek')) void actions.peekDefinition(view, { muteMessage: true })
        else void actions.goToDefinition(view, { muteMessage: true })
        return true
    }
}

/** editor.action.showDefinitionPreviewHover */
export async function showDefinitionPreviewHover(view: EditorView, actions: DefinitionActions): Promise<boolean> {
    const pos = view.state.selection.main.head
    const p = await actions.definitionPreviewAt(view, pos)
    // Monaco(hoverActions.ts ShowDefinitionPreviewHoverAction):先找定义,找没找到都照常弹 hover(没有定义时就是普通 hover)
    if (p) view.dispatch(view.state.update({ effects: setDefinitionLink.of({ from: p.from, to: p.to, preview: p }) }))
    return showHover(view)
}

/** 悬停会话:装在 overlays 里。modifier 按下 + 鼠标在词上 → 设 link;松开 / 移走 / 编辑 → 清 */
export function definitionHoverSession(view: EditorView, actions: DefinitionActions): () => void {
    const win = view.dom.ownerDocument.defaultView
    let seq = 0
    let last: { x: number, y: number } | null = null
    let modifier = false
    const content = view.contentDOM

    const clear = () => {
        seq++
        content.classList.remove('cm-definition-link-active')
        if (view.state.field(definitionLinkField, false)) view.dispatch(view.state.update({ effects: setDefinitionLink.of(null) }))
    }
    const refresh = () => {
        if (!modifier || !last) { clear(); return }
        const pos = view.posAtCoords({ x: last.x, y: last.y }, false)
        if (pos == null) { clear(); return }
        const cur = view.state.field(definitionLinkField, false)
        if (cur && pos >= cur.from && pos <= cur.to) return
        const my = ++seq
        void actions.definitionPreviewAt(view, pos).then(p => {
            if (my !== seq || !modifier) return
            if (!p) { content.classList.remove('cm-definition-link-active'); if (view.state.field(definitionLinkField, false)) view.dispatch(view.state.update({ effects: setDefinitionLink.of(null) })); return }
            content.classList.add('cm-definition-link-active')
            view.dispatch(view.state.update({ effects: setDefinitionLink.of({ from: p.from, to: p.to, preview: p }) }))
        }).catch(() => {})
    }
    const onMove = (e: MouseEvent) => {
        last = { x: e.clientX, y: e.clientY }
        modifier = hasDefinitionModifier(view.state, e) && !e.shiftKey
        refresh()
    }
    const onKey = (e: KeyboardEvent) => {
        const m = hasDefinitionModifier(view.state, e) && !e.shiftKey
        if (m === modifier) return
        modifier = m
        refresh()
    }
    const onLeave = () => { last = null; clear() }
    content.addEventListener('mousemove', onMove)
    content.addEventListener('mouseleave', onLeave)
    win?.addEventListener('keydown', onKey, true)
    win?.addEventListener('keyup', onKey, true)
    win?.addEventListener('blur', onLeave)
    const offTr = view.onTransaction(tr => { if (tr.docChanged) content.classList.remove('cm-definition-link-active') })
    return () => {
        seq++
        content.removeEventListener('mousemove', onMove)
        content.removeEventListener('mouseleave', onLeave)
        win?.removeEventListener('keydown', onKey, true)
        win?.removeEventListener('keyup', onKey, true)
        win?.removeEventListener('blur', onLeave)
        offTr()
        content.classList.remove('cm-definition-link-active')
    }
}
