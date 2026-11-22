// 读 VS Code 源码 standaloneEnums.ts(Monaco 公开枚举的权威数值)。源码在 MONACO_SRC;不在时返回 null(测试跳过)。
import ts from 'typescript'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'

export function readStandaloneEnums(): Record<string, Record<string, number | string>> | null {
    const src = process.env.MONACO_SRC ?? `${homedir()}/Documents/reference/_vscode-src`
    const f = `${src}/src/vs/editor/common/standalone/standaloneEnums.ts`
    if (!existsSync(f)) return null
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
    const out: Record<string, Record<string, number | string>> = {}
    for (const st of sf.statements) {
        if (!ts.isEnumDeclaration(st)) continue
        const m: Record<string, number | string> = {}
        let next = 0
        for (const e of st.members) {
            const k = (e.name as ts.Identifier).text
            if (!e.initializer) m[k] = next++
            else if (ts.isNumericLiteral(e.initializer)) { m[k] = Number(e.initializer.text); next = (m[k] as number) + 1 }
            else if (ts.isPrefixUnaryExpression(e.initializer)) { m[k] = -Number((e.initializer.operand as ts.NumericLiteral).text); next = (m[k] as number) + 1 }
            else if (ts.isStringLiteral(e.initializer)) m[k] = e.initializer.text
        }
        out[st.name.text] = m
    }
    return out
}
