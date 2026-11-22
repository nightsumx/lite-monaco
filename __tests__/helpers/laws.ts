// 测试用的小工具：不变式、序列化往返、fixture 快照。原来用的是 monorepo 里没发布的 plena，
// 这里只留 lite-monaco 用到的那部分，输入都是显式给的，不做采样和反例收缩。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

/** fn(...args) 的结果满足 pred(out, ...args)。 */
export function checkInvariant<A extends any[], R>(fn: (...args: A) => R, pred: (out: R, ...args: A) => boolean, args: A): boolean {
    return pred(fn(...args), ...args) === true
}

/** 对每组输入，decode(encode(x)) 深相等于 x。 */
export function roundtrip<A extends unknown[], B>(name: string, encode: (...args: A) => B, decode: (encoded: B) => A[0], opts: { inputs: A[] }): void {
    it(`${name} · roundtrip`, () => {
        for (const args of opts.inputs) expect(decode(encode(...args))).toEqual(args[0])
    })
}

const strip = (s: string) => s.endsWith('\n') ? s.slice(0, -1) : s

/**
 * __fixtures__/<name>/<case>/ 每个目录一条用例：out.txt 是期望，其余 *.txt 是具名输入（key 为去掉扩展名的文件名）。
 * UPDATE_SNAPSHOTS=1 时把实际结果写进 out.txt.proposed，人看过再改名。
 */
export function createSuite(testDir: string) {
    return (name: string, run: (input: unknown, opts: unknown, ctx: { inputs: Record<string, string> }) => string | Promise<string>) => {
        const root = join(testDir, '__fixtures__', name)
        for (const dir of readdirSync(root, { withFileTypes: true })) {
            if (!dir.isDirectory()) continue
            const caseDir = join(root, dir.name)
            it(dir.name, async () => {
                const inputs: Record<string, string> = {}
                for (const f of readdirSync(caseDir)) {
                    if (f === 'out.txt' || f.endsWith('.proposed')) continue
                    inputs[f.replace(/\.txt$/, '')] = strip(readFileSync(join(caseDir, f), 'utf8'))
                }
                const actual = await run(inputs, undefined, { inputs })
                const out = join(caseDir, 'out.txt')
                if (process.env.UPDATE_SNAPSHOTS) writeFileSync(join(caseDir, 'out.txt.proposed'), `${actual}\n`)
                if (!existsSync(out)) expect.fail(`${name}/${dir.name} 没有 out.txt。UPDATE_SNAPSHOTS=1 生成 out.txt.proposed，看过后改名。`)
                expect(actual).toBe(strip(readFileSync(out, 'utf8')))
            })
        }
    }
}

