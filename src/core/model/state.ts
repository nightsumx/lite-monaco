// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 EditorState + Transaction —— 阶段1 收官。§4 重新设计点。
//
// 重新设计两刀:
//  ① 去循环依赖。CM6 的 Transaction.state getter 在 EditorState 构造器里回写 tr._state(隐式环,
//     惰性缓存)。CM7:Transaction 是纯数据(持 startState/changes/selection/effects/annotations),
//     apply() 是纯函数产新态,零缓存零回写。重复 apply 得相等态。
//  ② 解冻可监测洞。CM6 把 field/facet 值塞进私有 values[](地址位打包 + SlotStatus + ensureAddr
//     依赖追踪机器,§3 点名的「值私有/不可枚举」根因)。CM7:fields 是 Map<id,value>,facets 是
//     Map<id,output>,全可枚举;snapshot() 一次 dump doc + selection + 所有 field + 所有 facet。
//
// 砍(阶段1 无消费者,各记一笔,阶段2/历史模块回来时再补):
//   - computed facet(.compute/.computeN)+ 整套地址/SlotStatus/reconfigure 增量机器:静态输入 facet
//     已够(配置期 combine 一次,跨事务原样复用)。动态 facet 等真有「依赖 doc 的派生扩展」消费者再回。
//   - appendConfig:无消费者。Compartment / reconfigure 已补(见 Compartment)。
//   - changeFilter / transactionFilter / transactionExtender:事务拦截器,无扩展生态时无源。
//   - StateField.init / provide:字段间依赖注入,无 computed facet 即无处可用。
//   - 自动注入 Date.now() time 注解:违纯函数(且 teact/workflow 环境禁 Date.now);注解只含显式给定值。

import type { ChangeDesc, ChangeJSON, ChangeSpec } from './change'
import type { SelectionRange } from './selection'
import { ChangeSet } from './change'
import { Rope } from './rope'
import { makeCategorizer } from './charcategory'
import { checkSelection, EditorSelection } from './selection'

let nextID = 0

// 切行:\n / \r\n / \r 总算换行(Monaco 插入文本时换行统一成模型 EOL);配了 lineSeparator 时它也算,sliceDoc 用它拼回。
function DefaultSplit(s: string): string[] {
    // 没有 \r 的文本(绝大多数)直接用原生 split:比逐字符扫快一倍以上(5 MB / 10 万行:10 ms → 4 ms)
    if (s.length > 4096 && s.indexOf('\r') < 0) return s.split('\n')
    const out: string[] = []
    let start = 0
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        if (c === 10) {
            out.push(s.slice(start, i))
            start = i + 1
        }
        else if (c === 13) {
            out.push(s.slice(start, i))
            if (s.charCodeAt(i + 1) === 10)
                i++
            start = i + 1
        }
    }
    out.push(s.slice(start))
    return out
}

const NONE: readonly never[] = []
function asArray<T>(v: undefined | T | readonly T[]): readonly T[] {
    return v == null ? NONE : Array.isArray(v) ? v : [v as T]
}

// —— 注解:贴在事务上的带类型元数据(userEvent/远程标记等)。纯值,无自动注入。——

export class AnnotationType<T> {
    of(value: T): Annotation<T> { return new Annotation(this, value) }
}

export class Annotation<T> {
    constructor(readonly type: AnnotationType<T>, readonly value: T) {}
    static define<T>() { return new AnnotationType<T>() }
}

// —— 状态 effect:与变更并行的附加效果(常用于驱动 StateField)。可经变更映射位置。——

export class StateEffectType<Value> {
    constructor(readonly mapFn: (value: Value, mapping: ChangeDesc) => Value | undefined) {}
    of(value: Value): StateEffect<Value> { return new StateEffect(this, value) }
}

export class StateEffect<Value> {
    constructor(readonly type: StateEffectType<Value>, readonly value: Value) {}

