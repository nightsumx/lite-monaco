// 第 2 轮 F5a H23:region 标记按语言(Monaco 各语言 conf 的 folding.markers),纯文本没有标记
import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import { foldable, foldAllMarkerRegions, foldField } from '../../src/core/edit/fold'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' }),
} as unknown as ShikiLike

function regionEnd(lang: string, open: string, close: string): number | null {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl, lang, doc: `${open}\nx\ny\n${close}\nz\n` })
    const f = foldable(view.state, 0)
    const end = f ? view.state.doc.lineAt(f.to).number : null
    view.destroy()
    parent.remove()
    return end
}

describe('region 标记按语言', () => {
    it.each([
        ['typescript', '// #region a', '// #endregion', 4],
        ['javascript', '//region', '//endregion', 4],
        ['python', '#region a', '#endregion', 4],
        ['python', '# region', '# endregion', null],
        ['css', '/* #region a */', '/* #endregion */', 4],
        ['css', '/* #region a', '/* #endregion */', null],
        ['html', '<!-- #region -->', '<!-- #endregion -->', 4],
        ['markdown', '<!-- region -->', '<!-- endregion -->', 4],
        ['cpp', '#pragma region x', '#pragma endregion', 4],
        ['rust', '#pragmaregion', '#pragma endregion', null],
        ['java', '// <editor-fold desc="x">', '// </editor-fold>', 4],
        ['php', '#region', '//endregion', 4],
        ['bat', 'REM #region', ':: #endregion', 4],
        ['vb', '#Region "x"', '#End Region', 4],
        ['pascal', "{$REGION 'x'}", '{$ENDREGION}', 4],
        ['fsharp', '(* #region x *)', '(* #endregion *)', 4],
        ['typescript', '#region', '#endregion', null],
        ['text', '// #region', '// #endregion', null],
    ])('%s: %s … %s', (lang, open, close, want) => {
        expect(regionEnd(lang, open, close)).toBe(want)
    })

    it('Fold All Regions 用本语言的标记', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = liteMonaco({ parent, highlighter: hl, lang: 'python', doc: '#region\nx\n#endregion\n' })
        foldAllMarkerRegions(view)
        expect([...view.state.field(foldField)]).toEqual([1])
        view.destroy()
        parent.remove()
    })
})
