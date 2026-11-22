// 服务层:语言注册表 / 关联优先级 / ModelService(撤销栈复活、_computeEdits)/ OpenerService(validators、opener 链、command、编辑器兜底)。
import { describe, it, expect, vi } from 'vitest'
import {
    LanguageService, LanguagesRegistry, registerConfiguredLanguageAssociation, clearConfiguredLanguageAssociations, getMimeTypes, getLanguageIds,
} from '../../src/api/languagesregistry'
import { ModelService } from '../../src/api/modelservice'
import { Uri } from '../../src/api/uri'
import { OpenerService, extractSelection, type OpenerUri } from '../../src/core/feature/openerservice'
import { getLinkOpenerService, registerLinkOpener, openLinkUrl } from '../../src/core/feature/link'

describe('语言注册表', () => {
    it('同 id 多次注册合并:扩展名 / 别名取并集', () => {
        const svc = new LanguageService()
        svc.registerLanguage({ id: 'zz', extensions: ['.zz'], aliases: ['ZZ'] })
        svc.registerLanguage({ id: 'zz', extensions: ['.zzz'], aliases: ['Zed'] })
        expect(svc.isRegisteredLanguageId('zz')).toBe(true)
        expect(svc.guessLanguageIdByFilepathOrFirstLine(Uri.parse('file:///a.zzz'))).toBe('zz')
        expect(svc.getLanguageIdByLanguageName('zed')).toBe('zz')
    })
    it('配置的关联优先于平台关联;文件名 > 扩展名', () => {
        const reg = new LanguagesRegistry(false)
        reg._registerLanguages([{ id: 'lx', extensions: ['.lxq'] }, { id: 'ly', extensions: ['.lyq'] }])
        registerConfiguredLanguageAssociation({ id: 'ly', filepattern: '*.lxq' } as never)
        try {
            const res = { scheme: 'file', path: '/p/a.lxq' }
            expect(getLanguageIds(res)[0]).toBe('ly')
            expect(getMimeTypes(res).length).toBeGreaterThan(0)
        } finally { clearConfiguredLanguageAssociations() }
    })
})

describe('ModelService', () => {
    it('同资源同内容销毁后再建:撤销栈复活', () => {
        const svc = new ModelService()
        const uri = Uri.parse('file:///svc-revive.txt')
        const m = svc.createModel('hello', null, uri)
        m.pushEditOperations(null, [{ range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 }, text: '!' }], () => null)
        expect(m.getValue()).toBe('hello!')
        const v = m.getValue()
        svc.destroyModel(uri)
        const m2 = svc.createModel(v, null, uri)
        expect(m2.canUndo()).toBe(true)
        m2.undo()
        expect(m2.getValue()).toBe('hello')
    })
    it('内容不同则不复活', () => {
        const svc = new ModelService()
        const uri = Uri.parse('file:///svc-norevive.txt')
        const m = svc.createModel('a', null, uri)
        m.pushEditOperations(null, [{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }, text: 'b' }], () => null)
        svc.destroyModel(uri)
        expect(svc.createModel('other', null, uri).canUndo()).toBe(false)
    })
    it('files.restoreUndoStack=false 不复活;files.eol 决定默认换行', () => {
        const cfg = { getValue: (k: string) => (k === 'files.restoreUndoStack' ? false : k === 'files.eol' ? '\r\n' : undefined) as never }
        const svc = new ModelService(cfg)
        const uri = Uri.parse('file:///svc-cfg.txt')
        const m = svc.createModel('a', null, uri)
        expect(m.getEOL()).toBe('\r\n')
        m.pushEditOperations(null, [{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }, text: 'b' }], () => null)
        const v = m.getValue()
        svc.destroyModel(uri)
        expect(svc.createModel(v, null, uri).canUndo()).toBe(false)
    })
    it('_computeEdits:相等无编辑;只改中间行时去掉公共前后缀', () => {
        const svc = new ModelService()
        const m = svc.createModel('a\nb\nc', null, Uri.parse('file:///svc-edits.txt'))
        const buf = (t: string) => {
            const lines = t.split('\n')
            return { getLineCount: () => lines.length, getLineContent: (n: number) => lines[n - 1], getLineLength: (n: number) => lines[n - 1].length, getEOL: () => '\n', getValueInRange: () => t }
        }
        expect(ModelService._computeEdits(m, buf('a\nb\nc'))).toEqual([])
        const e = ModelService._computeEdits(m, buf('a\nX\nc'))
        expect(e.length).toBe(1)
        expect(e[0].range.startLineNumber).toBe(2)
        expect(e[0].range.endLineNumber).toBe(3)
    })
})

