// @vitest-environment jsdom
// 体积:codicon 字体不在主包里(挂载时按需加载的单独一块),CSS 模板串里的注释打包时去掉。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripCssComments } from '../../scripts/build/strip-css-comments.mjs'
import { liteMonacoBaseCSS, ensureBaseCSS } from '../../src/product/themecss'

describe('stripCssComments', () => {
    it('去掉模板串里的 /* */,${} 里的代码、JS 注释、普通字符串都不动', () => {
        const src = [
            "// a /* line comment */",
            "/* block */ const q = '/* in single */' + \"/* in double */\"",
            'const css = `a { b: c; } /* drop me */',
            'x { y: ${f({ k: `/* nested tpl drop */z`, n: "/* keep */" })}; } /* drop',
            'too */ end \\` /* drop after escaped backtick */`',
        ].join('\n')
        expect(stripCssComments(src)).toBe([
            "// a /* line comment */",
            "/* block */ const q = '/* in single */' + \"/* in double */\"",
            'const css = `a { b: c; } ',
            'x { y: ${f({ k: `z`, n: "/* keep */" })}; }  end \\` `',
        ].join('\n'))
    })

    it('结构 CSS:去掉注释后的结果 = 原文按 CSS 规则去掉注释', async () => {
        // 把三个 CSS 源文件转换后的文本放进临时模块比对,太重;这里只看源文件转换前后,除注释外一字不差
        for (const f of ['src/product/themecss.ts', 'src/core/diff/diffcss.ts', 'src/core/chrome/codicon-font.ts']) {
            const s = readFileSync(resolve(__dirname, '../..', f), 'utf8')
            const t = stripCssComments(s)
            expect(t.length).toBeLessThan(s.length)
            // 被删的只有 /* … */ 段:把原文里的这些段删掉应得到同一个字符串
            let i = 0, j = 0
            while (i < s.length) {
                if (s[i] === t[j]) { i++; j++; continue }
                expect(s.startsWith('/*', i)).toBe(true)
                i = s.indexOf('*/', i) + 2
            }
            expect(j).toBe(t.length)
        }
    })
})

describe('codicon 字体按需加载', () => {
    afterEach(() => { document.getElementById('lite-monaco-codicon-font')?.remove() })

    it('结构 CSS 不再内联字体', () => {
        const css = liteMonacoBaseCSS('mac')
        expect(css).not.toContain('@font-face')
        expect(css).not.toContain('base64')
        expect(css).toContain('.codicon[class*="codicon-"]')
    })

    it('ensureBaseCSS 之后 document 里装上 @font-face(只一份)', async () => {
        ensureBaseCSS(document)
        ensureBaseCSS(document)
        await vi.waitFor(() => expect(document.getElementById('lite-monaco-codicon-font')).not.toBeNull())
        const els = document.querySelectorAll('#lite-monaco-codicon-font')
        expect(els.length).toBe(1)
        expect(els[0].textContent).toContain('font-family: "codicon"')
        expect(els[0].textContent).toContain('data:font/woff2;base64,')
    })

    it('挂在 shadow 根里:字体装进外面的 document(shadow 根里的 @font-face 浏览器不认)', async () => {
        const host = document.createElement('div'); document.body.appendChild(host)
        const root = host.attachShadow({ mode: 'open' })
        ensureBaseCSS(root)
        await vi.waitFor(() => expect(document.getElementById('lite-monaco-codicon-font')).not.toBeNull())
        expect(root.getElementById('lite-monaco-codicon-font')).toBeNull()
        host.remove()
    })
})
