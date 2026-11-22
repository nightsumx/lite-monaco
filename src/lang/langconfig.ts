// languages.setLanguageConfiguration 接进装配层:把 LanguageConfiguration(src/api/languages.ts 的注册表)翻成 core 的 facet。
//
//   comments.lineComment / blockComment     → commentTokens(⌘/、⇧⌥A、回车的块注释续行);没写 comments = 没有注释符
//   brackets                                → bracketsConfig(括号匹配高亮、跳转到括号、选到括号)+ onEnterConfig.brackets(回车展开 / 缩进)
//   colorizedBracketPairs                   → bracketsConfig.colorized(彩虹括号;没给就用 brackets)
//   autoClosingPairs / surroundingPairs     → closingConfig(自动补闭、过键、退格删对、选区包裹);notIn: 'string' | 'comment'('regex' 词法层没有,忽略)
//                                             没给 autoClosingPairs 就用 brackets,没给 surroundingPairs 就用 autoClosingPairs(同 Monaco)
//   autoCloseBefore                         → closingConfig.autoCloseBefore(引号和括号共用)
//   onEnterRules                            → onEnterConfig.rules(回车:beforeText / afterText / previousLineText 逐条匹配)
//   indentationRules                        → indentRulesFacet(autoIndent = 'full' 时回车 / 打字按它调缩进)
//   folding.markers                         → foldingMarkers.regex(#region 一类标记;整行文本 test)
//   wordPattern                             → model.getWordAtPosition / getWordUntilPosition(src/api/model.ts 读 getWordDefinition)
//
// 语言配置在 Monaco 里是整份替换:设了配置,内置的那份(lite-monaco 对 TS/JS 写死的 doc comment 回车规则、{}[]() 括号、注释符表)就不再生效。
// 没设过配置的语言,下面返回 null,装配层照旧走内置表。
// 改了配置:languages.ts 的 onLanguageConfigApplied 调到这里,对所有当前语言是它的实例 reassemble —— 立刻热生效。

import type { Extension } from '../core/model/state'
import { commentTokensFacet, type CommentTokens } from '../core/edit/commenttokens'
import { foldingMarkers } from '../core/edit/fold'
import { indentRulesFacet } from '../core/edit/autoindent'
import { onEnterConfig, type OnEnterRuleConfig } from '../core/edit/enter'
import { closingConfig } from '../core/edit/closebrackets'
import { bracketsConfig } from '../core/edit/brackets'
import { languageConfigurationFor, onLanguageConfigApplied, type IAutoClosingPair, type IAutoClosingPairConditional, type LanguageConfiguration } from '../api/languages'
import type { Installer, EditorHost } from '../api/context'

const DEFAULT_ENTER_BRACKETS: [string, string][] = [['(', ')'], ['{', '}'], ['[', ']']]

export interface LanguageConfigExtensions {
    /** 同一个 facet 取首个值的(indentRules)放装配列表最前 */
    pre: Extension[]
    /** 取最后一个值的(注释符、折叠标记、括号表…)放在内置的 commentTokens / foldingMarkers 之后 */
    post: Extension[]
}

const cache = new WeakMap<LanguageConfiguration, LanguageConfigExtensions>()

/** 某语言当前生效的配置 → 扩展。没设过配置返回 null */
export function languageConfigExtensions(lang: string): LanguageConfigExtensions | null {
    const cfg = languageConfigurationFor(lang)
    if (!cfg) return null
    let out = cache.get(cfg)
    if (!out) { out = translate(cfg); cache.set(cfg, out) }
    return out
}

const PLAINTEXT_BRACKETS: readonly (readonly [string, string])[] = [['(', ')'], ['[', ']'], ['{', '}']]

/**
 * 自动补闭 / 包裹对(Monaco CharacterPairSupport,纯语义,不带任何缺省):autoClosingPairs 没给就用 brackets(再没有就空),
 * surroundingPairs 没给就同 autoClosingPairs(返回同一个数组引用,调用方可凭引用相等判断「缺省」)。
 */
