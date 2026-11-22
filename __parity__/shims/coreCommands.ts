// Monaco 的 CoreEditingCommands / CoreNavigationCommands:每个成员只是"id + runCoreEditorCommand"句柄,
// 真正的行为全在 lite-monaco 的 editor.trigger(handlerId, payload)(src/api/host.ts)。垫片只翻译 id 和参数,不实现行为。
// 成员名 → Monaco 命令 id:默认首字母小写(CursorLeft → cursorLeft);带下划线的内部命令单列。
const ID_OVERRIDES: Record<string, string> = {
    MoveTo: '_moveTo', MoveToSelect: '_moveToSelect',
    WordSelect: '_wordSelect', WordSelectDrag: '_wordSelectDrag',
    LineSelect: '_lineSelect', LineSelectDrag: '_lineSelectDrag',
    LastCursorMoveToSelect: '_lastCursorMoveToSelect',
}
export interface CommandHandle { id: string, runCoreEditorCommand(viewModel: any, args?: unknown): void, runEditorCommand(accessor: unknown, editor: any, args?: unknown): void }
const handle = (id: string): CommandHandle => ({
    id,
    runCoreEditorCommand(vm, args) {
        // 视口类移动读的是「完整可见行区间」:测试把 viewModel.getCompletelyVisibleViewRange 换成固定区间,这里把它当参数传给 trigger
        const vr = typeof vm.getCompletelyVisibleViewRange === 'function' ? vm.getCompletelyVisibleViewRange() : undefined
        vm.trigger('test', id, vr && id === 'cursorMove' ? { ...(args as object), visibleRange: vr } : args ?? {})
    },
    runEditorCommand(_a, editor, args) { editor.trigger('test', id, args ?? {}) },
})
const byName = (overrides: Record<string, string> = {}) => new Proxy({}, {
    get: (_, k) => {
        const name = String(k)
        if (name === 'then') return undefined
        return handle(overrides[name] ?? ID_OVERRIDES[name] ?? name.charAt(0).toLowerCase() + name.slice(1))
    },
}) as Record<string, CommandHandle>
export const CoreEditingCommands = byName()
export const CoreNavigationCommands = byName()
