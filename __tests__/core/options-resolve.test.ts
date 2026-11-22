import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import {
    applyRawUpdate, configurationChange, ConfigurationChangedEvent, ComputeOptionsMemory, editorOptions, EditorOption,
    estimateFontInfo, getOption, getOptionById, mergeRawOptions, OPTION_KEYS, platformDefaults,
    resolveEditorOptions, validateContext, validateOptions,
    type ComputeEnv, type IEditorFindOptions, type IEditorOptions, type IRulerOption, type ResolveEnv,
} from '../../src/core/options'
import { EDITOR_OPTION_NAMES } from '../../src/core/options/generated'
import { cloneAndMigrate, deepClone } from '../../src/core/options/merge'
import { hostOs, loadMonaco, runRef } from './options-ref'

// resolveEditorOptions / mergeRawOptions / configurationChange / facet,以及整条 raw → computed 管线对照 Monaco。

/**
 * 在子进程里(指定平台)把 Monaco 的整条 validate → compute 管线(EditorOptionsUtil.validateOptions / computeOptions)跑一遍。
 * 字体度量用一个固定的估算函数(同 compute.ts 的 estimateFontInfo:半角 0.6em),这样两边输入相同,比的是算法。
 */
function monacoComputedAll(plat: 'darwin' | 'win32' | 'linux', cases: { raw: IEditorOptions, env: Partial<ComputeEnv> }[]): Record<string, unknown>[] {
    return runRef<Record<string, unknown>[]>(plat, `
const cases = ${JSON.stringify(cases)}
const reg = m.editorOptionsRegistry
const mac = ${JSON.stringify(plat === 'darwin')}
const estimate = bare => ({
    ...bare, version: 2, isTrusted: false, isMonospace: true,
    typicalHalfwidthCharacterWidth: bare.fontSize * 0.6 + bare.letterSpacing,
    typicalFullwidthCharacterWidth: bare.fontSize + bare.letterSpacing,
    canUseHalfwidthRightwardsArrow: true,
    spaceWidth: bare.fontSize * 0.6 + bare.letterSpacing, middotWidth: bare.fontSize * 0.6 + bare.letterSpacing,
    wsmiddotWidth: bare.fontSize * 0.6 + bare.letterSpacing, maxDigitWidth: bare.fontSize * 0.6 + bare.letterSpacing,
})
const results = []
for (const { raw, env } of cases) {
    const validated = []
    for (const o of reg) validated[o.id] = o.validate(o.name === '_never_' ? undefined : raw[o.name])
    zoom.EditorZoom.setZoomLevel(env.zoomLevel ?? 0)
    const pixelRatio = env.pixelRatio ?? 1
    const bare = font.createBareFontInfoFromValidatedSettings({ get: id => validated[id] }, pixelRatio, env.isSimpleWidget ?? false)
    const menv = {
        memory: new m.ComputeOptionsMemory(),
        outerWidth: env.outerWidth ?? 0, outerHeight: env.outerHeight ?? 0,
        fontInfo: estimate(bare),
        extraEditorClassName: env.extraEditorClassName ?? ('no-user-select ' + (mac ? 'mac ' : '')),
        isDominatedByLongLines: env.isDominatedByLongLines ?? false,
        viewLineCount: env.viewLineCount ?? 1, lineNumbersDigitCount: env.lineNumbersDigitCount ?? 1,
        emptySelectionClipboard: env.emptySelectionClipboard ?? true, pixelRatio, tabFocusMode: false,
        inputMode: env.inputMode ?? 'insert', editContextSupported: env.editContextSupported ?? false,
        accessibilitySupport: env.accessibilitySupport ?? 0, glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount ?? 1,
    }
    const computed = []
    const getter = { get: id => computed[id] }
    for (const o of reg) computed[o.id] = o.compute(menv, getter, validated[o.id])
    zoom.EditorZoom.setZoomLevel(0)
    results.push(computed)
}
out(results)`).map(computed => {
        const byKey: Record<string, unknown> = {}
        OPTION_KEYS.forEach((key, id) => { byKey[key] = (computed as unknown as unknown[])[id] })
        return byKey
    })
}

