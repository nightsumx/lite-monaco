// 共享 typescript LanguageService 的主线程一侧 —— 全量 ES/DOM lib + 多文件虚拟工作区。
//
// 对齐 Monaco「同一个 worker 里所有 model 互相可见」:同一语言族(TS:typescript/ts/tsx;
// JS:javascript/js/jsx)的所有编辑器共用一个项目 = 一个虚拟文件系统 + 一个 LanguageService。
// 每个编辑器只是项目里的一个文件(按 fileName 区分);编辑器 destroy 时把自己的文件移出项目。
//
// 语言服务本身(typescript、lib、program、类型检查)在另一侧(tsproject.ts):Worker,或没配 Worker 时
// 同线程回环(tsbackend.ts setTsWorker)。这里留的是:
//   - 项目文本的镜像:同步 API(getFileText / listUserFiles / freeTsFileName)要用。文本只是引用,不另占内存;
//   - 改动的攒批:update() 只记下来,下一次请求前以补丁(公共前后缀之外的那一段)发过去;没有请求就不发;
//   - 异步的语言服务代理 service():方法和 ts.LanguageService 同名,返回 Promise。
// 语义诊断算在哪一版上、算完没有(semanticReady / onSemanticChecked)靠主线程项目版本号 epoch 对账。
//
// 虚拟 FS 和模块解析见 tsproject.ts 文件头。

import { textChange } from './tsbudget'
import { onTsTransportReset, resetTsTransport, tsTransport } from './tsbackend'
import { normPath } from './tsproject'
import {
    isTsCanceled, TS_DESYNC,
    type TsAsyncService, type TsFamily, type TsOp, type TsResponse, type TsTransport,
} from './tsprotocol'

export { isProgramLib } from './tsproject'

export interface TSServiceOptions {
    lang: string
    fileName?: string
    /** 合并进所在项目的 compilerOptions(项目级,对同语言族所有编辑器生效;见 setTsCompilerOptions) */
    compilerOptions?: import('typescript').CompilerOptions
    /** 往所在项目加/更新宿主文件(path → 内容)。path 建议绝对如 /utils.ts。只增改不删 */
    files?: Record<string, string>
}

/** 项目里一个打开的编辑器:跨文件编辑通过它落到对应 view(进它自己的撤销栈) */
export interface TsOpenEditor {
    /** 编辑器当前全文(跨文件查询前拉一次,别的编辑器的 debounce 还没推过来也不会读到旧文) */
    getText(): string
    applyTextChanges(changes: readonly { start: number, length: number, newText: string }[], userEvent: string): void
}

