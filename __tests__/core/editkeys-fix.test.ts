// F5 编辑命令 / 键位对齐 Monaco 0.52(macOS 默认键位)的回放测试。
// 每个场景:同样的文档 + 选区,发同样的按键,终态必须等于对照页上 Monaco 的实测结果
// (__fixtures__/f5-monaco-edit.json,来自 /tmp/lc-hunt/a-edit 各差分脚本;wasDiff = 修复前 lite-monaco 和 Monaco 不一致)。
import { describe, expect, it } from 'vitest'
import fixtures from './__fixtures__/f5-monaco-edit.json'
import { type Fixture, replay, setMacPlatform } from './f5-replay'

setMacPlatform()
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const mods = { lm, core }

const all = fixtures as Fixture[]
const byFile = new Map<string, Fixture[]>()
for (const f of all) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file)!.push(f)
}

for (const [file, list] of byFile) {
    describe(`Monaco 实测回放 ${file}`, () => {
        for (const fx of list) {
            it(`${fx.wasDiff ? '[修复] ' : ''}${fx.name}`, () => {
                expect(replay(mods, fx)).toBe(fx.monaco)
            })
        }
    })
}
