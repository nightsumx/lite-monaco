// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// Android EditContext 管理 —— 对齐 codeSrc/view/src/domobserver.ts EditContextManager。
// 仅在 window.EditContext 且 Android（Chrome≥126）时启用；拼写更正走 insertReplacementText。

import type { EditorView } from '../view/editorview'
import { applyDOMChangeInner, findDiff, sameSelPos } from './domchange'
import { EditorSelection } from '../model/selection'
import { browser } from '../browser'
import { getSelection } from '../view/domutil'

const enum CxVp {
    Margin = 10000,
    MaxSize = Margin * 3,
    MinMargin = 500,
}

type EC = {
    text: string
    selectionStart: number
    selectionEnd: number
    updateText(a: number, b: number, t: string): void
    updateSelection(a: number, b: number): void
    updateControlBounds(r: DOMRect): void
    updateSelectionBounds(r: DOMRect): void
    updateCharacterBounds(start: number, rects: readonly DOMRect[]): void
    addEventListener(type: string, h: (e: any) => void): void
    removeEventListener(type: string, h: (e: any) => void): void
}

export function editContextSupported(): boolean {
    return typeof window !== 'undefined' &&
        !!(window as Window & { EditContext?: unknown }).EditContext &&
        browser.android &&
        !(browser.chrome && browser.chrome_version > 0 && browser.chrome_version < 126)
}

export class EditContextManager {
    editContext: EC
    from = 0
    to = 0
    pendingContextChange: { from: number, to: number, insert: string } | null = null
    private handlers: Record<string, (e: any) => void> = Object.create(null)
    private composing: { contextBase: number, editorBase: number, drifted: boolean } | null = null
    private destroyed = false

    constructor(private view: EditorView) {
        this.resetRange(view.state.doc.length, view.state.selection.main.head)
        const EditContextCtor = (window as unknown as { EditContext: new (o: object) => EC }).EditContext
        const context = this.editContext = new EditContextCtor({
            text: view.state.doc.sliceString(this.from, this.to),
            selectionStart: this.toContextPos(Math.max(this.from, Math.min(this.to, view.state.selection.main.anchor))),
            selectionEnd: this.toContextPos(view.state.selection.main.head),
        })

        this.handlers.textupdate = (e: {
            updateRangeStart: number, updateRangeEnd: number, text: string
            selectionStart: number, selectionEnd: number
        }) => {
            if (this.destroyed) return
            const main = view.state.selection.main
            let from = this.toEditorPos(e.updateRangeStart)
            let to = this.toEditorPos(e.updateRangeEnd)
            if (view.inputState.composing >= 0 && !this.composing)
                this.composing = { contextBase: e.updateRangeStart, editorBase: from, drifted: false }
            const deletes = to - from > e.text.length
            if (from === this.from && main.anchor < this.from) from = main.anchor
            else if (to === this.to && main.anchor > this.to) to = main.anchor

            const diff = findDiff(
                view.state.sliceDoc(from, to),
                e.text,
                (deletes ? main.from : main.to) - from,
                deletes ? 'end' : null,
            )
            if (!diff) {
                const newSel = EditorSelection.single(
                    this.toEditorPos(e.selectionStart),
                    this.toEditorPos(e.selectionEnd),
                )
                if (!sameSelPos(newSel, main))
                    view.dispatch(view.state.update({ selection: newSel, userEvent: 'select' }))
                return
            }
            let change = {
                from: diff.from + from,
                to: diff.toA + from,
                insert: e.text.slice(diff.from, diff.toB),
            }
            if ((browser.mac || browser.android) && change.from === main.head - 1 &&
                /^\. ?$/.test(e.text) && view.contentDOM.getAttribute('autocorrect') === 'off')
                change = { from, to, insert: e.text.replace('.', ' ') }

            this.pendingContextChange = change
            if (!view.state.readOnly) {
                const newLen = this.to - this.from + (change.to - change.from + change.insert.length)
                applyDOMChangeInner(
                    view,
                    change,
                    EditorSelection.single(
                        this.toEditorPos(e.selectionStart, newLen),
                        this.toEditorPos(e.selectionEnd, newLen),
                    ),
                )
            }
            if (this.pendingContextChange) {
                this.revertPending()
                this.setSelection()
            }
        }

        this.handlers.characterboundsupdate = (e: { rangeStart: number, rangeEnd: number }) => {
            const rects: DOMRect[] = []
            let prev: DOMRect | null = null
            for (let i = this.toEditorPos(e.rangeStart), end = this.toEditorPos(e.rangeEnd); i < end; i++) {
                const c = view.caretCoords(i)
                prev = c
                    ? new DOMRect(c.left, c.top, 1, c.height)
                    : prev || new DOMRect()
                rects.push(prev)
            }
            context.updateCharacterBounds(e.rangeStart, rects)
        }

        this.handlers.compositionstart = () => {
            if (view.inputState.composing < 0) {
                view.inputState.composing = 0
                view.inputState.compositionFirstChange = true
            }
        }
        this.handlers.compositionend = () => {
            view.inputState.composing = -1
            view.inputState.compositionFirstChange = null
            if (this.composing) {
                const drifted = this.composing.drifted
                this.composing = null
                if (drifted) this.reset()
            }
        }
        // L9: 漏 compositionend 时，删除类 textupdate 后若邻域非词字符则强制 end
        const origTextUpdate = this.handlers.textupdate
        this.handlers.textupdate = (e: {
            updateRangeStart: number, updateRangeEnd: number, text: string
            selectionStart: number, selectionEnd: number
        }) => {
            origTextUpdate(e)
            if (view.inputState.composing >= 0 && e.updateRangeStart < e.updateRangeEnd && !e.text.length) {
                const t = this.editContext.text
                const i = Math.max(0, e.updateRangeStart - 1)
                const slice = t.slice(i, Math.min(t.length, e.updateRangeStart + 1))
                let wordish = false
                for (let k = 0; k < slice.length; k++) {
                    const c = slice.charCodeAt(k)
                    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c > 127) {
                        wordish = true
                        break
                    }
                }
                if (!wordish) this.handlers.compositionend({} as CompositionEvent)
            }
        }

