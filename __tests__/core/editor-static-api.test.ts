// monaco.editor 的静态一族:onDidCreateEditor / getEditors / getDiffEditors / addCommand / registerCommand /
// remeasureFonts / EditorType / ApplyUpdateResult / EditorOptions / FontInfo / BareFontInfo。
// 凡是 Monaco 自己的代码能直接加载的(EditorOptions、fontInfo.js),一律对着它逐项比对,不凭记忆写期望值。
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as monaco from '../../src/index'
import { createDiffEditor } from '../../src/diffeditor'
import { fakeHl, QUIET } from './h1-helpers'
import { loadMonaco, MONACO_CONFIG, runRef } from './options-ref'
import { keyOS } from '../../src/core/keyos'
import { EDITOR_OPTION_NAMES } from '../../src/core/options'

const disposables: { dispose(): void }[] = []
const cleanups: (() => void)[] = []
afterEach(() => {
    for (const d of disposables.splice(0)) d.dispose()
    for (const c of cleanups.splice(0)) c()
})

function box(): HTMLElement { const el = document.createElement('div'); document.body.appendChild(el); cleanups.push(() => el.remove()); return el }
function edit(value = 'one\ntwo') {
    const ed = monaco.editor.create(box(), { highlighter: fakeHl(), value, language: 'text', features: QUIET })
    cleanups.push(() => { try { ed.dispose() } catch { /* 已销毁 */ } })
    return ed
}

describe('EditorType / getEditorType', () => {
    it('值与 Monaco 一致', () => {
        expect(monaco.editor.EditorType).toEqual({ ICodeEditor: 'vs.editor.ICodeEditor', IDiffEditor: 'vs.editor.IDiffEditor' })
    })
    it('代码编辑器返回 ICodeEditor,diff 编辑器返回 IDiffEditor', () => {
        expect(edit().getEditorType()).toBe(monaco.editor.EditorType.ICodeEditor)
        const d = createDiffEditor(box(), { highlighter: fakeHl(), lang: 'text', original: 'a', modified: 'b' })
        cleanups.push(() => d.dispose())
        expect((d as unknown as { getEditorType(): string }).getEditorType()).toBe(monaco.editor.EditorType.IDiffEditor)
    })
})

describe('getEditors / onDidCreateEditor', () => {
    it('创建后出现在 getEditors,销毁后消失,事件带实例', () => {
        const seen: unknown[] = []
        disposables.push(monaco.editor.onDidCreateEditor(e => seen.push(e)))
        const before = monaco.editor.getEditors().length
        const ed = edit()
        expect(seen).toContain(ed)
        expect(monaco.editor.getEditors()).toContain(ed)
        expect(monaco.editor.getEditors().length).toBe(before + 1)
        ed.dispose()
        expect(monaco.editor.getEditors()).not.toContain(ed)
    })
    it('监听器退订后不再收事件', () => {
        const fn = vi.fn()
        monaco.editor.onDidCreateEditor(fn).dispose()
        edit()
        expect(fn).not.toHaveBeenCalled()
    })
    it('getEditors 返回的是快照,不是活引用', () => {
        const snap = monaco.editor.getEditors()
        const n = snap.length
        edit()
        expect(snap.length).toBe(n)
    })
})

describe('getDiffEditors / onDidCreateDiffEditor', () => {
    it('diff 编辑器登记 / 注销;事件带实例;内部两侧也是代码编辑器', () => {
        const seen: unknown[] = []
        const seenCode: unknown[] = []
        disposables.push(monaco.editor.onDidCreateDiffEditor(e => seen.push(e)))
        disposables.push(monaco.editor.onDidCreateEditor(e => seenCode.push(e)))
        const d = createDiffEditor(box(), { highlighter: fakeHl(), lang: 'text', original: 'a', modified: 'b' })
        expect(seen).toContain(d)
        expect(monaco.editor.getDiffEditors()).toContain(d)
        // Monaco:diff 编辑器的两侧是真的 code editor,创建时各发一次 onDidCreateEditor
        expect(seenCode).toContain(d.getOriginalEditor())
        expect(seenCode).toContain(d.getModifiedEditor())
        expect(monaco.editor.getEditors()).toContain(d.getModifiedEditor())
        d.dispose()
        expect(monaco.editor.getDiffEditors()).not.toContain(d)
        expect(monaco.editor.getEditors()).not.toContain(d.getModifiedEditor())
    })
})

