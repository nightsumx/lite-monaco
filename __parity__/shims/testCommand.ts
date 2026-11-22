// Monaco 的 testCommand 夹具 → lite-monaco。
// Monaco 命令是 ICommand 对象(new SortLinesCommand(sel, desc)),lite-monaco 的命令是 StateCommand / editor action。
// 垫片里的"命令类"(sortLinesCommand.ts 等)构造出 LMCommand:{ run(editor, model) } —— 在真编辑器上执行等价的 lite-monaco 命令。
import assert from 'assert'
import { createEditor } from '../../src/api/create'
import { createModel } from '../../src/api/model'
import { Selection } from '../../src/api/position'
import { ILanguageService } from './language'
import { ILanguageConfigurationService } from './languageConfigurationRegistry'
import { LanguageService } from './languageService'
import { TestLanguageConfigurationService } from './testLanguageConfigurationService'
import { installTokenBridge } from './tokenizationBridge'
import { IInstantiationService, makeInstantiationService } from './instantiation'

export interface LMCommand { readonly __lm: true, run(editor: any, model: any): void }
export const lmCommand = (run: (editor: any, model: any) => void): LMCommand => ({ __lm: true, run })

export const fakeHighlighter = {
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text', 'plaintext'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as never
export const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false }

/** 没有服务的 accessor:get(token) 返回空桩(只给不走 testCommand 的垫片用)。 */
export const accessorStub = { get: (_token: unknown) => ({}) } as any

/** testCommand 的服务 accessor:语言服务 / 语言配置服务是真的(落到 lite-monaco 的语言注册表),其余空桩。 */
function makeServices() {
    const languageService = new LanguageService()
    const configService = new TestLanguageConfigurationService()
    const get = (token: unknown): unknown => token === ILanguageService ? languageService : token === ILanguageConfigurationService ? configService : token === IInstantiationService ? inst : {}
    const inst = makeInstantiationService(get)
    const accessor = { get } as any
    const items: { dispose(): void }[] = []
    const disposables = { add: <T>(x: T): T => { if (x && typeof (x as any).dispose === 'function') items.push(x as any); return x }, dispose() { for (const d of items.splice(0).reverse()) d.dispose(); configService.dispose() } }
    return { accessor, disposables }
}

export function testCommand(
    lines: string[], languageId: string | null, selection: Selection,
    commandFactory: (accessor: any, selection: Selection) => LMCommand,
    expectedLines: string[], expectedSelection: Selection,
    _forceTokenization?: boolean, prepare?: (accessor: any, disposables: any) => void,
): void {
    const { accessor, disposables } = makeServices()
    prepare?.(accessor, disposables)
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const model = createModel(lines.join('\n'), languageId ?? undefined)
    const editor = createEditor(parent, { model, highlighter: fakeHighlighter, features: QUIET } as never) as any
    installTokenBridge(editor) // Monaco TokenizationRegistry 里注册的 tokenizer(类型 / 内嵌语言)→ core 外部来源
    try {
        editor.setSelection(selection)
        const sel = editor.getSelection()
        const cmd = commandFactory(accessor, new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn))
        cmd.run(editor, model)
        assert.deepStrictEqual(model.getLinesContent(), expectedLines)
        const a = editor.getSelection()
        assert.deepStrictEqual(new Selection(a.selectionStartLineNumber, a.selectionStartColumn, a.positionLineNumber, a.positionColumn).toString(), expectedSelection.toString())
    } finally { editor.dispose(); parent.remove(); disposables.dispose() }
}

/** Monaco getEditOperation:取命令在 model 上会产生的编辑操作。命令垫片自带 getEditOperations(model, builder)(在草稿编辑器上跑 lite-monaco 对应动作再翻成 Monaco 的操作形态)。 */
export function getEditOperation(model: any, command: any): { range: unknown, text: string | null, forceMoveMarkers: boolean }[] {
    const operations: any[] = []
    const builder = {
        addEditOperation: (range: unknown, text: string | null, forceMoveMarkers = false) => { operations.push({ range, text, forceMoveMarkers }) },
        addTrackedEditOperation: (range: unknown, text: string | null, forceMoveMarkers = false) => { operations.push({ range, text, forceMoveMarkers }) },
        trackSelection: () => '',
    }
    command.getEditOperations(model, builder)
    return operations
}

/** 在 model 内容的拷贝上跑 fn(草稿编辑器 + 草稿 model 全进程复用,换内容即可),返回跑完后的行(不动原 model) */
let scratchEditor: any = null
let scratchModel: any = null
let scratchParent: HTMLElement | null = null
export function runOnScratch(model: any, selection: Selection, fn: (editor: any, scratch: any) => void): string[] {
    if (!scratchEditor || !scratchParent?.isConnected) {
        scratchParent = document.createElement('div')
        document.body.appendChild(scratchParent)
        scratchModel = createModel('')
        scratchEditor = createEditor(scratchParent, { model: scratchModel, highlighter: fakeHighlighter, features: QUIET } as never) as any
    }
    scratchModel.setValue(model.getValue())
    scratchEditor.setSelection(selection)
    fn(scratchEditor, scratchModel)
    return scratchModel.getLinesContent()
}
