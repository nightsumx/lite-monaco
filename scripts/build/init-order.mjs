// 打包产物里「模块加载时读到还没赋值的变量」。
//
// 源码是 ESM 的 const/let:循环引用里先用后定义会抛 TDZ 的 ReferenceError,至少是响的。tsup/esbuild 把模块拼进一个分块后,
// 顶层声明都成了 var,同样的顺序问题变成静默的 undefined。0.4.0、0.4.1 的默认键位就是这样坏的:
// `var defaultKeymap = buildDefaultKeymap()` 在前,它用到的 `var cursorLineUp = ...` 在后,85 条里 70 条 run 是 undefined。
// vitest、官网跑源码,求值顺序不同,测不出来。
//
// 做法:对每个文件按顺序看顶层语句,算出它在加载时真的会读的名字(不进函数体;但顶层调用了本文件的函数 / new 了本文件的类,
// 就把那个函数体 / 构造器算进来,递归),读到的名字如果是本文件顶层、在更后面才声明的 var/let/const/class,就是一处。
// 已知不管的:跨分块的循环(import 进来的值)、经对象属性调用的函数(obj.f())、函数内的变量遮蔽只按名字粗算。
import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
    || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n)

/** 绑定模式里的名字(var { a, b: [c] } = …) */
function bindingNames(name, out = []) {
    if (ts.isIdentifier(name)) out.push(name.text)
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out)
    return out
}

/** 这个标识符是不是在「读一个变量」(不是属性名、声明名、标签) */
function isRead(id) {
    const p = id.parent
    if (!p) return false
    if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && p.name === id) return false
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
        || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) && p.name === id) return false
    if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)
        || ts.isClassExpression(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === id) return false
    if (ts.isBindingElement(p) && p.propertyName === id) return false
    if (ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) return false
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false
    return true
}

/** 函数体里自己声明的名字(参数、var/let/const、函数、类、catch):按名字粗算遮蔽 */
function localNames(fn) {
    const out = new Set()
    for (const p of fn.parameters ?? []) bindingNames(p.name).forEach(n => out.add(n))
    const visit = (n) => {
        if (n !== fn && isFn(n)) { if (n.name && ts.isIdentifier(n.name) && !ts.isMethodDeclaration(n)) out.add(n.name.text); return }
        if (ts.isVariableDeclaration(n)) bindingNames(n.name).forEach(x => out.add(x))
        if ((ts.isClassDeclaration(n) || ts.isClassExpression(n)) && n.name) out.add(n.name.text)
        if (ts.isCatchClause(n) && n.variableDeclaration) bindingNames(n.variableDeclaration.name).forEach(x => out.add(x))
        ts.forEachChild(n, visit)
    }
    if (fn.body) visit(fn.body)
    return out
}

/** 每条顶层语句在加载时读的名字(含它调用的本文件函数里读的),和本文件顶层声明的位置 */
export function loadTimeReads(code, file = 'input.js', kind = ts.ScriptKind.JS) {
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind)
    const declAt = new Map()   // 名字 → 顶层语句序号(var/let/const/class;函数声明提升,不记)
    const callable = new Map() // 名字 → 顶层的函数 / 箭头 / 类节点(加载时调用它会跑它的体)
    sf.statements.forEach((st, i) => {
        if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
            for (const n of bindingNames(d.name)) if (!declAt.has(n)) declAt.set(n, i)
            const init = d.initializer
            if (ts.isIdentifier(d.name) && init && (ts.isFunctionExpression(init) || ts.isArrowFunction(init) || ts.isClassExpression(init)))
                callable.set(d.name.text, init)
        }
        else if (ts.isClassDeclaration(st) && st.name) { declAt.set(st.name.text, i); callable.set(st.name.text, st) }
        else if (ts.isFunctionDeclaration(st) && st.name) callable.set(st.name.text, st)
    })

    // 一个节点在加载时会读的名字;bodyCache 记函数体的结果(递归调用时先放空集防环)
    const bodyCache = new Map()
    const runOf = (target) => {
        if (bodyCache.has(target)) return bodyCache.get(target)
        const out = new Set()
        bodyCache.set(target, out)
        const parts = []
        if (ts.isClassDeclaration(target) || ts.isClassExpression(target)) {
            // new 一个类:构造器 + 实例字段初始化
            for (const m of target.members) {
                if (ts.isConstructorDeclaration(m) && m.body) parts.push([m.body, localNames(m)])
                if (ts.isPropertyDeclaration(m) && m.initializer && !m.modifiers?.some(x => x.kind === ts.SyntaxKind.StaticKeyword)) parts.push([m.initializer, new Set()])
            }
        }
        else if (target.body) parts.push([target.body, localNames(target)])
        for (const [node, locals] of parts) for (const n of eager(node)) if (!locals.has(n)) out.add(n)
        return out
    }

    function eager(root) {
        const out = new Set()
        const visit = (n) => {
            if (isFn(n) && n !== root) {
                return
            }
            if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) {
                // 类体:extends、计算属性名、static 字段和 static 块是定义时就跑的,方法和实例字段不是
                for (const h of n.heritageClauses ?? []) visit(h)
                for (const m of n.members) {
                    if (m.name && ts.isComputedPropertyName(m.name)) visit(m.name)
                    const isStatic = m.modifiers?.some(x => x.kind === ts.SyntaxKind.StaticKeyword)
                    if (ts.isPropertyDeclaration(m) && isStatic && m.initializer) visit(m.initializer)
                    if (ts.isClassStaticBlockDeclaration(m)) visit(m.body)
                }
                return
            }
            if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n)) {
                const callee = ts.isTaggedTemplateExpression(n) ? n.tag : n.expression
                let inner = callee
                while (ts.isParenthesizedExpression(inner)) inner = inner.expression
                if (ts.isIdentifier(inner) && callable.has(inner.text)) for (const x of runOf(callable.get(inner.text))) out.add(x)
                if (ts.isFunctionExpression(inner) || ts.isArrowFunction(inner)) for (const x of runOf(inner)) out.add(x) // IIFE
            }
            if (ts.isIdentifier(n) && isRead(n)) out.add(n.text)
            ts.forEachChild(n, visit)
        }
        visit(root)
        return out
    }

    const line = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    const reads = []
    sf.statements.forEach((st, i) => {
        if (ts.isFunctionDeclaration(st) || ts.isImportDeclaration(st)) return
        for (const name of eager(st)) reads.push({ name, at: i, line: line(st) })
    })
    return { sf, reads, declAt, line }
}

