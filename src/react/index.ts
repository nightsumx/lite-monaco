'use client'
// lite-monaco/react:React 组件,导出和 @monaco-editor/react 4.7.0 一样(默认导出 Editor,加 DiffEditor、useMonaco、loader 和类型),
// 从它迁过来只改 import 路径:
//     import Editor from 'lite-monaco/react'
// 不用 loader.config,也不从 CDN 加载:monaco 就是同一个包里的 lite-monaco,和 `import * as monaco from 'lite-monaco'` 是同一个对象。
import { useState } from 'react'
import { monaco, type Monaco } from './shared'

export { default as Editor, default } from './editor'
export type { EditorProps, OnMount, BeforeMount, OnChange, OnValidate } from './editor'
export { default as DiffEditor } from './diffeditor'
export type { DiffEditorProps, MonacoDiffEditor, DiffOnMount, DiffBeforeMount } from './diffeditor'
export type { Monaco, Theme } from './shared'

/** monaco 实例。lite-monaco 同步就有,第一次渲染就不是 null */
export function useMonaco(): Monaco | null {
    const [m] = useState<Monaco | null>(monaco)
    return m
}

interface CancelablePromise<T> extends Promise<T> { cancel: () => void }

const CANCELATION_MESSAGE = { type: 'cancelation', msg: 'operation is manually canceled' }

/**
 * @monaco-editor/loader 的同名接口,给照它写的代码用:init() 给出 lite-monaco,取消后以 { type: 'cancelation' } 拒绝(和它一样);
 * config() 什么都不用配(没有要加载的脚本),收下参数不报错。
 */
export const loader = {
    config(_params: { paths?: { vs?: string }, 'vs/nls'?: { availableLanguages?: object }, monaco?: unknown }): void { /* 没有要配的 */ },
    init(): CancelablePromise<Monaco> {
        let canceled = false
        const p = new Promise<Monaco>((resolve, reject) => {
            void Promise.resolve(monaco).then(m => canceled ? reject(CANCELATION_MESSAGE) : resolve(m))
        }) as CancelablePromise<Monaco>
        p.cancel = () => { canceled = true }
        return p
    },
    __getMonacoInstance(): Monaco | null { return monaco },
}
