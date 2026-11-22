// ITextModel:薄视图(Monaco `editor.ITextModel` 的方法集)。
//
// lite-monaco 没有独立的文本数据结构:state.doc 就是 model。TextModel 有两种后端:
//   - 附着(attached):背后是一个 EditorView,所有读写落到 view.state / view.dispatch,事件由 view.onTransaction 派生;
//   - 脱机(detached):自己握一份 EditorState 快照(createModel 创建、setModel 换下来的),读写落在这份快照上。
// 切换时 H1 的 setModel 调 `model.getState()` 取快照重建视图,再 `_attach(view, host)`;换下来的 `_detach()` 把视图 state 收回成快照。
//
// 与 Monaco 的对应:
//   - 偏移 / 位置:state.doc 里一个换行占 1 个字符;model 的 EOL 是 \r\n 时偏移要补上(getOffsetAt / getPositionAt / getValueLength)。
//   - EOL:state 的 lineSeparator facet(`eolSlot` 槽,lite-monaco 的 state 从创建起就带);setEOL 重配这个槽,doc 里没有字符变化。
//     pushEOL 经 history 的 invertedEffects 进撤销栈,一步;setEOL 不进栈(同 Monaco:TextModel.setEOL 不入撤销栈,pushEOL 才入)。
//   - versionId:每次内容(含 EOL)变化 +1;alternativeVersionId:撤销回到某个历史点时回到当时的值(按撤销栈深度记),setValue 清栈重置。
//   - applyEdits / pushEditOperations:移植 PieceTreeTextBuffer.applyEdits —— 校验范围、归一换行、升序排序、重叠抛错、
//     computeUndoEdits 反向操作(含 _getInverseEditRanges)、事件里的 changes 降序。
//   - 不做:装饰集(deltaDecorations 等)由 H2 的 decorations.ts 经 `setDecorationsProvider` 接上;token 相关(getLineTokens、tokenization)不在 ITextModel 范围。

import { Position, Range, Selection, type IPosition, type IRange } from './position'
import { Emitter, type EditorHost } from './context'
import { Uri } from './uri'
import * as core from '../core/index'
import { flushSearch } from '../core/feature/search'
import { apiEdit, clearHistory, forceMoveMarkers, invertedEffects, redo as historyRedo, redoDepth, undo as historyUndo, undoDepth, undoStop } from '../core/edit/history'
import { mapSelectionByMarkers } from '../core/edit/tracked'
import { indentConfig, indentSizeFacet, indentSizeFollowsTabSize } from '../core/edit/enter'
import { guessIndentation } from '../core/edit/indent'
import { createGuides, type IGuidesTextModelPart } from './guides'
import { TokenizationPart, type ITokenizationTextModelPart, type ITokensChangedEvent } from './tokenization'
import { createBracketPairs, type IBracketPairsTextModelPart } from './bracketpairs'
import { indentOptions, setIndentOptions } from '../core/edit/commands'
import { wordClassifier } from '../core/edit/words'
import {
    FindMatch, SearchParams, TextModelSearch, getWordAtText, type IWordAtPosition,
} from './modelsearch'
import { _setModelLanguageHost, getWordDefinition, guessLanguageId, isRegisteredLanguage, onDidChangeLanguageConfiguration } from './languages'
import { editSourceOf } from './editsource'
import { getLanguageService } from './languagesregistry'
import type { IDisposable, IEvent, IModelContentChange, IModelContentChangedEvent, IModelOptionsChangedEvent } from './types'
import type { EditorView, EditorState, Transaction, TransactionSpec } from '../core/index'
import type { IModelDecoration, IModelDecorationOptions, IModelDeltaDecoration } from './decorations'

export { Uri } from './uri'
export { FindMatch } from './modelsearch'
export type { IWordAtPosition } from './modelsearch'

// ───────────── 枚举(数值同 Monaco) ─────────────

export enum EndOfLinePreference { TextDefined = 0, LF = 1, CRLF = 2 }
export enum EndOfLineSequence { LF = 0, CRLF = 1 }
export enum DefaultEndOfLine { LF = 1, CRLF = 2 }

// ───────────── 类型 ─────────────

export interface IIdentifiedSingleEditOperation {
    range: IRange
    text: string | null
    forceMoveMarkers?: boolean
    /** 识别用,applyEdits(…, true) 返回的反向操作里原样带回 */
    identifier?: { major: number, minor: number } | null
    isAutoWhitespaceEdit?: boolean
    _isTracked?: boolean
}

export interface IValidEditOperation {
    identifier?: { major: number, minor: number } | null
    range: Range
    text: string
    textChange?: { oldPosition: number, oldText: string, newPosition: number, newText: string }
}

export type ICursorStateComputer = (inverseEditOperations: IValidEditOperation[]) => Selection[] | null

export interface ITextSnapshot { read(): string | null }

import type { IBracketPairColorizationOptions } from '../core/options/types'
export type { IBracketPairColorizationOptions }
/** 解析后的(两个字段都有值) */
type ResolvedBracketOptions = Required<IBracketPairColorizationOptions>

export interface ITextModelUpdateOptions {
    tabSize?: number
    indentSize?: number | 'tabSize'
    insertSpaces?: boolean
    trimAutoWhitespace?: boolean
    bracketColorizationOptions?: ResolvedBracketOptions
}

/** Monaco TextModelResolvedOptions 的公开形状(d.ts 声明的成员);ITextModel.getOptions 按它声明,用户的 Monaco 模型才能互换 */
export interface ITextModelResolvedOptions {
    readonly _textModelResolvedOptionsBrand: void
    readonly tabSize: number
    readonly indentSize: number
    readonly insertSpaces: boolean
    readonly defaultEOL: DefaultEndOfLine
    readonly trimAutoWhitespace: boolean
    readonly bracketPairColorizationOptions: ResolvedBracketOptions
    readonly originalIndentSize: number | 'tabSize'
}

/** Monaco TextModelResolvedOptions */
export class TextModelResolvedOptions implements ITextModelResolvedOptions {
    readonly _textModelResolvedOptionsBrand = undefined
    readonly tabSize: number
    readonly indentSize: number
    readonly insertSpaces: boolean
    readonly defaultEOL: DefaultEndOfLine
    readonly trimAutoWhitespace: boolean
    readonly bracketPairColorizationOptions: ResolvedBracketOptions
    private readonly _indentSizeIsTabSize: boolean
    get originalIndentSize(): number | 'tabSize' { return this._indentSizeIsTabSize ? 'tabSize' : this.indentSize }
    constructor(src: {
        tabSize: number, indentSize: number | 'tabSize', insertSpaces: boolean, defaultEOL: DefaultEndOfLine,
        trimAutoWhitespace: boolean, bracketPairColorizationOptions: ResolvedBracketOptions,
    }) {
        this.tabSize = Math.max(1, src.tabSize | 0)
        if (src.indentSize === 'tabSize') { this.indentSize = this.tabSize; this._indentSizeIsTabSize = true } else { this.indentSize = Math.max(1, src.indentSize | 0); this._indentSizeIsTabSize = false }
        this.insertSpaces = Boolean(src.insertSpaces)
        this.defaultEOL = src.defaultEOL | 0
        this.trimAutoWhitespace = Boolean(src.trimAutoWhitespace)
        this.bracketPairColorizationOptions = src.bracketPairColorizationOptions
    }
    equals(other: TextModelResolvedOptions): boolean {
        return this.tabSize === other.tabSize && this._indentSizeIsTabSize === other._indentSizeIsTabSize && this.indentSize === other.indentSize
            && this.insertSpaces === other.insertSpaces && this.defaultEOL === other.defaultEOL && this.trimAutoWhitespace === other.trimAutoWhitespace
            && this.bracketPairColorizationOptions.enabled === other.bracketPairColorizationOptions.enabled
            && this.bracketPairColorizationOptions.independentColorPoolPerBracketType === other.bracketPairColorizationOptions.independentColorPoolPerBracketType
    }
    createChangeEvent(newOpts: TextModelResolvedOptions): IModelOptionsChangedEvent {
        return {
            tabSize: this.tabSize !== newOpts.tabSize,
            indentSize: this.indentSize !== newOpts.indentSize,
            insertSpaces: this.insertSpaces !== newOpts.insertSpaces,
            trimAutoWhitespace: this.trimAutoWhitespace !== newOpts.trimAutoWhitespace,
        }
    }
}

export interface IModelLanguageChangedEvent {
    readonly oldLanguage: string
    readonly newLanguage: string
    readonly source: string
}
export interface IModelLanguageConfigurationChangedEvent { readonly languageId?: string }
export interface IModelDecorationsChangedEvent {
    readonly affectsMinimap: boolean
    readonly affectsOverviewRuler: boolean
    readonly affectsGlyphMargin: boolean
    readonly affectsLineNumber: boolean
}

/** H2 的装饰实现挂在 model 上;ITextModel 的装饰方法原样转发给它(没挂时返回空) */
export interface IModelDecorationsProvider {
    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId?: number): string[]
    getDecorationOptions(id: string): IModelDecorationOptions | null
    getDecorationRange(id: string): Range | null
    getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getDecorationsInRange(range: IRange, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean, onlyMinimapDecorations?: boolean, onlyMarginDecorations?: boolean): IModelDecoration[]
    getAllDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getAllMarginDecorations(ownerId?: number): IModelDecoration[]
    getOverviewRulerDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getInjectedTextDecorations(ownerId?: number): IModelDecoration[]
    getCustomLineHeightsDecorations(ownerId?: number): IModelDecoration[]
    removeAllDecorationsWithOwnerId?(ownerId: number): void
    /** 原位改一条装饰的范围 / 选项,id 不变(changeDecorations 的 accessor 用) */
    redefine?(id: string, range: IRange | undefined, options: IModelDecorationOptions | undefined): void
    readonly onDidChangeDecorations?: IEvent<IModelDecorationsChangedEvent>
}

/** 脱机 model 自带的装饰表(没挂视图的 model 也能 deltaDecorations;Monaco 的独立 TextModel 自带装饰树)。decorations.ts 登记工厂 */
export type DetachedDecorations = IModelDecorationsProvider & { mapTransaction(tr: Transaction): void }
let detachedDecorationsFactory: ((getDoc: () => EditorState['doc']) => DetachedDecorations) | null = null
export function _setDetachedDecorationsFactory(f: (getDoc: () => EditorState['doc']) => DetachedDecorations): void { detachedDecorationsFactory = f }

