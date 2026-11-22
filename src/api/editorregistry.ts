// 全局的编辑器登记(Monaco ICodeEditorService 的 listCodeEditors / listDiffEditors / onCodeEditorAdd / onDiffEditorAdd)
// 和全局命令表(CommandsRegistry:`editor.addCommand` / `editor.registerCommand`)。
// 登记:每个 liteMonaco() 实例装好后进表,销毁时出表;DiffEditor 自己进另一张表,它内部的两个侧编辑器本身就是 liteMonaco() 实例,
// 所以和 Monaco 一样既在 getDiffEditors() 的那个 diff 里,也在 getEditors() 里。peek 预览编辑器同理(Monaco 的 EmbeddedCodeEditorWidget 也登记)。

import { Emitter } from './context'
import { COMMAND_NOT_FOUND, registerCommandResolver } from './commands'
import type { IDisposable } from './types'

// ───────────── 编辑器登记 ─────────────

/** Monaco `editor.EditorType` */
export const EditorType = {
    ICodeEditor: 'vs.editor.ICodeEditor',
    IDiffEditor: 'vs.editor.IDiffEditor',
} as const

const codeEditors: object[] = []
const diffEditors: object[] = []
const emitCodeAdd = new Emitter<object>()
const emitDiffAdd = new Emitter<object>()

/** editor.onDidCreateEditor:代码编辑器创建时触发(diff 编辑器的两侧、peek 预览也算) */
export function onDidCreateEditor<E extends object>(listener: (codeEditor: E) => void): IDisposable {
    return emitCodeAdd.event(e => listener(e as E))
}
/** editor.onDidCreateDiffEditor */
export function onDidCreateDiffEditor<E extends object>(listener: (diffEditor: E) => void): IDisposable {
    return emitDiffAdd.event(e => listener(e as E))
}
/** editor.getEditors:快照,不是活引用 */
export function getEditors<E extends object>(): readonly E[] { return codeEditors.slice() as E[] }
/** editor.getDiffEditors */
export function getDiffEditors<E extends object>(): readonly E[] { return diffEditors.slice() as E[] }

/** 内部:代码编辑器装好后登记;返回注销函数(销毁时调) */
export function registerCodeEditor(editor: object): () => void {
    codeEditors.push(editor)
    emitCodeAdd.fire(editor)
    return () => { const i = codeEditors.indexOf(editor); if (i >= 0) codeEditors.splice(i, 1) }
}
/** 内部:diff 编辑器登记 */
export function registerDiffEditor(editor: object): () => void {
    diffEditors.push(editor)
    emitDiffAdd.fire(editor)
    return () => { const i = diffEditors.indexOf(editor); if (i >= 0) diffEditors.splice(i, 1) }
}

// ───────────── 全局命令表 ─────────────

type CommandHandler = (accessor: { get(id: unknown): unknown }, ...args: unknown[]) => unknown
// 同 id 可重复注册:后注册的优先,它销毁后前一个复活(Monaco CommandsRegistry 是 LinkedList,取最新)
const commands = new Map<string, CommandHandler[]>()
const accessor = { get(): unknown { return undefined } }

/** editor.registerCommand */
export function registerCommand(id: string, handler: (accessor: unknown, ...args: unknown[]) => void): IDisposable {
    const h = handler as CommandHandler
    let stack = commands.get(id)
    if (!stack) commands.set(id, stack = [])
    stack.push(h)
    return {
        dispose() {
            const s = commands.get(id)
            if (!s) return
            const i = s.lastIndexOf(h)
            if (i >= 0) s.splice(i, 1)
            if (!s.length) commands.delete(id)
        },
    }
}

/** editor.addCommand:描述符形式的 registerCommand */
export function addCommand(descriptor: { id: string, run: (accessor: unknown, ...args: unknown[]) => void }): IDisposable {
    if (typeof descriptor.id !== 'string' || typeof descriptor.run !== 'function') {
        throw new Error('Invalid command descriptor, `id` and `run` are required properties!')
    }
    return registerCommand(descriptor.id, descriptor.run)
}

// 全局命令是 trigger / 键位 / executeCommand 共用的命令 id 解析的一环(后登记的解析器先问,所以用户命令盖过内置)
registerCommandResolver((_view, id, args) => {
    const stack = commands.get(id)
    if (!stack) return COMMAND_NOT_FOUND
    return stack[stack.length - 1](accessor, ...args)
})