describe('addCommand / registerCommand(全局命令表)', () => {
    it('addCommand 校验描述符,报错文案同 Monaco', () => {
        const bad = (d: unknown) => () => monaco.editor.addCommand(d as never)
        expect(bad({ id: 'x' })).toThrow('Invalid command descriptor, `id` and `run` are required properties!')
        expect(bad({ run() { } })).toThrow('Invalid command descriptor, `id` and `run` are required properties!')
        expect(bad({ id: 1, run() { } })).toThrow('Invalid command descriptor')
    })
    it('编辑器 trigger(id, payload) 落到全局命令:第一个参数是 accessor,其后是 payload', () => {
        const ed = edit()
        const run = vi.fn()
        disposables.push(monaco.editor.addCommand({ id: 'test.global.cmd1', run }))
        ed.trigger('test', 'test.global.cmd1', { a: 1 })
        expect(run).toHaveBeenCalledTimes(1)
        const [accessor, payload] = run.mock.calls[0]
        expect(typeof accessor.get).toBe('function')
        expect(payload).toEqual({ a: 1 })
    })
    it('payload 缺省时按 Monaco 传 {}', () => {
        const ed = edit()
        const run = vi.fn()
        disposables.push(monaco.editor.registerCommand('test.global.cmd2', run))
        ed.trigger('test', 'test.global.cmd2')
        expect(run.mock.calls[0][1]).toEqual({})
    })
    it('dispose 后命令消失;同 id 重复注册后注册的优先,它销毁后前一个复活', () => {
        const ed = edit()
        const a = vi.fn(); const b = vi.fn()
        const da = monaco.editor.registerCommand('test.global.dup', a)
        const db = monaco.editor.registerCommand('test.global.dup', b)
        ed.trigger('t', 'test.global.dup')
        expect(b).toHaveBeenCalledTimes(1); expect(a).not.toHaveBeenCalled()
        db.dispose()
        ed.trigger('t', 'test.global.dup')
        expect(a).toHaveBeenCalledTimes(1)
        da.dispose()
        ed.trigger('t', 'test.global.dup')
        expect(a).toHaveBeenCalledTimes(1)
    })
    it('所有编辑器共享;销毁的编辑器不影响全局命令', () => {
        const e1 = edit(); const e2 = edit()
        const run = vi.fn()
        disposables.push(monaco.editor.registerCommand('test.global.shared', run))
        e1.dispose()
        e2.trigger('t', 'test.global.shared')
        expect(run).toHaveBeenCalledTimes(1)
    })
    it('实例 addCommand 返回的 id 同样能被 trigger 打到(Monaco 里它也进 CommandsRegistry)', () => {
        const ed = edit()
        const run = vi.fn()
        const id = ed.addCommand(0, run)!
        ed.trigger('t', id, { z: 1 })
        expect(run).toHaveBeenCalledTimes(1)
    })
    it('内置 handler 不被全局命令抢走(type 仍是打字)', () => {
        const ed = edit('')
        const run = vi.fn()
        disposables.push(monaco.editor.registerCommand('type', run))
        ed.trigger('keyboard', 'type', { text: 'x' })
        expect(run).not.toHaveBeenCalled()
        expect(ed.getValue()).toBe('x')
    })
})

describe('ApplyUpdateResult', () => {
    it('是真 class:字段只读、可 new', () => {
        const r = new monaco.editor.ApplyUpdateResult(3, true)
        expect(r).toBeInstanceOf(monaco.editor.ApplyUpdateResult)
        expect(r.newValue).toBe(3); expect(r.didChange).toBe(true)
    })
})

