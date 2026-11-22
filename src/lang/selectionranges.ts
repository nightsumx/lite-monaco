// provideSelectionRanges —— 照 Monaco smartSelect.provideSelectionRanges / WordSelectionRangeProvider / BracketSelectionRangeProvider。
// 按 model 取数(语言的 wordPattern、外部注册的 SelectionRangeProvider),编辑器里同步的 smartSelect 走 tssmart.selectionRangesAt。
// 区间算法本体都在 tssmart.ts(bracketSpans / wordSpans / chainSpans),这里只管 model ↔ 偏移 ↔ 行列 的搭接和 provider 汇总。

import type { EditorState } from '../core/model/state'
import { bracketSpans, chainSpans, wordSpans, type SmartSpan } from './tssmart'
import { selectionRangeProvidersFor, type CancellationToken, type IPosition, type IRange, type SelectionRangeM } from './providers'
import type { LanguageFeatureRegistry } from './languagefeatures'

/** 这一层需要 model 的那部分:TextModel 满足(getState 取当前 state) */
export interface SelectionModel {
    getState(): EditorState
    getLanguageId(): string
    getWordAtPosition(position: IPosition): { word: string, startColumn: number, endColumn: number } | null
}

export interface SelectionRangesOptions { selectLeadingAndTrailingWhitespace: boolean, selectSubwords: boolean }

const offsetOf = (s: EditorState, p: IPosition): number => {
    const l = s.doc.line(Math.max(1, Math.min(p.lineNumber, s.doc.lines)))
    return l.from + Math.max(0, Math.min(p.column - 1, l.length))
}
const rangeOf = (s: EditorState, r: SmartSpan): IRange => {
    const a = s.doc.lineAt(r.from), b = s.doc.lineAt(r.to)
    return { startLineNumber: a.number, startColumn: r.from - a.from + 1, endLineNumber: b.number, endColumn: r.to - b.from + 1 }
}
const spanOf = (s: EditorState, r: IRange): SmartSpan => ({ from: offsetOf(s, { lineNumber: r.startLineNumber, column: r.startColumn }), to: offsetOf(s, { lineNumber: r.endLineNumber, column: r.endColumn }) })

type SelectionRangeProviderLike = { provideSelectionRanges(model: never, positions: IPosition[], token: CancellationToken): SelectionRangeM[][] | null | undefined | PromiseLike<SelectionRangeM[][] | null | undefined> }

export class WordSelectionRangeProvider {
    constructor(private readonly selectSubwords = true) { }
    provideSelectionRanges(model: SelectionModel, positions: IPosition[]): SelectionRangeM[][] {
        const s = model.getState()
        return positions.map(p => {
            const pos = offsetOf(s, p)
            const line = s.doc.lineAt(pos)
            // 词取自 model.getWordAtPosition(语言的 wordPattern),列 1 起 → 行内偏移 0 起
            const wordAt = (_t: string, col: number) => {
                const w = model.getWordAtPosition({ lineNumber: line.number, column: col + 1 })
                return w ? { start: w.startColumn - 1, end: w.endColumn - 1 } : null
            }
            return wordSpans(s, pos, wordAt, this.selectSubwords).map(r => ({ range: rangeOf(s, r) }))
        })
    }
}

export class BracketSelectionRangeProvider {
    /** Monaco 左右各扫一轮的时间预算(毫秒) */
    static _maxDuration = 30
    provideSelectionRanges(model: SelectionModel, positions: IPosition[]): SelectionRangeM[][] {
        const s = model.getState()
        return positions.map(p => bracketSpans(s, offsetOf(s, p), undefined, BracketSelectionRangeProvider._maxDuration * 2).map(r => ({ range: rangeOf(s, r) })))
    }
}

/** registry:显式给一张 LanguageFeatureRegistry 就只用它的 provider(Monaco 的签名);不给用全局注册表 */
export async function provideSelectionRanges(model: SelectionModel, positions: IPosition[], options: SelectionRangesOptions, token: CancellationToken, registry?: LanguageFeatureRegistry<SelectionRangeProviderLike>): Promise<IRange[][]> {
    type Any = { provideSelectionRanges(model: never, positions: IPosition[], token: CancellationToken): SelectionRangeM[][] | null | undefined | PromiseLike<SelectionRangeM[][] | null | undefined> }
    const external = registry ? registry.ordered(model as never) : selectionRangeProvidersFor(model.getLanguageId())
    const providers: Any[] = [...external, new WordSelectionRangeProvider(options.selectSubwords)] // 词永远有
    // 没有外部 provider 时补括号
    if (providers.length === 1) providers.unshift(new BracketSelectionRangeProvider())

    const s = model.getState()
    const raw: SmartSpan[][] = positions.map(() => [])
    await Promise.all(providers.map(async p => {
        let all: SelectionRangeM[][] | null | undefined
        try { all = await p.provideSelectionRanges(model as never, positions, token) } catch (e) { console.error(e); return }
        if (!Array.isArray(all) || !all.length || all.length !== positions.length) return
        all.forEach((one, i) => { for (const r of one) if (r && r.range) raw[i].push(spanOf(s, r.range)) })
    }))
    return raw.map((spans, i) => spans.length ? chainSpans(s, offsetOf(s, positions[i]), spans, options.selectLeadingAndTrailingWhitespace).map(r => rangeOf(s, r)) : [])
}
