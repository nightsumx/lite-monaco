// 第 2 轮 F4 补全:照 Monaco 0.52 suggestWidget / tsMode 的行为(实测脚本 /tmp/lc-hunt/fix2/f4/ 与 h-overlay/suggest/)。
// 走真实路径:provider 注册表 → SuggestModel / SuggestController → SuggestUi(core overlay)。
import { afterEach, describe, expect, it } from 'vitest'
import {
    mountSuggest, cleanupSuggest, itemsProvider, splitCaret, until, wait,
    type SuggestRig, type RigOptions,
} from './_suggest-harness'
import { suggestPageNext, suggestPagePrev } from '../../src/core/feature/suggestwidget'
import type { CompletionItemProvider, CompletionItemM } from '../../src/lang/providers'

afterEach(() => {
    cleanupSuggest()
    document.querySelectorAll('.cm-completionList,.cm-completionDetails').forEach(n => n.remove())
})

let fileSeq = 0
function mount(text: string, o: { lang?: string, ts?: string, providers?: [string, CompletionItemProvider][] } = {}): SuggestRig {
    const { doc, cursor } = splitCaret(text)
    const opts: RigOptions = { doc, cursor, providers: o.providers, lang: o.lang }
    if (o.ts) { opts.lang = 'typescript'; opts.fileName = `/${o.ts}-${++fileSeq}.ts` }
    const r = mountSuggest(opts)
    r.v.caretCoords = () => ({ left: 10, top: 10, bottom: 30, height: 20 } as never)
    return r
}
const frames = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
const listEl = () => document.querySelector('.cm-completionList') as HTMLElement
const plain = (p: CompletionItemProvider): [string, CompletionItemProvider][] => [['plaintext', p]]
const many = itemsProvider(Array.from({ length: 40 }, (_, i) => ({ label: `w${String(i).padStart(2, '0')}` })))

describe('S13 文档词不限长度(Monaco $textualSuggest 只跳过当前词和数字)', () => {
    it('单字母词也进候选', async () => {
        const r = mount('a b ab\n|')
        r.trigger()
        await until(() => r.listed)
        expect([...r.labels].sort()).toEqual(['a', 'ab', 'b'])
    })
})

describe('S8 TS/JS 不装静态片段源(Monaco TS 不带 snippets)', () => {
    it('lite-monaco TS 接线给出的候选里没有 for/forof/log 片段', async () => {
        const r = mount('', { ts: 's8' })
        r.trigger()
        await until(() => r.listed, 30_000)
        const l = r.labels
        const kinds = l.map((_, i) => r.ui.host!.rowAt(i).kind)
        expect(l.length).toBeGreaterThan(0)
        expect(kinds.includes('snippet')).toBe(false)
        expect(l.includes('forof') || l.includes('log')).toBe(false)
    }, 40_000)
})

describe('O24 显式触发:No suggestions. / Loading...(Monaco suggestWidget State.Empty / Loading)', () => {
    it('没有候选 → 提示行 No suggestions.,宽 215、高一行 + 边框', async () => {
        const r = mount('//|')
        r.trigger()
        await until(() => r.open)
        await frames()
        const m = document.querySelector('.cm-completionList .cm-completionMessage') as HTMLElement
        expect(m?.textContent).toBe('No suggestions.')
        const list = m.parentElement as HTMLElement
        expect(list.style.width).toBe('215px')
        expect(list.style.height).toBe(`${Math.round(r.v.oracle.lineHeight) + 2}px`)
        expect(list.querySelector('.cm-completion-sash')).toBeNull()
    })

    it('提示行打字留着(同一行、不退到触发点左边),换行关', async () => {
        const r = mount('zz|')
        r.trigger()
        await until(() => r.open)
        expect(r.ui.state.message).toBe('empty')
        r.type('q')
        await wait(60)
        expect(r.ui.state.message).toBe('empty')
        r.type('\n')
        await r.waitClosed(1000)
        expect(r.open).toBe(false)
    })

    it('语言源 50ms 没回 → Loading...,结果到了换成列表', async () => {
        let resolve: (x: CompletionItemM[]) => void = () => {}
        const slow: CompletionItemProvider = {
            provideCompletionItems(model, position) {
                const w = model.getWordUntilPosition(position)
                const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
                return new Promise(res => { resolve = xs => res({ suggestions: xs.map(x => ({ ...x, range })) }) })
            },
        }
        const r = mount('|', { providers: plain(slow) })
        r.trigger()
        await wait(30)
        expect(r.open).toBe(false)
        await wait(40)
        expect(r.ui.state.message).toBe('loading')
        await frames()
        expect(document.querySelector('.cm-completionMessage')?.textContent).toBe('Loading...')
        resolve([{ label: 'alpha', kind: 4, insertText: 'alpha', range: undefined as never }])
        await until(() => r.listed)
        expect(r.ui.state.message).toBeFalsy()
        expect(r.labels).toEqual(['alpha'])
    })

    it('自动触发没结果不出提示行', async () => {
        const r = mount('|')
        r.type('z')
        await wait(150)
        expect(r.open).toBe(false)
    })
})

