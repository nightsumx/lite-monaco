// 参数提示(provider 驱动):ParameterHintsModel 的状态变化 → 签名卡。
//
// 与 tssignature.ts 的区别:那个是 TS 语言服务专用的内置会话(自己带状态机);这里走通用的 registerSignatureHelpProvider 协议,
// 任何语言都能用。卡片 DOM / 定位 / 样式复用 TS 那套(renderSignatureHelp / placeSignatureCard),只换数据来源。
// TS 编辑器已经有内置会话,不再装这一份(避免同一光标两张卡)。
import type { LiteMonacoEditor } from './types'
import type { SignatureHelp, SignatureInformation } from '../lang/signaturehelp'
import { ParameterHintsModel, SignatureHelpTriggerKind } from '../lang/signaturehelp'
import { renderSignatureHelp, placeSignatureCard, type SignatureHelpModel } from '../lang/tssignature'

type Part = import('typescript').SymbolDisplayPart
const text = (s: string): Part[] => [{ text: s, kind: 'text' }]
const docText = (d: string | { value: string } | undefined): string => (d === undefined ? '' : typeof d === 'string' ? d : d.value)

function toCardModel(h: SignatureHelp): SignatureHelpModel {
    const signatures = h.signatures.map((s: SignatureInformation) => ({
        label: s.label,
        parts: text(s.label),
        params: s.parameters.map(p => {
            const label = typeof p.label === 'string' ? p.label : s.label.substring(p.label[0], p.label[1])
            const doc = docText(p.documentation)
            return { label, parts: text(label), documentation: doc ? text(doc) : undefined }
        }),
        documentation: docText(s.documentation) ? text(docText(s.documentation)) : undefined,
    }))
    const active = h.signatures[h.activeSignature]
    return { signatures, activeSignature: h.activeSignature, activeParameter: active?.activeParameter ?? h.activeParameter }
}

/** 给编辑器装一份 provider 驱动的参数提示;返回卸载函数 */
export function installProviderParameterHints(editor: LiteMonacoEditor): () => void {
    const model = new ParameterHintsModel(editor)
    let root: HTMLElement | null = null
    let hints: SignatureHelp | undefined

    const hide = () => { hints = undefined; root?.remove(); root = null }
    const show = (h: SignatureHelp) => {
        hints = h
        root?.remove()
        root = renderSignatureHelp(toCardModel(h))
        root.classList.add('cm-tooltip-hover') // 复用定位 / 阴影壳
        // 点卡片不让编辑器失焦(失焦会关卡)
        root.addEventListener('mousedown', e => e.preventDefault())
        for (const [cls, step] of [['.cm-signature-prev', -1], ['.cm-signature-next', 1]] as const) {
            root.querySelector(cls)?.addEventListener('click', e => {
                e.preventDefault()
                e.stopPropagation()
                if (step < 0) model.previous(); else model.next()
            })
        }
        editor.dom.appendChild(root)
        placeSignatureCard(editor, root)
    }
    const sub = model.onChangedHints(h => { if (h) show(h); else hide() })

    const onKey = (e: KeyboardEvent) => {
        const mod = e.metaKey || e.ctrlKey
        if (mod && e.shiftKey && e.code === 'Space') {
            e.preventDefault()
            model.trigger({ triggerKind: SignatureHelpTriggerKind.Invoke }, 0)
            return
        }
        if (!hints) return
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); model.cancel(); return }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !mod && !e.altKey && hints.signatures.length > 1) {
            e.preventDefault()
            e.stopPropagation()
            if (e.key === 'ArrowDown') model.next(); else model.previous()
        }
    }
    editor.contentDOM.addEventListener('keydown', onKey, true)
    const onExplicit = () => model.trigger({ triggerKind: SignatureHelpTriggerKind.Invoke }, 0)
    editor.dom.addEventListener('lite-monaco-signature-help', onExplicit)
    const onScroll = () => { if (root) placeSignatureCard(editor, root) }
    editor.scrollDOM.addEventListener('scroll', onScroll, { passive: true })

    return () => {
        editor.contentDOM.removeEventListener('keydown', onKey, true)
        editor.dom.removeEventListener('lite-monaco-signature-help', onExplicit)
        editor.scrollDOM.removeEventListener('scroll', onScroll)
        sub.dispose()
        model.dispose()
        hide()
    }
}

/** 编辑器级装配(宿主在编辑器 API 就绪后调用,微任务延迟与 installLinkedEditing 同理) */
export function installParameterHints(editor: LiteMonacoEditor): void {
    queueMicrotask(() => {
        if ((editor as unknown as { destroyed?: boolean }).destroyed) return
        editor.onDestroy(installProviderParameterHints(editor))
    })
}
