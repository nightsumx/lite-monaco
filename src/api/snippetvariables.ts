// 片段变量解析器(移植自 VS Code editor/contrib/snippet/browser/snippetVariables.ts)。
//
// 服务依赖去 DI:label / workspace / languageConfiguration 都以最小结构接口传入(参数形态同 Monaco),
// 没有 platform 层,所以这里只认「有这几个方法的对象」。
import type { ITextModel } from './model'
import type { Selection } from './position'
import { getLanguageConfiguration } from './languages'
import { Text, type Variable, type VariableResolver } from '../core/feature/snippetparser'

// ───────────── 最小服务接口(Monaco 同名服务的子集) ─────────────

/** URI 的最小形态:lite-monaco 的 Uri 和 vscode-uri 的 URI 都满足 */
export interface ISnippetUri {
    readonly scheme: string
    readonly path: string
    readonly fsPath: string
    with(change: { path?: string }): ISnippetUri
}

export interface ILabelService {
    getUriLabel(resource: ISnippetUri, options?: { relative?: boolean, noPrefix?: boolean }): string
}

export interface IWorkspaceFolderLike { readonly uri: ISnippetUri }
export interface IWorkspaceLike {
    readonly id: string
    readonly folders: readonly IWorkspaceFolderLike[]
    /** 多根工作区的配置文件 */
    readonly configuration?: ISnippetUri | null
}
export interface IWorkspaceContextService {
    getWorkspace(): IWorkspaceLike
}

export interface ILanguageConfigurationService {
    getLanguageConfiguration(languageId: string): { comments?: { lineCommentToken?: string, blockCommentStartToken?: string, blockCommentEndToken?: string } | null | undefined } | undefined
}

/** 撞掉选中文本的捕获(suggest 的 OvertypingCapturer);没有就不传 */
export interface IOvertypingCapturer {
    getLastOvertypedInfo(idx: number): { value: string, multiline: boolean } | undefined
}

/** 缺省的语言配置服务:读 setLanguageConfiguration 登记的 CommentRule */
export const defaultLanguageConfigurationService: ILanguageConfigurationService = {
    getLanguageConfiguration(languageId) {
        const c = getLanguageConfiguration(languageId)?.comments
        if (!c) return {}
        const lc = c.lineComment
        return {
            comments: {
                lineCommentToken: typeof lc === 'string' ? lc : lc?.comment,
                blockCommentStartToken: c.blockComment?.[0],
                blockCommentEndToken: c.blockComment?.[1],
            },
        }
    },
}

// ───────────── 路径小工具(posix + 反斜杠;够 TM_* 用) ─────────────

const SEP = /[\\/]/
function trimTrailingSep(p: string): string {
    let end = p.length
    while (end > 1 && SEP.test(p[end - 1])) end--
    return p.slice(0, end)
}
export function basename(p: string): string {
    const t = trimTrailingSep(p)
    const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
    return i < 0 ? t : t.slice(i + 1)
}
export function dirname(p: string): string {
    if (!p) return '.'
    const t = trimTrailingSep(p)
    const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
    if (i < 0) return '.'
    if (i === 0) return t[0]
    return trimTrailingSep(t.slice(0, i))
}
const WORKSPACE_EXTENSION = 'code-workspace'
const isWindowsHost = typeof process !== 'undefined' && process.platform === 'win32'
function normalizeDriveLetter(p: string): string {
    return isWindowsHost && /^[a-z]:/i.test(p) ? p[0].toUpperCase() + p.slice(1) : p
}
function uuid(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c?.randomUUID) return c.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
        const r = Math.random() * 16 | 0
        return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
}

// ───────────── 解析器 ─────────────