export interface TSServiceSession {
    fileName: string
    update(text: string): void
    /** 增删改额外文件;null 删除 */
    updateFile(path: string, text: string | null): void
    /** 批量替换项目的宿主文件表(打开的编辑器缓冲不受影响) */
    setFiles(files: Record<string, string>): void
    /** 等语言服务加载好(typescript + 标准库)。service() 的请求本来就排在加载之后,不必先调它;预热用 */
    ensure(): Promise<TsAsyncService>
    /**
     * 语言服务的异步代理:方法和 ts.LanguageService 同名,返回 Promise。请求前先把攒着的项目改动发过去,
     * 所以调之前 session.update(最新全文) 即可。Program / SourceFile 过不了线程:要用它们的活在服务那一侧做($ 开头的方法)
     */
    service(): TsAsyncService
    /** 当前 VFS 中非 lib 的用户文件路径 */
    listUserFiles(): string[]
    /** 读 VFS 用户文件全文(含主缓冲);lib 不返回。跨文件预览 / def 列表用 */
    getFileText(path: string): string | null
    /**
     * 编辑器占用本文件(引用计数);返回的函数释放,计数归零时文件移出项目。
     * 给了 editor → 跨文件操作(重命名等)能把改动写进这个编辑器(对齐 Monaco 改别的 model)
     */
    acquire(editor?: TsOpenEditor): () => void
    /** 项目里打开着 path 的编辑器(没有 → null) */
    editorFor(path: string): TsOpenEditor | null
    /** 把项目里所有打开的编辑器的当前文本拉进项目(跨文件操作前调) */
    syncOpenEditors(): void
    /** 项目里别的文件(其它编辑器 / 宿主文件 / compilerOptions)变了。诊断等据此重算 */
    onProjectChange(fn: () => void): () => void
    /**
     * 项目从上次改动以来,本文件的语义诊断算过没有。TS 按 program 缓存语义诊断;code fix 内部会把整个文件的
     * 语义诊断 + 建议诊断都问一遍(codefix.getFixes → getDiagnostics),没算过就是一次全文类型检查
     */
    semanticReady(): boolean
    /** 本文件的语义诊断刚算完(谁调的 getSemanticDiagnostics 都算) */
    onSemanticChecked(fn: () => void): () => void
    /**
     * 给一次(或一串)TS 调用定时间上限:fn 拿到的代理发出的请求,到点由 TS 自己的取消检查中断,整个返回 undefined。
     * 可有可无的请求(灯泡)用它;被中断时 TS 丢掉这一版 program 的 checker,下次照常重建。
     * 时间从现在算起,排队的时间也算在里面
     */
    withDeadline<T>(ms: number, fn: (svc: TsAsyncService) => Promise<T>): Promise<T | undefined>
}

/** 语言族:TS 与 JS 各一个项目(对齐 Monaco typescriptDefaults / javascriptDefaults) */
export function familyOf(lang: string | undefined): TsFamily {
    const l = (lang ?? 'typescript').toLowerCase()
    return l === 'javascript' || l === 'js' || l === 'jsx' ? 'js' : 'ts'
}

interface Project {
    family: TsFamily
    open: Map<string, { text: string, refs: number }>
    editors: Map<string, TsOpenEditor[]>
    host: Map<string, string>
    options: import('typescript').CompilerOptions
    optionsVersion: number
    resolutions: Map<string, Map<string, string>>
    listeners: Set<(path: string | null) => void>
    // 任何文件 / 选项变一次 +1(notify 里加);checked 记各文件语义诊断是在哪一版上算的
    epoch: number
    checked: Map<string, number>
    semanticListeners: Set<(path: string) => void>
    // 已经发给语言服务的部分;和上面的差就是下一次要发的补丁
    sentOpen: Map<string, string>
    openDirty: Set<string>
    closed: Set<string>
    hostDirty: Set<string>
    sentEpoch: number
    sentOptions: number
    resolutionsDirty: boolean
    services: Map<number, TsAsyncService>
}

const projects = new Map<string, Project>()
const sessions = new Map<string, TSServiceSession>()

function projectFor(lang: string | undefined): Project {
    const family = familyOf(lang)
    let p = projects.get(family)
    if (!p) {
        p = {
            family,
            open: new Map(),
            editors: new Map(),
            host: new Map(),
            options: {},
            optionsVersion: 0,
            resolutions: new Map(),
            listeners: new Set(),
            epoch: 0,
            checked: new Map(),
            semanticListeners: new Set(),
            sentOpen: new Map(),
            openDirty: new Set(),
            closed: new Set(),
            hostDirty: new Set(),
            sentEpoch: 0,
            sentOptions: 0,
            resolutionsDirty: false,
            services: new Map(),
        }
        projects.set(family, p)
    }
    return p
}

function notify(p: Project, path: string | null) {
    p.epoch++
    for (const fn of [...p.listeners]) fn(path)
}

function setHostFile(p: Project, path: string, text: string | null): boolean {
    const k = normPath(path)
    if (text == null) {
        if (!p.host.delete(k)) return false
    } else {
        if (p.host.get(k) === text) return false
        p.host.set(k, text)
    }
    p.hostDirty.add(k)
    notify(p, k)
    return true
}

