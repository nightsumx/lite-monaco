// indentationRules 参与的自动缩进,逐条照 Monaco 0.52 common/languages/autoIndent.js(getInheritIndentForLine /
// getIndentForEnter / getIndentActionForType)。
//
// 只在 autoIndent = 'full' 时生效。Monaco standalone 的默认是 'advanced'(editor.api.js 把 EditorOptions.autoIndent
// 的默认值改成 Advanced),这时规则只给 Reindent Lines 用,回车 / 打字都不看;lite-monaco 默认也是 'advanced'。
// 宿主要 VS Code 桌面那样的行为,配 autoIndentFacet.of('full')。
// 粘贴时的 AutoIndentOnPaste 没做:Monaco standalone 里它按 BeforeFirstInteraction 懒建,构造时不挂 onDidPaste,
// 只有之后改过编辑器配置 / 换过 model 才挂上 —— 建编辑器时就给 'full' 也不会生效(对照页实测,见 FIX 报告)。
//
// 判断规则前,行里字符串 / 注释 / 正则 token 中的括号先剥掉(IndentationLineProcessor),见 indent.ts indentRuleLines。
// 只有一种语言,不管 Monaco 的嵌入语言边界(getLanguageIdAtPosition)。

import type { EditorState } from '../model/state'
import { Facet } from '../model/state'
import { AutoIndent, autoIndentLevel } from './editoptions'

export interface IndentationRules {
    increaseIndentPattern?: RegExp
    decreaseIndentPattern?: RegExp
    indentNextLinePattern?: RegExp
    unIndentedLinePattern?: RegExp
}

/** 语言的 indentationRules(Monaco LanguageConfiguration.indentationRules)。lite-monaco 自带的语言都不配(同 Monaco standalone)。 */
export const indentRulesFacet = Facet.define<IndentationRules, IndentationRules | undefined>({ combine: vs => vs[0] })

/** Monaco editor.autoIndent 里 lite-monaco 支持的两档:'advanced'(默认,同 Monaco standalone)/ 'full'(回车、打字也套 indentationRules)。 */
export type AutoIndentStrategy = 'advanced' | 'full'
// 显式覆盖;没设就读选项 autoIndent('none'|'keep'|'brackets'|'advanced'|'full',见 editoptions.ts autoIndentLevel)
export const autoIndentFacet = Facet.define<AutoIndentStrategy, AutoIndentStrategy | undefined>({ combine: vs => vs[0] })

/** autoIndent = 'full' 且配了规则时返回规则,否则 null(Monaco 各函数开头的 autoIndent < Full 判断)。 */
export function fullIndentRules(state: EditorState): IndentationRules | null {
    const f = state.facet(autoIndentFacet)
    if (f ? f !== 'full' : autoIndentLevel(state) < AutoIndent.Full) return null
    return state.facet(indentRulesFacet) ?? null
}

export function testRule(re: RegExp | undefined, text: string): boolean {
    if (!re) return false
    re.lastIndex = 0
    return re.test(text)
}

