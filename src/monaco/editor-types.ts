// 由 scripts/gen-monaco-types.ts 生成,勿手改(改 __tests__/types/monaco-types-gen.ts 的 MAP/生成逻辑)。
// monaco.editor 的类型出口(接口/类型别名;枚举与类是值,由 ./editor 导出)。
// 声明移植自 monaco-editor 0.55.1 的 monaco.d.ts(Microsoft, MIT);已有 lite-monaco 等价类型的名字直接映射到它。


import type { IDisposable, IEvent, IKeyboardEvent, IPosition, IRange, IScrollEvent, ISelection, Position, Range, Selection, Uri } from './top-types'
import type { IKeybindingRule } from '../api/commands'
import type { ILinkOpener } from '../core/feature/link'
import type { ICodeEditorOpener } from '../api/openers'
import type { BuiltinTheme } from '../api/themes'
import type { IStandaloneThemeData } from '../api/themes'
import type { IColors } from '../api/themes'
import type { ITokenThemeRule } from '../api/themes'
import type { IActionDescriptor } from '../api/actions'
import type { IGlobalEditorOptions } from '../core/options/types'
import type { IStandaloneEditorConstructionOptions } from '../api/create'
import type { LiteMonacoEditor as IStandaloneCodeEditor } from '../api/types'
import type { ICommandHandler } from '../api/commands'
import type { ICommandMetadata } from '../api/actions'
import type { IContextKey } from '../api/contextkeys'
import type { ContextKeyValue } from '../api/contextkeys'
import type { IMarker } from '../api/markers'
import type { IMarkerData } from '../api/markers'
import type { IRelatedInformation } from '../api/markers'
import type { IColorizerOptions } from '../api/colorizer'
import type { IColorizerElementOptions } from '../api/colorizer'
import type { ThemeColor } from '../lang/inline/types'
import type { ThemeIcon } from '../lang/inline/types'
import type { IWordAtPosition } from '../api/modelsearch'
import type { IModelDecorationOverviewRulerOptions } from '../api/decorations'
import type { IModelDecorationMinimapOptions } from '../api/decorations'
import type { IModelDecorationOptions } from '../api/decorations'
import type { InjectedTextOptions } from '../api/decorations'
import type { IModelDeltaDecoration } from '../api/decorations'
import type { IModelDecoration } from '../api/decorations'
import type { IIdentifiedSingleEditOperation } from '../api/model'
import type { IValidEditOperation } from '../api/model'
import type { ICursorStateComputer } from '../api/model'
import type { ITextModelUpdateOptions } from '../api/model'
import type { ITextSnapshot } from '../api/model'
import type { ITextModel } from '../api/model'
import type { ICharChange } from '../diffeditor'
import type { ILineChange } from '../diffeditor'
import type { IEditOperationBuilder } from '../api/commands'
import type { ICursorStateComputerData } from '../api/commands'
import type { ICommand } from '../api/commands'
import type { IModelChangedEvent } from '../api/types'
import type { IContentSizeChangedEvent } from '../core/view/viewapi'
import type { IEditorAction } from '../api/actions'
import type { ICursorState } from '../api/types'
import type { IViewState } from '../api/types'
import type { ICodeEditorViewState } from '../api/types'
import type { IEditorDecorationsCollection } from '../api/decorations'
import type { IModelLanguageChangedEvent } from '../api/model'
import type { IModelLanguageConfigurationChangedEvent } from '../api/model'
import type { IModelContentChangedEvent } from '../api/types'
import type { IModelDecorationsChangedEvent } from '../api/model'
import type { IModelOptionsChangedEvent } from '../api/types'
import type { IModelContentChange } from '../api/types'
import type { ICursorPositionChangedEvent } from '../core/view/viewapi'
import type { ICursorSelectionChangedEvent } from '../core/view/viewapi'
import type { EditorAutoClosingStrategy } from '../core/options/types'
import type { EditorAutoSurroundStrategy } from '../core/options/types'
import type { EditorAutoClosingEditStrategy } from '../core/options/types'
import type { IEditorOptions } from '../core/options/types'
import type { IDiffEditorBaseOptions } from '../core/options/types'
import type { IDiffEditorOptions } from '../core/options/types'
import type { IComputedEditorOptions } from '../core/options/index'
import type { IEditorCommentsOptions } from '../core/options/types'
import type { IEditorFindOptions } from '../core/options/types'
import type { GoToLocationValues } from '../core/options/types'
import type { IGotoLocationOptions } from '../core/options/types'
import type { IEditorHoverOptions } from '../core/options/types'
import type { OverviewRulerPosition } from '../core/options/types'
import type { EditorLayoutInfo } from '../core/options/types'
import type { EditorMinimapLayoutInfo } from '../core/options/types'
import type { IEditorLightbulbOptions } from '../core/options/types'
import type { IEditorStickyScrollOptions } from '../core/options/types'
import type { IEditorInlayHintsOptions } from '../core/options/types'
import type { IEditorMinimapOptions } from '../core/options/types'
import type { IEditorPaddingOptions } from '../core/options/types'
import type { IEditorParameterHintOptions } from '../core/options/types'
import type { QuickSuggestionsValue } from '../core/options/types'
import type { IQuickSuggestionsOptions } from '../core/options/types'
import type { InternalQuickSuggestionsOptions } from '../core/options/types'
import type { LineNumbersType } from '../core/options/types'
import type { InternalEditorRenderLineNumbersOptions } from '../core/options/types'
import type { IRulerOption } from '../core/options/types'
import type { IEditorScrollbarOptions } from '../core/options/types'
import type { InternalEditorScrollbarOptions } from '../core/options/types'
import type { InUntrustedWorkspace } from '../core/options/types'
import type { IUnicodeHighlightOptions } from '../core/options/types'
import type { IInlineSuggestOptions } from '../core/options/types'
import type { RequiredRecursive } from '../core/options/types'
import type { IBracketPairColorizationOptions } from '../core/options/types'
import type { IGuidesOptions } from '../core/options/types'
import type { ISuggestOptions } from '../core/options/types'
import type { ISmartSelectOptions } from '../core/options/types'
import type { EditorWrappingInfo } from '../core/options/types'
import type { IDropIntoEditorOptions } from '../core/options/types'
import type { IPasteAsOptions } from '../core/options/types'
import type { EditorOptionsType } from '../core/options/editoroptions'
import type { MouseMiddleClickAction } from '../core/options/types'
import type { IViewZone } from '../core/view/viewapi'
import type { IViewZoneChangeAccessor } from '../core/view/viewapi'
import type { IContentWidgetPosition } from '../api/widgets'
import type { IContentWidget } from '../api/widgets'
import type { IOverlayWidgetPosition } from '../api/widgets'
import type { IOverlayWidget } from '../api/widgets'
import type { IGlyphMarginWidget } from '../api/widgets'
import type { IGlyphMarginWidgetPosition } from '../api/widgets'
import type { IBaseMouseTarget } from '../core/view/viewapi'
import type { IMouseTargetUnknown } from '../core/view/viewapi'
import type { IMouseTargetTextarea } from '../core/view/viewapi'
import type { IMouseTargetMarginData } from '../core/view/viewapi'
import type { IMouseTargetMargin } from '../core/view/viewapi'
import type { IMouseTargetViewZoneData } from '../core/view/viewapi'
import type { IMouseTargetViewZone } from '../core/view/viewapi'
import type { IMouseTargetContentTextData } from '../core/view/viewapi'
import type { IMouseTargetContentText } from '../core/view/viewapi'
import type { IMouseTargetContentEmptyData } from '../core/view/viewapi'
import type { IMouseTargetContentEmpty } from '../core/view/viewapi'
import type { IMouseTargetContentWidget } from '../core/view/viewapi'
import type { IMouseTargetOverlayWidget } from '../core/view/viewapi'
import type { IMouseTargetScrollbar } from '../core/view/viewapi'
import type { IMouseTargetOverviewRuler } from '../core/view/viewapi'
import type { IMouseTargetOutsideEditor } from '../core/view/viewapi'
import type { IMouseTarget } from '../core/view/viewapi'
import type { IEditorMouseEvent } from '../api/types'
import type { IPartialEditorMouseEvent } from '../api/types'
import type { IPasteEvent } from '../api/types'
import type * as ED from './editor'