function readUser(p: Project, path: string): string | undefined {
    const k = normPath(path)
    return p.open.get(k)?.text ?? p.host.get(k)
}

// —— 与语言服务的通信 ——

interface Pending { resolve(v: unknown): void, reject(e: unknown): void }
const pending = new Map<number, Pending>()
let nextId = 0
let bound: TsTransport | null = null

function onMessage(res: TsResponse) {
    if (res.t === 'desync') {
        const p = projects.get(res.family)
        if (!p) return
        // 服务一侧丢了这个文件:按没发过处理,下一次 flush 整篇发过去;现在就发,不等下一次请求
        p.sentOpen.delete(res.path)
        if (p.open.has(res.path)) {
            p.openDirty.add(res.path)
            flush(p)
        }
        return
    }
    if (res.t === 'semantic') {
        const p = projects.get(res.family)
        if (!p) return
        p.checked.set(res.path, res.epoch)
        if (res.epoch === p.epoch) for (const fn of [...p.semanticListeners]) fn(res.path)
        return
    }
    if (res.t !== 'res') return
    const w = pending.get(res.id)
    if (!w) return
    pending.delete(res.id)
    if (res.ok) w.resolve(res.value)
    else {
        const e = new Error(res.message)
        e.name = res.name
        w.reject(e)
    }
}

// 通道换了(setTsWorker)或清空(clearTSServiceCache):在途请求作废,项目从头再发
function resetAll() {
    bound = null
    for (const w of pending.values()) w.reject(Object.assign(new Error('ts transport reset'), { name: 'TsTransportReset' }))
    pending.clear()
    for (const p of projects.values()) {
        p.sentOpen.clear()
        p.openDirty = new Set(p.open.keys())
        p.closed.clear()
        p.hostDirty = new Set(p.host.keys())
        p.sentEpoch = -1
        p.sentOptions = -1
        p.resolutionsDirty = p.resolutions.size > 0
        p.checked.clear()
    }
}
onTsTransportReset(resetAll)

function transport(): TsTransport {
    const t = tsTransport()
    if (t !== bound) {
        bound = t
        t.onMessage(onMessage)
    }
    return t
}

/** 把攒着的改动发给语言服务 */
function flush(p: Project): void {
    const ops: TsOp[] = []
    for (const path of p.closed) {
        if (p.open.has(path) || !p.sentOpen.has(path)) continue
        ops.push({ k: 'close', path })
        p.sentOpen.delete(path)
    }
    p.closed.clear()
    for (const path of p.openDirty) {
        const e = p.open.get(path)
        if (!e) continue
        const prev = p.sentOpen.get(path)
        if (prev === undefined) ops.push({ k: 'open', path, text: e.text })
        else {
            const ch = textChange(prev, e.text)
            if (!ch) continue
            const start = ch.span.start
            ops.push({ k: 'patch', path, start, end: start + ch.span.length, insert: e.text.slice(start, start + ch.newLength), oldLen: prev.length })
        }
        p.sentOpen.set(path, e.text)
    }
    p.openDirty.clear()
    if (p.hostDirty.size) {
        const set: Record<string, string> = {}
        const del: string[] = []
        for (const path of p.hostDirty) {
            const text = p.host.get(path)
            if (text === undefined) del.push(path)
            else set[path] = text
        }
        p.hostDirty.clear()
        ops.push({ k: 'host', set, del })
    }
    if (p.sentOptions !== p.optionsVersion) {
        ops.push({ k: 'options', options: p.options })
        p.sentOptions = p.optionsVersion
    }
    if (p.resolutionsDirty) {
        const table: Record<string, Record<string, string>> = {}
        for (const [from, map] of p.resolutions) table[from] = Object.fromEntries(map)
        ops.push({ k: 'resolutions', table })
        p.resolutionsDirty = false
    }
    if (ops.length || p.epoch !== p.sentEpoch) {
        transport().post({ t: 'mut', family: p.family, epoch: p.epoch, ops })
        p.sentEpoch = p.epoch
    }
}

