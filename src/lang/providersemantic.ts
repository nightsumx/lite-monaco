// languages.registerDocumentSemanticTokensProvider / registerDocumentRangeSemanticTokensProvider 背后的编辑器贡献
// (Monaco contrib/semanticTokens:DocumentSemanticTokensFeature + ViewportSemanticTokensContribution)。
//
// 取数链路直接用已移植的 semantictokensfeature(防抖 / 增量 edits / 请求期编辑平移 / 可视区 ± 一屏的局部请求),
// 只是 Monaco 的「写进 model.tokenization」这一步,这里换成「写进编辑器的装饰层」:
//   provider → toMultilineTokens2(带主题 metadata)→ 适配 model 的 tokenization.setSemanticTokens / setPartialSemanticTokens
//   → StateEffect → semanticField(绝对偏移区间,随编辑映射)→ core.decorations 画 color / font-style 的 mark。
// 开关同 Monaco:`semanticHighlighting.enabled`(true / false / 'configuredByTheme';standalone 主题恒 semanticHighlighting=false,
// 所以默认(configuredByTheme)不着色,要显式 true)。
// 颜色:主题 token 规则里按 `type.modifier1.modifier2` 最长前缀匹配(Monaco standalone getTokenStyleMetadata),没规则的落到主题默认前景(同 Monaco)。
// 未实现:onDidChangeTokens / model.tokenization.getLineTokens 里不叠语义层(语义色只在装饰层);多编辑器共享同一 model 时各自独立取数。
import type { LiteMonacoEditor } from '../api/types'
import type { EditorView } from '../core/view/editorview'
import type { EditorState, DecorationSet } from '../core'
import type { ITextModel } from '../api/model'
import type { SparseMultilineTokens } from '../api/sparsetokens'
import type { IEvent, IDisposable } from '../api/types'
import { StateEffect, StateField, Decoration, RangeSetBuilder } from '../core'
import { Range } from '../api/position'
import { Emitter } from '../api/context'
import { SemanticMetadata } from '../api/sparsetokens'
import { MetadataConsts, FontStyle } from '../api/tokenization'
import { getTheme, onDidColorThemeChange } from '../api/themes'
import { effectiveColorMap, tokenThemeOf } from '../api/tokentheme'
import { getLanguageService } from '../api/languagesregistry'
import { languageFeatures } from './languagefeatures'
import { LanguageFeatureDebounceService } from './featuredebounce'
import { SemanticTokensStylingService, type SemanticTokenStyle } from './semantictokens'
import { DocumentSemanticTokensFeature, ViewportSemanticTokensContribution, SEMANTIC_HIGHLIGHTING_SETTING_ID, type SemanticModel, type ViewportEditor } from './semantictokensfeature'

const OPTION = 'semanticHighlighting.enabled'

interface Span { from: number, to: number, mark: Decoration }
interface SemanticUpdate { spans: Span[], /** 局部更新:只换掉这个区间里的 */ partial?: { from: number, to: number } }

const setSemantic = StateEffect.define<SemanticUpdate>()

export const semanticField = StateField.define<Span[]>({
    create: () => [],
    update(v, tr) {
        let spans = v
        if (tr.docChanged && spans.length) {
            const out: Span[] = []
            for (const s of spans) {
                const from = tr.changes.mapPos(s.from, 1), to = tr.changes.mapPos(s.to, -1)
                if (to > from) out.push({ ...s, from, to })
            }
            spans = out
        }
        for (const e of tr.effects) {
            if (!e.is(setSemantic)) continue
            const u = e.value
            spans = u.partial
                ? spans.filter(s => s.to <= u.partial!.from || s.from >= u.partial!.to).concat(u.spans)
                : u.spans
        }
        return spans
    },
})

export function semanticDecorations(state: EditorState): DecorationSet {
    const spans = state.field(semanticField, false)
    const b = new RangeSetBuilder<Decoration>()
    if (!spans?.length) return b.finish()
    const len = state.doc.length
    for (const s of [...spans].sort((a, d) => a.from - d.from || a.to - d.to))
        if (s.from < s.to && s.to <= len) b.add(s.from, s.to, s.mark)
    return b.finish()
}

