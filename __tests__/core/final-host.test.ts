// 最终补测:宿主 API 与生命周期(语言事件 / setModelLanguage / pushEOL / pushStackElement / model 级 deltaDecorations /
// getBottomForLineNumber / onDidCreateModel·onWillDisposeModel / languages.register·getLanguages)。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
import { undo, redo } from '../../src/core/edit/history'
import { createModel, onDidChangeModelLanguage, onDidCreateModel, onWillDisposeModel, getModels, getModel, EndOfLineSequence } from '../../src/api/model'
import { setModelLanguage } from '../../src/api/languages'
import { register, getLanguages, onDidChangeLanguages } from '../../src/api/languages'
import { Uri } from '../../src/api/uri'
import { GRID, installGrid, lines, mount } from './v-helpers'

afterEach(cleanup)

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const type = (ed: ReturnType<typeof mountEditor>, at: number, text: string) =>
    ed.dispatch(ed.state.update({ changes: { from: at, insert: text }, userEvent: 'input.type' }))

describe('语言切换:setModelLanguage + 三层 onDidChangeModelLanguage', () => {
    it('setModelLanguage 就地换语言:model / 实例 / 全局事件各触发一次,文档、选区、撤销栈保留', () => {
        const ed = mountEditor('const a = 1\nsecond')
        const model = ed.getModel()
        expect(model.getLanguageId()).toBe('text')
        type(ed, 0, 'X')
        ed.dispatch(ed.state.update({ selection: { anchor: 4, head: 8 } }))
        const seen: string[] = []
        const d1 = model.onDidChangeLanguage((e: any) => seen.push(`model:${e.oldLanguage}->${e.newLanguage}`))
        const d2 = ed.onDidChangeModelLanguage((e: any) => seen.push(`ed:${e.oldLanguage}->${e.newLanguage}`))
        const d3 = onDidChangeModelLanguage(e => { if (e.model === model) seen.push(`global:${e.oldLanguage}`) })
        setModelLanguage(model, 'typescript')
        expect(model.getLanguageId()).toBe('typescript')
        expect(seen.sort()).toEqual(['ed:text->typescript', 'global:text', 'model:text->typescript'])
        // 文档 / 选区 / 历史没丢
        expect(ed.getValue()).toBe('Xconst a = 1\nsecond')
        expect(ed.state.selection.main.from).toBe(4)
        expect(ed.state.selection.main.to).toBe(8)
        undo(ed)
        expect(ed.getValue()).toBe('const a = 1\nsecond')
        // 同语言再设不触发
        seen.length = 0
        setModelLanguage(model, 'typescript')
        expect(seen).toEqual([])
        d1.dispose(); d2.dispose(); d3.dispose()
    })

    it('销毁的 model 设语言抛错;换回原语言又会触发', () => {
        const m = createModel('a', 'plaintext')
        const evs: string[] = []
        m.onDidChangeLanguage(e => evs.push(`${e.oldLanguage}>${e.newLanguage}`))
        setModelLanguage(m, 'json')
        setModelLanguage(m, 'plaintext')
        expect(evs).toEqual(['plaintext>json', 'json>plaintext'])
        m.dispose()
        expect(() => setModelLanguage(m, 'json')).toThrow()
    })
})

describe('pushEOL / pushStackElement / popStackElement(model 层)', () => {
    it('pushEOL 进撤销栈:undo 换回原换行符;setEOL 不进栈', () => {
        const ed = mountEditor('a\nb\nc')
        const model = ed.getModel()
        model.pushEOL(EndOfLineSequence.CRLF)
        expect(model.getEOL()).toBe('\r\n')
        expect(ed.getValue()).toBe('a\r\nb\r\nc')
        undo(ed)
        expect(model.getEOL()).toBe('\n')
        expect(ed.getValue()).toBe('a\nb\nc')
        redo(ed)
        expect(model.getEOL()).toBe('\r\n')
        // setEOL:改了,但 undo 撤不掉它
        model.setEOL(EndOfLineSequence.LF)
        expect(model.getEOL()).toBe('\n')
        undo(ed)
        expect(model.getEOL()).toBe('\n')
    })

    it('pushStackElement 把相邻输入断成两个撤销步;不调用则合并成一步', () => {
        const merged = mountEditor('')
        type(merged, 0, 'a'); type(merged, 1, 'b')
        undo(merged)
        expect(merged.getValue()).toBe('')

        const ed = mountEditor('')
        type(ed, 0, 'a')
        ed.getModel().pushStackElement()
        type(ed, 1, 'b')
        undo(ed)
        expect(ed.getValue()).toBe('a')
        undo(ed)
        expect(ed.getValue()).toBe('')
    })

    it('popStackElement 不报错、不改文档;之后的输入仍可正常撤销', () => {
        const ed = mountEditor('')
        const m = ed.getModel()
        type(ed, 0, 'a')
        const v = m.getVersionId()
        m.popStackElement()
        expect(m.getVersionId()).toBe(v)
        expect(ed.getValue()).toBe('a')
        type(ed, 1, 'b')
        undo(ed)
        expect(ed.getValue()).toBe('')
    })

    it('model 销毁后 pushStackElement / pushEOL 抛错(同 Monaco)', () => {
        const m = createModel('x', 'plaintext')
        m.dispose()
        expect(() => m.pushStackElement()).toThrow()
        expect(() => m.popStackElement()).toThrow()
        expect(() => m.pushEOL(EndOfLineSequence.CRLF)).toThrow()
    })
})

