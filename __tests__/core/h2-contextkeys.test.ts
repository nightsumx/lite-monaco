// H2:context key —— createContextKey / when 表达式 / 内置 key。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
const { ContextKeyExpr, getContextKeyService } = await import('../../src/api/contextkeys')

afterEach(cleanup)

describe('createContextKey', () => {
    it('set / get / reset,reset 回到默认值', () => {
        const ed = mountEditor('x')
        const k = ed.createContextKey('myKey', false)
        expect(k.get()).toBe(false)
        k.set(true)
        expect(k.get()).toBe(true)
        k.reset()
        expect(k.get()).toBe(false)
        const noDefault = ed.createContextKey('other', undefined)
        expect(noDefault.get()).toBeUndefined()
        noDefault.set('a')
        noDefault.reset()
        expect(noDefault.get()).toBeUndefined()
    })

    it('变更触发 onDidChangeContext,值没变不触发', () => {
        const ed = mountEditor('x')
        const svc = getContextKeyService(ed)
        const seen: string[][] = []
        svc.onDidChangeContext(e => seen.push([...e.keys]))
        const k = ed.createContextKey('a', 1)
        k.set(1)
        k.set(2)
        expect(seen).toEqual([['a'], ['a']]) // 创建一次 + set(2) 一次
    })
})

describe('when 表达式', () => {
    const env = (vals: Record<string, unknown>) => ({ getValue: (k: string) => vals[k] as never })
    const t = (src: string, vals: Record<string, unknown>) => ContextKeyExpr.deserialize(src)!.evaluate(env(vals))

    it('标识符、!、&&、||、括号', () => {
        expect(t('a', { a: true })).toBe(true)
        expect(t('a', {})).toBe(false)
        expect(t('!a', {})).toBe(true)
        expect(t('a && b', { a: true, b: true })).toBe(true)
        expect(t('a && b', { a: true })).toBe(false)
        expect(t('a || b', { b: 1 })).toBe(true)
        expect(t('a || b && c', { a: true })).toBe(true) // && 先于 ||
        expect(t('(a || b) && c', { a: true })).toBe(false)
        expect(t('!(a && b)', { a: true })).toBe(true)
    })

    it('== / != 字面量(字符串、数字、true/false)', () => {
        expect(t('lang == typescript', { lang: 'typescript' })).toBe(true)
        expect(t("lang == 'typescript'", { lang: 'typescript' })).toBe(true)
        expect(t('lang != typescript', { lang: 'json' })).toBe(true)
        expect(t('n == 3', { n: 3 })).toBe(true)
        expect(t('a == true', { a: true })).toBe(true)
        expect(t('a == false', { a: false })).toBe(true)
        expect(t('a != true', { a: false })).toBe(true)
        expect(t('x == 1 && y != 2', { x: 1, y: 3 })).toBe(true)
    })

    it('其余比较:< >= =~ in / not in', () => {
        expect(t('n < 5', { n: 3 })).toBe(true)
        expect(t('n >= 5', { n: 3 })).toBe(false)
        expect(t('s =~ /^ts/', { s: 'tsx' })).toBe(true)
        expect(t('k in list', { k: 'a', list: ['a', 'b'] })).toBe(true)
        expect(t('k not in list', { k: 'z', list: ['a'] })).toBe(true)
    })

    it('空表达式恒真;语法错误抛 SyntaxError;serialize / keys', () => {
        expect(ContextKeyExpr.deserialize('')).toBeUndefined()
        expect(ContextKeyExpr.deserialize(undefined)).toBeUndefined()
        expect(() => ContextKeyExpr.deserialize('a &&')).toThrow(SyntaxError)
        expect(() => ContextKeyExpr.deserialize('(a')).toThrow(SyntaxError)
        const e = ContextKeyExpr.deserialize('a && !b || c == 1')!
        expect(e.keys().sort()).toEqual(['a', 'b', 'c'])
        expect(ContextKeyExpr.deserialize(e.serialize())!.evaluate(env({ a: true }))).toBe(true)
    })

    it('服务的 contextMatchesRules 吃字符串,语法错误当不满足', () => {
        const ed = mountEditor('x')
        const svc = getContextKeyService(ed)
        ed.createContextKey('on', true)
        expect(svc.contextMatchesRules('on')).toBe(true)
        expect(svc.contextMatchesRules('!on')).toBe(false)
        expect(svc.contextMatchesRules(undefined)).toBe(true)
        expect(svc.contextMatchesRules('on &&')).toBe(false)
    })
})

describe('内置 key', () => {
    it('editorHasSelection / editorHasMultipleSelections 跟着选区', () => {
        const ed = mountEditor('hello world')
        const svc = getContextKeyService(ed)
        expect(svc.getValue('editorHasSelection')).toBe(false)
        ed.dispatch(ed.state.update({ selection: { anchor: 0, head: 5 } }))
        expect(svc.getValue('editorHasSelection')).toBe(true)
        expect(svc.getValue('editorHasMultipleSelections')).toBe(false)
        expect(svc.contextMatchesRules('editorHasSelection && !editorHasMultipleSelections')).toBe(true)
    })

    it('editorReadonly 跟着 readOnly 状态', () => {
        const ro = mountEditor('x', { readOnly: true })
        expect(getContextKeyService(ro).getValue('editorReadonly')).toBe(true)
        const rw = mountEditor('x')
        expect(getContextKeyService(rw).getValue('editorReadonly')).toBe(false)
    })

    it('findWidgetVisible 随查找框开合', async () => {
        const ed = mountEditor('abc')
        const svc = getContextKeyService(ed)
        expect(svc.getValue('findWidgetVisible')).toBe(false)
        const core = await import('../../src/core/index')
        core.openSearch(ed)
        expect(svc.getValue('findWidgetVisible')).toBe(true)
    })

    it('editorTextFocus / editorFocus 看焦点;suggestWidgetVisible / inSnippetMode 默认 false', () => {
        const ed = mountEditor('x')
        const svc = getContextKeyService(ed)
        expect(svc.getValue('suggestWidgetVisible')).toBe(false)
        expect(svc.getValue('inSnippetMode')).toBe(false)
        expect(svc.getValue('editorTextFocus')).toBe(false)
        ed.focus()
        expect(svc.getValue('editorTextFocus')).toBe(true)
        expect(svc.getValue('editorFocus')).toBe(true)
    })

    it('用户 key 覆盖同名内置 key;未知 key 为 undefined', () => {
        const ed = mountEditor('x')
        const svc = getContextKeyService(ed)
        expect(svc.getValue('nope')).toBeUndefined()
        ed.createContextKey('editorReadonly', true)
        expect(svc.getValue('editorReadonly')).toBe(true)
    })
})
