// Monaco common/viewLayout/lineHeights(LineHeightsManager)→ lite-monaco 真编辑器。
// 行高由装饰 options.lineHeight 给(api/decorations → core heightmap),几何读 editor.getTop/BottomForLineNumber;
// 行的插入 / 删除就是对 model 的真实编辑。垫片只做形状翻译:
//   - 管理器按「行号」编址、文档大小无上限 → 按需把 model 补到足够多的空行
//   - Monaco 的 view 行区间 [start,end] → 每行一条起点装饰(lite-monaco 与 Monaco 一样,行高只作用在装饰起点所在行)
//   - insertOrChange 先攒着,commit 才生效(Monaco 的批处理协议)
import { createEditor } from '../../../../src/api/create'
import { createModel } from '../../../../src/api/model'

export interface ICustomLineHeightData {
    readonly decorationId: string
    readonly startLineNumber: number
    readonly endLineNumber: number
    readonly lineHeight: number
}

const fakeHighlighter = {
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text', 'plaintext'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as never

export class LineHeightsManager {
    private readonly model = createModel('')
    private readonly editor: any
    private readonly parent = document.createElement('div')
    private readonly real = new Map<string, string[]>() // manager 的 decorationId → 真装饰 id
    private pending: { id: string, line: number, height: number }[] = []
    private _default: number

    constructor(defaultLineHeight: number, data: ICustomLineHeightData[]) {
        this._default = defaultLineHeight
        document.body.appendChild(this.parent)
        this.editor = createEditor(this.parent, {
            model: this.model as never, highlighter: fakeHighlighter, lineHeight: defaultLineHeight,
            features: { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, codeActions: false, stickyScroll: false },
        } as never)
        this.syncLineHeight()
        for (const d of data) this.insertOrChangeCustomLineHeight(d.decorationId, d.startLineNumber, d.endLineNumber, d.lineHeight)
        if (data.length) this.commit()
    }

    // jsdom 没有布局,量不到行高:把「量到的行高」(= lineHeight 选项)供给 oracle,与真页同口径
    private syncLineHeight() {
        this.editor.oracle.lineHeight = this._default
        this.editor.resetHeights()
    }

    private ensureLines(n: number) {
        const have = this.model.getLineCount()
        if (n > have) this.model.applyEdits([{ range: { startLineNumber: have, startColumn: 1, endLineNumber: have, endColumn: 1 }, text: '\n'.repeat(n - have) }])
    }

    set defaultLineHeight(v: number) { this._default = v; this.editor.updateOptions({ lineHeight: v }); this.syncLineHeight() }
    get defaultLineHeight() { return this._default }

    removeCustomLineHeight(decorationId: string): void {
        const ids = this.real.get(decorationId)
        if (!ids) return
        this.real.delete(decorationId)
        this.editor.deltaDecorations(ids, [])
    }

    insertOrChangeCustomLineHeight(decorationId: string, startLineNumber: number, endLineNumber: number, lineHeight: number): void {
        this.removeCustomLineHeight(decorationId)
        for (let line = startLineNumber; line <= endLineNumber; line++) this.pending.push({ id: decorationId, line, height: lineHeight })
    }

    commit(): void {
        for (const p of this.pending) {
            this.ensureLines(p.line)
            const [id] = this.editor.deltaDecorations([], [{
                range: { startLineNumber: p.line, startColumn: 1, endLineNumber: p.line, endColumn: 1 },
                options: { description: 'line-height', lineHeight: p.height },
            }])
            this.real.set(p.id, [...(this.real.get(p.id) ?? []), id])
        }
        this.pending = []
    }

    heightForLineNumber(lineNumber: number): number {
        this.ensureLines(lineNumber)
        return this.editor.getBottomForLineNumber(lineNumber) - this.editor.getTopForLineNumber(lineNumber)
    }

    getAccumulatedLineHeightsIncludingLineNumber(lineNumber: number): number {
        this.ensureLines(lineNumber)
        return this.editor.getBottomForLineNumber(lineNumber)
    }

    onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
        this.ensureLines(toLineNumber + 1)
        this.model.applyEdits([{ range: { startLineNumber: fromLineNumber, startColumn: 1, endLineNumber: toLineNumber + 1, endColumn: 1 }, text: '' }])
    }

    onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
        this.ensureLines(fromLineNumber)
        this.model.applyEdits([{ range: { startLineNumber: fromLineNumber, startColumn: 1, endLineNumber: fromLineNumber, endColumn: 1 }, text: '\n'.repeat(toLineNumber - fromLineNumber + 1) }])
    }
}
