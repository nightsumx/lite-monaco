// 运行时选项:updateOptions / getOption / getOptions / getRawOptions / onDidChangeConfiguration,
// 以及旧 `LiteMonacoFeatures` 布尔开关 ⇄ Monaco 选项的映射(H1)。
//
// ── features → options 映射表(`featuresToOptions`;只在 features 里写了 false/true 的项才产出,没写的不产出,默认值全是 Monaco 的) ──
//
//   features 字段            映射成的选项                                     结构上是否跟着选项走(featuresFromOptions)
//   lineNumbers:false        lineNumbers: 'off'                               是:renderType !== Off
//   foldGutter:false         folding: false                                   是:folding
//   activeLine:false         renderLineHighlight: 'none'                      是:!== 'none'
//   bracketMatch:false       matchBrackets: 'never'                           是:!== 'never'
//   closeBrackets:false      autoClosingBrackets/Quotes: 'never'              是:两者不全是 'never'
//   bracketColors:false      bracketPairColorization.enabled: false           是:.enabled
//   overviewRuler:false      overviewRulerLanes: 0                            是:> 0
//   minimap:false            minimap.enabled: false                           是:.enabled
//   selectionMatch:false     selectionHighlight:false, occurrencesHighlight:'off'   是:二者不全关
//   indentGuide:false        guides.indentation: false                        是:.indentation
//   hScrollbar:false         scrollbar.horizontal: 'hidden'                   是:!== hidden
//   vScrollbar:false         scrollbar.vertical: 'hidden'                     是:!== hidden
//   contextMenu:false        contextmenu: false                               是:contextmenu
//   lineWrapping:true        wordWrap: 'on'                                   是:wordWrap !== 'off'
//   scrollBeyondLastLine:false  scrollBeyondLastLine: false                   是:scrollBeyondLastLine
//   stickyScroll:false       stickyScroll.enabled: false                      是:.enabled
//   formatOnType:true        formatOnType: true                               是:formatOnType
//   formatOnPaste:true       formatOnPaste: true                              是:formatOnPaste
//   tsUnusedFade:false       showUnused:false, showDeprecated:false           是:二者不全关
//   readOnly(构造项)         readOnly: true                                   (EditorState.readOnly 跟着选项)
//   ── 软映射:features 写 false 时同时把选项置成"关",但结构仍只看 features(选项的"关"比整体卸载弱,不能当卸载用) ──
//   hover:false              hover.enabled: false          (hover.enabled:false 只是不弹,⌘K ⌘I 仍可唤起)
//   signatureHelp:false      parameterHints.enabled: false (只关打字自动弹,显式触发不受影响)
//   codeActions:false        lightbulb.enabled: 'off'      (⌘. 菜单与快捷键仍由 features.codeActions 决定)
//   ── 没有对应选项,只认 features ──
//   multiCursor / indentOnInput / search / history / tabIndent / autocomplete / tsDiagnostics / a11y / inlayHints
//
// 优先级(低 → 高):features 映射 < 构造时的 `options` < 之后的 `updateOptions`。
// 与旧版的唯一默认值差异:automaticLayout 现在和 Monaco 一样默认 false(宿主要自己调 layout(),或传 automaticLayout: true)。

import type { LiteMonacoFeatures } from '../litemonaco'
import {
    mergeRawOptions, configurationChange, getOptionById, editorOptions, resolveEditorOptions, type ResolveEnv, ScrollbarVisibility, RenderLineNumbersType,
    type ComputedEditorOptions, type IComputedEditorOptions, type IEditorOptions, type EditorLayoutInfo, type EditorWrappingInfo, OPTION_KEYS,
} from '../core/options'
import { Transaction } from '../core/model/state'
import type { EditorContext } from './context'
import { onFontCacheCleared } from '../core/view/fontinfo'
import type { IConfigurationChangedEvent } from './types'

/** 不在 EditorOption 里、但属于 IGlobalEditorOptions(文本模型)的键:mergeRawOptions 会丢,这里自己带 */
/** 构造项里不属于 EditorOption 的键(Monaco IEditorConstructionOptions):H2 的 overflowWidgetsDomNode 从 getUserOptions() 读它 */
const CONSTRUCTION_ONLY_KEYS = ['overflowWidgetsDomNode'] as const

export const MODEL_OPTION_KEYS = ['tabSize', 'indentSize', 'insertSpaces', 'detectIndentation', 'trimAutoWhitespace', 'maxTokenizationLineLength'] as const

