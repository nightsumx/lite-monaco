// Monaco TextModel.onDidChangeContentOrInjectedText(内部事件:InternalModelContentChangeEvent{ rawContentChangedEvent, contentChangedEvent })
// → lite-monaco 公开的 model.onDidChangeContent。
// 只做翻译:把公开事件的 changes(range/text)+ 事件后的 model 内容,按 Monaco 的 raw 事件词汇(LineChanged / LinesDeleted / LinesInserted / Flush / EOLChanged)重排。
// 被测行为(该不该发事件、changes 是否正确、versionId、isUndoing/isFlush)全部来自 lite-monaco 的 model,这里不判断任何一条。
import {
    InternalModelContentChangeEvent, LineInjectedText, ModelRawContentChangedEvent, ModelRawEOLChanged, ModelRawFlush,
    ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted, type ModelRawChange,
} from '../../../../reference/_vscode-src/src/vs/editor/common/textModelEvents'

const countEol = (s: string) => (s.match(/\r\n|\r|\n/g) ?? []).length

function injectedByLine(m: any): Map<number, LineInjectedText[]> {
    const out = new Map<number, LineInjectedText[]>()
    const decos = (m.getInjectedTextDecorations?.(0) ?? []) as any[]
    for (const t of LineInjectedText.fromDecorations(decos)) (out.get(t.lineNumber) ?? out.set(t.lineNumber, []).get(t.lineNumber)!).push(t)
    return out
}

export function toRawChanges(m: any, e: any): ModelRawChange[] {
    if (e.isFlush) return [new ModelRawFlush()]
    if (e.isEolChange) return [new ModelRawEOLChanged()]
    const injected = injectedByLine(m)
    const newLineCount = m.getLineCount()
    let delta = 0
    for (const c of e.changes) delta += countEol(c.text) - (c.range.endLineNumber - c.range.startLineNumber)
    let lineCount = newLineCount - delta
    const raw: ModelRawChange[] = []
    for (const c of e.changes) {
        const startLine = c.range.startLineNumber, endLine = c.range.endLineNumber
        const deleting = endLine - startLine, inserting = countEol(c.text)
        const editing = Math.min(deleting, inserting)
        const lineDelta = inserting - deleting
        const curStart = newLineCount - lineCount - lineDelta + startLine
        for (let j = editing; j >= 0; j--) raw.push(new ModelRawLineChanged(startLine + j, m.getLineContent(curStart + j), injected.get(curStart + j) ?? null))
        if (editing < deleting) raw.push(new ModelRawLinesDeleted(startLine + editing + 1, endLine))
        if (editing < inserting) {
            const spliceLine = startLine + editing
            const cnt = inserting - editing
            const from = newLineCount - lineCount - cnt + spliceLine + 1
            const lines: string[] = [], inj: (LineInjectedText[] | null)[] = []
            for (let i = 0; i < cnt; i++) { lines[i] = m.getLineContent(from + i); inj[i] = injected.get(from + i) ?? null }
            raw.push(new ModelRawLinesInserted(spliceLine + 1, startLine + inserting, lines, inj))
        }
        lineCount += lineDelta
    }
    return raw
}

const sigOf = (inj: Map<number, LineInjectedText[]>): Map<number, string> => {
    const out = new Map<number, string>()
    for (const [ln, ts] of inj) out.set(ln, ts.map(t => `${t.column}:${t.options.content}`).join('|'))
    return out
}

/**
 * 给 lite-monaco 的 model 挂上 Monaco 内部事件入口(惰性订阅,不碰 model 自己的 emitter 数)。
 * 装饰变化时,逐行比对「这一行的注入文本」前后是否一样,不一样的行发 LineChanged(Monaco:injected text 变了要让视图重排这行);
 * 内容事件里的注入文本变化已经随 raw 事件带出,这里只负责把基线同步。
 */
export function installRawEvents(m: any): void {
    if (m.onDidChangeContentOrInjectedText) return
    m.onDidChangeContentOrInjectedText = (listener: (e: InternalModelContentChangeEvent) => void) => {
        let prev = sigOf(injectedByLine(m))
        let seenText = m.getValue()
        const d1 = m.onDidChangeContent((e: any) => {
            listener(new InternalModelContentChangeEvent(new ModelRawContentChangedEvent(toRawChanges(m, e), e.versionId, e.isUndoing, e.isRedoing), e))
            prev = sigOf(injectedByLine(m))
            seenText = m.getValue()
        })
        const d2 = m.onDidChangeDecorations(() => {
            if (m.getValue() !== seenText) return // 编辑引起的装饰移动:内容事件自己会带出注入文本
            const inj = injectedByLine(m)
            const cur = sigOf(inj)
            const lines = [...new Set([...prev.keys(), ...cur.keys()])].filter(l => prev.get(l) !== cur.get(l) && l <= m.getLineCount()).sort((a, b) => a - b)
            prev = cur
            if (!lines.length) return
            const raw = lines.map(l => new ModelRawLineChanged(l, m.getLineContent(l), inj.get(l) ?? null))
            listener(new InternalModelContentChangeEvent(new ModelRawContentChangedEvent(raw, m.getVersionId(), false, false), null as never))
        })
        return { dispose() { d1.dispose(); d2.dispose() } }
    }
}
