// 打包产物的检查,build 的最后一步(prepublishOnly、export-public.sh 都经过 build)。
// vitest 和官网跑的是源码,模块求值顺序和 tsup 拼出来的分块不一样:0.4.0、0.4.1 的 dist 里默认键位
// 在命令赋值之前就建好了,85 条里 70 条 run 是 undefined,源码测试全绿。这里直接看 dist:
//   1. 每个文件里,模块加载时有没有读到后面才赋值的变量(这一类 bug 的通用检查,init-order.mjs)
//   2. 默认键位每条都有命令
//   3. 用公开 API 在 jsdom 里建一个编辑器,按方向键 / Home / End,光标真的动
// 用法:node scripts/build/check-dist.mjs [dist 目录],默认 ./dist
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import { findInitOrderHazards } from './init-order.mjs'

const dir = resolve(process.argv[2] ?? 'dist')
const fail = []
const ok = []

// 1. 加载顺序
const hazards = []
for (const f of readdirSync(dir)) if (f.endsWith('.js')) hazards.push(...findInitOrderHazards(readFileSync(join(dir, f), 'utf8'), f))
if (hazards.length) {
    const at = [...new Set(hazards.map(h => `${h.file}:${h.readLine}`))]
    fail.push(`${hazards.length} reads at load time of variables assigned later, at ${at.slice(0, 5).join(', ')}: ${hazards.slice(0, 8).map(h => `${h.name} (line ${h.declLine})`).join(', ')}`)
}
else ok.push('load order clean')

// 2、3 要 DOM:jsdom 装成全局,再 import 产物
const dom = new JSDOM('<!doctype html><div id="e" style="width:600px;height:300px"></div>', { pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'DOMRect', 'Element', 'Range', 'Text'])
    if (!(k in globalThis) && dom.window[k]) globalThis[k] = dom.window[k]
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
const monaco = await import(pathToFileURL(join(dir, 'index.js')).href)

const km = monaco.core.defaultKeymap
const broken = km.filter(b => typeof b.run !== 'function' || ('shift' in b && typeof b.shift !== 'function'))
if (km.length < 80 || broken.length) fail.push(`default keymap: ${broken.length} of ${km.length} bindings have no command (${broken.slice(0, 8).map(b => b.key).join(' ')})`)
else ok.push(`keymap ${km.length} bindings`)

const ed = monaco.editor.create(document.getElementById('e'), { value: 'line one\nline two\nline three', language: 'plaintext' })
ed.focus()
ed.setPosition({ lineNumber: 1, column: 1 })
const content = ed.getDomNode().querySelector('[contenteditable]')
const walk = []
for (const [key, want] of [['ArrowDown', '2:1'], ['End', '2:9'], ['ArrowUp', '1:9'], ['Home', '1:1'], ['ArrowRight', '1:2']]) {
    content.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    const p = ed.getPosition()
    walk.push(`${key} ${p.lineNumber}:${p.column}${p.lineNumber + ':' + p.column === want ? '' : ` (want ${want})`}`)
}
ed.dispose()
if (walk.some(w => w.includes('want'))) fail.push(`keys in an editor from dist: ${walk.join(', ')}`)
else ok.push('cursor keys move')

if (fail.length) {
    console.error(`dist check failed (${dir}):\n  ` + fail.join('\n  '))
    process.exit(1)
}
console.log(`dist check: ${ok.join(', ')}`)
process.exit(0) // jsdom 的定时器不让进程自己退