describe('EditorOptions(对着 Monaco 真实的 EditorOptions)', () => {
    it('键集合、id、name 完全一致', async () => {
        const ref = (await loadMonaco()).EditorOptions
        const mine = monaco.editor.EditorOptions as unknown as Record<string, { id: number, name: string }>
        expect(Object.keys(mine).sort()).toEqual(Object.keys(ref).sort())
        for (const k of Object.keys(ref)) {
            expect(mine[k].id, `${k}.id`).toBe(ref[k].id)
            expect(mine[k].name, `${k}.name`).toBe(ref[k].name)
            expect(EDITOR_OPTION_NAMES[mine[k].id]).toBe(ref[k].name)
        }
    })
    it('defaultValue 逐项相等(平台 = 本进程的 keyOS;参照放子进程里按同一平台跑)', () => {
        const plat = keyOS === 'mac' ? 'darwin' : keyOS === 'win' ? 'win32' : 'linux'
        const ref = runRef<Record<string, unknown>>(plat, `
const d = {}
for (const [k, o] of Object.entries(m.EditorOptions)) d[k] = o.defaultValue === undefined ? null : o.defaultValue
out(d)`)
        const mine = monaco.editor.EditorOptions as unknown as Record<string, { defaultValue: unknown }>
        const bad: string[] = []
        for (const k of Object.keys(ref)) {
            const v = mine[k].defaultValue
            try { expect(JSON.parse(JSON.stringify(v === undefined ? null : v))).toEqual(ref[k]) } catch { bad.push(k) }
        }
        expect(bad, `平台 ${keyOS}`).toEqual([])
    })
    it('applyUpdate 与 Monaco 同结果(含 unicodeHighlight 的整体替换语义)', async () => {
        const ref = (await loadMonaco()).EditorOptions as unknown as Record<string, { applyUpdate(v: unknown, u: unknown): { newValue: unknown, didChange: boolean } }>
        const mine = monaco.editor.EditorOptions as unknown as typeof ref
        const cases: [string, () => unknown, () => unknown][] = [
            ['fontSize', () => 12, () => 14],
            ['fontSize', () => 12, () => 12],
            ['minimap', () => ({ enabled: true, side: 'right' }), () => ({ side: 'left' })],
            ['minimap', () => ({ enabled: true }), () => ({ enabled: true })],
            ['rulers', () => [1, 2], () => [1, 2]],
            ['rulers', () => [1, 2], () => [1, 3]],
            ['unicodeHighlight', () => ({ nonBasicASCII: 'inUntrustedWorkspace', allowedCharacters: { a: true }, allowedLocales: {} }), () => ({ allowedCharacters: { b: true } })],
            ['unicodeHighlight', () => ({ allowedCharacters: { a: true } }), () => ({ allowedCharacters: { a: true } })],
            ['bracketPairGuides', () => ({ indentation: true }), () => ({ indentation: false })],
        ]
        for (const [k, v, u] of cases) {
            const r = ref[k].applyUpdate(v(), u())
            const m = mine[k].applyUpdate(v(), u())
            expect({ newValue: m.newValue, didChange: m.didChange }, k).toEqual({ newValue: r.newValue, didChange: r.didChange })
            expect(m, k).toBeInstanceOf(monaco.editor.ApplyUpdateResult)
        }
    })
})

