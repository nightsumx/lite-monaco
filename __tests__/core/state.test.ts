import { describe, expect, it } from 'vitest'
import { checkInvariant } from '../helpers/laws'
import { ChangeSet } from '../../src/core/model/change'
import { EditorSelection } from '../../src/core/model/selection'
import { Annotation, Compartment, EditorState, Facet, StateEffect, StateField } from '../../src/core/model/state'

// CM7 EditorState + Transaction —— 阶段1 收官(§4 重新设计点)。
//
// 重新设计两刀:
//  ① 去循环依赖:CM6 的 Transaction.state getter 回写 tr._state 进 EditorState 构造器(隐式环)。
//     CM7 → Transaction 是纯数据(持 startState),apply() 是纯函数产新态,零缓存零回写。
//  ② 解冻可监测洞:CM6 field/facet 值塞进私有 values[](地址位打包,不可枚举),正是 §3 说的
//     「值私有/不可枚举」根因。CM7 → fields/facets 是可枚举 Map,snapshot() 全 dump。
//
// 砍(阶段1 无消费者,各记一笔):computed facet(.compute + 整套地址/SlotStatus 依赖追踪机器)、
//   Compartment/reconfigure 魔法 effect、change/transaction filter+extender、StateField.init/provide、
//   自动注入的 Date.now() time 注解。静态输入 facet → 配置期常量,跨事务原样复用。

describe('EditorState.create —— 初态与 facet 默认值', () => {
    it('空文档 + 起始光标在 0', () => {
        const s = EditorState.create()
        expect(s.doc.toString()).toBe('')
        expect(s.selection.main.from).toBe(0)
    })
    it('给定 doc/selection', () => {
        const s = EditorState.create({ doc: 'hello', selection: { anchor: 1, head: 3 } })
        expect(s.doc.toString()).toBe('hello')
        expect(s.selection.main.from).toBe(1)
        expect(s.selection.main.to).toBe(3)
    })
    it('facet 默认值:tabSize=4 / lineBreak=\\n', () => {
        const s = EditorState.create()
        expect(s.tabSize).toBe(4)
        expect(s.lineBreak).toBe('\n')
    })
})

describe('update + apply —— 编辑产新态,纯函数零回写', () => {
    it('插入文本,选区随变更映射', () => {
        const s = EditorState.create({ doc: 'hello', selection: { anchor: 5 } })
        const tr = s.update({ changes: { from: 0, to: 0, insert: 'X' } })
        const s2 = tr.apply()
        expect(s2.doc.toString()).toBe('Xhello')
        expect(s2.selection.main.from).toBe(6)
        // startState 不被触碰
        expect(s.doc.toString()).toBe('hello')
    })
    it('apply 两次得相等态(无缓存副作用)', () => {
        const s = EditorState.create({ doc: 'ab' })
        const tr = s.update({ changes: { from: 2, to: 2, insert: 'c' } })
        const a = tr.apply(), b = tr.apply()
        expect(a.doc.toString()).toBe('abc')
        expect(b.doc.toString()).toBe('abc')
        expect(a.selection.eq(b.selection)).toBe(true)
    })
    it('selection-only 事务不改文档', () => {
        const s = EditorState.create({ doc: 'hello' })
        const s2 = s.update({ selection: { anchor: 2 } }).apply()
        expect(s2.doc.toString()).toBe('hello')
        expect(s2.selection.main.from).toBe(2)
    })
})

describe('StateField —— 可扩展存储,update 经事务', () => {
    const counter = StateField.define<number>({
        create: () => 0,
        update: (v, tr) => (tr.docChanged ? v + 1 : v),
    })
    it('create 初值 + 每次文档变更 +1', () => {
        let s = EditorState.create({ doc: 'a', extensions: counter })
        expect(s.field(counter)).toBe(0)
        s = s.update({ changes: { from: 1, to: 1, insert: 'b' } }).apply()
        expect(s.field(counter)).toBe(1)
        s = s.update({ selection: { anchor: 0 } }).apply()
        expect(s.field(counter)).toBe(1)
        s = s.update({ changes: { from: 0, to: 0, insert: 'c' } }).apply()
        expect(s.field(counter)).toBe(2)
    })
    it('field 读未注册字段抛错;require=false 返 undefined', () => {
        const s = EditorState.create()
        expect(() => s.field(counter)).toThrow()
        expect(s.field(counter, false)).toBe(undefined)
    })
    const docLen = StateField.define<number>({
        create: s => s.doc.length,
        update: (_v, tr) => tr.newDoc.length,
    })
    it('field 可经 tr 读新文档', () => {
        let s = EditorState.create({ doc: 'abc', extensions: docLen })
        expect(s.field(docLen)).toBe(3)
        s = s.update({ changes: { from: 3, to: 3, insert: 'de' } }).apply()
        expect(s.field(docLen)).toBe(5)
    })
})