    map(mapping: ChangeDesc): StateEffect<Value> | undefined {
        const mapped = this.type.mapFn(this.value, mapping)
        return mapped === undefined ? undefined : mapped === this.value ? this : new StateEffect(this.type, mapped)
    }

    is<T>(type: StateEffectType<T>): this is StateEffect<T> { return this.type === (type as unknown) }

    static define<Value = null>(spec: { map?: (value: Value, mapping: ChangeDesc) => Value | undefined } = {}): StateEffectType<Value> {
        return new StateEffectType(spec.map || (v => v))
    }

    static mapEffects(effects: readonly StateEffect<unknown>[], mapping: ChangeDesc): readonly StateEffect<unknown>[] {
        if (!effects.length)
            return effects
        const result: StateEffect<unknown>[] = []
        for (const e of effects) {
            const m = e.map(mapping)
            if (m)
                result.push(m)
        }
        return result
    }

    // reconfigure effect:运行时换配置。value = {compartment, extension}。
    static reconfigure = StateEffect.define<{ compartment: Compartment, extension: Extension }>()
}

// —— Facet:多个扩展贡献输入,combine 成单一输出。阶段1 仅静态输入(配置期 combine 一次)。——

export class Facet<Input, Output = readonly Input[]> {
    readonly id = nextID++
    readonly default: Output

    private constructor(
        readonly combine: (values: readonly Input[]) => Output,
        readonly compare: (a: Output, b: Output) => boolean,
    ) {
        this.default = combine([])
    }

    static define<Input, Output = readonly Input[]>(config: {
        combine?: (value: readonly Input[]) => Output
        compare?: (a: Output, b: Output) => boolean
    } = {}): Facet<Input, Output> {
        const combine = config.combine || (((a: readonly Input[]) => a) as unknown as (v: readonly Input[]) => Output)
        return new Facet<Input, Output>(combine, config.compare || ((a, b) => a === b))
    }

    of(value: Input): FacetProvider<Input, Output> { return new FacetProvider(this, value) }
}

export class FacetProvider<Input, Output> {
    constructor(readonly facet: Facet<Input, Output>, readonly value: Input) {}
}

// —— StateField:在状态里存额外信息,随事务 update。它本身即扩展。——

interface StateFieldSpec<Value> {
    create: (state: EditorState) => Value
    // state:事务产出的新态(= CM6 的 tr.state),可以读别的字段的新值,不能读自己
    update: (value: Value, tr: Transaction, state: EditorState) => Value
    compare?: (a: Value, b: Value) => boolean
    toJSON?: (value: Value, state: EditorState) => unknown
    fromJSON?: (json: unknown, state: EditorState) => Value
}

export class StateField<Value> {
    readonly id = nextID++
    private constructor(readonly spec: StateFieldSpec<Value>) {}

    static define<Value>(spec: StateFieldSpec<Value>): StateField<Value> {
        return new StateField<Value>(spec)
    }

    create(state: EditorState): Value { return this.spec.create(state) }
    updateValue(value: Value, tr: Transaction, state: EditorState): Value { return this.spec.update(value, tr, state) }
}

// Extension 是异质列表(各 field/facet 类型参数不同)。StateField/FacetProvider 在函数参数位
// 出现故对类型参数不变(invariant),无法用 unknown 收口 —— 这是真·型变,非偷懒(CM6 同样
// 把它们记成 <any>)。与 RangeSet.empty 同源的唯一合法 any。
export type Extension = StateField<any> | FacetProvider<any, any> | readonly Extension[] | Compartment

// —— Compartment:运行时可替换的扩展槽(= CM6 Compartment)。——
// 身份是 key:`comp.of(x)` 产一个同 key 的实例(放进扩展树),`comp.reconfigure(y)` 按 key 换内容。
// `new Compartment(x)` 等价 `new Compartment().of(x)`(旧用法保留)。

