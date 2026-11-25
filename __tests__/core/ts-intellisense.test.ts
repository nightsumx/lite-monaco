import { describe, expect, it, beforeAll, afterEach } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { fuzzyScore } from '../../src/core/feature/fuzzy'
import { mountSuggest, cleanupSuggest, provideTs, until } from './_suggest-harness'
import { loadTsLibs, libFileName, clearTsLibCache, readLib, setTsLibLoader, libNamesOf, TS_LIB_FILE_NAMES } from '../../src/lang/tslibs'
import * as tsModule from 'typescript'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { isProgramLib } from '../../src/lang/tsservice'
import { toPeekLocations } from '../../src/lang/tspeek'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { closePeek, showPeek } from '../../src/lang/tspeek'
import { createTSActions, pickList, tsActionsAvailable } from '../../src/lang/tsactions'
import { EditorView } from '../../src/core/view/editorview'

// 全量 lib + LanguageService 冷启动偏慢,单测 timeout 放宽
const SLOW = 60_000

describe('tslibs', () => {
    it('isProgramLib：webworker / full / lib.d.ts 不进 program，scripthost / importscripts 照 Monaco 放行', () => {
        expect(isProgramLib('lib.es5.d.ts')).toBe(true)
        expect(isProgramLib('lib.dom.d.ts')).toBe(true)
        expect(isProgramLib('lib.webworker.d.ts')).toBe(false)
        expect(isProgramLib('lib.scripthost.d.ts')).toBe(true)
        expect(isProgramLib('lib.webworker.importscripts.d.ts')).toBe(true)
        expect(isProgramLib('lib.es5.full.d.ts')).toBe(false)
        expect(isProgramLib('lib.d.ts')).toBe(false)
        expect(isProgramLib('main.ts')).toBe(false)
    })

    it('libNamesOf:CDN 按装的这一版自己的清单拉,每个文件都真有(TS 6 没有 lib.esnext.iterator.d.ts,写死的清单 404)', () => {
        const ts = (tsModule as { default?: typeof tsModule }).default ?? tsModule
        const names = libNamesOf(ts)
        expect(names).toContain('lib.esnext.d.ts')
        expect(names).toContain('lib.dom.d.ts')
        const libDir = dirname(createRequire(import.meta.url).resolve('typescript'))
        expect(names.filter(n => !existsSync(join(libDir, n)))).toEqual([])
        expect(libNamesOf({})).toBe(TS_LIB_FILE_NAMES)
        expect(libNamesOf({ libMap: new Map() })).toBe(TS_LIB_FILE_NAMES)
    })

    it('setTsLibLoader 优先于 Node/CDN', async () => {
        setTsLibLoader(async () => new Map([['lib.es5.d.ts', 'CUSTOM']]))
        clearTsLibCache()
        const map = await loadTsLibs('0.0.0')
        expect(map.get('lib.es5.d.ts')).toBe('CUSTOM')
        setTsLibLoader(async () => new Map())
        clearTsLibCache()
    })

    it('readLib 按文件名回退命中', () => {
        const libs = new Map([['lib.es5.d.ts', 'ES5']])
        expect(readLib(libs, 'lib.es5.d.ts')).toBe('ES5')
        expect(readLib(libs, '/lib.es5.d.ts')).toBe('ES5')
        expect(readLib(libs, 'main.ts')).toBeUndefined()
    })

    it('libFileName 解析路径', () => {
        expect(libFileName('lib.dom.d.ts')).toBe('lib.dom.d.ts')
        expect(libFileName('/lib.esnext.d.ts')).toBe('lib.esnext.d.ts')
        expect(libFileName('C:\\x\\lib.es5.d.ts')).toBe('lib.es5.d.ts')
        expect(libFileName('main.ts')).toBeNull()
    })

    it('Node 可加载全量 lib(≥50 文件,含 dom)', async () => {
        clearTsLibCache()
        const map = await loadTsLibs('5.7.3')
        expect(map.size).toBeGreaterThanOrEqual(50)
        expect(map.has('lib.dom.d.ts')).toBe(true)
        expect(map.has('lib.esnext.d.ts')).toBe(true)
        expect(map.get('lib.dom.d.ts')!.length).toBeGreaterThan(10_000)
        expect(map.get('lib.dom.d.ts')).toMatch(/interface (Window|Event)/)
        expect(map.get('lib.es5.d.ts')).toContain('interface Object')
    }, SLOW)
})

