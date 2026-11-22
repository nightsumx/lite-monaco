// TS Signature Help —— 参数提示(对齐 Monaco parameter hints)。
//
// 触发:输入 `(` / `,` / 显式 Mod-Shift-Space;Esc / 光标离开调用栈关闭。
// 渲染(Monaco parameterHintsWidget):签名 + 当前参数高亮,文档区先当前参数文档、再函数文档(都按 markdown);
// 多重载时左边一列 上一个 / 计数 / 下一个。

import type { EditorView } from '../core/view/editorview'
import type { Transaction } from '../core/model/state'
import { getTSService, type TSServiceOptions } from './tsservice'
import { rowBox } from '../core/feature/hover'
import { peekSuggestUi } from '../core/feature/suggestwidget'
import { materializeDoc } from '../core/perf'
import { getOption } from '../core/options'
import { renderMarkdown } from './tsmarkdown'

export type TSSignatureOptions = TSServiceOptions

type Part = import('typescript').SymbolDisplayPart

export interface SignatureHelpModel {
    signatures: {
        label: string
        parts: Part[]
        params: { label: string, parts: Part[], documentation?: Part[] }[]
        documentation?: Part[]
    }[]
    activeSignature: number
    activeParameter: number
}

function partsText(parts: readonly Part[] | undefined): string {
    if (!parts?.length) return ''
    let s = ''
    for (const p of parts) s += p.text
    return s
}

export function signatureHelpFromItems(
    items: import('typescript').SignatureHelpItems,
): SignatureHelpModel {
    const signatures = items.items.map(it => {
        const params = (it.parameters ?? []).map(p => ({
            label: partsText(p.displayParts),
            parts: [...(p.displayParts ?? [])],
            documentation: p.documentation ? [...p.documentation] : undefined,
        }))
        return {
            label: partsText(it.prefixDisplayParts)
                + params.map(p => p.label).join(partsText(it.separatorDisplayParts) || ', ')
                + partsText(it.suffixDisplayParts),
            parts: [
                ...(it.prefixDisplayParts ?? []),
                ...params.flatMap((p, i) => [
                    ...p.parts,
                    ...(i < params.length - 1 ? (it.separatorDisplayParts ?? []) : []),
                ]),
                ...(it.suffixDisplayParts ?? []),
            ],
            params,
            documentation: it.documentation ? [...it.documentation] : undefined,
        }
    })
    return {
        signatures,
        activeSignature: items.selectedItemIndex,
        activeParameter: items.argumentIndex,
    }
}

function renderParts(target: HTMLElement, parts: readonly Part[] | undefined) {
    for (const p of parts ?? []) {
        const span = document.createElement('span')
        span.className = `cm-qi-${p.kind}`
        span.textContent = p.text
        target.appendChild(span)
    }
}

/**
 * 渲染签名卡 DOM(可单测 class 结构)。结构照 Monaco:
 * root(.cm-signature-multiple) > .cm-signature-wrapper > [.cm-signature-controls] + .cm-signature-body > .cm-signature-sig + .cm-signature-doc
 */
export function renderSignatureHelp(model: SignatureHelpModel): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-signature-help'
    const sig = model.signatures[model.activeSignature]
    if (!sig) {
        root.textContent = ''
        return root
    }
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-signature-wrapper'
    root.appendChild(wrapper)
    const n = model.signatures.length
    if (n > 1) {
        root.classList.add('cm-signature-multiple')
        const controls = document.createElement('div')
        controls.className = 'cm-signature-controls'
        const prev = document.createElement('div')
        // codicon chevron-up / chevron-down(字形写在 textContent,不依赖宿主的 codicon.css)
        prev.className = 'cm-signature-button cm-signature-prev'
        prev.textContent = '\ueab7'
        const meta = document.createElement('div')
        meta.className = 'cm-signature-meta'
        // Monaco:序号按总数的位数补零(03/12)
        meta.textContent = `${String(model.activeSignature + 1).padStart(String(n).length, '0')}/${n}`
        const next = document.createElement('div')
        next.className = 'cm-signature-button cm-signature-next'
        next.textContent = '\ueab4'
        controls.append(prev, meta, next)
        wrapper.appendChild(controls)
    }
    const body = document.createElement('div')
    body.className = 'cm-signature-body'
    wrapper.appendChild(body)
    const line = document.createElement('div')
    line.className = 'cm-signature-sig'
    // 按参数拆:prefix + params with active highlight + suffix 用 label 近似
    if (sig.params.length === 0) {
        renderParts(line, sig.parts)
    } else {
        // 重绘:前缀到第一个参数前用完整 parts 不行,用 label 分段
        const prefixEnd = sig.label.indexOf(sig.params[0]?.label ?? '')
        if (prefixEnd > 0)
            line.appendChild(document.createTextNode(sig.label.slice(0, prefixEnd)))
        for (let i = 0; i < sig.params.length; i++) {
            if (i > 0) line.appendChild(document.createTextNode(', '))
            const wrap = document.createElement('span')
            wrap.className = i === model.activeParameter
                ? 'cm-signature-param cm-signature-param-active'
                : 'cm-signature-param'
            wrap.textContent = sig.params[i].label
            line.appendChild(wrap)
        }
        const last = sig.params[sig.params.length - 1]
        const lastIdx = last ? sig.label.lastIndexOf(last.label) : -1
        if (lastIdx >= 0) {
            const after = sig.label.slice(lastIdx + last.label.length)
            if (after) line.appendChild(document.createTextNode(after))
        }
    }
    body.appendChild(line)
    // Monaco:参数文档(displayPartsToString,markdown)在前,函数文档在后,两段都出
    const paramDoc = partsText(sig.params[model.activeParameter]?.documentation)
    const sigDoc = partsText(sig.documentation)
    if (paramDoc || sigDoc) {
        const doc = document.createElement('div')
        doc.className = 'cm-signature-doc'
        if (paramDoc) doc.appendChild(renderMarkdown(paramDoc))
        if (sigDoc) doc.appendChild(renderMarkdown(sigDoc))
        body.appendChild(doc)
    }
    return root
}