export const KnownSnippetVariableNames: Readonly<Record<string, true>> = Object.freeze({
    'CURRENT_YEAR': true,
    'CURRENT_YEAR_SHORT': true,
    'CURRENT_MONTH': true,
    'CURRENT_DATE': true,
    'CURRENT_HOUR': true,
    'CURRENT_MINUTE': true,
    'CURRENT_SECOND': true,
    'CURRENT_DAY_NAME': true,
    'CURRENT_DAY_NAME_SHORT': true,
    'CURRENT_MONTH_NAME': true,
    'CURRENT_MONTH_NAME_SHORT': true,
    'CURRENT_SECONDS_UNIX': true,
    'CURRENT_TIMEZONE_OFFSET': true,
    'SELECTION': true,
    'CLIPBOARD': true,
    'TM_SELECTED_TEXT': true,
    'TM_CURRENT_LINE': true,
    'TM_CURRENT_WORD': true,
    'TM_LINE_INDEX': true,
    'TM_LINE_NUMBER': true,
    'TM_FILENAME': true,
    'TM_FILENAME_BASE': true,
    'TM_DIRECTORY': true,
    'TM_DIRECTORY_BASE': true,
    'TM_FILEPATH': true,
    'CURSOR_INDEX': true, // 0-offset
    'CURSOR_NUMBER': true, // 1-offset
    'RELATIVE_FILEPATH': true,
    'BLOCK_COMMENT_START': true,
    'BLOCK_COMMENT_END': true,
    'LINE_COMMENT': true,
    'WORKSPACE_NAME': true,
    'WORKSPACE_FOLDER': true,
    'RANDOM': true,
    'RANDOM_HEX': true,
    'UUID': true,
})

export class CompositeSnippetVariableResolver implements VariableResolver {

    constructor(private readonly _delegates: VariableResolver[]) { }

    resolve(variable: Variable): string | undefined {
        for (const delegate of this._delegates) {
            const value = delegate.resolve(variable)
            if (value !== undefined) return value
        }
        return undefined
    }
}

function getLeadingWhitespace(str: string, start = 0, end: number = str.length): string {
    for (let i = start; i < end; i++) {
        const c = str.charCodeAt(i)
        if (c !== 32 && c !== 9) return str.substring(start, i)
    }
    return str.substring(start, end)
}

function commonPrefixLength(a: string, b: string): number {
    const len = Math.min(a.length, b.length)
    let i = 0
    for (; i < len; i++) if (a.charCodeAt(i) !== b.charCodeAt(i)) return i
    return len
}

export class SelectionBasedVariableResolver implements VariableResolver {

    constructor(
        private readonly _model: ITextModel,
        private readonly _selection: Selection,
        private readonly _selectionIdx: number,
        private readonly _overtypingCapturer: IOvertypingCapturer | undefined,
    ) { }

    resolve(variable: Variable): string | undefined {
        const { name } = variable

        if (name === 'SELECTION' || name === 'TM_SELECTED_TEXT') {
            let value = this._model.getValueInRange(this._selection) || undefined
            let isMultiline = this._selection.startLineNumber !== this._selection.endLineNumber

            // 没选中文本时,试试上一次被覆盖打字吃掉的文本
            if (!value && this._overtypingCapturer) {
                const info = this._overtypingCapturer.getLastOvertypedInfo(this._selectionIdx)
                if (info) {
                    value = info.value
                    isMultiline = info.multiline
                }
            }

            if (value && isMultiline && variable.snippet) {
                // 多行选区:拿变量所在位置的缩进和编辑器位置的缩进比,多出来的缩进补到后续各行
                const line = this._model.getLineContent(this._selection.startLineNumber)
                const lineLeadingWhitespace = getLeadingWhitespace(line, 0, this._selection.startColumn - 1)

                let varLeadingWhitespace = lineLeadingWhitespace
                variable.snippet.walk(marker => {
                    if (marker === variable) return false
                    if (marker instanceof Text) varLeadingWhitespace = getLeadingWhitespace(marker.value.split(/\r\n|\r|\n/).pop()!)
                    return true
                })
                const whitespaceCommonLength = commonPrefixLength(varLeadingWhitespace, lineLeadingWhitespace)

                value = value.replace(
                    /(\r\n|\r|\n)(.*)/g,
                    (_m, newline, rest) => `${newline}${varLeadingWhitespace.substr(whitespaceCommonLength)}${rest}`,
                )
            }
            return value

        } else if (name === 'TM_CURRENT_LINE') {
            return this._model.getLineContent(this._selection.positionLineNumber)

        } else if (name === 'TM_CURRENT_WORD') {
            const info = this._model.getWordAtPosition({
                lineNumber: this._selection.positionLineNumber,
                column: this._selection.positionColumn,
            })
            return info && info.word || undefined

        } else if (name === 'TM_LINE_INDEX') {
            return String(this._selection.positionLineNumber - 1)

        } else if (name === 'TM_LINE_NUMBER') {
            return String(this._selection.positionLineNumber)

        } else if (name === 'CURSOR_INDEX') {
            return String(this._selectionIdx)

        } else if (name === 'CURSOR_NUMBER') {
            return String(this._selectionIdx + 1)
        }
        return undefined
    }
}

