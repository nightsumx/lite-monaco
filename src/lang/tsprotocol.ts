// 主线程 ↔ TS 语言服务(通常在 Web Worker 里)的消息协议。
//
// 语言服务和它的项目状态(打开的文件、宿主文件、compilerOptions、解析表)只活在服务那一侧;主线程这边
// 的 tsservice.ts 留一份文本镜像(同步 API 要用:getFileText / listUserFiles),改动攒着,下一次请求前
// 以补丁发过去。通道保序,所以每个请求看到的就是它之前所有改动之后的项目。

import type * as TS from 'typescript'

export type TsFamily = 'ts' | 'js'

/** 项目改动。路径已规范成以 / 开头 */
export type TsOp =
    | { k: 'open', path: string, text: string }
    /** [start, end) 换成 insert;oldLen 是补丁前的全文长度(对账用) */
    | { k: 'patch', path: string, start: number, end: number, insert: string, oldLen: number }
    | { k: 'close', path: string }
    | { k: 'host', set: Record<string, string>, del: string[] }
    | { k: 'options', options: TS.CompilerOptions }
    | { k: 'resolutions', table: Record<string, Record<string, string>> }

export type TsRequest =
    /** epoch:主线程这一刻的项目版本号(每次改动 +1),语义诊断据此判断「算的是不是最新一版」 */
    | { t: 'mut', family: TsFamily, epoch: number, ops: TsOp[] }
    /** deadlineAt:Date.now() 的绝对时间,到点由 TS 自己的取消检查中断 */
    | { t: 'call', id: number, family: TsFamily, method: string, args: unknown[], deadlineAt?: number }
    /** 丢掉所有项目(测试清理、换通道) */
    | { t: 'reset' }

export type TsResponse =
    | { t: 'res', id: number, ok: true, value: unknown }
    | { t: 'res', id: number, ok: false, name: string, message: string }
    /** 本文件的语义诊断在 epoch 这一版上算完了 */
    | { t: 'semantic', family: TsFamily, path: string, epoch: number }
    /** 补丁的旧长度和服务一侧这份文本对不上(两边失去同步):请主线程把这个文件整篇重发 */
    | { t: 'desync', family: TsFamily, path: string }

/** 两端之间的通道。Worker 就是它;测试和没配 Worker 时是同线程的回环 */
export interface TsTransport {
    post(req: TsRequest): void
    onMessage(fn: (res: TsResponse) => void): void
    terminate?(): void
}

/** 请求到的时候两边的文本还没对上(整篇重发在路上):主线程重试一次 */
export const TS_DESYNC = 'TsDesync'

/** 请求被 deadline 打断 */
export const TS_CANCELED = 'OperationCanceledException'
export function isTsCanceled(e: unknown): boolean {
    return !!e && typeof e === 'object' && (e as { name?: string }).name === TS_CANCELED
}

// —— 能结构化克隆的诊断:语言服务那边把 file(整棵 SourceFile)换成只有文件名的壳 ——

export interface SlimDiagnostic {
    start?: number
    length?: number
    code: number
    category: TS.DiagnosticCategory
    messageText: string | TS.DiagnosticMessageChain
    file?: { fileName: string }
    reportsUnnecessary?: boolean
    reportsDeprecated?: boolean
    relatedInformation?: SlimDiagnostic[]
    source?: string
}

/** ts.DiagnosticCategory 的值(主线程不加载 typescript,不能读枚举) */
export const DiagCategory = { Warning: 0, Error: 1, Suggestion: 2, Message: 3 } as const

/** ts.flattenDiagnosticMessageText 的等价实现(只用换行符) */
export function flattenMessage(m: string | TS.DiagnosticMessageChain | undefined, newLine = '\n', indent = 0): string {
    if (m === undefined) return ''
    if (typeof m === 'string') return m
    let out = ''
    if (indent) {
        out += newLine
        for (let i = 0; i < indent; i++) out += '  '
    }
    out += m.messageText
    indent++
    if (m.next) for (const n of m.next) out += flattenMessage(n, newLine, indent)
    return out
}

// —— 语言服务的异步形状 ——

type LS = TS.LanguageService
type Plain = Omit<LS, 'getProgram' | 'getNonBoundSourceFile' | 'getSourceFile' | 'dispose' | 'getSyntacticDiagnostics'
    | 'getSemanticDiagnostics' | 'getSuggestionDiagnostics' | 'getCompilerOptionsDiagnostics' | 'cleanupSemanticCache'
    | 'getProgram' | 'getCancellationToken' | 'toggleLineComment' | 'toggleMultilineComment' | 'commentSelection' | 'uncommentSelection'>

export type AsyncOf<T> = {
    [K in keyof T as T[K] extends (...a: never[]) => unknown ? K : never]:
    T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
}

/** 在语言服务一侧算的整块活(不能在主线程拿 Program / SourceFile 做的事) */
export interface TsCustomOps {
    /** 等语言服务加载好 */
    $ensure(): Promise<{ version: string }>
    /** 建 program(项目最后一个打开的文件关掉后放下语法树、重建 program 之类) */
    $warm(): Promise<void>
    $supportedCodeFixes(): Promise<string[]>
    $diagnostics(fileName: string, docLen: number, syntaxOnly: boolean, wantTags: boolean, dopts: unknown): Promise<unknown>
    /** 整篇文档的括号跳过范围 [起, 止, 起, 止…](升序) */
    $skipRanges(fileName: string): Promise<number[]>
    /** 项目当前生效的编译选项和根文件(排障、测试用) */
    $programInfo(): Promise<{ options: Record<string, unknown>, roots: string[] }>
    /** 语言服务此刻对这个文件的源码(program 里的 SourceFile.text);没有返回 null */
    $sourceText(fileName: string): Promise<string | null>
    /** 光标处标识符的类型标注 `: T` 插入点;没有返回 null */
    $typeAnnotation(fileName: string, pos: number): Promise<{ from: number, insert: string } | null>
}

export type TsDiagMethods = {
    getSyntacticDiagnostics(fileName: string): Promise<SlimDiagnostic[]>
    getSemanticDiagnostics(fileName: string): Promise<SlimDiagnostic[]>
    getSuggestionDiagnostics(fileName: string): Promise<SlimDiagnostic[]>
    getCompilerOptionsDiagnostics(): Promise<SlimDiagnostic[]>
}

export type TsAsyncService = AsyncOf<Plain> & TsDiagMethods & TsCustomOps

/** 其中带格式设置的方法:参数下标。主线程只发部分设置,服务那边补上 getDefaultFormatCodeSettings */
export const FORMAT_ARG: Record<string, number> = {
    getFormattingEditsForDocument: 1,
    getFormattingEditsForRange: 3,
    getFormattingEditsAfterKeystroke: 3,
    organizeImports: 1,
    getCodeFixesAtPosition: 4,
    getCombinedCodeFix: 2,
    getEditsForRefactor: 1,
    getCompletionEntryDetails: 3,
    getEditsForFileRename: 2,
}

export const DIAG_METHODS = new Set(['getSyntacticDiagnostics', 'getSemanticDiagnostics', 'getSuggestionDiagnostics', 'getCompilerOptionsDiagnostics'])
