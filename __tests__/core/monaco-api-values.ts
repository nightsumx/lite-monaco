// 从 monaco-editor 的 monaco.d.ts 里读出 editor / languages / 顶层的运行时符号名(函数、类、枚举、常量)与类型名。
// 官方 d.ts 是权威:缺口由机器列出,不靠记忆。
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Surface { values: string[], types: string[], members: Record<string, string[]> }
const SKIP = /^(monaco_|editor_main_|index_d_)/

export function readMonacoSurface(): Record<'editor' | 'languages' | 'top', Surface> {
    const file = resolve(__dirname, '../../node_modules/monaco-editor/monaco.d.ts')
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const out = { editor: mk(), languages: mk(), top: mk() }
    const add = (s: Surface, n: ts.Node) => {
        const name = (n as { name?: ts.Identifier }).name?.text
        if (ts.isVariableStatement(n)) { for (const d of n.declarationList.declarations) s.values.push((d.name as ts.Identifier).text); return }
        if (!name || SKIP.test(name)) return
        if (ts.isFunctionDeclaration(n)) s.values.push(name)
        else if (ts.isClassDeclaration(n) || ts.isEnumDeclaration(n)) { s.values.push(name); s.members[name] = members(n) }
        else if (ts.isInterfaceDeclaration(n)) { s.types.push(name); s.members[name] = members(n) }
        else if (ts.isTypeAliasDeclaration(n)) s.types.push(name)
    }
    const members = (n: ts.ClassDeclaration | ts.EnumDeclaration | ts.InterfaceDeclaration): string[] =>
        ts.isEnumDeclaration(n) ? n.members.map(m => (m.name as ts.Identifier).text)
            : (n.members as ts.NodeArray<ts.ClassElement | ts.TypeElement>).map(m => (m.name as ts.Identifier | undefined)?.text).filter((x): x is string => !!x)
    let seenLangs = false
    for (const st of sf.statements) {
        if (ts.isModuleDeclaration(st) && (st.name.text === 'editor' || st.name.text === 'languages') && st.body && ts.isModuleBlock(st.body)) {
            // 文件里 languages 出现两次(第二次是子命名空间 css/html/json/typescript 的合并),只取含 register 的那次
            const tgt = out[st.name.text as 'editor' | 'languages']
            if (st.name.text === 'languages') { if (seenLangs) continue; seenLangs = true }
            for (const s of st.body.statements) add(tgt, s)
        } else if (!ts.isModuleDeclaration(st)) add(out.top, st)
    }
    return out
}
function mk(): Surface { return { values: [], types: [], members: {} } }
