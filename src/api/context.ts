// 实例 API 的装配上下文(H1 维护)。
//
// 各代号在自己的 `src/api/<group>.ts` 导出 `install<Group>(ctx)`,往 `ctx.api` 上登记方法;
// `liteMonaco()` 最后 `Object.assign(view, api)`(EditorView 已有的同名成员优先,不覆盖)。
import type * as core from '../core/index'
import { Annotation } from '../core/model/state'
import type { ComputedEditorOptions, IEditorOptions } from '../core/options'
import type { ThemeColors } from '../product/theme'
import type { IDisposable, IEvent } from './types'

/** Monaco Emitter:event 给外面订阅,fire 给里面发。监听器抛错不影响其余 */
export class Emitter<T> implements IDisposable {
    private ls: ((e: T) => unknown)[] = []
    private onFirst?: () => void
    private onLast?: () => void
    constructor(hooks?: { onFirstListener?: () => void, onLastListener?: () => void }) {
        this.onFirst = hooks?.onFirstListener
        this.onLast = hooks?.onLastListener
    }
    readonly event: IEvent<T> = (listener, thisArg) => {
        const fn = thisArg === undefined ? listener : (e: T) => listener.call(thisArg, e)
        this.ls.push(fn)
        if (this.ls.length === 1) this.onFirst?.()
        let done = false
        return {
            dispose: () => {
                if (done) return
                done = true
                const i = this.ls.indexOf(fn)
                if (i < 0) return
                this.ls.splice(i, 1)
                if (this.ls.length === 0) this.onLast?.()
            },
        }
    }
    get hasListeners(): boolean { return this.ls.length > 0 }
    /** 正在投递的那一笔(同 Monaco EventDeliveryQueue):监听器里再 fire 时,先把当前这笔投完给剩下的监听器,再投新的,保证每个监听器看到的顺序一致 */
    private cur: { e: T, ls: ((e: T) => unknown)[], i: number } | null = null
    fire(e: T): void {
        if (this.cur) this.run(this.cur)
        const d = this.cur = { e, ls: this.ls.slice(), i: 0 }
        try { this.run(d) } finally { if (this.cur === d) this.cur = null }
    }
    private run(d: { e: T, ls: ((e: T) => unknown)[], i: number }): void {
        while (d.i < d.ls.length) {
            const l = d.ls[d.i++]
            try { l(d.e) } catch (err) { console.error(err) }
        }
    }
    dispose(): void {
        const had = this.ls.length > 0
        this.ls = []
        if (had) this.onLast?.()
    }
}

/** 一个实例的所有 Emitter 集中在这:destroy 时统一清掉 */
export class EventHub implements IDisposable {
    private readonly all: Emitter<never>[] = []
    /** 新建一个 Emitter(挂在 hub 上,实例销毁时 dispose) */
    emitter<T>(hooks?: { onFirstListener?: () => void, onLastListener?: () => void }): Emitter<T> {
        const e = new Emitter<T>(hooks)
        this.all.push(e as unknown as Emitter<never>)
        return e
    }
    dispose(): void {
        for (const e of this.all.splice(0)) e.dispose()
    }
}

/**
 * liteMonaco() 里那份"装配状态"的对外把手(语言 / 主题 / 选项变了,state 和视图怎么跟上由 litemonaco.ts 负责)。
 * H3 的 setModelLanguage / setTheme 经 `reassemble` 走,不要自己去碰 liteMonacoSlot。
 */
export interface EditorHost {
    /** 宿主给的选项(构造时的 options + 累计的 updateOptions;不含 features 映射出来的那一层) */
    getUserOptions(): IEditorOptions
    /** 换成 next 并让 state / 视图跟上;patch 是这次的增量(用来判断要不要重算缩进等模型选项) */
    setUserOptions(next: IEditorOptions, patch?: IEditorOptions): void
    /** features 映射层 + 宿主选项 合并后的 raw(装进 editorOptions facet 的那份) */
    getEffectiveOptions(): IEditorOptions
    getLanguageId(): string
    /** 构造时给的高亮器(H3 的 defineTheme / setTheme 要用它重算主题) */
    getHighlighter?(): import('./themes').ThemeCapableHighlighter | undefined
    /** setModel:换成新 model 的缩进选项(model 选项是每个 model 自己的,不是编辑器的) */
    setModelOptions(opts: { tabSize: number, indentSize: number, insertSpaces: boolean }): void
    /**
     * 按当前选项、语言、主题重算装配:语言 / 主题 / 颜色变了就传 patch。
     * 不丢 doc / 选区 / 历史 / 折叠;overlays 和 keymap 整体重挂。
     */
    reassemble(patch?: { lang?: string, theme?: string, colors?: ThemeColors | undefined }): void
}

export interface EditorContext {
    readonly view: core.EditorView
    readonly host: EditorHost
    /** 当前 computed 选项(随 updateOptions 变) */
    getOptions(): ComputedEditorOptions
    /** 实例销毁时调用(逆序) */
    onDispose(fn: () => void): void
    /** 方法登记处:`ctx.api.foo = () => ...`;最终合并到 view 上 */
    api: Record<string, unknown>
    events: EventHub
    /** 实例换了 model(setModel 之后触发):按 model 订阅的事件据此重新订阅 */
    readonly modelSwitched: Emitter<void>
    /**
     * 现在没有 model(Monaco getModel() === null):setModel(null) 之后、销毁之后,或者一开始就不带(create 传了 model、diff 两侧还没 setModel)。
     * 这时谁都不许去建隐式 model:Monaco 里没有 model 就是没有,建了会多出一个 getModels() 里的空 model。
     */
    noModel: boolean
}

/** 各方法组的装配函数 */
export type Installer = (ctx: EditorContext) => void

export interface ContextHooks {
    getOptions(): ComputedEditorOptions
    host: EditorHost
    /** 一开始不带 model(见 EditorContext.noModel) */
    noModel?: boolean
}

export function createContext(view: core.EditorView, hooks: ContextHooks): EditorContext & { dispose(): void } {
    const events = new EventHub()
    const disposers: (() => void)[] = []
    let disposed = false
    const dispose = () => {
        if (disposed) return
        disposed = true
        for (const fn of disposers.splice(0).reverse()) {
            try { fn() } catch (err) { console.error(err) }
        }
        events.dispose()
    }
    view.onDestroy(dispose)
    const modelSwitched = new Emitter<void>()
    return {
        modelSwitched,
        view,
        host: hooks.host,
        getOptions: hooks.getOptions,
        onDispose: fn => { disposers.push(fn) },
        api: {},
        events,
        dispose,
        noModel: !!hooks.noModel,
    }
}

/** 把 ctx.api 登记的方法合并到 view 上;view 上已有的同名成员不覆盖 */
export function applyApi<T extends object>(view: core.EditorView, api: Record<string, unknown>): T {
    for (const key of Object.keys(api)) {
        if (key in view) continue
        Object.defineProperty(view, key, { value: api[key], configurable: true, writable: true, enumerable: false })
    }
    return view as unknown as T
}

// ───────────── 程序整篇替换的标记 ─────────────

/**
 * 标在 `setValue` / `setModel` 这类"整篇换掉"的事务上:onDidChangeModelContent 的 `isFlush` 据此为 true
 * (Monaco TextModel.setValue 发的就是 flush 事件)。
 */
export const flushAnnotation = Annotation.define<boolean>()