/**
 * 构造选项里不是 Monaco 编辑器选项、但属于宿主的:mergeRawOptions 会丢,这里自己带(不进 editorOptions facet 之外的任何计算)。
 * overflowWidgetsDomNode 由 widgets.ts 经 host.getUserOptions() 读。
 */
export const HOST_ONLY_KEYS = ['overflowWidgetsDomNode', 'ariaContainerElement'] as const

/** features(+ 构造项 readOnly)→ 选项,见文件头的映射表 */
export function featuresToOptions(f: LiteMonacoFeatures | undefined, readOnly?: boolean): IEditorOptions {
    const o: Record<string, unknown> = {}
    const set = (k: string, v: unknown) => { o[k] = v }
    const merge = (k: string, v: Record<string, unknown>) => { o[k] = { ...(o[k] as object | undefined), ...v } }
    if (readOnly) set('readOnly', true)
    if (!f) return o as IEditorOptions
    if (f.lineNumbers === false) set('lineNumbers', 'off')
    if (f.foldGutter === false) set('folding', false)
    if (f.activeLine === false) set('renderLineHighlight', 'none')
    if (f.bracketMatch === false) set('matchBrackets', 'never')
    if (f.closeBrackets === false) { set('autoClosingBrackets', 'never'); set('autoClosingQuotes', 'never') }
    if (f.bracketColors === false) merge('bracketPairColorization', { enabled: false })
    if (f.overviewRuler === false) set('overviewRulerLanes', 0)
    if (f.minimap === false) merge('minimap', { enabled: false })
    if (f.selectionMatch === false) { set('selectionHighlight', false); set('occurrencesHighlight', 'off') }
    if (f.indentGuide === false) merge('guides', { indentation: false })
    if (f.hScrollbar === false) merge('scrollbar', { horizontal: 'hidden' })
    if (f.vScrollbar === false) merge('scrollbar', { vertical: 'hidden' })
    if (f.contextMenu === false) set('contextmenu', false)
    if (f.lineWrapping === true) set('wordWrap', 'on')
    if (f.scrollBeyondLastLine === false) set('scrollBeyondLastLine', false)
    if (f.stickyScroll === false) merge('stickyScroll', { enabled: false })
    if (f.formatOnType === true) set('formatOnType', true)
    if (f.formatOnPaste === true) set('formatOnPaste', true)
    if (f.tsUnusedFade === false) { set('showUnused', false); set('showDeprecated', false) }
    // 软映射
    if (f.hover === false) merge('hover', { enabled: false })
    if (f.signatureHelp === false) merge('parameterHints', { enabled: false })
    if (f.codeActions === false) merge('lightbulb', { enabled: 'off' })
    return o as IEditorOptions
}

/**
 * 结构上要不要装:在 features 的基础上,把"结构跟着选项走"的那些项换成从 computed 选项推出来的值。
 * (features 里没写的项,选项默认值就是 Monaco 默认,推出来都是"开",和旧版 features 默认一致。)
 */
export function featuresFromOptions(base: LiteMonacoFeatures | undefined, c: ComputedEditorOptions): LiteMonacoFeatures {
    return {
        ...base,
        lineNumbers: c.lineNumbers.renderType !== RenderLineNumbersType.Off,
        foldGutter: c.folding,
        activeLine: c.renderLineHighlight !== 'none',
        bracketMatch: c.matchBrackets !== 'never',
        closeBrackets: c.autoClosingBrackets !== 'never' || c.autoClosingQuotes !== 'never',
        bracketColors: c.bracketPairColorization.enabled,
        overviewRuler: c.overviewRulerLanes > 0,
        minimap: c.minimap.enabled,
        selectionMatch: c.selectionHighlight || c.occurrencesHighlight !== 'off',
        indentGuide: c.guides.indentation !== false,
        hScrollbar: c.scrollbar.horizontal !== ScrollbarVisibility.Hidden,
        vScrollbar: c.scrollbar.vertical !== ScrollbarVisibility.Hidden,
        contextMenu: c.contextmenu,
        lineWrapping: c.wordWrap !== 'off',
        scrollBeyondLastLine: c.scrollBeyondLastLine,
        stickyScroll: c.stickyScroll.enabled,
        formatOnType: c.formatOnType,
        formatOnPaste: c.formatOnPaste,
        tsUnusedFade: c.showUnused || c.showDeprecated,
    }
}