export class ModelBasedVariableResolver implements VariableResolver {

    constructor(
        private readonly _labelService: ILabelService,
        private readonly _model: ITextModel,
    ) { }

    resolve(variable: Variable): string | undefined {
        const { name } = variable
        const uri = this._model.uri as unknown as ISnippetUri

        if (name === 'TM_FILENAME') {
            return basename(uri.fsPath)

        } else if (name === 'TM_FILENAME_BASE') {
            const fileName = basename(uri.fsPath)
            const idx = fileName.lastIndexOf('.')
            return idx <= 0 ? fileName : fileName.slice(0, idx)

        } else if (name === 'TM_DIRECTORY') {
            if (dirname(uri.fsPath) === '.') return ''
            return this._labelService.getUriLabel(uri.with({ path: dirname(uri.path) }))

        } else if (name === 'TM_DIRECTORY_BASE') {
            if (dirname(uri.fsPath) === '.') return ''
            return basename(dirname(uri.fsPath))

        } else if (name === 'TM_FILEPATH') {
            return this._labelService.getUriLabel(uri)

        } else if (name === 'RELATIVE_FILEPATH') {
            return this._labelService.getUriLabel(uri, { relative: true, noPrefix: true })
        }
        return undefined
    }
}

export interface IReadClipboardText {
    (): string | undefined
}

export class ClipboardBasedVariableResolver implements VariableResolver {

    constructor(
        private readonly _readClipboardText: IReadClipboardText,
        private readonly _selectionIdx: number,
        private readonly _selectionCount: number,
        private readonly _spread: boolean,
    ) { }

    resolve(variable: Variable): string | undefined {
        if (variable.name !== 'CLIPBOARD') return undefined

        const clipboardText = this._readClipboardText()
        if (!clipboardText) return undefined

        // spread:剪贴板行数 = 光标数时,每个光标分一行
        if (this._spread) {
            const lines = clipboardText.split(/\r\n|\n|\r/).filter(s => s.trim().length > 0)
            if (lines.length === this._selectionCount) return lines[this._selectionIdx]
        }
        return clipboardText
    }
}

export class CommentBasedVariableResolver implements VariableResolver {
    constructor(
        private readonly _model: ITextModel,
        private readonly _selection: Selection,
        private readonly _languageConfigurationService: ILanguageConfigurationService,
    ) { }

    resolve(variable: Variable): string | undefined {
        const { name } = variable
        const m = this._model as ITextModel & { getLanguageIdAtPosition?(line: number, col: number): string }
        const langId = m.getLanguageIdAtPosition
            ? m.getLanguageIdAtPosition(this._selection.selectionStartLineNumber, this._selection.selectionStartColumn)
            : m.getLanguageId()
        const config = this._languageConfigurationService.getLanguageConfiguration(langId)?.comments
        if (!config) return undefined
        if (name === 'LINE_COMMENT') return config.lineCommentToken || undefined
        if (name === 'BLOCK_COMMENT_START') return config.blockCommentStartToken || undefined
        if (name === 'BLOCK_COMMENT_END') return config.blockCommentEndToken || undefined
        return undefined
    }
}

export class TimeBasedVariableResolver implements VariableResolver {

    private static readonly dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    private static readonly dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    private static readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    private static readonly monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    private readonly _date = new Date()

