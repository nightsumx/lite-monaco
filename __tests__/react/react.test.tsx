// lite-monaco/react:和 @monaco-editor/react 4.7.0 同样的用法(浏览器里的三方对比见 scripts/browser-diff/react/run.mjs),
// 这里在 jsdom 里钉住几条不能退的:同一个 monaco、受控 value 不触发 onChange、换 path 换 model、StrictMode 只建一次且活着、
// 卸载时 dispose model(keepCurrentModel 例外)、DiffEditor、useMonaco 和 loader。
import { StrictMode, act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as lite from '../../src/index'
import Editor, { DiffEditor, loader, useMonaco, type Monaco, type MonacoDiffEditor } from '../../src/react/index'
import { fakeHl } from '../core/h1-helpers'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Ed = lite.editor.IStandaloneCodeEditor
const quiet = { autocomplete: false, tsDiagnostics: false, hover: false, stickyScroll: false } as never

let root: Root | null = null
let host: HTMLElement | null = null

function render(el: ReactElement): void {
    if (!root) {
        host = document.createElement('div')
        document.body.appendChild(host)
        root = createRoot(host)
    }
    act(() => root!.render(el))
}

async function unmount(): Promise<void> {
    act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    await Promise.resolve() // 拆编辑器排在微任务里(useEditorLifetime)
}

const models = () => lite.editor.getModels().length

beforeAll(() => { lite.setDefaultHighlighter(fakeHl()) })
afterEach(async () => {
    await unmount()
    for (const m of lite.editor.getModels()) m.dispose()
})

describe('lite-monaco/react <Editor>', () => {
    it('第一次绘制前就建好,onMount 拿到的 monaco 就是 lite-monaco', () => {
        const onMount = vi.fn()
        render(<Editor height={200} defaultValue="hello" defaultLanguage="plaintext" onMount={onMount} options={{ features: quiet } as never} />)
        expect(onMount).toHaveBeenCalledTimes(1)
        const [ed, m] = onMount.mock.calls[0] as [Ed, Monaco]
        expect(m.editor.create).toBe(lite.editor.create)
        expect(ed.getValue()).toBe('hello')
        expect(host!.textContent).not.toContain('Loading...')
        // 外层 DOM 同 @monaco-editor/react:<section> 里一个编辑器容器
        const section = host!.firstElementChild as HTMLElement
        expect(section.tagName).toBe('SECTION')
        expect(section.style.height).toBe('200px')
        expect((section.lastElementChild as HTMLElement).style.display).toBe('')
    })

    it('受控 value:改 prop 不触发 onChange,一步可撤销;撤销和用户输入触发 onChange', () => {
        const onChange = vi.fn()
        let ed!: Ed
        const el = (value: string) => <Editor value={value} language="plaintext" onChange={onChange} onMount={e => { ed = e }} options={{ features: quiet } as never} />
        render(el('a'))
        render(el('b'))
        expect(ed.getValue()).toBe('b')
        expect(onChange).not.toHaveBeenCalled()
        act(() => { ed.trigger('keyboard', 'undo', null) })
        expect(ed.getValue()).toBe('a')
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBe('a')
        act(() => { ed.trigger('keyboard', 'type', { text: 'x' }) })
        expect(onChange).toHaveBeenCalledTimes(2)
        expect(onChange.mock.calls[1][0]).toBe(ed.getValue())
    })

    it('换 path 换 model,各自的视图状态分开存', () => {
        let ed!: Ed
        const el = (path: string, v: string) => <Editor path={path} defaultValue={v} defaultLanguage="plaintext" onMount={e => { ed = e }} options={{ features: quiet } as never} />
        render(el('a.txt', 'one\ntwo\nthree'))
        ed.setPosition({ lineNumber: 3, column: 2 })
        render(el('b.txt', 'bbb'))
        expect(ed.getModel()!.uri.path).toBe('/b.txt')
        expect(ed.getValue()).toBe('bbb')
        expect(models()).toBe(2)
        render(el('a.txt', 'ignored'))
        expect(ed.getValue()).toBe('one\ntwo\nthree')
        expect(ed.getPosition()).toMatchObject({ lineNumber: 3, column: 2 })
    })

    it('StrictMode:beforeMount、onMount 各一次,不多建 model,留下的编辑器是活的', async () => {
        const beforeMount = vi.fn()
        const onMount = vi.fn()
        render(<StrictMode><Editor defaultValue="s" defaultLanguage="plaintext" beforeMount={beforeMount} onMount={onMount} options={{ features: quiet } as never} /></StrictMode>)
        await Promise.resolve()
        expect(beforeMount).toHaveBeenCalledTimes(1)
        expect(onMount).toHaveBeenCalledTimes(1)
        expect(models()).toBe(1)
        const ed = onMount.mock.calls[0][0] as Ed
        expect(ed.getModel()?.getValue()).toBe('s')
        expect(lite.editor.getEditors()).toContain(ed)
        await unmount()
        expect(models()).toBe(0)
        expect(lite.editor.getEditors()).not.toContain(ed)
    })

    it('卸载时 dispose model;keepCurrentModel 留着', async () => {
        render(<Editor path="k1.txt" defaultValue="1" defaultLanguage="plaintext" options={{ features: quiet } as never} />)
        await unmount()
        expect(models()).toBe(0)
        render(<Editor path="k2.txt" defaultValue="2" defaultLanguage="plaintext" keepCurrentModel options={{ features: quiet } as never} />)
        await unmount()
        expect(lite.editor.getModels().map(m => m.uri.path)).toEqual(['/k2.txt'])
    })

    it('onValidate:当前 model 的 markers 变了就调', async () => {
        const onValidate = vi.fn()
        let ed!: Ed
        render(<Editor defaultValue="x" defaultLanguage="plaintext" onValidate={onValidate} onMount={e => { ed = e }} options={{ features: quiet } as never} />)
        lite.editor.setModelMarkers(ed.getModel()!, 'me', [{ severity: lite.MarkerSeverity.Error, message: 'bad', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }])
        await new Promise(r => setTimeout(r, 10))
        expect(onValidate).toHaveBeenCalledTimes(1)
        expect(onValidate.mock.calls[0][0][0]).toMatchObject({ owner: 'me', message: 'bad' })
    })
})

describe('lite-monaco/react <DiffEditor>', () => {
    it('两边的内容和语言;改 modified 是一步编辑', () => {
        let ed!: MonacoDiffEditor
        const el = (modified: string) => <DiffEditor original="a" modified={modified} language="plaintext" onMount={e => { ed = e }} options={{ features: quiet } as never} />
        render(el('b'))
        expect(ed.getModel()!.original.getValue()).toBe('a')
        expect(ed.getModel()!.modified.getValue()).toBe('b')
        render(el('c'))
        expect(ed.getModifiedEditor().getValue()).toBe('c')
        expect(models()).toBe(2)
    })
})

describe('lite-monaco/react useMonaco / loader', () => {
    it('useMonaco 第一次渲染就有;loader.init 给出同一个 monaco,cancel 后以 cancelation 拒绝', async () => {
        const seen: (Monaco | null)[] = []
        function Probe() { seen.push(useMonaco()); return null }
        render(createElement(Probe))
        expect(seen[0]?.editor.create).toBe(lite.editor.create)
        expect((await loader.init()).editor.create).toBe(lite.editor.create)
        const p = loader.init()
        p.cancel()
        await expect(p).rejects.toMatchObject({ type: 'cancelation' })
    })
})