describe('Facet —— 定义/of/combine,静态输入配置期常量', () => {
    it('lineSeparator facet 影响 toText/changes 切行', () => {
        const s = EditorState.create({ doc: 'a;b', extensions: EditorState.lineSeparator.of(';') })
        expect(s.lineBreak).toBe(';')
        // 用分号切行:doc 两行
        expect(s.doc.lines).toBe(2)
    })
    it('allowMultipleSelections=off 时 apply 坍缩为单选区', () => {
        const s = EditorState.create({
            doc: 'hello world',
            selection: EditorSelection.create(
                [EditorSelection.range(0, 1), EditorSelection.range(6, 7)], 0,
            ),
        })
        // 默认 off → create 已坍缩
        expect(s.selection.ranges.length).toBe(1)
    })
    it('allowMultipleSelections=on 保留多选区', () => {
        const s = EditorState.create({
            doc: 'hello world',
            selection: EditorSelection.create(
                [EditorSelection.range(0, 1), EditorSelection.range(6, 7)], 0,
            ),
            extensions: EditorState.allowMultipleSelections.of(true),
        })
        expect(s.selection.ranges.length).toBe(2)
    })
})

describe('Annotation —— 纯数据,无自动 time 注入', () => {
    const greet = Annotation.define<string>()
    it('注解只含显式给定值(不自动塞 time)', () => {
        const s = EditorState.create({ doc: 'a' })
        const tr = s.update({ annotations: greet.of('hi') })
        expect(tr.annotation(greet)).toBe('hi')
        expect(tr.annotations.length).toBe(1)
    })
    it('userEvent 与 isUserEvent 前缀匹配', () => {
        const s = EditorState.create({ doc: 'a' })
        const tr = s.update({ userEvent: 'input.type' })
        expect(tr.isUserEvent('input')).toBe(true)
        expect(tr.isUserEvent('input.type')).toBe(true)
        expect(tr.isUserEvent('delete')).toBe(false)
    })
})

describe('StateEffect —— 定义/of/is/map', () => {
    const fx = StateEffect.define<number>()
    it('of + is 类型守卫', () => {
        const e = fx.of(7)
        expect(e.is(fx)).toBe(true)
        expect(e.value).toBe(7)
    })
    it('挂到事务,经 apply 透传(effects 在 tr 上可读)', () => {
        const s = EditorState.create({ doc: 'a' })
        const tr = s.update({ effects: fx.of(1) })
        expect(tr.effects.length).toBe(1)
        expect(tr.effects[0].is(fx)).toBe(true)
    })
    it('map:位置型 effect 经变更映射', () => {
        const pos = StateEffect.define<number>({ map: (v, m) => m.mapPos(v) })
        const e = pos.of(3)
        const mapped = e.map(ChangeSet.of({ from: 0, to: 0, insert: 'XX' }, 5))
        expect(mapped?.value).toBe(5)
    })
})

describe('可监测公理:序列化双射 + snapshot 枚举', () => {
    const note = StateField.define<string>({
        create: () => 'init',
        update: v => v,
        toJSON: v => v,
        fromJSON: j => j as string,
    })
    it('EditorState.toJSON/fromJSON 往返 doc+selection(+具名字段)', () => {
        const s = EditorState.create({ doc: 'hello\nworld', selection: { anchor: 2, head: 4 }, extensions: note })
        const json = JSON.parse(JSON.stringify(s.toJSON({ note })))
        const round = EditorState.fromJSON(json, {}, { note })
        expect(round.doc.toString()).toBe('hello\nworld')
        expect(round.selection.eq(s.selection)).toBe(true)
        expect(round.field(note)).toBe('init')
    })
    it('snapshot 枚举所有 field 与 facet 值(解冻私有 values)', () => {
        const s = EditorState.create({ doc: 'ab', extensions: [note, EditorState.tabSize.of(2)] })
        const snap = s.snapshot()
        expect(snap.doc).toBe('ab')
        expect(snap.fields.length).toBe(1)
        expect(snap.fields[0].value).toBe('init')
        // tabSize facet 值可枚举出来 = 2
        const ts = snap.facets.find(f => f.value === 2)
        expect(ts).toBeTruthy()
    })
    it('Transaction.toJSON → changes 可重放复现 newDoc', () => {
        const s = EditorState.create({ doc: 'abc' })
        const tr = s.update({ changes: { from: 1, to: 2, insert: 'XY' }, selection: { anchor: 0 } })
        const json = JSON.parse(JSON.stringify(tr.toJSON()))
        const changes = ChangeSet.fromJSON(json.changes)
        expect(changes.apply(s.doc).toString()).toBe(tr.newDoc.toString())
        expect(json.selection.ranges[0].anchor).toBe(0)
    })
    it('doc roundtrip 对任意串成立', () => {
        expect(checkInvariant(
            (text: string) => {
                const s = EditorState.create({ doc: text })
                return EditorState.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).doc.toString()
            },
            (out, text) => out === text,
            ['hello world'],
        )).toBe(true)
    })
})