    resolve(variable: Variable): string | undefined {
        const { name } = variable

        if (name === 'CURRENT_YEAR') {
            return String(this._date.getFullYear())
        } else if (name === 'CURRENT_YEAR_SHORT') {
            return String(this._date.getFullYear()).slice(-2)
        } else if (name === 'CURRENT_MONTH') {
            return String(this._date.getMonth().valueOf() + 1).padStart(2, '0')
        } else if (name === 'CURRENT_DATE') {
            return String(this._date.getDate().valueOf()).padStart(2, '0')
        } else if (name === 'CURRENT_HOUR') {
            return String(this._date.getHours().valueOf()).padStart(2, '0')
        } else if (name === 'CURRENT_MINUTE') {
            return String(this._date.getMinutes().valueOf()).padStart(2, '0')
        } else if (name === 'CURRENT_SECOND') {
            return String(this._date.getSeconds().valueOf()).padStart(2, '0')
        } else if (name === 'CURRENT_DAY_NAME') {
            return TimeBasedVariableResolver.dayNames[this._date.getDay()]
        } else if (name === 'CURRENT_DAY_NAME_SHORT') {
            return TimeBasedVariableResolver.dayNamesShort[this._date.getDay()]
        } else if (name === 'CURRENT_MONTH_NAME') {
            return TimeBasedVariableResolver.monthNames[this._date.getMonth()]
        } else if (name === 'CURRENT_MONTH_NAME_SHORT') {
            return TimeBasedVariableResolver.monthNamesShort[this._date.getMonth()]
        } else if (name === 'CURRENT_SECONDS_UNIX') {
            return String(Math.floor(this._date.getTime() / 1000))
        } else if (name === 'CURRENT_TIMEZONE_OFFSET') {
            const rawTimeOffset = this._date.getTimezoneOffset()
            const sign = rawTimeOffset > 0 ? '-' : '+'
            const hours = Math.trunc(Math.abs(rawTimeOffset / 60))
            const hoursString = (hours < 10 ? '0' + hours : hours)
            const minutes = Math.abs(rawTimeOffset) - hours * 60
            const minutesString = (minutes < 10 ? '0' + minutes : minutes)
            return sign + hoursString + ':' + minutesString
        }
        return undefined
    }
}

// workspace 标识:没有 configuration 且恰一个文件夹 → 单文件夹;有 configuration → 工作区文件;否则空
type WorkspaceIdentifier = { uri: ISnippetUri } | { configPath: ISnippetUri } | { id: string }
function toWorkspaceIdentifier(workspace: IWorkspaceLike): WorkspaceIdentifier {
    if (workspace.configuration) return { configPath: workspace.configuration }
    if (workspace.folders.length === 1) return { uri: workspace.folders[0].uri }
    return { id: workspace.id }
}

export class WorkspaceBasedVariableResolver implements VariableResolver {
    constructor(private readonly _workspaceService: IWorkspaceContextService | undefined) { }

    resolve(variable: Variable): string | undefined {
        if (!this._workspaceService) return undefined

        const workspaceIdentifier = toWorkspaceIdentifier(this._workspaceService.getWorkspace())
        if (!('uri' in workspaceIdentifier) && !('configPath' in workspaceIdentifier)) return undefined

        if (variable.name === 'WORKSPACE_NAME') return this._resolveWorkspaceName(workspaceIdentifier)
        if (variable.name === 'WORKSPACE_FOLDER') return this._resolveWorkspacePath(workspaceIdentifier)
        return undefined
    }

    private _resolveWorkspaceName(id: WorkspaceIdentifier): string | undefined {
        if ('uri' in id) return basename(id.uri.path)
        if (!('configPath' in id)) return undefined

        let filename = basename(id.configPath.path)
        if (filename.endsWith(WORKSPACE_EXTENSION)) filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1)
        return filename
    }

    private _resolveWorkspacePath(id: WorkspaceIdentifier): string | undefined {
        if ('uri' in id) return normalizeDriveLetter(id.uri.fsPath)
        if (!('configPath' in id)) return undefined

        const filename = basename(id.configPath.path)
        let folderpath = id.configPath.fsPath
        if (folderpath.endsWith(filename)) folderpath = folderpath.substr(0, folderpath.length - filename.length - 1)
        return folderpath ? normalizeDriveLetter(folderpath) : '/'
    }
}

export class RandomBasedVariableResolver implements VariableResolver {
    resolve(variable: Variable): string | undefined {
        const { name } = variable

        if (name === 'RANDOM') return Math.random().toString().slice(-6)
        if (name === 'RANDOM_HEX') return Math.random().toString(16).slice(-6)
        if (name === 'UUID') return uuid()
        return undefined
    }
}
