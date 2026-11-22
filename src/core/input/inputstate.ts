// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 InputState —— 输入侧私有状态（composition / iOS pending / tab focus / beforeinput 缓存）。
// 逐字段对齐 codeSrc/view/src/input.ts InputState；事件接线在 EditorView 构造期。
// 浏览器物理下限：禁止「重想」这些标志的语义。

import type { SelectionRange } from '../model/selection'
import type { EditorView } from '../view/editorview'
import { browser } from '../browser'

export const modifierCodes = [16, 17, 18, 20, 91, 92, 224, 225]

export const PENDING_IOS_KEYS: { key: string, keyCode: number, inputType: string }[] = [
    { key: 'Backspace', keyCode: 8, inputType: 'deleteContentBackward' },
    { key: 'Enter', keyCode: 13, inputType: 'insertParagraph' },
    { key: 'Enter', keyCode: 13, inputType: 'insertLineBreak' },
    { key: 'Delete', keyCode: 46, inputType: 'deleteContentForward' },
]

export const EMACSY_PENDING_KEYS = 'dthko'

export class InputState {
    lastKeyCode = 0
    lastKeyTime = 0
    lastTouchTime = 0
    lastTouchX = 0
    lastTouchY = 0
    lastFocusTime = 0
    lastScrollTop = 0
    lastScrollLeft = 0
    lastWheelEvent = 0

    // iOS：某些键必须让默认行为发生，再 250ms 后 synthetic 处理
    pendingIOSKey: { key: string, keyCode: number } | KeyboardEvent | null = null

    // -1 关；0 永久；>0 过期时间戳。Esc 开 2s 临时，Tab 不进 keymap
    tabFocusMode = -1

    lastSelectionOrigin: string | null = null
    lastSelectionTime = 0
    lastContextMenu = 0

    // -1 = 未组字；否则 = 组字期间变更次数（0=刚开始尚未变更）
    composing = -1
    // null=无组字；true=下一次变更为 compose.start；false=已标过 start
    compositionFirstChange: boolean | null = null
    compositionEndedAt = 0
    // Safari：compositionend 与 keydown Enter 乱序 → 100ms 内仍忽略 key
    compositionPendingKey = false
    // compositionend 后仍有 pending mutation → 变更仍算 compose
    compositionPendingChange = false

    // beforeinput insertText 缓存（跨行 widget 扁平化修复）
    insertingText = ''
    insertingTextAt = 0

    draggedContent: SelectionRange | null = null
    mouseSelection: { destroy(): void, update?(docChanged: boolean): void } | null = null

    setSelectionOrigin(origin: string) {
        this.lastSelectionOrigin = origin
        this.lastSelectionTime = Date.now()
    }

    // Safari Enter 确认 IME 时 compositionend 先于 keydown → 仍应 ignore
    ignoreDuringComposition(event: Event): boolean {
        if (!/^key/.test(event.type) || (event as { synthetic?: boolean }).synthetic) return false
        if (this.composing > 0) return true
        if (browser.safari && !browser.ios && this.compositionPendingKey &&
            Date.now() - this.compositionEndedAt < 100) {
            this.compositionPendingKey = false
            return true
        }
        return false
    }

    startComposition() {
        if (this.compositionFirstChange == null)
            this.compositionFirstChange = true
        if (this.composing < 0)
            this.composing = 0
    }

    endComposition(view: EditorView, hasPendingRecords: boolean) {
        this.composing = -1
        this.compositionEndedAt = Date.now()
        this.compositionPendingKey = true
        this.compositionPendingChange = hasPendingRecords
        this.compositionFirstChange = null
        if (browser.chrome && browser.android)
            view.observer.flushSoon()
        else if (this.compositionPendingChange)
            Promise.resolve().then(() => view.observer.flush())
        // L8: Android 偶发漏 compositionend 后 composing 假阳性 → 短延迟再清一次
        if (browser.android) {
            const endedAt = this.compositionEndedAt
            view.dom.ownerDocument.defaultView?.setTimeout(() => {
                if (this.composing >= 0 && this.compositionEndedAt === endedAt) {
                    this.composing = -1
                    this.compositionFirstChange = null
                }
            }, 50)
        }
    }

    noteComposingChange() {
        if (this.composing >= 0) this.composing++
    }

    userEventForChange(view: EditorView): string {
        let userEvent = 'input.type'
        if (view.composing ||
            (this.compositionPendingChange && this.compositionEndedAt > Date.now() - 50)) {
            this.compositionPendingChange = false
            userEvent += '.compose'
            if (this.compositionFirstChange) {
                userEvent += '.start'
                this.compositionFirstChange = false
            }
        }
        return userEvent
    }

    destroy() {
        this.mouseSelection?.destroy()
        this.mouseSelection = null
    }
}

// Firefox：document 上挂空 copy/cut 监听，空选区时才会正常派发剪贴板事件（#1082）
const appliedFirefoxHack = new Set<Document>()

export function firefoxCopyCutHack(doc: Document) {
    if (appliedFirefoxHack.has(doc)) return
    appliedFirefoxHack.add(doc)
    doc.addEventListener('copy', () => {})
    doc.addEventListener('cut', () => {})
}
