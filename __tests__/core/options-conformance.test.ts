import { describe, expect, it } from 'vitest'
import { EDITOR_DEFAULTS, EDITOR_OPTION_NAMES, OPTION_SPECS, PLATFORM_DEFAULTS } from '../../src/core/options/generated'
import {
    boolean, clampedFloat, clampedInt, primitiveSet, stringSet, validateContext, validateOption, VALIDATORS,
} from '../../src/core/options/validate'
import { deepClone } from '../../src/core/options/merge'
import { hostOs, loadMonaco, runRef } from './options-ref'

// 对照 Monaco:对每个选项造探针输入,比较我们的 validate 与 Monaco 真实 EditorOptions[k].validate(probe)。
// 本进程里的 Monaco 用本机平台(hostOs);其它两个平台用子进程跑参照(平台影响 fontSize / renderFinalNewline /
// fontFamily 的默认值和 multiCursorModifier 的 ctrlCmd 映射)。

const fn = (n: number) => String(n)

/** 通用探针:undefined / null / 错误类型 / 边界 / 字符串化的布尔与数字 */
const GENERIC: unknown[] = [
    undefined, null, true, false, 0, 1, -1, 2, 5, 10, 100, 1000, 10000, 1.5, -1.5, 0.4, 1e9, NaN, Infinity, -Infinity,
    '', ' ', 'true', 'false', 'on', 'off', 'abc', '10', '10px', '1.5', '-3', '0', 'inline', 'always', 'never', 'auto',
    {}, [], [1], ['a'], { foo: 1 }, fn,
]

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** 个别选项的专门探针(叠加在通用探针上) */
const SPECIFIC: Record<string, unknown[]> = {
    lineNumbers: ['on', 'off', 'relative', 'interval', fn, true, false, 'ON'],
    quickSuggestions: [true, false, { other: true, comments: false, strings: 'inline' }, { other: 'on' }, { comments: 'x' }, { other: 'off', comments: 'on', strings: 'inline' }, { other: 1 }],
    padding: [{ top: 5 }, { bottom: '7' }, { top: -1, bottom: 5000 }, { top: 'x', bottom: 1.9 }],
    rulers: [[80, 120], [{ column: 100, color: 'red' }], [120, { column: 80 }, 'x', null, 3], [{ column: '40' }, { column: -5 }, { column: 99999 }], [10, 5, 1], [{ color: 1 }]],
    lineDecorationsWidth: ['2ch', '1.5ch', '0ch', 'ch', '2 ch', '2CH', '20', 5000, -5, '12.5', '3.0ch', 10, 999.9],
    fontWeight: ['normal', 'bold', '100', 600, '600', 1000, 1001, 0, 1, '1.5', 'bolder', 'lighter', 400.6, -4],
    fontLigatures: [true, false, 'true', 'false', '"ss01" on', '', 0, 1, 'liga'],
    fontVariations: [true, false, 'true', 'false', '"wght" 500', '', 0, 1],
    fontSize: [0, '0', 5.9, 6, 100, 101, '13.5', 12, 14, 13.4, -3],
    lineHeight: [0, 1, 1.5, 7.9, 8, 20, 150, 151, '20', '1.2', -2],
    accessibilitySupport: ['auto', 'on', 'off', 'AUTO', 0, 1, 2],
    wrappingIndent: ['none', 'same', 'indent', 'deepIndent', 'deep', 0, 1],
    wrappingStrategy: ['simple', 'advanced', 'other'],
    readOnlyMessage: [{ value: 'hi' }, { value: 'x', isTrusted: true }, 'text', 0, []],
    placeholder: ['type here', '', 5, {}],
    wordSegmenterLocales: ['en', 'zh', 'ja', ['en', 'zh-CN'], ['xx-invalid-locale!!'], ['en', 5, null, 'fr'], '!!', []],
    multiCursorModifier: ['ctrlCmd', 'alt', 'altKey', 'ctrlKey', 'metaKey', 'CTRLCMD'],
    unicodeHighlight: [
        { allowedCharacters: { a: true, b: false, c: 1 }, allowedLocales: { zh: true, _os: false } },
        { nonBasicASCII: true, includeComments: false, includeStrings: 'inUntrustedWorkspace' },
        { nonBasicASCII: 'yes', includeComments: 1, includeStrings: null },
        { allowedCharacters: null, allowedLocales: 'x' },
    ],
    gotoLocation: [{ multipleDefinitions: 'weird' }, { multipleDefinitions: 5 }, { multiple: 'goto', multipleReferences: 'gotoAndPeek' }, { multipleTests: null }, { alternativeDefinitionCommand: 5 }],
    inlayHints: [{ enabled: true }, { enabled: false }, { enabled: 'offUnlessPressed' }, { enabled: 'bad', fontSize: 200 }, { fontFamily: 7, padding: 'true' }],
    find: [{ seedSearchStringFromSelection: true }, { seedSearchStringFromSelection: false }, { autoFindInSelection: true }, { autoFindInSelection: 'multiline' }, { loop: 'false' }],
    scrollbar: [
        { vertical: 'hidden', horizontal: 'visible' }, { vertical: 'whatever', horizontal: 3 },
        { verticalScrollbarSize: 20 }, { horizontalScrollbarSize: 3, verticalSliderSize: 9 }, { verticalScrollbarSize: 2000, verticalSliderSize: -2 },
    ],
    minimap: [{ scale: 2 }, { scale: 9 }, { sectionHeaderFontSize: 100 }, { sectionHeaderLetterSpacing: -3 }, { sectionHeaderFontSize: 'x' }, { size: 'fit', side: 'left', showSlider: 'always' }],
    suggest: [{ snippetsPreventQuickSuggestions: undefined }, { snippetsPreventQuickSuggestions: false }, { showMethods: false, showWords: 'false' }, { selectionMode: 'never', previewMode: 'prefix', insertMode: 'replace' }],
    guides: [{ bracketPairs: 'active', bracketPairsHorizontal: true, highlightActiveIndentation: 'always' }, { bracketPairs: 'x', highlightActiveIndentation: 'active' }],
    stickyScroll: [{ maxLineCount: 0 }, { maxLineCount: 30 }, { defaultModel: 'indentationModel' }],
    hover: [{ delay: -5 }, { delay: 20000 }, { hidingDelay: 700000 }, { sticky: 'false' }],
    lightbulb: [{ enabled: 'on' }, { enabled: 'off' }, { enabled: true }, { enabled: 'onCode' }],
    comments: [{ insertSpace: false }, { ignoreEmptyLines: 'false' }],
    emptySelectionClipboard: [true, false, 'false'],
}

