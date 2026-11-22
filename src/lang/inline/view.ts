// Ghost text 的画法:一个挂在 scrollDOM 里的独立图层(同 cm-cursorLayer),绝不进 contenteditable,所以不污染 DOM≡doc。
// 只读模型的 primaryGhostText:
//   · 第一行的各段按 column 取 caretCoords 落点,逐段画 span
//   · 多行 ghost 的后续行 = 该行下方的一个 view zone(和 Monaco 一样把下文顶开),文字画进空白里
// 与 Monaco 的差别:行内中间插入时,右侧已有文字会被第一行 ghost 盖住而不是被推开(行内 inset 需要内容流里的 widget,会破坏 DOM≡doc)。
import type { IDisposable, LiteMonacoEditor } from '../../api/types'
import type { InlineCompletionsController } from './controller'
import type { GhostText } from './ghosttext'

interface CoordView {
    caretCoords(pos: number): { left: number, top: number, height: number, bottom: number } | null
    state: { doc: { line(n: number): { from: number, to: number } } }
    setViewZone(id: string, zone: { afterLine: number, height: number } | null): void
    scrollDOM: HTMLElement
    contentDOM: HTMLElement
}

export function attachGhostTextView(editor: LiteMonacoEditor, controller: InlineCompletionsController): IDisposable {
    const view = editor as unknown as CoordView
    const layer = document.createElement('div')
    layer.className = 'cm-ghostTextLayer'
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;'
    layer.setAttribute('aria-hidden', 'true')
    view.scrollDOM.appendChild(layer)

    const css = (el: HTMLElement, font: CSSStyleDeclaration) => {
        el.style.cssText = `position:absolute;white-space:pre;color:var(--lm-editor-placeholder-foreground,rgba(255,255,255,.34));font:${font.font};`
    }

    // 多行 ghost 的后续行 = Monaco 的 view zone:在该行下方真留出空白(往下推),ghost 画进空白里,不盖住下面的行。
    // zone 登记是 EditorView 的真源;只在高度/行变了才写,避免 draw → 重排 → onDidScrollChange → draw 回路
    const ZONE_ID = 'ghost-text'
    let zone = { afterLine: 0, height: 0 }
    const setZone = (afterLine: number, height: number) => {
        if (zone.afterLine === afterLine && zone.height === height) return
        zone = { afterLine, height }
        view.setViewZone(ZONE_ID, height > 0 ? { afterLine, height } : null)
    }

    let subs: IDisposable[] = []
    let disposed = false
    const draw = () => {
        if (disposed) return
        layer.textContent = ''
        const g: GhostText | undefined = controller.uiDisabled ? undefined : controller.model?.primaryGhostText
        if (!g || g.isEmpty()) { setZone(0, 0); return }
        const doc = view.state.doc
        const lineFrom = doc.line(g.lineNumber).from
        const rect = view.contentDOM.getBoundingClientRect()
        const font = getComputedStyle(view.contentDOM)
        const lineHeight = parseFloat(font.lineHeight) || 0
        const extra: string[] = []
        for (const part of g.parts) {
            const c = view.caretCoords(lineFrom + part.column - 1)
            if (!c) continue // 视口外 / 无布局
            const first = part.lines[0]?.line ?? ''
            if (first) {
                const s = document.createElement('span')
                css(s, font)
                s.style.left = `${c.left - rect.left}px`
                s.style.top = `${c.top - rect.top}px`
                s.style.height = `${c.height}px`
                s.style.lineHeight = `${c.height}px` // font 简写带进来的是整行行高,会把字形压到 caret 盒下沿
                s.style.fontStyle = part.preview ? 'italic' : ''
                s.textContent = first
                layer.appendChild(s)
            }
            for (let i = 1; i < part.lines.length; i++) extra.push(part.lines[i].line)
        }
        const first = g.parts[0]
        const tail = first && view.caretCoords(doc.line(g.lineNumber).to)
        const start = first && view.caretCoords(lineFrom)
        if (extra.length && tail && start && lineHeight) {
            // 后续行从行首列起(ghost 文本自带缩进),不是从光标列起;空白紧贴该行(含折行)下沿
            setZone(g.lineNumber, extra.length * lineHeight)
            const box = document.createElement('div')
            css(box, font)
            box.style.left = `${start.left - rect.left}px`
            box.style.top = `${tail.bottom - rect.top}px`
            box.textContent = extra.join('\n')
            layer.appendChild(box)
        }
        else setZone(0, 0)
    }
    subs.push(controller.onDidChangeModel(() => { rebind(); draw() }))
    const rebind = () => {
        // 只留第一项(model 订阅),其余是旧 model 的
        const keep = subs.slice(0, 1)
        for (const s of subs.slice(1)) s.dispose()
        subs = keep
        const m = controller.model
        if (m) subs.push(m.onDidChange(draw))
    }
    rebind()
    draw()
    subs.push(editor.onDidScrollChange?.(draw) ?? { dispose() { } })
    return {
        dispose() {
            disposed = true
            setZone(0, 0)
            for (const s of subs.splice(0)) s.dispose()
            layer.remove()
        },
    }
}
