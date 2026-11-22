// Monaco TypeOperations:indentation.test.ts 里只有两个 test.skip 用到 TypeOperations.indent(无法在垫片层翻译成 lite-monaco 动作:它返回 ICommand[] 交给 executeCommands),
// 文件必须能加载,所以给个明确报错的占位。
export const TypeOperations = {
    indent(..._args: unknown[]): never { throw new Error('TypeOperations.indent: lite-monaco 没有 ICommand 形态的缩进命令(走 editor.action.indentLines)') },
}