const markCache = new Map<string, Decoration>()
const markOf = (style: string): Decoration => {
    let m = markCache.get(style)
    if (!m) markCache.set(style, m = Decoration.mark({ class: 'cm-semanticToken', attributes: { style } }))
    return m
}

/** SparseMultilineTokens 里的 metadata → CSS(只写「语义说了算」的那些位) */
function metadataStyle(metadata: number, colors: readonly { toString(): string }[]): string {
    const css: string[] = []
    if (metadata & SemanticMetadata.SEMANTIC_USE_FOREGROUND) {
        const c = colors[(metadata & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET]
        if (c) css.push(`color:${c}`)
    }
    const fs = (metadata & MetadataConsts.FONT_STYLE_MASK) >>> MetadataConsts.FONT_STYLE_OFFSET
    if (metadata & SemanticMetadata.SEMANTIC_USE_ITALIC) css.push(`font-style:${fs & FontStyle.Italic ? 'italic' : 'normal'}`)
    if (metadata & SemanticMetadata.SEMANTIC_USE_BOLD) css.push(`font-weight:${fs & FontStyle.Bold ? 'bold' : 'normal'}`)
    const deco: string[] = []
    if (metadata & SemanticMetadata.SEMANTIC_USE_UNDERLINE && fs & FontStyle.Underline) deco.push('underline')
    if (metadata & SemanticMetadata.SEMANTIC_USE_STRIKETHROUGH && fs & FontStyle.Strikethrough) deco.push('line-through')
    if (deco.length) css.push(`text-decoration:${deco.join(' ')}`)
    return css.join(';')
}

/** Monaco standalone getTokenStyleMetadata:`type.mod1.mod2` 在主题 token 规则里最长前缀匹配 */
const styleMetadata = (type: string, modifiers: string[]): SemanticTokenStyle => {
    const m = tokenThemeOf(getTheme())._match([type].concat(modifiers).join('.')).metadata
    const fs = (m & MetadataConsts.FONT_STYLE_MASK) >>> MetadataConsts.FONT_STYLE_OFFSET
    return {
        foreground: (m & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET,
        italic: !!(fs & FontStyle.Italic), bold: !!(fs & FontStyle.Bold), underline: !!(fs & FontStyle.Underline), strikethrough: !!(fs & FontStyle.Strikethrough),
    }
}

const theme = {
    getColorTheme: () => ({ semanticHighlighting: false, getTokenStyleMetadata: (type: string, modifiers: string[]) => styleMetadata(type, modifiers) }),
    onDidColorThemeChange: onDidColorThemeChange as IEvent<unknown>,
}
const stylingService = new SemanticTokensStylingService(theme, { warn: m => console.warn(m) }, getLanguageService())
const debounceService = new LanguageFeatureDebounceService(undefined, { isBuilt: true })
const NEVER: IEvent<never> = () => ({ dispose() { } })

export function installProviderSemanticTokens(editor: LiteMonacoEditor, initial?: unknown): () => void {
    const view = editor as unknown as EditorView
    let disposed = false
    let teardown: (() => void) | null = null
    // `semanticHighlighting.enabled` 不是 computed 选项(选项合并丢掉未知键,Monaco 也是走 configurationService),这里自己记
    let setting: unknown = initial
    const rawEnabled = () => setting
    const config = new Emitter<{ affectsConfiguration(id: string): boolean }>()
    const fireConfig = () => { config.fire({ affectsConfiguration: id => id === SEMANTIC_HIGHLIGHTING_SETTING_ID }) }
    const configService = {
        getValue: () => ({ enabled: rawEnabled() as boolean | 'configuredByTheme' | undefined }),
        onDidChangeConfiguration: (l: (e: { affectsConfiguration(id: string): boolean }) => unknown) => config.event(l),
    }

    /** 这个选项不是 computed 选项,updateOptions 不会为它发 onDidChangeConfiguration:包一层 updateOptions 补发 */
    const origUpdate = editor.updateOptions
    editor.updateOptions = (o => {
        origUpdate.call(editor, o)
        if (o && Object.prototype.hasOwnProperty.call(o, OPTION) && (o as Record<string, unknown>)[OPTION] !== setting) {
            setting = (o as Record<string, unknown>)[OPTION]
            fireConfig()
        }
    }) as typeof editor.updateOptions

    const build = () => {
        teardown?.()
        teardown = null
        const model = editor.getModel() as ITextModel | null
        if (disposed || !model) return
        const toSpans = (pieces: SparseMultilineTokens[] | null): Span[] => {
            const doc = view.state.doc
            const colors = effectiveColorMap(getTheme())
            const out: Span[] = []
            for (const p of pieces ?? []) {
                for (let line = p.startLineNumber; line <= p.endLineNumber && line <= doc.lines; line++) {
                    const lt = p.getLineTokens(line)
                    if (!lt) continue
                    const info = doc.line(line)
                    for (let i = 0; i < lt.getCount(); i++) {
                        const css = metadataStyle(lt.getMetadata(i), colors)
                        const from = info.from + Math.min(lt.getStartCharacter(i), info.length)
                        const to = info.from + Math.min(lt.getEndCharacter(i), info.length)
                        if (css && to > from) out.push({ from, to, mark: markOf(css) })
                    }
                }
            }
            return out
        }
        const dispatch = (u: SemanticUpdate) => { if (!disposed) view.dispatch(view.state.update({ effects: setSemantic.of(u) })) }
        let complete = false
        const tokenization = {
            setSemanticTokens: (tokens: SparseMultilineTokens[] | null, isComplete: boolean) => {
                complete = isComplete
                dispatch({ spans: toSpans(tokens) })
            },
            setPartialSemanticTokens: (range: Range, tokens: SparseMultilineTokens[] | null) => {
                if (complete) return
                const doc = view.state.doc
                const from = doc.line(Math.min(range.startLineNumber, doc.lines)).from + range.startColumn - 1
                const to = doc.line(Math.min(range.endLineNumber, doc.lines)).from + range.endColumn - 1
                dispatch({ spans: toSpans(tokens), partial: { from, to } })
            },
            hasCompleteSemanticTokens: () => complete,
            hasSomeSemanticTokens: () => !!view.state.field(semanticField, false)?.length,
        }
        // 以真 model 为原型的适配:provider 看到的 uri / getValue / getLanguageId 都是真的,只有 tokenization 与「已挂编辑器」被换掉
        const adapter = Object.create(model, {
            tokenization: { value: tokenization },
            isAttachedToEditor: { value: () => true },
            onDidChangeAttached: { value: NEVER },
        }) as SemanticModel & ITextModel
        const modelService = { getModels: () => [adapter] as SemanticModel[], onModelAdded: NEVER, onModelRemoved: NEVER }
        const docFeature = new DocumentSemanticTokensFeature(stylingService, modelService, theme, configService, debounceService, languageFeatures)
        const viewportEditor: ViewportEditor = {
            hasModel: () => true,
            getModel: () => adapter,
            getVisibleRangesPlusViewportAboveBelow: () => view.getVisibleRangesPlusViewportAboveBelow(),
            onDidScrollChange: view.onDidScrollChange as IEvent<unknown>,
            onDidChangeModel: NEVER, // 换 model 时整个重建
            onDidChangeModelLanguage: editor.onDidChangeModelLanguage as IEvent<unknown>,
            onDidChangeModelContent: editor.onDidChangeModelContent as IEvent<unknown>,
        }
        const viewportContribution = new ViewportSemanticTokensContribution(viewportEditor, stylingService, theme, configService, debounceService, languageFeatures)
        teardown = () => {
            docFeature.dispose()
            viewportContribution.dispose()
            if (!disposed && view.state.field(semanticField, false)?.length) view.dispatch(view.state.update({ effects: setSemantic.of({ spans: [] }) }))
        }
    }

    const subs: IDisposable[] = [
        editor.onDidChangeModel(() => build()),
    ]
    build()
    return () => {
        disposed = true
        teardown?.()
        teardown = null
        editor.updateOptions = origUpdate
        config.dispose()
        for (const s of subs) s.dispose()
    }
}
