// @vitest-environment node
// 模块加载顺序这一类 bug 的两道闸(scripts/build/init-order.mjs):
// 源码上:同一个 import 环里,模块加载时不读 import 进来的值(这里,npm test 就查);
// 产物上:每个 dist 文件里,加载时不读后面才赋值的变量(scripts/build/check-dist.mjs,build 最后一步查)。
// 0.4.0、0.4.1 的默认键位 85 条里 70 条没绑上命令,两道都能拦住(下面「当时的样子」)。
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { findCycleLoadReads, findInitOrderHazards } from '../../scripts/build/init-order.mjs'

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

describe('源码:import 环里加载时不读 import 进来的值', () => {
    it('src 里没有一处', () => {
        const { hits } = findCycleLoadReads(SRC)
        // 有了就改成第一次用到时再算(见 core/edit/keymap.ts 的 getDefaultKeymap),或者把环拆开
        expect(hits.map(h => `${h.file}:${h.line} 读 ${h.name}(来自 ${h.from})`)).toEqual([])
    })
})

describe('产物:加载时读到后面才赋值的变量', () => {
    const names = (code: string) => findInitOrderHazards(code).map(h => h.name)

    it('当时的样子:顶层调用的函数里用到后面才赋值的命令', () => {
        const dist = `
            function buildDefaultKeymap() { return [{ key: "ArrowUp", run: cursorLineUp, shift: selectLineUp }] }
            var defaultKeymap = buildDefaultKeymap();
            var cursorLineUp = (t) => run(t, -1);
            var selectLineUp = (t) => run(t, -1, true);
        `
        expect(names(dist).sort()).toEqual(['cursorLineUp', 'selectLineUp'])
    })

    it('现在的样子:读的时候才建,不算', () => {
        const dist = `
            function buildDefaultKeymap() { return [{ key: "ArrowUp", run: cursorLineUp }] }
            var builtDefault;
            function getDefaultKeymap() { return builtDefault ??= buildDefaultKeymap() }
            var defaultKeymap = new Proxy([], { get: (_, p) => Reflect.get(getDefaultKeymap(), p) });
            var cursorLineUp = (t) => run(t, -1);
        `
        expect(names(dist)).toEqual([])
    })

    it('加载时真跑的都算:直接读、展开、立即调用的函数、new 本文件的类、extends、static 字段', () => {
        const dist = `
            var a = b + 1;
            var list = [...c];
            var iife = (() => d)();
            class K { constructor() { this.x = e } }
            var k = new K();
            class Sub extends Base {}
            class S { static s = f }
            var b = 1, c = [], d = 2, e = 3, Base = class {}, f = 4;
        `
        expect(names(dist).sort()).toEqual(['Base', 'b', 'c', 'd', 'e', 'f'])
    })

    it('不在加载时跑的不算:函数体、方法、实例字段、属性名、局部变量遮蔽', () => {
        const dist = `
            function later() { return x }
            var obj = { x: 1, get y() { return x }, m() { return x } };
            class C { m() { return x } field = x }
            function shadow(x) { return x }
            var s = shadow(1);
            var p = obj.x;
            var x = 1;
        `
        expect(names(dist)).toEqual([])
    })
})