/** model.changeDecorations 回调拿到的 accessor(同 Monaco IModelDecorationsChangeAccessor) */
export interface IModelDecorationsChangeAccessor {
    addDecoration(range: IRange, options: IModelDecorationOptions): string
    changeDecoration(id: string, newRange: IRange): void
    changeDecorationOptions(id: string, newOptions: IModelDecorationOptions): void
    removeDecoration(id: string): void
    deltaDecorations(oldDecorations: readonly string[], newDecorations: readonly IModelDeltaDecoration[]): string[]
}

/** ITextModel(Monaco editor.ITextModel 的方法集;不含 token / bracket-pair 内部接口) */
/**
 * lite-monaco 的 model 里 Monaco 运行时有、但 monaco.d.ts 的公开 ITextModel 没声明的成员。
 * 公开接口 ITextModel 必须只含 d.ts 有的成员,否则用户手里的 Monaco ITextModel 传不进来。
 */
export interface ITextModelExtras {
    /** 文本里可能含有 RTL / 非基本 ASCII / 行分隔符 LS PS(Monaco 的粘性标志:编辑只会把它们置真,setValue 重算) */
    mightContainRTL(): boolean
    mightContainNonBasicASCII(): boolean
    mightContainUnusualLineTerminators(): boolean
    getLanguageIdAtPosition(lineNumber: number, column: number): string
    setLanguage(languageId: string, source?: string): void
    /** Monaco onDidChangeTokens:分词 / 语义着色变了的行区间 */
    readonly onDidChangeTokens: IEvent<ITokensChangedEvent>
    changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T, ownerId?: number): T | null
}

export interface ITextModel extends ITextModelExtras {
    readonly uri: Uri
    readonly id: string
    getOptions(): ITextModelResolvedOptions
    getVersionId(): number
    getAlternativeVersionId(): number
    setValue(newValue: string | ITextSnapshot): void
    getValue(eol?: EndOfLinePreference, preserveBOM?: boolean): string
    createSnapshot(preserveBOM?: boolean): ITextSnapshot
    getValueLength(eol?: EndOfLinePreference, preserveBOM?: boolean): number
    getValueInRange(range: IRange, eol?: EndOfLinePreference): string
    getValueLengthInRange(range: IRange, eol?: EndOfLinePreference): number
    getCharacterCountInRange(range: IRange, eol?: EndOfLinePreference): number
    getLineCount(): number
    getLineContent(lineNumber: number): string
    getLineLength(lineNumber: number): number
    getLinesContent(): string[]
    getEOL(): string
    getEndOfLineSequence(): EndOfLineSequence
    getLineMinColumn(lineNumber: number): number
    getLineMaxColumn(lineNumber: number): number
    getLineFirstNonWhitespaceColumn(lineNumber: number): number
    getLineLastNonWhitespaceColumn(lineNumber: number): number
    validatePosition(position: IPosition): Position
    modifyPosition(position: IPosition, offset: number): Position
    validateRange(range: IRange): Range
    isValidRange(range: IRange): boolean
    isAttachedToEditor(): boolean
    getOffsetAt(position: IPosition): number
    getPositionAt(offset: number): Position
    getFullModelRange(): Range
    isDisposed(): boolean
    findMatches(searchString: string, searchOnlyEditableRange: boolean, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean, limitResultCount?: number): FindMatch[]
    findMatches(searchString: string, searchScope: IRange | IRange[], isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean, limitResultCount?: number): FindMatch[]
    findNextMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean): FindMatch | null
    findPreviousMatch(searchString: string, searchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean): FindMatch | null
    getLanguageId(): string
    getWordAtPosition(position: IPosition): IWordAtPosition | null
    getWordUntilPosition(position: IPosition): IWordAtPosition
    normalizeIndentation(str: string): string
    updateOptions(newOpts: ITextModelUpdateOptions): void
    undo(): void | Promise<void>
    redo(): void | Promise<void>
    canUndo(): boolean
    canRedo(): boolean
    detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void
    pushStackElement(): void
    popStackElement(): void
    pushEOL(eol: EndOfLineSequence): void
    pushEditOperations(beforeCursorState: Selection[] | null, editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): Selection[] | null
    pushEditOperations(beforeCursorState: Selection[] | null, editOperations: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer, group?: unknown): Selection[] | null
    applyEdits(operations: IIdentifiedSingleEditOperation[]): void
    applyEdits(operations: IIdentifiedSingleEditOperation[], computeUndoEdits: false): void
    applyEdits(operations: IIdentifiedSingleEditOperation[], computeUndoEdits: true): IValidEditOperation[]
    setEOL(eol: EndOfLineSequence): void
    dispose(): void
    readonly onDidChangeContent: IEvent<IModelContentChangedEvent>
    readonly onDidChangeDecorations: IEvent<IModelDecorationsChangedEvent>
    readonly onDidChangeOptions: IEvent<IModelOptionsChangedEvent>
    readonly onDidChangeLanguage: IEvent<IModelLanguageChangedEvent>
    readonly onDidChangeLanguageConfiguration: IEvent<IModelLanguageConfigurationChangedEvent>
    readonly onWillDispose: IEvent<void>
    readonly onDidChangeAttached: IEvent<void>
    getLineDecorations(lineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getLinesDecorations(startLineNumber: number, endLineNumber: number, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getDecorationsInRange(range: IRange, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean, onlyMinimapDecorations?: boolean, onlyMarginDecorations?: boolean): IModelDecoration[]
    getAllDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getAllMarginDecorations(ownerId?: number): IModelDecoration[]
    getOverviewRulerDecorations(ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean): IModelDecoration[]
    getInjectedTextDecorations(ownerId?: number): IModelDecoration[]
    getCustomLineHeightsDecorations(ownerId?: number): IModelDecoration[]
    getDecorationOptions(id: string): IModelDecorationOptions | null
    getDecorationRange(id: string): Range | null
    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId?: number): string[]
}

// ───────────── EOL 槽 ─────────────

/** lineSeparator 的运行时槽:lite-monaco 的 state 从创建起带它,setEOL / pushEOL 重配它 */
export const eolSlot = new core.Compartment()
/** 标记 effect:history 的 invertedEffects 靠它认出「这笔事务改了 EOL」并给出反向 effect */
const eolMarker = core.StateEffect.define<{ from: string, to: string }>()

/** EOL 扩展:槽(带当前 EOL)+ 撤销钩子。lite-monaco 的 stateFor 和脱机 model 的 state 都装它 */
export function eolExtension(eol: string = '\n'): core.Extension {
    return [
        eolSlot.of(core.EditorState.lineSeparator.of(eol)),
        invertedEffects.of(tr => {
            const out: core.StateEffect<unknown>[] = []
            for (const e of tr.effects) {
                if (e.is(eolMarker)) {
                    out.push(eolSlot.reconfigure(core.EditorState.lineSeparator.of(e.value.from)) as core.StateEffect<unknown>)
                    out.push(eolMarker.of({ from: e.value.to, to: e.value.from }) as core.StateEffect<unknown>)
                }
            }
            return out
        }),
    ]
}

export function hasEolSlot(state: EditorState): boolean {
    return state.config.compartments.has(eolSlot)
}

/**
 * 文本里的 EOL 判定(PieceTree _getEOL):没有换行 → 默认;含 \r 的换行超过一半 → CRLF,否则 LF。
 * 与 liteMonaco() 的 stateFor 不同(它看首个换行),createModel 走 Monaco 的规则。
 */
export function detectEOL(text: string, defaultEOL: string = '\n'): string {
    // 没有 \r(最常见)不用逐字符数:indexOf 是原生扫描,大文本快一个数量级
    if (text.indexOf('\r') < 0) return text.indexOf('\n') < 0 ? defaultEOL : '\n'
    let cr = 0, lf = 0, crlf = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) { crlf++; i++ } else cr++
        } else if (c === 10) lf++
    }
    const total = cr + lf + crlf
    if (total === 0) return defaultEOL
    return cr + crlf > total / 2 ? '\r\n' : '\n'
}

// ───────────── 工具 ─────────────

const isHighSurrogate = (c: number) => c >= 0xD800 && c <= 0xDBFF
const firstNonWs = (s: string): number => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c !== 32 && c !== 9) return i } return -1 }
const lastNonWs = (s: string): number => { for (let i = s.length - 1; i >= 0; i--) { const c = s.charCodeAt(i); if (c !== 32 && c !== 9) return i } return -1 }

/** Monaco normalizeIndentation(common/core/indentation.ts) */
export function normalizeIndentationString(str: string, indentSize: number, insertSpaces: boolean): string {
    let n = firstNonWs(str)
    if (n === -1) n = str.length
    const ws = str.substring(0, n)
    let spaces = 0
    for (let i = 0; i < ws.length; i++) spaces = ws.charAt(i) === '\t' ? spaces + indentSize - (spaces % indentSize) : spaces + 1
    let result = ''
    if (!insertSpaces) {
        const tabs = Math.floor(spaces / indentSize)
        spaces = spaces % indentSize
        for (let i = 0; i < tabs; i++) result += '\t'
    }
    for (let i = 0; i < spaces; i++) result += ' '
    return result + str.substring(n)
}

/** 模型挂上 / 摘下视图时的回调(markers.ts 据此把 marker 同步进视图) */
export const modelAttachHooks = new Set<(model: TextModel, attached: boolean) => void>()

let modelIdCounter = 0
let implicitCounter = 0
const MODELS = new Map<string, TextModel>()

const emitModelLanguage = new Emitter<{ readonly model: ITextModel, readonly oldLanguage: string }>()
/** editor.onDidChangeModelLanguage */
export const onDidChangeModelLanguage = emitModelLanguage.event

