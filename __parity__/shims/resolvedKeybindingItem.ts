// platform/keybinding/common/resolvedKeybindingItem:一条「键位 → 命令(+参数)」的记录(字段同 Monaco)。
export class ResolvedKeybindingItem {
    readonly resolvedKeybinding: unknown
    readonly command: string | null
    readonly commandArgs: unknown
    readonly when: unknown
    readonly isDefault: boolean
    readonly extensionId: string | null
    readonly isBuiltinExtension: boolean
    constructor(resolvedKeybinding: unknown, command: string | null, commandArgs: unknown, when: unknown, isDefault: boolean, extensionId: string | null, isBuiltinExtension: boolean) {
        this.resolvedKeybinding = resolvedKeybinding
        this.command = command
        this.commandArgs = commandArgs
        this.when = when
        this.isDefault = isDefault
        this.extensionId = extensionId
        this.isBuiltinExtension = isBuiltinExtension
    }
}