function rpc(p: Project, method: string, args: unknown[], deadlineAt?: number, retry = true): Promise<unknown> {
    flush(p)
    const t = transport()
    const id = ++nextId
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        t.post({ t: 'call', id, family: p.family, method, args, deadlineAt })
    }).catch((e: unknown) => {
        // 服务一侧发现文本对不上、已经要了整篇重发(desync 先于这条回包到):重发之后再问一次
        if (retry && (e as { name?: string })?.name === TS_DESYNC) return rpc(p, method, args, deadlineAt, false)
        throw e
    })
}

function serviceOf(p: Project, deadlineAt = 0): TsAsyncService {
    let s = p.services.get(deadlineAt)
    if (s) return s
    const cache = new Map<string, (...a: unknown[]) => Promise<unknown>>()
    s = new Proxy({}, {
        get(_, prop) {
            // 不能是 thenable:ensure() 会把它当 Promise 的结果交出去
            if (typeof prop !== 'string' || prop === 'then') return undefined
            let f = cache.get(prop)
            if (!f) cache.set(prop, f = (...args) => rpc(p, prop, args, deadlineAt || undefined))
            return f
        },
    }) as TsAsyncService
    if (!deadlineAt) p.services.set(0, s)
    return s
}

export function getTSService(opts: TSServiceOptions): TSServiceSession {
    const project = projectFor(opts.lang)
    const jsx = (opts.lang ?? '').toLowerCase().endsWith('x')
    const fileName = normPath(opts.fileName ?? (project.family === 'js'
        ? (jsx ? '/main.jsx' : '/main.js')
        : (jsx ? '/main.tsx' : '/main.ts')))
    if (opts.files)
        for (const [path, text] of Object.entries(opts.files)) setHostFile(project, path, text)
    if (opts.compilerOptions) mergeOptions(project, opts.compilerOptions)
    const key = `${project.family}::${fileName}`
    let s = sessions.get(key)
    if (!s) {
        s = createSession(project, fileName)
        sessions.set(key, s)
    }
    return s
}

/** 兼容旧名:建一个会话(现在等同 getTSService,文件进共享项目) */
export function createTSService(opts: TSServiceOptions): TSServiceSession {
    return getTSService(opts)
}

/** 清空所有项目(测试用;宿主一般不需要)。语言服务那边的项目也丢掉 */
export function clearTSServiceCache(): void {
    for (const w of pending.values()) w.reject(Object.assign(new Error('ts service cleared'), { name: 'TsTransportReset' }))
    pending.clear()
    if (bound) bound.post({ t: 'reset' })
    for (const p of projects.values()) {
        p.listeners.clear()
        p.semanticListeners.clear()
    }
    projects.clear()
    sessions.clear()
}

/** 把语言服务整个关掉重来(下次请求时重建;Worker 来源是函数才会换新的) */
export function restartTSService(): void {
    resetTsTransport()
}

// —— 宿主 API(对齐 Monaco typescriptDefaults.setExtraLibs / addExtraLib / setCompilerOptions)——

export interface TsProjectTarget {
    /** 哪个语言族的项目:'typescript'(默认,含 ts/tsx)或 'javascript'(含 js/jsx) */
    lang?: string
}

/** 整表替换宿主文件(打开的编辑器缓冲不受影响)。path → 内容,如 { '/src/b.ts': '…' } */
export function setTsFiles(files: Record<string, string>, target: TsProjectTarget = {}): void {
    const p = projectFor(target.lang)
    const next = new Map<string, string>()
    for (const [path, text] of Object.entries(files)) next.set(normPath(path), text)
    let changed = false
    for (const k of [...p.host.keys()])
        if (!next.has(k)) { p.host.delete(k); p.hostDirty.add(k); changed = true }
    for (const [k, text] of next) {
        if (p.host.get(k) === text) continue
        p.host.set(k, text)
        p.hostDirty.add(k)
        changed = true
    }
    if (changed) notify(p, null)
}