describe('O25 / S7 详情面板走 markdown(Monaco tagToString + renderMarkdown)', () => {
    it('文档 + @param/@returns 渲成段落,参数名是 code;面板无圆角、关闭钮 20×20、段落无外距', async () => {
        const src = '/**\n * Adds two numbers.\n * @param a first\n * @returns the sum\n */\nfunction addNumbers(a: number, b: number) { return a + b }\naddN|'
        const r = mount(src, { ts: 'f4-o25' })
        r.trigger()
        // TS 加载+查询是异步的,等候选出现而不是猜时间
        await until(() => r.listed && r.labels[0] === 'addNumbers', 30_000)
        expect(r.labels[0]).toBe('addNumbers')
        // resolve 是异步的:行的 info 到了才有文档
        await until(() => !!r.ui.host!.info(0, () => {})?.documentation, 10_000)
        const info = r.ui.host!.info(0, () => {})!
        // Monaco tagToString 按空格拼 part(TS 的 part 里自带空格 → 「—   first」,Monaco 实测同样三个空格)
        expect(info.documentation).toBe('Adds two numbers.\n\n*@param*`a` —   first\n\n*@returns* — the sum')
        r.ui.command!('trigger') // 再按一次 → 详情
        await until(() => !!document.querySelector('.cm-completionDetails'), 2000)
        const det = document.querySelector('.cm-completionDetails') as HTMLElement
        expect(det.style.borderRadius).toBe('0px')
        const close = det.querySelector('.codicon-close') as HTMLElement
        expect([close.style.width, close.style.height]).toEqual(['20px', '20px'])
        const docs = det.querySelector('.cm-completionDetails-docs.markdown-docs') as HTMLElement
        const ps = [...docs.querySelectorAll('p')]
        expect(ps.map(p => p.textContent)).toEqual(['Adds two numbers.', '@parama —   first', '@returns — the sum'])
        expect(ps[1].querySelector('em')?.textContent).toBe('@param')
        expect(ps[1].querySelector('code')?.textContent).toBe('a')
        expect(ps.every(p => p.style.margin === '0px')).toBe(true)
        expect((docs.firstElementChild as HTMLElement).style.padding).toBe('4px 5px')
    }, 40_000)
})

describe('O33 废弃项(Monaco kindModifiers deprecated → 0.66 + 删除线,不画命中)', () => {
    it('TS 源给 deprecated 标记', async () => {
        const r = mount('/** @deprecated */\nfunction oldOne() {}\noldO|', { ts: 'f4-o33' })
        r.trigger()
        await until(() => r.listed && r.labels.includes('oldOne'), 30_000)
        expect(r.ui.host!.rowAt(r.labels.indexOf('oldOne')).deprecated).toBe(true)
    }, 40_000)

    it('行里标签半透明 + 删除线,没有命中高亮', async () => {
        const r = mount('ol|', { providers: plain(itemsProvider([{ label: 'oldOne', tags: [1] }])) })
        r.trigger()
        await until(() => r.listed)
        await frames()
        const lab = document.querySelector('.cm-completionSelected .cm-completionLabel') as HTMLElement
        expect(lab.style.opacity).toBe('0.66')
        expect(lab.style.textDecoration).toBe('line-through')
        expect(lab.querySelector('.cm-completionMatched')).toBeNull()
    })
})

