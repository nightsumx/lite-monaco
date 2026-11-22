// Monaco common/services/editorWebWorker.ts 的 EditorWorker:测试替身(同线程内存里存 model 行,不起 Worker)。
// 取词的行为在 src/lang/wordranges.ts;这里只翻译 $acceptNewModel / $acceptModelChanged / $computeWordRanges 三个入口。
import { computeWordRanges } from '../../src/lang/wordranges'
import { computeHumanReadableDiff, computeMoreMinimalEdits, textualSuggest, wordsOf } from '../../src/lang/minimaledits'
import { createModel } from '../../src/api/model'

interface WorkerModel { lines: string[], EOL: string, versionId: number, mirror?: { version: number, model: ReturnType<typeof createModel> } }

/** Monaco ICommonModel 的翻译:用 lite-monaco 的 ITextModel(getOffsetAt / getPositionAt / getValueInRange)当底层,不在垫片里自己算位置 */
function commonModel(url: string, m: WorkerModel) {
    if (m.mirror?.version !== m.versionId) {
        m.mirror?.model.dispose()
        m.mirror = { version: m.versionId, model: createModel(m.lines.join(m.EOL)) }
    }
    const tm = m.mirror.model
    return {
        uri: { toString: () => url },
        get eol() { return m.EOL },
        getValue: () => tm.getValue(),
        getValueInRange: (r: never) => tm.getValueInRange(r),
        getEOL: () => m.EOL,
        offsetAt: (p: never) => tm.getOffsetAt(p),
        getOffsetAt: (p: never) => tm.getOffsetAt(p),
        positionAt: (o: number) => tm.getPositionAt(o),
        getPositionAt: (o: number) => tm.getPositionAt(o),
        words: (re: RegExp) => wordsOf(m.lines, re),
    }
}

export class EditorWorker {
    private readonly _models = new Map<string, WorkerModel>()
    protected _getModel(url: string) {
        const m = this._models.get(url)
        return m ? commonModel(url, m) : undefined
    }
    $computeMoreMinimalEdits(url: string, edits: never[], pretty: boolean): Promise<unknown[]> {
        const model = this._getModel(url)
        return Promise.resolve(model ? computeMoreMinimalEdits(model, edits, pretty) : edits)
    }
    $computeHumanReadableDiff(url: string, edits: never[], options: never): unknown[] {
        const model = this._getModel(url)
        return model ? computeHumanReadableDiff(model, edits, options) : edits
    }
    $textualSuggest(urls: string[], leadingWord: string | undefined, wordDef: string, wordDefFlags: string): Promise<{ words: string[], duration: number } | null> {
        const lines = urls.map(u => this._models.get(u)?.lines).filter((l): l is string[] => !!l)
        return Promise.resolve(textualSuggest(lines, leadingWord, new RegExp(wordDef, wordDefFlags)))
    }
    $acceptNewModel(data: { url: string, lines: string[], EOL: string, versionId: number }): void {
        this._models.set(data.url, { lines: data.lines.slice(), EOL: data.EOL, versionId: data.versionId })
    }
    $acceptModelChanged(url: string, e: { changes: { range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }, text: string }[], versionId: number }): void {
        const m = this._models.get(url)
        if (!m) return
        const text = m.lines.join('\n')
        const offsetAt = (l: number, c: number) => { let o = 0; for (let i = 0; i < l - 1; i++) o += m.lines[i].length + 1; return o + c - 1 }
        for (const ch of [...e.changes].sort((a, b) => offsetAt(b.range.startLineNumber, b.range.startColumn) - offsetAt(a.range.startLineNumber, a.range.startColumn))) {
            const s = offsetAt(ch.range.startLineNumber, ch.range.startColumn), en = offsetAt(ch.range.endLineNumber, ch.range.endColumn)
            m.lines = (text.slice(0, s) + ch.text + text.slice(en)).split(/\r\n|\r|\n/)
        }
        m.versionId = e.versionId
    }
    $computeWordRanges(url: string, range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }, wordDef: string, wordDefFlags: string): Promise<{ [word: string]: typeof range[] }> {
        const m = this._models.get(url)
        if (!m) return Promise.resolve(Object.create(null))
        return Promise.resolve(computeWordRanges(l => m.lines[l - 1] ?? '', range, new RegExp(wordDef, wordDefFlags)))
    }
}