const SCENARIOS: { name: string, raw: IEditorOptions, env: Partial<ComputeEnv> }[] = [
    { name: '全默认', raw: {}, env: {} },
    { name: '有尺寸', raw: {}, env: { outerWidth: 800, outerHeight: 600, viewLineCount: 120, lineNumbersDigitCount: 3 } },
    { name: 'minimap 在左 + 关行号 + glyphMargin', raw: { minimap: { side: 'left' }, lineNumbers: 'off', glyphMargin: true }, env: { outerWidth: 900, outerHeight: 500, viewLineCount: 50 } },
    { name: 'minimap fit,内容少', raw: { minimap: { size: 'fit' } }, env: { outerWidth: 900, outerHeight: 800, viewLineCount: 30 } },
    { name: 'minimap fill,内容少', raw: { minimap: { size: 'fill', scale: 2 } }, env: { outerWidth: 900, outerHeight: 800, viewLineCount: 30 } },
    { name: 'minimap fill,内容多(采样)', raw: { minimap: { size: 'fill' } }, env: { outerWidth: 900, outerHeight: 300, viewLineCount: 9000 } },
    { name: 'minimap fit + 视口换行 + pixelRatio 2', raw: { minimap: { size: 'fit' }, wordWrap: 'on' }, env: { outerWidth: 1000, outerHeight: 700, viewLineCount: 40, pixelRatio: 2 } },
    { name: 'minimap 关 + 无字符', raw: { minimap: { enabled: false } }, env: { outerWidth: 700, outerHeight: 400 } },
    { name: 'minimap blocks + maxColumn', raw: { minimap: { renderCharacters: false, maxColumn: 40 } }, env: { outerWidth: 700, outerHeight: 400, viewLineCount: 10 } },
    { name: 'wordWrap on', raw: { wordWrap: 'on' }, env: { outerWidth: 600, outerHeight: 400 } },
    { name: 'wordWrap bounded', raw: { wordWrap: 'bounded', wordWrapColumn: 50 }, env: { outerWidth: 1400, outerHeight: 400 } },
    { name: 'wordWrap wordWrapColumn', raw: { wordWrap: 'wordWrapColumn', wordWrapColumn: 72 }, env: { outerWidth: 1400, outerHeight: 400 } },
    { name: '长行为主 → 强制视口换行', raw: {}, env: { outerWidth: 600, outerHeight: 400, isDominatedByLongLines: true } },
    { name: '长行为主但显式 wordWrapOverride1', raw: { wordWrapOverride1: 'off' }, env: { outerWidth: 600, outerHeight: 400, isDominatedByLongLines: true } },
    { name: '读屏开启', raw: { wordWrap: 'on', wrappingIndent: 'deepIndent', wrappingStrategy: 'simple' }, env: { outerWidth: 600, outerHeight: 400, accessibilitySupport: 2 } },
    { name: 'accessibilitySupport: on / off', raw: { accessibilitySupport: 'on' }, env: { accessibilitySupport: 1 } },
    { name: 'accessibilitySupport: off,环境读屏开', raw: { accessibilitySupport: 'off' }, env: { accessibilitySupport: 2 } },
    { name: 'padding + scrollbar 箭头 + 大滚动条', raw: { padding: { top: 20, bottom: 30 }, scrollbar: { verticalHasArrows: true, arrowSize: 13, verticalScrollbarSize: 20, horizontalScrollbarSize: 18 } }, env: { outerWidth: 800, outerHeight: 600 } },
    { name: '折叠控件 never + lineDecorationsWidth 数字', raw: { showFoldingControls: 'never', lineDecorationsWidth: 24 }, env: { outerWidth: 800, outerHeight: 600 } },
    { name: 'folding 关', raw: { folding: false }, env: { outerWidth: 800, outerHeight: 600 } },
    { name: 'lineDecorationsWidth: 2ch', raw: { lineDecorationsWidth: '2ch' }, env: { outerWidth: 800, outerHeight: 600 } },
    { name: 'lineNumbersMinChars + 多位数', raw: { lineNumbersMinChars: 6 }, env: { outerWidth: 800, outerHeight: 600, lineNumbersDigitCount: 7 } },
    { name: 'glyphMargin 多车道', raw: { glyphMargin: true }, env: { outerWidth: 800, outerHeight: 600, glyphMarginDecorationLaneCount: 3 } },
    { name: '字体:粗体 + fontVariations 翻译', raw: { fontWeight: '600', fontVariations: true, fontSize: 16, lineHeight: 1.5 }, env: {} },
    { name: '字体:行高 0 / 小于 8 / 像素', raw: { lineHeight: 5 }, env: {} },
    { name: '字体:行高 30 + letterSpacing', raw: { lineHeight: 30, letterSpacing: 2, fontLigatures: true }, env: {} },
    { name: 'zoom +3', raw: { fontSize: 14 }, env: { zoomLevel: 3, outerWidth: 800, outerHeight: 600 } },
    { name: 'zoom -2', raw: {}, env: { zoomLevel: -2, outerWidth: 800, outerHeight: 600 } },
    { name: 'zoom 在 simple widget 里忽略', raw: {}, env: { zoomLevel: 4, isSimpleWidget: true } },
    { name: 'editorClassName', raw: { extraEditorClassName: 'my-ed', mouseStyle: 'copy', showUnused: false, showDeprecated: false }, env: { extraEditorClassName: 'enable-user-select ' } },
    { name: 'mouseStyle default', raw: { mouseStyle: 'default' }, env: {} },
    { name: 'emptySelectionClipboard 环境不支持', raw: { emptySelectionClipboard: true }, env: { emptySelectionClipboard: false } },
    { name: '0.55:overtype 时光标样式取 overtypeCursorStyle', raw: { cursorStyle: 'line-thin', overtypeCursorStyle: 'underline' }, env: { inputMode: 'overtype' } },
    { name: '0.55:insert 时光标样式取 cursorStyle', raw: { cursorStyle: 'block', overtypeCursorStyle: 'underline' }, env: {} },
    { name: '0.55:editContext 宿主支持', raw: { editContext: true }, env: { editContextSupported: true } },
    { name: '0.55:editContext 宿主支持但选项关', raw: { editContext: false }, env: { editContextSupported: true } },
    { name: '0.55:读屏开时 allowVariableFonts 取 InAccessibilityMode 那项', raw: { allowVariableFonts: true, allowVariableFontsInAccessibilityMode: false }, env: { accessibilitySupport: 2 } },
    { name: '0.55:读屏开 + 长行为主 → 强制视口换行', raw: { accessibilitySupport: 'on' }, env: { outerWidth: 600, outerHeight: 400, isDominatedByLongLines: true, accessibilitySupport: 2 } },
    { name: '老写法迁移', raw: { lineNumbers: true, hover: false, quickSuggestions: false, wordWrap: true, autoIndent: true, cursorBlinking: 'visible', renderWhitespace: false } as unknown as IEditorOptions, env: {} },
    { name: '一堆复杂选项', raw: { rulers: [100, { column: 80, color: 'red' }], find: { loop: false, seedSearchStringFromSelection: 'never' }, suggest: { showWords: false }, unicodeHighlight: { allowedLocales: { zh: true } }, guides: { bracketPairs: true }, lightbulb: { enabled: 'on' as never }, multiCursorModifier: 'ctrlCmd' }, env: { outerWidth: 800, outerHeight: 600 } },
]