// 全局 model 生命周期事件。语义:凡进了注册表(getModels() 看得见)的 model 都算——createModel 建的,
// 和编辑器隐式建的(view.getModel() 第一次调用)一视同仁;Monaco 里 editor.create({ value }) 也会让 onDidCreateModel 触发。
const emitCreateModel = new Emitter<ITextModel>()
const emitWillDisposeModel = new Emitter<ITextModel>()
/** editor.onDidCreateModel:model 刚进注册表时触发(createModel / 编辑器隐式创建) */
export const onDidCreateModel = emitCreateModel.event
/** editor.onWillDisposeModel:model 销毁前触发(此时还能读内容、仍在 getModels() 里) */
export const onWillDisposeModel = emitWillDisposeModel.event

// ───────────── TextModel ─────────────

interface PendingChange { changes: IModelContentChange[] }

/** 标在「别的视图改动搬过来」的事务上:值是来源视图(不再回传给它)。这类事务不进撤销历史。 */
const mirrorSync = core.Annotation.define<core.EditorView>()

interface Mirror { host: EditorHost | null, off: () => void, offDestroy: () => void }

// Monaco strings.containsRTL("R"/"AL" 类字符;由 unicode-utils 生成,逐字照抄)
const CONTAINS_RTL = /(?:[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u0710\u0712-\u072F\u074D-\u07A5\u07B1-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDC7\uFDF0-\uFDFC\uFE70-\uFEFC]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE35\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDD23\uDE80-\uDEA9\uDEAD-\uDF45\uDF51-\uDF81\uDF86-\uDFF6]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD4B-\uDFFF]|\uD83B[\uDC00-\uDEBB])/
const UNUSUAL_LINE_TERMINATORS = /[\u2028\u2029]/
const BASIC_ASCII = /^[\t\n\r\x20-\x7E]*$/
function scanContentFlags(text: string) {
    return { rtl: CONTAINS_RTL.test(text), nonAscii: !BASIC_ASCII.test(text), ult: UNUSUAL_LINE_TERMINATORS.test(text) }
}

export class TextModel implements ITextModel, ITextModelExtras {
    readonly uri: Uri
    readonly id: string
    // 脱机时的快照;附着到视图后为 null(以视图的 state 为准),否则附着前那份旧文档(大文件几十 MB)会一直被它拽着
    private _state: EditorState | null
    private _view: EditorView | null = null
    private _host: EditorHost | null = null
    private _unsub: (() => void) | null = null
    private _offDestroy: (() => void) | null = null
    /** 同一个 model 被多个编辑器用时,除 `_view`(主视图,model 的读写都走它)外的其余视图:改动互相搬运 */
    private readonly _mirrors = new Map<EditorView, Mirror>()
    private _languageId: string
    private _versionId = 1
    private _altVersionId = 1
    private _altByDepth: number[] = [1]
    private _disposed = false
    private _bom = ''
    private _pending: PendingChange | null = null
    private _flushing = false
    private _trimAutoWhitespace = true
    private _bracketOpts: ResolvedBracketOptions = { enabled: true, independentColorPoolPerBracketType: false }
    private _defaultEOL: DefaultEndOfLine = DefaultEndOfLine.LF
    private _optionsSnapshot: TextModelResolvedOptions | null = null
    private _decorations: IModelDecorationsProvider | null = null
    private _decoSub: IDisposable | null = null
    /** 脱机时自带的装饰表(挂上视图就丢:附着后装饰归视图的装饰集) */
    private _ownDeco: DetachedDecorations | null = null
    private _ownDecoSub: IDisposable | null = null
    private _implicit = false
    /**
     * 内容特征标志(Monaco 语义:建模/setValue 时按全文算一次,之后编辑只会把它们置真)。
     * 文档是不可变 rope,所以只持有「基准文档」的引用(共享结构、零拷贝),真被查询时才扫一遍;
     * 编辑只扫插入的那段,存进 `_editFlags`。编辑路径因此与文档大小无关。
     */
    private _flagsBase: { toString(): string } | null = null
    private _editFlags = { rtl: false, nonAscii: false, ult: false }
    private _scanned: { rtl: boolean, nonAscii: boolean, ult: boolean } | null = null
    private _contentFlags() {
        this._scanned ??= scanContentFlags((this._flagsBase ?? this.s.doc).toString())
        const e = this._editFlags, b = this._scanned
        return { rtl: b.rtl || e.rtl, nonAscii: b.nonAscii || e.nonAscii, ult: b.ult || e.ult }
    }

    private readonly _onContent = new Emitter<IModelContentChangedEvent>()
    /** 编辑器级 onDidChangeModelContent 用:同一份内容事件,但在光标已跟上之后才发(Monaco 的编辑器事件是整笔光标编辑结束后批量派发,model.onDidChangeContent 才是编辑中途的) */
    private readonly _onContentSettled = new Emitter<IModelContentChangedEvent>()
    private readonly _onDeco = new Emitter<IModelDecorationsChangedEvent>()
    private readonly _onOptions = new Emitter<IModelOptionsChangedEvent>()
    private readonly _onLanguage = new Emitter<IModelLanguageChangedEvent>()
    private readonly _onLangConfig = new Emitter<IModelLanguageConfigurationChangedEvent>()
    private readonly _onWillDispose = new Emitter<void>()
    private readonly _onAttached = new Emitter<void>()
    /** Monaco onDidChangeAttached:有没有编辑器挂着这个 model 变了(0↔1) */
    readonly onDidChangeAttached = this._onAttached.event
    get onDidChangeTokens(): IEvent<ITokensChangedEvent> { return this._tok.onDidChangeTokens }
    readonly onDidChangeContent = this._onContent.event
    readonly onDidChangeContentSettled = this._onContentSettled.event
    readonly onDidChangeDecorations = this._onDeco.event
    readonly onDidChangeOptions = this._onOptions.event
    readonly onDidChangeLanguage = this._onLanguage.event
    readonly onDidChangeLanguageConfiguration = this._onLangConfig.event
    readonly onWillDispose = this._onWillDispose.event
    private _langCfgSub: IDisposable
    private readonly _tok: TokenizationPart
    private _manualAttach = 0
    private _swapping = false

    /** @internal createModel / 视图隐式 model 用 */
    constructor(state: EditorState, languageId: string, uri: Uri, bom = '', implicit = false) {
        this._state = state
        this._languageId = languageId
        this.uri = uri
        this.id = `$model${++modelIdCounter}`
        this._bom = bom
        this._implicit = implicit
        this._langCfgSub = onDidChangeLanguageConfiguration(e => {
            if (e.languageId === this._languageId) this._onLangConfig.fire({ languageId: e.languageId })
        })
        this._optionsSnapshot = this._readOptions()
        this._tok = new TokenizationPart(this)
        // Monaco TextModel 构造:这个语言第一次被 model 用上(onLanguage 的触发点,也是懒分词器的创建点)
        getLanguageService().requestRichLanguageFeatures(languageId)
        MODELS.set(uri.toString(), this)
        emitCreateModel.fire(this)
    }

    // ── 后端 ──

    private get s(): EditorState { return this._view ? this._view.state : this._state! }
    private get doc() { return this.s.doc }
    private get eol(): string { return this.s.lineBreak }
    private assertNotDisposed(): void { if (this._disposed) throw new Error('Model is disposed!') }

    /** 当前 state 快照(附着时就是视图的 state)。H1 的 setModel 用它重建视图 */
    getState(): EditorState { return this.s }
    /** @internal 脱机时换快照(H1 的 setModel 在视图上改过之后不需要;测试 / 工具用) */
    _setDetachedState(state: EditorState): void { if (!this._view) this._state = state }

    get attachedView(): EditorView | null { return this._view }

    /** H1 的 setModel 把视图换成本 model 的 state 之后调用 */
    _attach(view: EditorView, host: EditorHost | null): void {
        if (this._view === view) return
        const wasAttached = this.isAttachedToEditor()
        this._swapping = true
        this._detach()
        this._swapping = false
        this._view = view
        this._state = null
        this._host = host
        this._dropOwnDeco()
        this._unsub = view.onTransaction(tr => this._onTransaction(tr))
        this._offDestroy = view.onDestroy(() => this._viewDestroyed(view))
        const lang = host?.getLanguageId()
        if (host && lang !== this._languageId) host.reassemble({ lang: this._languageId })
        // trimAutoWhitespace 是模型选项:模型在附着前设的(createModel 后 updateOptions)也要带到视图上
        if (host) {
            const cur = host.getUserOptions() as Record<string, unknown>
            if ((cur.trimAutoWhitespace ?? true) !== this._trimAutoWhitespace) host.setUserOptions({ ...cur, trimAutoWhitespace: this._trimAutoWhitespace } as never, { trimAutoWhitespace: this._trimAutoWhitespace } as never)
        }
        for (const h of [...modelAttachHooks]) h(this, true)
        this._tok.handleAttachedChanged()
        if (!wasAttached) this._onAttached.fire()
        this._syncOptionsEvent()
    }

    /** 从视图上换下来:收回快照 */
    _detach(): void {
        if (!this._view) return
        for (const h of [...modelAttachHooks]) h(this, false)
        this._state = this._view.state
        this._unsub?.()
        this._unsub = null
        this._offDestroy?.()
        this._offDestroy = null
        this._view = null
        this._host = null
        if (!this._swapping && !this.isAttachedToEditor()) this._onAttached.fire()
    }

    /** @internal 视图自己销毁了(隐式 model 一并销毁;createModel 的留着) */
    _viewDestroyed(view?: EditorView): void {
        if (!this._view || (view && this._view !== view)) return
        this._state = this._view.state
        this._unsub?.()
        this._unsub = null
        this._offDestroy?.()
        this._offDestroy = null
        this._view = null
        this._host = null
        if (this._implicit) this.dispose()
        else this._promoteMirror()
    }

    /**
     * @internal 另一个编辑器要用本 model:当前主视图不被收走,降成镜像继续跟着改(Monaco 里同一个 model 可以被多个编辑器同时显示)。
     * 之后新视图 `_attach` 成为主视图;镜像和主视图之间的文档改动互相搬运,光标各自映射。
     */
    _demote(): void {
        const v = this._view
        if (!v) return
        const host = this._host
        this._detach()
        this._addMirror(v, host)
    }

    /** @internal 视图不再用本 model(setModel 换走):主视图 → 收回快照并让位给镜像;镜像 → 摘掉 */
    _release(view: EditorView): void {
        if (this._view === view) { this._detach(); this._promoteMirror() } else this._dropMirror(view)
    }