/**
 * 签名卡位置(Monaco content widget allowEditorOverflow → _layoutBoxInPage,偏好 ABOVE 再 BELOW):
 * 锚 = 光标所在的视觉行盒;上方卡底 = 行顶,离窗口顶不到 22px 就去下方(卡顶 = 行底,离窗口底留 22px),
 * 两边都放不下回到上方。水平从光标 x 起,最多伸出编辑器左右各一个卡宽,并夹在窗口内(左右留 15px)。
 * 全是视口坐标,返回值也是视口坐标(可在编辑器外)。
 */
export function placeSignatureHelp(
    row: { left: number, top: number, bottom: number },
    tt: { w: number, h: number },
    editor: { left: number, width: number },
    win: { width: number, height: number },
): { left: number, top: number } {
    const min = Math.max(15, editor.left - tt.w)
    const max = Math.min(editor.left + editor.width + tt.w, win.width - 15)
    let left = row.left
    if (left + tt.w > max) left = max - tt.w
    if (left < min) left = min
    const above = row.top - tt.h
    const fitsAbove = above >= 22
    const fitsBelow = row.bottom + tt.h <= win.height - 22
    return { left, top: fitsAbove || !fitsBelow ? above : row.bottom }
}

/**
 * 用户实际键入的字符(Monaco onDidType 收到的是键入的文本,不是落进文档的文本):
 * 自动闭合(`(` → `()`)和包裹(`x` → `(x)`)键入的是开符,即第一处插入的首字符;
 * 过键和普通打字插入的就是键入的字符,取末字符。
 */
function typedChar(tr: Transaction): string {
    let first = '', last = ''
    tr.changes.iterChanges((_a, _b, _c, _d, inserted) => {
        const s = inserted.toString()
        if (!s) return
        if (!first) first = s[0]
        last = s[s.length - 1]
    })
    return tr.isUserEvent('input.type.autoclose') || tr.isUserEvent('input.type.surround') ? first : last
}

// 对齐 Monaco TS(tsMode SignatureHelpAdapter):触发字符只有 ( 和 ,,没配重触发字符
// (Monaco 把触发字符也算重触发字符)。打 ) 关卡靠内容变化重问 TS,不是字符触发。
const TRIGGER_CHARS = '(,'
const RETRIGGER_CHARS = TRIGGER_CHARS

/** 键入的字符是触发字符 → 返回它;否则 null(对齐 Monaco ParameterHintsModel.onDidType) */
export function signatureTriggerChar(tr: Transaction, open: boolean): string | null {
    if (!tr.docChanged || !tr.isUserEvent('input.type')) return null
    const ch = typedChar(tr)
    if (!ch) return null
    if (TRIGGER_CHARS.includes(ch)) return ch
    if (open && RETRIGGER_CHARS.includes(ch)) return ch
    return null
}

/** Monaco toTsTriggerReason:已打开时一律 retrigger,否则按触发方式 */
type TriggerReason = import('typescript').SignatureHelpTriggerReason
export function tsTriggerReason(kind: 'invoke' | 'char' | 'content', char: string | null, isRetrigger: boolean): TriggerReason {
    if (kind === 'char' && char) {
        return isRetrigger
            ? { kind: 'retrigger', triggerCharacter: char as '(' | ',' | '<' | ')' }
            : { kind: 'characterTyped', triggerCharacter: char as '(' | ',' | '<' }
    }
    if (kind === 'content') return isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' }
    return { kind: 'invoked' }
}