/** 增/改/删一个宿主文件;text 为 null 删除 */
export function updateTsFile(path: string, text: string | null, target: TsProjectTarget = {}): void {
    setHostFile(projectFor(target.lang), path, text)
}

/** 合并 compilerOptions(项目级)。noLib 忽略(标准库由 lite-monaco 注入);lib 选哪几个标准库文件(不给 = 全部) */
export function setTsCompilerOptions(options: import('typescript').CompilerOptions, target: TsProjectTarget = {}): void {
    mergeOptions(projectFor(target.lang), options)
}

/**
 * 指定某个文件里某个 import 落在哪个文件(整表替换):`{ '/app/a.ts': { zod: '/node_modules/zod/__v2/index.d.ts' } }`。
 * 给了就不走内置解析;用于 monorepo 里各子包自己的 node_modules(同一个包两个版本)。
 */
export function setTsResolutions(table: Record<string, Record<string, string>>, target: TsProjectTarget = {}): void {
    const p = projectFor(target.lang)
    const next = new Map<string, Map<string, string>>()
    for (const [from, map] of Object.entries(table)) next.set(normPath(from), new Map(Object.entries(map).map(([spec, file]) => [spec, normPath(file)])))
    if (JSON.stringify([...next].map(([k, v]) => [k, [...v]])) === JSON.stringify([...p.resolutions].map(([k, v]) => [k, [...v]]))) return
    p.resolutions = next
    p.resolutionsDirty = true
    notify(p, null)
}

/** 当前项目的 compilerOptions 覆盖项(宿主设过的) */
export function getTsCompilerOptions(target: TsProjectTarget = {}): import('typescript').CompilerOptions {
    return { ...projectFor(target.lang).options }
}

/** 项目里所有用户文件路径(打开的 + 宿主的) */
export function listTsFiles(target: TsProjectTarget = {}): string[] {
    const p = projectFor(target.lang)
    return [...new Set([...p.open.keys(), ...p.host.keys()])]
}

/**
 * 没给 fileName 的编辑器用的默认文件名:`/main.ts` 没被别的编辑器占着就用它,否则 `/main-2.ts`…
 * (对齐 Monaco 每个 model 一个 inmemory://model/N,两个没起名的编辑器不抢同一个文件)
 */
export function freeTsFileName(lang: string): string {
    const p = projectFor(lang)
    const jsx = lang.toLowerCase().endsWith('x')
    const ext = p.family === 'js' ? (jsx ? '.jsx' : '.js') : (jsx ? '.tsx' : '.ts')
    for (let i = 1; ; i++) {
        const name = i === 1 ? `/main${ext}` : `/main-${i}${ext}`
        if (!((p.open.get(name)?.refs ?? 0) > 0)) return name
    }
}

// 值为 undefined 的键 = 撤销宿主设过的选项(回到默认):从覆盖表里删掉。逐键比较(JSON.stringify 会丢 undefined 键,撤销看着像没变)
function mergeOptions(p: Project, options: import('typescript').CompilerOptions) {
    const next = { ...p.options, ...options }
    for (const k of Object.keys(next)) if (next[k] === undefined || k === 'noLib') delete next[k]
    const keys = Object.keys(next)
    const same = keys.length === Object.keys(p.options).length
        && keys.every(k => k in p.options && JSON.stringify(next[k]) === JSON.stringify(p.options[k]))
    if (same) return
    p.options = next
    p.optionsVersion++
    notify(p, null)
}

