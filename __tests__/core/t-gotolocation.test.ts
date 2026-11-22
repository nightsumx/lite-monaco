// gotoLocation.* / Peek Type Definition / Peek Implementations / Format Selection(多选区 + 空选区)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { EditorView } from '../../src/core/view/editorview'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { closePeek, peekOpen } from '../../src/lang/tspeek'
import { createTSActions, gotoPreference, runTsCommand } from '../../src/lang/tsactions'

const SLOW = 60_000

function mount(doc: string, pos: number, options?: IEditorOptions) {
    clearTSServiceCache()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.single(pos), extensions: options ? [editorOptions.of(options)] : [] }),
        parent: host,
    })
    return { view, done: () => { closePeek(view); view.destroy(); host.remove() } }
}

// 接口合并:两处声明 → 两个定义
const OVERLOADS = 'interface A { x: 1 }\ninterface A { y: 2 }\nlet a: A\n'
const USE = OVERLOADS.lastIndexOf('A')
const FIRST = OVERLOADS.indexOf('A')
const SECOND = OVERLOADS.indexOf('A', OVERLOADS.indexOf('\n'))

describe('gotoLocation.* (Monaco SymbolNavigationAction._onResult)', () => {
    it('gotoPreference:默认 peek,逐类读 multipleXxx', () => {
        const s = EditorState.create({ doc: '', extensions: [editorOptions.of({ gotoLocation: { multipleDefinitions: 'goto', multipleReferences: 'gotoAndPeek' } })] })
        expect(gotoPreference(s, 'definition')).toBe('goto')
        expect(gotoPreference(s, 'reference')).toBe('gotoAndPeek')
        expect(gotoPreference(s, 'implementation')).toBe('peek')
        expect(gotoPreference(EditorState.create({ doc: '' }), 'typeDefinition')).toBe('peek')
    })

    it('multipleDefinitions=peek(默认):多个定义开 peek,不跳', async () => {
        const doc = OVERLOADS
        const m = mount(doc, USE)
        const a = createTSActions({ lang: 'typescript', fileName: '/gl-peek.ts' })
        expect(await a.goToDefinition(m.view)).toBe(true)
        expect(peekOpen(m.view)).toBe(true)
        m.done()
    }, SLOW)

    it('multipleDefinitions=goto:跳到第一处,不开 peek;再按 F12 走下一处', async () => {
        const doc = OVERLOADS
        const m = mount(doc, USE, { gotoLocation: { multipleDefinitions: 'goto' } })
        const a = createTSActions({ lang: 'typescript', fileName: '/gl-goto.ts' })
        await a.goToDefinition(m.view)
        expect(peekOpen(m.view)).toBe(false)
        expect(m.view.state.selection.main.head).toBe(FIRST)
        await a.goToDefinition(m.view)
        expect(m.view.state.selection.main.head).toBe(SECOND)
        m.done()
    }, SLOW)

    it('multipleDefinitions=gotoAndPeek:跳到第一处并开 peek', async () => {
        const doc = OVERLOADS
        const m = mount(doc, USE, { gotoLocation: { multipleDefinitions: 'gotoAndPeek' } })
        const a = createTSActions({ lang: 'typescript', fileName: '/gl-gap.ts' })
        await a.goToDefinition(m.view)
        expect(m.view.state.selection.main.head).toBe(FIRST)
        expect(peekOpen(m.view)).toBe(true)
        m.done()
    }, SLOW)

    it('multipleReferences=goto:引用多于一处也直接跳(Shift+F12)', async () => {
        const doc = 'const v = 1\nv\nv\n'
        const m = mount(doc, doc.indexOf('v'), { gotoLocation: { multipleReferences: 'goto' } })
        const a = createTSActions({ lang: 'typescript', fileName: '/gl-ref.ts' })
        await a.goToReferences(m.view)
        expect(peekOpen(m.view)).toBe(false)
        const m2 = mount(doc, doc.indexOf('v'))
        const a2 = createTSActions({ lang: 'typescript', fileName: '/gl-ref2.ts' })
        await a2.goToReferences(m2.view)
        expect(peekOpen(m2.view)).toBe(true)
        m.done(); m2.done()
    }, SLOW)

    it('alternativeDefinitionCommand:站在唯一定义上再按 → 跑备选(默认 goToReferences 开 peek;设空串则不跑)', async () => {
        const doc = 'function foo() {}\nfoo()\nfoo()\n'
        const m = mount(doc, doc.indexOf('foo'))
        const a = createTSActions({ lang: 'typescript', fileName: '/gl-alt.ts' })
        await a.goToDefinition(m.view)
        expect(peekOpen(m.view)).toBe(true)
        m.done()
        const n = mount(doc, doc.indexOf('foo'), { gotoLocation: { alternativeDefinitionCommand: '' } })
        const b = createTSActions({ lang: 'typescript', fileName: '/gl-alt2.ts' })
        await b.goToDefinition(n.view)
        expect(peekOpen(n.view)).toBe(false)
        n.done()
    }, SLOW)
})

describe('Peek Type Definition / Peek Implementations / 命令 id', () => {
    it('peekTypeDefinition 开 peek,标题 Type Definitions', async () => {
        const doc = 'type Alias = { n: number }\nconst val: Alias = { n: 1 }\nval\n'
        const m = mount(doc, doc.lastIndexOf('val'))
        const a = createTSActions({ lang: 'typescript', fileName: '/ptd.ts' })
        expect(await a.peekTypeDefinition(m.view)).toBe(true)
        expect(peekOpen(m.view)).toBe(true)
        expect(m.view.dom.querySelector('.cm-peek-title')?.textContent).toContain('Type Definitions')
        m.done()
    }, SLOW)

    it('peekImplementation 开 peek,标题 Implementations;runTsCommand 按 Monaco id 触发', async () => {
        const doc = 'interface Face { hello(): void }\nclass Imp implements Face { hello() { return } }\nconst f: Face = new Imp()\nf.hello()\n'
        const m = mount(doc, doc.lastIndexOf('hello'))
        const a = createTSActions({ lang: 'typescript', fileName: '/pimpl.ts' })
        expect(await runTsCommand(a, 'editor.action.peekImplementation', m.view)).toBe(true)
        expect(peekOpen(m.view)).toBe(true)
        expect(m.view.dom.querySelector('.cm-peek-title')?.textContent).toContain('Implementations')
        expect(await runTsCommand(a, 'editor.action.nope', m.view)).toBe(false)
        m.done()
    }, SLOW)
})

describe('Format Selection', () => {
    it('多选区各自格式化', async () => {
        const doc = 'const a=1\nconst b=2\nconst c=3\n'
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.create([EditorSelection.range(0, 9), EditorSelection.range(20, 29)]),
                extensions: [EditorState.allowMultipleSelections.of(true)],
            }),
            parent: host,
        })
        const a = createTSActions({ lang: 'typescript', fileName: '/fmt-multi.ts' })
        expect(await a.formatSelection(view)).toBe(true)
        expect(view.state.doc.toString()).toBe('const a = 1\nconst b=2\nconst c = 3\n')
        view.destroy(); host.remove()
    }, SLOW)

    it('空选区:格式化光标所在行,别的行不动', async () => {
        const doc = 'const a=1\nconst b=2\n'
        const m = mount(doc, 3)
        const a = createTSActions({ lang: 'typescript', fileName: '/fmt-line.ts' })
        expect(await a.formatSelection(m.view)).toBe(true)
        expect(m.view.state.doc.toString()).toBe('const a = 1\nconst b=2\n')
        m.done()
    }, SLOW)
})