    private _addMirror(v: EditorView, host: EditorHost | null): void {
        this._dropMirror(v)
        const off = v.onTransaction(tr => this._onMirrorTransaction(v, tr))
        const offDestroy = v.onDestroy(() => this._dropMirror(v))
        this._mirrors.set(v, { host, off, offDestroy })
    }

    private _dropMirror(v: EditorView): void {
        const m = this._mirrors.get(v)
        if (!m) return
        m.off(); m.offDestroy()
        this._mirrors.delete(v)
    }

    /** 主视图没了,镜像里挑一个顶上(model 还要继续被剩下的编辑器显示) */
    private _promoteMirror(): void {
        if (this._view || this._disposed) return
        const next = this._mirrors.keys().next()
        if (next.done) return
        const v = next.value, host = this._mirrors.get(v)!.host
        this._dropMirror(v)
        this._attach(v, host)
    }

    /** 镜像视图自己的改动 → 主视图和其余镜像(不回传给来源) */
    private _onMirrorTransaction(from: EditorView, tr: Transaction): void {
        if (!tr.docChanged || tr.annotation(mirrorSync) !== undefined) return
        this._fanOut(tr, from)
    }

    /** 把 tr 的文档改动搬给除 from 以外的所有视图(主 + 镜像);光标按 Monaco 的粘性映射:空光标跟到插入文本之后 */
    private _fanOut(tr: Transaction, from: EditorView): void {
        const targets = [...(this._view ? [this._view] : []), ...this._mirrors.keys()].filter(v => v !== from)
        for (const v of targets) {
            const st = v.state
            if (st.doc.length !== tr.startState.doc.length) continue // 已经失步,不硬套
            const ranges = st.selection.ranges.map(r => r.empty
                ? core.EditorSelection.cursor(tr.changes.mapPos(r.head, 1))
                : core.EditorSelection.range(tr.changes.mapPos(r.anchor, r.anchor <= r.head ? 1 : -1), tr.changes.mapPos(r.head, r.anchor <= r.head ? -1 : 1)))
            const send = () => v.dispatch(st.update({
                changes: tr.changes,
                selection: core.EditorSelection.create(ranges, st.selection.mainIndex),
                annotations: [mirrorSync.of(from), core.Transaction.addToHistory.of(false)],
            }))
            if (this._deferring) v.deferView(send)
            else send()
        }
    }

    private _dispatch(spec: TransactionSpec, defer = false): Transaction {
        const tr = this.s.update(spec)
        this._applyTr(tr, defer)
        return tr
    }

    /** 正在派发一笔可合并视图的编辑:搬给镜像视图的那笔也合并 */
    private _deferring = false

    // defer:model 的编辑(applyEdits / pushEditOperations / undo / redo)视图更新合并到微任务里一次画,同 trigger
    //(Monaco 的视图也是攒到下一帧才 render);state / 事件仍同步。setValue 之类整体替换照旧同步画
    private _applyTr(tr: Transaction, defer = false): void {
        const v = this._view
        if (v && defer) {
            const was = this._deferring
            this._deferring = true
            try { v.deferView(() => v.dispatch(tr)) } finally { this._deferring = was }
        } else if (v) {
            v.dispatch(tr)
        } else {
            this._state = tr.startState.applyTransaction(tr)
            this._onTransaction(tr)
        }
    }

    /** Monaco ITextModel 内部的 undo / redo(经撤销栈;没东西可撤就什么都不做) */
    undo(): void { historyUndo({ state: this.s, dispatch: tr => this._applyTr(tr, true) }) }
    redo(): void { historyRedo({ state: this.s, dispatch: tr => this._applyTr(tr, true) }) }
    canUndo(): boolean { return undoDepth(this.s) > 0 }
    canRedo(): boolean { return redoDepth(this.s) > 0 }

    // ── 事务 → 事件 ──

    private _onTransaction(tr: Transaction): void {
        if (tr.docChanged && this._mirrors.size && this._view) {
            // 主视图的改动搬给镜像;别的视图搬过来的(mirrorSync)只补没收到的镜像,不回传来源
            this._fanOut(tr, tr.annotation(mirrorSync) ?? this._view)
        }
        if (tr.docChanged) this._ownDeco?.mapTransaction(tr)
        const prev = tr.startState, cur = this.s
        const eolChanged = prev.lineBreak !== cur.lineBreak
        const optsChanged = this._syncOptionsEvent()
        void optsChanged
        if (!tr.docChanged && !eolChanged) { this._flushing = false; return }
        this._versionId++
        // alternativeVersionId:按撤销栈深度记。撤销回到某深度就回到当时的值;新编辑截掉重做分支
        const undoRedo = tr.isUserEvent('undo') || tr.isUserEvent('redo')
        const hasHistory = cur.field(core.historyField, false) !== undefined
        const flush = this._flushing
        this._flushing = false
        if (flush) {
            this._flagsBase = cur.doc; this._scanned = null
            this._editFlags = { rtl: false, nonAscii: false, ult: false }
        } else if (tr.docChanged) {
            this._flagsBase ??= prev.doc // 首次编辑:把编辑前的文档记作基准,扫描留给查询时
            const f = this._editFlags
            tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => {
                if (ins.length && !(f.rtl && f.nonAscii && f.ult)) {
                    const t = scanContentFlags(ins.sliceString(0))
                    f.rtl ||= t.rtl; f.nonAscii ||= t.nonAscii; f.ult ||= t.ult
                }
            })
        }
        if (flush) {
            this._altByDepth = [this._versionId]
            this._altVersionId = this._versionId
        } else if (hasHistory) {
            const depth = undoDepth(cur)
            if (undoRedo && this._altByDepth[depth] !== undefined) {
                this._altVersionId = this._altByDepth[depth]
            } else {
                this._altByDepth.length = depth + 1
                this._altByDepth[depth] = this._versionId
                this._altVersionId = this._versionId
            }
        } else this._altVersionId = this._versionId