describe('Compartment + reconfigure', () => {
    const tabFacet = Facet.define<number, number>({ combine: vs => vs.length ? vs[0] : 4 })

    it('Compartment 初始 extension 生效', () => {
        const comp = new Compartment(EditorState.tabSize.of(2))
        const s = EditorState.create({ extensions: [comp, tabFacet.of(8)] })
        expect(s.facet(tabFacet)).toBe(8)
        expect(s.facet(EditorState.tabSize)).toBe(2)
    })

    it('reconfigure 后 facet 值更新', () => {
        const comp = new Compartment(EditorState.tabSize.of(2))
        const s = EditorState.create({ extensions: [comp] })
        expect(s.facet(EditorState.tabSize)).toBe(2)

        const tr = s.update({ effects: comp.reconfigure(EditorState.tabSize.of(8)) })
        const s2 = tr.apply()
        expect(s2.facet(EditorState.tabSize)).toBe(8)
    })

    it('reconfigure 保留旧 field 值(doc 不变)', () => {
        const counter = StateField.define<number>({
            create: () => 0,
            update: (v, tr) => v + (tr.docChanged ? 1 : 0),
        })
        const comp = new Compartment(EditorState.tabSize.of(2))
        const s = EditorState.create({ extensions: [comp, counter] })
        // 先打一次字
        const tr1 = s.update({ changes: { from: 0, insert: 'x' } })
        const s1 = tr1.apply()
        expect(s1.field(counter)).toBe(1)

        // reconfigure tabSize,counter 值应保留
        const tr2 = s1.update({ effects: comp.reconfigure(EditorState.tabSize.of(8)) })
        const s2 = tr2.apply()
        expect(s2.facet(EditorState.tabSize)).toBe(8)
        expect(s2.field(counter)).toBe(1)
        // reconfigure 后再打字,counter 继续 +1
        const tr3 = s2.update({ changes: { from: 1, insert: 'y' } })
        const s3 = tr3.apply()
        expect(s3.field(counter)).toBe(2)
    })

    it('reconfigure 加新 field:用 create 初始化', () => {
        const field = StateField.define<string>({
            create: () => 'init',
            update: (v) => v,
        })
        const comp = new Compartment([])
        const s = EditorState.create({ extensions: [comp] })
        expect(s.field(field, false)).toBeUndefined()

        const tr = s.update({ effects: comp.reconfigure(field) })
        const s2 = tr.apply()
        expect(s2.field(field)).toBe('init')
    })

    it('未 reconfigure 的 compartment 跨事务不变', () => {
        const comp = new Compartment(EditorState.tabSize.of(4))
        const s = EditorState.create({ extensions: [comp] })
        const tr = s.update({ changes: { from: 0, insert: 'x' } })
        const s2 = tr.apply()
        expect(s2.facet(EditorState.tabSize)).toBe(4)
    })

    it('reconfigure 成空槽：facet 回默认', () => {
        const comp = new Compartment(EditorState.tabSize.of(2))
        const s = EditorState.create({ extensions: [comp] })
        expect(s.facet(EditorState.tabSize)).toBe(2)
        const s2 = s.update({ effects: comp.reconfigure([]) }).apply()
        expect(s2.facet(EditorState.tabSize)).toBe(4)
    })

    it('同一事务两次 reconfigure 后者生效', () => {
        const comp = new Compartment(EditorState.tabSize.of(2))
        const s = EditorState.create({ extensions: [comp] })
        const s2 = s.update({
            effects: [
                comp.reconfigure(EditorState.tabSize.of(8)),
                comp.reconfigure(EditorState.tabSize.of(16)),
            ],
        }).apply()
        expect(s2.facet(EditorState.tabSize)).toBe(16)
    })

    it('reconfigure 卸掉 field 后读不到', () => {
        const field = StateField.define<number>({
            create: () => 1,
            update: v => v,
        })
        const comp = new Compartment(field)
        const s = EditorState.create({ extensions: [comp] })
        expect(s.field(field)).toBe(1)
        const s2 = s.update({ effects: comp.reconfigure([]) }).apply()
        expect(s2.field(field, false)).toBeUndefined()
    })
})