/** 读的名字在本文件更后面才声明 = 加载时读到 undefined(打包后是 var)或抛 TDZ(源码) */
export function findInitOrderHazards(code, file = 'input.js') {
    const { sf, reads, declAt, line } = loadTimeReads(code, file)
    return reads.filter(r => declAt.has(r.name) && declAt.get(r.name) > r.at)
        .map(r => ({ file, name: r.name, readLine: r.line, declLine: line(sf.statements[declAt.get(r.name)]) }))
}

// ───────────── 源码一侧:循环引用里,模块加载时不读 import 进来的值 ─────────────
// 上面查的是打包产物;这里在源码上查同一类问题的根:两个模块互相 import(值,不算 import type),其中一个在顶层
// (加载时)就用了另一个导出的值,能不能拿到取决于谁先求值,打包器一换顺序就变。0.4.x 的 defaultKeymap 就是
// keymap.ts 在顶层用 commands.ts 的命令,二者在同一个环里。只查同一个强连通分量里的边,不在环里的 import 先求值是保证的。

function sourceFiles(dir, out = []) {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) sourceFiles(p, out)
        else if (/\.tsx?$/.test(f) && !f.endsWith('.d.ts')) out.push(resolve(p))
    }
    return out
}

function resolveRelative(from, spec) {
    if (!spec.startsWith('.')) return null
    const b = resolve(dirname(from), spec.replace(/\.js$/, ''))
    for (const c of [b, b + '.ts', b + '.tsx', join(b, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c
    return null
}

/** 值 import 的边,和本模块里 import 进来的名字 → 来源文件 */
function valueImports(sf, file) {
    const names = new Map(), edges = new Set()
    for (const st of sf.statements) {
        if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) || !st.moduleSpecifier) continue
        const to = resolveRelative(file, st.moduleSpecifier.text)
        if (!to) continue
        if (ts.isExportDeclaration(st)) {
            if (!st.isTypeOnly && !(st.exportClause && ts.isNamedExports(st.exportClause) && st.exportClause.elements.every(e => e.isTypeOnly))) edges.add(to)
            continue
        }
        const clause = st.importClause
        if (!clause) { edges.add(to); continue } // import './x'(副作用)
        if (clause.isTypeOnly) continue
        let value = false
        if (clause.name) { names.set(clause.name.text, to); value = true }
        const nb = clause.namedBindings
        if (nb && ts.isNamespaceImport(nb)) { names.set(nb.name.text, to); value = true }
        if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) if (!e.isTypeOnly) { names.set(e.name.text, to); value = true }
        if (value) edges.add(to)
    }
    return { names, edges }
}

/** 强连通分量:文件 → 它所在的分量(只有自己时不算环) */
function cycleGroups(edges) {
    let n = 0
    const index = new Map(), low = new Map(), stack = [], onStack = new Set(), group = new Map()
    const visit = (v) => {
        index.set(v, n); low.set(v, n++); stack.push(v); onStack.add(v)
        for (const w of edges.get(v) ?? []) {
            if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))) }
            else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
        }
        if (low.get(v) === index.get(v)) {
            const g = []
            let w
            do { w = stack.pop(); onStack.delete(w); g.push(w); group.set(w, g) } while (w !== v)
        }
    }
    for (const v of edges.keys()) if (!index.has(v)) visit(v)
    return group
}

/** 源码里「同一个 import 环里,加载时读了 import 进来的值」的每一处 */
export function findCycleLoadReads(srcDir) {
    const files = sourceFiles(srcDir)
    const edges = new Map(), perFile = new Map()
    for (const f of files) {
        const { sf, reads } = loadTimeReads(readFileSync(f, 'utf8'), f, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
        const { names, edges: out } = valueImports(sf, f)
        edges.set(f, out)
        perFile.set(f, { reads, names })
    }
    const group = cycleGroups(edges)
    const hits = []
    for (const [f, { reads, names }] of perFile) {
        for (const r of reads) {
            const to = names.get(r.name)
            if (to && group.get(f).length > 1 && group.get(f) === group.get(to))
                hits.push({ file: relative(srcDir, f), line: r.line, name: r.name, from: relative(srcDir, to) })
        }
    }
    return { hits, cycles: [...new Set(group.values())].filter(g => g.length > 1).map(g => g.map(f => relative(srcDir, f))) }
}