describe('BareFontInfo / FontInfo(对着 Monaco 的 fontInfo.js)', () => {
    const loadRef = () => import(/* @vite-ignore */ pathToFileURL(path.join(MONACO_CONFIG, 'fontInfo.js')).href) as Promise<{
        BareFontInfo: { _create(...a: unknown[]): { getId(): string, getMassagedFontFamily(): string, lineHeight: number, fontSize: number } }
        FontInfo: new (o: unknown, t: boolean) => { equals(o: unknown): boolean }
    }>
    const opts = { pixelRatio: 2, fontFamily: 'Fira Code', fontWeight: 'normal', fontSize: 14, fontFeatureSettings: 'normal', fontVariationSettings: 'normal', lineHeight: 20, letterSpacing: 0 }

    it('_create:行高 / 字号取整规则与 getId / getMassagedFontFamily 与 Monaco 一致(参照在子进程里按 keyOS 同平台跑)', () => {
        const plat = keyOS === 'mac' ? 'darwin' : keyOS === 'win' ? 'win32' : 'linux'
        const fams = ['Fira Code', 'Menlo, Monaco', '"A B"', 'Consolas', 'x+y']
        const lineHeights = [0, 1.5, 20.4]
        const ref = execFileSync(process.execPath, ['--input-type=module', '-e', `
Object.defineProperty(process, 'platform', { value: ${JSON.stringify(plat)} })
const { BareFontInfo } = await import(${JSON.stringify(pathToFileURL(path.join(MONACO_CONFIG, 'fontInfo.js')).href)})
const out = []
for (const fam of ${JSON.stringify(fams)}) for (const lh of ${JSON.stringify(lineHeights)}) {
  const r = BareFontInfo._create(fam, 'normal', 14, '"liga" off, "calt" off', 'normal', lh, 0, 2, true)
  out.push([r.getId(), r.getMassagedFontFamily(), r.lineHeight, r.fontSize])
}
process.stdout.write(JSON.stringify(out))`]).toString()
        const want = JSON.parse(ref) as [string, string, number, number][]
        const got: [string, string, number, number][] = []
        for (const fam of fams) for (const lh of lineHeights) {
            const m = (monaco.editor.BareFontInfo as unknown as { _create(...a: unknown[]): { getId(): string, getMassagedFontFamily(): string, lineHeight: number, fontSize: number } })
                ._create(fam, 'normal', 14, '"liga" off, "calt" off', 'normal', lh, 0, 2, true)
            got.push([m.getId(), m.getMassagedFontFamily(), m.lineHeight, m.fontSize])
        }
        expect(got).toEqual(want)
    })
    it('构造:字段归一(fontFamily 转字符串、lineHeight 取整),FontInfo 带 version 2', () => {
        const b = new (monaco.editor.BareFontInfo as unknown as new (o: unknown) => Record<string, unknown>)({ ...opts, lineHeight: 20.7 })
        expect(b.lineHeight).toBe(20)
        const f = new (monaco.editor.FontInfo as unknown as new (o: unknown, t: boolean) => Record<string, unknown>)({
            ...opts, isMonospace: true, typicalHalfwidthCharacterWidth: 8, typicalFullwidthCharacterWidth: 16, canUseHalfwidthRightwardsArrow: true,
            spaceWidth: 8, middotWidth: 8, wsmiddotWidth: 8, maxDigitWidth: 8,
        }, true)
        expect(f.version).toBe(2); expect(f.isTrusted).toBe(true); expect(f).toBeInstanceOf(monaco.editor.BareFontInfo)
    })
    it('FontInfo.equals 与 Monaco 同判定', async () => {
        const ref = await loadRef()
        const full = { ...opts, isMonospace: true, typicalHalfwidthCharacterWidth: 8, typicalFullwidthCharacterWidth: 16, canUseHalfwidthRightwardsArrow: true, spaceWidth: 8, middotWidth: 8, wsmiddotWidth: 8, maxDigitWidth: 8 }
        const Mine = monaco.editor.FontInfo as unknown as new (o: unknown, t: boolean) => { equals(o: unknown): boolean }
        const a = new Mine(full, true); const b = new Mine({ ...full }, false); const c = new Mine({ ...full, spaceWidth: 9 }, true)
        const ra = new ref.FontInfo(full, true); const rb = new ref.FontInfo({ ...full }, false); const rc = new ref.FontInfo({ ...full, spaceWidth: 9 }, true)
        expect(a.equals(b)).toBe(ra.equals(rb))
        expect(a.equals(c)).toBe(ra.equals(rc))
        expect(a.equals(b)).toBe(true); expect(a.equals(c)).toBe(false)
    })
    it('编辑器的 fontInfo 选项是 FontInfo 实例', () => {
        const ed = edit()
        expect(ed.getOption(monaco.editor.EditorOption.fontInfo)).toBeInstanceOf(monaco.editor.FontInfo)
    })
})

describe('remeasureFonts', () => {
    it('清掉度量缓存,在世的编辑器按新字宽重排', () => {
        let w = 8
        const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            const n = (this.textContent ?? '').length
            return { width: n * w, height: 20, top: 0, left: 0, right: n * w, bottom: 20, x: 0, y: 0, toJSON() { } } as DOMRect
        })
        cleanups.push(() => spy.mockRestore())
        const ed = edit()
        const view = ed as unknown as { fontInfo(): { typicalHalfwidthCharacterWidth: number } }
        // 创建时还没布局,用的是估算值;改一次字号才触发真测(同一字体设置之后命中缓存)
        ed.updateOptions({ fontSize: 15 }); ed.updateOptions({ fontSize: 14 })
        expect(view.fontInfo().typicalHalfwidthCharacterWidth).toBe(8)
        w = 10
        ed.updateOptions({ fontSize: 15 }); ed.updateOptions({ fontSize: 14 })
        // 没清缓存:还是旧值
        expect(view.fontInfo().typicalHalfwidthCharacterWidth).toBe(8)
        monaco.editor.remeasureFonts()
        expect(view.fontInfo().typicalHalfwidthCharacterWidth).toBe(10)
    })
    it('没有编辑器时调用也不抛', () => {
        expect(() => monaco.editor.remeasureFonts()).not.toThrow()
    })
})
