// 生成 monaco 类型出口 + 兼容断言。用法:npx tsx scripts/gen-monaco-types.ts
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generate, GENERATED_FILES, rootDir } from '../__tests__/types/monaco-types-gen'

const g = generate()
for (const k of Object.keys(GENERATED_FILES) as (keyof typeof GENERATED_FILES)[]) {
    writeFileSync(resolve(rootDir, GENERATED_FILES[k]), g[k])
    console.log('wrote', GENERATED_FILES[k])
}