describe('raw → computed 整条管线对照 Monaco(三个平台,同一份环境输入,Monaco 在子进程里跑)', () => {
    const PLATFORMS = [['darwin', 'mac'], ['win32', 'win'], ['linux', 'linux']] as const
    for (const [plat, os] of PLATFORMS) {
        describe(plat, () => {
            // 老写法先迁移(迁移本身在下面单独测),再把已迁移的 raw 交给 Monaco
            const cases = SCENARIOS.map(sc => ({ raw: cloneAndMigrate(sc.raw), env: sc.env }))
            const expected = monacoComputedAll(plat, cases)
            SCENARIOS.forEach((sc, i) => {
                it(sc.name, () => {
                    // 子进程里 JSON 数组中的 undefined 变 null(readOnlyMessage / placeholder);对象里 undefined 的键直接没有
                    const actual = JSON.parse(JSON.stringify(resolveEditorOptions(deepClone(sc.raw), { os, ...sc.env, measureFont: estimateFontInfo }))) as Record<string, unknown>
                    const want = JSON.parse(JSON.stringify(expected[i])) as Record<string, unknown>
                    expect(Object.keys(want).length).toBe(OPTION_KEYS.length)
                    const diff: string[] = []
                    for (const key of OPTION_KEYS) {
                        try { expect(actual[key] ?? null, key).toEqual(want[key]) } catch { diff.push(`${key}: ours=${JSON.stringify(actual[key])} monaco=${JSON.stringify(want[key])}`) }
                    }
                    expect(diff).toEqual([])
                })
            })
        })
    }
})