export class Compartment {
    readonly key: Compartment
    constructor(readonly inner: Extension = [], key?: Compartment) { this.key = key ?? this }

    of(ext: Extension): Compartment { return new Compartment(ext, this.key) }

    // 产 reconfigure effect:value = {compartment: 槽 key, extension: 新扩展}。
    reconfigure(ext: Extension): StateEffect<{ compartment: Compartment, extension: Extension }> {
        return StateEffect.reconfigure.of({ compartment: this.key, extension: ext })
    }

    // 本槽在 state 里的当前内容;槽不在配置里 → undefined。
    get(state: EditorState): Extension | undefined { return state.config.compartments.get(this.key) }

    get extension(): Extension { return this.inner }
}

// —— 配置:把扁平化的扩展编译成「字段表 + facet 输出表」。可观察(fields/facetValues 直接可枚举)。——
// 阶段1 静态输入 → combine 在 resolve 时算一次,跨事务原样复用(facet 值不随文档变)。

class Configuration {
    constructor(
        readonly fields: readonly StateField<unknown>[],
        // facet.id → combine 后的输出
        readonly facetValues: Map<number, unknown>,
        // facet.id → 该 facet 实例(供 toJSON/snapshot 反查默认/比较)
        readonly facetById: Map<number, Facet<unknown, unknown>>,
        // 槽 key → 当前内容(只含本配置树里出现的槽)
        readonly compartments: ReadonlyMap<Compartment, Extension> = new Map(),
    ) {}

    // overrides:槽 key → 内容(上一配置里各槽的内容 + 本事务的 reconfigure)。只认树里真出现的槽:
    // 新配置的 compartments 只记本次遇到的槽,被移出的槽内容随之丢弃(再出现时用它自己的 .of 内容)。
    static resolve(extension: Extension, overrides: ReadonlyMap<Compartment, Extension> = new Map()): Configuration {
        const fields: StateField<unknown>[] = []
        const inputs = new Map<number, unknown[]>()
        const facetById = new Map<number, Facet<unknown, unknown>>()
        const seenField = new Set<number>()
        const found = new Map<Compartment, Extension>()

        const inner = (ext: Extension) => {
            if (Array.isArray(ext)) {
                for (const e of ext) inner(e)
                return
            }
            if (ext instanceof Compartment) {
                const content = found.has(ext.key) ? found.get(ext.key)! : overrides.has(ext.key) ? overrides.get(ext.key)! : ext.inner
                found.set(ext.key, content)
                inner(content)
                return
            }
            if (ext instanceof StateField) {
                if (!seenField.has(ext.id)) {
                    seenField.add(ext.id)
                    fields.push(ext)
                }
            }
            else {
                const p = ext as FacetProvider<unknown, unknown>
                facetById.set(p.facet.id, p.facet)
                ;(inputs.get(p.facet.id) || inputs.set(p.facet.id, []).get(p.facet.id)!).push(p.value)
            }
        }
        inner(extension)

        const facetValues = new Map<number, unknown>()
        for (const [id, vals] of inputs) facetValues.set(id, facetById.get(id)!.combine(vals))
        return new Configuration(fields, facetValues, facetById, found)
    }

    // Input 侧不变,这里只关心 Output;用 any 放开 Input(与 Extension 同源型变)。
    facet<Output>(facet: Facet<any, Output>): Output {
        return this.facetValues.has(facet.id) ? (this.facetValues.get(facet.id) as Output) : facet.default
    }
}

// —— Transaction:纯数据。持 startState + 变更/选区/effects/注解。apply() 纯函数产新态。——

export interface TransactionSpec {
    changes?: ChangeSpec
    selection?: EditorSelection | { anchor: number, head?: number }
    // 输入位用 any:具体 StateEffect<number> 因 map 方法不变型不能赋给 StateEffect<unknown>,
    // 同 @codemirror/state 的 spec 入参约定(存储位/输出位仍是 <unknown>)。
    effects?: StateEffect<any> | readonly StateEffect<any>[]
    annotations?: Annotation<any> | readonly Annotation<any>[]
    userEvent?: string
    scrollIntoView?: boolean
    sequential?: boolean
}

