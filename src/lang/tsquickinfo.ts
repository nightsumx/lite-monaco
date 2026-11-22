// TS 语义 hover 源 —— 与补全共享 getTSService(含全量 lib)。

import type { HoverSource } from '../core/feature/hover'
import { getTSService } from './tsservice'
import type { TsAsyncService } from './tsprotocol'
import type { TSServiceOptions } from './tsservice'
import { materializeDoc } from '../core/perf'
import { renderMarkdown, type MarkdownOptions } from './tsmarkdown'

export type TSQuickInfoOptions = TSServiceOptions

export { bumpVersion } from './tsservice'

type Part = import('typescript').SymbolDisplayPart

function renderParts(target: HTMLElement, parts: readonly Part[] | undefined) {
    for (const p of parts ?? []) {
        const span = document.createElement('span')
        span.className = `cm-qi-${p.kind}`
        span.textContent = p.text
        target.appendChild(span)
    }
}

/** Monaco displayPartsToString:各 part.text 直接拼接({@link X} 原样保留,Monaco 0.52 的 TS hover 不解析链接) */
export function docPartsToMarkdown(parts: readonly Part[] | undefined): string {
    return (parts ?? []).map(p => p.text).join('')
}

/** Monaco tagToString:`*@param*\`a\` — 说明`;其余 part 按空格拼(所以 {@link X} 会变成「{@link  X }」,同 Monaco) */
export function tagToMarkdown(tag: import('typescript').JSDocTagInfo): string {
    let label = `*@${tag.name}*`
    if (tag.name === 'param' && tag.text) {
        const [pname, ...rest] = tag.text
        label += `\`${pname.text}\``
        if (rest.length > 0) label += ` \u2014 ${rest.map(r => r.text).join(' ')}`
    }
    else if (Array.isArray(tag.text)) label += ` \u2014 ${tag.text.map(r => r.text).join(' ')}`
    else if (tag.text) label += ` \u2014 ${tag.text as unknown as string}`
    return label
}

export type QuickInfoRenderOptions = MarkdownOptions

/**
 * QuickInfo → DOM。对齐 Monaco QuickInfoAdapter.provideHover:签名一块;文档 + 标签拼成一份 markdown
 * (documentation + '\n\n' + tags.map(tagToString).join('  \n\n'))一起渲染,所以每个 @tag 是一个段落、
 * 段距和正文一样,多行说明是段内软换行。标签段落补上 class(.cm-quickinfo-tag / .cm-qi-tagname / .cm-qi-paramname)供主题用。
 */
export function renderQuickInfo(qi: import('typescript').QuickInfo, opts: QuickInfoRenderOptions = {}): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'cm-quickinfo'
    const sig = document.createElement('div')
    sig.className = 'cm-quickinfo-sig'
    renderParts(sig, qi.displayParts)
    // @deprecated → 签名删除线(CSS 由主题给 .cm-quickinfo-deprecated)
    if (qi.tags?.some(t => t.name === 'deprecated')) sig.classList.add('cm-quickinfo-deprecated')
    dom.appendChild(sig)
    const tags = qi.tags?.length ? qi.tags.map(tagToMarkdown).join('  \n\n') : ''
    const md = docPartsToMarkdown(qi.documentation) + (tags ? '\n\n' + tags : '')
    if (md.trim()) {
        const jsdoc = renderMarkdown(md, opts)
        jsdoc.classList.add('cm-quickinfo-doc')
        for (const p of jsdoc.children) {
            const em = p.firstElementChild
            if (p.tagName !== 'P' || !em || em !== p.firstChild || em.tagName !== 'EM' || !/^@\S+$/.test(em.textContent ?? '')) continue
            p.classList.add('cm-quickinfo-tag')
            em.classList.add('cm-qi-tagname')
            if (em.textContent === '@param' && em.nextSibling instanceof HTMLElement && em.nextSibling.tagName === 'CODE') em.nextSibling.classList.add('cm-qi-paramname')
        }
        dom.appendChild(jsdoc)
    }
    return dom
}

export function tsQuickInfoSource(opts: TSQuickInfoOptions, render: QuickInfoRenderOptions = {}): HoverSource {
    const session = getTSService(opts)

    const queryAt = async (svc: TsAsyncService, pos: number) => {
        const qi = await svc.getQuickInfoAtPosition(session.fileName, pos)
        if (!qi || !qi.displayParts || !qi.displayParts.length) return null
        return {
            pos: qi.textSpan.start,
            end: qi.textSpan.start + qi.textSpan.length,
            above: true as const,
            create: () => renderQuickInfo(qi, render),
        }
    }

    return (state, pos) => {
        session.update(materializeDoc(state))
        return queryAt(session.service(), pos)
    }
}