export function resolveCharacterPairs(cfg: LanguageConfiguration): {
    autoClosingPairs: IAutoClosingPairConditional[]
    surroundingPairs: IAutoClosingPair[]
    autoCloseBefore: string | undefined
} {
    const base: IAutoClosingPairConditional[] = cfg.autoClosingPairs
        ?? (cfg.brackets ?? []).map(([open, close]) => ({ open, close }))
    const doc = cfg.__electricCharacterSupport?.docComment
    const autoClosingPairs = doc ? [...base, { open: doc.open, close: doc.close || '' }] : base
    return { autoClosingPairs, surroundingPairs: cfg.surroundingPairs ?? autoClosingPairs, autoCloseBefore: cfg.autoCloseBefore }
}

/** 语言配置的 comments → core 的注释符;没写 comments(或两种都没有)= undefined */
export function commentTokensOf(cfg: LanguageConfiguration): CommentTokens | undefined {
    const c = cfg.comments
    const lc = c?.lineComment
    const lineToken = typeof lc === 'object' && lc ? lc.comment : lc
    if (!c || !(lineToken || c.blockComment)) return undefined
    return {
        ...(lineToken ? { line: lineToken } : {}),
        ...(typeof lc === 'object' && lc?.noIndent ? { noIndent: true } : {}),
        ...(c.blockComment ? { block: { open: c.blockComment[0], close: c.blockComment[1] } } : {}),
    }
}

function translate(cfg: LanguageConfiguration): LanguageConfigExtensions {
    const pre: Extension[] = []
    const post: Extension[] = []

    // 注释符
    post.push(commentTokensFacet.of(commentTokensOf(cfg) ?? { none: true }))

    // 折叠标记(没写 folding.markers = 没有 region 标记;缩进折叠照旧)
    const m = cfg.folding?.markers
    post.push(foldingMarkers.of(m ? { start: [], end: [], regex: { start: m.start, end: m.end } } : null))

    // 缩进规则
    if (cfg.indentationRules) {
        const r = cfg.indentationRules
        pre.push(indentRulesFacet.of({
            increaseIndentPattern: r.increaseIndentPattern,
            decreaseIndentPattern: r.decreaseIndentPattern,
            ...(r.indentNextLinePattern ? { indentNextLinePattern: r.indentNextLinePattern } : {}),
            ...(r.unIndentedLinePattern ? { unIndentedLinePattern: r.unIndentedLinePattern } : {}),
        }))
    }

    // 回车规则 + 回车括号逻辑(Monaco OnEnterSupport:brackets 缺省是 () {} [])
    const rules: OnEnterRuleConfig[] = (cfg.onEnterRules ?? []).map(r => ({
        beforeText: r.beforeText,
        afterText: r.afterText,
        previousLineText: r.previousLineText,
        action: r.action as unknown as OnEnterRuleConfig['action'], // IndentAction 数值与 core 的 const enum 一致(0/1/2/3)
    }))
    post.push(onEnterConfig.of({ rules, brackets: cfg.brackets ?? DEFAULT_ENTER_BRACKETS }))

    // 括号匹配 / 彩虹括号
    post.push(bracketsConfig.of({ brackets: cfg.brackets ?? [], colorized: cfg.colorizedBracketPairs }))

    // 自动补闭 / 包裹
    // 语言配置叠在 plaintext 之上(Monaco 注册表语义):只配了 indentationRules 之类,括号补闭仍是缺省三对(#122714)
    const cp = resolveCharacterPairs({ brackets: PLAINTEXT_BRACKETS as LanguageConfiguration['brackets'], ...cfg })
    post.push(closingConfig.of({
        pairs: cp.autoClosingPairs.map(p => ({ open: p.open, close: p.close, ...('notIn' in p && p.notIn ? { notIn: p.notIn as ('string' | 'comment' | 'regex')[] } : {}) })),
        surround: cp.surroundingPairs,
        autoCloseBefore: cp.autoCloseBefore,
    }))

    return { pre, post }
}

// ───────────── 热生效 ─────────────

const instances = new Set<EditorHost>()

onLanguageConfigApplied((languageId) => {
    const id = languageId.toLowerCase()
    for (const host of [...instances]) {
        if (host.getLanguageId().toLowerCase() === id) host.reassemble()
    }
})

/** 每个实例登记一下:语言配置变了才找得到要重装配的编辑器(destroy 时自动摘掉) */
export const installLanguageConfig: Installer = (ctx) => {
    instances.add(ctx.host)
    ctx.onDispose(() => { instances.delete(ctx.host) })
}
