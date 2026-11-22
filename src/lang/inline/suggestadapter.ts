// 补全菜单 <-> 行内补全的接缝(移植自 inlineCompletions/browser/model/suggestWidgetAdapter.ts)。
//   · SuggestItemInfo:补全菜单当前选中项,折算成「在光标处替换哪段、换成什么文本」
//   · SuggestWidgetAdaptor:盯着 SuggestController,选中项变了就通知;并登记一个优先级 100 的「预选择器」,
//     让补全菜单默认选中「能增强当前行内补全」的那一项(前缀最长者)
// lite-monaco 的补全控件没有 widget 对象:显隐由 SuggestModel 的 onDidSuggest / onDidCancel 给出,焦点项由 controller 给。
import { Emitter } from '../../api/context'
import { Position, Range } from '../../api/position'
import type { IPosition } from '../../api/position'
import type { IDisposable, LiteMonacoEditor } from '../../api/types'
import { SnippetSession } from '../../api/snippetsession'
import { SnippetParser } from '../../core/feature/snippetparser'
import { CompletionItemInsertTextRule } from '../providers'
import type { CompletionItem } from '../suggest'
import { SuggestController } from '../suggestcontroller'
import { State } from '../suggestmodel'
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from './ghosttext'
import { TextReplacement } from './textedit'
import { SelectedSuggestionInfo } from './types'

export class SuggestItemInfo {
    static fromSuggestion(controller: SuggestController, model: NonNullable<ReturnType<LiteMonacoEditor['getModel']>>, position: Position, item: CompletionItem, toggleMode: boolean): SuggestItemInfo {
        let { insertText } = item.completion
        let isSnippetText = false
        if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet) {
            const snippet = new SnippetParser().parse(insertText)
            // adjustWhitespace 不便宜,片段很大就算了
            if (snippet.children.length < 100) SnippetSession.adjustWhitespace(model, position, true, snippet)
            insertText = snippet.toString()
            isSnippetText = true
        }
        const info = controller.getOverwriteInfo(item, toggleMode)
        return new SuggestItemInfo(
            Range.fromPositions(new Position(position.lineNumber, position.column - info.overwriteBefore), new Position(position.lineNumber, position.column + Math.max(info.overwriteAfter, 0))),
            insertText, item.completion.kind, isSnippetText, item.container.incomplete ?? false,
        )
    }

    private constructor(
        readonly range: Range,
        readonly insertText: string,
        readonly completionItemKind: number,
        readonly isSnippetText: boolean,
        readonly listIncomplete: boolean,
    ) { }

    equals(other: SuggestItemInfo): boolean {
        return this.range.equalsRange(other.range) && this.insertText === other.insertText
            && this.completionItemKind === other.completionItemKind && this.isSnippetText === other.isSnippetText
    }
    toSelectedSuggestionInfo(): SelectedSuggestionInfo { return new SelectedSuggestionInfo(this.range, this.insertText, this.completionItemKind, this.isSnippetText) }
    getSingleTextEdit(): TextReplacement { return new TextReplacement(this.range, this.insertText) }
}

const infoEquals = (a: SuggestItemInfo | undefined, b: SuggestItemInfo | undefined): boolean => a === b || (!!a && !!b && a.equals(b))

export class SuggestWidgetAdaptor implements IDisposable {
    private _visible = false
    private _shift = false
    private _active = false
    private _current: SuggestItemInfo | undefined
    private readonly _onDidSelectedItemChange = new Emitter<void>()
    readonly onDidSelectedItemChange = this._onDidSelectedItemChange.event
    private readonly _subs: IDisposable[] = []

    constructor(
        private readonly editor: LiteMonacoEditor,
        /** 当前行内补全的编辑(供预选择);没有就 undefined */
        private readonly preselector: () => TextReplacement | undefined,
        private readonly onWillAccept: (item: SuggestItemInfo) => void,
    ) {
        // shift+tab 是 acceptAlternativeSelectedSuggestion:按下 shift 期间,插入/替换语义互换
        this._subs.push(editor.onKeyDown(e => { if (e.shiftKey && !this._shift) { this._shift = true; this._update(this._active) } }))
        this._subs.push(editor.onKeyUp(e => { if (e.shiftKey && this._shift) { this._shift = false; this._update(this._active) } }))

        const controller = SuggestController.get(editor)
        if (controller) {
            this._subs.push(controller.registerSelector({
                priority: 100,
                select: (_model, pos, items) => {
                    const textModel = this.editor.getModel()
                    if (!textModel) return -1
                    const i = this.preselector()
                    const toPreselect = i ? singleTextRemoveCommonPrefix(i, textModel) : undefined
                    if (!toPreselect) return -1
                    const position = Position.lift(pos as IPosition)
                    let best = -1, bestLen = 0
                    items.forEach((item, index) => {
                        const edit = singleTextRemoveCommonPrefix(SuggestItemInfo.fromSuggestion(controller, textModel, position, item, this._shift).getSingleTextEdit(), textModel)
                        // 取前缀最长的;并列取靠前者
                        if (edit.text.length > 0 && edit.text.length > bestLen && singleTextEditAugments(toPreselect, edit)) { best = index; bestLen = edit.text.length }
                    })
                    return best
                },
            }))
            this._subs.push(controller.model.onDidSuggest(e => {
                if (e.triggerOptions.shy) return
                this._visible = e.completionModel.items.length > 0
                this._update(this._visible)
            }))
            this._subs.push(controller.onDidFocus(() => { this._visible = true; this._update(true) }))
            this._subs.push(controller.model.onDidCancel(e => {
                if (e.retrigger) return
                this._visible = false
                this._update(false)
            }))
            this._subs.push(controller.onWillInsertSuggestItem(e => {
                const position = this.editor.getPosition(), model = this.editor.getModel()
                if (!position || !model) return
                this.onWillAccept(SuggestItemInfo.fromSuggestion(controller, model, Position.lift(position), e.item, this._shift))
            }))
            this._visible = controller.model.state !== State.Idle && !!controller.getFocusedItem()
        }
        this._update(this._visible)
    }

    get selectedItem(): SuggestItemInfo | undefined { return this._current }

    private _itemInfo(): SuggestItemInfo | undefined {
        const controller = SuggestController.get(this.editor)
        if (!controller || !this._visible) return undefined
        const focused = controller.getFocusedItem()
        const position = this.editor.getPosition(), model = this.editor.getModel()
        if (!focused || !position || !model) return undefined
        return SuggestItemInfo.fromSuggestion(controller, model, Position.lift(position), focused.item, this._shift)
    }

    private _update(active: boolean): void {
        const next = this._itemInfo()
        if (this._active !== active || !infoEquals(this._current, next)) {
            this._active = active
            this._current = next
            this._onDidSelectedItemChange.fire()
        }
    }

    dispose(): void {
        for (const s of this._subs.splice(0)) s.dispose()
        this._onDidSelectedItemChange.dispose()
    }
}
