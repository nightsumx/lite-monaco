// 复现用户报的「触发语法错误 → 整个编辑器出 bug 无法编辑」。
//
// 场景:删掉 function 再重写。真根因假设 = 高亮 provider 每次 dispatch 全量重建装饰,
// 当一行的 token(span)结构随编辑改变(关键字消失/出现、字符串/注释未闭合把后续行卷进同一 scope),
// 输出侧 patchDOM 或输入侧 domchange diff 在「span 结构变了而非仅文本变」的行上断裂 DOM≡doc 双射。
//
// 用两个 provider:
//   A wordTokenProvider —— 每词一 span(shiki 每 token 一 span 的最小同构),测行内 span 收缩/消失。
//   B unterminatedStringProvider —— 未闭合引号把「引号到文档末」整段标成一条跨多行 mark(镜像 shiki
//     语法错误时把后续行全卷进 string scope),测跨行 scope 级联。
// 每步真实 DOM 变异后过 checkBijection 闸门。

import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'
import { makeWith, typeText, deleteText, setCaret, pressEnter, expectInvariants } from './input-harness'

// 词级 tokenize:每个非空白词一条 mark。
function wordTokenProvider(state: EditorState) {
    const b = new RangeSetBuilder<Decoration>()
    const doc = state.doc.toString()
    let start = -1
    const flush = (end: number) => { if (start >= 0) { b.add(start, end, Decoration.mark({ class: 'tok' })); start = -1 } }
    for (let i = 0; i < doc.length; i++) {
        const c = doc[i]
        if (c === ' ' || c === '\n' || c === '\t') flush(i)
        else if (start < 0) start = i
    }
    flush(doc.length)
    return b.finish()
}

// 未闭合引号级联:从第一个奇数个引号起,到文档末标成一条 mark(可跨多行),镜像 shiki string scope 卷入。
function unterminatedStringProvider(state: EditorState) {
    const b = new RangeSetBuilder<Decoration>()
    const doc = state.doc.toString()
    let open = -1
    for (let i = 0; i < doc.length; i++) {
        if (doc[i] === '"') {
            if (open < 0) open = i
            else open = -1 // 配对闭合
        }
    }
    if (open >= 0 && open < doc.length) b.add(open, doc.length, Decoration.mark({ class: 'str' }))
    return b.finish()
}

describe('语法编辑:删词再重写 DOM≡doc 双射', () => {
    it('删掉行首关键字后 span 结构变化仍双射', () => {
        const view = makeWith('function foo', [wordTokenProvider])
        expectInvariants(view)
        setCaret(view, 9)
        deleteText(view, 0, 9)
        expect(view.state.doc.toString()).toBe('foo')
        expectInvariants(view)
    })

    it('删关键字再逐字重打回来,每步双射', () => {
        const view = makeWith('function foo', [wordTokenProvider])
        setCaret(view, 8)
        deleteText(view, 0, 8)
        expect(view.state.doc.toString()).toBe(' foo')
        expectInvariants(view)
        const word = 'function'
        for (let i = 0; i < word.length; i++) {
            typeText(view, i, word[i])
            expectInvariants(view)
        }
        expect(view.state.doc.toString()).toBe('function foo')
    })

    it('多行:删中间行关键字不破坏其他行', () => {
        const view = makeWith('const a = 1\nfunction b() {}\nconst c = 2', [wordTokenProvider])
        expectInvariants(view)
        const line2From = view.state.doc.line(2).from
        setCaret(view, line2From + 8)
        deleteText(view, line2From, 8)
        expect(view.state.doc.line(2).text).toBe(' b() {}')
        expectInvariants(view)
    })
})

describe('语法错误级联:未闭合字符串跨行 scope', () => {
    it('删掉闭合引号→后续多行卷入一条跨行 mark,仍双射', () => {
        const view = makeWith('const s = "hi"\nconst t = 1\nconst u = 2', [unterminatedStringProvider])
        expectInvariants(view)
        // 删掉第一行的闭合引号(位置 13 是第二个 "),使其未闭合 → mark 从 open 引号延伸到文档末(跨 3 行)
        const closeQuote = view.state.doc.toString().indexOf('"', 11)
        setCaret(view, closeQuote + 1)
        deleteText(view, closeQuote, 1)
        expect(view.state.doc.line(1).text).toBe('const s = "hi')
        expectInvariants(view)
    })

    it('未闭合后继续在别的行编辑仍双射(用户报的「无法正常编辑」)', () => {
        const view = makeWith('const s = "hi"\nconst t = 1\nconst u = 2', [unterminatedStringProvider])
        const closeQuote = view.state.doc.toString().indexOf('"', 11)
        setCaret(view, closeQuote + 1)
        deleteText(view, closeQuote, 1) // 制造未闭合(跨行 mark 铺满)
        expectInvariants(view)
        // 现在到第二行行尾打字 —— 该行整段在一条跨行 mark 内
        const l2 = view.state.doc.line(2)
        setCaret(view, l2.to)
        typeText(view, l2.to, '0')
        expect(view.state.doc.line(2).text).toBe('const t = 10')
        expectInvariants(view)
    })

    it('未闭合状态下回车分行仍双射', () => {
        const view = makeWith('const s = "hi"\nconst t = 1', [unterminatedStringProvider])
        const closeQuote = view.state.doc.toString().indexOf('"', 11)
        setCaret(view, closeQuote + 1)
        deleteText(view, closeQuote, 1)
        expectInvariants(view)
        const l2 = view.state.doc.line(2)
        setCaret(view, l2.from + 5)
        pressEnter(view, l2.from + 5)
        expectInvariants(view)
    })

    it('重新补上引号→跨行 mark 收回单行,仍双射', () => {
        const view = makeWith('const s = "hi\nconst t = 1', [unterminatedStringProvider])
        expectInvariants(view) // 初始就未闭合(mark 跨行)
        // 在第一行行尾补回引号闭合
        const l1 = view.state.doc.line(1)
        setCaret(view, l1.to)
        typeText(view, l1.to, '"')
        expect(view.state.doc.line(1).text).toBe('const s = "hi"')
        expectInvariants(view)
    })
})

function unterminatedBlockCommentProvider(state: EditorState) {
    const b = new RangeSetBuilder<Decoration>()
    const doc = state.doc.toString()
    const open = doc.indexOf('/*')
    if (open < 0) return b.finish()
    const close = doc.indexOf('*/', open + 2)
    b.add(open, close < 0 ? doc.length : close + 2, Decoration.mark({ class: 'cmt' }))
    return b.finish()
}

describe('语法错误级联:未闭合块注释', () => {
    it('删掉 */ 后后续行卷入注释 mark，编辑仍双射', () => {
        const view = makeWith('const a = 1 /* x */\nconst b = 2\nconst c = 3', [unterminatedBlockCommentProvider])
        expectInvariants(view)
        const close = view.state.doc.toString().indexOf('*/')
        setCaret(view, close + 2)
        deleteText(view, close, 2)
        expect(view.state.doc.line(1).text).toBe('const a = 1 /* x ')
        expectInvariants(view)
        const l2 = view.state.doc.line(2)
        setCaret(view, l2.to)
        typeText(view, l2.to, '0')
        expect(view.state.doc.line(2).text).toBe('const b = 20')
        expectInvariants(view)
    })
})
