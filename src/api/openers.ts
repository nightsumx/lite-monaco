// editor.registerEditorOpener(Monaco ICodeEditorService.registerCodeEditorOpenHandler 的公开形态)。
//
// 「转到定义」之类的结果落在别的文件 / 别的 model 时,standalone 编辑器自己打不开,就问注册过的 opener:
//   openCodeEditor(source, resource, selectionOrPosition) → true / Promise<true> 表示接管了(宿主自己切 model、开新标签…)
// 按注册顺序问,第一个返回真的算数(Monaco 同);都不接管就保持原样(什么都不做)。返回的对象 dispose() 取消注册。
// 注意区别于 registerLinkOpener(点链接用,core/feature/link.ts 已有)。

import type { IDisposable } from './types'
import type { IPosition, IRange } from './position'
import type { Uri } from './uri'
import type { LiteMonacoEditor } from './types'

export interface ICodeEditorOpener {
    /**
     * @param source 发起跳转的编辑器
     * @param resource 目标 model 的 uri
     * @param selectionOrPosition 目标位置(IRange 或 IPosition,可能没有)
     * @returns 接管了返回 true(可以是 Promise)
     */
    openCodeEditor(source: LiteMonacoEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): boolean | Promise<boolean>
}

const openers: ICodeEditorOpener[] = []

/** monaco.editor.registerEditorOpener */
export function registerEditorOpener(opener: ICodeEditorOpener): IDisposable {
    openers.push(opener)
    return {
        dispose: () => {
            const i = openers.indexOf(opener)
            if (i >= 0) openers.splice(i, 1)
        },
    }
}

export function hasEditorOpener(): boolean { return openers.length > 0 }

/** 装配层(跳转、peek)调:有 opener 接管返回 true。出错的 opener 当没接管 */
export async function openCodeEditorViaOpeners(source: LiteMonacoEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): Promise<boolean> {
    for (const o of [...openers]) {
        try {
            if (await o.openCodeEditor(source, resource, selectionOrPosition)) return true
        } catch (e) { console.error(e) }
    }
    return false
}
