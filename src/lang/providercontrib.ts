// provider 驱动的编辑器贡献(Monaco languages.registerXxxProvider 背后的 editor contribution)统一安装点。
//
// 范式同 installLinkedEditing / installInlineCompletions(装配最后一步 applyApi 之后调用);
// 每个贡献自己返回卸载函数,随 view.onDestroy 收掉。
// 新增一个贡献 = 写 install 函数,在 CONTRIBUTIONS 里加一行。
import type { LiteMonacoEditor } from '../api/types'
import { addViewActions, type ViewAction } from '../api/actions'
import { addViewKeybinding } from '../api/commands'
import { providerNavActions } from './providernav'
import { providerRenameAction } from './providerrename'
import { installProviderLinks } from './providerlinks'
import { installProviderColors } from './providercolors'
import { installProviderCodeLens } from './providercodelens'
import { installProviderSemanticTokens } from './providersemantic'
import { providerFormatActions, installFormatOnTypeAndPaste } from './providerformat'
import { KeyCode, KeyMod } from '../api/keycodes'

/** 把一张动作表装到实例上:进动作表(getAction / F1 / 右键菜单)+ 键位(不满足 precondition 就不吃键) */
export function installViewActionTable(editor: LiteMonacoEditor, table: Record<string, ViewAction>): () => void {
    const offTable = addViewActions(editor, () => table)
    const offKeys = Object.values(table).flatMap(a => (a.keybindings ?? []).map(kb =>
        addViewKeybinding(editor, kb, null, v => {
            if (!a.supported(v) || (a.writable && v.state.readOnly)) return false
            void Promise.resolve(a.run(v))
            return true
        })))
    return () => { offTable(); for (const d of offKeys) d?.dispose() }
}


export interface ProviderContribOptions {
    /** TS/JS 编辑器:自带语言服务的内置实现(导航 / 重命名 / 格式化 / 高亮)优先,provider 版不接管这些 */
    ts: boolean
    /** 构造选项里的 `semanticHighlighting.enabled`(不是 computed 选项,选项合并会丢掉,要单独带) */
    semanticHighlighting?: unknown
}
export type ProviderContribution = (editor: LiteMonacoEditor, opts: ProviderContribOptions) => (() => void) | void

const NAV_KEYS: Record<string, number[]> = {
    'editor.action.goToImplementation': [KeyMod.CtrlCmd | KeyCode.F12],
    'editor.action.peekImplementation': [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12],
    'editor.action.goToReferences': [KeyMod.Shift | KeyCode.F12],
}
// TS 编辑器自带 definition / type definition / implementation / references 的语言服务导航,provider 只补它没有的(声明)
const TS_OWNED = new Set(['editor.action.goToTypeDefinition', 'editor.action.peekTypeDefinition', 'editor.action.goToImplementation', 'editor.action.peekImplementation', 'editor.action.goToReferences', 'editor.action.referenceSearch.trigger'])

const CONTRIBUTIONS: ProviderContribution[] = [
    (editor, { ts }) => {
        const all = providerNavActions()
        const table: Record<string, ViewAction> = {}
        for (const [id, a] of Object.entries(all)) {
            if (ts && TS_OWNED.has(id)) continue
            table[id] = { ...a, keybindings: NAV_KEYS[id] }
        }
        return installViewActionTable(editor, table)
    },
    // F2 重命名:TS 编辑器走语言服务的内置实现
    (editor, { ts }) => ts ? undefined : installViewActionTable(editor, { 'editor.action.rename': { ...providerRenameAction(), keybindings: [KeyCode.F2] } }),
    // 链接:所有语言都叠加(Monaco 把所有 provider 的结果并起来)
    editor => installProviderLinks(editor),
    editor => installProviderColors(editor),
    editor => installProviderCodeLens(editor),
    (editor, { semanticHighlighting }) => installProviderSemanticTokens(editor, semanticHighlighting),
    // 格式化:TS 编辑器走语言服务的内置实现(formatOnType / formatOnPaste 也是)
    (editor, { ts }) => ts ? undefined : installViewActionTable(editor, providerFormatActions()),
    (editor, { ts }) => ts ? undefined : installFormatOnTypeAndPaste(editor),
]

export function installProviderContributions(editor: LiteMonacoEditor, opts: ProviderContribOptions): void {
    // 调用点在 applyApi 之后,Monaco API(getModel / getAction…)已在 view 上;同步装,
    // 创建完立刻 trigger('editor.action.xxx') 也能命中。要等 model 的贡献自己 queueMicrotask。
    for (const install of CONTRIBUTIONS) {
        const off = install(editor, opts)
        if (off) editor.onDestroy(off)
    }
}
