// JSON schema 的拉取:schemas 里只给 uri 不给内容时,enableSchemaRequest 决定要不要 fetch;
// $ref(绝对 / 相对)解析;schemaRequest 控制拉取失败的严重度;关掉时不发请求。
// 一半用 mock fetch(精确断言请求),一半用真 http 服务器(走真实 fetch,证明链路通)。
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { languages, editor, Uri, Position, MarkerSeverity } from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 4000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(15) }
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as never
const jd = () => (languages as any).json.jsonDefaults
const base = () => ({ ...jd().diagnosticsOptions })
let n = 0
const models: { dispose(): void }[] = []
const mk = (text: string, ext: string) => { const m = editor.createModel(text, 'json', Uri.parse(`file:///sr${n++}.${ext}`)); models.push(m); return m }
const markers = (m: ReturnType<typeof mk>) => editor.getModelMarkers({ resource: m.uri })
const restore = base()

afterEach(() => {
    while (models.length) models.pop()!.dispose()
    jd().setDiagnosticsOptions(restore)
    vi.unstubAllGlobals()
})

const PERSON = { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' }, addr: { $ref: 'addr.json' } }, required: ['name'] }
const ADDR = { type: 'object', properties: { zip: { type: 'string' } }, required: ['zip'] }

describe('schema 拉取(mock fetch)', () => {
    it('enableSchemaRequest:true → 只有 uri 的 schema 经 fetch 取回,并据此校验', async () => {
        const fetchMock = vi.fn(async (_url: string) => ({ text: async () => JSON.stringify(PERSON) }))
        vi.stubGlobal('fetch', fetchMock)
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: 'http://lm.test/person.json', fileMatch: ['*.p1.json'] }] })
        const m = mk('{ "age": "x" }', 'p1.json')
        await until(() => markers(m).some(x => /Missing property "name"/.test(x.message)))
        expect(markers(m).some(x => /Missing property "name"/.test(x.message))).toBe(true)
        expect(markers(m).some(x => /Incorrect type/.test(x.message))).toBe(true)
        expect(fetchMock).toHaveBeenCalledWith('http://lm.test/person.json')
    })
    it('相对 $ref 按 schema 所在 uri 解析并去 fetch(http://lm.test/addr.json)', async () => {
        const fetchMock = vi.fn(async (url: string) => ({ text: async () => JSON.stringify(url.endsWith('addr.json') ? ADDR : PERSON) }))
        vi.stubGlobal('fetch', fetchMock)
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: 'http://lm.test/dir/person2.json', fileMatch: ['*.p2.json'] }] })
        const m = mk('{ "name": "a", "addr": {} }', 'p2.json')
        await until(() => markers(m).some(x => /Missing property "zip"/.test(x.message)))
        expect(markers(m).some(x => /Missing property "zip"/.test(x.message))).toBe(true)
        expect(fetchMock.mock.calls.map(c => c[0])).toContain('http://lm.test/dir/addr.json')
    })
    it('绝对路径 $ref(/abs/addr.json)按 host 根解析', async () => {
        const root = { type: 'object', properties: { addr: { $ref: '/abs/addr.json' } } }
        const fetchMock = vi.fn(async (url: string) => ({ text: async () => JSON.stringify(url.endsWith('/abs/addr.json') ? ADDR : root) }))
        vi.stubGlobal('fetch', fetchMock)
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: 'http://lm.test/dir/root.json', fileMatch: ['*.p3.json'] }] })
        const m = mk('{ "addr": {} }', 'p3.json')
        await until(() => markers(m).some(x => /Missing property "zip"/.test(x.message)))
        expect(fetchMock.mock.calls.map(c => c[0])).toContain('http://lm.test/abs/addr.json')
    })
    it('enableSchemaRequest:false → 不发请求,只有 uri 的 schema 无法解析,按 schemaRequest 严重度(默认 warning)报', async () => {
        const fetchMock = vi.fn(async () => ({ text: async () => '{}' }))
        vi.stubGlobal('fetch', fetchMock)
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: false, schemas: [{ uri: 'http://lm.test/nofetch.json', fileMatch: ['*.p4.json'] }] })
        const m = mk('{ }', 'p4.json')
        await until(() => markers(m).length > 0)
        expect(fetchMock).not.toHaveBeenCalled()
        const ms = markers(m)
        expect(ms.length).toBeGreaterThan(0)
        expect(ms[0].severity).toBe(MarkerSeverity.Warning)
    })
    it('拉取失败:schemaRequest = error / ignore / 默认 warning 对应严重度', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
        const run = async (ext: string, level: string | undefined) => {
            jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemaRequest: level, schemas: [{ uri: `http://lm.test/${ext}.json`, fileMatch: [`*.${ext}.json`] }] })
            const m = mk('{ }', `${ext}.json`)
            await until(() => markers(m).length > 0, level === 'ignore' ? 600 : 4000)
            return markers(m)
        }
        expect((await run('e1', 'error'))[0].severity).toBe(MarkerSeverity.Error)
        expect((await run('e2', undefined))[0].severity).toBe(MarkerSeverity.Warning)
        expect(await run('e3', 'ignore')).toEqual([])
    })
    it('schemas 里内联 schema 优先,不触发 fetch;fileMatch 的排除项 ! 生效', async () => {
        const fetchMock = vi.fn(async () => ({ text: async () => '{}' }))
        vi.stubGlobal('fetch', fetchMock)
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: 'http://lm.test/inline.json', fileMatch: ['*.p5.json', '!skip.p5.json'], schema: { type: 'object', required: ['name'] } }] })
        const hit = mk('{ }', 'p5.json')
        await until(() => markers(hit).length > 0)
        expect(markers(hit).some(x => /Missing property "name"/.test(x.message))).toBe(true)
        const skip = editor.createModel('{ }', 'json', Uri.parse('file:///sr-dir/skip.p5.json')); models.push(skip)
        await wait(500)
        expect(markers(skip).some(x => /Missing property/.test(x.message))).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })
    it('改了 schemas(setDiagnosticsOptions)→ 已打开的 model 用新 schema 重新校验', async () => {
        jd().setDiagnosticsOptions({ ...base(), schemas: [{ uri: 'http://lm.test/v1.json', fileMatch: ['*.p6.json'], schema: { type: 'object', required: ['a'] } }] })
        const m = mk('{ }', 'p6.json')
        await until(() => markers(m).some(x => /Missing property "a"/.test(x.message)))
        jd().setDiagnosticsOptions({ ...base(), schemas: [{ uri: 'http://lm.test/v1.json', fileMatch: ['*.p6.json'], schema: { type: 'object', required: ['b'] } }] })
        await until(() => markers(m).some(x => /Missing property "b"/.test(x.message)))
        expect(markers(m).some(x => /Missing property "b"/.test(x.message))).toBe(true)
        expect(markers(m).some(x => /Missing property "a"/.test(x.message))).toBe(false)
    })
})