const parse = (v: string): OpenerUri => {
    const u = new URL(v.includes(':') ? v : 'x:' + v)
    const mk = (s: string, a: string, p: string, q: string, f: string): OpenerUri => ({
        scheme: s, authority: a, path: p, query: q, fragment: f,
        with: c => mk(c.scheme ?? s, c.authority ?? a, c.path ?? p, c.query ?? q, c.fragment ?? f),
        toString: () => `${s}:${a ? '//' + a : ''}${p}${q ? '?' + q : ''}${f ? '#' + f : ''}`,
    })
    return mk(u.protocol.replace(':', ''), u.host, u.protocol === 'command:' ? v.replace(/^command:/, '').replace(/[?#].*$/, '') : u.pathname, u.search.slice(1), u.hash.slice(1))
}
const mkSvc = () => {
    const opened: { resource: OpenerUri, options: any }[] = []
    const cmds: { id: string, args: unknown[] }[] = []
    const svc = new OpenerService(
        { openCodeEditor: i => { opened.push(i as never); return null }, getFocusedCodeEditor: () => null },
        { executeCommand: (id, ...args) => { cmds.push({ id, args }) } },
        parse,
    )
    return { svc, opened, cmds }
}

describe('OpenerService', () => {
    it('extractSelection:#L12 / #12,5,清掉 fragment', () => {
        const r = extractSelection(parse('file:///a#L12,5'))
        expect(r.selection).toEqual({ startLineNumber: 12, startColumn: 5 })
        expect(r.uri.fragment).toBe('')
        expect(extractSelection(parse('file:///a#top')).selection).toBeUndefined()
    })
    it('后注册的 opener 先问;返回 false 往下;validator 一票否决', async () => {
        const { svc } = mkSvc()
        const order: string[] = []
        svc.registerOpener({ open: () => { order.push('a'); return true } })
        svc.registerOpener({ open: () => { order.push('b'); return false } })
        expect(await svc.open('foo:///x')).toBe(true)
        expect(order).toEqual(['b', 'a'])
        const v = svc.registerValidator({ shouldOpen: () => false })
        expect(await svc.open('foo:///x')).toBe(false)
        expect(await svc.open('foo:///x', { skipValidation: true })).toBe(true)
        v.dispose()
    })
    it('command: 默认静默忽略;allowCommands 才执行;数组白名单;参数 JSON 解析', async () => {
        const { svc, cmds } = mkSvc()
        expect(await svc.open('command:doIt')).toBe(true)
        expect(cmds).toEqual([])
        await svc.open('command:doIt?[1,"a"]', { allowCommands: true })
        expect(cmds).toEqual([{ id: 'doIt', args: [1, 'a'] }])
        await svc.open('command:other', { allowCommands: ['doIt'] })
        expect(cmds.length).toBe(1)
    })
    it('编辑器兜底:file: 路径折叠 ..,选区取自 fragment;openCodeEditor 明说 false 时 open 返回 false', async () => {
        const { svc, opened } = mkSvc()
        await svc.open('file:///a/b/../c#L3')
        expect(opened[0].resource.path).toBe('/a/c')
        expect(opened[0].options.selection).toEqual({ startLineNumber: 3, startColumn: 1 })
        const none = new OpenerService({ openCodeEditor: () => false, getFocusedCodeEditor: () => null }, { executeCommand: () => undefined }, parse)
        expect(await none.open('file:///a')).toBe(false)
    })
    it('外部 opener:http 走默认 external opener;resolver 改写后 encodeURI', async () => {
        const { svc } = mkSvc()
        const hrefs: string[] = []
        svc.setDefaultExternalOpener({ openExternal: async h => { hrefs.push(h); return true } })
        expect(await svc.open('https://a.com/x y')).toBe(true)
        expect(hrefs).toEqual(['https://a.com/x y'])
        await expect(svc.resolveExternalUri(parse('https://a.com'))).rejects.toThrow()
    })
})

describe('链接 opener 链(editor.registerLinkOpener)接到 OpenerService', () => {
    it('后注册先问;validator 同一个服务;http 默认走 window.open', async () => {
        const open = vi.fn()
        const win = { open } as unknown as Window
        const seen: string[] = []
        const d1 = registerLinkOpener({ open: () => { seen.push('old'); return true } })
        const d2 = registerLinkOpener({ open: () => { seen.push('new'); return true } })
        expect(await openLinkUrl('https://a.com', win)).toBe(true)
        expect(seen).toEqual(['new'])
        d2.dispose(); d1.dispose()
        const v = getLinkOpenerService().registerValidator({ shouldOpen: () => false })
        expect(await openLinkUrl('https://a.com', win)).toBe(false)
        expect(open).not.toHaveBeenCalled()
        v.dispose()
        expect(await openLinkUrl('https://a.com/x y', win)).toBe(true)
        expect(open).toHaveBeenCalledWith('https://a.com/x%20y', '_blank', 'noopener,noreferrer')
    })
})
