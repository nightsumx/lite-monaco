// 打包时去掉 CSS 模板串里的 /* … */ 注释(结构 CSS 的注释是给维护者看的,浏览器不需要,原样打进包约 8 KB gzip)。
// 只动模板串里的文字,不动 JS 注释和 ${…} 里的代码;只用于纯 CSS 的源文件(CSS_SOURCES),
// 别的文件的模板串里 /* 可能是真内容(比如高亮规则里的注释记号)。
import { readFile } from 'node:fs/promises'

export const CSS_SOURCES = /[\\/]src[\\/](product[\\/]themecss|core[\\/]diff[\\/]diffcss|core[\\/]chrome[\\/]codicon-font)\.ts$/

export function stripCssComments(s) {
    let o = '', i = 0
    const depth = [] // 每层模板串一个数:0 = 在模板文字里,n>0 = 在 ${ } 里且花括号深 n
    const inTpl = () => depth.length > 0 && depth[depth.length - 1] === 0
    const skip = (to) => { o += s.slice(i, to); i = to }
    while (i < s.length) {
        const c = s[i], d = s[i + 1]
        if (inTpl()) {
            if (c === '\\') skip(i + 2)
            else if (c === '`') { depth.pop(); skip(i + 1) }
            else if (c === '$' && d === '{') { depth[depth.length - 1] = 1; skip(i + 2) }
            else if (c === '/' && d === '*') i = s.indexOf('*/', i + 2) + 2 // 丢掉
            else skip(i + 1)
            continue
        }
        if (c === '/' && d === '/') skip(s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i))
        else if (c === '/' && d === '*') skip(s.indexOf('*/', i + 2) + 2)
        else if (c === "'" || c === '"') { let j = i + 1; while (s[j] !== c) j += s[j] === '\\' ? 2 : 1; skip(j + 1) }
        else if (c === '`') { depth.push(0); skip(i + 1) }
        else if (c === '{' && depth.length) { depth[depth.length - 1]++; skip(i + 1) }
        else if (c === '}' && depth.length) { depth[depth.length - 1]--; skip(i + 1) }
        else skip(i + 1)
    }
    return o
}

/** esbuild 插件(tsup 的 esbuildPlugins、perf / site 的打包脚本共用) */
export const stripCssCommentsPlugin = {
    name: 'strip-css-comments',
    setup(build) {
        build.onLoad({ filter: CSS_SOURCES }, async ({ path }) => ({ contents: stripCssComments(await readFile(path, 'utf8')), loader: 'ts' }))
    },
}
