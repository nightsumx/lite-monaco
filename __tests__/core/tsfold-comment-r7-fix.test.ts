// 第七轮:TS 注释块折叠。Monaco 0.52 的 TS 没有折叠 provider,注释块只靠缩进折
// (对照页实测 /tmp/lc-hunt/r7/monaco-commentfold.ts,下面 DOC → 1-3 12-13 18-24 21-23):
//   缩进的 JSDoc(` * ` 比 `/**` 深一列)能折;连续 `//` 行、不缩进的 `/* … */` 不能折。
// lite-monaco 多给的 TS outlining(import 组、对象字面量、模板串)保留,但 kind = comment 的 span 不再进 extraFoldField。
// 修前:`// one//two//three`(6)、`/*…*/`(9)、函数里的 `// c1 // c2`(19)都能折。
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { collectFoldableLines, extraFoldField, foldable } from '../../src/core/edit/fold'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { tsFoldSession } from '../../src/lang/tsfold'

const DOC = [
    '/**', ' * doc', ' */',
    'import { a } from "a"', 'import { b } from "b"',
    '// one', '// two', '// three',
    '/*', 'plain block', '*/',
    'const o = {', '  k: 1,', '}',
    'const t = `', 'x', '`',
    'function f() {', '    // c1', '    // c2', '    /**', '     * inner', '     */', '    return 1', '}',
    '',
].join('\n')

describe('TS 注释块折叠(对齐 Monaco:只按缩进)', () => {
    it('注释 span 不进 TS 补充块;import 组、模板串照旧', async () => {
        clearTSServiceCache()
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [extraFoldField] }), parent })
        const off = tsFoldSession(view, { lang: 'typescript', fileName: '/fold-comment-r7.ts' })
        for (let i = 0; i < 400 && !(view.state.field(extraFoldField)?.length); i++) await new Promise(r => setTimeout(r, 50))
        expect(view.state.field(extraFoldField).length).toBeGreaterThan(0)
        const s = view.state
        const regions = collectFoldableLines(s).sort((a, b) => a - b)
            .map(n => `${n}-${s.doc.lineAt(foldable(s, s.doc.line(n).from)!.to).number}`)
        // Monaco 的 4 块 + lite-monaco 的 import 组(4-5)和模板串(15-16:收尾 ` 那行留着,
        // 同 VS Code typescript-language-features 的 adjustFoldingEnd,收尾字符 } ] ) ` >)
        expect(regions).toEqual(['1-3', '4-5', '12-13', '15-16', '18-24', '21-23'])
        off(); view.destroy(); parent.remove()
    }, 60_000)
})