        const L = prev.lineBreak.length
        let changes: IModelContentChange[]
        if (this._pending) {
            changes = this._pending.changes
            this._pending = null
        } else if (flush) {
            const lc = prev.doc.lines
            const oldLen = prev.doc.length + (lc - 1) * (L - 1)
            const last = prev.doc.line(lc)
            changes = [{ range: new Range(1, 1, lc, last.length + 1), rangeLength: oldLen, text: cur.sliceDoc(), rangeOffset: 0 }]
        } else if (!tr.docChanged && eolChanged) {
            const lc = cur.doc.lines
            const oldLen = prev.doc.length + (prev.doc.lines - 1) * (prev.lineBreak.length - 1)
            changes = [{ range: new Range(1, 1, lc, cur.doc.line(lc).length + 1), rangeLength: oldLen, text: cur.sliceDoc(), rangeOffset: 0 }]
        } else {
            const out: IModelContentChange[] = []
            const newEol = cur.lineBreak
            tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                const a = prev.doc.lineAt(fromA), b = prev.doc.lineAt(toA)
                const rangeOffset = fromA + (a.number - 1) * (L - 1)
                const rangeLength = (toA - fromA) + (b.number - a.number) * (L - 1)
                out.push({
                    range: new Range(a.number, fromA - a.from + 1, b.number, toA - b.from + 1),
                    rangeLength,
                    text: inserted.sliceString(0, inserted.length, newEol),
                    rangeOffset,
                })
            }, true)
            changes = out.reverse()
        }
        const ev: IModelContentChangedEvent = {
            changes,
            eol: cur.lineBreak,
            versionId: this._versionId,
            isUndoing: tr.isUserEvent('undo'),
            isRedoing: tr.isUserEvent('redo'),
            isFlush: flush,
            isEolChange: eolChanged && !tr.docChanged,
            detailedReasons: [editSourceOf(tr, { flush, eolChange: !tr.docChanged && eolChanged, apiEdit: !!tr.annotation(apiEdit) })],
            detailedReasonsChangeLengths: [changes.length],
        }
        this._tok.handleContent(ev)
        // Monaco:光标命令(打字 / Tab / 删除 / executeEdits)执行编辑时,内容事件先于光标更新,监听器里读到的是旧选区(未映射)。
        // 撤销 / 重做 / setValue / 不带选区的 applyEdits 是光标跟着内容走的,不在此列。
        const view = this._view
        if (view && tr.docChanged && tr.selection && !undoRedo && !flush) {
            // 光标按 (行, 列) 存,不是偏移:同一 (行, 列) 在新文档里重新定位(越界夹到行尾 / 文末)
            const at = (pos: number) => {
                const l = prev.doc.lineAt(pos)
                const n = cur.doc.line(Math.min(l.number, cur.doc.lines))
                return Math.min(n.from + (pos - l.from), n.to)
            }
            const old = core.EditorSelection.create(prev.selection.ranges.map(r => core.EditorSelection.range(at(r.anchor), at(r.head))), prev.selection.mainIndex)
            view.withStaleSelection(old, () => this._onContent.fire(ev))
        } else this._onContent.fire(ev)
        if (view) view.deferEditorEvent(() => this._onContentSettled.fire(ev))
        else this._onContentSettled.fire(ev)
    }

    private _readOptions(): TextModelResolvedOptions {
        const s = this.s
        const cfg = indentConfig(s)
        return new TextModelResolvedOptions({
            tabSize: cfg.tabSize,
            indentSize: indentSizeFollowsTabSize(s) ? 'tabSize' : cfg.indentSize,
            insertSpaces: cfg.insertSpaces,
            defaultEOL: this._defaultEOL,
            trimAutoWhitespace: this._trimAutoWhitespace,
            bracketPairColorizationOptions: this._bracketOpts,
        })
    }

    /** 选项变了就发 onDidChangeOptions(视图侧的 updateOptions、Detect Indentation 命令也经这里被看到) */
    private _syncOptionsEvent(): boolean {
        const next = this._readOptions()
        const prev = this._optionsSnapshot
        this._optionsSnapshot = next
        if (prev && !prev.equals(next)) {
            this._onOptions.fire(prev.createChangeEvent(next))
            return true
        }
        return false
    }

    // ── ITextModel:读 ──

    getOptions(): TextModelResolvedOptions { this.assertNotDisposed(); return this._readOptions() }
    /** @internal ModelService:销毁时留一份撤销栈 + 版本号快照,同资源同内容重建时原样接回 */
    _historySnapshot(): { state: EditorState, versionId: number, altVersionId: number, altByDepth: number[], bom: string } {
        return { state: this.s, versionId: this._versionId, altVersionId: this._altVersionId, altByDepth: this._altByDepth.slice(), bom: this._bom }
    }
    /** @internal 脱机的新 model 接回快照里的撤销栈(光标回到文首:Monaco 的撤销元素里没有选区,新 model 光标在 0) */
    _restoreHistory(snap: { state: EditorState, versionId: number, altVersionId: number, altByDepth: number[] }): void {
        if (this._view) return
        this._state = snap.state.update({ selection: { anchor: 0 }, annotations: [core.Transaction.addToHistory.of(false)] }).apply()
        this._versionId = snap.versionId
        this._altVersionId = snap.altVersionId
        this._altByDepth = snap.altByDepth.slice()
    }
    /** @internal 创建选项里的 defaultEOL(文本没有换行时用它) */
    _setDefaultEOL(eol: DefaultEndOfLine): void {
        this._defaultEOL = eol
        this._optionsSnapshot = this._readOptions()
    }
    getVersionId(): number { this.assertNotDisposed(); return this._versionId }
    getAlternativeVersionId(): number { this.assertNotDisposed(); return this._altVersionId }
    isDisposed(): boolean { return this._disposed }
    mightContainRTL(): boolean { this.assertNotDisposed(); return this._contentFlags().rtl }
    mightContainNonBasicASCII(): boolean { this.assertNotDisposed(); return this._contentFlags().nonAscii }
    mightContainUnusualLineTerminators(): boolean { this.assertNotDisposed(); return this._contentFlags().ult }
    getLanguageId(): string { this.assertNotDisposed(); return this._languageId }
    getEOL(): string { this.assertNotDisposed(); return this.eol }
    getEndOfLineSequence(): EndOfLineSequence { return this.getEOL() === '\n' ? EndOfLineSequence.LF : EndOfLineSequence.CRLF }

    private _eolFor(pref: EndOfLinePreference | undefined): string {
        return pref === EndOfLinePreference.LF ? '\n' : pref === EndOfLinePreference.CRLF ? '\r\n' : this.eol
    }

    getValue(eol?: EndOfLinePreference, preserveBOM = false): string {
        this.assertNotDisposed()
        const text = this.doc.sliceString(0, this.doc.length, this._eolFor(eol))
        return preserveBOM && this._bom ? this._bom + text : text
    }

    createSnapshot(preserveBOM = false): ITextSnapshot {
        this.assertNotDisposed()
        let done = false
        const text = this.getValue(undefined, preserveBOM)
        // Monaco:空缓冲的快照第一次 read 就是 null(没有任何 chunk),不是 ''
        return { read: () => { if (done || text === '') return null; done = true; return text } }
    }

    getValueLength(eol?: EndOfLinePreference, preserveBOM = false): number {
        this.assertNotDisposed()
        const L = this._eolFor(eol).length
        const d = this.doc
        return d.length + (d.lines - 1) * (L - 1) + (preserveBOM ? this._bom.length : 0)
    }

    getLineCount(): number { this.assertNotDisposed(); return this.doc.lines }

    private checkLine(n: number): void {
        if (!(n >= 1 && n <= this.doc.lines)) throw new Error('Illegal value for lineNumber')
    }
    getLineContent(lineNumber: number): string { this.assertNotDisposed(); this.checkLine(lineNumber); return this.doc.lineText(lineNumber) }
    getLineLength(lineNumber: number): number { this.assertNotDisposed(); this.checkLine(lineNumber); return this.doc.lineText(lineNumber).length }
    getLinesContent(): string[] { this.assertNotDisposed(); return this.doc.toJSON() }
    getLineMinColumn(lineNumber: number): number { this.assertNotDisposed(); this.checkLine(lineNumber); return 1 }
    getLineMaxColumn(lineNumber: number): number { this.assertNotDisposed(); this.checkLine(lineNumber); return this.doc.lineText(lineNumber).length + 1 }
    getLineFirstNonWhitespaceColumn(lineNumber: number): number {
        this.assertNotDisposed(); this.checkLine(lineNumber)
        const i = firstNonWs(this.doc.lineText(lineNumber))
        return i === -1 ? 0 : i + 1
    }
    getLineLastNonWhitespaceColumn(lineNumber: number): number {
        this.assertNotDisposed(); this.checkLine(lineNumber)
        const i = lastNonWs(this.doc.lineText(lineNumber))
        return i === -1 ? 0 : i + 2
    }

    // 位置校验:逐行移植 TextModel._validatePosition / validatePosition / validateRange
    private _isValidPosition(lineNumber: number, column: number, surrogate: boolean): boolean {
        if (typeof lineNumber !== 'number' || typeof column !== 'number') return false
        if (isNaN(lineNumber) || isNaN(column)) return false
        if (lineNumber < 1 || column < 1) return false
        if ((lineNumber | 0) !== lineNumber || (column | 0) !== column) return false
        if (lineNumber > this.doc.lines) return false
        if (column === 1) return true
        const line = this.doc.lineText(lineNumber)
        if (column > line.length + 1) return false
        if (surrogate && isHighSurrogate(line.charCodeAt(column - 2))) return false
        return true
    }
    private _validatePosition(_lineNumber: number, _column: number, surrogate: boolean): Position {
        const lineNumber = Math.floor((typeof _lineNumber === 'number' && !isNaN(_lineNumber)) ? _lineNumber : 1)
        const column = Math.floor((typeof _column === 'number' && !isNaN(_column)) ? _column : 1)
        const lineCount = this.doc.lines
        if (lineNumber < 1) return new Position(1, 1)
        if (lineNumber > lineCount) return new Position(lineCount, this.doc.lineText(lineCount).length + 1)
        if (column <= 1) return new Position(lineNumber, 1)
        const line = this.doc.lineText(lineNumber)
        const maxColumn = line.length + 1
        if (column >= maxColumn) return new Position(lineNumber, maxColumn)
        if (surrogate && isHighSurrogate(line.charCodeAt(column - 2))) return new Position(lineNumber, column - 1)
        return new Position(lineNumber, column)
    }
    validatePosition(position: IPosition): Position {
        this.assertNotDisposed()
        if (position instanceof Position && this._isValidPosition(position.lineNumber, position.column, true)) return position
        return this._validatePosition(position.lineNumber, position.column, true)
    }
    private _isValidRange(r: IRange, surrogate: boolean): boolean {
        if (!this._isValidPosition(r.startLineNumber, r.startColumn, false)) return false
        if (!this._isValidPosition(r.endLineNumber, r.endColumn, false)) return false
        if (surrogate) {
            const sl = this.doc.lineText(r.startLineNumber), el = this.doc.lineText(r.endLineNumber)
            const before = r.startColumn > 1 ? sl.charCodeAt(r.startColumn - 2) : 0
            const beforeEnd = r.endColumn > 1 && r.endColumn <= el.length ? el.charCodeAt(r.endColumn - 2) : 0
            return !isHighSurrogate(before) && !isHighSurrogate(beforeEnd)
        }
        return true
    }
    /** Monaco 内部的宽松校验:只夹到文档内(NaN / undefined 当 1),不做代理对修正 */
    _validateRangeRelaxedNoAllocations(range: IRange): Range {
        const s = this._validatePosition(range.startLineNumber, range.startColumn, false)
        const e = this._validatePosition(range.endLineNumber, range.endColumn, false)
        return new Range(s.lineNumber, s.column, e.lineNumber, e.column)
    }
    isValidRange(range: IRange): boolean {
        this.assertNotDisposed()
        return this._isValidRange(range, true)
    }
    validateRange(_range: IRange): Range {
        this.assertNotDisposed()
        if (_range instanceof Range && !(_range instanceof Selection) && this._isValidRange(_range, true)) return _range
        const start = this._validatePosition(_range.startLineNumber, _range.startColumn, false)
        const end = this._validatePosition(_range.endLineNumber, _range.endColumn, false)
        const startLineNumber = start.lineNumber, startColumn = start.column, endLineNumber = end.lineNumber, endColumn = end.column
        const sl = this.doc.lineText(startLineNumber), el = this.doc.lineText(endLineNumber)
        const before = startColumn > 1 ? sl.charCodeAt(startColumn - 2) : 0
        const beforeEnd = endColumn > 1 && endColumn <= el.length ? el.charCodeAt(endColumn - 2) : 0
        const sIn = isHighSurrogate(before), eIn = isHighSurrogate(beforeEnd)
        if (!sIn && !eIn) return new Range(startLineNumber, startColumn, endLineNumber, endColumn)
        if (startLineNumber === endLineNumber && startColumn === endColumn) return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn - 1)
        if (sIn && eIn) return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn + 1)
        if (sIn) return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn)
        return new Range(startLineNumber, startColumn, endLineNumber, endColumn + 1)
    }

    /** 校验过的位置 → doc 偏移(不含 EOL 补偿) */
    private _docOffset(p: IPosition): number {
        return this.doc.lineFrom(p.lineNumber) + p.column - 1
    }

    getOffsetAt(rawPosition: IPosition): number {
        this.assertNotDisposed()
        const ln = rawPosition.lineNumber, col = rawPosition.column
        // 合法位置(最常见)不建 Position 对象:整数、在文档内、列不越过行尾
        const doc = this.doc
        if ((ln | 0) === ln && (col | 0) === col && ln >= 1 && ln <= doc.lines && col >= 1 && col <= doc.lineText(ln).length + 1)
            return ln === 1 ? col - 1 : doc.lineFrom(ln) + col - 1 + (ln - 1) * (this.eol.length - 1)
        const p = this._validatePosition(rawPosition.lineNumber, rawPosition.column, false)
        return p.lineNumber - 1 === 0 ? p.column - 1 : this._docOffset(p) + (p.lineNumber - 1) * (this.eol.length - 1)
    }

    getPositionAt(rawOffset: number): Position {
        this.assertNotDisposed()
        const d = this.doc, L = this.eol.length
        const total = d.length + (d.lines - 1) * (L - 1)
        const offset = Math.min(total, Math.max(0, rawOffset))
        if (L === 1) {
            const line = d.lineAt(offset)
            return new Position(line.number, offset - line.from + 1)
        }
        // CRLF:第 n 行的虚拟起点 = line.from + (n-1)*(L-1);二分找最后一个起点 ≤ offset 的行
        let lo = 1, hi = d.lines
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (d.line(mid).from + (mid - 1) * (L - 1) <= offset) lo = mid
            else hi = mid - 1
        }
        const line = d.line(lo)
        // 偏移落在 \r\n 中间时 Monaco 给出 line.length + 2(列越过行尾),照搬不夹
        return new Position(lo, offset - (line.from + (lo - 1) * (L - 1)) + 1)
    }

    modifyPosition(rawPosition: IPosition, offset: number): Position {
        this.assertNotDisposed()
        const candidate = this.getOffsetAt(rawPosition) + offset
        return this.getPositionAt(Math.min(this.getValueLength(), Math.max(0, candidate)))
    }

    getFullModelRange(): Range {
        this.assertNotDisposed()
        const n = this.doc.lines
        return new Range(1, 1, n, this.doc.lineText(n).length + 1)
    }

    getValueInRange(rawRange: IRange, eol?: EndOfLinePreference): string {
        this.assertNotDisposed()
        const r = this.validateRange(rawRange)
        const sep = this._eolFor(eol)
        const doc = this.doc, a = r.startLineNumber, b = r.endLineNumber
        // 几行以内的小范围(绝大多数调用)直接按行拼:不走偏移换算和整棵树的 sliceString
        if (b - a <= 64) {
            if (a === b) return doc.lineText(a).slice(r.startColumn - 1, r.endColumn - 1)
            let out = doc.lineText(a).slice(r.startColumn - 1)
            for (let n = a + 1; n < b; n++) out += sep + doc.lineText(n)
            return out + sep + doc.lineText(b).slice(0, r.endColumn - 1)
        }
        return doc.sliceString(this._docOffset({ lineNumber: a, column: r.startColumn }), this._docOffset({ lineNumber: b, column: r.endColumn }), sep)
    }
    getValueLengthInRange(rawRange: IRange, eol?: EndOfLinePreference): number {
        return this.getValueInRange(rawRange, eol).length
    }
    getCharacterCountInRange(rawRange: IRange, eol?: EndOfLinePreference): number {
        const text = this.getValueInRange(rawRange, eol)
        let n = 0
        for (let i = 0; i < text.length; i++) {
            n++
            const c = text.charCodeAt(i)
            if (isHighSurrogate(c) && i + 1 < text.length) { const d = text.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) i++ }
        }
        return n
    }

    // ── 词 ──

    getWordAtPosition(rawPosition: IPosition): IWordAtPosition | null {
        this.assertNotDisposed()
        const p = this.validatePosition(rawPosition)
        const w = getWordAtText(p.column, getWordDefinition(this._languageId), this.doc.lineText(p.lineNumber), 0)
        // 结果必须碰到传进来的原始位置(Monaco TokenizationTextModelPart.getWordAtPosition)
        if (w && w.startColumn <= rawPosition.column && rawPosition.column <= w.endColumn) return { word: w.word, startColumn: w.startColumn, endColumn: w.endColumn }
        return null
    }
    getWordUntilPosition(position: IPosition): IWordAtPosition {
        const w = this.getWordAtPosition(position)
        if (!w) return { word: '', startColumn: position.column, endColumn: position.column }
        return { word: w.word.substr(0, position.column - w.startColumn), startColumn: w.startColumn, endColumn: position.column }
    }

    // ── 搜索 ──

    findMatches(searchString: string, rawSearchScope: boolean | IRange | IRange[], isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean, limitResultCount: number = 999): FindMatch[] {
        this.assertNotDisposed()
        let searchRanges: Range[] | null = null
        if (rawSearchScope !== null && typeof rawSearchScope !== 'boolean') {
            const arr = Array.isArray(rawSearchScope) ? rawSearchScope : [rawSearchScope]
            if (arr.every(r => Range.isIRange(r))) searchRanges = arr.map(r => this.validateRange(r))
        }
        if (!searchRanges || !searchRanges.length) searchRanges = [this.getFullModelRange()]
        searchRanges = searchRanges.sort((x, y) => x.startLineNumber - y.startLineNumber || x.startColumn - y.startColumn)
        const unique: Range[] = []
        unique.push(searchRanges.reduce((prev, curr) => {
            if (Range.areIntersecting(prev, curr)) return prev.plusRange(curr)
            unique.push(prev)
            return curr
        }))
        const params = new SearchParams(searchString, isRegex, matchCase, wordSeparators)
        if (!params.parseSearchRequest()) return []
        const out: FindMatch[] = []
        for (const r of unique) out.push(...TextModelSearch.findMatches(this, params, r, captureMatches, limitResultCount))
        return out
    }
    findNextMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean): FindMatch | null {
        this.assertNotDisposed()
        const start = this.validatePosition(rawSearchStart)
        return TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), start, captureMatches)
    }
    findPreviousMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean): FindMatch | null {
        this.assertNotDisposed()
        const start = this.validatePosition(rawSearchStart)
        return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), start, captureMatches)
    }

    // ── 语言 ──

    /** Monaco ITextModel.setLanguage(同 editor.setModelLanguage) */
    setLanguage(languageId: string, source?: string): void { this._setLanguage(languageId, source) }

    /** @internal editor.setModelLanguage / 视图 setLanguage 走这里 */
    _setLanguage(languageId: string, source = 'api', fromHost = false): void {
        this.assertNotDisposed()
        const old = this._languageId
        if (old === languageId) return
        this._languageId = languageId
        getLanguageService().requestRichLanguageFeatures(languageId)
        this._tok.handleLanguageChanged()
        if (!fromHost && this._host) this._host.reassemble({ lang: languageId })
        this._onLanguage.fire({ oldLanguage: old, newLanguage: languageId, source })
        emitModelLanguage.fire({ model: this, oldLanguage: old })
    }

    // ── 选项 ──

    updateOptions(o: ITextModelUpdateOptions): void {
        this.assertNotDisposed()
        const patch: { tabSize?: number, indentSize?: number, insertSpaces?: boolean } = {}
        let tabSize = o.tabSize
        if (tabSize !== undefined) { tabSize = Math.max(1, tabSize | 0); patch.tabSize = tabSize }
        if (o.insertSpaces !== undefined) patch.insertSpaces = Boolean(o.insertSpaces)
        const touchesIndent = o.tabSize !== undefined || o.indentSize !== undefined || o.insertSpaces !== undefined
        if (o.trimAutoWhitespace !== undefined) this._trimAutoWhitespace = Boolean(o.trimAutoWhitespace)
        if (o.bracketColorizationOptions) this._bracketOpts = { ...this._bracketOpts, ...o.bracketColorizationOptions }
        if (touchesIndent && indentOptions.get(this.s) !== undefined) {
            const s = this.s
            // indentSize 'tabSize' = 跟着 tabSize(Monaco originalIndentSize)
            let effect
            if (o.indentSize === 'tabSize') {
                // 显式写 'tabSize':重配成跟随 tabSize(indentSizeFacet 'tabSize')
                const ts = patch.tabSize ?? indentConfig(s).tabSize
                effect = indentOptions.reconfigure([
                    core.EditorState.tabSize.of(ts),
                    core.EditorState.indentUnit.of((patch.insertSpaces ?? indentConfig(s).insertSpaces) ? ' '.repeat(ts) : '\t'),
                    indentSizeFacet.of('tabSize'),
                ])
            } else {
                if (o.indentSize !== undefined) patch.indentSize = Math.max(1, o.indentSize | 0)
                effect = setIndentOptions(s, patch)
            }
            this._dispatch({ effects: effect, annotations: [core.Transaction.addToHistory.of(false)] })
        }
        // 视图附着时,trimAutoWhitespace / bracketColorizationOptions 交给 updateOptions(Monaco 里它们也是编辑器选项的映射)
        if (this._host && (o.trimAutoWhitespace !== undefined || o.bracketColorizationOptions)) {
            const patch2: Record<string, unknown> = {}
            if (o.trimAutoWhitespace !== undefined) patch2.trimAutoWhitespace = o.trimAutoWhitespace
            if (o.bracketColorizationOptions) patch2['bracketPairColorization'] = { enabled: o.bracketColorizationOptions.enabled, independentColorPoolPerBracketType: o.bracketColorizationOptions.independentColorPoolPerBracketType }
            const cur = this._host.getUserOptions()
            this._host.setUserOptions({ ...cur, ...patch2 }, patch2 as never)
        }
        this._syncOptionsEvent()
    }

    detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void {
        this.assertNotDisposed()
        const g = guessIndentation(this.doc.toJSON().slice(0, 10000), defaultTabSize, defaultInsertSpaces)
        // Monaco TextModel.detectIndentation:indentSize 取数字(与创建时的 'tabSize' 不同)
        this.updateOptions({ insertSpaces: g.insertSpaces, tabSize: g.tabSize, indentSize: g.tabSize })
    }

    normalizeIndentation(str: string): string {
        this.assertNotDisposed()
        const o = this._readOptions()
        return normalizeIndentationString(str, o.indentSize, o.insertSpaces)
    }

    // ── 写 ──

    setValue(newValue: string | ITextSnapshot): void {
        this.assertNotDisposed()
        let text: string
        if (typeof newValue === 'string') text = newValue
        else { text = ''; for (let c = newValue.read(); c !== null; c = newValue.read()) text += c }
        let bom = ''
        if (text.charCodeAt(0) === 0xFEFF) { bom = '\uFEFF'; text = text.slice(1) }
        this._bom = bom
        const eol = detectEOL(text, this._defaultEOL === DefaultEndOfLine.CRLF ? '\r\n' : '\n')
        text = normalizeEOL(text, eol)
        const effects: core.StateEffect<unknown>[] = []
        if (hasEolSlot(this.s) && eol !== this.eol) effects.push(eolSlot.reconfigure(core.EditorState.lineSeparator.of(eol)) as core.StateEffect<unknown>)
        this._flushing = true
        const ann = [core.Transaction.addToHistory.of(false), clearHistory.of(true), flushSearch.of(true)]
        this._dispatch({
            changes: { from: 0, to: this.doc.length, insert: text },
            selection: { anchor: 0 },
            effects,
            annotations: ann,
        })
        this._flushing = false
    }

    private _toOps(ops: IIdentifiedSingleEditOperation[]) {
        const eol = this.eol
        const out = ops.map((op, i) => {
            const range = this.validateRange(op.range)
            const raw = op.text ?? ''
            const text = raw.indexOf('\r') >= 0 || (eol === '\r\n' && raw.indexOf('\n') >= 0) ? raw.replace(/\r\n|\r|\n/g, eol) : raw
            // 与 PieceTreeTextBuffer 一致:countEOL 按行数算反向范围
            const parts = text.length ? text.split(eol) : ['']
            const rangeOffset = this.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn })
            const rangeLength = this.getValueLengthInRange(range)
            return {
                sortIndex: i,
                identifier: op.identifier ?? null,
                range,
                rangeOffset,
                rangeLength,
                text,
                eolCount: parts.length - 1,
                firstLineLength: parts[0].length,
                lastLineLength: parts[parts.length - 1].length,
                forceMoveMarkers: Boolean(op.forceMoveMarkers),
            }
        })
        out.sort((a, b) => {
            const r = Range.compareRangesUsingEnds(a.range, b.range)
            return r === 0 ? a.sortIndex - b.sortIndex : r
        })
        let touching = false
        for (let i = 0; i < out.length - 1; i++) {
            const end = out[i].range.getEndPosition()
            const next = out[i + 1].range.getStartPosition()
            if (next.isBeforeOrEqual(end)) {
                if (next.isBefore(end)) throw new Error('Overlapping ranges are not allowed!')
                touching = true
            }
        }
        return { ops: out, touching }
    }

    private static _inverseRanges(ops: { range: Range, text: string, eolCount: number, firstLineLength: number, lastLineLength: number }[]): Range[] {
        const result: Range[] = []
        let prevEndLine = 0, prevEndCol = 0
        let prev: (typeof ops)[number] | null = null
        for (const op of ops) {
            let startLine: number, startCol: number
            if (prev) {
                if (prev.range.endLineNumber === op.range.startLineNumber) {
                    startLine = prevEndLine
                    startCol = prevEndCol + (op.range.startColumn - prev.range.endColumn)
                } else {
                    startLine = prevEndLine + (op.range.startLineNumber - prev.range.endLineNumber)
                    startCol = op.range.startColumn
                }
            } else {
                startLine = op.range.startLineNumber
                startCol = op.range.startColumn
            }
            let r: Range
            if (op.text.length > 0) {
                const lineCount = op.eolCount + 1
                r = lineCount === 1
                    ? new Range(startLine, startCol, startLine, startCol + op.firstLineLength)
                    : new Range(startLine, startCol, startLine + lineCount - 1, op.lastLineLength + 1)
            } else r = new Range(startLine, startCol, startLine, startCol)
            prevEndLine = r.endLineNumber
            prevEndCol = r.endColumn
            result.push(r)
            prev = op
        }
        return result
    }

    /** 共用的编辑实现:返回反向操作(computeUndoEdits)并发出事务 */
    private _edit(operations: IIdentifiedSingleEditOperation[], computeUndo: boolean, undoable: boolean): IValidEditOperation[] | null {
        this.assertNotDisposed()
        const { ops, touching } = this._toOps(operations)
        const reverseRanges = computeUndo ? TextModel._inverseRanges(ops) : []
        let reverse: (IValidEditOperation & { sortIndex: number })[] | null = null
        if (computeUndo) {
            let delta = 0
            reverse = ops.map((op, i) => {
                const buf = this.getValueInRange(op.range)
                const rro = op.rangeOffset + delta
                delta += op.text.length - buf.length
                return {
                    sortIndex: op.sortIndex,
                    identifier: op.identifier,
                    range: reverseRanges[i],
                    text: buf,
                    textChange: { oldPosition: op.rangeOffset, oldText: buf, newPosition: rro, newText: op.text },
                }
            })
            if (!touching) reverse.sort((a, b) => a.sortIndex - b.sortIndex)
        }
        // Monaco 的 contentChanges:降序(自下而上),no-op(空范围 + 空文本)跳过
        const real = ops.filter(op => !(op.range.isEmpty() && op.text.length === 0))
        if (real.length) {
            const specs = real.map(op => ({
                from: this._docOffset({ lineNumber: op.range.startLineNumber, column: op.range.startColumn }),
                to: this._docOffset({ lineNumber: op.range.endLineNumber, column: op.range.endColumn }),
                insert: op.text,
            }))
            this._pending = {
                changes: [...real].reverse().map(op => ({ range: op.range, rangeLength: op.rangeLength, text: op.text, rangeOffset: op.rangeOffset })),
            }
            const annotations: core.Annotation<unknown>[] = undoable
                ? [apiEdit.of(true) as core.Annotation<unknown>]
                : [core.Transaction.addToHistory.of(false) as core.Annotation<unknown>]
            const forced = specs.filter((_, i) => real[i].forceMoveMarkers).map(sp => [sp.from, sp.to] as const)
            if (forced.length) annotations.push(forceMoveMarkers.of(forced) as core.Annotation<unknown>)
            annotations.push(core.Transaction.selectionMapper.of((sel, changes) => mapSelectionByMarkers(sel, changes, forced)) as core.Annotation<unknown>)
            this._dispatch({ changes: specs, annotations }, true)
            this._pending = null
        }
        return reverse
    }

    applyEdits(operations: IIdentifiedSingleEditOperation[]): void
    applyEdits(operations: IIdentifiedSingleEditOperation[], computeUndoEdits: false): void
    applyEdits(operations: IIdentifiedSingleEditOperation[], computeUndoEdits: true): IValidEditOperation[]
    applyEdits(operations: IIdentifiedSingleEditOperation[], computeUndoEdits?: boolean): void | IValidEditOperation[] {
        const r = this._edit(operations, !!computeUndoEdits, false)
        if (computeUndoEdits) return r!.map(({ identifier, range, text, textChange }) => ({ identifier, range, text, textChange }))
    }

    pushEditOperations(_before: Selection[] | null, ops: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer, _group?: unknown): Selection[] | null {
        const inverse = this._edit(ops, true, true)!.map(({ identifier, range, text, textChange }) => ({ identifier, range, text, textChange }))
        return cursorStateComputer ? cursorStateComputer(inverse) : null
    }

    pushStackElement(): void {
        this.assertNotDisposed()
        this._dispatch({ annotations: [undoStop.of('push')] })
    }
    popStackElement(): void {
        this.assertNotDisposed()
        this._dispatch({ annotations: [undoStop.of('pop')] })
    }

    private _changeEol(eol: string, undoable: boolean): void {
        this.assertNotDisposed()
        const from = this.eol
        if (from === eol) return
        if (!hasEolSlot(this.s)) throw new Error('EOL is not configurable for this state')
        const ann: core.Annotation<unknown>[] = undoable
            // Monaco pushEOL 追加进当前开着的撤销元素(刚打的字还没被 pushStackElement 关掉就并进去:一次 undo 同时撤字和 EOL)
            ? [apiEdit.of(true) as core.Annotation<unknown>]
            : [core.Transaction.addToHistory.of(false) as core.Annotation<unknown>]
        this._dispatch({
            effects: [eolSlot.reconfigure(core.EditorState.lineSeparator.of(eol)), eolMarker.of({ from, to: eol })],
            annotations: ann,
        })
    }
    setEOL(eol: EndOfLineSequence): void { this._changeEol(eol === EndOfLineSequence.CRLF ? '\r\n' : '\n', false) }
    pushEOL(eol: EndOfLineSequence): void { this._changeEol(eol === EndOfLineSequence.CRLF ? '\r\n' : '\n', true) }

    // ── 装饰:转发给 H2 ──

    setDecorationsProvider(p: IModelDecorationsProvider | null): void {
        this._decoSub?.dispose()
        this._decorations = p
        this._decoSub = p?.onDidChangeDecorations?.(e => this._onDeco.fire(e)) ?? null
    }
    /** 当前的装饰实现:附着 = 视图的装饰集;脱机 = 自带的装饰表(没登记工厂时没有) */
    private get _deco(): IModelDecorationsProvider | null {
        if (this._decorations) return this._decorations
        if (this._view || !detachedDecorationsFactory) return null
        if (!this._ownDeco) {
            this._ownDeco = detachedDecorationsFactory(() => this.s.doc)
            this._ownDecoSub = this._ownDeco.onDidChangeDecorations?.(e => this._onDeco.fire(e)) ?? null
        }
        return this._ownDeco
    }
    private _dropOwnDeco(): void {
        this._ownDecoSub?.dispose()
        this._ownDecoSub = null
        this._ownDeco = null
    }
    deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[], ownerId = 0): string[] {
        this.assertNotDisposed()
        return this._deco?.deltaDecorations(oldDecorations, newDecorations, ownerId) ?? []
    }
    changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T, ownerId = 0): T | null {
        this.assertNotDisposed()
        const p = this._deco
        const accessor: IModelDecorationsChangeAccessor = {
            addDecoration: (range, options) => p?.deltaDecorations([], [{ range, options }], ownerId)[0] ?? '',
            changeDecoration: (id, range) => { p?.redefine?.(id, range, undefined) },
            changeDecorationOptions: (id, options) => { p?.redefine?.(id, undefined, options) },
            removeDecoration: (id) => { p?.deltaDecorations([id], [], ownerId) },
            deltaDecorations: (o, n) => p?.deltaDecorations([...o], [...n], ownerId) ?? [],
        }
        return callback(accessor) ?? null
    }
    getDecorationOptions(id: string): IModelDecorationOptions | null { return this._deco?.getDecorationOptions(id) ?? null }
    getDecorationRange(id: string): Range | null { return this._deco?.getDecorationRange(id) ?? null }
    getLineDecorations(lineNumber: number, ownerId = 0, filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] { return this._deco?.getLineDecorations(lineNumber, ownerId, filterOutValidation, filterFontDecorations) ?? [] }
    getLinesDecorations(a: number, b: number, ownerId = 0, filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] { return this._deco?.getLinesDecorations(a, b, ownerId, filterOutValidation, filterFontDecorations) ?? [] }
    getDecorationsInRange(range: IRange, ownerId = 0, filterOutValidation = false, filterFontDecorations = false, onlyMinimapDecorations = false, onlyMarginDecorations = false): IModelDecoration[] { return this._deco?.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations) ?? [] }
    getAllDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] { return this._deco?.getAllDecorations(ownerId, filterOutValidation, filterFontDecorations) ?? [] }
    getAllMarginDecorations(ownerId = 0): IModelDecoration[] { return this._deco?.getAllMarginDecorations(ownerId) ?? [] }
    getOverviewRulerDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false): IModelDecoration[] { return this._deco?.getOverviewRulerDecorations(ownerId, filterOutValidation, filterFontDecorations) ?? [] }
    getInjectedTextDecorations(ownerId = 0): IModelDecoration[] { return this._deco?.getInjectedTextDecorations(ownerId) ?? [] }
    getCustomLineHeightsDecorations(ownerId = 0): IModelDecoration[] { return this._deco?.getCustomLineHeightsDecorations(ownerId) ?? [] }
    /** Monaco TextModel.removeAllDecorationsWithOwnerId:销毁后调用是 no-op */
    removeAllDecorationsWithOwnerId(ownerId: number): void { if (!this._disposed) this._deco?.removeAllDecorationsWithOwnerId?.(ownerId) }

    // ── 生命周期 ──

    /** 分词层:forceTokenization / getLineTokens / hasAccurateTokensForLine / isCheapToTokenize ...(分词器来源见 tokenization.ts 的注册表) */
    get tokenization(): ITokenizationTextModelPart { this.assertNotDisposed(); return this._tok }

    /** Monaco ITextModel.getLanguageIdAtPosition:该位置 token 的语言(内嵌语言;没有分词器时就是 model 的语言) */
    getLanguageIdAtPosition(lineNumber: number, column: number): string { this.assertNotDisposed(); return this._tok.getLanguageIdAtPosition(lineNumber, column) }

    /** 有视图挂着(缺省后台分词只在这时推进) */
    isAttachedToEditor(): boolean { return this._view !== null || this._manualAttach > 0 }
    /** @internal Monaco:挂到某个编辑器之前 / 之后的通知(单测直接调) */
    onBeforeAttached(): void {
        const was = this.isAttachedToEditor()
        this._manualAttach++
        this._tok.handleAttachedChanged()
        if (!was) this._onAttached.fire()
    }
    onBeforeDetached(): void {
        if (this._manualAttach > 0) this._manualAttach--
        this._tok.handleAttachedChanged()
        if (!this.isAttachedToEditor()) this._onAttached.fire()
    }

    private _guides: IGuidesTextModelPart | null = null
    /** 缩进参考线数据口(getLinesIndentGuides / getActiveIndentGuide) */
    get guides(): IGuidesTextModelPart { this.assertNotDisposed(); return this._guides ??= createGuides(this) }

    private _bracketPairs: IBracketPairsTextModelPart | null = null
    /** 括号对数据口(getBracketPairsInRange / matchBracket / findEnclosingBrackets ...) */
    get bracketPairs(): IBracketPairsTextModelPart {
        this.assertNotDisposed()
        return this._bracketPairs ??= createBracketPairs({
            getVersionId: () => this._versionId,
            getLanguageId: () => this._languageId,
            getLanguageIdAtPosition: (l, c) => this._tok.getLanguageIdAtPosition(l, c),
            tokenization: this._tok,
            getTabSize: () => this._readOptions().tabSize,
            getLineFirstNonWhitespaceColumn: n => this.getLineFirstNonWhitespaceColumn(n),
            getLineContent: n => this.getLineContent(n),
            validateRange: r => this.validateRange(r),
            validatePosition: p => this.validatePosition(p),
            doc: () => this.s.doc,
            owner: () => this._view,
            onDidChangeContent: l => this.onDidChangeContent(() => l()),
            onDidChangeLanguage: l => this.onDidChangeLanguage(() => l()),
        })
    }

    /** Monaco 单测用:model 自己的 emitter 上有没有人订阅(模型内部各部件不得通过事件互相通知,否则外部监听者可能在内部状态更新前看到不一致的 model) */
    _hasListeners(): boolean {
        return this._onContent.hasListeners || this._onContentSettled.hasListeners || this._onDeco.hasListeners || this._onOptions.hasListeners
            || this._onLanguage.hasListeners || this._onLangConfig.hasListeners || this._onWillDispose.hasListeners || this._onAttached.hasListeners
    }

    dispose(): void {
        if (this._disposed) return
        this._onWillDispose.fire()
        emitWillDisposeModel.fire(this)
        this._disposed = true
        this._detach()
        this._tok.dispose()
        this._langCfgSub.dispose()
        this._decoSub?.dispose()
        this._dropOwnDeco()
        MODELS.delete(this.uri.toString())
        for (const e of [this._onContent, this._onContentSettled, this._onDeco, this._onOptions, this._onLanguage, this._onLangConfig, this._onWillDispose, this._onAttached]) e.dispose()
    }
}