/** 每个选项都试:通用探针 + 规格里的取值与边界 + 专门探针 */
function probesFor(name: string, defaultValue: unknown): unknown[] {
    const probes: unknown[] = [...GENERIC, ...(SPECIFIC[name] ?? [])]
    const spec = OPTION_SPECS[name]
    if (spec) {
        if (spec.t === 'int') probes.push(spec.min - 1, spec.min, spec.min + 1, spec.max - 1, spec.max, spec.max + 1, String(spec.min), String(spec.max))
        if (spec.t === 'enum' || spec.t === 'enumMap') probes.push(...spec.values, ...spec.values.map(v => v.toUpperCase()), ...spec.values.map(v => ' ' + v))
    }
    probes.push(defaultValue)
    // 对象型选项:逐字段 × 通用探针(嵌套的错误字段)
    if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
        const keys = Object.keys(defaultValue as object)
        for (const k of keys) {
            for (const p of [...GENERIC, ...DIGITS]) probes.push({ [k]: p })
            probes.push({ [k]: (defaultValue as Record<string, unknown>)[k] })
        }
        // 部分对象:一半的字段取默认
        probes.push(Object.fromEntries(keys.slice(0, Math.ceil(keys.length / 2)).map(k => [k, (defaultValue as Record<string, unknown>)[k]])))
        probes.push({ ...(defaultValue as object), extra: 1 })
    }
    return probes
}

