// 第四轮 K 组:sticky 作用域来源对齐 Monaco stickyScroll.defaultModel = 'outlineModel'。
// Monaco 有 document symbol provider(TS navigation tree)时用 outline 符号范围,if / for / try / switch / case 不上榜;
// 没有 outline 才退回折叠范围。浏览器逐 scrollTop 对照见 /tmp/lc-hunt/r3/b/st4.ts(90 个位置)、/tmp/lc-hunt/r4/K/p16b.ts。
// 修前:只有折叠范围 → 对照页样例 st=4947 显示 [175,249,250,251](Monaco [175,249,250]),st=7100 [348,349,357](Monaco [348])。
import { describe, it, expect } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { makeScrolled } from './input-harness'
import { stickyScrollOverlay, type StickyNode, type StickyOutlineSource } from '../../src/core/feature/stickyscroll'
import { navTreeToSticky, tsStickyOutline } from '../../src/lang/tssticky'
import { clearTSServiceCache, createTSService } from '../../src/lang/tsservice'
import { SAMPLE_CODE } from '../../demo/sample'

const SLOW = 60_000
const LH = 20

const SRC = [
    'class A {',                   // 1
    '    m(x: number) {',          // 2
    '        if (x) {',            // 3
    '            for (;;) {',      // 4
    '                f()',         // 5
    '            }',               // 6
    '        }',                   // 7
    '        try {',               // 8
    '            g()',             // 9
    '        } catch {}',          // 10
    '    }',                       // 11
    '}',                           // 12
    'const o = {',                 // 13
    '    run() {',                 // 14
    '        [1].map(v => {',      // 15
    '            return v',        // 16
    '        })',                  // 17
    '    },',                      // 18
    '}',                           // 19
    'function solo() { return 1 }', // 20
    'declare function f(): void',  // 21
    'declare function g(): void',  // 22
].join('\n')

const flat = (roots: readonly StickyNode[] | null, out: string[] = []): string[] => {
    for (const r of roots ?? []) { out.push(`${r.start}-${r.end}`); flat(r.children, out) }
    return out
}

async function navTree(doc: string, fileName: string) {
    clearTSServiceCache()
    const session = createTSService({ lang: 'typescript', fileName })
    session.update(doc)
    const svc = await session.ensure()
    const state = EditorState.create({ doc })
    return navTreeToSticky((await svc.getNavigationTree(fileName)).childItems ?? [], p => state.doc.lineAt(p).number)
}

describe('navTreeToSticky(Monaco StickyModelFromCandidateOutlineProvider)', () => {
    it('类、方法、对象字面量里的方法、传参的回调是作用域;if / for / try 不是;体末 = 收尾行前一行', async () => {
        const roots = await navTree(SRC, '/sticky-outline.ts')
        // A 1..11、m 2..10;o 13..18(对象字面量和 const 同起始行 → 不另起一层,run 直接挂 o 下)、run 14..17、
        // `map() callback` 15..16(nav tree 收传参的函数表达式,Monaco 样例 250 行 `batch(() => {` 同理上榜);
        // 单行的 solo / f / g 在顶层保留(参与候选二分),体末 < 起始行,不会上榜
        expect(flat(roots)).toEqual(['1-11', '2-10', '13-18', '14-17', '15-16', '20-19', '21-20', '22-21'])
    }, SLOW)

    it('没有 outline 条目 → null(退回折叠范围)', () => {
        expect(navTreeToSticky([], () => 1)).toBeNull()
    })

    it('XL 文档不在主线程取 navigation tree(5 万行实测 0.2s~10s+),留折叠范围', async () => {
        const doc = Array.from({ length: 20_001 }, (_, i) => `x${i}()`).join('\n')
        const view = makeScrolled(doc, { clientHeight: 518, scrollTop: 0, lineHeight: LH })
        let calls = 0
        const off = tsStickyOutline({ lang: 'typescript', fileName: '/sticky-xl.ts' })(view, () => { calls++ })
        await new Promise(r => setTimeout(r, 450))
        expect(calls).toBe(0)
        off()
        view.destroy()
    }, SLOW)
})

// 对照页同款几何:行高 20、视口 518
function mount(scrollTop: number, outline?: StickyOutlineSource) {
    const view = makeScrolled(SAMPLE_CODE, { clientHeight: 518, scrollTop, lineHeight: LH, scrollHeight: SAMPLE_CODE.split('\n').length * LH })
    const st = () => view.scrollDOM.scrollTop
    view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 518, width: 600, height: 518, x: 0, y: 0, toJSON() {} }) as DOMRect
    view.contentDOM.getBoundingClientRect = () => ({ top: -st(), left: 0, right: 600, bottom: 518, width: 600, height: 518, x: 0, y: -st(), toJSON() {} }) as DOMRect
    const off = stickyScrollOverlay(view, outline ? { outline } : undefined)
    const rows = () => {
        view.scrollDOM.dispatchEvent(new Event('scroll'))
        return [...view.dom.querySelectorAll<HTMLElement>('.cm-sticky-line')].map(r => Number(r.dataset.line))
    }
    return { view, rows, done: () => { off(); view.destroy() } }
}

describe('sticky overlay 用 TS outline(对照页样例,Monaco 实测)', () => {
    it('st=4947 → [175,249,250];st=7100 → [348](for / switch / case 不上榜)', async () => {
        clearTSServiceCache()
        let ready!: () => void
        const published = new Promise<void>(r => { ready = r })
        const src = tsStickyOutline({ lang: 'typescript', fileName: '/sticky-sample.ts' })
        const { view, rows, done } = mount(4947, (v, publish) => src(v, roots => { publish(roots); if (roots) ready() }))
        // 语言服务没就绪前:折叠范围(修前的结果)
        expect(rows()).toEqual([175, 249, 250, 251])
        await published
        expect(rows()).toEqual([175, 249, 250])
        view.scrollDOM.scrollTop = 7100
        expect(rows()).toEqual([348])
        done()
    }, SLOW)

    it('publish(null) → 退回折叠范围;编辑后在重算回来之前按改动映射行号', () => {
        let pub!: (r: StickyNode[] | null) => void
        const { view, rows, done } = mount(4947, (_v, publish) => { pub = publish; return () => {} })
        pub([{ start: 175, end: 400, children: [{ start: 249, end: 300, children: [] }] }])
        expect(rows()).toEqual([175, 249])
        // 文档开头插一行:作用域整体下移一行,sticky 行号跟着变
        view.dispatch(view.state.update({ changes: { from: 0, insert: '\n' } }))
        view.scrollDOM.scrollTop = 4967
        expect(rows()).toEqual([176, 250])
        pub(null)
        expect(rows()).toEqual([176, 250, 251, 252])
        done()
    })
})
