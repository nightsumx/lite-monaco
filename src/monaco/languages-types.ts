// 由 scripts/gen-monaco-types.ts 生成,勿手改(改 __tests__/types/monaco-types-gen.ts 的 MAP/生成逻辑)。
// monaco.languages 的类型出口(接口/类型别名;枚举与类是值,由 ./languages 导出)。
// 声明移植自 monaco-editor 0.55.1 的 monaco.d.ts(Microsoft, MIT);已有 lite-monaco 等价类型的名字直接映射到它。


import type { CancellationToken, IEvent, IMarkdownString, IPosition, IRange, Position, Range, Thenable, Uri, UriComponents } from './top-types'
import type { LanguageSelector } from '../lang/languageselector'
import type { LanguageFilter } from '../lang/languageselector'
import type { IToken } from '../api/standalonelanguages'
import type { ILineTokens } from '../api/standalonelanguages'
import type { IEncodedLineTokens } from '../api/standalonelanguages'
import type { TokensProviderFactory } from '../api/standalonelanguages'
import type { TokensProvider } from '../api/standalonelanguages'
import type { EncodedTokensProvider } from '../api/standalonelanguages'
import type { CodeActionContext } from '../lang/codeaction'
import type { CodeActionProvider } from '../lang/codeaction'
import type { CommentRule } from '../api/languages'
import type { LanguageConfiguration } from '../api/languages'
import type { IndentationRule } from '../api/languages'
import type { FoldingMarkers } from '../api/languages'
import type { FoldingRules } from '../api/languages'
import type { OnEnterRule } from '../api/languages'
import type { CharacterPair } from '../api/languages'
import type { IAutoClosingPair } from '../api/languages'
import type { IAutoClosingPairConditional } from '../api/languages'
import type { EnterAction } from '../api/languages'
import type { IState } from '../api/tokenization'
import type { PartialAcceptInfo } from '../lang/inline/types'
import type { CompletionItemProvider } from '../lang/providers'
import type { InlineCompletionContext } from '../lang/inline/types'
import type { InlineCompletion } from '../lang/inline/types'
import type { InlineCompletionWarning } from '../lang/inline/types'
import type { InlineCompletionHint } from '../lang/inline/types'
import type { InlineCompletions } from '../lang/inline/types'
import type { InlineCompletionCommand } from '../lang/inline/types'
import type { InlineCompletionsProvider } from '../lang/inline/types'
import type { InlineCompletionsDisposeReason } from '../lang/inline/types'
import type { InlineCompletionEndOfLifeReason } from '../lang/inline/types'
import type { CodeAction } from '../lang/codeaction'
import type { CodeActionList } from '../lang/codeaction'
import type { ParameterInformation } from '../lang/signaturehelp'
import type { SignatureInformation } from '../lang/signaturehelp'
import type { SignatureHelp } from '../lang/signaturehelp'
import type { SignatureHelpResult } from '../lang/signaturehelp'
import type { SignatureHelpContext } from '../lang/signaturehelp'
import type { SignatureHelpProvider } from '../lang/signaturehelp'
import type { LinkedEditingRangeProvider } from '../lang/languagefeatures'
import type { LinkedEditingRanges } from '../lang/languagefeatures'
import type { DefinitionProvider } from '../lang/providers'
import type { DocumentSymbol } from '../lang/languagefeatures'
import type { DocumentSymbolProvider } from '../lang/languagefeatures'
import type { SelectionRangeProvider } from '../lang/providers'
import type { FoldingRangeProvider } from '../lang/providers'
import type { Command } from '../lang/inline/types'
import type { InlayHintsProvider } from '../lang/providers'
import type { SemanticTokensLegend } from '../lang/semantictokens'
import type { SemanticTokens } from '../lang/semantictokens'
import type { SemanticTokensEdit } from '../lang/semantictokens'
import type { SemanticTokensEdits } from '../lang/semantictokens'
import type { DocumentSemanticTokensProvider } from '../lang/semantictokens'
import type { DocumentRangeSemanticTokensProvider } from '../lang/semantictokens'
import type { ILanguageExtensionPoint } from '../api/languages'
import type { IMonarchLanguage } from '../lang/monarch/monarchTypes'
import type { IShortMonarchLanguageRule1 } from '../lang/monarch/monarchTypes'
import type { IShortMonarchLanguageRule2 } from '../lang/monarch/monarchTypes'
import type { IExpandedMonarchLanguageRule } from '../lang/monarch/monarchTypes'
import type { IMonarchLanguageRule } from '../lang/monarch/monarchTypes'
import type { IShortMonarchLanguageAction } from '../lang/monarch/monarchTypes'
import type { IExpandedMonarchLanguageAction } from '../lang/monarch/monarchTypes'
import type { IMonarchLanguageAction } from '../lang/monarch/monarchTypes'
import type { IMonarchLanguageBracket } from '../lang/monarch/monarchTypes'
import type * as ED from './editor'
import type * as LG from './languages'

