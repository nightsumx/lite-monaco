// 向一组 provider 要行内补全(移植自 inlineCompletions/browser/model/provideInlineCompletions.ts)。
//   · yieldsToGroupIds 建有向图,去环;被让路的 provider 先问,它给出了「可见的」行内补全就不再问我
//   · 每个 provider 只问一次(按 provider 记忆),结果按「谁先回来谁先出」的顺序产出
//   · 一次结果 = 引用计数的 InlineSuggestionList:取消 / 用完才通知 provider 释放
import { Position, Range } from '../../api/position'
import { SnippetParser, Text } from '../../core/feature/snippetparser'
import { CancellationTokenSource, type CancellationToken } from '../async'
import { DirectedGraph } from './graph'
import { InlineSuggestData, InlineSuggestionList, inlineCompletionIsVisible, type SnippetInfo } from './items'
import { TextReplacement } from './textedit'
import type {
    InlineCompletion, InlineCompletionContextWithUuid, InlineCompletionContextWithoutUuid, InlineCompletions, InlineCompletionsDisposeReason,
    InlineCompletionsProvider, InlineModel, InlineSuggestRequestInfo,
} from './types'
import { emptyArray, prefixedUuid } from './utils'

export interface InlineCompletionProviderResult {
    readonly contextWithUuid: InlineCompletionContextWithUuid
    readonly didAllProvidersReturn: boolean
    readonly lists: AsyncIterable<InlineSuggestionList>
    cancelAndDispose(reason: InlineCompletionsDisposeReason): void
}

export function provideInlineCompletions(
    providers: readonly InlineCompletionsProvider[],
    position: Position,
    model: InlineModel,
    context: InlineCompletionContextWithoutUuid,
    requestInfo: InlineSuggestRequestInfo,
): InlineCompletionProviderResult {
    const cts = new CancellationTokenSource()
    let cancelReason: InlineCompletionsDisposeReason | undefined
    const contextWithUuid: InlineCompletionContextWithUuid = { ...context, requestUuid: prefixedUuid('icr') }
    const defaultReplaceRange = getDefaultRange(position, model)

    const byGroup = new Map<string | undefined, InlineCompletionsProvider[]>()
    for (const p of providers) { const l = byGroup.get(p.groupId); if (l) l.push(p); else byGroup.set(p.groupId, [p]) }
    const yieldsTo = DirectedGraph.from(providers, p => p.yieldsToGroupIds?.flatMap(g => byGroup.get(g) ?? []) ?? [])
    const { foundCycles } = yieldsTo.removeCycles()
    if (foundCycles.length > 0) console.error(new Error('Inline completions: cyclic yield-to dependency detected.'))

    let runningCount = 0
    const memo = new Map<InlineCompletionsProvider, Promise<InlineSuggestionList | undefined>>()
    const queryProvider = (provider: InlineCompletionsProvider): Promise<InlineSuggestionList | undefined> => {
        let p = memo.get(provider)
        if (!p) memo.set(provider, p = runProvider(provider))
        return p
    }
    const runProvider = async (provider: InlineCompletionsProvider): Promise<InlineSuggestionList | undefined> => {
        try {
            runningCount++
            if (cts.token.isCancellationRequested) return undefined

            for (const other of yieldsTo.getOutgoing(provider)) {
                // 图无环,这里不会递归回自己
                const result = await queryProvider(other)
                if (!result) continue
                for (const item of result.inlineSuggestions.items) {
                    if (item.isInlineEdit || (typeof item.insertText !== 'string' && item.insertText !== undefined)) return undefined
                    if (item.insertText !== undefined) {
                        const t = new TextReplacement(item.range ? Range.lift(item.range) : defaultReplaceRange, item.insertText)
                        if (inlineCompletionIsVisible(t, undefined, model, position)) return undefined
                    }
                }
            }

            let result: InlineCompletions | null | undefined
            const startTime = Date.now()
            try { result = await provider.provideInlineCompletions(model, position, contextWithUuid, cts.token) } catch (e) { console.error(e); return undefined }
            const endTime = Date.now()
            if (!result) return undefined

            const data: InlineSuggestData[] = []
            const list = new InlineSuggestionList(result, data, provider)
            list.addRef()
            runWhenCancelled(cts.token, () => list.removeRef(cancelReason))
            if (cts.token.isCancellationRequested) return undefined // list 已释放,不能再把 items 交出去
            for (const item of result.items) data.push(toInlineSuggestData(item, list, defaultReplaceRange, contextWithUuid, requestInfo, { startTime, endTime }))
            return list
        } finally { runningCount-- }
    }

    const all = providers.map(p => queryProvider(p))
    async function* lists(): AsyncGenerator<InlineSuggestionList> {
        const pending = new Map(all.map((p, i) => [i, p.then(v => ({ i, v }))]))
        while (pending.size > 0) {
            const { i, v } = await Promise.race(pending.values())
            pending.delete(i)
            if (v) yield v
        }
    }

    return {
        contextWithUuid,
        get didAllProvidersReturn() { return runningCount === 0 },
        lists: lists(),
        cancelAndDispose(reason) {
            if (cancelReason !== undefined) return
            cancelReason = reason
            cts.dispose(true)
        },
    }
}

/** token 终将取消也不泄漏:取消时调 callback;已取消就立刻调 */
export function runWhenCancelled(token: CancellationToken, callback: () => void): { dispose(): void } {
    if (token.isCancellationRequested) { callback(); return { dispose() { } } }
    const l = token.onCancellationRequested(() => { l.dispose(); callback() })
    return { dispose: () => l.dispose() }
}

/** 缺省替换范围:光标所在词起(没词就光标起)到行尾 */
export function getDefaultRange(position: Position, model: InlineModel): Range {
    const word = model.getWordAtPosition(position)
    const maxColumn = model.getLineMaxColumn(position.lineNumber)
    return word
        ? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn)
        : Range.fromPositions(position, position.with(undefined, maxColumn))
}

function toInlineSuggestData(
    c: InlineCompletion, source: InlineSuggestionList, defaultReplaceRange: Range,
    context: InlineCompletionContextWithUuid, requestInfo: InlineSuggestRequestInfo, providerRequestInfo: { startTime: number, endTime: number },
): InlineSuggestData {
    let insertText: string
    let snippetInfo: SnippetInfo | undefined
    let range = c.range ? Range.lift(c.range) : defaultReplaceRange

    if (typeof c.insertText === 'string') {
        insertText = c.insertText
    } else if (c.insertText === undefined) {
        insertText = ''
        range = new Range(1, 1, 1, 1)
    } else {
        const snippet = new SnippetParser().parse(c.insertText.snippet)
        if (snippet.children.length === 1 && snippet.children[0] instanceof Text) {
            insertText = snippet.children[0].value
        } else {
            insertText = snippet.toString()
            snippetInfo = { snippet: c.insertText.snippet, range }
        }
    }
    return new InlineSuggestData(range, insertText, snippetInfo, c.uri, c.hint, c.additionalTextEdits ?? emptyArray, c, source, context, c.isInlineEdit ?? false, requestInfo, providerRequestInfo, c.correlationId)
}