describe('默认值逐项等于 Monaco', () => {
    it('165 项(0.55.1)里每个有名字的选项:validate(undefined) = Monaco 的 defaultValue', async () => {
        const monaco = await loadMonaco()
        const validated = validateOptions({}, hostOs)
        let n = 0
        for (const o of Object.values(monaco.EditorOptions)) {
            if (o.name === '_never_') continue
            expect(validated[o.name], o.name).toEqual(o.defaultValue)
            n++
        }
        expect(n).toBe(165)
    })

    it('computed 默认:不依赖环境的选项等于 Monaco 默认,依赖环境的有确定的值', async () => {
        const monaco = await loadMonaco()
        const computed = resolveEditorOptions({}, { os: hostOs }) as unknown as Record<string, unknown>
        const envDependent = new Set(['fontSize', 'lineHeight', 'fontVariations', 'lineDecorationsWidth'])
        for (const o of Object.values(monaco.EditorOptions)) {
            if (o.name === '_never_' || envDependent.has(o.name)) continue
            expect(computed[o.name], o.name).toEqual(o.defaultValue)
        }
        // 字号 / 行高来自 fontInfo:mac 默认 12 / round(1.5 × 12)
        expect(computed.fontSize).toBe(hostOs === 'mac' ? 12 : 14)
        expect(computed.lineHeight).toBe(hostOs === 'mac' ? 18 : Math.round(1.35 * 14))
        expect(computed.fontVariations).toBe('normal')
        expect(computed.lineDecorationsWidth).toBe(10)
    })

    it('没有名字的 5 个计算项也有值', () => {
        const c = resolveEditorOptions({})
        expect(c.fontInfo.fontSize).toBe(c.fontSize)
        expect(c.layoutInfo.width).toBe(0)
        expect(c.wrappingInfo.isViewportWrapping).toBe(false)
        expect(c.pixelRatio).toBe(1)
        expect(c.editorClassName).toContain('monaco-editor')
    })

    it('平台:win / linux 的 fontFamily / fontSize / renderFinalNewline / 黄金行高', () => {
        const mac = resolveEditorOptions({}, { os: 'mac' })
        const win = resolveEditorOptions({}, { os: 'win' })
        const linux = resolveEditorOptions({}, { os: 'linux' })
        expect(mac.fontFamily).toBe("Menlo, Monaco, 'Courier New', monospace")
        expect(win.fontFamily).toBe("Consolas, 'Courier New', monospace")
        expect(linux.fontFamily).toBe("'Droid Sans Mono', 'monospace', monospace")
        expect([mac.fontSize, win.fontSize, linux.fontSize]).toEqual([12, 14, 14])
        expect([mac.lineHeight, win.lineHeight]).toEqual([18, 19])
        expect([mac.renderFinalNewline, win.renderFinalNewline, linux.renderFinalNewline]).toEqual(['on', 'on', 'dimmed'])
        expect([mac.multiCursorModifier, resolveEditorOptions({ multiCursorModifier: 'ctrlCmd' }, { os: 'mac' }).multiCursorModifier, resolveEditorOptions({ multiCursorModifier: 'ctrlCmd' }, { os: 'win' }).multiCursorModifier]).toEqual(['altKey', 'metaKey', 'ctrlKey'])
        expect(platformDefaults('win').fontSize).toBe(14)
    })
})

