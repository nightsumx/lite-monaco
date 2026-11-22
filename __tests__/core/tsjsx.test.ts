import { describe, expect, it } from 'vitest'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { jsxCloseInsert, jsxCloseTagInput, linkRangeChanges, jsxLinkedEditInput } from '../../src/lang/tsjsx'
import { undo, redo } from '../../src/core/edit/history'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { typeText, replaceSelection, setSelection } from './input-harness'
import { SLOW, drain, mount, spy } from './tsinput-harness'


describe('jsxCloseInsert', () => {
    it('> 配闭合标签：插 ></div>，光标在 > 后', () => {
        expect(jsxCloseInsert('>', '</div>')).toEqual({ insert: '></div>', cursor: 1 })
    })

    it('不是 > 或没有闭合文本 → null', () => {
        expect(jsxCloseInsert('x', '</div>')).toBeNull()
        expect(jsxCloseInsert('>', '')).toBeNull()
    })
})

describe('jsxCloseTagInput', () => {
    const opts = { lang: 'tsx', fileName: '/app.tsx' }
    async function setup(doc: string) {
        clearTSServiceCache()
        const session = getTSService(opts)
        session.update(doc)
        await session.ensure()
        const h = spy(jsxCloseTagInput(opts))
        return { ...mount(doc, [h.ext], { anchor: doc.length }), h }
    }

    it('tsx 里 <div 再打 > 补 </div>:同步返回 false,`>` 先落地,闭合标签随后到', async () => {
        const doc = 'const el = <div'
        const { view, done, h } = await setup(doc)
        typeText(view, doc.length, '>')
        expect(h.results).toEqual([false])
        // 请求还没回来:只有默认输入
        expect(view.state.doc.toString()).toBe(doc + '>')
        await drain(opts)
        expect(view.state.doc.toString()).toBe(doc + '></div>')
        expect(view.state.selection.main.head).toBe(doc.length + 1)
        done()
    }, SLOW)

    it('回包前用户又输入 → 丢弃,不用旧位置改新文档', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        typeText(view, doc.length, '>')
        typeText(view, doc.length + 1, 'x')
        await drain(opts)
        expect(view.state.doc.toString()).toBe(doc + '>x')
        done()
    }, SLOW)

    it('回包前光标挪走 → 丢弃', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        typeText(view, doc.length, '>')
        view.dispatch(view.state.update({ selection: EditorSelection.cursor(0) }))
        await drain(opts)
        expect(view.state.doc.toString()).toBe(doc + '>')
        done()
    }, SLOW)

    it('回包前编辑器已销毁 → 丢弃,不抛', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        typeText(view, doc.length, '>')
        done()
        await drain(opts)
        expect(view.state.doc.toString()).toBe(doc + '>')
    }, SLOW)

    it('连打 >(只有最新一次生效,闭合标签只补一份)', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        typeText(view, doc.length, '>')
        typeText(view, doc.length + 1, '>')
        await drain(opts)
        expect(view.state.doc.toString().split('</div>').length - 1).toBeLessThanOrEqual(1)
        expect(view.state.doc.toString().startsWith(doc + '>>')).toBe(true)
        done()
    }, SLOW)

    it('撤销:Ctrl+Z 一次撤掉 `>` 和补出来的闭合标签,重做一起回来', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        typeText(view, doc.length, '>')
        await drain(opts)
        expect(view.state.doc.toString()).toBe(doc + '></div>')
        undo(view)
        expect(view.state.doc.toString()).toBe(doc)
        redo(view)
        expect(view.state.doc.toString()).toBe(doc + '></div>')
        done()
    }, SLOW)

    it('不是 > / 只读:同步返回 false,什么也不补', async () => {
        const doc = 'const el = <div'
        const { view, done } = await setup(doc)
        expect(jsxCloseTagInput(opts)(view, doc.length, doc.length, 'x')).toBe(false)
        done()
        const ro = mount(doc, [EditorState.readOnly.of(true), spy(jsxCloseTagInput(opts)).ext], { anchor: doc.length })
        expect(jsxCloseTagInput(opts)(ro.view, doc.length, doc.length, '>')).toBe(false)
        await drain(opts)
        expect(ro.view.state.doc.toString()).toBe(doc)
        ro.done()
    }, SLOW)
})

describe('linkRangeChanges', () => {
    it('两处同改：改 opening 标签名，closing 跟着变', () => {
        const spec = linkRangeChanges(
            [{ from: 1, to: 4 }, { from: 6, to: 9 }],
            1, 4, 'span',
        )
        expect(spec).not.toBeNull()
        expect(spec!.changes).toEqual([
            { from: 1, to: 4, insert: 'span' },
            { from: 6, to: 9, insert: 'span' },
        ])
    })

    it('不在任一区间内 → null', () => {
        expect(linkRangeChanges([{ from: 1, to: 4 }], 10, 10, 'x')).toBeNull()
    })
})

describe('jsxLinkedEditInput', () => {
    const opts = { lang: 'tsx', fileName: '/app.tsx' }
    const doc = 'const el = <div></div>'
    const open = doc.indexOf('div')
    async function setup() {
        clearTSServiceCache()
        const session = getTSService(opts)
        session.update(doc)
        await session.ensure()
        const h = spy(jsxLinkedEditInput(opts))
        return { ...mount(doc, [h.ext]), h }
    }

    it('改 <div> 的 d 时 </div> 一起变:同步返回 false,开标签先落地,闭标签随后跟上', async () => {
        const { view, done, h } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 'span')
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('const el = <span></div>')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <span></span>')
        // 光标仍在刚打的字后面
        expect(view.state.selection.main.head).toBe(open + 4)
        done()
    }, SLOW)

    it('逐字打:每一笔回来后两边都一致', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 's')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <s></s>')
        typeText(view, open + 1, 'p')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <sp></sp>')
        done()
    }, SLOW)

    it('连打:第二笔的请求问不出区间(此时开闭标签名已不一致),第一笔的结果推到最新文档上,两边仍然对齐', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 's')
        typeText(view, open + 1, 'p')
        typeText(view, open + 2, 'a')
        expect(view.state.doc.toString()).toBe('const el = <spa></div>')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <spa></spa>')
        done()
    }, SLOW)

    it('回包前文档被别的途径改了(非用户输入)→ 丢弃,不用旧位置改新文档', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 'span')
        view.dispatch(view.state.update({ changes: { from: 0, insert: '// c\n' } }))
        await drain(opts)
        expect(view.state.doc.toString()).toBe('// c\nconst el = <span></div>')
        done()
    }, SLOW)

    it('回包前用户在别处又输入了一笔 → 照样把闭标签跟上', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 'span')
        typeText(view, view.state.doc.length, ';')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <span></span>;')
        done()
    }, SLOW)

    it('回包前编辑器已销毁 → 丢弃,不抛', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 'span')
        done()
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <span></div>')
    }, SLOW)

    it('撤销:Ctrl+Z 一次撤掉开标签的改动和闭标签的联动', async () => {
        const { view, done } = await setup()
        setSelection(view, open, open + 3)
        replaceSelection(view, open, open + 3, 'span')
        await drain(opts)
        expect(view.state.doc.toString()).toBe('const el = <span></span>')
        undo(view)
        expect(view.state.doc.toString()).toBe(doc)
        done()
    }, SLOW)

    it('不在标签名里输入:不动', async () => {
        const { view, done, h } = await setup()
        typeText(view, 0, 'x')
        await drain(opts)
        expect(h.results).toEqual([false])
        expect(view.state.doc.toString()).toBe('x' + doc)
        done()
    }, SLOW)
})
