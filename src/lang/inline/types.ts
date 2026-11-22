// 行内补全的公开协议(Monaco languages.InlineCompletionsProvider 一族)。
import type { IRange } from '../../api/position'
import type { UriComponents } from '../../api/uri'
import type { Range } from '../../api/position'
import type { CancellationToken } from '../async'
import type { IDisposable } from '../providers'

export enum InlineCompletionTriggerKind {
    /** 打字时自动触发 */
    Automatic = 0,
    /** 用户显式触发(可以返回多项供循环切换) */
    Explicit = 1,
}
export enum PartialAcceptTriggerKind { Word = 0, Line = 1, Suggest = 2 }
export enum InlineCompletionEndOfLifeReasonKind { Accepted = 0, Rejected = 1, Ignored = 2 }
export enum InlineCompletionHintStyle { Code = 1, Label = 2 }

export interface Command { id: string, title: string, tooltip?: string, arguments?: unknown[] }
export interface ThemeColor { id: string }
export interface ThemeIcon { readonly id: string, readonly color?: ThemeColor }
/** Monaco:列表级命令 = { command, icon } */
export type InlineCompletionCommand = { command: Command, icon?: ThemeIcon }
export interface InlineCompletionWarning { message: string | { value: string }, icon?: ThemeIcon }
export interface InlineCompletionHint { range: IRange, style: InlineCompletionHintStyle, content: string, jumpToEdit: boolean }
export interface PartialAcceptInfo { kind: PartialAcceptTriggerKind, acceptedLength: number }
export type InlineCompletionsDisposeReason = { kind: 'lostRace' | 'tokenCancellation' | 'other' | 'empty' | 'notTaken' }
export type InlineCompletionEndOfLifeReason<T = InlineCompletion> =
    | { kind: InlineCompletionEndOfLifeReasonKind.Accepted }
    | { kind: InlineCompletionEndOfLifeReasonKind.Rejected }
    | { kind: InlineCompletionEndOfLifeReasonKind.Ignored, supersededBy?: T, userTypingDisagreed: boolean }

export interface ProviderId { toString(): string, readonly extensionId?: string }

/** 补全小部件里当前选中项(行内补全据此做「建议预览」+ 联动) */
export class SelectedSuggestionInfo {
    constructor(readonly range: IRange, readonly text: string, readonly completionKind: number, readonly isSnippetText: boolean) { }
    equals(other: SelectedSuggestionInfo): boolean {
        const a = this.range, b = other.range
        return a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn
            && this.text === other.text && this.completionKind === other.completionKind && this.isSnippetText === other.isSnippetText
    }
}

export interface InlineCompletionContext {
    readonly triggerKind: InlineCompletionTriggerKind
    readonly selectedSuggestionInfo: SelectedSuggestionInfo | undefined
    readonly includeInlineEdits: boolean
    readonly includeInlineCompletions: boolean
    readonly requestIssuedDateTime: number
    readonly earliestShownDateTime: number
}
/** 内部:lite-monaco 给每次请求附一个 uuid(Monaco 公开的 InlineCompletionContext 里没有这个字段) */
export interface InlineCompletionContextWithUuid extends InlineCompletionContext { readonly requestUuid: string }
export type InlineCompletionContextWithoutUuid = InlineCompletionContext

export interface InlineCompletion {
    /** 要插入的文本;`{ snippet }` 按片段语法解析(含 tabstop) */
    readonly insertText: string | { snippet: string } | undefined
    /** 被替换的范围;缺省 = 光标所在词起到行尾 */
    readonly range?: IRange
    readonly command?: Command
    readonly shownCommand?: Command
    additionalTextEdits?: { range: IRange, text: string | null }[]
    readonly isInlineEdit?: boolean
    readonly showInlineEditMenu?: boolean
    readonly completeBracketPairs?: boolean
    readonly hint?: InlineCompletionHint
    readonly warning?: InlineCompletionWarning
    readonly gutterMenuLinkAction?: Command
    readonly correlationId?: string
    readonly uri?: UriComponents
}
export interface InlineCompletions<T extends InlineCompletion = InlineCompletion> {
    readonly items: readonly T[]
    readonly commands?: InlineCompletionCommand[]
    /** 有可见的行内建议时压住补全小部件 */
    readonly suppressSuggestions?: boolean
    /** 提供方保证:用户按建议打字时,建议不变(前向稳定) */
    readonly enableForwardStability?: boolean
}

/** 提供方拿到的 model(ITextModel 的子集) */
export interface InlineModel {
    readonly uri: { readonly scheme: string, readonly fsPath: string, toString(): string }
    getLanguageId(): string
    getValue(eol?: number): string
    getValueInRange(range: IRange, eol?: number): string
    getLineContent(lineNumber: number): string
    getLineLength(lineNumber: number): number
    getLineCount(): number
    getLineMaxColumn(lineNumber: number): number
    getLineIndentColumn?(lineNumber: number): number
    getEOL(): string
    getVersionId(): number
    getAlternativeVersionId(): number
    getFullModelRange(): Range
    getOffsetAt(p: { lineNumber: number, column: number }): number
    getPositionAt(offset: number): { lineNumber: number, column: number }
    getWordAtPosition(p: { lineNumber: number, column: number }): { word: string, startColumn: number, endColumn: number } | null
    getOptions(): { tabSize: number }
}

export interface InlineCompletionsProvider<T extends InlineCompletions = InlineCompletions> {
    readonly providerId?: ProviderId
    readonly groupId?: string
    /** 这些组里的 provider 只要给出了可见的行内补全,本 provider 就不被问 */
    readonly yieldsToGroupIds?: readonly string[]
    readonly excludesGroupIds?: readonly string[]
    /** 请求去抖毫秒;多个 provider 取最大 */
    readonly debounceDelayMs?: number
    readonly onDidChangeInlineCompletions?: (listener: () => unknown) => IDisposable
    provideInlineCompletions(model: any, position: any, context: InlineCompletionContext, token: CancellationToken): T | null | undefined | PromiseLike<T | null | undefined>
    /** 某一项第一次被显示出来 */
    handleItemDidShow?(completions: T, item: T['items'][number], updatedInsertText: string, editDeltaInfo?: unknown): void
    handlePartialAccept?(completions: T, item: T['items'][number], acceptedCharacters: number, info: PartialAcceptInfo): void
    handleRejection?(completions: T, item: T['items'][number]): void
    handleEndOfLifetime?(completions: T, item: T['items'][number], reason: InlineCompletionEndOfLifeReason, summary: unknown): void
    /** 一次结果不再被任何人持有时(引用计数归零)调用 */
    disposeInlineCompletions(completions: T, reason: InlineCompletionsDisposeReason): void
}

export type InlineSuggestRequestInfo = {
    startTime: number
    editorType: string
    languageId: string
    reason: string
    typingInterval: number
    typingIntervalCharacterCount: number
    availableProviders: ProviderId[]
}
