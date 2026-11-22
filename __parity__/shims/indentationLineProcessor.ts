// Monaco IndentationContextProcessor / ProcessedIndentRulesSupport → lite-monaco core:
//   getProcessedTokenContextAroundRange → core enterContext(把字符串/注释/正则里的括号剥掉后的 光标前 / 光标后 / 上一行)
//   ProcessedIndentRulesSupport.shouldXxx → core indentRuleLines(处理后的行)+ testRule(规则正则)
// 返回值里只有 getLineContent()(测试只读它)。
import { enterContext } from '../../src/core/edit/enter'
import { bracketSkip } from '../../src/core/edit/brackets'
import { indentRuleLines } from '../../src/core/edit/indent'
import { testRule } from '../../src/core/edit/autoindent'

const viewOf = (model: any) => model.attachedView ?? model
const tokens = (s: string) => ({ getLineContent: () => s })

export class IndentationContextProcessor {
    constructor(private readonly model: any, _svc?: unknown) {}
    getProcessedTokenContextAroundRange(range: any) {
        const view = viewOf(this.model)
        const doc = view.state.doc
        const at = (line: number, col: number) => doc.line(line).from + col - 1
        const from = at(range.startLineNumber, range.startColumn)
        const to = range.isEmpty() ? from : at(range.endLineNumber, range.endColumn)
        const c = enterContext(doc, from, to, bracketSkip(view, doc))
        return { beforeRangeProcessedTokens: tokens(c.before), afterRangeProcessedTokens: tokens(c.after), previousLineProcessedTokens: tokens(c.previousLine) }
    }
}

export class ProcessedIndentRulesSupport {
    constructor(private readonly model: any, private readonly rules: any, _svc?: unknown) {}
    private line(n: number, indent?: string): string {
        const view = viewOf(this.model)
        return indentRuleLines(view, view.state.doc).text(n, indent)
    }
    shouldIncrease(n: number, indent?: string) { return testRule(this.rules.increaseIndentPattern, this.line(n, indent)) }
    shouldDecrease(n: number, indent?: string) { return testRule(this.rules.decreaseIndentPattern, this.line(n, indent)) }
    shouldIgnore(n: number, indent?: string) { return testRule(this.rules.unIndentedLinePattern, this.line(n, indent)) }
    shouldIndentNextLine(n: number, indent?: string) { return testRule(this.rules.indentNextLinePattern, this.line(n, indent)) }
}
