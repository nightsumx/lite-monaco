// 词距(移植自 VS Code editor/contrib/suggest/browser/wordDistance.ts)。
//
// suggest.localityBonus 的数据来源:光标所在的括号作用域里出现过哪些词、各在哪;补全项 label 命中某个词时,
// 距离 = 该词最近一次出现与光标之间隔了几层括号块(越近越小)。关键字与没出现过的词给大常量,排在最后。
// 取词范围这一步经 service 抽象(Monaco 在 Web Worker 里扫文档),缺 service / 不支持就退回 WordDistance.None。
import type { IPosition, IRange } from '../api/position'
import { Position, Range } from '../api/position'
import type { LiteMonacoEditor } from '../api/types'
import { BracketSelectionRangeProvider } from './selectionranges'
import { CompletionItemKind } from './providers'

/** 取一段范围里的词表(Monaco IEditorWorkerService 里词距用到的那两个方法) */
export interface WordRangeService {
    canComputeWordRanges(resource: unknown): boolean
    computeWordRanges(resource: unknown, range: IRange): Promise<{ [word: string]: IRange[] } | null | undefined>
}

/** 与 Monaco languages.CompletionItem 的交集:只要 kind 与 label */
export interface WordDistanceItem { kind: number, label: string | { label: string } }

function binarySearch<T>(array: ReadonlyArray<T>, key: T, comparator: (op1: T, op2: T) => number): number {
    let low = 0, high = array.length - 1
    while (low <= high) {
        const mid = ((low + high) / 2) | 0
        const comp = comparator(array[mid], key)
        if (comp < 0) low = mid + 1
        else if (comp > 0) high = mid - 1
        else return mid
    }
    return -(low + 1)
}

export abstract class WordDistance {
    static readonly None: WordDistance = new class extends WordDistance {
        distance() { return 0 }
    }

    static async create(service: WordRangeService, editor: LiteMonacoEditor): Promise<WordDistance> {
        if (!(editor.getOption('suggest') as { localityBonus?: boolean }).localityBonus) return WordDistance.None
        if (!editor.hasModel()) return WordDistance.None

        const model = editor.getModel()!
        const position = editor.getPosition()!
        if (!service.canComputeWordRanges(model.uri)) return WordDistance.None

        const [ranges] = new BracketSelectionRangeProvider().provideSelectionRanges(model as never, [position])
        if (!ranges || ranges.length === 0) return WordDistance.None

        const wordRanges = await service.computeWordRanges(model.uri, ranges[0].range)
        if (!wordRanges) return WordDistance.None

        // 当前正在打的词不算
        const wordUntilPos = model.getWordUntilPosition(position)
        delete wordRanges[wordUntilPos.word]

        const here = new Position(position.lineNumber, position.column)
        return new class extends WordDistance {
            distance(anchor: IPosition, item: WordDistanceItem) {
                if (!here.equals(editor.getPosition()!)) return 0
                if (item.kind === CompletionItemKind.Keyword) return 2 << 20
                const word = typeof item.label === 'string' ? item.label : item.label.label
                const wordLines = wordRanges[word]
                if (!wordLines || wordLines.length === 0) return 2 << 20
                const idx = binarySearch(wordLines, Range.fromPositions(anchor), Range.compareRangesUsingStarts)
                const bestWordRange = idx >= 0 ? wordLines[idx] : wordLines[Math.max(0, ~idx - 1)]
                let blockDistance = ranges.length
                for (const r of ranges) {
                    if (!Range.containsRange(r.range, bestWordRange)) break
                    blockDistance -= 1
                }
                return blockDistance
            }
        }
    }

    abstract distance(anchor: IPosition, suggestion: WordDistanceItem): number
}
