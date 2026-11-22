// 对照测试用的 Monaco 参照:直接加载 node_modules 里 monaco-editor 的 editorOptions.js / fontInfo.js / editorZoom.js。
// 当前进程里加载的那一份用的是本机平台(platform.js 在 Node 下读 process.platform);
// 其它平台的参照放进子进程跑(把 process.platform 先改掉再 import),结果以 JSON 带回。
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { KeyOS } from '../../src/core/keyos'

const ROOT = path.resolve(__dirname, '../..')
export const MONACO_CONFIG = path.join(ROOT, 'node_modules/monaco-editor/esm/vs/editor/common/config')

/** Monaco 校验 / 计算时所在的平台(= 本进程的 process.platform) */
export const hostOs: KeyOS = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'

export interface MonacoRef {
    EditorOptions: Record<string, { id: number, name: string, defaultValue: unknown, validate(input: unknown): unknown, compute(env: unknown, options: unknown, value: unknown): unknown }>
    editorOptionsRegistry: { id: number, name: string, defaultValue: unknown, validate(input: unknown): unknown, compute(env: unknown, options: unknown, value: unknown): unknown }[]
}

let cached: Promise<MonacoRef> | undefined
export function loadMonaco(): Promise<MonacoRef> {
    cached ??= (async () => {
        const dyn = (f: string) => import(/* @vite-ignore */ pathToFileURL(path.join(MONACO_CONFIG, f)).href)
        const opts = await dyn('editorOptions.js')
        return { EditorOptions: opts.EditorOptions, editorOptionsRegistry: opts.editorOptionsRegistry }
    })()
    return cached
}

/**
 * 在另一个平台(或另一个干净的 Node 进程)上跑一段参照脚本。脚本里可用 `m`(editorOptions.js 的导出)、`font`(fontInfo.js 的导出)、
 * `zoom`(editorZoom.js 的导出),用 `out(value)` 带回 JSON。
 * 为什么要子进程:vitest 的模块图里 fontInfo.js 和 editorZoom.js 会各得一份,EditorZoom 单例对不上,字体缩放没法在进程内对照。
 */
export function runRef<T>(platform: 'darwin' | 'win32' | 'linux', body: string): T {
    const code = `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} })
const m = await import(${JSON.stringify(path.join(MONACO_CONFIG, 'editorOptions.js'))})
const font = await import(${JSON.stringify(path.join(MONACO_CONFIG, 'fontInfoFromSettings.js'))})
const zoom = await import(${JSON.stringify(path.join(MONACO_CONFIG, 'editorZoom.js'))})
const out = v => process.stdout.write(JSON.stringify(v))
${body}`
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { maxBuffer: 1 << 26 }).toString()) as T
}
