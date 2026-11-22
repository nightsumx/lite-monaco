// 在子进程里跑真 Monaco 的 TextModel,批量返回场景结果(模块图里的 Monaco 是 ESM + css 导入 + DOM 依赖,放进程里不稳)。
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const DIR = __dirname
export interface Scenario { text: string, steps: { m: string, a: unknown[] }[] }
export interface StepResult { r: unknown, events: unknown[], optEvents: unknown[] }

export function runMonacoScenarios(scenarios: Scenario[]): StepResult[][] {
    const out = execFileSync(process.execPath, ['--import', path.join(DIR, 'reg.mjs'), path.join(DIR, 'run.mjs')], {
        input: JSON.stringify(scenarios), maxBuffer: 1 << 28, cwd: DIR,
    })
    return JSON.parse(out.toString()) as StepResult[][]
}
