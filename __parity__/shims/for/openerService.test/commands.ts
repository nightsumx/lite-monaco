// Monaco CommandsRegistry / ICommandService(platform/commands):注册表 + 服务标识。
export const ICommandService: any = Symbol('ICommandService')
export type ICommandService = { executeCommand(id: string, ...args: unknown[]): Promise<any> }
const commands = new Map<string, Function[]>()
export const CommandsRegistry = {
    registerCommand(id: string, handler: Function) {
        const list = commands.get(id) ?? []; list.push(handler); commands.set(id, list)
        return { dispose() { const l = commands.get(id); const i = l ? l.indexOf(handler) : -1; if (l && i >= 0) l.splice(i, 1) } }
    },
    getCommand(id: string) { const l = commands.get(id); return l?.length ? { id, handler: l[l.length - 1] } : undefined },
}