export class Transaction {
    constructor(
        readonly startState: EditorState,
        readonly changes: ChangeSet,
        readonly selection: EditorSelection | undefined,
        readonly effects: readonly StateEffect<unknown>[],
        readonly annotations: readonly Annotation<unknown>[],
        readonly scrollIntoView: boolean,
    ) {
        if (selection)
            checkSelection(selection, changes.newLength)
    }

    get newDoc(): Rope { return this.changes.apply(this.startState.doc) }

    get newSelection(): EditorSelection {
        if (this.selection)
            return this.selection
        const mapper = this.annotation(Transaction.selectionMapper)
        return mapper ? mapper(this.startState.selection, this.changes) : this.startState.selection.map(this.changes)
    }

    get docChanged(): boolean { return !this.changes.empty }

    annotation<T>(type: AnnotationType<T>): T | undefined {
        for (const a of this.annotations) {
            if (a.type === (type as unknown))
                return a.value as T
        }
        return undefined
    }

    isUserEvent(event: string): boolean {
        const e = this.annotation(Transaction.userEvent)
        return !!(e && (e === event || (e.length > event.length && e.slice(0, event.length) === event && e[event.length] === '.')))
    }

    // 纯函数:从 startState 计算新态。无缓存、无回写,重复调用得相等态。
    apply(): EditorState { return this.startState.applyTransaction(this) }

    toJSON(): { changes: ChangeJSON, selection?: { ranges: { anchor: number, head: number }[], main: number }, scrollIntoView: boolean } {
        return {
            changes: this.changes.toJSON(),
            selection: this.selection?.toJSON(),
            scrollIntoView: this.scrollIntoView,
        }
    }

    static userEvent = Annotation.define<string>()
    static addToHistory = Annotation.define<boolean>()
    static remote = Annotation.define<boolean>()
    // 没给显式 selection 时,选区随变更怎么搬(默认 EditorSelection.map)。Monaco 的 model.applyEdits 把光标当 tracked range 搬,不是 CM 的 assoc。
    static selectionMapper = Annotation.define<(sel: EditorSelection, changes: ChangeSet) => EditorSelection>()
    // 事务时刻(毫秒)。阶段1 砍了自动 Date.now() 注入(违纯函数),改由调用方显式给;
    // 不给则消费方(history 的撤销分组)按 0 处理(总开新组,行为退化但仍纯)。
    static time = Annotation.define<number>()
}

function resolveSpec(state: EditorState, spec: TransactionSpec, docSize: number) {
    let annotations = asArray(spec.annotations)
    if (spec.userEvent)
        annotations = annotations.concat(Transaction.userEvent.of(spec.userEvent))
    const sel = spec.selection
    return {
        changes: spec.changes instanceof ChangeSet
            ? spec.changes
            : ChangeSet.of(spec.changes || [], docSize, state.facet(EditorState.lineSeparator) || undefined),
        selection: sel && (sel instanceof EditorSelection ? sel : EditorSelection.single(sel.anchor, sel.head)),
        effects: asArray(spec.effects),
        annotations,
        scrollIntoView: !!spec.scrollIntoView,
    }
}