// ───────────── 创建 / 查找 ─────────────

/**
 * litemonaco.ts 登记进来的「装配槽」(liteMonacoSlot):model 的 state 带上它,liteMonaco() 才认它是自己的 state、原样沿用(历史 / 选区 / 折叠都在里面)。
 * 没登记(单独用 model、不挂编辑器)时是空数组。
 */
let baseExtension: core.Extension = []
export function _registerModelBase(ext: core.Extension): void { baseExtension = ext }

function guessedIndentExtension(text: string): core.Extension {
    const g = guessIndentation(core.headLines(text, 10000), 4, true)
    return indentOptions.of([
        core.EditorState.tabSize.of(g.tabSize),
        core.EditorState.indentUnit.of(g.insertSpaces ? ' '.repeat(g.tabSize) : '\t'),
        indentSizeFacet.of('tabSize'),
    ])
}

/** Monaco 创建 / setValue 时把全部换行归一成多数派 EOL(PieceTreeTextBufferFactory.create → _normalizeEOL) */
function normalizeEOL(text: string, eol: string): string {
    // 已经是目标 EOL(最常见:全是 \n)就不拷贝整篇
    if (eol === '\n' ? text.indexOf('\r') < 0 : !/(^|[^\r])\n|\r(?!\n)/.test(text)) return text
    return text.replace(/\r\n|\r|\n/g, eol)
}

