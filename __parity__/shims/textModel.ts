// Monaco common/model/textModel:测试只用 TextModel.DEFAULT_CREATION_OPTIONS(createTextModel 的默认入参,值与 Monaco 一致)。
import { createTextModel } from './testTextModel'

// new TextModel(text, languageId, creationOptions, uri) → lite-monaco createModel(返回的就是公开 ITextModel;构造函数返回对象即替换 this)。
export class TextModel {
    constructor(text: string, languageId?: string | null, options?: Record<string, unknown> | null, uri?: unknown) {
        return createTextModel(text, languageId, options, uri) as never
    }
    static DEFAULT_CREATION_OPTIONS = {
        isForSimpleWidget: false, tabSize: 4, indentSize: 4, insertSpaces: true, detectIndentation: false,
        defaultEOL: 1 /* DefaultEndOfLine.LF */, trimAutoWhitespace: true, largeFileOptimizations: true,
        bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false },
    }
}

// Monaco createTextBuffer(text, defaultEOL) → { textBuffer, disposable }:缓冲的读口(EOL / 行 / RTL / 非 ASCII 标志)全部转给 model 的公开方法。
export function createTextBuffer(text: string, _defaultEOL: number) {
    const m = createTextModel(text) as any
    return {
        textBuffer: {
            getEOL: () => m.getEOL() as string,
            getLinesContent: () => m.getLinesContent() as string[],
            // ModelService._computeEdits 读的口:行数 / 行内容 / 行长 / 区间文本
            getLineCount: () => m.getLineCount() as number,
            getLineContent: (n: number) => m.getLineContent(n) as string,
            getLineLength: (n: number) => m.getLineLength(n) as number,
            getValueInRange: (r: unknown, pref?: number) => m.getValueInRange(r, pref) as string,
            mightContainRTL: () => m.mightContainRTL() as boolean,
            mightContainNonBasicASCII: () => m.mightContainNonBasicASCII() as boolean,
        },
        disposable: { dispose: () => m.dispose() },
    }
}
export { ModelDecorationOptions } from '../../src/api/decorations'
// Monaco ModelDecorationInjectedTextOptions.from(options):注入文字选项的补缺省值记录(夹具数据类,无行为)。
export class ModelDecorationInjectedTextOptions {
    static from(o: { content: string, inlineClassName?: string | null, cursorStops?: number | null, [k: string]: unknown }) { return o instanceof ModelDecorationInjectedTextOptions ? o : new ModelDecorationInjectedTextOptions(o) }
    readonly content: string
    readonly inlineClassName: string | null
    readonly cursorStops: number | null
    private constructor(o: { content: string, inlineClassName?: string | null, cursorStops?: number | null }) {
        this.content = o.content || ''
        this.inlineClassName = o.inlineClassName || null
        this.cursorStops = o.cursorStops || null
    }
}

