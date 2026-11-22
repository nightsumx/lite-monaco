// 构建产物:`lite-monaco/basic-languages` 入口(dist/basic-languages.{js,cjs,d.ts})。
// 这个测试读的是 npm run build 的产物,不是源码,所以 dist 不存在(没构建过)时整个文件跳过,不报红。
// 它守的是:入口能 import、副作用注册了语言、注册后能分词、.d.ts 存在、package.json 的 exports 指对了地方。
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const dist = (f: string) => resolve(root, 'dist', f)
const built = existsSync(dist('basic-languages.js')) && existsSync(dist('index.js'))

describe.skipIf(!built)('dist/basic-languages 入口', () => {
    it('产物齐全:js / cjs / d.ts / d.cts', () => {
        for (const f of ['basic-languages.js', 'basic-languages.cjs', 'basic-languages.d.ts', 'basic-languages.d.cts']) {
            expect(existsSync(dist(f)), f).toBe(true)
        }
    })

    it('package.json 的 exports["./basic-languages"] 指向这四个文件', () => {
        const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
        expect(pkg.exports['./basic-languages']).toEqual({
            types: './dist/basic-languages.d.ts',
            import: './dist/basic-languages.js',
            require: './dist/basic-languages.cjs',
        })
    })

    it('import 产物:副作用注册了语言,Monarch 按需加载后能分词(用的是产物里的 editor,不是源码)', async () => {
        // 同一个产物里的 index.js 和 basic-languages.js 共享 chunk:basic-languages 注册进的就是 index 导出的那份 languages / editor
        const lm: any = await import(dist('index.js'))
        await import(dist('basic-languages.js'))
        const ids = lm.languages.getLanguages().map((l: { id: string }) => l.id)
        for (const id of ['python', 'rust', 'go', 'sql', 'html', 'freemarker2', 'cpp', 'c', 'verilog']) expect(ids, id).toContain(id)

        const text = 'def f(x):\n    return "s"  # c'
        const m = lm.editor.createModel('', 'python')
        m.dispose()
        // 分词器是懒创建的:等语言加载 + tokenizer 就绪
        for (let i = 0; i < 40; i++) {
            if (lm.editor.tokenize(text, 'python')[0].length > 1) break
            await new Promise(r => setTimeout(r, 25))
        }
        const toks = lm.editor.tokenize(text, 'python')
        const flat = toks.flat().map((t: { type: string }) => t.type)
        expect(flat).toContain('keyword.python') // def / return
        expect(flat).toContain('string.python')
        expect(flat).toContain('comment.python')
    })

    it('入口是纯副作用入口:不导出东西(.d.ts 是 export {})', () => {
        expect(readFileSync(dist('basic-languages.d.ts'), 'utf8').trim()).toBe('export {  }')
    })

    it('不进主包:Monarch 语言定义在各自的懒加载 chunk 里,index.js 里没有', () => {
        // 先证明探针有效(否则「没有」是恒真):python 的定义确实在某个 chunk 里,形态是 tokenPostfix: ".python"
        const files = readdirSync(resolve(root, 'dist')).filter(f => f.endsWith('.js'))
        const withPython = files.filter(f => readFileSync(dist(f), 'utf8').includes('tokenPostfix: ".python"'))
        expect(withPython.length).toBeGreaterThan(0)
        expect(withPython).not.toContain('index.js')
        expect(readFileSync(dist('index.js'), 'utf8')).not.toContain('tokenPostfix: ".rust"')
    })
})