function freshState(text: string, eol: string, history = false): EditorState {
    text = normalizeEOL(text, eol)
    return core.EditorState.create({
        doc: text,
        // 缩进选项:Monaco 创建 model 时 detectIndentation 默认开,按内容猜(默认 tabSize 4 / 空格),indentSize 跟 tabSize。
        // 装进共用的 indentOptions 槽,updateOptions / Detect Indentation 命令都改这个槽。
        // history:脱机 model 默认没有撤销栈(历史装在编辑器装配槽里);ModelService 的 model 要自带(销毁重建时撤销栈要能留下来)
        extensions: [baseExtension, eolExtension(eol), guessedIndentExtension(text), ...(history ? [core.history()] : [])],
    })
}

/**
 * monaco.editor.createModel(value, language?, uri?)。
 * 语言缺省:有 uri 时按扩展名 / 文件名猜,猜不到是 plaintext;同一个 uri 已有 model 抛错(同 Monaco)。
 */
export function createModel(value: string, language?: string, uri?: Uri, opts?: { defaultEOL?: DefaultEndOfLine, history?: boolean }): TextModel {
    const defaultEOL = opts?.defaultEOL
    const resource = uri ?? Uri.parse(`inmemory://model/${++implicitCounter}`)
    if (MODELS.has(resource.toString())) throw new Error(`Cannot add model because it already exists!`)
    let text = value
    let bom = ''
    if (text.charCodeAt(0) === 0xFEFF) { bom = '\uFEFF'; text = text.slice(1) }
    const firstLine = text.split(/\r\n|\r|\n/, 1)[0]
    const lang = language ?? guessLanguageId(uri ?? null, firstLine) ?? 'plaintext'
    // defaultEOL(创建选项,ModelService 按 files.eol 给):只在文本自己没有换行时决定 EOL
    const m = new TextModel(freshState(text, detectEOL(text, defaultEOL === DefaultEndOfLine.CRLF ? '\r\n' : '\n'), opts?.history), lang, resource, bom)
    if (defaultEOL !== undefined) m._setDefaultEOL(defaultEOL)
    return m
}