function resolveTransaction(state: EditorState, specs: readonly TransactionSpec[]): Transaction {
    let s = resolveSpec(state, specs.length ? specs[0] : {}, state.doc.length)
    for (let i = 1; i < specs.length; i++) {
        const seq = !!specs[i].sequential
        const b = resolveSpec(state, specs[i], seq ? s.changes.newLength : state.doc.length)
        const mapForA = seq ? b.changes : b.changes.map(s.changes)
        const mapForB = seq ? ChangeSet.empty(b.changes.length) : s.changes.mapDesc(b.changes, true)
        s = {
            changes: s.changes.compose(mapForA),
            selection: b.selection ? b.selection.map(mapForB) : s.selection?.map(mapForA),
            effects: StateEffect.mapEffects(s.effects, mapForA).concat(StateEffect.mapEffects(b.effects, mapForB)),
            annotations: s.annotations.length ? s.annotations.concat(b.annotations) : b.annotations,
            scrollIntoView: s.scrollIntoView || b.scrollIntoView,
        }
    }
    return new Transaction(state, s.changes, s.selection, s.effects, s.annotations, s.scrollIntoView)
}

// —— EditorState:不可变持久数据。doc + selection + 字段值(可枚举 Map)+ 配置。——

export interface EditorStateConfig {
    doc?: string | Rope
    selection?: EditorSelection | { anchor: number, head?: number }
    extensions?: Extension
}

export class EditorState {
    private constructor(
        readonly config: Configuration,
        readonly doc: Rope,
        readonly selection: EditorSelection,
        // field.id → 当前值。可枚举(解冻 CM6 私有 values[])。
        readonly fieldValues: Map<number, unknown>,
        // 根扩展(reconfigure 时重新 resolve)
        private readonly rootExtension: Extension = [],
    ) {}

    // 构造期待初始化的字段(field.id → 产值)。create/update 里读别的字段时按需先算它(= CM6 ensureAddr),
    // 与声明顺序无关。构造完清空。
    private pending: Map<number, () => unknown> | null = null

    private initFields(make: (f: StateField<unknown>) => () => unknown): void {
        const pending = this.pending = new Map()
        for (const f of this.config.fields) pending.set(f.id, make(f))
        for (const f of this.config.fields) {
            const run = pending.get(f.id)
            if (!run) continue
            pending.delete(f.id)
            this.fieldValues.set(f.id, run())
        }
        this.pending = null
    }

    field<T>(field: StateField<T>): T
    field<T>(field: StateField<T>, require: false): T | undefined
    field<T>(field: StateField<T>, require = true): T | undefined {
        if (!this.fieldValues.has(field.id)) {
            const run = this.pending?.get(field.id)
            if (run) {
                this.pending!.delete(field.id)
                const v = run()
                this.fieldValues.set(field.id, v)
                return v as T
            }
            if (require)
                throw new RangeError('字段未在此状态中注册')
            return undefined
        }
        return this.fieldValues.get(field.id) as T
    }

    facet<Output>(facet: Facet<any, Output>): Output { return this.config.facet(facet) }

    update(...specs: readonly TransactionSpec[]): Transaction { return resolveTransaction(this, specs) }

    // 纯函数:产新态。处理 reconfigure effects → 重新 resolve 配置;字段经各自 update 推进。
    applyTransaction(tr: Transaction): EditorState {
        // 找 reconfigure effects → 在上一配置的槽内容上覆盖
        let overrides: Map<Compartment, Extension> | null = null
        for (const eff of tr.effects) {
            if (eff.is(StateEffect.reconfigure)) {
                const { compartment, extension } = eff.value
                ;(overrides ??= new Map(this.config.compartments)).set(compartment.key, extension)
            }
        }

        const config = overrides
            ? Configuration.resolve(this.rootExtension, overrides)
            : this.config

        const allowMulti = config.facet(EditorState.allowMultipleSelections)
        const selection = allowMulti ? tr.newSelection : tr.newSelection.asSingle()
        const next = new EditorState(config, tr.newDoc, selection, new Map(), this.rootExtension)
        // CM6 语义:保留的字段 update 推进;新加的字段在新态上 create(不再吃本事务的 update);
        // 被移出的字段不在 config.fields 里,自然丢弃。
        next.initFields(f => this.fieldValues.has(f.id)
            ? () => f.updateValue(this.fieldValues.get(f.id), tr, next)
            : () => f.create(next))
        return next
    }