describe('resolveEditorOptions', () => {
    it('老写法先迁移:lineNumbers: true → on,hover: false → enabled: false', () => {
        const c = resolveEditorOptions({ lineNumbers: true, hover: false, quickSuggestions: false } as unknown as IEditorOptions)
        expect(c.lineNumbers.renderType).toBe(1)
        expect(c.hover.enabled).toBe(false)
        expect(c.hover.delay).toBe(300)
        expect(c.quickSuggestions).toEqual({ other: 'off', comments: 'off', strings: 'off' })
    })

    it('不改入参', () => {
        const raw = { lineNumbers: true, hover: false } as unknown as IEditorOptions
        resolveEditorOptions(raw)
        expect(raw).toEqual({ lineNumbers: true, hover: false })
    })

    it('错误类型、越界回落默认或夹取', () => {
        const c = resolveEditorOptions({ tabIndex: 'x', fontSize: 500, cursorWidth: -4, wordWrap: 'bad', minimap: 5, scrollbar: { verticalScrollbarSize: 'big' } } as unknown as IEditorOptions, { os: 'mac' })
        expect(c.tabIndex).toBe(0)
        expect(c.fontSize).toBe(100)
        expect(c.cursorWidth).toBe(0)
        expect(c.wordWrap).toBe('off')
        expect(c.minimap.enabled).toBe(true)
        expect(c.scrollbar.verticalScrollbarSize).toBe(14)
    })

    it('rulers 排序,数字变 {column, color: null}', () => {
        const c = resolveEditorOptions({ rulers: [120, { column: 80, color: 'red' }, 'x'] } as unknown as IEditorOptions)
        const expected: IRulerOption[] = [{ column: 80, color: 'red' }, { column: 120, color: null }]
        expect(c.rulers).toEqual(expected)
    })

    it('环境输入:尺寸 / pixelRatio / 度量函数传到 layoutInfo', () => {
        const env: ResolveEnv = {
            os: 'mac', outerWidth: 1000, outerHeight: 500, pixelRatio: 2, viewLineCount: 10,
            measureFont: bare => ({ ...estimateFontInfo(bare), typicalHalfwidthCharacterWidth: 10, maxDigitWidth: 10 }),
        }
        const c = resolveEditorOptions({ minimap: { enabled: false }, lineNumbers: 'off', glyphMargin: false, folding: false, lineDecorationsWidth: 0, scrollbar: { verticalScrollbarSize: 0 } }, env)
        expect(c.layoutInfo.width).toBe(1000)
        expect(c.layoutInfo.contentWidth).toBe(1000)
        expect(c.layoutInfo.viewportColumn).toBe(Math.floor((1000 - 0 - 2) / 10))
        expect(c.pixelRatio).toBe(2)
        expect(c.fontInfo.typicalHalfwidthCharacterWidth).toBe(10)
    })
})

