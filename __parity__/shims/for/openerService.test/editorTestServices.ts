// Monaco TestCodeEditorService:只记下最后一次 openCodeEditor 的 input。
export class TestCodeEditorService {
    lastInput?: { resource: any, options?: any }
    constructor(_themeService?: unknown) {}
    getFocusedCodeEditor() { return null }
    openCodeEditor(input: { resource: any, options?: any }) { this.lastInput = input; return Promise.resolve(null) }
}