function leadingWhitespace(text: string): string {
    let i = 0
    while (i < text.length && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++
    return text.slice(0, i)
}

// —— ShiftCommand.shiftIndent / unshiftIndent(对一段纯缩进,column = 长度 + 1)——

export interface ShiftConfig { tabSize: number, indentSize: number, insertSpaces: boolean }

function visibleWidth(indent: string, tabSize: number): number {
    let v = 0
    for (let i = 0; i < indent.length; i++) v = indent.charCodeAt(i) === 9 ? v + tabSize - (v % tabSize) : v + 1
    return v
}

export function shiftIndentation(indent: string, cfg: ShiftConfig): string {
    const v = visibleWidth(indent, cfg.tabSize)
    if (cfg.insertSpaces) return ' '.repeat(v - (v % cfg.indentSize) + cfg.indentSize)
    return '\t'.repeat((v - (v % cfg.tabSize) + cfg.tabSize) / cfg.tabSize)
}

export function unshiftIndentation(indent: string, cfg: ShiftConfig): string {
    const v = visibleWidth(indent, cfg.tabSize)
    if (cfg.insertSpaces) return ' '.repeat(Math.max(0, v - 1 - ((v - 1) % cfg.indentSize)))
    return '\t'.repeat(Math.max(0, v - 1 - ((v - 1) % cfg.tabSize)) / cfg.tabSize)
}

// —— 规则要看的行 ——

/** Monaco 的 model / virtualModel:raw = getLineContent,processed = 剥掉不算的括号后的行(ProcessedIndentRulesSupport 用)。 */
export interface RuleModel {
    raw(n: number): string
    processed(n: number): string
}

export interface InheritIndent { indentation: string, indent: boolean, line?: number }

// getPrecedingValidLine:往上找第一行不是空白、不匹配 unIndentedLinePattern 的;找不到 -1
function precedingValidLine(rules: IndentationRules, m: RuleModel, lineNumber: number): number {
    for (let n = lineNumber - 1; n >= 1; n--) {
        const text = m.raw(n)
        if (testRule(rules.unIndentedLinePattern, m.processed(n)) || /^\s*$/.test(text)) continue
        return n
    }
    return -1
}

/**
 * getInheritIndentForLine:按上面的行推第 lineNumber 行该继承的缩进(还没看本行要不要回缩)。
 * indent = true 表示要在 indentation 上再加一级。honorIntentionalIndent = false 时一直往上找到「不是临时缩进」的那行。
 */
export function inheritIndentForLine(rules: IndentationRules, m: RuleModel, lineNumber: number, honorIntentionalIndent = true): InheritIndent | null {
    if (lineNumber <= 1) return { indentation: '', indent: false }
    // 上面全是空行(长度为 0)→ 不缩进
    for (let p = lineNumber - 1; p > 0; p--) {
        if (m.raw(p) !== '') break
        if (p === 1) return { indentation: '', indent: false }
    }
    const prec = precedingValidLine(rules, m, lineNumber)
    if (prec < 0) return null
    const inc = (n: number) => testRule(rules.increaseIndentPattern, m.processed(n))
    const dec = (n: number) => testRule(rules.decreaseIndentPattern, m.processed(n))
    const next = (n: number) => testRule(rules.indentNextLinePattern, m.processed(n))
    const lead = (n: number) => leadingWhitespace(m.raw(n))
    if (inc(prec) || next(prec)) return { indentation: lead(prec), indent: true, line: prec }
    if (dec(prec)) return { indentation: lead(prec), indent: false, line: prec }
    if (prec === 1) return { indentation: lead(1), indent: false, line: 1 }
    // 上上一行只匹配 indentNextLine(不带 increase / decrease):prec 是临时缩进,回到那串 indentNextLine 的头一行
    const previousLine = prec - 1
    const raw = m.raw(previousLine)
    if (!testRule(rules.increaseIndentPattern, raw) && !testRule(rules.decreaseIndentPattern, raw) && testRule(rules.indentNextLinePattern, raw)) {
        let stopLine = 0
        for (let i = previousLine - 1; i > 0; i--) {
            if (next(i)) continue
            stopLine = i
            break
        }
        return { indentation: lead(stopLine + 1), indent: false, line: stopLine + 1 }
    }
    if (honorIntentionalIndent) return { indentation: lead(prec), indent: false, line: prec }
    for (let i = prec; i > 0; i--) {
        if (inc(i)) return { indentation: lead(i), indent: true, line: i }
        if (next(i)) {
            // Monaco 原样:内层循环判断的是 i 而不是 j(恒为真),stopLine 总是 0
            let stopLine = 0
            for (let j = i - 1; j > 0; j--) {
                if (next(i)) continue
                stopLine = j
                break
            }
            return { indentation: lead(stopLine + 1), indent: false, line: stopLine + 1 }
        }
        if (dec(i)) return { indentation: lead(i), indent: false, line: i }
    }
    return { indentation: lead(1), indent: false, line: 1 }
}

/**
 * getIndentForEnter:回车后新行的缩进(onEnter 规则 / 括号都没命中时才走这里)。
 * before = 光标所在行光标前的文本、after = 选区末尾到行尾,都已剥掉不算的括号;lines = 原文的 RuleModel。
 */
export function indentForEnter(rules: IndentationRules, lines: RuleModel, lineNumber: number,
    before: string, after: string, cfg: ShiftConfig): { beforeEnter: string, afterEnter: string } {
    const beforeEnter = leadingWhitespace(before)
    // 虚拟 model:光标所在行换成光标前那段
    const vm: RuleModel = {
        raw: n => n === lineNumber ? before : lines.raw(n),
        processed: n => n === lineNumber ? before : lines.processed(n),
    }
    const r = inheritIndentForLine(rules, vm, lineNumber + 1)
    if (!r) return { beforeEnter, afterEnter: beforeEnter }
    let afterEnter = r.indentation
    if (r.indent) afterEnter = shiftIndentation(afterEnter, cfg)
    if (testRule(rules.decreaseIndentPattern, after)) afterEnter = unshiftIndentation(afterEnter, cfg)
    return { beforeEnter, afterEnter }
}

/**
 * getIndentActionForType:打下 ch 后本行该有的缩进;不用调整返 null。
 *   1. 打之前本行不匹配 decreaseIndentPattern、打之后匹配(行首敲 `}`)→ 按上面的行重算并回缩一级;
 *   2. 上一行匹配 indentNextLinePattern(`if (a)`)、本行打完匹配 increaseIndentPattern,且 ch 是自动配对的开符、
 *      是本行第一个非空白字符、本行缩进正好是推出来的那一级 → 回到 if 那一层(`{` 跟 if 对齐)。
 */
export function indentActionForType(rules: IndentationRules, lines: RuleModel, lineNumber: number,
    before: string, after: string, ch: string, cfg: ShiftConfig, isAutoClosingOpen: boolean): string | null {
    const around = before + after
    const withCh = before + ch + after
    if (!testRule(rules.decreaseIndentPattern, around) && testRule(rules.decreaseIndentPattern, withCh)) {
        const r = inheritIndentForLine(rules, lines, lineNumber, false)
        if (!r) return null
        return r.indent ? r.indentation : unshiftIndentation(r.indentation, cfg)
    }
    if (lineNumber > 1 && testRule(rules.indentNextLinePattern, lines.raw(lineNumber - 1)) && testRule(rules.increaseIndentPattern, withCh)) {
        const inherited = inheritIndentForLine(rules, lines, lineNumber, false)?.indentation
        if (inherited !== undefined) {
            const actual = leadingWhitespace(lines.raw(lineNumber))
            if (shiftIndentation(inherited, cfg) === actual && /^\s*$/.test(around) && isAutoClosingOpen) return inherited
        }
    }
    return null
}