export type { IKeybindingRule, ILinkOpener, ICodeEditorOpener, BuiltinTheme, IStandaloneThemeData, IColors, ITokenThemeRule, IActionDescriptor, IGlobalEditorOptions, IStandaloneEditorConstructionOptions, IStandaloneCodeEditor, ICommandHandler, ICommandMetadata, IContextKey, ContextKeyValue, IMarker, IMarkerData, IRelatedInformation, IColorizerOptions, IColorizerElementOptions, ThemeColor, ThemeIcon, IWordAtPosition, IModelDecorationOverviewRulerOptions, IModelDecorationMinimapOptions, IModelDecorationOptions, InjectedTextOptions, IModelDeltaDecoration, IModelDecoration, IIdentifiedSingleEditOperation, IValidEditOperation, ICursorStateComputer, ITextModelUpdateOptions, ITextSnapshot, ITextModel, ICharChange, ILineChange, IEditOperationBuilder, ICursorStateComputerData, ICommand, IModelChangedEvent, IContentSizeChangedEvent, IEditorAction, ICursorState, IViewState, ICodeEditorViewState, IEditorDecorationsCollection, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelOptionsChangedEvent, IModelContentChange, ICursorPositionChangedEvent, ICursorSelectionChangedEvent, EditorAutoClosingStrategy, EditorAutoSurroundStrategy, EditorAutoClosingEditStrategy, IEditorOptions, IDiffEditorBaseOptions, IDiffEditorOptions, IComputedEditorOptions, IEditorCommentsOptions, IEditorFindOptions, GoToLocationValues, IGotoLocationOptions, IEditorHoverOptions, OverviewRulerPosition, EditorLayoutInfo, EditorMinimapLayoutInfo, IEditorLightbulbOptions, IEditorStickyScrollOptions, IEditorInlayHintsOptions, IEditorMinimapOptions, IEditorPaddingOptions, IEditorParameterHintOptions, QuickSuggestionsValue, IQuickSuggestionsOptions, InternalQuickSuggestionsOptions, LineNumbersType, InternalEditorRenderLineNumbersOptions, IRulerOption, IEditorScrollbarOptions, InternalEditorScrollbarOptions, InUntrustedWorkspace, IUnicodeHighlightOptions, IInlineSuggestOptions, RequiredRecursive, IBracketPairColorizationOptions, IGuidesOptions, ISuggestOptions, ISmartSelectOptions, EditorWrappingInfo, IDropIntoEditorOptions, IPasteAsOptions, EditorOptionsType, MouseMiddleClickAction, IViewZone, IViewZoneChangeAccessor, IContentWidgetPosition, IContentWidget, IOverlayWidgetPosition, IOverlayWidget, IGlyphMarginWidget, IGlyphMarginWidgetPosition, IBaseMouseTarget, IMouseTargetUnknown, IMouseTargetTextarea, IMouseTargetMarginData, IMouseTargetMargin, IMouseTargetViewZoneData, IMouseTargetViewZone, IMouseTargetContentTextData, IMouseTargetContentText, IMouseTargetContentEmptyData, IMouseTargetContentEmpty, IMouseTargetContentWidget, IMouseTargetOverlayWidget, IMouseTargetScrollbar, IMouseTargetOverviewRuler, IMouseTargetOutsideEditor, IMouseTarget, IEditorMouseEvent, IPartialEditorMouseEvent, IPasteEvent }

    /**
     * Description of a command contribution
     */
    export interface ICommandDescriptor {
        /**
         * An unique identifier of the contributed command.
         */
        id: string;
        /**
         * Callback that will be executed when the command is triggered.
         */
        run: ICommandHandler;
    }

    /**
     * A web worker that can provide a proxy to an arbitrary file.
     */
    export interface MonacoWebWorker<T> {
        /**
         * Terminate the web worker, thus invalidating the returned proxy.
         */
        dispose(): void;
        /**
         * Get a proxy to the arbitrary loaded code.
         */
        getProxy(): Promise<T>;
        /**
         * Synchronize (send) the models at `resources` to the web worker,
         * making them available in the monaco.worker.getMirrorModels().
         */
        withSyncedResources(resources: Uri[]): Promise<T>;
    }

    export interface IInternalWebWorkerOptions {
        /**
         * The worker.
         */
        worker: Worker | Promise<Worker>;
        /**
         * An object that can be used by the web worker to make calls back to the main thread.
         */
        host?: Record<string, Function>;
        /**
         * Keep idle models.
         * Defaults to false, which means that idle models will stop syncing after a while.
         */
        keepIdleModels?: boolean;
    }

    /**
     * The options to create a diff editor.
     */
    export interface IStandaloneDiffEditorConstructionOptions extends IDiffEditorConstructionOptions {
        /**
         * Initial theme to be used for rendering.
         * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light.
         * You can create custom themes via `monaco.editor.defineTheme`.
         * To switch a theme, use `monaco.editor.setTheme`.
         * **NOTE**: The theme might be overwritten if the OS is in high contrast mode, unless `autoDetectHighContrast` is set to false.
         */
        theme?: string;
        /**
         * If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme.
         * Defaults to true.
         */
        autoDetectHighContrast?: boolean;
    }

    export interface IStandaloneDiffEditor extends IDiffEditor {
        addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null;
        createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T): IContextKey<T>;
        addAction(descriptor: IActionDescriptor): IDisposable;
        getOriginalEditor(): IStandaloneCodeEditor;
        getModifiedEditor(): IStandaloneCodeEditor;
    }

    export interface ILocalizedString {
        original: string;
        value: string;
    }

    export interface IEditorOverrideServices {
        [index: string]: unknown;
    }

    /**
     * A single edit operation, that acts as a simple replace.
     * i.e. Replace text at `range` with `text` in model.
     */
    export interface ISingleEditOperation {
        /**
         * The range to replace. This can be empty to emulate a simple insert.
         */
        range: IRange;
        /**
         * The text to replace with. This can be null to emulate a simple delete.
         */
        text: string | null;
        /**
         * This indicates that this operation has "insert" semantics.
         * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
         */
        forceMoveMarkers?: boolean;
    }

    export interface IGlyphMarginLanesModel {
        /**
         * The number of lanes that should be rendered in the editor.
         */
        readonly requiredLanes: number;
        /**
         * Gets the lanes that should be rendered starting at a given line number.
         */
        getLanesAtLine(lineNumber: number): ED.GlyphMarginLane[];
        /**
         * Resets the model and ensures it can contain at least `maxLine` lines.
         */
        reset(maxLine: number): void;
        /**
         * Registers that a lane should be visible at the Range in the model.
         * @param persist - if true, notes that the lane should always be visible,
         * even on lines where there's no specific request for that lane.
         */
        push(lane: ED.GlyphMarginLane, range: Range, persist?: boolean): void;
    }

    export interface IDecorationOptions {
        /**
         * CSS color to render.
         * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
         */
        color: string | ThemeColor | undefined;
        /**
         * CSS color to render.
         * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
         */
        darkColor?: string | ThemeColor;
    }

    export interface IModelDecorationGlyphMarginOptions {
        /**
         * The position in the glyph margin.
         */
        position: ED.GlyphMarginLane;
        /**
         * Whether the glyph margin lane in {@link position} should be rendered even
         * outside of this decoration's range.
         */
        persistLane?: boolean;
    }

    export interface BracketPairColorizationOptions {
        enabled: boolean;
        independentColorPoolPerBracketType: boolean;
    }

    /**
     * A change
     */
    export interface IChange {
        readonly originalStartLineNumber: number;
        readonly originalEndLineNumber: number;
        readonly modifiedStartLineNumber: number;
        readonly modifiedEndLineNumber: number;
    }

    export interface IDimension {
        width: number;
        height: number;
    }

    /**
     * A model for the diff editor.
     */
    export interface IDiffEditorModel {
        /**
         * Original model.
         */
        original: ITextModel;
        /**
         * Modified model.
         */
        modified: ITextModel;
    }

    export interface IDiffEditorViewModel extends IDisposable {
        readonly model: IDiffEditorModel;
        waitForDiff(): Promise<void>;
    }

    export interface INewScrollPosition {
        scrollLeft?: number;
        scrollTop?: number;
    }

    export type IEditorModel = ITextModel | IDiffEditorModel | IDiffEditorViewModel;

    /**
     * (Serializable) View state for the diff editor.
     */
    export interface IDiffEditorViewState {
        original: ICodeEditorViewState | null;
        modified: ICodeEditorViewState | null;
        modelState?: unknown;
    }

    /**
     * An editor view state.
     */
    export type IEditorViewState = ICodeEditorViewState | IDiffEditorViewState;

    /**
     * An editor.
     */
    export interface IEditor {
        /**
         * An event emitted when the editor has been disposed.
         * @event
         */
        onDidDispose(listener: () => void): IDisposable;
        /**
         * Dispose the editor.
         */
        dispose(): void;
        /**
         * Get a unique id for this editor instance.
         */
        getId(): string;
        /**
         * Get the editor type. Please see `EditorType`.
         * This is to avoid an instanceof check
         */
        getEditorType(): string;
        /**
         * Update the editor's options after the editor has been created.
         */
        updateOptions(newOptions: IEditorOptions): void;
        /**
         * Instructs the editor to remeasure its container. This method should
         * be called when the container of the editor gets resized.
         *
         * If a dimension is passed in, the passed in value will be used.
         *
         * By default, this will also render the editor immediately.
         * If you prefer to delay rendering to the next animation frame, use postponeRendering == true.
         */
        layout(dimension?: IDimension, postponeRendering?: boolean): void;
        /**
         * Brings browser focus to the editor text
         */
        focus(): void;
        /**
         * Returns true if the text inside this editor is focused (i.e. cursor is blinking).
         */
        hasTextFocus(): boolean;
        /**
         * Returns all actions associated with this editor.
         */
        getSupportedActions(): IEditorAction[];
        /**
         * Saves current view state of the editor in a serializable object.
         */
        saveViewState(): IEditorViewState | null;
        /**
         * Restores the view state of the editor from a serializable object generated by `saveViewState`.
         */
        restoreViewState(state: IEditorViewState | null): void;
        /**
         * Given a position, returns a column number that takes tab-widths into account.
         */
        getVisibleColumnFromPosition(position: IPosition): number;
        /**
         * Returns the primary position of the cursor.
         */
        getPosition(): Position | null;
        /**
         * Set the primary position of the cursor. This will remove any secondary cursors.
         * @param position New primary cursor's position
         * @param source Source of the call that caused the position
         */
        setPosition(position: IPosition, source?: string): void;
        /**
         * Scroll vertically as necessary and reveal a line.
         */
        revealLine(lineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal a line centered vertically.
         */
        revealLineInCenter(lineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal a line centered vertically only if it lies outside the viewport.
         */
        revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal a line close to the top of the viewport,
         * optimized for viewing a code definition.
         */
        revealLineNearTop(lineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position.
         */
        revealPosition(position: IPosition, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position centered vertically.
         */
        revealPositionInCenter(position: IPosition, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position centered vertically only if it lies outside the viewport.
         */
        revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a position close to the top of the viewport,
         * optimized for viewing a code definition.
         */
        revealPositionNearTop(position: IPosition, scrollType?: ED.ScrollType): void;
        /**
         * Returns the primary selection of the editor.
         */
        getSelection(): Selection | null;
        /**
         * Returns all the selections of the editor.
         */
        getSelections(): Selection[] | null;
        /**
         * Set the primary selection of the editor. This will remove any secondary cursors.
         * @param selection The new selection
         * @param source Source of the call that caused the selection
         */
        setSelection(selection: IRange, source?: string): void;
        /**
         * Set the primary selection of the editor. This will remove any secondary cursors.
         * @param selection The new selection
         * @param source Source of the call that caused the selection
         */
        setSelection(selection: Range, source?: string): void;
        /**
         * Set the primary selection of the editor. This will remove any secondary cursors.
         * @param selection The new selection
         * @param source Source of the call that caused the selection
         */
        setSelection(selection: ISelection, source?: string): void;
        /**
         * Set the primary selection of the editor. This will remove any secondary cursors.
         * @param selection The new selection
         * @param source Source of the call that caused the selection
         */
        setSelection(selection: Selection, source?: string): void;
        /**
         * Set the selections for all the cursors of the editor.
         * Cursors will be removed or added, as necessary.
         * @param selections The new selection
         * @param source Source of the call that caused the selection
         */
        setSelections(selections: readonly ISelection[], source?: string): void;
        /**
         * Scroll vertically as necessary and reveal lines.
         */
        revealLines(startLineNumber: number, endLineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal lines centered vertically.
         */
        revealLinesInCenter(lineNumber: number, endLineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal lines centered vertically only if it lies outside the viewport.
         */
        revealLinesInCenterIfOutsideViewport(lineNumber: number, endLineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically as necessary and reveal lines close to the top of the viewport,
         * optimized for viewing a code definition.
         */
        revealLinesNearTop(lineNumber: number, endLineNumber: number, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range.
         */
        revealRange(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range centered vertically.
         */
        revealRangeInCenter(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range at the top of the viewport.
         */
        revealRangeAtTop(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
         */
        revealRangeInCenterIfOutsideViewport(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport,
         * optimized for viewing a code definition.
         */
        revealRangeNearTop(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport,
         * optimized for viewing a code definition. Only if it lies outside the viewport.
         */
        revealRangeNearTopIfOutsideViewport(range: IRange, scrollType?: ED.ScrollType): void;
        /**
         * Directly trigger a handler or an editor action.
         * @param source The source of the call.
         * @param handlerId The id of the handler or the id of a contribution.
         * @param payload Extra data to be sent to the handler.
         */
        trigger(source: string | null | undefined, handlerId: string, payload: unknown): void;
        /**
         * Gets the current model attached to this editor.
         */
        getModel(): IEditorModel | null;
        /**
         * Sets the current model attached to this editor.
         * If the previous model was created by the editor via the value key in the options
         * literal object, it will be destroyed. Otherwise, if the previous model was set
         * via setModel, or the model key in the options literal object, the previous model
         * will not be destroyed.
         * It is safe to call setModel(null) to simply detach the current model from the editor.
         */
        setModel(model: IEditorModel | null): void;
        /**
         * Create a collection of decorations. All decorations added through this collection
         * will get the ownerId of the editor (meaning they will not show up in other editors).
         * These decorations will be automatically cleared when the editor's model changes.
         */
        createDecorationsCollection(decorations?: IModelDeltaDecoration[]): IEditorDecorationsCollection;
    }

    /**
     * An editor contribution that gets created every time a new editor gets created and gets disposed when the editor gets disposed.
     */
    export interface IEditorContribution {
        /**
         * Dispose this contribution.
         */
        dispose(): void;
        /**
         * Store view state.
         */
        saveViewState?(): unknown;
        /**
         * Restore view state.
         */
        restoreViewState?(state: unknown): void;
    }

    export interface ISerializedModelContentChangedEvent {
        /**
         * The changes are ordered from the end of the document to the beginning, so they should be safe to apply in sequence.
         */
        readonly changes: IModelContentChange[];
        /**
         * The (new) end-of-line character.
         */
        readonly eol: string;
        /**
         * The new version id the model has transitioned to.
         */
        readonly versionId: number;
        /**
         * Flag that indicates that this event was generated while undoing.
         */
        readonly isUndoing: boolean;
        /**
         * Flag that indicates that this event was generated while redoing.
         */
        readonly isRedoing: boolean;
        /**
         * Flag that indicates that all decorations were lost with this edit.
         * The model has been reset to a new value.
         */
        readonly isFlush: boolean;
        /**
         * Flag that indicates that this event describes an eol change.
         */
        readonly isEolChange: boolean;
    }

    export interface IEditorOption<K extends ED.EditorOption, V> {
        readonly id: K;
        readonly name: string;
        defaultValue: V;
        /**
         * Might modify `value`.
        */
        applyUpdate(value: V | undefined, update: V): ED.ApplyUpdateResult<V>;
    }

    export type FindEditorOptionsKeyById<T extends ED.EditorOption> = {
        [K in keyof EditorOptionsType]: EditorOptionsType[K]['id'] extends T ? K : never;
    }[keyof EditorOptionsType];

    export type ComputedEditorOptionValue<T extends IEditorOption<any, any>> = T extends IEditorOption<any, infer R> ? R : never;

    export type FindComputedEditorOptionValueById<T extends ED.EditorOption> = NonNullable<ComputedEditorOptionValue<EditorOptionsType[FindEditorOptionsKeyById<T>]>>;

    export interface IEditorConstructionOptions extends IEditorOptions {
        /**
         * The initial editor dimension (to avoid measuring the container).
         */
        dimension?: IDimension;
        /**
         * Place overflow widgets inside an external DOM node.
         * Defaults to an internal DOM node.
         */
        overflowWidgetsDomNode?: HTMLElement;
    }

    /**
     * Coordinatees passed in {@link IContentWidget.afterRender}
     */
    export interface IContentWidgetRenderedCoordinate {
        /**
         * Top position relative to the editor content.
         */
        readonly top: number;
        /**
         * Left position relative to the editor content.
         */
        readonly left: number;
    }

    /**
     * Represents editor-relative coordinates of an overlay widget.
     */
    export interface IOverlayWidgetPositionCoordinates {
        /**
         * The top position for the overlay widget, relative to the editor.
         */
        top: number;
        /**
         * The left position for the overlay widget, relative to the editor.
         */
        left: number;
    }

    export interface IDiffEditorConstructionOptions extends IDiffEditorOptions, IEditorConstructionOptions {
        /**
         * Place overflow widgets inside an external DOM node.
         * Defaults to an internal DOM node.
         */
        overflowWidgetsDomNode?: HTMLElement;
        /**
         * Aria label for original editor.
         */
        originalAriaLabel?: string;
        /**
         * Aria label for modified editor.
         */
        modifiedAriaLabel?: string;
    }

    /**
     * A rich code editor.
     */
    export interface ICodeEditor extends IEditor {
        /**
         * An event emitted when the content of the current model has changed.
         * @event
         */
        readonly onDidChangeModelContent: IEvent<IModelContentChangedEvent>;
        /**
         * An event emitted when the language of the current model has changed.
         * @event
         */
        readonly onDidChangeModelLanguage: IEvent<IModelLanguageChangedEvent>;
        /**
         * An event emitted when the language configuration of the current model has changed.
         * @event
         */
        readonly onDidChangeModelLanguageConfiguration: IEvent<IModelLanguageConfigurationChangedEvent>;
        /**
         * An event emitted when the options of the current model has changed.
         * @event
         */
        readonly onDidChangeModelOptions: IEvent<IModelOptionsChangedEvent>;
        /**
         * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
         * @event
         */
        readonly onDidChangeConfiguration: IEvent<ED.ConfigurationChangedEvent>;
        /**
         * An event emitted when the cursor position has changed.
         * @event
         */
        readonly onDidChangeCursorPosition: IEvent<ICursorPositionChangedEvent>;
        /**
         * An event emitted when the cursor selection has changed.
         * @event
         */
        readonly onDidChangeCursorSelection: IEvent<ICursorSelectionChangedEvent>;
        /**
         * An event emitted when the model of this editor is about to change (e.g. from `editor.setModel()`).
         * @event
         */
        readonly onWillChangeModel: IEvent<IModelChangedEvent>;
        /**
         * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
         * @event
         */
        readonly onDidChangeModel: IEvent<IModelChangedEvent>;
        /**
         * An event emitted when the decorations of the current model have changed.
         * @event
         */
        readonly onDidChangeModelDecorations: IEvent<IModelDecorationsChangedEvent>;
        /**
         * An event emitted when the text inside this editor gained focus (i.e. cursor starts blinking).
         * @event
         */
        readonly onDidFocusEditorText: IEvent<void>;
        /**
         * An event emitted when the text inside this editor lost focus (i.e. cursor stops blinking).
         * @event
         */
        readonly onDidBlurEditorText: IEvent<void>;
        /**
         * An event emitted when the text inside this editor or an editor widget gained focus.
         * @event
         */
        readonly onDidFocusEditorWidget: IEvent<void>;
        /**
         * An event emitted when the text inside this editor or an editor widget lost focus.
         * @event
         */
        readonly onDidBlurEditorWidget: IEvent<void>;
        /**
         * Boolean indicating whether input is in composition
         */
        readonly inComposition: boolean;
        /**
         * An event emitted after composition has started.
         */
        readonly onDidCompositionStart: IEvent<void>;
        /**
         * An event emitted after composition has ended.
         */
        readonly onDidCompositionEnd: IEvent<void>;
        /**
         * An event emitted when editing failed because the editor is read-only.
         * @event
         */
        readonly onDidAttemptReadOnlyEdit: IEvent<void>;
        /**
         * An event emitted when users paste text in the editor.
         * @event
         */
        readonly onDidPaste: IEvent<IPasteEvent>;
        /**
         * An event emitted on a "mouseup".
         * @event
         */
        readonly onMouseUp: IEvent<IEditorMouseEvent>;
        /**
         * An event emitted on a "mousedown".
         * @event
         */
        readonly onMouseDown: IEvent<IEditorMouseEvent>;
        /**
         * An event emitted on a "contextmenu".
         * @event
         */
        readonly onContextMenu: IEvent<IEditorMouseEvent>;
        /**
         * An event emitted on a "mousemove".
         * @event
         */
        readonly onMouseMove: IEvent<IEditorMouseEvent>;
        /**
         * An event emitted on a "mouseleave".
         * @event
         */
        readonly onMouseLeave: IEvent<IPartialEditorMouseEvent>;
        /**
         * An event emitted on a "keyup".
         * @event
         */
        readonly onKeyUp: IEvent<IKeyboardEvent>;
        /**
         * An event emitted on a "keydown".
         * @event
         */
        readonly onKeyDown: IEvent<IKeyboardEvent>;
        /**
         * An event emitted when the layout of the editor has changed.
         * @event
         */
        readonly onDidLayoutChange: IEvent<EditorLayoutInfo>;
        /**
         * An event emitted when the content width or content height in the editor has changed.
         * @event
         */
        readonly onDidContentSizeChange: IEvent<IContentSizeChangedEvent>;
        /**
         * An event emitted when the scroll in the editor has changed.
         * @event
         */
        readonly onDidScrollChange: IEvent<IScrollEvent>;
        /**
         * An event emitted when hidden areas change in the editor (e.g. due to folding).
         * @event
         */
        readonly onDidChangeHiddenAreas: IEvent<void>;
        /**
         * Some editor operations fire multiple events at once.
         * To allow users to react to multiple events fired by a single operation,
         * the editor fires a begin update before the operation and an end update after the operation.
         * Whenever the editor fires `onBeginUpdate`, it will also fire `onEndUpdate` once the operation finishes.
         * Note that not all operations are bracketed by `onBeginUpdate` and `onEndUpdate`.
        */
        readonly onBeginUpdate: IEvent<void>;
        /**
         * Fires after the editor completes the operation it fired `onBeginUpdate` for.
        */
        readonly onEndUpdate: IEvent<void>;
        /**
         * Saves current view state of the editor in a serializable object.
         */
        saveViewState(): ICodeEditorViewState | null;
        /**
         * Restores the view state of the editor from a serializable object generated by `saveViewState`.
         */
        restoreViewState(state: ICodeEditorViewState | null): void;
        /**
         * Returns true if the text inside this editor or an editor widget has focus.
         */
        hasWidgetFocus(): boolean;
        /**
         * Get a contribution of this editor.
         * @id Unique identifier of the contribution.
         * @return The contribution or null if contribution not found.
         */
        getContribution<T extends IEditorContribution>(id: string): T | null;
        /**
         * Type the getModel() of IEditor.
         */
        getModel(): ITextModel | null;
        /**
         * Sets the current model attached to this editor.
         * If the previous model was created by the editor via the value key in the options
         * literal object, it will be destroyed. Otherwise, if the previous model was set
         * via setModel, or the model key in the options literal object, the previous model
         * will not be destroyed.
         * It is safe to call setModel(null) to simply detach the current model from the editor.
         */
        setModel(model: ITextModel | null): void;
        /**
         * Gets all the editor computed options.
         */
        getOptions(): IComputedEditorOptions;
        /**
         * Gets a specific editor option.
         */
        getOption<T extends ED.EditorOption>(id: T): FindComputedEditorOptionValueById<T>;
        /**
         * Returns the editor's configuration (without any validation or defaults).
         */
        getRawOptions(): IEditorOptions;
        /**
         * Get value of the current model attached to this editor.
         * @see {@link ITextModel.getValue}
         */
        getValue(options?: {
            preserveBOM: boolean;
            lineEnding: string;
        }): string;
        /**
         * Set the value of the current model attached to this editor.
         * @see {@link ITextModel.setValue}
         */
        setValue(newValue: string): void;
        /**
         * Get the width of the editor's content.
         * This is information that is "erased" when computing `scrollWidth = Math.max(contentWidth, width)`
         */
        getContentWidth(): number;
        /**
         * Get the scrollWidth of the editor's viewport.
         */
        getScrollWidth(): number;
        /**
         * Get the scrollLeft of the editor's viewport.
         */
        getScrollLeft(): number;
        /**
         * Get the height of the editor's content.
         * This is information that is "erased" when computing `scrollHeight = Math.max(contentHeight, height)`
         */
        getContentHeight(): number;
        /**
         * Get the scrollHeight of the editor's viewport.
         */
        getScrollHeight(): number;
        /**
         * Get the scrollTop of the editor's viewport.
         */
        getScrollTop(): number;
        /**
         * Change the scrollLeft of the editor's viewport.
         */
        setScrollLeft(newScrollLeft: number, scrollType?: ED.ScrollType): void;
        /**
         * Change the scrollTop of the editor's viewport.
         */
        setScrollTop(newScrollTop: number, scrollType?: ED.ScrollType): void;
        /**
         * Change the scroll position of the editor's viewport.
         */
        setScrollPosition(position: INewScrollPosition, scrollType?: ED.ScrollType): void;
        /**
         * Check if the editor is currently scrolling towards a different scroll position.
         */
        hasPendingScrollAnimation(): boolean;
        /**
         * Get an action that is a contribution to this editor.
         * @id Unique identifier of the contribution.
         * @return The action or null if action not found.
         */
        getAction(id: string): IEditorAction | null;
        /**
         * Execute a command on the editor.
         * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
         * @param source The source of the call.
         * @param command The command to execute
         */
        executeCommand(source: string | null | undefined, command: ICommand): void;
        /**
         * Create an "undo stop" in the undo-redo stack.
         */
        pushUndoStop(): boolean;
        /**
         * Remove the "undo stop" in the undo-redo stack.
         */
        popUndoStop(): boolean;
        /**
         * Execute edits on the editor.
         * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
         * @param source The source of the call.
         * @param edits The edits to execute.
         * @param endCursorState Cursor state after the edits were applied.
         */
        executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | Selection[]): boolean;
        /**
         * Execute multiple (concomitant) commands on the editor.
         * @param source The source of the call.
         * @param command The commands to execute
         */
        executeCommands(source: string | null | undefined, commands: (ICommand | null)[]): void;
        /**
         * Get all the decorations on a line (filtering out decorations from other editors).
         */
        getLineDecorations(lineNumber: number): IModelDecoration[] | null;
        /**
         * Get all the decorations for a range (filtering out decorations from other editors).
         */
        getDecorationsInRange(range: Range): IModelDecoration[] | null;
        /**
         * Get the font size at a given position
         * @param position the position for which to fetch the font size
         */
        getFontSizeAtPosition(position: IPosition): string | null;
        /**
         * All decorations added through this call will get the ownerId of this editor.
         * @deprecated Use `createDecorationsCollection`
         * @see createDecorationsCollection
         */
        deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];
        /**
         * Remove previously added decorations.
         */
        removeDecorations(decorationIds: string[]): void;
        /**
         * Get the layout info for the editor.
         */
        getLayoutInfo(): EditorLayoutInfo;
        /**
         * Returns the ranges that are currently visible.
         * Does not account for horizontal scrolling.
         */
        getVisibleRanges(): Range[];
        /**
         * Get the vertical position (top offset) for the line's top w.r.t. to the first line.
         */
        getTopForLineNumber(lineNumber: number, includeViewZones?: boolean): number;
        /**
         * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
         */
        getBottomForLineNumber(lineNumber: number): number;
        /**
         * Get the vertical position (top offset) for the position w.r.t. to the first line.
         */
        getTopForPosition(lineNumber: number, column: number): number;
        /**
         * Get the line height for a model position.
         */
        getLineHeightForPosition(position: IPosition): number;
        /**
         * Write the screen reader content to be the current selection
         */
        writeScreenReaderContent(reason: string): void;
        /**
         * Returns the editor's container dom node
         */
        getContainerDomNode(): HTMLElement;
        /**
         * Returns the editor's dom node
         */
        getDomNode(): HTMLElement | null;
        /**
         * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
         */
        addContentWidget(widget: IContentWidget): void;
        /**
         * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
         * and update appropriately.
         */
        layoutContentWidget(widget: IContentWidget): void;
        /**
         * Remove a content widget.
         */
        removeContentWidget(widget: IContentWidget): void;
        /**
         * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
         */
        addOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
         * and update appropriately.
         */
        layoutOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Remove an overlay widget.
         */
        removeOverlayWidget(widget: IOverlayWidget): void;
        /**
         * Add a glyph margin widget. Widgets must have unique ids, otherwise they will be overwritten.
         */
        addGlyphMarginWidget(widget: IGlyphMarginWidget): void;
        /**
         * Layout/Reposition a glyph margin widget. This is a ping to the editor to call widget.getPosition()
         * and update appropriately.
         */
        layoutGlyphMarginWidget(widget: IGlyphMarginWidget): void;
        /**
         * Remove a glyph margin widget.
         */
        removeGlyphMarginWidget(widget: IGlyphMarginWidget): void;
        /**
         * Change the view zones. View zones are lost when a new model is attached to the editor.
         */
        changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;
        /**
         * Get the horizontal position (left offset) for the column w.r.t to the beginning of the line.
         * This method works only if the line `lineNumber` is currently rendered (in the editor's viewport).
         * Use this method with caution.
         */
        getOffsetForColumn(lineNumber: number, column: number): number;
        /**
         * Force an editor render now.
         */
        render(forceRedraw?: boolean): void;
        /**
         * Get the hit test target at coordinates `clientX` and `clientY`.
         * The coordinates are relative to the top-left of the viewport.
         *
         * @returns Hit test target or null if the coordinates fall outside the editor or the editor has no model.
         */
        getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null;
        /**
         * Get the visible position for `position`.
         * The result position takes scrolling into account and is relative to the top left corner of the editor.
         * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
         * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
         * Warning: the results of this method are inaccurate for positions that are outside the current editor viewport.
         */
        getScrolledVisiblePosition(position: IPosition): {
            top: number;
            left: number;
            height: number;
        } | null;
        /**
         * Apply the same font settings as the editor to `target`.
         */
        applyFontInfo(target: HTMLElement): void;
        setBanner(bannerDomNode: HTMLElement | null, height: number): void;
        /**
         * Is called when the model has been set, view state was restored and options are updated.
         * This is the best place to compute data for the viewport (such as tokens).
         */
        handleInitialized?(): void;
    }

    /**
     * A rich diff editor.
     */
    export interface IDiffEditor extends IEditor {
        /**
         * @see {@link ICodeEditor.getContainerDomNode}
         */
        getContainerDomNode(): HTMLElement;
        /**
         * An event emitted when the diff information computed by this diff editor has been updated.
         * @event
         */
        readonly onDidUpdateDiff: IEvent<void>;
        /**
         * An event emitted when the diff model is changed (i.e. the diff editor shows new content).
         * @event
         */
        readonly onDidChangeModel: IEvent<void>;
        /**
         * Saves current view state of the editor in a serializable object.
         */
        saveViewState(): IDiffEditorViewState | null;
        /**
         * Restores the view state of the editor from a serializable object generated by `saveViewState`.
         */
        restoreViewState(state: IDiffEditorViewState | null): void;
        /**
         * Type the getModel() of IEditor.
         */
        getModel(): IDiffEditorModel | null;
        createViewModel(model: IDiffEditorModel): IDiffEditorViewModel;
        /**
         * Sets the current model attached to this editor.
         * If the previous model was created by the editor via the value key in the options
         * literal object, it will be destroyed. Otherwise, if the previous model was set
         * via setModel, or the model key in the options literal object, the previous model
         * will not be destroyed.
         * It is safe to call setModel(null) to simply detach the current model from the editor.
         */
        setModel(model: IDiffEditorModel | IDiffEditorViewModel | null): void;
        /**
         * Get the `original` editor.
         */
        getOriginalEditor(): ICodeEditor;
        /**
         * Get the `modified` editor.
         */
        getModifiedEditor(): ICodeEditor;
        /**
         * Get the computed diff information.
         */
        getLineChanges(): ILineChange[] | null;
        /**
         * Update the editor's options after the editor has been created.
         */
        updateOptions(newOptions: IDiffEditorOptions): void;
        /**
         * Jumps to the next or previous diff.
         */
        goToDiff(target: 'next' | 'previous'): void;
        /**
         * Scrolls to the first diff.
         * (Waits until the diff computation finished.)
         */
        revealFirstDiff(): unknown;
        accessibleDiffViewerNext(): void;
        accessibleDiffViewerPrev(): void;
        handleInitialized(): void;
    }

    export interface IEditorZoom {
        readonly onDidChangeZoomLevel: IEvent<number>;
        getZoomLevel(): number;
        setZoomLevel(zoomLevel: number): void;
    }

    //compatibility:
    export type IReadOnlyModel = ITextModel;

    export type IModel = ITextModel;
