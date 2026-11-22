// monaco-editor 0.55.1(我们对标的版本)与 0.58.0(src/basic-languages 拷的版本)里语言定义有行为差异的地方,固定 lite-monaco 取的是哪个。
// 完整清单见 __parity__/monarch/VERSION-DIFF.md。
import { describe, expect, it } from 'vitest'
import '../../src/basic-languages/register.all'
import { loadLanguage } from '../../src/basic-languages/_.contribution'
import { editor } from '../../src/basic-languages/_monaco'

const types = async (lang: string, text: string) => {
    await loadLanguage(lang)
    await new Promise(r => setTimeout(r, 0))
    return editor.tokenize(text, lang).map(line => line.map(t => [t.offset, t.type]))
}

describe('0.58.0 对 0.55.1 的行为修正(lite-monaco 取 0.58.0)', () => {
    it('ini:行首带空白的注释行整行是 comment(0.55.1 里是无类型文本)', async () => {
        expect(await types('ini', '  ; indented comment\n\t# tab comment\n; flush')).toEqual([
            [[0, 'comment.ini']],
            [[0, 'comment.ini']],
            [[0, 'comment.ini']],
        ])
    })

    it('ini:其余行照旧(节名、键、分隔符)', async () => {
        expect(await types('ini', '[sec]\nk=v')).toEqual([
            [[0, 'metatag.ini']],
            [[0, 'key.ini'], [1, 'delimiter.ini'], [2, '']],
        ])
    })

    it('elixir:带引号的关键字键("a b": / \'a\':)照常分词', async () => {
        const [line] = await types('elixir', '%{"a b": 1}')
        expect(line.length).toBeGreaterThan(1)
    })

    it('elixir:字符串里连续的 #{…} 插值不会灾难性回溯(0.58 的线性前瞻)', async () => {
        // 0.55.1 的 /"(?=([^"]|#\{.*?\}|\\")*":)/ 对 '"' + '#{a}'.repeat(n) + 'x' 是指数的:
        // 实测 n=18 约 1 秒,n=24 约 109 秒(node 同一台机器)。0.58 的写法这里是 0 ms。
        const evil = '"' + '#{a}'.repeat(40) + 'x'
        const t0 = performance.now()
        await types('elixir', evil)
        expect(performance.now() - t0).toBeLessThan(2000)
    })
})
