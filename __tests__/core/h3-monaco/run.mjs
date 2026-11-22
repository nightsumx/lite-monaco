// 子进程入口:读 stdin 的 JSON(场景数组),用真 Monaco 的 TextModel 跑,把结果 JSON 写到 stdout。
// 用法:node --import ./reg.mjs run.mjs < scenarios.json
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runScenario } from './scenario.mjs'
const root = path.resolve(new URL('.', import.meta.url).pathname, '../../../node_modules/monaco-editor/esm/vs/editor/editor.api.js')
const m = await import(pathToFileURL(root).href)
let input = ''
for await (const chunk of process.stdin) input += chunk
const scenarios = JSON.parse(input)
const out = scenarios.map(sc => {
  const model = m.editor.createModel(sc.text, 'plaintext')
  try { return runScenario(model, sc.steps) } finally { model.dispose() }
})
process.stdout.write(JSON.stringify(out))
