// 三种语言的 register.ts 在包加载时就跑(登记 defaults、挂 onLanguage),所以它们不能经 monaco/languages 这个会反过来 import 它们的桶(循环),
// 直接从实现模块取要用的几个名字。真正的语言服务(vscode-*-languageservice)在 *Mode.ts 里,首次用到该语言时才动态 import。
import { register } from '../../api/languages'
import { onLanguage } from '../../api/standalonelanguages'
export const languages = { register, onLanguage }
export { Emitter } from '../../api/context'
export type { Uri } from '../../api/uri'
export type { IDisposable, IEvent } from '../../monaco/top-types'

/** 语言服务是可选 peer 依赖:没装时,首次用到该语言只告警一次,编辑器照常(高亮仍在) */
export function missingService(pkg: string, err: unknown): void {
    console.warn(`[lite-monaco] ${pkg} 没装或加载失败,对应语言只有高亮,没有补全 / 诊断等。`, err)
}