describe('TS IntelliSense + 全量 lib', () => {
    afterEach(cleanupSuggest)
    beforeAll(() => {
        clearTSServiceCache()
        clearTsLibCache()
    })

    it('本地符号 + DOM 全局:ob → observerStack 与 Object', async () => {
        clearTSServiceCache()
        const doc = [
            'type Computation = { run(): void }',
            'const observerStack: Computation[] = []',
            'function popObserver() {}',
            'ob',
        ].join('\n')
        // 真实路径:显式触发 → SuggestModel → 控件列表(过滤 + 排序后)
        const r = mountSuggest({ doc, lang: 'typescript', fileName: '/case-ob.ts' })
        r.trigger()
        await until(() => r.listed, 20_000)
        const labels = r.labels
        expect(labels.length).toBeGreaterThan(0)
        expect(labels).toContain('observerStack')
        expect(labels).toContain('Object')
        // 本地前缀硬匹配应排很前
        expect(labels.indexOf('observerStack')).toBeLessThan(10)
    }, SLOW)

    it('全局构造: Ob → Object / Array 在库中', async () => {
        clearTSServiceCache()
        expect(fuzzyScore('ob', 'ob', 0, 'onbeforeinput', 'onbeforeinput', 0)).toBeDefined()
        const doc = 'const x = Ob'
        const list = await provideTs(doc, { lang: 'typescript', fileName: '/case-global.ts' })
        expect(list).not.toBeNull()
        expect(list!.some(c => c.label === 'Object')).toBe(true)
    }, SLOW)

    it('成员补全:数组 .pu → push', async () => {
        clearTSServiceCache()
        const doc = 'const a = [1,2,3]; a.pu'
        const list = await provideTs(doc, { lang: 'typescript', fileName: '/case-member.ts' })
        expect(list?.some(c => c.label === 'push')).toBe(true)
    }, SLOW)

    it('hover/补全共享会话:二次请求复用已加载的服务', async () => {
        clearTSServiceCache()
        const ts = { lang: 'typescript', fileName: '/shared.ts' }
        const doc = 'const z = 1; z'
        const list1 = await provideTs(doc, ts, { explicit: true })
        expect(list1?.length).toBeGreaterThan(0)
        // 服务在 Worker 里,请求永远是异步的(旧版「ensure 过一次后同步返回」不再成立);
        // 这里改验:第二次直接出结果,与第一次同一份会话
        const list2 = await provideTs(doc, ts, { explicit: true })
        expect(list2?.length).toBe(list1?.length)
    }, SLOW)

    it('tsFiles 跨文件:import 符号可解析定义位置', async () => {
        clearTSServiceCache()
        const { getTSService } = await import('../../src/lang/tsservice')
        const { buildLocRow } = await import('../../src/lang/tsactions')
        const util = 'export function greet(name: string) { return name }\n'
        const main = 'import { greet } from "./util"\ngreet("hi")\n'
        // greet 调用处
        const callPos = main.indexOf('greet("hi")')
        const session = getTSService({
            lang: 'typescript',
            fileName: '/main.ts',
            files: { '/util.ts': util },
        })
        session.update(main)
        await session.ensure()
        const defs = await session.service().getDefinitionAtPosition(session.fileName, callPos)
        expect(defs?.length).toBeGreaterThan(0)
        const remote = defs!.find(d => d.fileName.replace(/\\/g, '/').includes('util'))
        expect(remote).toBeTruthy()
        const text = session.getFileText(remote!.fileName)
        expect(text).toContain('export function greet')
        const row = buildLocRow(remote!.fileName, '/main.ts', remote!.textSpan.start, remote!.textSpan.length, text)
        expect(row.local).toBe(false)
        expect(row.preview).toMatch(/greet/)
        expect(row.line).toBeGreaterThanOrEqual(1)
    }, SLOW)
})

