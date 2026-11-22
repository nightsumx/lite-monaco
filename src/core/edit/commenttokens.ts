// 语言注释符(行注释 / 块注释)。由 liteMonaco() 按语言配置;未配置时按 C 系 `//` + `/* */`。
// ⌘/、⇧⌥A、回车的 JSDoc 续行规则都读这里。

import type { EditorState } from '../model/state'
import type { Rope } from '../model/rope'
import { Facet } from '../model/state'

export interface CommentTokens {
    line?: string
    /** 行注释符一律贴行首(lineComment: { comment, noIndent: true }) */
    noIndent?: boolean
    block?: { open: string, close: string }
    /** 语言配置里明确没有注释符(setLanguageConfiguration 给了配置但没写 comments):行 / 块注释命令都不动作,不退回 C 系 */
    none?: boolean
}

export const commentTokensFacet = Facet.define<CommentTokens, CommentTokens>({
    combine: vs => vs.length ? { ...vs[vs.length - 1] } : {},
})

export function getCommentTokens(state: EditorState): CommentTokens {
    // combine 已折叠为单值
    const t = state.facet(commentTokensFacet)
    if (t?.none) return {}
    if (t && (t.line || t.block)) return t
    return { line: '//', block: { open: '/*', close: '*/' } }
}

// —— 内嵌语言(Monaco model.getLanguageIdAtPosition:同一篇文档不同位置不同语言,JSX 里的标签体等)——
// lite-monaco 一个编辑器一种语言;宿主有内嵌语言来源(语法树 / 外部 tokenizer)时登记一下:doc → 位置 → 那里的注释符。
// 注释命令按每个选区起始行行首的语言取注释符(Monaco LineCommentCommand:getLanguageIdAtPosition(startLine, 1))。
export type CommentTokensSource = (doc: Rope) => ((pos: number) => CommentTokens | undefined) | undefined
const tokenSources = new WeakMap<object, CommentTokensSource>()

export function setCommentTokensSource(owner: object, source: CommentTokensSource | null): void {
    if (source) tokenSources.set(owner, source)
    else tokenSources.delete(owner)
}

/** owner(EditorView)在 pos 处的注释符:先问内嵌语言来源,没有 / 没给就用整个编辑器的语言 */
export function commentTokensAt(owner: { state: EditorState }, pos: number): CommentTokens {
    const at = tokenSources.get(owner)?.(owner.state.doc)?.(pos)
    if (at) return at.none ? {} : at
    return getCommentTokens(owner.state)
}