describe('O32 聚焦行 readMore(›)', () => {
    it('能展开的聚焦行有 chevron-right,点它切详情、列表不关', async () => {
        const r = mount('w|', { providers: plain(itemsProvider([{ label: 'w1', detail: 'number' }, { label: 'w2' }])) })
        r.trigger()
        await until(() => r.listed)
        await frames()
        const rows = [...document.querySelectorAll('.cm-completionItem')]
        expect(rows[0].querySelector('.cm-completionReadMore.codicon-chevron-right')).not.toBeNull()
        expect(rows[1].querySelector('.cm-completionReadMore')).toBeNull()
        ;(rows[0].querySelector('.cm-completionReadMore') as HTMLElement).click()
        await until(() => !!document.querySelector('.cm-completionDetails'), 1000)
        expect(document.querySelector('.cm-completionDetails')).not.toBeNull()
        expect(r.open).toBe(true)
    })
})

describe('O38 / O30 列表按像素翻页与滚轮(Monaco list renderHeight = 12 行 + 2)', () => {
    it('PageDown ×2 → 23,PageUp → 13(半露的第 12 行不算首行),再 PageUp → 0', async () => {
        const r = mount('w|', { providers: plain(many) })
        r.trigger()
        await until(() => r.listed)
        const seen: number[] = []
        for (const cmd of [suggestPageNext, suggestPageNext, suggestPagePrev, suggestPagePrev]) {
            cmd(r.v)
            seen.push(r.selected)
        }
        expect(seen).toEqual([11, 23, 13, 0])
    })

    it('滚轮一格 50px;聚焦行滚出视口仍画着', async () => {
        const r = mount('w|', { providers: plain(many) })
        r.trigger()
        await until(() => r.listed)
        await frames()
        const list = listEl()
        const ev = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
        Object.defineProperty(ev, 'wheelDeltaY', { value: -120 })
        list.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
        expect(r.ui.state.scrollTop).toBe(50)
        for (let i = 0; i < 6; i++) list.dispatchEvent(Object.defineProperty(new WheelEvent('wheel', { deltaY: 100, cancelable: true }), 'wheelDeltaY', { value: -120 }))
        expect(r.selected).toBe(0)
        expect(document.querySelector('.cm-completionSelected')?.getAttribute('aria-posinset')).toBe('1')
    })
})

describe('O31 东 / 南 sash 改尺寸,重开保留', () => {
    it('下方:东、南 sash;拖东边 +120 → 宽 550,关掉重开仍 550', async () => {
        const r = mount('w|', { providers: plain(itemsProvider([{ label: 'w1' }, { label: 'w2' }, { label: 'w3' }])) })
        r.trigger()
        await until(() => r.listed)
        await frames()
        const list = listEl()
        const shown = (s: string) => (list.querySelector(`.cm-completion-sash-${s}`) as HTMLElement).style.display
        expect([shown('n'), shown('e'), shown('s')]).toEqual(['none', 'block', 'block'])
        const east = list.querySelector('.cm-completion-sash-e') as HTMLElement
        east.dispatchEvent(new PointerEvent('pointerdown', { clientX: 440, clientY: 40, bubbles: true }))
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 560, clientY: 40 }))
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 560, clientY: 40 }))
        expect(list.style.width).toBe('550px')
        r.v.dispatch(r.v.state.update({ selection: { anchor: 0 }, userEvent: 'select.pointer' }))
        await r.waitClosed(1000)
        expect(document.querySelector('.cm-completionList')).toBeNull()
        r.v.dispatch(r.v.state.update({ selection: { anchor: 1 } }))
        r.trigger()
        await until(() => r.listed)
        await frames()
        expect((document.querySelector('.cm-completionList') as HTMLElement).style.width).toBe('550px')
    })
})

describe('关键字源在没有语言源时仍在(非 TS 语言)', () => {
    it('python 关键字照常', async () => {
        const r = mount('de|', { lang: 'python' })
        r.trigger()
        await until(() => r.listed)
        expect(r.labels).toContain('def')
    })
})