describe('model 级 deltaDecorations', () => {
    it('转发到编辑器的装饰集:id 互通,范围随编辑移动,onDidChangeDecorations 触发', () => {
        const ed = mountEditor('hello world')
        const model = ed.getModel()
        let fired = 0
        const d = model.onDidChangeDecorations(() => { fired++ })
        const ids: string[] = model.deltaDecorations([], [{ range: R(1, 7, 1, 12), options: { description: 't', className: 'w' } }])
        expect(ids.length).toBe(1)
        expect(fired).toBeGreaterThan(0)
        // 编辑器侧 / model 侧读到同一条
        expect(ed.getDecorationRange(ids[0])).toMatchObject({ startColumn: 7, endColumn: 12 })
        expect(model.getDecorationRange(ids[0])).toMatchObject({ startColumn: 7, endColumn: 12 })
        expect((model.getDecorationOptions(ids[0]) as any).className).toBe('w')
        expect(model.getAllDecorations().length).toBe(1)
        expect(model.getLineDecorations(1).length).toBe(1)
        type(ed, 0, 'abc')
        expect(model.getDecorationRange(ids[0])).toMatchObject({ startColumn: 10, endColumn: 15 })
        // 替换:旧 id 失效
        const next: string[] = model.deltaDecorations(ids, [{ range: R(1, 1, 1, 3), options: { description: 'u' } }])
        expect(model.getDecorationRange(ids[0])).toBeNull()
        expect(model.getDecorationRange(next[0])).toMatchObject({ startColumn: 1, endColumn: 3 })
        d.dispose()
    })

    it('装饰类名真的画进 DOM(经 model 加的)', () => {
        const ed = mountEditor('hello world')
        ed.getModel().deltaDecorations([], [{ range: R(1, 1, 1, 6), options: { description: 't', inlineClassName: 'final-deco' } }])
        expect(ed.dom.querySelector('.final-deco')?.textContent).toBe('hello')
    })

    it('销毁的 model 抛错', () => {
        const m = createModel('abc', 'plaintext')
        m.dispose()
        expect(() => m.deltaDecorations([], [])).toThrow()
    })
})

describe('getTopForLineNumber / getBottomForLineNumber(几何桩)', () => {
    const LH = 20
    it('行底 = 行顶 + 行高;连续行首尾相接;越界夹到首末行', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        expect(view.getTopForLineNumber(1)).toBe(0)
        expect(view.getBottomForLineNumber(1)).toBe(LH)
        for (let n = 1; n < 10; n++) expect(view.getBottomForLineNumber(n)).toBe(view.getTopForLineNumber(n + 1))
        expect(view.getBottomForLineNumber(10)).toBe(10 * LH)
        expect(view.getBottomForLineNumber(99)).toBe(10 * LH)
        expect(view.getBottomForLineNumber(-3)).toBe(LH)
    })

    it('view zone:默认不含;includeViewZones 把挂在本行之后的 zone 算进底;下一行的顶被推下', () => {
        const geo = installGrid()
        const { view } = mount(lines(10), {}, [], geo)
        view.changeViewZones(a => { a.addZone({ afterLineNumber: 2, heightInPx: 50, domNode: document.createElement('div') }) })
        expect(view.getBottomForLineNumber(2)).toBe(2 * LH)
        expect(view.getBottomForLineNumber(2, true)).toBe(2 * LH + 50)
        expect(view.getTopForLineNumber(3)).toBe(2 * LH + 50)
        expect(view.getTopForLineNumber(3, true)).toBe(2 * LH)
        // 其他行不受影响
        expect(view.getBottomForLineNumber(1, true)).toBe(LH)
        expect(view.getBottomForLineNumber(3)).toBe(3 * LH + 50)
        void GRID
    })

    it('折行:一行占多个视觉行时,底是最后一个视觉行的底', () => {
        const geo = installGrid()
        const { view } = mount('x'.repeat(5000) + '\nshort', { lineWrapping: true } as never, [], geo)
        const rows = Math.round((view.getBottomForLineNumber(1) - view.getTopForLineNumber(1)) / LH)
        expect(view.getBottomForLineNumber(1)).toBe(view.getTopForLineNumber(2))
        expect(rows).toBeGreaterThanOrEqual(1)
    })
})