describe('选项覆盖:每个 Monaco 选项都有校验器', () => {
    it('173 个选项(0.55.1),除 8 个计算项(_never_)外都有通用规格或手写校验器', () => {
        expect(EDITOR_OPTION_NAMES.length).toBe(173)
        const missing: string[] = []
        for (const name of EDITOR_OPTION_NAMES) {
            if (name === '_never_') continue
            if (!VALIDATORS[name] && !OPTION_SPECS[name]) missing.push(name)
        }
        expect(missing).toEqual([])
        expect(EDITOR_OPTION_NAMES.filter(n => n === '_never_').length).toBe(8)
    })

    it('手写校验器 ≈ 39 个复杂选项', () => {
        expect(Object.keys(VALIDATORS).length).toBeGreaterThanOrEqual(39)
    })
})

describe('辅助函数与 Monaco 一致', () => {
    it('boolean / clampedInt / clampedFloat / stringSet / primitiveSet', async () => {
        const m = await import(/* @vite-ignore */ new URL('../../node_modules/monaco-editor/esm/vs/editor/common/config/editorOptions.js', import.meta.url).pathname)
        for (const v of GENERIC) {
            expect(boolean(v, true), `boolean(${String(v)}, true)`).toEqual(m.boolean(v, true))
            expect(boolean(v, false)).toEqual(m.boolean(v, false))
            expect(clampedInt(v, 7, 1, 20), `clampedInt(${String(v)})`).toEqual(m.clampedInt(v, 7, 1, 20))
            expect(clampedFloat(v, 7, -2, 20), `clampedFloat(${String(v)})`).toEqual(m.clampedFloat(v, 7, -2, 20))
            expect(stringSet(v, 'a', ['a', 'b']), `stringSet(${String(v)})`).toEqual(m.stringSet(v, 'a', ['a', 'b']))
            expect(stringSet(v, 'a', ['a', 'b'], { on: 'b' })).toEqual(m.stringSet(v, 'a', ['a', 'b'], { on: 'b' }))
        }
    })

    it('primitiveSet:true / false / 字符串混合集合', () => {
        const allowed = [true, false, 'active'] as const
        expect(primitiveSet(true, 'active', allowed)).toBe(true)
        expect(primitiveSet(false, 'active', allowed)).toBe(false)
        expect(primitiveSet('active', false, allowed)).toBe('active')
        expect(primitiveSet('x', false, allowed)).toBe(false)
        expect(primitiveSet(undefined, true, allowed)).toBe(true)
        expect(primitiveSet(null, true, allowed)).toBe(true)
        expect(primitiveSet(1, true, allowed)).toBe(true)
    })
})