/** monaco.editor.getModel(uri) */
export function getModel(uri: Uri): ITextModel | null {
    return MODELS.get(uri.toString()) ?? null
}

/** monaco.editor.getModels() */
export function getModels(): ITextModel[] {
    return [...MODELS.values()]
}

/** 视图的隐式 model:`view.getModel()` 第一次调用时建(Monaco 里 editor.create 也会带一个 model) */
const VIEW_MODELS = new WeakMap<EditorView, TextModel>()
export function modelForView(view: EditorView, host: EditorHost | null, destroyHook?: (fn: () => void) => void): TextModel {
    let m = VIEW_MODELS.get(view)
    if (m && !m.isDisposed()) return m
    const uri = Uri.parse(`inmemory://model/${++implicitCounter}`)
    m = new TextModel(view.state, host?.getLanguageId() ?? 'plaintext', uri, '', true)
    VIEW_MODELS.set(view, m)
    m._attach(view, host)
    destroyHook?.(() => m!._viewDestroyed(view))
    return m
}
export function setViewModel(view: EditorView, model: TextModel | null): void {
    if (model) VIEW_MODELS.set(view, model)
    else VIEW_MODELS.delete(view)
}
export function peekViewModel(view: EditorView): TextModel | undefined {
    return VIEW_MODELS.get(view)
}

// editor.setModelLanguage / languages.setModelLanguage
_setModelLanguageHost({
    setLanguage(model, languageId, source) {
        if (!(model instanceof TextModel)) throw new Error('setModelLanguage: not a model created by lite-monaco')
        model._setLanguage(languageId, source)
    },
})

/** 语言 id 有没有登记(给 setModelLanguage 的校验用:Monaco 对未知 id 回落 plaintext;lite-monaco 保留原 id,不强制) */
export { isRegisteredLanguage }
export { wordClassifier as _wordClassifier }