describe('onDidCreateModel / onWillDisposeModel(createModel 与编辑器隐式创建都算)', () => {
    it('createModel 触发 create;dispose 前触发 willDispose,此时仍可读内容、仍在 getModels() 里', () => {
        const created: string[] = [], willDispose: { uri: string, value: string, listed: boolean }[] = []
        const d1 = onDidCreateModel(m => created.push(m.uri.toString()))
        const d2 = onWillDisposeModel(m => willDispose.push({ uri: m.uri.toString(), value: m.getValue(), listed: getModels().includes(m) }))
        const u = Uri.parse('inmemory://final/a.ts')
        const m = createModel('hello', undefined, u)
        expect(created).toEqual([u.toString()])
        expect(getModel(u)).toBe(m)
        m.dispose()
        expect(willDispose).toEqual([{ uri: u.toString(), value: 'hello', listed: true }])
        expect(getModel(u)).toBeNull()
        m.dispose() // 重复 dispose 不再触发
        expect(willDispose.length).toBe(1)
        d1.dispose(); d2.dispose()
    })

    it('创建事件在监听器里已是完整 model(getValue / getLanguageId 可用)', () => {
        let snap = ''
        const d = onDidCreateModel(m => { snap = `${m.getValue()}|${m.getLanguageId()}` })
        const m = createModel('abc', 'json')
        expect(snap).toBe('abc|json')
        m.dispose(); d.dispose()
    })

    it('编辑器隐式 model:第一次 getModel() 触发 create,销毁编辑器触发 willDispose', () => {
        const created: unknown[] = [], gone: unknown[] = []
        const d1 = onDidCreateModel(m => created.push(m))
        const d2 = onWillDisposeModel(m => gone.push(m))
        const ed = mountEditor('x')
        const m = ed.getModel()
        expect(created).toEqual([m])
        expect(ed.getModel()).toBe(m) // 不重复创建
        expect(created.length).toBe(1)
        ed.destroy()
        expect(gone).toEqual([m])
        d1.dispose(); d2.dispose()
    })

    it('setModel 换走的隐式 model 被销毁时触发 willDispose;createModel 的不销毁', () => {
        const gone: unknown[] = []
        const d = onWillDisposeModel(m => gone.push(m))
        const ed = mountEditor('x')
        const implicit = ed.getModel()
        const mine = createModel('y', 'plaintext')
        ed.setModel(mine)
        expect(gone).toEqual([implicit])
        ed.setModel(null)
        expect(gone).toEqual([implicit])
        expect(mine.isDisposed()).toBe(false)
        mine.dispose()
        expect(gone).toEqual([implicit, mine])
        d.dispose()
    })
})

describe('languages.register / getLanguages', () => {
    it('register 登记 id / 扩展名 / 别名 / mimetype;getLanguages 返回它;createModel 按扩展名推断;onDidChangeLanguages 触发', () => {
        let changed = 0
        const d = onDidChangeLanguages(() => { changed++ })
        register({ id: 'finallang', extensions: ['.fnl'], aliases: ['Final Lang', 'finallang'], mimetypes: ['text/x-final'], filenames: ['FINALFILE'] })
        expect(changed).toBeGreaterThan(0)
        const l = getLanguages().find(x => x.id === 'finallang')
        expect(l).toBeTruthy()
        expect(l!.extensions).toContain('.fnl')
        expect(l!.aliases).toContain('Final Lang')
        expect(l!.mimetypes).toContain('text/x-final')
        expect(createModel('', undefined, Uri.parse('inmemory://final/x.fnl')).getLanguageId()).toBe('finallang')
        expect(createModel('', undefined, Uri.parse('inmemory://final/FINALFILE')).getLanguageId()).toBe('finallang')
        d.dispose()
    })

    it('getLanguages 含内置语言,且返回副本(改它不影响注册表)', () => {
        const all = getLanguages()
        expect(all.some(x => x.id === 'typescript')).toBe(true)
        expect(all.some(x => x.id === 'plaintext')).toBe(true)
        all.length = 0
        expect(getLanguages().length).toBeGreaterThan(0)
    })
})
