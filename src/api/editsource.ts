// 编辑来源(Monaco TextModelEditSource,@internal):内容事件的 detailedReasons / detailedReasonsChangeLengths。
// 一笔事务只有一个原因,覆盖它产出的全部 contentChanges(Monaco 同样一次 applyEdits 一个 reason)。
// 原因由事务的 userEvent 推出:这里只认 Monaco 里有对应来源的那几类,其余落「unknown」。
import type { Transaction } from '../core/model/state'

export type EditSourceMetadata =
    | { readonly source: 'cursor', readonly kind: 'compositionType' | 'type' | 'paste' | 'cut', readonly detailedSource: string | null }
    | { readonly source: 'setValue' | 'eolChange' | 'applyEdits' }
    | { readonly source: 'unknown', readonly name: string | null }

export class TextModelEditSource {
    constructor(readonly metadata: EditSourceMetadata) { }
}

export function editSourceOf(tr: Transaction, kind: { flush: boolean, eolChange: boolean, apiEdit: boolean }): TextModelEditSource {
    if (kind.flush) return new TextModelEditSource({ source: 'setValue' })
    if (kind.eolChange) return new TextModelEditSource({ source: 'eolChange' })
    if (tr.isUserEvent('input.type.compose')) return new TextModelEditSource({ source: 'cursor', kind: 'compositionType', detailedSource: 'keyboard' })
    if (tr.isUserEvent('input.type')) return new TextModelEditSource({ source: 'cursor', kind: 'type', detailedSource: 'keyboard' })
    if (tr.isUserEvent('input.paste')) return new TextModelEditSource({ source: 'cursor', kind: 'paste', detailedSource: 'keyboard' })
    if (tr.isUserEvent('delete.cut')) return new TextModelEditSource({ source: 'cursor', kind: 'cut', detailedSource: 'keyboard' })
    if (kind.apiEdit) return new TextModelEditSource({ source: 'applyEdits' })
    return new TextModelEditSource({ source: 'unknown', name: null })
}