/**
 * 宿主选项的合并(= Monaco updateOptions 语义 + 文本模型那几项):嵌套对象深合并,`undefined` 清回默认。
 * mergeRawOptions 只认 EditorOption 的键,所以 MODEL_OPTION_KEYS 在这里单独带。
 */
export function mergeHostOptions(base: IEditorOptions, patch: IEditorOptions): IEditorOptions {
    const out = mergeRawOptions(base, patch) as Record<string, unknown>
    const b = base as Record<string, unknown>
    const p = patch as Record<string, unknown>
    for (const k of [...MODEL_OPTION_KEYS, ...HOST_ONLY_KEYS]) {
        if (Object.prototype.hasOwnProperty.call(p, k)) {
            if (p[k] === undefined) delete out[k]
            else out[k] = p[k]
        } else if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k]
    }
    for (const k of CONSTRUCTION_ONLY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(p, k)) {
            if (p[k] === undefined) delete out[k]
            else out[k] = p[k]
        } else if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k]
    }
    return out as IEditorOptions
}

/** 两份 computed 的模型选项(tabSize 等)有没有变:patch 里带了这几个键就算 */
export function touchesModelOptions(patch: IEditorOptions): boolean {
    const p = patch as Record<string, unknown>
    return MODEL_OPTION_KEYS.some(k => Object.prototype.hasOwnProperty.call(p, k))
}

/** 只看缩进相关键:trimAutoWhitespace 之类的模型选项变了不该重算 modelExt(会把 setModel 带进来的缩进配置冲掉) */
export function touchesIndentOptions(patch: IEditorOptions): boolean {
    const p = patch as Record<string, unknown>
    return ['tabSize', 'indentSize', 'insertSpaces', 'detectIndentation'].some(k => Object.prototype.hasOwnProperty.call(p, k))
}

export { configurationChange }

// ───────────── 实例上的方法 ─────────────

/** V 的 EditorView:选项变了之后同步视图层(字体度量、行高、光标样式、换行列、minimap 列宽……),协议见 editorview.ts 的 getResolveEnv / applyViewOptions */
interface ViewWithOptions {
    applyViewOptions?(computed: ComputedEditorOptions): void
    getResolveEnv?(): ResolveEnv
}