describe('createTSActions —— rename / format 终态', () => {
    it('renameSymbol 经内嵌输入框改本地所有出现', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'const foo = 1\nfoo\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('foo')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/rename.ts' })
        const done = actions.renameSymbol(view)
        // 内嵌框(对齐 Monaco RenameWidget,不再用 window.prompt)
        for (let i = 0; i < 500 && !view.dom.querySelector('.cm-rename-input'); i++) await new Promise(r => setTimeout(r, 20))
        const input = view.dom.querySelector<HTMLInputElement>('.cm-rename-input')!
        input.value = 'bar'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await done).toBe(true)
        expect(view.state.doc.toString()).toBe('const bar = 1\nbar\n')

        const ro = new EditorView({
            state: EditorState.create({
                doc: 'const foo = 1',
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        expect(await actions.renameSymbol(ro)).toBe(false)
        expect(ro.state.doc.toString()).toBe('const foo = 1')
        ro.destroy()
        view.destroy()
        host.remove()
    }, SLOW)

    it('formatDocument 给关键字后补空格', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'function f(a:number){return a}' }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/fmt.ts' })
        const ok = await actions.formatDocument(view)
        expect(ok).toBe(true)
        expect(view.state.doc.toString()).toContain('return ')
        expect(view.state.doc.toString()).toMatch(/a:\s*number/)
        view.destroy()

        const ro = new EditorView({
            state: EditorState.create({
                doc: 'const x=1',
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        expect(await actions.formatDocument(ro)).toBe(false)
        expect(ro.state.doc.toString()).toBe('const x=1')
        ro.destroy()
        host.remove()
    }, SLOW)

    it('formatSelection 只改选区,空选区格式化光标所在行(Monaco FormatSelectionAction)', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f(){return 1}\nconst x=1'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(0, 'function f(){return 1}'.length),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/fmtsel.ts' })
        expect(await actions.formatSelection(view)).toBe(true)
        const text = view.state.doc.toString()
        expect(text).toContain('return ')
        expect(text.endsWith('const x=1')).toBe(true)
        view.destroy()
        const empty = new EditorView({
            state: EditorState.create({ doc: 'const x=1' }),
            parent: host,
        })
        expect(await actions.formatSelection(empty)).toBe(true)
        expect(empty.state.doc.toString()).toBe('const x = 1')
        empty.destroy()
        host.remove()
    }, SLOW)

    it('organizeImports 合并同模块 import', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = "import { b } from './m'\nimport { a } from './m'\nexport const x = a + b\n"
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const actions = createTSActions({
            lang: 'typescript',
            fileName: '/main.ts',
            files: { '/m.ts': 'export const a = 1\nexport const b = 2\n' },
        })
        expect(await actions.organizeImports(view)).toBe(true)
        const text = view.state.doc.toString()
        expect(text.includes("from './m'")).toBe(true)
        expect((text.match(/from '\.\/m'/g) ?? []).length).toBe(1)
        expect(text).toMatch(/a/)
        expect(text).toMatch(/b/)
        view.destroy()
        const ro = new EditorView({
            state: EditorState.create({
                doc,
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        expect(await actions.organizeImports(ro)).toBe(false)
        ro.destroy()
        host.remove()
    }, SLOW)

    it('addMissingImports 补上跨文件类型', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'const u: User = { id: 1 }\n'
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const actions = createTSActions({
            lang: 'typescript',
            fileName: '/main.ts',
            files: { '/user.ts': 'export interface User { id: number }\n' },
        })
        expect(await actions.addMissingImports(view)).toBe(true)
        const text = view.state.doc.toString()
        expect(text).toContain('User')
        expect(text).toContain('from')
        expect(text).toContain('user')
        view.destroy()
        const ok = new EditorView({
            state: EditorState.create({ doc: "import { User } from './user'\nconst u: User = { id: 1 }\n" }),
            parent: host,
        })
        expect(await actions.addMissingImports(ok)).toBe(false)
        ok.destroy()
        host.remove()
    }, SLOW)

    it('removeUnusedImports 只删未用 import，不删本地变量', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = "import { a, unused } from './m'\nconst dead = 1\nexport const x = a + dead\n"
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const actions = createTSActions({
            lang: 'typescript',
            fileName: '/unused.ts',
            files: { '/m.ts': 'export const a = 1\nexport const unused = 2\n' },
        })
        expect(await actions.removeUnusedImports(view)).toBe(true)
        const text = view.state.doc.toString()
        expect(text).not.toContain('unused')
        expect(text).toContain('a')
        expect(text).toContain('dead')
        view.destroy()
        host.remove()
    }, SLOW)

    it('addTypeAnnotation 给 const 补上 number', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'const x = 1\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.indexOf('x')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/ann.ts' })
        expect(await actions.addTypeAnnotation(view)).toBe(true)
        expect(view.state.doc.toString()).toContain('x: number')
        expect(await actions.addTypeAnnotation(view)).toBe(false)
        view.destroy()
        host.remove()
    }, SLOW)

    it('addMissingMembers 给 implements 补方法', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'interface I { foo(): void }\nclass C implements I {}\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.indexOf('C')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/impl-mem.ts' })
        expect(await actions.addMissingMembers(view)).toBe(true)
        expect(view.state.doc.toString()).toContain('foo')
        view.destroy()
        host.remove()
    }, SLOW)

    it('removeUnusedLocals 删未用变量，不删 import', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = "import { a } from './m'\nconst dead = 1\nexport const x = a\n"
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const actions = createTSActions({
            lang: 'typescript',
            fileName: '/dead.ts',
            files: { '/m.ts': 'export const a = 1\n' },
            compilerOptions: { noUnusedLocals: true },
        })
        expect(await actions.removeUnusedLocals(view)).toBe(true)
        const text = view.state.doc.toString()
        expect(text).not.toContain('dead')
        expect(text).toContain("from './m'")
        expect(text).toContain('a')
        view.destroy()
        host.remove()
    }, SLOW)

    it('goToWorkspaceSymbol 能列出本文件符号', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function uniqueName() { return 1 }\n'
        const view = new EditorView({
            state: EditorState.create({ doc }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/nav.ts' })
        const items = await actions.listWorkspaceSymbols(view, 'unique')
        expect(items.some(i => i.name === 'uniqueName')).toBe(true)
        view.destroy()
        host.remove()
    }, SLOW)

    it('goToImplementation 跳到实现', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = [
            'interface Face { hello(): void }',
            'class Imp implements Face { hello() { return } }',
            'const f: Face = new Imp()',
            'f.hello()',
            '',
        ].join('\n')
        const pos = doc.lastIndexOf('hello')
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(pos),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/impl.ts' })
        expect(await actions.goToImplementation(view)).toBe(true)
        // Monaco:光标收到名字开头,不选中
        const sel = view.state.selection.main
        expect(sel.empty).toBe(true)
        expect(sel.from).toBe(doc.indexOf('hello() {'))
        view.destroy()
        host.remove()
    }, SLOW)

    it('goToTypeDefinition 跳到类型名，不是值声明', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'type Alias = { n: number }\nconst val: Alias = { n: 1 }\nval\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('val')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/typedef.ts' })
        expect(await actions.goToTypeDefinition(view)).toBe(true)
        // Monaco:光标在类型名开头,不选中
        expect(view.state.selection.main.empty).toBe(true)
        expect(view.state.selection.main.head).toBe(doc.indexOf('Alias'))
        view.destroy()
        host.remove()
    }, SLOW)

    it('goToDefinition 跳到本文件声明', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\nfoo\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('foo')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/goto.ts' })
        expect(await actions.goToDefinition(view)).toBe(true)
        expect(view.state.selection.main.from).toBe(doc.indexOf('foo'))
        view.destroy()

        const blank = new EditorView({
            state: EditorState.create({
                doc: '   \n',
                selection: EditorSelection.single(1),
            }),
            parent: host,
        })
        expect(await actions.goToDefinition(blank)).toBe(false)
        expect(await actions.peekDefinition(blank)).toBe(false)
        blank.destroy()
        host.remove()
    }, SLOW)

    it('peekDefinition 弹出 peek 面板', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\nfoo\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('foo')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/peek.ts' })
        expect(await actions.peekDefinition(view)).toBe(true)
        const peek = document.querySelector('.cm-peek')
        expect(peek).not.toBeNull()
        expect(peek!.getAttribute('role')).toBe('dialog')
        expect(peek!.textContent ?? '').toMatch(/foo/)
        view.destroy()
        host.remove()
        document.querySelectorAll('.cm-peek').forEach(n => n.remove())
    }, SLOW)

    it('多处引用 goToReferences 弹出 peek', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\nfoo\nfoo\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('foo')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/refs.ts' })
        expect(await actions.goToReferences(view)).toBe(true)
        const peek = document.querySelector('.cm-peek')
        expect(peek).not.toBeNull()
        expect(peek!.textContent ?? '').toMatch(/Reference|foo/)
        view.destroy()
        host.remove()
        document.querySelectorAll('.cm-peek').forEach(n => n.remove())
    }, SLOW)

    it('goToSymbol 打开 @ 面板，Enter 跳到符号', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\nconst bar = 2\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.length),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/sym.ts' })
        const p = actions.goToSymbol(view)
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline && !document.querySelector('.cm-quick-input'))
            await new Promise(r => setTimeout(r, 40))
        const input = document.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input.value).toBe('@')
        input.value = '@foo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await p).toBe(true)
        expect(view.state.doc.lineAt(view.state.selection.main.head).text).toContain('function foo')
        view.destroy()
        host.remove()
        document.querySelectorAll('.cm-quick-input').forEach(n => n.remove())
    }, SLOW)

    it('goToSymbol Esc 不跳', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.length),
            }),
            parent: host,
        })
        const at = view.state.selection.main.head
        const actions = createTSActions({ lang: 'typescript', fileName: '/sym-esc.ts' })
        const p = actions.goToSymbol(view)
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline && !document.querySelector('.cm-quick-input'))
            await new Promise(r => setTimeout(r, 40))
        const input = document.querySelector('.cm-quick-input-input') as HTMLInputElement
        expect(input).not.toBeNull()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(await p).toBe(false)
        expect(view.state.selection.main.head).toBe(at)
        view.destroy()
        host.remove()
        document.querySelectorAll('.cm-quick-input').forEach(n => n.remove())
    }, SLOW)

    it('peekReferences 弹出引用面板', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function foo() { return 1 }\nfoo\nfoo\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(doc.lastIndexOf('foo')),
            }),
            parent: host,
        })
        const actions = createTSActions({ lang: 'typescript', fileName: '/peekref.ts' })
        expect(await actions.peekReferences(view)).toBe(true)
        const peek = document.querySelector('.cm-peek')
        expect(peek).not.toBeNull()
        expect(peek!.textContent ?? '').toMatch(/Reference|foo/)
        view.destroy()
        host.remove()
        document.querySelectorAll('.cm-peek').forEach(n => n.remove())
    }, SLOW)

    it('tsActionsAvailable 只认 JS/TS；closePeek 卸面板', () => {
        expect(tsActionsAvailable('typescript')).toBe(true)
        expect(tsActionsAvailable('javascript')).toBe(true)
        expect(tsActionsAvailable('tsx')).toBe(true)
        expect(tsActionsAvailable('jsx')).toBe(true)
        expect(tsActionsAvailable('python')).toBe(false)
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent: host,
        })
        showPeek(view, {
            title: 'Definitions (1)',
            locations: [{ file: '/x.ts', line: 1, start: 0, length: 1, preview: 'const x = 1', local: true, text: 'const x = 1' }],
        })
        expect(document.querySelector('.cm-peek')).not.toBeNull()
        const closeBtn = document.querySelector('.cm-peek-close') as HTMLButtonElement
        expect(closeBtn).not.toBeNull()
        closeBtn.click()
        expect(document.querySelector('.cm-peek')).toBeNull()
        showPeek(view, {
            title: 'Definitions (1)',
            locations: [{ file: '/x.ts', line: 1, start: 0, length: 1, preview: 'const x = 1', local: true, text: 'const x = 1' }],
        })
        closePeek()
        expect(document.querySelector('.cm-peek')).toBeNull()
        showPeek(view, {
            title: 'Definitions (2)',
            locations: [
                { file: '/x.ts', line: 1, start: 0, length: 1, preview: 'a', local: true, text: 'a\nb' },
                { file: '/x.ts', line: 2, start: 2, length: 1, preview: 'b', local: true, text: 'a\nb' },
            ],
        })
        expect(document.querySelectorAll('.cm-peek-ref').length).toBe(2)
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(document.querySelector('.cm-peek')).toBeNull()
        showPeek(view, { title: 'Empty', locations: [] })
        expect(document.querySelector('.cm-peek')).toBeNull()
        showPeek(view, {
            title: 'Definitions (1)',
            locations: [{ file: '/x.ts', line: 1, start: 0, length: 1, preview: 'x', local: true, text: 'x' }],
        })
        ;(document.querySelector('.cm-peek-ref') as HTMLElement).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 }),
        )
        expect(view.state.selection.main.from).toBe(0)
        expect(view.state.selection.main.to).toBe(1)
        expect(document.querySelector('.cm-peek')).toBeNull()
        view.destroy()
        host.remove()
    })

    it('pickList 过滤 Enter 选中，Esc 取消', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent: host,
        })
        const p = pickList(view, 'Quick Fix', [
            { label: 'Alpha', value: 1 },
            { label: 'Beta', detail: 'second', value: 2 },
        ])
        expect(document.querySelector('.cm-picker-title')?.textContent).toBe('Quick Fix')
        const input = document.querySelector('.cm-picker-input') as HTMLInputElement
        input.value = 'bet'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await p).toBe(2)
        expect(document.querySelector('.cm-picker')).toBeNull()

        const pClick = pickList(view, 'Quick Fix', [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
        ])
        const rows = document.querySelectorAll('.cm-picker-item')
        expect(rows.length).toBe(2)
        const input2 = document.querySelector('.cm-picker-input') as HTMLInputElement
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(await pClick).toBe(1)

        const pRow = pickList(view, 'Quick Fix', [
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
        ])
        document.querySelectorAll('.cm-picker-item')[1]
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        expect(await pRow).toBe(2)

        const pMask = pickList(view, 'Quick Fix', [{ label: 'X', value: 9 }])
        const mask = document.querySelector('.cm-picker') as HTMLElement
        mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        expect(await pMask).toBeNull()

        const p2 = pickList(view, 'Quick Fix', [{ label: 'X', value: 9 }])
        const again = document.querySelector('.cm-picker-input') as HTMLInputElement
        again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(await p2).toBeNull()
        view.destroy()
        host.remove()
    })

    it('toPeekLocations 按 file 填 text', () => {
        const rows = [{
            start: 0, length: 1, line: 1, preview: 'a', file: '/a.ts', local: true,
        }]
        expect(toPeekLocations(rows, f => f === '/a.ts' ? 'abc' : null)[0].text).toBe('abc')
        expect(toPeekLocations(rows, () => null)[0].text).toBeNull()
    })
})
