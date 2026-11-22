// Monaco contrib/lineSelection/browser/lineSelection:ExpandLineSelectionAction → lite-monaco 的 expandLineSelection 动作。
export class ExpandLineSelectionAction { run(_: unknown, editor: any, args?: unknown) { return editor.getAction('expandLineSelection').run(args) } }
