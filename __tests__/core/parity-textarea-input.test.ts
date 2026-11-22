// 对齐套件里 textAreaInput.test.ts(19 个 IME / 长按 / 表情输入录像)逐条翻译成自有单测。
//
// 原版:把真机录下的一串 DOM 事件(keydown / compositionstart / beforeinput / compositionupdate / input /
// compositionend / keyup ……,每个事件带当时 textarea 的 value 与选区)喂给 TextAreaInput,断言它吐出的
// type{text, replacePrevCharCnt, replaceNextCharCnt, positionDelta} 序列,并把序列解释回去 == 录像的最终 value 与选区。
//
// lite-monaco 没有 textarea 中介:正文本身是 contenteditable,浏览器直接改 DOM,编辑器靠 MutationObserver 把变动读回文档。
// 所以「吐出的 type 序列」这一层不存在;用户看得见的结果 —— 最终文档和选区 —— 在这里一条一条验。
// 回放:同一串录像事件,按录像里每个事件时刻 textarea 的 value / 选区去改 contenteditable 的文本和原生选区
// (录像里 value 是「光标前后各一小段上下文」,本测里它就是整篇文档),再派发同类型的 DOM 事件。
//   · 浏览器的默认动作由录像给出(value 的变化);编辑器若对 keydown 调了 preventDefault(比如 Enter 走自己的 insertNewline),
//     真浏览器不会再有后续的 keypress / beforeinput / input,回放同样跳过它们,最终文档由编辑器自己的命令产生。
//   · 组字期间文档不动(编辑器把组字文本留在 DOM 里),compositionend 才一次性落进文档:每个检查点都验这个行为不坏 DOM ≡ 文档。
// 录像数据从原版测试里脚本提取到 __fixtures__/textarea-input-recordings.json(19 条,事件逐个原样,仅去掉用不到的字段)。
import { describe, expect, it } from 'vitest'
import { make, flush, expectInvariants } from './input-harness'
import type { EditorView } from '../../src/core/view/editorview'
import recordings from './__fixtures__/textarea-input-recordings.json'

interface Ev { t: string, v: string, s: number, e: number, data?: string | null, it?: string, comp?: boolean, key?: string, code?: string, kc?: number, cc?: number, rep?: boolean }
interface Rec { title: string, os: string, browser: string[], initial: { value: string, selectionStart: number, selectionEnd: number }, final: { value: string, selectionStart: number, selectionEnd: number }, events: Ev[] }

function textNodes(root: Node): Text[] {
    const out: Text[] = []
    const walk = (n: Node) => { if (n.nodeType === 3) out.push(n as Text); else n.childNodes.forEach(walk) }
    walk(root)
    return out
}

/** 单行文档:把原生选区放到「文本偏移 a..b」(跨多个文本节点也行) */
function placeNative(view: EditorView, a: number, b: number) {
    const line = view.contentDOM.querySelector('.cm-line') as HTMLElement
    const nodes = textNodes(line)
    const at = (off: number): { node: Node, offset: number } => {
        let acc = 0
        for (const n of nodes) {
            if (off <= acc + n.length) return { node: n, offset: off - acc }
            acc += n.length
        }
        return { node: line, offset: line.childNodes.length }
    }
    const A = at(a), B = at(b)
    const sel = view.contentDOM.ownerDocument.getSelection()!
    sel.removeAllRanges()
    const r = view.contentDOM.ownerDocument.createRange()
    r.setStart(A.node, A.offset)
    r.setEnd(B.node, B.offset)
    sel.addRange(r)
    view.observer.setSelectionRange({ node: A.node, offset: A.offset }, { node: B.node, offset: B.offset })
}

/** 把 contenteditable 的文本改成 value(多个文本节点时放进第一个,其余清空) */
function setDomText(view: EditorView, value: string) {
    const line = view.contentDOM.querySelector('.cm-line') as HTMLElement
    const nodes = textNodes(line)
    if (!nodes.length) { line.insertBefore(line.ownerDocument.createTextNode(value), line.firstChild); return }
    if (nodes.map(n => n.data).join('') === value) return
    nodes[0].nodeValue = value
    for (const n of nodes.slice(1)) n.nodeValue = ''
}

const domText = (view: EditorView) => Array.from(view.contentDOM.querySelectorAll('.cm-line')).map(l => l.textContent ?? '').join('\n')

async function replay(rec: Rec) {
    const view = make(rec.initial.value)
    // 起点:文档 = 录像初始 value,光标 = 录像初始选区
    view.dispatch(view.state.update({ selection: { anchor: rec.initial.selectionStart, head: rec.initial.selectionEnd } }))
    placeNative(view, rec.initial.selectionStart, rec.initial.selectionEnd)

    let swallowed = false // keydown 被编辑器自己处理了:到下一个 keyup 为止浏览器不再有默认动作
    const checkpoints: string[] = []
    for (const ev of rec.events) {
        const native = ev.t === 'keypress' || ev.t === 'beforeinput' || ev.t === 'input'
        if (swallowed && native) continue
        const skipDom = swallowed // keyup 也不再改 DOM:录像里它的 value 是浏览器默认动作之后的,编辑器已自己做过了
        if (ev.t === 'keyup') swallowed = false
        if (!skipDom) {
            setDomText(view, ev.v)
            placeNative(view, ev.s, ev.e)
        }
        const el = view.contentDOM
        if (ev.t === 'keydown' || ev.t === 'keyup' || ev.t === 'keypress') {
            const k = new KeyboardEvent(ev.t, { key: ev.key, code: ev.code, keyCode: ev.kc, charCode: ev.cc, repeat: !!ev.rep, isComposing: !!ev.comp, bubbles: true, cancelable: true })
            el.dispatchEvent(k)
            if (ev.t === 'keydown' && k.defaultPrevented) swallowed = true
        } else if (ev.t.startsWith('composition')) {
            el.dispatchEvent(new CompositionEvent(ev.t, { data: ev.data ?? '', bubbles: true }))
        } else {
            const ie = new InputEvent(ev.t, { data: ev.data ?? null, inputType: ev.it, isComposing: !!ev.comp, bubbles: true, cancelable: true })
            el.dispatchEvent(ie)
            if (ev.t === 'beforeinput' && ie.defaultPrevented) swallowed = true
        }
        await Promise.resolve()
        // 非组字时,每个事件之后都要读回:此刻 DOM ≡ 文档
        if (!view.composing) {
            flush(view)
            if (!skipDom) checkpoints.push(`${ev.t}:${view.state.doc.toString()}|${domText(view)}`)
        }
    }
    await Promise.resolve()
    flush(view)
    return { view, checkpoints }
}

describe('TextAreaInput(录像回放:最终文档与选区)', () => {
    for (const rec of recordings as unknown as Rec[]) {
        it(rec.title, async () => {
            const { view, checkpoints } = await replay(rec)
            expect(view.state.doc.toString()).toBe(rec.final.value)
            const main = view.state.selection.main
            expect([main.from, main.to]).toEqual([Math.min(rec.final.selectionStart, rec.final.selectionEnd), Math.max(rec.final.selectionStart, rec.final.selectionEnd)])
            expect(domText(view)).toBe(rec.final.value)
            // 非组字的每个检查点:文档 == DOM(没有谁偷偷改了文档、也没有 DOM 没读回)
            for (const c of checkpoints) {
                const [, rest] = [c.slice(0, c.indexOf(':')), c.slice(c.indexOf(':') + 1)]
                const bar = rest.lastIndexOf('|')
                expect(rest.slice(0, bar), c).toBe(rest.slice(bar + 1))
            }
            expectInvariants(view)
        })
    }
})