// parameterHints 选项(IEditorParameterHintOptions;默认 { enabled: true, cycle: true },经 core.getOption 读)
function parameterHintOpts(state: import('../core/model/state').EditorState): { enabled: boolean, cycle: boolean } {
    const o = (getOption(state, 'parameterHints') ?? {}) as { enabled?: boolean, cycle?: boolean }
    return { enabled: o.enabled !== false, cycle: o.cycle !== false }
}

/** 把签名卡摆到光标旁(视口坐标;伸出编辑器的改 fixed)。TS 会话和 provider 会话共用 */
export function placeSignatureCard(view: EditorView, el: HTMLElement): void {
    const head = view.state.selection.main.head
    const glyph = view.caretCoords(head)
    if (!glyph) return
    const row = rowBox(view, head, glyph)
    const editor = view.dom.getBoundingClientRect()
    // 先放回编辑器左上角再量:贴右缘时 absolute 的可用宽被挤窄,量出来的卡会折行
    el.style.position = ''
    el.style.left = '0px'
    el.style.top = '0px'
    // Monaco updateMaxHeight:max(编辑器高 / 4, 250)
    el.style.maxHeight = `${Math.max(editor.height / 4, 250)}px`
    const tt = el.getBoundingClientRect()
    const de = view.dom.ownerDocument.documentElement
    const win = { width: de.clientWidth || editor.width, height: de.clientHeight || editor.height }
    const { left, top } = placeSignatureHelp(row, { w: tt.width, h: tt.height }, editor, win)
    // .cm-editor 是 overflow:hidden:伸出编辑器的卡改 fixed(视口坐标),不被裁(Monaco 的 overflow widget)
    if (top < editor.top || top + tt.height > editor.bottom || left < editor.left || left + tt.width > editor.right) {
        el.style.position = 'fixed'
        el.style.left = `${left}px`
        el.style.top = `${top}px`
    } else {
        el.style.left = `${left - editor.left}px`
        el.style.top = `${top - editor.top}px`
    }
}

