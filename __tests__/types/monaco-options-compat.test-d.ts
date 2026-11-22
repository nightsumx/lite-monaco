// 逐选项键:lite-monaco 的 EditorOptions[key].defaultValue 类型与官方 monaco.editor.EditorOptions[key] 双向兼容。
// 这等价于「getOption(id) 对每个具体 id 返回同一类型」(泛型 getOption 本身无法跨声明比较,见 monaco-types-gen.ts 的 UNSUPPORTED)。
import type * as M from 'monaco-editor'
import type * as L from '../../src/monaco/editor'

type MO = typeof M.editor.EditorOptions
type LO = typeof L.EditorOptions
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type IsAny<T> = 0 extends 1 & T ? true : false
// 每个官方键都必须存在,且值类型一致、且不是 any(防止空转)
type Bad = { [K in keyof MO]: K extends keyof LO ? (IsAny<LO[K]['defaultValue']> extends true ? K : Same<LO[K]['defaultValue'], MO[K]['defaultValue']> extends true ? never : K) : K }[keyof MO]
export const noBadOptionKeys: [Bad] extends [never] ? true : Bad = true
// 反向保险:键集合也一致
export const sameKeys: Same<keyof MO, keyof LO> extends true ? true : false = true
