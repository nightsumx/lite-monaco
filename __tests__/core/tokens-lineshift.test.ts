// 行数变化的编辑(Enter、删行、多行粘贴)后,token 缓存沿用窗口之后的整段:
// 逐 token、逐行起点都要和同一份文本从零算的一样,随机编辑里夹模板串、块注释这类会让后面几行变色的输入。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import type { Transaction } from '../../src/core/model/state'

const { EditorState } = await import('../../src/core/model/state')
const tokens = await import('../../src/core/view/tokens')
const { selectTokenCache, ensureTokenCache, ensureTokenizedRange, prepareLinesFromTransaction, linesForDoc, tokensInLineRange, tokenLinesView } = tokens

let hl: Highlighter
beforeAll(async () => {
    hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
})

const ser = () => tokensInLineRange(1, 1e9).map(l => l.map(t => `${t.content}:${t.color}`).join('|'))
const opts = { lang: 'typescript', theme: 'dark-plus' }

function fresh(doc: string) {
    selectTokenCache({})
    const lines = doc.split('\n')
    ensureTokenCache(hl as never, lines, opts)
    ensureTokenizedRange(1, lines.length)
    return ser()
}

const code = (n: number) => Array.from({ length: n }, (_, i) => (i % 6 === 0 ? `function f${i}(a: number) {` : i % 6 === 5 ? '}' : i % 6 === 2 ? `    const s${i} = "str ${i}" // note` : `    call(${i}, a)`)).join('\n')

describe('行数变化的增量分词', () => {
    it('随机 Enter / 删行 / 多行粘贴 / 开关模板串和块注释:token 与行起点和从零算一致', () => {
        const owner = {}
        let doc = code(900)
        let state = EditorState.create({ doc })
        selectTokenCache(owner)
        ensureTokenCache(hl as never, doc.split('\n'), opts)
        let seed = 5
        let lastEdit: { from: number, to: number, insert: string } = { from: 0, to: 0, insert: "" }
        const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
        const inserts = ['\n', '\n    ', '\n\n', 'x', '`', '/*', '*/', '${', '}', 'a\nb\nc', '', '"']
        for (let step = 0; step < 60; step++) {
            const len = state.doc.length
            const from = rnd(len + 1)
            const to = Math.min(len, from + (rnd(4) === 0 ? rnd(60) : 0))
            lastEdit = { from, to, insert: inserts[rnd(inserts.length)] }
            const tr: Transaction = state.update({ changes: lastEdit })
            selectTokenCache(owner)
            prepareLinesFromTransaction(tr)
            state = tr.apply()
            selectTokenCache(owner)
            ensureTokenCache(hl as never, linesForDoc(state.doc.lines) ?? state.doc.toJSON(), opts)
            if (step % 3 === 0 || step > 50) {
                selectTokenCache(owner)
                ensureTokenizedRange(1, state.doc.lines)
                const got = ser()
                const want = fresh(state.doc.toString())
                expect(got, `step ${step}`).toEqual(want)
                selectTokenCache(owner)
            }
            const v = tokenLinesView()
            if (v) {
                let p = 0
                for (let i = 0; i < v.lines.length; i++) {
                    if (v.lineStart[i] !== p) throw new Error(`step ${step} ${JSON.stringify(lastEdit)}: lineStart[${i}] = ${v.lineStart[i]}, want ${p}`)
                    p += v.lines[i].length + 1
                }
                expect(v.lineStart[v.lines.length]).toBe(p)
            }
        }
    })

    it('一次 Enter 在窗口里就收敛时,不重分词窗口之后的行', () => {
        let calls = 0
        const w = {
            getLoadedLanguages: () => hl.getLoadedLanguages(),
            getLastGrammarState: (t: unknown) => hl.getLastGrammarState(t as never) as never,
            codeToTokens: (c: string, o: unknown) => { calls++; return hl.codeToTokens(c, o as never) as never },
        }
        const owner = {}
        const doc = code(300)
        let state = EditorState.create({ doc })
        selectTokenCache(owner)
        ensureTokenCache(w as never, doc.split('\n'), opts)
        const at = state.doc.line(100).to
        const tr: Transaction = state.update({ changes: { from: at, insert: '\n    more()' } })
        selectTokenCache(owner)
        prepareLinesFromTransaction(tr)
        state = tr.apply()
        calls = 0
        ensureTokenCache(w as never, linesForDoc(state.doc.lines) ?? state.doc.toJSON(), opts)
        expect(calls).toBeLessThanOrEqual(4)
    })
})
