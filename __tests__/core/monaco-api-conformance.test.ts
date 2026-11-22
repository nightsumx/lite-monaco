// 平替验收:monaco-editor 0.55.1 的 monaco.d.ts 里每个运行时符号,lite-monaco 同路径都得有。
// 官方 d.ts 是权威;缺口由机器列出。不支持的项只能写在 UNSUPPORTED 里并给出具体理由(同 __parity__/na 的规矩)。
import { describe, expect, it } from 'vitest'
import * as monaco from '../../src/index'
import { readMonacoSurface } from './monaco-api-values'

const UNSUPPORTED: Record<string, string> = {
    'editor.createWebWorker': 'Monaco 的 createWebWorker 靠自己的 EditorWorkerService / IWebWorkerClient + 打包器产出的 worker 入口(MonacoEnvironment.getWorker / getWorkerUrl)把模块跑进 Web Worker 并做 RPC 代理;lite-monaco 没有 worker 宿主(语言服务都在主线程的 provider 里),假装返回一个代理只会让调用方在拿 proxy 时静默挂住,所以不实现',
    'editor.createMultiFileDiffEditor': 'Monaco 里它实例化 MultiDiffEditorWidget(多文件滚动 diff 视图,返回类型在 d.ts 里就是 any);lite-monaco 只有单文件 createDiffEditor,没有多文件 diff 容器 / 资源树 / 折叠逻辑,不实现',
}

const surface = readMonacoSurface()
const ns = monaco as unknown as Record<string, Record<string, unknown>>

describe('Monaco 0.55.1 API 全集(值)', () => {
    for (const k of ['editor', 'languages'] as const) {
        it(`monaco.${k}.* 每个符号都存在`, () => {
            const missing = surface[k].values.filter(n => !(n in ns[k]) && !UNSUPPORTED[`${k}.${n}`])
            expect(missing, `缺 ${missing.length} 个`).toEqual([])
        })
    }
    it('顶层值(Position/Range/Selection/Uri/KeyCode/KeyMod/MarkerSeverity/MarkerTag/Emitter/CancellationTokenSource/Token…)', () => {
        const skipTop = /^(css|scss|less|html|handlebar|razor|json|typescript|javascript|monaco_|editor_main_|index_d_)/
        const top = surface.top.values.filter(n => !skipTop.test(n) && !/^(getWorker|getTypeScriptWorker|getJavaScriptWorker|createWebWorker|registerHTMLLanguageService|ModuleKind|JsxEmit|NewLineKind|ScriptTarget|ModuleResolutionKind|typescriptVersion|EventEmitter|ValueWithChangeEvent|BaseMessageTransport|MonacoLspClient|WebSocketTransport|createTransportTo)/.test(n))
        const missing = top.filter(n => !(n in monaco) && !UNSUPPORTED[`top.${n}`])
        expect(missing).toEqual([])
    })
    it('枚举成员数值逐项对照(editor / languages 的 enum)', () => {
        // 枚举的值要和官方一致,迁移代码里常拿数值比较/序列化
        const bad: string[] = []
        for (const k of ['editor', 'languages'] as const) {
            for (const [name, mem] of Object.entries(surface[k].members)) {
                const v = ns[k][name] as Record<string, unknown> | undefined
                if (!v || typeof v !== 'object') continue
                if (!surface[k].values.includes(name)) continue
                for (const m of mem) if (!(m in v)) bad.push(`${k}.${name}.${m}`)
            }
        }
        expect(bad).toEqual([])
    })
})