describe('validate 对照 Monaco(本机平台)', () => {
    it('每个选项 × 探针,结果与 Monaco 的 validate 深度相等', async () => {
        const monaco = await loadMonaco()
        const ctx = validateContext(hostOs)
        let compared = 0
        const failures: string[] = []
        for (const o of Object.values(monaco.EditorOptions)) {
            if (o.name === '_never_') continue
            // 默认值本身一致
            expect(ctx.defaults[o.name], `default of ${o.name}`).toEqual(o.defaultValue)
            for (const probe of probesFor(o.name, o.defaultValue)) {
                if (typeof probe === 'symbol') continue
                let expected: unknown
                let actual: unknown
                try { expected = o.validate(deepClone(probe)) } catch (e) { expected = `throws:${(e as Error).name}` }
                try { actual = validateOption(o.name, deepClone(probe), ctx) } catch (e) { actual = `throws:${(e as Error).name}` }
                compared++
                try {
                    expect(actual).toEqual(expected)
                } catch {
                    failures.push(`${o.name}(${typeof probe === 'function' ? 'fn' : JSON.stringify(probe)}): ours=${JSON.stringify(actual)} monaco=${JSON.stringify(expected)}`)
                }
            }
        }
        expect(failures.slice(0, 20)).toEqual([])
        expect(compared).toBeGreaterThan(5000)
    })

    it('校验不改入参(Monaco 的 inlayHints.validate 会改,这里不改,结果相同)', () => {
        const input = { enabled: true as unknown, fontSize: 12 }
        const out = validateOption('inlayHints', input, validateContext('mac')) as { enabled: string }
        expect(out.enabled).toBe('on')
        expect(input.enabled).toBe(true)
    })

    it('Monaco 的怪癖原样保留', () => {
        const ctx = validateContext('mac')
        // gotoLocation:0.52 的 multipleXxx 用 ?? 原值放行;0.55 改成 stringSet,非法值回落 'peek'
        expect((validateOption('gotoLocation', { multipleDefinitions: 'weird' }, ctx) as { multipleDefinitions: string }).multipleDefinitions).toBe('peek')
        // suggest.snippetsPreventQuickSuggestions 的默认取的是 filterGraceful 的默认(true)
        expect((validateOption('suggest', {}, ctx) as { snippetsPreventQuickSuggestions: boolean }).snippetsPreventQuickSuggestions).toBe(true)
        expect((validateOption('suggest', undefined, ctx) as { snippetsPreventQuickSuggestions: boolean }).snippetsPreventQuickSuggestions).toBe(false)
        // minimap.scale 的默认是 1,不是别的
        expect((validateOption('minimap', { scale: 'x' }, ctx) as { scale: number }).scale).toBe(1)
        // lineNumbers: true 没经过迁移就是 off(迁移在 resolveEditorOptions 里做)
        expect(validateOption('lineNumbers', true, ctx)).toEqual({ renderType: 0, renderFn: null })
    })
})

describe('validate 对照 Monaco(其它平台,子进程参照)', () => {
    const PLATFORMS = [['darwin', 'mac'], ['win32', 'win'], ['linux', 'linux']] as const
    const PROBES = [undefined, null, 0, '0', 5, 13, 13.5, 200, 'x', true, 'ctrlCmd', 'alt', 'altKey', 'on', 'off', 'dimmed', true, false]
    const NAMES = ['fontSize', 'fontFamily', 'renderFinalNewline', 'multiCursorModifier', 'lineHeight', 'fontWeight', 'letterSpacing']

    for (const [plat, os] of PLATFORMS) {
        it(`${plat}:默认值表与带平台差异的 validate`, () => {
            const ref = runRef<{ defaults: Record<string, unknown>, validate: Record<string, unknown[]> }>(plat, `
const probes = ${JSON.stringify(PROBES)}
const names = ${JSON.stringify(NAMES)}
const defaults = {}
for (const o of Object.values(m.EditorOptions)) if (o.name !== '_never_') defaults[o.name] = o.defaultValue
const validate = {}
for (const n of names) validate[n] = probes.map(p => m.EditorOptions[n].validate(p))
out({ defaults, validate })`)
            const ctx = validateContext(os)
            // 整张默认值表(含平台差异的那几项)
            expect(JSON.parse(JSON.stringify(ctx.defaults))).toEqual(ref.defaults)
            for (const n of NAMES) {
                const ours = PROBES.map(p => validateOption(n, p, ctx))
                expect(JSON.parse(JSON.stringify(ours)), n).toEqual(ref.validate[n])
            }
        })
    }

    it('PLATFORM_DEFAULTS 只列与 mac 不同的项,且 win / linux 的字体与字号正确', () => {
        expect(PLATFORM_DEFAULTS.win.fontFamily).toBe("Consolas, 'Courier New', monospace")
        expect(PLATFORM_DEFAULTS.win.fontSize).toBe(14)
        expect(PLATFORM_DEFAULTS.linux.fontFamily).toBe("'Droid Sans Mono', 'monospace', monospace")
        expect(PLATFORM_DEFAULTS.linux.renderFinalNewline).toBe('dimmed')
        expect(EDITOR_DEFAULTS.fontSize).toBe(12)
    })
})