function createSession(project: Project, fileName: string): TSServiceSession {
    // acquire 过、又全部 release 了 → 编辑器已销毁,迟到的 update(异步回调)不再把文件写回项目
    let released = false

    const setOwn = (text: string) => {
        if (released) return
        const cur = project.open.get(fileName)
        if (cur) {
            if (cur.text === text) return
            cur.text = text
        } else {
            project.open.set(fileName, { text, refs: 0 })
        }
        project.openDirty.add(fileName)
        notify(project, fileName)
    }

    return {
        fileName,
        update: setOwn,
        updateFile(path: string, text: string | null) {
            const p = normPath(path)
            if (p === fileName) {
                if (text != null) setOwn(text)
                return
            }
            setHostFile(project, p, text)
        },
        setFiles(files: Record<string, string>) {
            setTsFiles(files, { lang: project.family === 'js' ? 'javascript' : 'typescript' })
        },
        listUserFiles() {
            const out = [fileName]
            for (const k of project.open.keys()) if (k !== fileName) out.push(k)
            for (const k of project.host.keys()) if (!out.includes(k)) out.push(k)
            return out
        },
        getFileText(path: string) {
            const p = normPath(path)
            if (p === fileName) return project.open.get(fileName)?.text ?? project.host.get(p) ?? ''
            return readUser(project, p) ?? null
        },
        acquire(editor?: TsOpenEditor) {
            released = false
            let entry = project.open.get(fileName)
            if (!entry) {
                entry = { text: '', refs: 0 }
                project.open.set(fileName, entry)
                project.openDirty.add(fileName)
                project.closed.delete(fileName)
            }
            entry.refs++
            if (editor) {
                project.editors.set(fileName, [...(project.editors.get(fileName) ?? []), editor])
                setOwn(editor.getText()) // 一打开就进项目,别的文件立刻能 import 到
            }
            let done = false
            return () => {
                if (done) return
                done = true
                if (editor) {
                    const rest = (project.editors.get(fileName) ?? []).filter(e => e !== editor)
                    if (rest.length) project.editors.set(fileName, rest)
                    else project.editors.delete(fileName)
                }
                const cur = project.open.get(fileName)
                if (!cur) return
                cur.refs--
                if (cur.refs <= 0) {
                    project.open.delete(fileName)
                    project.openDirty.delete(fileName)
                    released = true
                    project.closed.add(fileName)
                    notify(project, fileName)
                    // 让语言服务那边知道这个文件关了(它放下语法树、释放内存)。放到下一轮:切 tab 时关掉后马上重开同一个文件,
                    // acquire 会把 closed 里的撤掉,服务那边什么都不用做
                    setTimeout(() => { if (project.closed.size) flush(project) }, 0)
                }
            }
        },
        editorFor(path: string) {
            return project.editors.get(normPath(path))?.[0] ?? null
        },
        syncOpenEditors() {
            for (const [path, eds] of project.editors) {
                const cur = project.open.get(path)
                const text = eds[0]?.getText()
                if (!cur || text == null || cur.text === text) continue
                cur.text = text
                project.openDirty.add(path)
                notify(project, path)
            }
        },
        onProjectChange(fn: () => void) {
            const l = (path: string | null) => { if (path !== fileName) fn() }
            project.listeners.add(l)
            return () => { project.listeners.delete(l) }
        },
        semanticReady: () => project.checked.get(fileName) === project.epoch,
        onSemanticChecked(fn: () => void) {
            const l = (path: string) => { if (path === fileName) fn() }
            project.semanticListeners.add(l)
            return () => { project.semanticListeners.delete(l) }
        },
        async withDeadline<T>(ms: number, fn: (svc: TsAsyncService) => Promise<T>): Promise<T | undefined> {
            try {
                return await fn(serviceOf(project, Date.now() + ms))
            } catch (e) {
                if (isTsCanceled(e)) return undefined
                throw e
            }
        },
        service: () => serviceOf(project),
        ensure: async () => {
            const svc = serviceOf(project)
            await svc.$ensure()
            return svc
        },
    }
}

export function bumpVersion(prevText: string, prevVersion: number, newText: string): number {
    return newText === prevText ? prevVersion : prevVersion + 1
}
