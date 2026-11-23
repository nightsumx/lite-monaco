// TypeScript lib.d.ts 注入 —— 给 LanguageService 补齐 ESNext + DOM 全局
// (Object / Promise / onbeforeinput …),对齐 Monaco IntelliSense 符号表。
//
// 加载策略(按序):
//   1. Node fs(require.resolve('typescript') 旁 lib/)—— vitest / SSR
//   2. 自定义 loader(setTsLibLoader)—— demo/宿主可注入
//   3. CDN jsDelivr(typescript@${version}/lib/*)—— 浏览器兜底,缓存到内存
//
// 全量 ~2.4MB 文本,只在 ensure() 时拉一次;gzip 传输约 400–600KB。

/** typescript/lib 下全部 lib.*.d.ts(5.7 清单;多文件无害,未知文件 fetch 失败则跳过) */
export const TS_LIB_FILE_NAMES: readonly string[] = [
    'lib.d.ts',
    'lib.decorators.d.ts',
    'lib.decorators.legacy.d.ts',
    'lib.dom.asynciterable.d.ts',
    'lib.dom.d.ts',
    'lib.dom.iterable.d.ts',
    'lib.es2015.collection.d.ts',
    'lib.es2015.core.d.ts',
    'lib.es2015.d.ts',
    'lib.es2015.generator.d.ts',
    'lib.es2015.iterable.d.ts',
    'lib.es2015.promise.d.ts',
    'lib.es2015.proxy.d.ts',
    'lib.es2015.reflect.d.ts',
    'lib.es2015.symbol.d.ts',
    'lib.es2015.symbol.wellknown.d.ts',
    'lib.es2016.array.include.d.ts',
    'lib.es2016.d.ts',
    'lib.es2016.full.d.ts',
    'lib.es2016.intl.d.ts',
    'lib.es2017.arraybuffer.d.ts',
    'lib.es2017.d.ts',
    'lib.es2017.date.d.ts',
    'lib.es2017.full.d.ts',
    'lib.es2017.intl.d.ts',
    'lib.es2017.object.d.ts',
    'lib.es2017.sharedmemory.d.ts',
    'lib.es2017.string.d.ts',
    'lib.es2017.typedarrays.d.ts',
    'lib.es2018.asyncgenerator.d.ts',
    'lib.es2018.asynciterable.d.ts',
    'lib.es2018.d.ts',
    'lib.es2018.full.d.ts',
    'lib.es2018.intl.d.ts',
    'lib.es2018.promise.d.ts',
    'lib.es2018.regexp.d.ts',
    'lib.es2019.array.d.ts',
    'lib.es2019.d.ts',
    'lib.es2019.full.d.ts',
    'lib.es2019.intl.d.ts',
    'lib.es2019.object.d.ts',
    'lib.es2019.string.d.ts',
    'lib.es2019.symbol.d.ts',
    'lib.es2020.bigint.d.ts',
    'lib.es2020.d.ts',
    'lib.es2020.date.d.ts',
    'lib.es2020.full.d.ts',
    'lib.es2020.intl.d.ts',
    'lib.es2020.number.d.ts',
    'lib.es2020.promise.d.ts',
    'lib.es2020.sharedmemory.d.ts',
    'lib.es2020.string.d.ts',
    'lib.es2020.symbol.wellknown.d.ts',
    'lib.es2021.d.ts',
    'lib.es2021.full.d.ts',
    'lib.es2021.intl.d.ts',
    'lib.es2021.promise.d.ts',
    'lib.es2021.string.d.ts',
    'lib.es2021.weakref.d.ts',
    'lib.es2022.array.d.ts',
    'lib.es2022.d.ts',
    'lib.es2022.error.d.ts',
    'lib.es2022.full.d.ts',
    'lib.es2022.intl.d.ts',
    'lib.es2022.object.d.ts',
    'lib.es2022.regexp.d.ts',
    'lib.es2022.string.d.ts',
    'lib.es2023.array.d.ts',
    'lib.es2023.collection.d.ts',
    'lib.es2023.d.ts',
    'lib.es2023.full.d.ts',
    'lib.es2023.intl.d.ts',
    'lib.es2024.arraybuffer.d.ts',
    'lib.es2024.collection.d.ts',
    'lib.es2024.d.ts',
    'lib.es2024.full.d.ts',
    'lib.es2024.object.d.ts',
    'lib.es2024.promise.d.ts',
    'lib.es2024.regexp.d.ts',
    'lib.es2024.sharedmemory.d.ts',
    'lib.es2024.string.d.ts',
    'lib.es5.d.ts',
    'lib.es6.d.ts',
    'lib.esnext.array.d.ts',
    'lib.esnext.collection.d.ts',
    'lib.esnext.d.ts',
    'lib.esnext.decorators.d.ts',
    'lib.esnext.disposable.d.ts',
    'lib.esnext.full.d.ts',
    'lib.esnext.intl.d.ts',
    'lib.esnext.iterator.d.ts',
    'lib.scripthost.d.ts',
    'lib.webworker.asynciterable.d.ts',
    'lib.webworker.d.ts',
    'lib.webworker.importscripts.d.ts',
    'lib.webworker.iterable.d.ts',
]