    /** 同一文档 / 字段 / 配置,只换选区(不走事务,不进历史)。给「事件里要看到旧选区」的场合用。 */
    withSelection(selection: EditorSelection): EditorState {
        return new EditorState(this.config, this.doc, selection, new Map(this.fieldValues), this.rootExtension)
    }

    changes(spec: ChangeSpec = []): ChangeSet {
        if (spec instanceof ChangeSet)
            return spec
        return ChangeSet.of(spec, this.doc.length, this.facet(EditorState.lineSeparator) || undefined)
    }

    // 把整选区替换成同一段文本,每段光标落到插入末尾。纯逻辑(阶段1 砍,commands 是消费者)。
    replaceSelection(text: string | Rope): TransactionSpec {
        const t = typeof text === 'string' ? this.toText(text) : text
        return this.changeByRange(range => ({
            changes: { from: range.from, to: range.to, insert: t },
            range: EditorSelection.cursor(range.from + t.length),
        }))
    }

    // 对每个选区跑 f,把各自的变更/选区/effect 合并成单一 changeset+selection。
    // 逐行移植 CM6:第 i 段变更映射过前 i 段、前 i 段反向映射过第 i 段(OT 对齐),纯函数。
    changeByRange(f: (range: SelectionRange) => {
        range: SelectionRange
        changes?: ChangeSpec
        effects?: StateEffect<unknown> | readonly StateEffect<unknown>[]
    }): { changes: ChangeSet, selection: EditorSelection, effects: readonly StateEffect<unknown>[] } {
        const sel = this.selection
        const result1 = f(sel.ranges[0])
        let changes = this.changes(result1.changes)
        const ranges = [result1.range]
        let effects = asArray(result1.effects)
        for (let i = 1; i < sel.ranges.length; i++) {
            const result = f(sel.ranges[i])
            const newChanges = this.changes(result.changes)
            const newMapped = newChanges.map(changes)
            for (let j = 0; j < i; j++)
                ranges[j] = ranges[j].map(newMapped)
            const mapBy = changes.mapDesc(newChanges, true)
            ranges.push(result.range.map(mapBy))
            changes = changes.compose(newMapped)
            effects = StateEffect.mapEffects(effects, newMapped).concat(StateEffect.mapEffects(asArray(result.effects), mapBy))
        }
        return { changes, selection: EditorSelection.create(ranges, sel.mainIndex, sel.keepOverlap), effects }
    }

    toText(string: string): Rope {
        const sep = this.facet(EditorState.lineSeparator)
        return Rope.of(sep ? string.split(sep).flatMap(DefaultSplit) : DefaultSplit(string))
    }

    sliceDoc(from = 0, to = this.doc.length): string {
        return this.doc.sliceString(from, to, this.lineBreak)
    }

    get tabSize(): number { return this.facet(EditorState.tabSize) }
    get lineBreak(): string { return this.facet(EditorState.lineSeparator) || '\n' }

    // 可监测一等面:一次 dump 全部内部态。解冻 §3 的「dump 不出来」。
    snapshot(): {
        doc: string
        selection: { ranges: { anchor: number, head: number }[], main: number }
        fields: { id: number, value: unknown }[]
        facets: { id: number, value: unknown }[]
    } {
        return {
            doc: this.sliceDoc(),
            selection: this.selection.toJSON(),
            fields: this.config.fields.map(f => ({ id: f.id, value: this.fieldValues.get(f.id) })),
            facets: [...this.config.facetValues].map(([id, value]) => ({ id, value })),
        }
    }

    toJSON(fields?: { [prop: string]: StateField<any> }): Record<string, unknown> {
        const result: Record<string, unknown> = { doc: this.sliceDoc(), selection: this.selection.toJSON() }
        if (fields) {
            for (const prop in fields) {
                const field = fields[prop]
                if (this.fieldValues.has(field.id) && field.spec.toJSON)
                    result[prop] = field.spec.toJSON(this.fieldValues.get(field.id), this)
            }
        }
        return result
    }