describe('mergeRawOptions(Monaco updateOptions 的合并语义)', () => {
    it('嵌套对象深合并,不改 base / patch', () => {
        const base: IEditorOptions = { find: { loop: false }, minimap: { scale: 2 } }
        const patch: IEditorOptions = { find: { cursorMoveOnType: false }, minimap: { side: 'left' } }
        const out = mergeRawOptions(base, patch)
        expect(out).toEqual({ find: { loop: false, cursorMoveOnType: false }, minimap: { scale: 2, side: 'left' } })
        expect(base).toEqual({ find: { loop: false }, minimap: { scale: 2 } })
        expect(patch).toEqual({ find: { cursorMoveOnType: false }, minimap: { side: 'left' } })
        expect(out.find).not.toBe(base.find)
    })

    it('原始值、数组整体替换;undefined 清回默认', () => {
        const out = mergeRawOptions({ fontSize: 14, rulers: [80, 100], wordWrap: 'on' }, { fontSize: 16, rulers: [120], wordWrap: undefined })
        expect(out.fontSize).toBe(16)
        expect(out.rulers).toEqual([120])
        expect(out.wordWrap).toBeUndefined()
        expect(resolveEditorOptions(out).wordWrap).toBe('off')
    })

    it('类型不同整体替换(false → 对象,对象 → null)', () => {
        expect(mergeRawOptions({ minimap: false as never }, { minimap: { side: 'left' } }).minimap).toEqual({ side: 'left' })
        expect(mergeRawOptions({ minimap: { side: 'left' } }, { minimap: null as never }).minimap).toBeNull()
    })

    it('patch 里不是选项名的键被丢弃', () => {
        const out = mergeRawOptions({ fontSize: 14 }, { fontSize: 15, nonsense: 1 } as IEditorOptions)
        expect(out).toEqual({ fontSize: 15 })
    })

    it('patch 先迁移老写法再合并:hover: false 合进已有的 hover 对象', () => {
        const out = mergeRawOptions({ hover: { delay: 5 } }, { hover: false } as unknown as IEditorOptions)
        expect(out.hover).toEqual({ delay: 5, enabled: false })
        expect(mergeRawOptions({}, { lineNumbers: true } as unknown as IEditorOptions).lineNumbers).toBe('on')
    })

    it('unicodeHighlight:allowedCharacters / allowedLocales 整体替换,其它字段合并', () => {
        const out = mergeRawOptions(
            { unicodeHighlight: { allowedCharacters: { a: true }, allowedLocales: { zh: true }, invisibleCharacters: false } },
            { unicodeHighlight: { allowedCharacters: { b: true }, ambiguousCharacters: false } },
        )
        expect(out.unicodeHighlight).toEqual({ allowedCharacters: { b: true }, allowedLocales: { zh: true }, invisibleCharacters: false, ambiguousCharacters: false })
        // 普通对象则是逐键合并
        expect(mergeRawOptions({ gotoLocation: { multiple: 'goto' } }, { gotoLocation: { multipleReferences: 'goto' } }).gotoLocation).toEqual({ multiple: 'goto', multipleReferences: 'goto' })
    })

    it('applyRawUpdate 返回有没有变化', () => {
        const raw: IEditorOptions = { find: { loop: false }, fontSize: 14, rulers: [80] }
        expect(applyRawUpdate(raw, { find: { loop: false } })).toBe(false)
        expect(applyRawUpdate(raw, { fontSize: 14 })).toBe(false)
        expect(applyRawUpdate(raw, { rulers: [80] })).toBe(false)
        expect(applyRawUpdate(raw, { rulers: [80, 90] })).toBe(true)
        expect(applyRawUpdate(raw, { find: { loop: true } })).toBe(true)
        expect(raw.find).toEqual({ loop: true })
    })

    it('逐选项对照 Monaco 的 applyUpdate(newValue 与 didChange)', async () => {
        const monaco = await loadMonaco()
        const pool: unknown[] = [undefined, null, true, false, 0, 5, 'a', 'b', [], [1, 2], [1, 2], { x: 1 }, { x: 1, y: { z: 2 } }, { y: { z: 3 } }, { y: 5 }, { x: 1, extra: [1] }]
        let compared = 0
        const failures: string[] = []
        const equal = (x: unknown, y: unknown) => { try { expect(x).toEqual(y); return true } catch { return false } }
        for (const o of Object.values(monaco.EditorOptions)) {
            if (o.name === '_never_') continue
            const extra: unknown[] = []
            if (o.defaultValue && typeof o.defaultValue === 'object' && !Array.isArray(o.defaultValue)) {
                const keys = Object.keys(o.defaultValue)
                extra.push(o.defaultValue, { [keys[0]]: 'changed' }, { [keys[keys.length - 1]]: null })
            }
            if (o.name === 'unicodeHighlight') extra.push({ allowedCharacters: { a: true } }, { allowedCharacters: { a: true }, allowedLocales: { zh: true } }, { allowedLocales: {} })
            for (const a of [...pool, ...extra]) {
                for (const b of [...pool, ...extra]) {
                    const raw: Record<string, unknown> = { [o.name]: deepClone(a) }
                    // Monaco 的 unicodeHighlight.applyUpdate 遇到 update 为 undefined / null 会抛(读 update.allowedCharacters),我们不抛
                    let mo: { newValue: unknown, didChange: boolean }
                    try {
                        mo = (o as unknown as { applyUpdate(v: unknown, u: unknown): { newValue: unknown, didChange: boolean } }).applyUpdate(deepClone(a), deepClone(b))
                    } catch {
                        expect(o.name).toBe('unicodeHighlight')
                        expect(() => applyRawUpdate(raw as IEditorOptions, { [o.name]: deepClone(b) } as IEditorOptions)).not.toThrow()
                        continue
                    }
                    const changed = applyRawUpdate(raw as IEditorOptions, { [o.name]: deepClone(b) } as IEditorOptions)
                    compared++
                    // 数万组合,只在不一致时才走 expect(省掉几万次断言开销)
                    if (changed !== mo.didChange || !equal(raw[o.name], mo.newValue)) {
                        failures.push(`${o.name}: ${JSON.stringify(a)} ← ${JSON.stringify(b)}: ours=${JSON.stringify(raw[o.name])}/${changed} monaco=${JSON.stringify(mo.newValue)}/${mo.didChange}`)
                    }
                }
            }
        }
        expect(failures.slice(0, 10)).toEqual([])
        expect(compared).toBeGreaterThan(30000)
    }, 60_000)
})