let cache: Map<string, string> | null = null
let customLoader: (() => Promise<Map<string, string>>) | null = null

/** 宿主注入(如 demo 从本地 /node_modules 读),优先于 CDN */
export function setTsLibLoader(loader: () => Promise<Map<string, string>>): void {
    customLoader = loader
    cache = null
}

export function clearTsLibCache(): void {
    cache = null
}

/** 从任意路径抽出 lib 文件名(TS host 可能传绝对/相对/带盘符路径) */
export function libFileName(path: string): string | null {
    const base = path.replace(/\\/g, '/').split('/').pop() ?? ''
    if (base.startsWith('lib.') && base.endsWith('.d.ts')) return base
    return null
}

async function loadFromNode(): Promise<Map<string, string> | null> {
    try {
        if (typeof process === 'undefined' || !process.versions?.node) return null
        // 只在 Node 里走(测试、服务端);模块名运行时才给,打包器不去解析,浏览器构建里不出现 node 内置模块
        const nodeImport = (name: string) => import(/* @vite-ignore */ /* webpackIgnore: true */ name)
        const fs = await nodeImport('node:fs') as typeof import('node:fs')
        const path = await nodeImport('node:path') as typeof import('node:path')
        // createRequire 的 @types 在部分 moduleResolution 下挂不到 named export,宽断言
        const nodeModule = await nodeImport('node:module') as {
            createRequire: (url: string | URL) => NodeRequire
        }
        const require = nodeModule.createRequire(import.meta.url)
        const libDir = path.dirname(require.resolve('typescript'))
        const map = new Map<string, string>()
        for (const name of fs.readdirSync(libDir)) {
            if (!name.startsWith('lib.') || !name.endsWith('.d.ts')) continue
            map.set(name, fs.readFileSync(path.join(libDir, name), 'utf8'))
        }
        return map.size >= 20 ? map : null
    }
    catch {
        return null
    }
}

async function loadFromCdn(version: string): Promise<Map<string, string>> {
    const base = `https://cdn.jsdelivr.net/npm/typescript@${version}/lib/`
    const map = new Map<string, string>()
    // 并行拉取;失败跳过(个别版本缺文件)
    await Promise.all(TS_LIB_FILE_NAMES.map(async (name) => {
        try {
            const res = await fetch(base + name)
            if (!res.ok) return
            map.set(name, await res.text())
        }
        catch { /* offline / CORS */ }
    }))
    return map
}

/**
 * 加载全部 lib 文本到 Map(key = 文件名如 lib.dom.d.ts)。
 * @param tsVersion typescript.version,CDN 路径用
 */
export async function loadTsLibs(tsVersion: string): Promise<Map<string, string>> {
    if (cache) return cache

    if (customLoader) {
        cache = await customLoader()
        if (cache.size) return cache
        cache = null
    }

    const fromNode = await loadFromNode()
    if (fromNode) {
        cache = fromNode
        return cache
    }

    const fromCdn = await loadFromCdn(tsVersion)
    if (fromCdn.size < 10)
        throw new Error(`tslibs: failed to load TypeScript libs (got ${fromCdn.size} files)`)
    cache = fromCdn
    return cache
}

/** 解析 host 请求的路径 → lib 文本 */
export function readLib(libs: Map<string, string>, filePath: string): string | undefined {
    if (libs.has(filePath)) return libs.get(filePath)
    const name = libFileName(filePath)
    if (name && libs.has(name)) return libs.get(name)
    return undefined
}