export function installOptions(ctx: EditorContext): void {
    const { view, host, api } = ctx
    const onChange = ctx.events.emitter<IConfigurationChangedEvent>()
    let wrapped: { source: ComputedEditorOptions, value: IComputedEditorOptions } | null = null

    api.updateOptions = (newOptions: IEditorOptions): void => {
        const prev = view.state.facet(editorOptions)
        host.setUserOptions(mergeHostOptions(host.getUserOptions(), newOptions), newOptions)
        const next = view.state.facet(editorOptions)
        const ev = configurationChange(prev, next)
        if (!ev) return
        // 行高 / 字体装饰是否生效由这两个选项决定:装饰源按选项过滤,变了就让视图重读装饰并重排高度
        if (prev.allowVariableLineHeights !== next.allowVariableLineHeights || prev.effectiveAllowVariableFonts !== next.effectiveAllowVariableFonts) {
            view.dispatch(view.state.update({ annotations: [Transaction.addToHistory.of(false)] }))
            view.refreshHeights()
        }
        // 视图层吃"带本视图环境(字体度量 / zoom)解析出来的"computed,不是 facet 里那份(facet 给特性模块读,与环境无关)
        const v = view as ViewWithOptions
        if (v.applyViewOptions) v.applyViewOptions(resolveEditorOptions(host.getEffectiveOptions(), v.getResolveEnv?.()))
        reserveGlyphMargin()
        onChange.fire(ev)
    }
    // glyphMargin: true 就占一条车道(Monaco 的车道数最少 1,不管有没有字形装饰);核心视图自己只在出现字形装饰后才占
    const reserveGlyphMargin = (): void => {
        if (view.state.facet(editorOptions).glyphMargin) view.reserveGlyphLane(1)
    }
    reserveGlyphMargin()
    // editor.remeasureFonts:字体度量缓存被清,本编辑器按新量出的字宽重算视图选项(Monaco FontMeasurements.onDidChange → _recomputeOptions)
    ctx.onDispose(onFontCacheCleared(() => {
        const v = view as ViewWithOptions
        if (v.applyViewOptions) v.applyViewOptions(resolveEditorOptions(host.getEffectiveOptions(), v.getResolveEnv?.()))
    }))
    // 选项最初在视图挂进文档之前解析:量不到布局,字体度量退回 0.6em 估算(isTrusted=false,半角 8.4 而非实测的 8.4296875),
    // 换行列、行号栏宽、minimap 列宽随之差一点。视图有了布局(onGeometry)就按实测字体重算一次;量不到(jsdom)最多试几次。
    {
        const v = view as ViewWithOptions & { fontInfo?(): { isTrusted: boolean }, onGeometry?(fn: () => void): () => void }
        const untrusted = () => v.fontInfo ? !v.fontInfo().isTrusted : false
        if (v.getResolveEnv && v.applyViewOptions && v.onGeometry && untrusted()) {
            let tries = 0, busy = false, raf = 0, done = false
            const stop = () => { done = true; off(); if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf) }
            const retry = () => {
                if (done || busy || !view.dom.isConnected) return
                busy = true
                try { v.applyViewOptions!(resolveEditorOptions(host.getEffectiveOptions(), v.getResolveEnv!())) } finally { busy = false }
                if (!untrusted() || ++tries >= 3) stop()
            }
            const off = v.onGeometry(retry)
            // 挂进文档后尺寸不一定变,onGeometry 不会再响:下一帧也试一次(真浏览器此时已有布局;没有 rAF 的环境只靠 onGeometry)
            if (typeof requestAnimationFrame === 'function') {
                let frames = 0
                // 有布局(offsetWidth>0)才试:jsdom 里永远量不到,不该白白重算视图选项
                const tick = () => {
                    raf = 0
                    if (done) return
                    // 已挂进文档却没有布局(jsdom、display:none 的容器):不再逐帧轮询,交给 onGeometry,免得拖住用假时钟等队列清空的测试
                    if (view.dom.isConnected && view.dom.offsetWidth === 0) return
                    if (view.dom.offsetWidth > 0) retry()
                    if (!done && ++frames < 120) raf = requestAnimationFrame(tick)
                }
                raf = requestAnimationFrame(tick)
            }
            ctx.onDispose(stop)
        }
    }
    // facet 里那份 computed 不带视图环境(容器宽 / 实测字宽),wrappingInfo 的换行列会是 1;
    // 这两项依赖环境,按视图当前的布局现算(Monaco 的 wrappingColumn = (内容宽 − 竖条 − 2) / 半角字宽)
    const viewComputed = (name: string): unknown => {
        const lv = view as unknown as { getLayoutInfo?(): EditorLayoutInfo, fontInfo?(): unknown }
        if (!lv.getLayoutInfo) return undefined
        // 字体度量:视图量到布局之后的实测值(facet 里那份是挂进文档前烤的估算,半角 8.4 而不是 8.4296875)
        if (name === 'fontInfo') return lv.fontInfo?.()
        // 别的选项(quickSuggestions 之类,每次光标变都会读)不依赖布局:先看名字再算,免得每次 getOption 都读容器尺寸逼出一次重排
        if (name !== 'layoutInfo' && name !== 'wrappingInfo') return undefined
        const l = lv.getLayoutInfo()
        if (name === 'layoutInfo') return l
        if (name === 'wrappingInfo') {
            const w = (view.state.facet(editorOptions) as unknown as Record<string, EditorWrappingInfo>).wrappingInfo
            return { ...w, isViewportWrapping: l.isViewportWrapping, isWordWrapMinified: l.isWordWrapMinified, wrappingColumn: l.wrappingColumn }
        }
        return undefined
    }
    api.getOption = (idOrName: number | string): unknown => {
        const name = typeof idOrName === 'number' ? (OPTION_KEYS[idOrName as never] as string) : idOrName
        const env = viewComputed(name)
        if (env !== undefined) return env
        return typeof idOrName === 'number'
            ? getOptionById(view.state, idOrName as never)
            : (view.state.facet(editorOptions) as unknown as Record<string, unknown>)[idOrName]
    }
    // Monaco 的 getOptions() 返回带 get(id) 的表;这里是 computed 表加一个不可枚举的 get
    api.getOptions = (): IComputedEditorOptions => {
        const source = view.state.facet(editorOptions)
        if (wrapped?.source === source) return wrapped.value
        const value = { ...source } as IComputedEditorOptions
        Object.defineProperty(value, 'get', { value: (id: number) => getOptionById(view.state, id as never), enumerable: false })
        wrapped = { source, value }
        return value
    }
    api.getRawOptions = (): IEditorOptions => mergeHostOptions({}, host.getUserOptions())
    api.onDidChangeConfiguration = onChange.event
}