export type { LanguageSelector, LanguageFilter, IToken, ILineTokens, IEncodedLineTokens, TokensProviderFactory, TokensProvider, EncodedTokensProvider, CodeActionContext, CodeActionProvider, CommentRule, LanguageConfiguration, IndentationRule, FoldingMarkers, FoldingRules, OnEnterRule, CharacterPair, IAutoClosingPair, IAutoClosingPairConditional, EnterAction, IState, PartialAcceptInfo, CompletionItemProvider, InlineCompletionContext, InlineCompletion, InlineCompletionWarning, InlineCompletionHint, InlineCompletions, InlineCompletionCommand, InlineCompletionsProvider, InlineCompletionsDisposeReason, InlineCompletionEndOfLifeReason, CodeAction, CodeActionList, ParameterInformation, SignatureInformation, SignatureHelp, SignatureHelpResult, SignatureHelpContext, SignatureHelpProvider, LinkedEditingRangeProvider, LinkedEditingRanges, DefinitionProvider, DocumentSymbol, DocumentSymbolProvider, SelectionRangeProvider, FoldingRangeProvider, Command, InlayHintsProvider, SemanticTokensLegend, SemanticTokens, SemanticTokensEdit, SemanticTokensEdits, DocumentSemanticTokensProvider, DocumentRangeSemanticTokensProvider, ILanguageExtensionPoint, IMonarchLanguage, IShortMonarchLanguageRule1, IShortMonarchLanguageRule2, IExpandedMonarchLanguageRule, IMonarchLanguageRule, IShortMonarchLanguageAction, IExpandedMonarchLanguageAction, IMonarchLanguageAction, IMonarchLanguageBracket }

    export interface IRelativePattern {
        /**
         * A base file path to which this pattern will be matched against relatively.
         */
        readonly base: string;
        /**
         * A file glob pattern like `*.{ts,js}` that will be matched on file paths
         * relative to the base path.
         *
         * Example: Given a base of `/home/work/folder` and a file path of `/home/work/folder/index.js`,
         * the file glob pattern will match on `index.js`.
         */
        readonly pattern: string;
    }

    /**
     * Metadata about the type of code actions that a {@link CodeActionProvider} provides.
     */
    export interface CodeActionProviderMetadata {
        /**
         * List of code action kinds that a {@link CodeActionProvider} may return.
         *
         * This list is used to determine if a given `CodeActionProvider` should be invoked or not.
         * To avoid unnecessary computation, every `CodeActionProvider` should list use `providedCodeActionKinds`. The
         * list of kinds may either be generic, such as `["quickfix", "refactor", "source"]`, or list out every kind provided,
         * such as `["quickfix.removeLine", "source.fixAll" ...]`.
         */
        readonly providedCodeActionKinds?: readonly string[];
        readonly documentation?: ReadonlyArray<{
            readonly kind: string;
            readonly command: Command;
        }>;
    }

    /**
     * Configuration for line comments.
     */
    export interface LineCommentConfig {
        /**
         * The line comment token, like `//`
         */
        comment: string;
        /**
         * Whether the comment token should not be indented and placed at the first column.
         * Defaults to false.
         */
        noIndent?: boolean;
    }

    /**
     * Definition of documentation comments (e.g. Javadoc/JSdoc)
     */
    export interface IDocComment {
        /**
         * The string that starts a doc comment (e.g. '/**')
         */
        open: string;
        /**
         * The string that appears on the last line and closes the doc comment (e.g. ' * /').
         */
        close?: string;
    }

    export interface SyntaxNode {
        startIndex: number;
        endIndex: number;
        startPosition: IPosition;
        endPosition: IPosition;
    }

    export interface QueryCapture {
        name: string;
        text?: string;
        node: SyntaxNode;
        encodedLanguageId: number;
    }

    /**
     * A provider result represents the values a provider, like the {@link HoverProvider},
     * may return. For once this is the actual result type `T`, like `Hover`, or a thenable that resolves
     * to that type `T`. In addition, `null` and `undefined` can be returned - either directly or from a
     * thenable.
     */
    export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

    /**
     * A hover represents additional information for a symbol or word. Hovers are
     * rendered in a tooltip-like widget.
     */
    export interface Hover {
        /**
         * The contents of this hover.
         */
        contents: IMarkdownString[];
        /**
         * The range to which this hover applies. When missing, the
         * editor will use the range at the current position or the
         * current position itself.
         */
        range?: IRange;
        /**
         * Can increase the verbosity of the hover
         */
        canIncreaseVerbosity?: boolean;
        /**
         * Can decrease the verbosity of the hover
         */
        canDecreaseVerbosity?: boolean;
    }

    /**
     * The hover provider interface defines the contract between extensions and
     * the [hover](https://code.visualstudio.com/docs/editor/intellisense)-feature.
     */
    export interface HoverProvider<THover = Hover> {
        /**
         * Provide a hover for the given position, context and document. Multiple hovers at the same
         * position will be merged by the editor. A hover can have a range which defaults
         * to the word range at the position when omitted.
         */
        provideHover(model: ED.ITextModel, position: Position, token: CancellationToken, context?: HoverContext<THover>): ProviderResult<THover>;
    }

    export interface HoverContext<THover = Hover> {
        /**
         * Hover verbosity request
         */
        verbosityRequest?: HoverVerbosityRequest<THover>;
    }

    export interface HoverVerbosityRequest<THover = Hover> {
        /**
         * The delta by which to increase/decrease the hover verbosity level
         */
        verbosityDelta: number;
        /**
         * The previous hover for the same position
         */
        previousHover: THover;
    }

    export interface CompletionItemLabel {
        label: string;
        detail?: string;
        description?: string;
    }

    export interface CompletionItemRanges {
        insert: IRange;
        replace: IRange;
    }

    /**
     * A completion item represents a text snippet that is
     * proposed to complete text that is being typed.
     */
    export interface CompletionItem {
        /**
         * The label of this completion item. By default
         * this is also the text that is inserted when selecting
         * this completion.
         */
        label: string | CompletionItemLabel;
        /**
         * The kind of this completion item. Based on the kind
         * an icon is chosen by the editor.
         */
        kind: LG.CompletionItemKind;
        /**
         * A modifier to the `kind` which affect how the item
         * is rendered, e.g. Deprecated is rendered with a strikeout
         */
        tags?: ReadonlyArray<LG.CompletionItemTag>;
        /**
         * A human-readable string with additional information
         * about this item, like type or symbol information.
         */
        detail?: string;
        /**
         * A human-readable string that represents a doc-comment.
         */
        documentation?: string | IMarkdownString;
        /**
         * A string that should be used when comparing this item
         * with other items. When `falsy` the {@link CompletionItem.label label}
         * is used.
         */
        sortText?: string;
        /**
         * A string that should be used when filtering a set of
         * completion items. When `falsy` the {@link CompletionItem.label label}
         * is used.
         */
        filterText?: string;
        /**
         * Select this item when showing. *Note* that only one completion item can be selected and
         * that the editor decides which item that is. The rule is that the *first* item of those
         * that match best is selected.
         */
        preselect?: boolean;
        /**
         * A string or snippet that should be inserted in a document when selecting
         * this completion.
         */
        insertText: string;
        /**
         * Additional rules (as bitmask) that should be applied when inserting
         * this completion.
         */
        insertTextRules?: LG.CompletionItemInsertTextRule;
        /**
         * A range of text that should be replaced by this completion item.
         *
         * *Note:* The range must be a {@link Range.isSingleLine single line} and it must
         * {@link Range.contains contain} the position at which completion has been {@link CompletionItemProvider.provideCompletionItems requested}.
         */
        range: IRange | CompletionItemRanges;
        /**
         * An optional set of characters that when pressed while this completion is active will accept it first and
         * then type that character. *Note* that all commit characters should have `length=1` and that superfluous
         * characters will be ignored.
         */
        commitCharacters?: string[];
        /**
         * An optional array of additional text edits that are applied when
         * selecting this completion. Edits must not overlap with the main edit
         * nor with themselves.
         */
        additionalTextEdits?: ED.ISingleEditOperation[];
        /**
         * A command that should be run upon acceptance of this item.
         */
        command?: Command;
        /**
         * A command that should be run upon acceptance of this item.
         */
        action?: Command;
    }

    export interface CompletionList {
        suggestions: CompletionItem[];
        incomplete?: boolean;
        dispose?(): void;
    }

    /**
     * Contains additional information about the context in which
     * {@link CompletionItemProvider.provideCompletionItems completion provider} is triggered.
     */
    export interface CompletionContext {
        /**
         * How the completion was triggered.
         */
        triggerKind: LG.CompletionTriggerKind;
        /**
         * Character that triggered the completion item provider.
         *
         * `undefined` if provider was not triggered by a character.
         */
        triggerCharacter?: string;
    }

    export type IconPath = ED.ThemeIcon;

    export type InlineCompletionProviderGroupId = string;

    export type LifetimeSummary = {
        requestUuid: string;
        correlationId: string | undefined;
        partiallyAccepted: number;
        partiallyAcceptedCountSinceOriginal: number;
        partiallyAcceptedRatioSinceOriginal: number;
        partiallyAcceptedCharactersSinceOriginal: number;
        shown: boolean;
        shownDuration: number;
        shownDurationUncollapsed: number;
        timeUntilShown: number | undefined;
        timeUntilProviderRequest: number;
        timeUntilProviderResponse: number;
        notShownReason: string | undefined;
        editorType: string;
        viewKind: string | undefined;
        preceeded: boolean;
        languageId: string;
        requestReason: string;
        cursorColumnDistance?: number;
        cursorLineDistance?: number;
        lineCountOriginal?: number;
        lineCountModified?: number;
        characterCountOriginal?: number;
        characterCountModified?: number;
        disjointReplacements?: number;
        sameShapeReplacements?: boolean;
        typingInterval: number;
        typingIntervalCharacterCount: number;
        selectedSuggestionInfo: boolean;
        availableProviders: string;
    };

    /**
     * A document highlight is a range inside a text document which deserves
     * special attention. Usually a document highlight is visualized by changing
     * the background color of its range.
     */
    export interface DocumentHighlight {
        /**
         * The range this highlight applies to.
         */
        range: IRange;
        /**
         * The highlight kind, default is {@link DocumentHighlightKind.Text text}.
         */
        kind?: LG.DocumentHighlightKind;
    }

    /**
     * Represents a set of document highlights for a specific Uri.
     */
    export interface MultiDocumentHighlight {
        /**
         * The Uri of the document that the highlights belong to.
         */
        uri: Uri;
        /**
         * The set of highlights for the document.
         */
        highlights: DocumentHighlight[];
    }

    /**
     * The document highlight provider interface defines the contract between extensions and
     * the word-highlight-feature.
     */
    export interface DocumentHighlightProvider {
        /**
         * Provide a set of document highlights, like all occurrences of a variable or
         * all exit-points of a function.
         */
        provideDocumentHighlights(model: ED.ITextModel, position: Position, token: CancellationToken): ProviderResult<DocumentHighlight[]>;
    }

    /**
     * A provider that can provide document highlights across multiple documents.
     */
    export interface MultiDocumentHighlightProvider {
        readonly selector: LanguageSelector;
        /**
         * Provide a Map of Uri --> document highlights, like all occurrences of a variable or
         * all exit-points of a function.
         *
         * Used in cases such as split view, notebooks, etc. where there can be multiple documents
         * with shared symbols.
         *
         * @param primaryModel The primary text model.
         * @param position The position at which to provide document highlights.
         * @param otherModels The other text models to search for document highlights.
         * @param token A cancellation token.
         * @returns A map of Uri to document highlights.
         */
        provideMultiDocumentHighlights(primaryModel: ED.ITextModel, position: Position, otherModels: ED.ITextModel[], token: CancellationToken): ProviderResult<Map<Uri, DocumentHighlight[]>>;
    }

    /**
     * Value-object that contains additional information when
     * requesting references.
     */
    export interface ReferenceContext {
        /**
         * Include the declaration of the current symbol.
         */
        includeDeclaration: boolean;
    }

    /**
     * The reference provider interface defines the contract between extensions and
     * the [find references](https://code.visualstudio.com/docs/editor/editingevolved#_peek)-feature.
     */
    export interface ReferenceProvider {
        /**
         * Provide a set of project-wide references for the given position and document.
         */
        provideReferences(model: ED.ITextModel, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]>;
    }

    /**
     * Represents a location inside a resource, such as a line
     * inside a text file.
     */
    export interface Location {
        /**
         * The resource identifier of this location.
         */
        uri: Uri;
        /**
         * The document range of this locations.
         */
        range: IRange;
    }

    export interface LocationLink {
        /**
         * A range to select where this link originates from.
         */
        originSelectionRange?: IRange;
        /**
         * The target uri this link points to.
         */
        uri: Uri;
        /**
         * The full range this link points to.
         */
        range: IRange;
        /**
         * A range to select this link points to. Must be contained
         * in `LocationLink.range`.
         */
        targetSelectionRange?: IRange;
    }

    export type Definition = Location | Location[] | LocationLink[];

    /**
     * The definition provider interface defines the contract between extensions and
     * the [go to definition](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition)
     * and peek definition features.
     */
    export interface DeclarationProvider {
        /**
         * Provide the declaration of the symbol at the given position and document.
         */
        provideDeclaration(model: ED.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
    }

    /**
     * The implementation provider interface defines the contract between extensions and
     * the go to implementation feature.
     */
    export interface ImplementationProvider {
        /**
         * Provide the implementation of the symbol at the given position and document.
         */
        provideImplementation(model: ED.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
    }

    /**
     * The type definition provider interface defines the contract between extensions and
     * the go to type definition feature.
     */
    export interface TypeDefinitionProvider {
        /**
         * Provide the type definition of the symbol at the given position and document.
         */
        provideTypeDefinition(model: ED.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
    }

    export interface TextEdit {
        range: IRange;
        text: string;
        eol?: ED.EndOfLineSequence;
    }

    /**
     * Interface used to format a model
     */
    export interface FormattingOptions {
        /**
         * Size of a tab in spaces.
         */
        tabSize: number;
        /**
         * Prefer spaces over tabs.
         */
        insertSpaces: boolean;
    }

    /**
     * The document formatting provider interface defines the contract between extensions and
     * the formatting-feature.
     */
    export interface DocumentFormattingEditProvider {
        readonly displayName?: string;
        /**
         * Provide formatting edits for a whole document.
         */
        provideDocumentFormattingEdits(model: ED.ITextModel, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
    }

    /**
     * The document formatting provider interface defines the contract between extensions and
     * the formatting-feature.
     */
    export interface DocumentRangeFormattingEditProvider {
        readonly displayName?: string;
        /**
         * Provide formatting edits for a range in a document.
         *
         * The given range is a hint and providers can decide to format a smaller
         * or larger range. Often this is done by adjusting the start and end
         * of the range to full syntax nodes.
         */
        provideDocumentRangeFormattingEdits(model: ED.ITextModel, range: Range, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
        provideDocumentRangesFormattingEdits?(model: ED.ITextModel, ranges: Range[], options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
    }

    /**
     * The document formatting provider interface defines the contract between extensions and
     * the formatting-feature.
     */
    export interface OnTypeFormattingEditProvider {
        autoFormatTriggerCharacters: string[];
        /**
         * Provide formatting edits after a character has been typed.
         *
         * The given position and character should hint to the provider
         * what range the position to expand to, like find the matching `{`
         * when `}` has been entered.
         */
        provideOnTypeFormattingEdits(model: ED.ITextModel, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
    }

    /**
     * A link inside the editor.
     */
    export interface ILink {
        range: IRange;
        url?: Uri | string;
        tooltip?: string;
    }

    export interface ILinksList {
        links: ILink[];
        dispose?(): void;
    }

    /**
     * A provider of links.
     */
    export interface LinkProvider {
        provideLinks(model: ED.ITextModel, token: CancellationToken): ProviderResult<ILinksList>;
        resolveLink?: (link: ILink, token: CancellationToken) => ProviderResult<ILink>;
    }

    /**
     * A color in RGBA format.
     */
    export interface IColor {
        /**
         * The red component in the range [0-1].
         */
        readonly red: number;
        /**
         * The green component in the range [0-1].
         */
        readonly green: number;
        /**
         * The blue component in the range [0-1].
         */
        readonly blue: number;
        /**
         * The alpha component in the range [0-1].
         */
        readonly alpha: number;
    }

    /**
     * String representations for a color
     */
    export interface IColorPresentation {
        /**
         * The label of this color presentation. It will be shown on the color
         * picker header. By default this is also the text that is inserted when selecting
         * this color presentation.
         */
        label: string;
        /**
         * An {@link TextEdit edit} which is applied to a document when selecting
         * this presentation for the color.
         */
        textEdit?: TextEdit;
        /**
         * An optional array of additional {@link TextEdit text edits} that are applied when
         * selecting this color presentation.
         */
        additionalTextEdits?: TextEdit[];
    }

    /**
     * A color range is a range in a text model which represents a color.
     */
    export interface IColorInformation {
        /**
         * The range within the model.
         */
        range: IRange;
        /**
         * The color represented in this range.
         */
        color: IColor;
    }

    /**
     * A provider of colors for editor models.
     */
    export interface DocumentColorProvider {
        /**
         * Provides the color ranges for a specific model.
         */
        provideDocumentColors(model: ED.ITextModel, token: CancellationToken): ProviderResult<IColorInformation[]>;
        /**
         * Provide the string representations for a color.
         */
        provideColorPresentations(model: ED.ITextModel, colorInfo: IColorInformation, token: CancellationToken): ProviderResult<IColorPresentation[]>;
    }

    export interface SelectionRange {
        range: IRange;
    }

    export interface FoldingContext {
    }

    export interface FoldingRange {
        /**
         * The one-based start line of the range to fold. The folded area starts after the line's last character.
         */
        start: number;
        /**
         * The one-based end line of the range to fold. The folded area ends with the line's last character.
         */
        end: number;
        /**
         * Describes the {@link FoldingRangeKind Kind} of the folding range such as {@link FoldingRangeKind.Comment Comment} or
         * {@link FoldingRangeKind.Region Region}. The kind is used to categorize folding ranges and used by commands
         * like 'Fold all comments'. See
         * {@link FoldingRangeKind} for an enumeration of standardized kinds.
         */
        kind?: LG.FoldingRangeKind;
    }

    export interface WorkspaceEditMetadata {
        needsConfirmation: boolean;
        label: string;
        description?: string;
    }

    export interface WorkspaceFileEditOptions {
        overwrite?: boolean;
        ignoreIfNotExists?: boolean;
        ignoreIfExists?: boolean;
        recursive?: boolean;
        copy?: boolean;
        folder?: boolean;
        skipTrashBin?: boolean;
        maxSize?: number;
    }

    export interface IWorkspaceFileEdit {
        oldResource?: Uri;
        newResource?: Uri;
        options?: WorkspaceFileEditOptions;
        metadata?: WorkspaceEditMetadata;
    }

    export interface IWorkspaceTextEdit {
        resource: Uri;
        textEdit: TextEdit & {
            insertAsSnippet?: boolean;
            keepWhitespace?: boolean;
        };
        versionId: number | undefined;
        metadata?: WorkspaceEditMetadata;
    }

    export interface WorkspaceEdit {
        edits: Array<IWorkspaceTextEdit | IWorkspaceFileEdit | ICustomEdit>;
    }

    export interface ICustomEdit {
        readonly resource: Uri;
        readonly metadata?: WorkspaceEditMetadata;
        undo(): Promise<void> | void;
        redo(): Promise<void> | void;
    }

    export interface Rejection {
        rejectReason?: string;
    }

    export interface RenameLocation {
        range: IRange;
        text: string;
    }

    export interface RenameProvider {
        provideRenameEdits(model: ED.ITextModel, position: Position, newName: string, token: CancellationToken): ProviderResult<WorkspaceEdit & Rejection>;
        resolveRenameLocation?(model: ED.ITextModel, position: Position, token: CancellationToken): ProviderResult<RenameLocation & Rejection>;
    }

    export interface NewSymbolName {
        readonly newSymbolName: string;
        readonly tags?: readonly LG.NewSymbolNameTag[];
    }

    export interface NewSymbolNamesProvider {
        supportsAutomaticNewSymbolNamesTriggerKind?: Promise<boolean | undefined>;
        provideNewSymbolNames(model: ED.ITextModel, range: IRange, triggerKind: LG.NewSymbolNameTriggerKind, token: CancellationToken): ProviderResult<NewSymbolName[]>;
    }

    export interface CommentThreadRevealOptions {
        preserveFocus: boolean;
        focusReply: boolean;
    }

    export interface CommentAuthorInformation {
        name: string;
        iconPath?: UriComponents;
    }

    export interface PendingCommentThread {
        range: IRange | undefined;
        uri: Uri;
        uniqueOwner: string;
        isReply: boolean;
        comment: PendingComment;
    }

    export interface PendingComment {
        body: string;
        cursor: IPosition;
    }

    export interface CodeLens {
        range: IRange;
        id?: string;
        command?: Command;
    }

    export interface CodeLensList {
        readonly lenses: readonly CodeLens[];
        dispose?(): void;
    }

    export interface CodeLensProvider {
        onDidChange?: IEvent<this>;
        provideCodeLenses(model: ED.ITextModel, token: CancellationToken): ProviderResult<CodeLensList>;
        resolveCodeLens?(model: ED.ITextModel, codeLens: CodeLens, token: CancellationToken): ProviderResult<CodeLens>;
    }

    export interface InlayHintLabelPart {
        label: string;
        tooltip?: string | IMarkdownString;
        command?: Command;
        location?: Location;
    }

    export interface InlayHint {
        label: string | InlayHintLabelPart[];
        tooltip?: string | IMarkdownString;
        textEdits?: TextEdit[];
        position: IPosition;
        kind?: LG.InlayHintKind;
        paddingLeft?: boolean;
        paddingRight?: boolean;
    }

    export interface InlayHintList {
        hints: InlayHint[];
        dispose(): void;
    }