describe('schema 拉取(真 http 服务器 + 真 fetch)', () => {
    let srv: Server, origin = ''
    const hits: string[] = []
    beforeAll(async () => {
        srv = createServer((req, res) => {
            hits.push(req.url!)
            res.setHeader('content-type', 'application/json')
            if (req.url === '/schemas/person.json') res.end(JSON.stringify({ ...PERSON, properties: { ...PERSON.properties, kind: { enum: ['x', 'y'] } } }))
            else if (req.url === '/schemas/addr.json') res.end(JSON.stringify(ADDR))
            else { res.statusCode = 404; res.end('nope') }
        })
        await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
        origin = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
    })
    afterAll(() => new Promise<void>(r => srv.close(() => r())))

    it('真实 fetch 取回 schema:校验 + 相对 $ref + 补全枚举', { timeout: 15000 }, async () => {
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: `${origin}/schemas/person.json`, fileMatch: ['*.h1.json'] }] })
        const m = mk('{ "addr": {}, "kind": }', 'h1.json')
        await until(() => markers(m).some(x => /Missing property "zip"/.test(x.message)), 8000)
        expect(markers(m).some(x => /Missing property "name"/.test(x.message))).toBe(true)
        expect(markers(m).some(x => /Missing property "zip"/.test(x.message))).toBe(true)
        expect(hits).toEqual(expect.arrayContaining(['/schemas/person.json', '/schemas/addr.json']))
        await until(() => languageFeatures.completionProvider.ordered(m as never).length > 0)
        const prov: any = languageFeatures.completionProvider.ordered(m as never)[0]
        const list = await prov.provideCompletionItems(m, new Position(1, 22), { triggerKind: 1 }, TOKEN)
        expect(list.suggestions.map((s: any) => s.label)).toEqual(expect.arrayContaining(['"x"', '"y"']))
    })
    it('服务器 404:schema 取不到按 schemaRequest 严重度报(默认 warning),编辑器不崩', async () => {
        jd().setDiagnosticsOptions({ ...base(), enableSchemaRequest: true, schemas: [{ uri: `${origin}/schemas/missing.json`, fileMatch: ['*.h2.json'] }] })
        const m = mk('{ "a": 1 }', 'h2.json')
        await wait(800)
        expect(markers(m).every(x => x.severity !== MarkerSeverity.Error)).toBe(true)
    })
})