describe('configurationChange(ConfigurationChangedEvent)', () => {
    const resolve = (raw: IEditorOptions) => resolveEditorOptions(raw, { os: 'mac' })

    it('没变 → null(Monaco 不发事件)', () => {
        expect(configurationChange(resolve({ fontSize: 14 }), resolve({ fontSize: 14 }))).toBeNull()
    })

    it('hasChanged(id) 只有变了的为 true;options 是新值;changed 是变了的集合', () => {
        const prev = resolve({})
        const next = resolve({ minimap: { enabled: false }, tabIndex: 3 })
        const ev = configurationChange(prev, next)!
        expect(ev).toBeInstanceOf(ConfigurationChangedEvent)
        expect(ev.hasChanged(EditorOption.minimap)).toBe(true)
        expect(ev.hasChanged(EditorOption.tabIndex)).toBe(true)
        expect(ev.hasChanged(EditorOption.find)).toBe(false)
        expect(ev.hasChanged(EditorOption.fontSize)).toBe(false)
        expect(ev.options).toBe(next)
        // minimap 变了会连带 layoutInfo 变
        expect([...ev.changed].sort((a, b) => a - b)).toEqual([EditorOption.minimap, EditorOption.tabIndex, EditorOption.layoutInfo])
    })

    it('改字号连带 fontInfo / lineHeight / layoutInfo 等计算项一起变', () => {
        const ev = configurationChange(resolve({}), resolve({ fontSize: 20 }))!
        for (const id of [EditorOption.fontSize, EditorOption.fontInfo, EditorOption.lineHeight]) expect(ev.hasChanged(id)).toBe(true)
        expect(ev.hasChanged(EditorOption.wordWrap)).toBe(false)
    })

    it('嵌套对象按值比较;rulers 这类对象数组按 Monaco 的 === 比较,重新校验后算变', () => {
        const a = resolve({ find: { loop: false } })
        const b = resolve({ find: { loop: false } })
        expect(a.find).not.toBe(b.find)
        expect(configurationChange(a, b)).toBeNull()
        const r1 = resolve({ rulers: [{ column: 80 }] } as unknown as IEditorOptions)
        const r2 = resolve({ rulers: [{ column: 80 }] } as unknown as IEditorOptions)
        expect(configurationChange(r1, r2)!.hasChanged(EditorOption.rulers)).toBe(true)
        expect(configurationChange(resolve({ rulers: [80] }), resolve({ rulers: [] }))!.hasChanged(EditorOption.rulers)).toBe(true)
    })

    it('所有 151 个 id 都能问 hasChanged', () => {
        const ev = configurationChange(resolve({}), resolve({ readOnly: true }))!
        for (let id = 0; id < EDITOR_OPTION_NAMES.length; id++) expect(typeof ev.hasChanged(id)).toBe('boolean')
        expect(ev.hasChanged(EditorOption.readOnly)).toBe(true)
    })
})