        for (const event in this.handlers)
            context.addEventListener(event, this.handlers[event])

        // 挂到 contentDOM
        ;(view.contentDOM as HTMLElement & { editContext?: EC | null }).editContext = context
    }

    afterTransaction(docChanged: boolean, selectionSet: boolean) {
        if (this.destroyed) return
        if (docChanged) {
            if (!this.applyEdits() || !this.rangeIsValid()) {
                this.pendingContextChange = null
                this.reset()
            } else {
                this.setSelection()
            }
        } else if (selectionSet) {
            this.setSelection()
        }
        this.measure()
    }

    private applyEdits(): boolean {
        // 简化：有 pending 且匹配当前 doc 则清掉；否则 reset 窗口
        if (this.pendingContextChange) {
            const p = this.pendingContextChange
            const cur = this.view.state.sliceDoc(p.from, p.from + p.insert.length)
            if (cur === p.insert) this.pendingContextChange = null
            else {
                this.revertPending()
            }
        }
        return this.rangeIsValid()
    }

    private measure() {
        try {
            this.editContext.updateControlBounds(this.view.contentDOM.getBoundingClientRect())
            const sel = getSelection(this.view.root)
            if (sel && sel.rangeCount)
                this.editContext.updateSelectionBounds(sel.getRangeAt(0).getBoundingClientRect())
        } catch { /* jsdom / 无布局 */ }
    }

    private resetRange(docLen: number, head: number) {
        this.from = Math.max(0, head - CxVp.Margin)
        this.to = Math.min(docLen, head + CxVp.Margin)
    }

    reset() {
        const { state } = this.view
        this.resetRange(state.doc.length, state.selection.main.head)
        this.editContext.updateText(0, this.editContext.text.length, state.doc.sliceString(this.from, this.to))
        this.setSelection()
    }

    private revertPending() {
        const pending = this.pendingContextChange
        if (!pending) return
        this.pendingContextChange = null
        this.editContext.updateText(
            this.toContextPos(pending.from),
            this.toContextPos(pending.from + pending.insert.length),
            this.view.state.doc.sliceString(pending.from, pending.to),
        )
    }

    private setSelection() {
        const { main } = this.view.state.selection
        const start = this.toContextPos(Math.max(this.from, Math.min(this.to, main.anchor)))
        const end = this.toContextPos(main.head)
        if (this.editContext.selectionStart !== start || this.editContext.selectionEnd !== end)
            this.editContext.updateSelection(start, end)
    }

    private rangeIsValid() {
        const { head } = this.view.state.selection.main
        const docLen = this.view.state.doc.length
        return !(this.from > 0 && head - this.from < CxVp.MinMargin ||
            this.to < docLen && this.to - head < CxVp.MinMargin ||
            this.to - this.from > CxVp.Margin * 3)
    }

    toEditorPos(contextPos: number, clipLen = this.to - this.from) {
        contextPos = Math.min(contextPos, clipLen)
        const c = this.composing
        return c && c.drifted ? c.editorBase + (contextPos - c.contextBase) : contextPos + this.from
    }

    toContextPos(editorPos: number) {
        const c = this.composing
        return c && c.drifted ? c.contextBase + (editorPos - c.editorBase) : editorPos - this.from
    }

    destroy() {
        this.destroyed = true
        for (const event in this.handlers)
            this.editContext.removeEventListener(event, this.handlers[event])
        try {
            ;(this.view.contentDOM as HTMLElement & { editContext?: EC | null }).editContext = null
        } catch { /* */ }
    }
}