export function signatureHelpSession(
    view: EditorView,
    opts: TSSignatureOptions,
): () => void {
    const session = getTSService(opts)
    let root: HTMLElement | null = null
    let model: SignatureHelpModel | null = null
    // 已打开或请求中(Monaco isTriggered):期间光标移动/内容变化都重问 TS
    let triggered = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    // 有请求在飞(Monaco ParameterHintState.Pending)
    let requesting = false
    // 合并待发触发:invoke 覆盖一切,content 不覆盖已有的字符触发(Monaco mergeTriggerContexts)
    let pending: { kind: 'invoke' | 'char' | 'content', char: string | null } | null = null

    const hide = () => {
        triggered = false
        requesting = false
        model = null
        pending = null
        if (timer) { clearTimeout(timer); timer = null }
        seq++
        if (root) { root.remove(); root = null }
    }

    const place = (el: HTMLElement) => placeSignatureCard(view, el)

    // Monaco next / previous(parameterHintsModel.js):parameterHints.cycle 默认开,首尾循环;
    // 关了:只有一个签名、或已在最后一个往后 / 第一个往前 → 关掉提示,不循环
    const cycle = (step: 1 | -1) => {
        if (!model) return
        const n = model.signatures.length
        const at = model.activeSignature
        const edge = step === 1 ? at % n === n - 1 : at === 0
        if ((n < 2 || edge) && !parameterHintOpts(view.state).cycle) { hide(); return }
        showModel({ ...model, activeSignature: (at + step + n) % n })
    }

    const showModel = (next: SignatureHelpModel) => {
        if (!next.signatures.length) { hide(); return }
        model = next
        triggered = true
        if (root) root.remove()
        root = renderSignatureHelp(next)
        root.classList.add('cm-tooltip-hover') // 复用定位/阴影壳
        // 点卡片不让编辑器失焦(失焦会关卡)
        root.addEventListener('mousedown', e => e.preventDefault())
        for (const [cls, step] of [['.cm-signature-prev', -1], ['.cm-signature-next', 1]] as const) {
            root.querySelector(cls)?.addEventListener('click', e => {
                e.preventDefault()
                e.stopPropagation()
                cycle(step)
            })
        }
        view.dom.appendChild(root)
        place(root)
    }

    const query = async (trigger: { kind: 'invoke' | 'char' | 'content', char: string | null }) => {
        const my = ++seq
        // Monaco doTrigger:只有卡已显示或上一个请求还在飞才算 retrigger;
        // 首次字符触发按 characterTyped 问(TS 只认光标前紧挨着的触发字符)
        const isRetrigger = !!model || requesting
        requesting = true
        const pos = view.state.selection.main.head
        // 记下发请求时的文档与光标:回来时不一样(又打了字/动了光标)就丢,不拿旧位置去开新卡
        const doc0 = view.state.doc
        session.update(materializeDoc(view.state))
        let items: import('typescript').SignatureHelpItems | undefined
        try {
            items = await session.service().getSignatureHelpItems(session.fileName, pos, {
                triggerReason: tsTriggerReason(trigger.kind, trigger.char, isRetrigger),
            }) ?? undefined
        } catch {
            items = undefined
        }
        if (my !== seq) return
        requesting = false
        // 文档或光标已变:这一次作废。若仍处于触发态,变更时的 trigger 已排了新一轮请求
        if (view.state.doc !== doc0 || view.state.selection.main.head !== pos) return
        if (!items || !items.items.length) {
            hide()
            return
        }
        showModel(signatureHelpFromItems(items))
    }

    const trigger = (t: { kind: 'invoke' | 'char' | 'content', char: string | null }, ms: number) => {
        if (!pending || t.kind === 'invoke' || t.kind === 'char') pending = t
        triggered = true
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            const t2 = pending ?? t
            pending = null
            void query(t2)
        }, ms)
    }

    // Monaco ParameterHintsModel.DEFAULT_DELAY:打字、内容变化、光标移动都 120ms 后再问(显式触发 0)
    let wasEnabled = parameterHintOpts(view.state).enabled
    const offTr = view.onTransaction((tr) => {
        // parameterHints.enabled 在运行中被关掉:收起已开着的提示(Monaco ParameterHintsModel.enabled setter → cancel)
        const enabledNow = parameterHintOpts(view.state).enabled
        if (wasEnabled && !enabledNow && triggered) hide()
        wasEnabled = enabledNow
        if (!tr.docChanged) {
            if (!tr.selection) return
            // 鼠标点别处:关(Monaco onCursorChange source==='mouse');键盘移动:已打开就重问
            if (tr.isUserEvent('select.pointer')) { if (triggered) hide(); return }
            if (triggered) trigger({ kind: 'content', char: null }, 120)
            return
        }
        // enabled:false 只关"打字自动弹";显式触发(editor.action.triggerParameterHints)不受影响,已开着的照常随内容刷新
        const ch = enabledNow || triggered ? signatureTriggerChar(tr, triggered) : null
        if (ch && (enabledNow || triggered)) {
            trigger({ kind: 'char', char: ch }, 120)
            return
        }
        if (triggered) trigger({ kind: 'content', char: null }, 120)
    })

    const completionOpen = () => peekSuggestUi(view)?.state.open === true

    const onKey = (e: KeyboardEvent) => {
        if (!triggered || !model) return
        if (e.key === 'Escape') {
            // 补全开着时 Escape 先关补全(Monaco 补全优先)
            if (completionOpen()) return
            e.preventDefault()
            e.stopPropagation()
            hide()
            return
        }
        // ↑/↓ 切重载:只在多个签名时(Monaco MultipleSignatures 前置条件,cycle 默认开);补全开着让给补全
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.metaKey && !e.ctrlKey
            && model.signatures.length > 1 && !completionOpen()) {
            e.preventDefault()
            e.stopPropagation()
            cycle(e.key === 'ArrowDown' ? 1 : -1)
        }
    }
    view.contentDOM.addEventListener('keydown', onKey, true)

    // 失焦关闭(Monaco onDidBlurEditorWidget → cancel)
    const onBlur = () => { if (triggered) hide() }
    view.contentDOM.addEventListener('blur', onBlur)

    const onScroll = () => { if (model && root) place(root) }
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })

    // 显式触发挂到 view 供 keymap: (view as any) 避免污染类型 —— 用自定义事件
    const onExplicit = () => { trigger({ kind: 'invoke', char: null }, 0) }
    view.dom.addEventListener('lite-monaco-signature-help', onExplicit)

    return () => {
        offTr()
        view.contentDOM.removeEventListener('keydown', onKey, true)
        view.contentDOM.removeEventListener('blur', onBlur)
        view.scrollDOM.removeEventListener('scroll', onScroll)
        view.dom.removeEventListener('lite-monaco-signature-help', onExplicit)
        hide()
    }
}

/** keymap 用:显式打开参数提示 */
export function triggerSignatureHelp(view: EditorView): boolean {
    view.dom.dispatchEvent(new Event('lite-monaco-signature-help'))
    return true
}