    static fromJSON(json: { doc?: unknown, selection?: unknown, [k: string]: unknown }, config: EditorStateConfig = {}, fields?: { [prop: string]: StateField<any> }): EditorState {
        if (!json || typeof json.doc !== 'string')
            throw new RangeError('EditorState JSON 非法')
        // 具名字段必须作扩展启用(CM7 砍了 field.init,改直接并入 extensions)。
        const fieldExts: Extension[] = fields ? Object.keys(fields).map(p => fields[p]) : []
        const state = EditorState.create({
            doc: json.doc,
            selection: EditorSelection.fromJSON(json.selection),
            extensions: config.extensions ? [config.extensions, ...fieldExts] : fieldExts,
        })
        // 用 fromJSON 覆盖具名字段初值。
        if (fields) {
            for (const prop in fields) {
                const field = fields[prop]
                if (Object.prototype.hasOwnProperty.call(json, prop) && field.spec.fromJSON && state.fieldValues.has(field.id))
                    state.fieldValues.set(field.id, field.spec.fromJSON(json[prop], state))
            }
        }
        return state
    }

    static create(config: EditorStateConfig = {}): EditorState {
        const configuration = Configuration.resolve(config.extensions || [])
        const sep = configuration.facet(EditorState.lineSeparator)
        const doc = config.doc instanceof Rope
            ? config.doc
            : Rope.of(sep ? (config.doc || '').split(sep).flatMap(DefaultSplit) : DefaultSplit(config.doc || ''))
        let selection = !config.selection
            ? EditorSelection.single(0)
            : config.selection instanceof EditorSelection
                ? config.selection
                : EditorSelection.single(config.selection.anchor, config.selection.head)
        checkSelection(selection, doc.length)
        if (!configuration.facet(EditorState.allowMultipleSelections))
            selection = selection.asSingle()

        const rootExt = config.extensions || []
        const state = new EditorState(configuration, doc, selection, new Map(), rootExt)
        state.initFields(f => () => f.create(state))
        return state
    }

    static tabSize = Facet.define<number, number>({ combine: vs => (vs.length ? vs[0] : 4) })
    static lineSeparator = Facet.define<string, string | undefined>({ combine: vs => (vs.length ? vs[0] : undefined) })
    static allowMultipleSelections = Facet.define<boolean, boolean>({ combine: vs => vs.some(v => v) })
    static readOnly = Facet.define<boolean, boolean>({ combine: vs => vs.some(v => v) })
    static wordChars = Facet.define<string, string>({ combine: vs => vs.join('') })
    // 缩进单元。未显式配置时派生自 tabSize(=Monaco insertSpaces:true 语义,一级缩进=tabSize 个空格),
    // 不引第二套真源。显式配 EditorState.indentUnit.of('\t') 等可覆盖。
    static indentUnit = Facet.define<string, string | undefined>({ combine: vs => vs.length ? vs[0] : undefined })

    get readOnly(): boolean { return this.facet(EditorState.readOnly) }

    get indentUnit(): string {
        const configured = this.facet(EditorState.indentUnit)
        return configured != null ? configured : ' '.repeat(this.tabSize)
    }

    // 词级移动/删词所需字符分类器。默认不额外加 word char（等价 CM6 默认配置）。
    charCategorizer(_pos: number) {
        return makeCategorizer(this.facet(EditorState.wordChars))
    }
}

// 纯命令:只吃 {state, dispatch},不碰视图。返 true=已处理(派了事务)、false=放行。
// 视觉几何命令(吃 EditorView)是另一类,阶段4 接入。
export type StateCommand = (target: { state: EditorState, dispatch: (tr: Transaction) => void }) => boolean
