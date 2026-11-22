// sample.ts — demo 用的「真实长文档」(~460 行),让视口虚拟化有实际负载可测。
// 覆盖:响应式信号库 + 用户 store + DOM UI + 表达式求值器 + 词法器 + 深层嵌套配置。
// 特性刺激面:深括号嵌套(彩虹括号)、深缩进(参考线)、大量行(minimap/折叠)、重复标识符(选区高亮)。

export const SAMPLE_CODE = `type Cleanup = () => void
type Effect = () => void | Cleanup
type Equals<T> = (a: T, b: T) => boolean

const defaultEquals = <T>(a: T, b: T): boolean => a === b

let activeObserver: Computation | null = null
const observerStack: (Computation | null)[] = []

function pushObserver(c: Computation | null): void {
    observerStack.push(activeObserver)
    activeObserver = c
}

function popObserver(): void {
    activeObserver = observerStack.pop() ?? null
}

let batchDepth = 0
const pendingEffects = new Set<Computation>()

function runBatch(fn: () => void): void {
    batchDepth++
    try {
        fn()
    } finally {
        batchDepth--
        if (batchDepth === 0) flush()
    }
}

function flush(): void {
    const queue = [...pendingEffects]
    pendingEffects.clear()
    for (const c of queue) c.run()
}

class Source<T> {
    private value: T
    private observers = new Set<Computation>()
    private equals: Equals<T>

    constructor(initial: T, equals: Equals<T> = defaultEquals) {
        this.value = initial
        this.equals = equals
    }

    read(): T {
        if (activeObserver) {
            this.observers.add(activeObserver)
            activeObserver.sources.add(this)
        }
        return this.value
    }

    write(next: T): void {
        if (this.equals(this.value, next)) return
        this.value = next
        this.notify()
    }

    update(fn: (prev: T) => T): void {
        this.write(fn(this.value))
    }

    private notify(): void {
        for (const obs of this.observers) {
            if (batchDepth > 0) pendingEffects.add(obs)
            else obs.run()
        }
    }

    unsubscribe(c: Computation): void {
        this.observers.delete(c)
    }

    get size(): number {
        return this.observers.size
    }
}

class Computation {
    sources = new Set<Source<unknown>>()
    private fn: Effect
    private cleanup: Cleanup | null = null
    private disposed = false

    constructor(fn: Effect) {
        this.fn = fn
    }

    run(): void {
        if (this.disposed) return
        this.dispose(false)
        pushObserver(this)
        try {
            const result = this.fn()
            if (typeof result === 'function') this.cleanup = result
        } finally {
            popObserver()
        }
    }

    private dispose(full: boolean): void {
        if (this.cleanup) {
            this.cleanup()
            this.cleanup = null
        }
        for (const s of this.sources) s.unsubscribe(this)
        this.sources.clear()
        if (full) this.disposed = true
    }

    destroy(): void {
        this.dispose(true)
    }
}

export function signal<T>(initial: T, equals?: Equals<T>): [() => T, (next: T) => void] {
    const src = new Source(initial, equals)
    return [() => src.read(), (next: T) => src.write(next)]
}

export function computed<T>(fn: () => T): () => T {
    const [get, set] = signal<T>(undefined as T)
    const c = new Computation(() => set(fn()))
    c.run()
    return get
}

export function effect(fn: Effect): Cleanup {
    const c = new Computation(fn)
    c.run()
    return () => c.destroy()
}

export function batch(fn: () => void): void {
    runBatch(fn)
}

export function untrack<T>(fn: () => T): T {
    pushObserver(null)
    try {
        return fn()
    } finally {
        popObserver()
    }
}

interface User {
    id: number
    name: string
    email: string
    roles: ('admin' | 'editor' | 'viewer')[]
    active: boolean
    lastSeen: number
}

interface StoreState {
    users: User[]
    query: string
    selectedId: number | null
    loading: boolean
    error: string | null
}

const initialState: StoreState = {
    users: [],
    query: '',
    selectedId: null,
    loading: false,
    error: null,
}

class UserStore {
    private getState: () => StoreState
    private setState: (next: StoreState) => void

    readonly visibleUsers: () => User[]
    readonly selectedUser: () => User | null
    readonly adminCount: () => number

    constructor() {
        const [get, set] = signal<StoreState>(initialState)
        this.getState = get
        this.setState = set

        this.visibleUsers = computed(() => {
            const { users, query } = this.getState()
            const q = query.trim().toLowerCase()
            if (!q) return users
            return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        })

        this.selectedUser = computed(() => {
            const { users, selectedId } = this.getState()
            if (selectedId == null) return null
            return users.find(u => u.id === selectedId) ?? null
        })

        this.adminCount = computed(() => {
            return this.getState().users.filter(u => u.roles.includes('admin')).length
        })
    }

    private patch(partial: Partial<StoreState>): void {
        this.setState({ ...this.getState(), ...partial })
    }

    setQuery(query: string): void {
        this.patch({ query })
    }

    select(id: number | null): void {
        this.patch({ selectedId: id })
    }

    async load(): Promise<void> {
        this.patch({ loading: true, error: null })
        try {
            const res = await fetch('/api/users')
            if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
            const users: User[] = await res.json()
            this.patch({ users, loading: false })
        } catch (err) {
            this.patch({ loading: false, error: err instanceof Error ? err.message : String(err) })
        }
    }

    add(user: Omit<User, 'id' | 'lastSeen'>): User {
        const state = this.getState()
        const id = state.users.reduce((max, u) => Math.max(max, u.id), 0) + 1
        const created: User = { ...user, id, lastSeen: Date.now() }
        this.patch({ users: [...state.users, created] })
        return created
    }

    update(id: number, partial: Partial<User>): void {
        const users = this.getState().users.map(u => (u.id === id ? { ...u, ...partial } : u))
        this.patch({ users })
    }

    remove(id: number): void {
        const users = this.getState().users.filter(u => u.id !== id)
        const selectedId = this.getState().selectedId === id ? null : this.getState().selectedId
        this.patch({ users, selectedId })
    }

    grantRole(ids: number[], role: User['roles'][number]): void {
        batch(() => {
            for (const id of ids) {
                const u = this.getState().users.find(x => x.id === id)
                if (!u || u.roles.includes(role)) continue
                this.update(id, { roles: [...u.roles, role] })
            }
        })
    }
}

function renderUserRow(user: User): HTMLElement {
    const row = document.createElement('div')
    row.className = 'user-row'
    row.dataset.id = String(user.id)
    const name = document.createElement('span')
    name.className = 'user-name'
    name.textContent = user.name
    if (!user.active) name.classList.add('inactive')
    const badges = document.createElement('span')
    badges.className = 'user-badges'
    for (const role of user.roles) {
        const b = document.createElement('em')
        b.className = \`badge badge-\${role}\`
        b.textContent = role
        badges.appendChild(b)
    }
    row.append(name, badges)
    return row
}

function mountUserList(root: HTMLElement, store: UserStore): Cleanup {
    const list = document.createElement('div')
    list.className = 'user-list'
    root.appendChild(list)
    const stop = effect(() => {
        const users = store.visibleUsers()
        list.replaceChildren(...users.map(renderUserRow))
    })
    return () => { stop(); list.remove() }
}

function mountSearchBar(root: HTMLElement, store: UserStore): Cleanup {
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Filter users…'
    input.className = 'user-search'
    const onInput = () => store.setQuery(input.value)
    input.addEventListener('input', onInput)
    root.appendChild(input)
    return () => { input.removeEventListener('input', onInput); input.remove() }
}

function mountAdminBadge(root: HTMLElement, store: UserStore): Cleanup {
    const badge = document.createElement('div')
    badge.className = 'admin-badge'
    root.appendChild(badge)
    const stop = effect(() => {
        const n = store.adminCount()
        badge.textContent = n === 0 ? 'no admins' : \`\${n} admin\${n > 1 ? 's' : ''}\`
        badge.classList.toggle('empty', n === 0)
    })
    return () => { stop(); badge.remove() }
}

export function mountPanel(root: HTMLElement, store: UserStore): Cleanup {
    const cleanups = [mountSearchBar(root, store), mountAdminBadge(root, store), mountUserList(root, store)]
    return () => { for (const c of cleanups.reverse()) c() }
}

export function bootstrap(selector: string): Cleanup {
    const root = document.querySelector<HTMLElement>(selector)
    if (!root) throw new Error(\`mount point \${selector} not found\`)
    const store = new UserStore()
    const dispose = mountPanel(root, store)
    void store.load()
    return dispose
}

// ── 表达式求值器:深层括号嵌套 + 递归下降,专治彩虹括号与缩进参考线 ──
type Expr =
    | { kind: 'num'; value: number }
    | { kind: 'var'; name: string }
    | { kind: 'unary'; op: '-' | '!'; arg: Expr }
    | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^' | '>' | '<' | '=='; left: Expr; right: Expr }
    | { kind: 'call'; name: string; args: Expr[] }
    | { kind: 'cond'; test: Expr; then: Expr; else: Expr }

type Scope = Map<string, number>
type Builtin = (args: number[]) => number

const builtins: Record<string, Builtin> = {
    max: (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity),
    min: (a) => a.reduce((m, x) => (x < m ? x : m), Infinity),
    sum: (a) => a.reduce((s, x) => s + x, 0),
    abs: ([x]) => (x < 0 ? -x : x),
    clamp: ([x, lo, hi]) => (x < lo ? lo : x > hi ? hi : x),
}

function evaluate(expr: Expr, scope: Scope): number {
    switch (expr.kind) {
        case 'num':
            return expr.value
        case 'var': {
            const v = scope.get(expr.name)
            if (v === undefined) throw new Error(\`unbound variable: \${expr.name}\`)
            return v
        }
        case 'unary':
            return expr.op === '-' ? -evaluate(expr.arg, scope) : evaluate(expr.arg, scope) === 0 ? 1 : 0
        case 'binary': {
            const l = evaluate(expr.left, scope)
            const r = evaluate(expr.right, scope)
            switch (expr.op) {
                case '+': return l + r
                case '-': return l - r
                case '*': return l * r
                case '/': return r === 0 ? (() => { throw new Error('division by zero') })() : l / r
                case '%': return l % r
                case '^': return Math.pow(l, r)
                case '>': return l > r ? 1 : 0
                case '<': return l < r ? 1 : 0
                case '==': return l === r ? 1 : 0
            }
        }
        case 'call': {
            const fn = builtins[expr.name]
            if (!fn) throw new Error(\`unknown function: \${expr.name}\`)
            return fn(expr.args.map((a) => evaluate(a, scope)))
        }
        case 'cond':
            return evaluate(expr.test, scope) !== 0 ? evaluate(expr.then, scope) : evaluate(expr.else, scope)
    }
}

// 深层嵌套字面量:一眼看清彩虹括号的层级循环着色
const demoExpr: Expr = {
    kind: 'cond',
    test: { kind: 'binary', op: '>', left: { kind: 'var', name: 'x' }, right: { kind: 'num', value: 0 } },
    then: {
        kind: 'call',
        name: 'clamp',
        args: [
            { kind: 'binary', op: '*', left: { kind: 'var', name: 'x' }, right: { kind: 'call', name: 'max', args: [{ kind: 'num', value: 1 }, { kind: 'var', name: 'y' }] } },
            { kind: 'num', value: 0 },
            { kind: 'num', value: 100 },
        ],
    },
    else: { kind: 'unary', op: '-', arg: { kind: 'call', name: 'abs', args: [{ kind: 'var', name: 'x' }] } },
}

// ── 深缩进状态机:缩进参考线在这一段最密 ──
type Token = { type: 'ident' | 'number' | 'punct' | 'eof'; text: string }

function tokenize(input: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    while (i < input.length) {
        const ch = input[i]
        if (ch === ' ' || ch === '\\t' || ch === '\\n') {
            i++
            continue
        }
        if (ch >= '0' && ch <= '9') {
            let j = i
            while (j < input.length && input[j] >= '0' && input[j] <= '9') {
                j++
            }
            tokens.push({ type: 'number', text: input.slice(i, j) })
            i = j
            continue
        }
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
            let j = i
            while (j < input.length) {
                const c = input[j]
                if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
                    j++
                } else {
                    break
                }
            }
            tokens.push({ type: 'ident', text: input.slice(i, j) })
            i = j
            continue
        }
        tokens.push({ type: 'punct', text: ch })
        i++
    }
    tokens.push({ type: 'eof', text: '' })
    return tokens
}

const PALETTE = {
    dark: {
        bg: '#1e1e1e',
        fg: '#d4d4d4',
        accent: { primary: '#569cd6', secondary: '#4ec9b0', warn: '#ce9178', error: '#f14c4c' },
        gutter: { text: '#858585', active: '#c6c6c6', border: 'rgba(255,255,255,0.06)' },
    },
    light: {
        bg: '#ffffff',
        fg: '#1f1f1f',
        accent: { primary: '#0000ff', secondary: '#267f99', warn: '#a31515', error: '#cd3131' },
        gutter: { text: '#237893', active: '#0b216f', border: 'rgba(0,0,0,0.06)' },
    },
}

export function runDemo(): void {
    const scope: Scope = new Map([['x', 42], ['y', 7]])
    const result = evaluate(demoExpr, scope)
    const tokens = tokenize('clamp(x * max(1, y), 0, 100)')
    console.log('tokens:', tokens.length, 'result:', result, 'palette:', PALETTE.dark.accent.primary)
}
`