describe('editorOptions facet 与 getOption / getOptionById', () => {
    it('没有提供者 → Monaco 默认值(裸 EditorState)', () => {
        const state = EditorState.create({ doc: '' })
        expect(getOption(state, 'find')).toEqual({ cursorMoveOnType: true, findOnType: true, seedSearchStringFromSelection: 'always', autoFindInSelection: 'never', globalFindClipboard: false, addExtraSpaceOnTop: true, loop: true, history: 'workspace', replaceHistory: 'workspace' })
        expect(getOption(state, 'tabSize' as never)).toBeUndefined()
        expect(getOption(state, 'readOnly')).toBe(false)
    })

    it('多个提供者:后者覆盖前者,嵌套对象深合并', () => {
        const state = EditorState.create({
            doc: '',
            extensions: [
                editorOptions.of({ find: { loop: false }, minimap: { scale: 2 }, fontSize: 13 }),
                editorOptions.of({ find: { cursorMoveOnType: false }, fontSize: 15 }),
            ],
        })
        expect(getOption(state, 'find').loop).toBe(false)
        expect(getOption(state, 'find').cursorMoveOnType).toBe(false)
        expect(getOption(state, 'find').addExtraSpaceOnTop).toBe(true)
        expect(getOption(state, 'minimap').scale).toBe(2)
        expect(getOption(state, 'fontSize')).toBe(15)
    })

    it('多个提供者:老写法按 updateOptions 的顺序迁移再合并', () => {
        const state = EditorState.create({
            doc: '',
            extensions: [editorOptions.of({ hover: { delay: 5 } }), editorOptions.of({ hover: false } as unknown as IEditorOptions)],
        })
        expect(getOption(state, 'hover')).toMatchObject({ enabled: false, delay: 5 })
    })

    it('getOption 返回精确类型(编译期检查) 且与 getOptionById 一致', () => {
        const state = EditorState.create({ doc: '', extensions: [editorOptions.of({ find: { loop: false }, lineNumbers: 'relative' })] })
        const find: Readonly<Required<IEditorFindOptions>> = getOption(state, 'find')
        const loop: boolean = getOption(state, 'find').loop
        const wrap: 'simple' | 'advanced' = getOption(state, 'wrappingStrategy')
        const byId: Readonly<Required<IEditorFindOptions>> = getOptionById(state, EditorOption.find)
        expect(loop).toBe(false)
        expect(wrap).toBe('simple')
        expect(byId).toBe(find)
        expect(getOptionById(state, EditorOption.lineNumbers).renderType).toBe(2)
        // 计算项也能取
        expect(getOptionById(state, EditorOption.layoutInfo)).toBe(getOption(state, 'layoutInfo'))
        expect(getOptionById(state, EditorOption.wrappingInfo).wrappingColumn).toBe(-1)
    })

    it('EditorOption 的每个值都能经 getOptionById 取到(和选项名对应)', () => {
        const state = EditorState.create({ doc: '' })
        const all = state.facet(editorOptions) as unknown as Record<string, unknown>
        for (let id = 0; id < EDITOR_OPTION_NAMES.length; id++) {
            expect(getOptionById(state, id as never), String(id)).toBe(all[OPTION_KEYS[id]])
        }
    })
})

describe('validateContext', () => {
    it('三个平台的默认表', () => {
        expect(validateContext('mac').defaults.fontSize).toBe(12)
        expect(validateContext('win').defaults.fontSize).toBe(14)
        expect(validateContext('linux').defaults.renderFinalNewline).toBe('dimmed')
    })
})

describe('ComputeOptionsMemory', () => {
    it('可以复用同一份 memory 反复算 layoutInfo(minimap fit + 视口换行不抖动)', () => {
        const memory = new ComputeOptionsMemory()
        const raw: IEditorOptions = { minimap: { size: 'fit' }, wordWrap: 'on' }
        const a = resolveEditorOptions(raw, { os: 'mac', memory, outerWidth: 1000, outerHeight: 700, viewLineCount: 40, pixelRatio: 2 })
        const b = resolveEditorOptions(raw, { os: 'mac', memory, outerWidth: 1000, outerHeight: 700, viewLineCount: 41, pixelRatio: 2 })
        expect(a.layoutInfo.minimap.minimapScale).toBeGreaterThanOrEqual(1)
        expect(b.layoutInfo.minimap.minimapScale).toBeLessThanOrEqual(a.layoutInfo.minimap.minimapScale)
    })
})
