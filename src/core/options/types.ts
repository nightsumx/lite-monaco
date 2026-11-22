// 由 scripts/gen-options.mjs 从 monaco-editor 0.55.1 的 monaco.d.ts 拷出,勿手改。
// 选项相关的接口、类型别名、枚举与 Monaco 同名同形;枚举数值也相同(EditorOption 的值就是 Monaco 的)。
/* eslint-disable */

/** 与 monaco.IMarkdownString 同形 */
export type { IMarkdownString } from '../../monaco/top-types'
import type { IMarkdownString } from '../../monaco/top-types'

export enum AccessibilitySupport {
		/**
		 * This should be the browser case where it is not known if a screen reader is attached or no.
		 */
		Unknown = 0,
		Disabled = 1,
		Enabled = 2
	}

export interface BareFontInfo {
		readonly _bareFontInfoBrand: void;
		readonly pixelRatio: number;
		readonly fontFamily: string;
		readonly fontWeight: string;
		readonly fontSize: number;
		readonly fontFeatureSettings: string;
		readonly fontVariationSettings: string;
		readonly lineHeight: number;
		readonly letterSpacing: number;
	}

/**
	 * Configuration options for typing over closing quotes or brackets
	 */
export type EditorAutoClosingEditStrategy = 'always' | 'auto' | 'never';

/**
	 * Configuration options for auto closing quotes and brackets
	 */
export type EditorAutoClosingStrategy = 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';

/**
	 * Configuration options for auto indentation in the editor
	 */
export enum EditorAutoIndentStrategy {
		None = 0,
		Keep = 1,
		Brackets = 2,
		Advanced = 3,
		Full = 4
	}

/**
	 * Configuration options for auto wrapping quotes and brackets
	 */
export type EditorAutoSurroundStrategy = 'languageDefined' | 'quotes' | 'brackets' | 'never';

/**
	 * The internal layout details of the editor.
	 */
export interface EditorLayoutInfo {
		/**
		 * Full editor width.
		 */
		readonly width: number;
		/**
		 * Full editor height.
		 */
		readonly height: number;
		/**
		 * Left position for the glyph margin.
		 */
		readonly glyphMarginLeft: number;
		/**
		 * The width of the glyph margin.
		 */
		readonly glyphMarginWidth: number;
		/**
		 * The number of decoration lanes to render in the glyph margin.
		 */
		readonly glyphMarginDecorationLaneCount: number;
		/**
		 * Left position for the line numbers.
		 */
		readonly lineNumbersLeft: number;
		/**
		 * The width of the line numbers.
		 */
		readonly lineNumbersWidth: number;
		/**
		 * Left position for the line decorations.
		 */
		readonly decorationsLeft: number;
		/**
		 * The width of the line decorations.
		 */
		readonly decorationsWidth: number;
		/**
		 * Left position for the content (actual text)
		 */
		readonly contentLeft: number;
		/**
		 * The width of the content (actual text)
		 */
		readonly contentWidth: number;
		/**
		 * Layout information for the minimap
		 */
		readonly minimap: EditorMinimapLayoutInfo;
		/**
		 * The number of columns (of typical characters) fitting on a viewport line.
		 */
		readonly viewportColumn: number;
		readonly isWordWrapMinified: boolean;
		readonly isViewportWrapping: boolean;
		readonly wrappingColumn: number;
		/**
		 * The width of the vertical scrollbar.
		 */
		readonly verticalScrollbarWidth: number;
		/**
		 * The height of the horizontal scrollbar.
		 */
		readonly horizontalScrollbarHeight: number;
		/**
		 * The position of the overview ruler.
		 */
		readonly overviewRuler: OverviewRulerPosition;
	}

/**
	 * The internal layout details of the editor.
	 */
export interface EditorMinimapLayoutInfo {
		readonly renderMinimap: RenderMinimap;
		readonly minimapLeft: number;
		readonly minimapWidth: number;
		readonly minimapHeightIsEditorHeight: boolean;
		readonly minimapIsSampling: boolean;
		readonly minimapScale: number;
		readonly minimapLineHeight: number;
		readonly minimapCanvasInnerWidth: number;
		readonly minimapCanvasInnerHeight: number;
		readonly minimapCanvasOuterWidth: number;
		readonly minimapCanvasOuterHeight: number;
	}

export enum EditorOption {
		acceptSuggestionOnCommitCharacter = 0,
		acceptSuggestionOnEnter = 1,
		accessibilitySupport = 2,
		accessibilityPageSize = 3,
		allowOverflow = 4,
		allowVariableLineHeights = 5,
		allowVariableFonts = 6,
		allowVariableFontsInAccessibilityMode = 7,
		ariaLabel = 8,
		ariaRequired = 9,
		autoClosingBrackets = 10,
		autoClosingComments = 11,
		screenReaderAnnounceInlineSuggestion = 12,
		autoClosingDelete = 13,
		autoClosingOvertype = 14,
		autoClosingQuotes = 15,
		autoIndent = 16,
		autoIndentOnPaste = 17,
		autoIndentOnPasteWithinString = 18,
		automaticLayout = 19,
		autoSurround = 20,
		bracketPairColorization = 21,
		guides = 22,
		codeLens = 23,
		codeLensFontFamily = 24,
		codeLensFontSize = 25,
		colorDecorators = 26,
		colorDecoratorsLimit = 27,
		columnSelection = 28,
		comments = 29,
		contextmenu = 30,
		copyWithSyntaxHighlighting = 31,
		cursorBlinking = 32,
		cursorSmoothCaretAnimation = 33,
		cursorStyle = 34,
		cursorSurroundingLines = 35,
		cursorSurroundingLinesStyle = 36,
		cursorWidth = 37,
		cursorHeight = 38,
		disableLayerHinting = 39,
		disableMonospaceOptimizations = 40,
		domReadOnly = 41,
		dragAndDrop = 42,
		dropIntoEditor = 43,
		editContext = 44,
		emptySelectionClipboard = 45,
		experimentalGpuAcceleration = 46,
		experimentalWhitespaceRendering = 47,
		extraEditorClassName = 48,
		fastScrollSensitivity = 49,
		find = 50,
		fixedOverflowWidgets = 51,
		folding = 52,
		foldingStrategy = 53,
		foldingHighlight = 54,
		foldingImportsByDefault = 55,
		foldingMaximumRegions = 56,
		unfoldOnClickAfterEndOfLine = 57,
		fontFamily = 58,
		fontInfo = 59,
		fontLigatures = 60,
		fontSize = 61,
		fontWeight = 62,
		fontVariations = 63,
		formatOnPaste = 64,
		formatOnType = 65,
		glyphMargin = 66,
		gotoLocation = 67,
		hideCursorInOverviewRuler = 68,
		hover = 69,
		inDiffEditor = 70,
		inlineSuggest = 71,
		letterSpacing = 72,
		lightbulb = 73,
		lineDecorationsWidth = 74,
		lineHeight = 75,
		lineNumbers = 76,
		lineNumbersMinChars = 77,
		linkedEditing = 78,
		links = 79,
		matchBrackets = 80,
		minimap = 81,
		mouseStyle = 82,
		mouseWheelScrollSensitivity = 83,
		mouseWheelZoom = 84,
		multiCursorMergeOverlapping = 85,
		multiCursorModifier = 86,
		mouseMiddleClickAction = 87,
		multiCursorPaste = 88,
		multiCursorLimit = 89,
		occurrencesHighlight = 90,
		occurrencesHighlightDelay = 91,
		overtypeCursorStyle = 92,
		overtypeOnPaste = 93,
		overviewRulerBorder = 94,
		overviewRulerLanes = 95,
		padding = 96,
		pasteAs = 97,
		parameterHints = 98,
		peekWidgetDefaultFocus = 99,
		placeholder = 100,
		definitionLinkOpensInPeek = 101,
		quickSuggestions = 102,
		quickSuggestionsDelay = 103,
		readOnly = 104,
		readOnlyMessage = 105,
		renameOnType = 106,
		renderRichScreenReaderContent = 107,
		renderControlCharacters = 108,
		renderFinalNewline = 109,
		renderLineHighlight = 110,
		renderLineHighlightOnlyWhenFocus = 111,
		renderValidationDecorations = 112,
		renderWhitespace = 113,
		revealHorizontalRightPadding = 114,
		roundedSelection = 115,
		rulers = 116,
		scrollbar = 117,
		scrollBeyondLastColumn = 118,
		scrollBeyondLastLine = 119,
		scrollPredominantAxis = 120,
		selectionClipboard = 121,
		selectionHighlight = 122,
		selectionHighlightMaxLength = 123,
		selectionHighlightMultiline = 124,
		selectOnLineNumbers = 125,
		showFoldingControls = 126,
		showUnused = 127,
		snippetSuggestions = 128,
		smartSelect = 129,
		smoothScrolling = 130,
		stickyScroll = 131,
		stickyTabStops = 132,
		stopRenderingLineAfter = 133,
		suggest = 134,
		suggestFontSize = 135,
		suggestLineHeight = 136,
		suggestOnTriggerCharacters = 137,
		suggestSelection = 138,
		tabCompletion = 139,
		tabIndex = 140,
		trimWhitespaceOnDelete = 141,
		unicodeHighlighting = 142,
		unusualLineTerminators = 143,
		useShadowDOM = 144,
		useTabStops = 145,
		wordBreak = 146,
		wordSegmenterLocales = 147,
		wordSeparators = 148,
		wordWrap = 149,
		wordWrapBreakAfterCharacters = 150,
		wordWrapBreakBeforeCharacters = 151,
		wordWrapColumn = 152,
		wordWrapOverride1 = 153,
		wordWrapOverride2 = 154,
		wrappingIndent = 155,
		wrappingStrategy = 156,
		showDeprecated = 157,
		inertialScroll = 158,
		inlayHints = 159,
		wrapOnEscapedLineFeeds = 160,
		effectiveCursorStyle = 161,
		editorClassName = 162,
		pixelRatio = 163,
		tabFocusMode = 164,
		layoutInfo = 165,
		wrappingInfo = 166,
		defaultColorDecorators = 167,
		colorDecoratorsActivatedOn = 168,
		inlineCompletionsAccessibilityVerbose = 169,
		effectiveEditContext = 170,
		scrollOnMiddleClick = 171,
		effectiveAllowVariableFonts = 172
	}

export interface EditorWrappingInfo {
		readonly isDominatedByLongLines: boolean;
		readonly isWordWrapMinified: boolean;
		readonly isViewportWrapping: boolean;
		readonly wrappingColumn: number;
	}

export interface FontInfo extends BareFontInfo {
		readonly _editorStylingBrand: void;
		readonly version: number;
		readonly isTrusted: boolean;
		readonly isMonospace: boolean;
		readonly typicalHalfwidthCharacterWidth: number;
		readonly typicalFullwidthCharacterWidth: number;
		readonly canUseHalfwidthRightwardsArrow: boolean;
		readonly spaceWidth: number;
		readonly middotWidth: number;
		readonly wsmiddotWidth: number;
		readonly maxDigitWidth: number;
	}

export type GoToLocationValues = 'peek' | 'gotoAndPeek' | 'goto';

export interface IBracketPairColorizationOptions {
		/**
		 * Enable or disable bracket pair colorization.
		*/
		enabled?: boolean;
		/**
		 * Use independent color pool per bracket type.
		*/
		independentColorPoolPerBracketType?: boolean;
	}

export interface IDiffEditorBaseOptions {
		/**
		 * Allow the user to resize the diff editor split view.
		 * Defaults to true.
		 */
		enableSplitViewResizing?: boolean;
		/**
		 * The default ratio when rendering side-by-side editors.
		 * Must be a number between 0 and 1, min sizes apply.
		 * Defaults to 0.5
		 */
		splitViewDefaultRatio?: number;
		/**
		 * Render the differences in two side-by-side editors.
		 * Defaults to true.
		 */
		renderSideBySide?: boolean;
		/**
		 * When `renderSideBySide` is enabled, `useInlineViewWhenSpaceIsLimited` is set,
		 * and the diff editor has a width less than `renderSideBySideInlineBreakpoint`, the inline view is used.
		 */
		renderSideBySideInlineBreakpoint?: number | undefined;
		/**
		 * When `renderSideBySide` is enabled, `useInlineViewWhenSpaceIsLimited` is set,
		 * and the diff editor has a width less than `renderSideBySideInlineBreakpoint`, the inline view is used.
		 */
		useInlineViewWhenSpaceIsLimited?: boolean;
		/**
		 * If set, the diff editor is optimized for small views.
		 * Defaults to `false`.
		*/
		compactMode?: boolean;
		/**
		 * Timeout in milliseconds after which diff computation is cancelled.
		 * Defaults to 5000.
		 */
		maxComputationTime?: number;
		/**
		 * Maximum supported file size in MB.
		 * Defaults to 50.
		 */
		maxFileSize?: number;
		/**
		 * Compute the diff by ignoring leading/trailing whitespace
		 * Defaults to true.
		 */
		ignoreTrimWhitespace?: boolean;
		/**
		 * Render +/- indicators for added/deleted changes.
		 * Defaults to true.
		 */
		renderIndicators?: boolean;
		/**
		 * Shows icons in the glyph margin to revert changes.
		 * Default to true.
		 */
		renderMarginRevertIcon?: boolean;
		/**
		 * Indicates if the gutter menu should be rendered.
		*/
		renderGutterMenu?: boolean;
		/**
		 * Original model should be editable?
		 * Defaults to false.
		 */
		originalEditable?: boolean;
		/**
		 * Should the diff editor enable code lens?
		 * Defaults to false.
		 */
		diffCodeLens?: boolean;
		/**
		 * Is the diff editor should render overview ruler
		 * Defaults to true
		 */
		renderOverviewRuler?: boolean;
		/**
		 * Control the wrapping of the diff editor.
		 */
		diffWordWrap?: 'off' | 'on' | 'inherit';
		/**
		 * Diff Algorithm
		*/
		diffAlgorithm?: 'legacy' | 'advanced';
		/**
		 * Whether the diff editor aria label should be verbose.
		 */
		accessibilityVerbose?: boolean;
		experimental?: {
			/**
			 * Defaults to false.
			 */
			showMoves?: boolean;
			showEmptyDecorations?: boolean;
			/**
			 * Only applies when `renderSideBySide` is set to false.
			*/
			useTrueInlineView?: boolean;
		};
		/**
		 * Is the diff editor inside another editor
		 * Defaults to false
		 */
		isInEmbeddedEditor?: boolean;
		/**
		 * If the diff editor should only show the difference review mode.
		 */
		onlyShowAccessibleDiffViewer?: boolean;
		hideUnchangedRegions?: {
			enabled?: boolean;
			revealLineCount?: number;
			minimumLineCount?: number;
			contextLineCount?: number;
		};
	}

/**
	 * Configuration options for the diff editor.
	 */
export interface IDiffEditorOptions extends IEditorOptions, IDiffEditorBaseOptions {
	}

/**
	 * Configuration options for editor drop into behavior
	 */
export interface IDropIntoEditorOptions {
		/**
		 * Enable dropping into editor.
		 * Defaults to true.
		 */
		enabled?: boolean;
		/**
		 * Controls if a widget is shown after a drop.
		 * Defaults to 'afterDrop'.
		 */
		showDropSelector?: 'afterDrop' | 'never';
	}

/**
	 * Configuration options for editor comments
	 */
export interface IEditorCommentsOptions {
		/**
		 * Insert a space after the line comment token and inside the block comments tokens.
		 * Defaults to true.
		 */
		insertSpace?: boolean;
		/**
		 * Ignore empty lines when inserting line comments.
		 * Defaults to true.
		 */
		ignoreEmptyLines?: boolean;
	}

/**
	 * Configuration options for editor find widget
	 */
export interface IEditorFindOptions {
		/**
		* Controls whether the cursor should move to find matches while typing.
		*/
		cursorMoveOnType?: boolean;
		/**
		 * Controls whether the find widget should search as you type.
		 */
		findOnType?: boolean;
		/**
		 * Controls if we seed search string in the Find Widget with editor selection.
		 */
		seedSearchStringFromSelection?: 'never' | 'always' | 'selection';
		/**
		 * Controls if Find in Selection flag is turned on in the editor.
		 */
		autoFindInSelection?: 'never' | 'always' | 'multiline';
		addExtraSpaceOnTop?: boolean;
		/**
		 * Controls whether the search result and diff result automatically restarts from the beginning (or the end) when no further matches can be found
		 */
		loop?: boolean;
	}

/**
	 * Configuration options for editor hover
	 */
export interface IEditorHoverOptions {
		/**
		 * Enable the hover.
		 * Defaults to true.
		 */
		enabled?: boolean;
		/**
		 * Delay for showing the hover.
		 * Defaults to 300.
		 */
		delay?: number;
		/**
		 * Is the hover sticky such that it can be clicked and its contents selected?
		 * Defaults to true.
		 */
		sticky?: boolean;
		/**
		 * Controls how long the hover is visible after you hovered out of it.
		 * Require sticky setting to be true.
		 */
		hidingDelay?: number;
		/**
		 * Should the hover be shown above the line if possible?
		 * Defaults to false.
		 */
		above?: boolean;
	}

/**
	 * Configuration options for editor inlayHints
	 */
export interface IEditorInlayHintsOptions {
		/**
		 * Enable the inline hints.
		 * Defaults to true.
		 */
		enabled?: 'on' | 'off' | 'offUnlessPressed' | 'onUnlessPressed';
		/**
		 * Font size of inline hints.
		 * Default to 90% of the editor font size.
		 */
		fontSize?: number;
		/**
		 * Font family of inline hints.
		 * Defaults to editor font family.
		 */
		fontFamily?: string;
		/**
		 * Enables the padding around the inlay hint.
		 * Defaults to false.
		 */
		padding?: boolean;
		/**
		 * Maximum length for inlay hints per line
		 * Set to 0 to have an unlimited length.
		 */
		maximumLength?: number;
	}

/**
	 * Configuration options for editor lightbulb
	 */
export interface IEditorLightbulbOptions {
		/**
		 * Enable the lightbulb code action.
		 * The three possible values are `off`, `on` and `onCode` and the default is `onCode`.
		 * `off` disables the code action menu.
		 * `on` shows the code action menu on code and on empty lines.
		 * `onCode` shows the code action menu on code only.
		 */
		enabled?: ShowLightbulbIconMode;
	}

/**
	 * Configuration options for editor minimap
	 */
export interface IEditorMinimapOptions {
		/**
		 * Enable the rendering of the minimap.
		 * Defaults to true.
		 */
		enabled?: boolean;
		/**
		 * Control the rendering of minimap.
		 */
		autohide?: 'none' | 'mouseover' | 'scroll';
		/**
		 * Control the side of the minimap in editor.
		 * Defaults to 'right'.
		 */
		side?: 'right' | 'left';
		/**
		 * Control the minimap rendering mode.
		 * Defaults to 'actual'.
		 */
		size?: 'proportional' | 'fill' | 'fit';
		/**
		 * Control the rendering of the minimap slider.
		 * Defaults to 'mouseover'.
		 */
		showSlider?: 'always' | 'mouseover';
		/**
		 * Render the actual text on a line (as opposed to color blocks).
		 * Defaults to true.
		 */
		renderCharacters?: boolean;
		/**
		 * Limit the width of the minimap to render at most a certain number of columns.
		 * Defaults to 120.
		 */
		maxColumn?: number;
		/**
		 * Relative size of the font in the minimap. Defaults to 1.
		 */
		scale?: number;
		/**
		 * Whether to show named regions as section headers. Defaults to true.
		 */
		showRegionSectionHeaders?: boolean;
		/**
		 * Whether to show MARK: comments as section headers. Defaults to true.
		 */
		showMarkSectionHeaders?: boolean;
		/**
		 * When specified, is used to create a custom section header parser regexp.
		 * Must contain a match group named 'label' (written as (?<label>.+)) that encapsulates the section header.
		 * Optionally can include another match group named 'separator'.
		 * To match multi-line headers like:
		 *   // ==========
		 *   // My Section
		 *   // ==========
		 * Use a pattern like: ^={3,}\n^\/\/ *(?<label>[^\n]*?)\n^={3,}$
		 */
		markSectionHeaderRegex?: string;
		/**
		 * Font size of section headers. Defaults to 9.
		 */
		sectionHeaderFontSize?: number;
		/**
		 * Spacing between the section header characters (in CSS px). Defaults to 1.
		 */
		sectionHeaderLetterSpacing?: number;
	}

/**
	 * Configuration options for the editor.
	 */
export interface IEditorOptions {
		/**
		 * This editor is used inside a diff editor.
		 */
		inDiffEditor?: boolean;
		/**
		 * This editor is allowed to use variable line heights.
		 */
		allowVariableLineHeights?: boolean;
		/**
		 * This editor is allowed to use variable font-sizes and font-families
		 */
		allowVariableFonts?: boolean;
		/**
		 * This editor is allowed to use variable font-sizes and font-families in accessibility mode
		 */
		allowVariableFontsInAccessibilityMode?: boolean;
		/**
		 * The aria label for the editor's textarea (when it is focused).
		 */
		ariaLabel?: string;
		/**
		 * Whether the aria-required attribute should be set on the editors textarea.
		 */
		ariaRequired?: boolean;
		/**
		 * Control whether a screen reader announces inline suggestion content immediately.
		 */
		screenReaderAnnounceInlineSuggestion?: boolean;
		/**
		 * The `tabindex` property of the editor's textarea
		 */
		tabIndex?: number;
		/**
		 * Render vertical lines at the specified columns.
		 * Defaults to empty array.
		 */
		rulers?: (number | IRulerOption)[];
		/**
		 * Locales used for segmenting lines into words when doing word related navigations or operations.
		 *
		 * Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.).
		 * Defaults to empty array
		 */
		wordSegmenterLocales?: string | string[];
		/**
		 * A string containing the word separators used when doing word navigation.
		 * Defaults to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
		 */
		wordSeparators?: string;
		/**
		 * Enable Linux primary clipboard.
		 * Defaults to true.
		 */
		selectionClipboard?: boolean;
		/**
		 * Control the rendering of line numbers.
		 * If it is a function, it will be invoked when rendering a line number and the return value will be rendered.
		 * Otherwise, if it is a truthy, line numbers will be rendered normally (equivalent of using an identity function).
		 * Otherwise, line numbers will not be rendered.
		 * Defaults to `on`.
		 */
		lineNumbers?: LineNumbersType;
		/**
		 * Controls the minimal number of visible leading and trailing lines surrounding the cursor.
		 * Defaults to 0.
		*/
		cursorSurroundingLines?: number;
		/**
		 * Controls when `cursorSurroundingLines` should be enforced
		 * Defaults to `default`, `cursorSurroundingLines` is not enforced when cursor position is changed
		 * by mouse.
		*/
		cursorSurroundingLinesStyle?: 'default' | 'all';
		/**
		 * Render last line number when the file ends with a newline.
		 * Defaults to 'on' for Windows and macOS and 'dimmed' for Linux.
		*/
		renderFinalNewline?: 'on' | 'off' | 'dimmed';
		/**
		 * Remove unusual line terminators like LINE SEPARATOR (LS), PARAGRAPH SEPARATOR (PS).
		 * Defaults to 'prompt'.
		 */
		unusualLineTerminators?: 'auto' | 'off' | 'prompt';
		/**
		 * Should the corresponding line be selected when clicking on the line number?
		 * Defaults to true.
		 */
		selectOnLineNumbers?: boolean;
		/**
		 * Control the width of line numbers, by reserving horizontal space for rendering at least an amount of digits.
		 * Defaults to 5.
		 */
		lineNumbersMinChars?: number;
		/**
		 * Enable the rendering of the glyph margin.
		 * Defaults to true in vscode and to false in monaco-editor.
		 */
		glyphMargin?: boolean;
		/**
		 * The width reserved for line decorations (in px).
		 * Line decorations are placed between line numbers and the editor content.
		 * You can pass in a string in the format floating point followed by "ch". e.g. 1.3ch.
		 * Defaults to 10.
		 */
		lineDecorationsWidth?: number | string;
		/**
		 * When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle.
		 * This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.
		 * Defaults to 30 (px).
		 */
		revealHorizontalRightPadding?: number;
		/**
		 * Render the editor selection with rounded borders.
		 * Defaults to true.
		 */
		roundedSelection?: boolean;
		/**
		 * Class name to be added to the editor.
		 */
		extraEditorClassName?: string;
		/**
		 * Should the editor be read only. See also `domReadOnly`.
		 * Defaults to false.
		 */
		readOnly?: boolean;
		/**
		 * The message to display when the editor is readonly.
		 */
		readOnlyMessage?: IMarkdownString;
		/**
		 * Should the textarea used for input use the DOM `readonly` attribute.
		 * Defaults to false.
		 */
		domReadOnly?: boolean;
		/**
		 * Enable linked editing.
		 * Defaults to false.
		 */
		linkedEditing?: boolean;
		/**
		 * deprecated, use linkedEditing instead
		 */
		renameOnType?: boolean;
		/**
		 * Should the editor render validation decorations.
		 * Defaults to editable.
		 */
		renderValidationDecorations?: 'editable' | 'on' | 'off';
		/**
		 * Control the behavior and rendering of the scrollbars.
		 */
		scrollbar?: IEditorScrollbarOptions;
		/**
		 * Control the behavior of sticky scroll options
		 */
		stickyScroll?: IEditorStickyScrollOptions;
		/**
		 * Control the behavior and rendering of the minimap.
		 */
		minimap?: IEditorMinimapOptions;
		/**
		 * Control the behavior of the find widget.
		 */
		find?: IEditorFindOptions;
		/**
		 * Display overflow widgets as `fixed`.
		 * Defaults to `false`.
		 */
		fixedOverflowWidgets?: boolean;
		/**
		 * Allow content widgets and overflow widgets to overflow the editor viewport.
		 * Defaults to `true`.
		 */
		allowOverflow?: boolean;
		/**
		 * The number of vertical lanes the overview ruler should render.
		 * Defaults to 3.
		 */
		overviewRulerLanes?: number;
		/**
		 * Controls if a border should be drawn around the overview ruler.
		 * Defaults to `true`.
		 */
		overviewRulerBorder?: boolean;
		/**
		 * Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.
		 * Defaults to 'blink'.
		 */
		cursorBlinking?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
		/**
		 * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
		 * Defaults to false.
		 */
		mouseWheelZoom?: boolean;
		/**
		 * Control the mouse pointer style, either 'text' or 'default' or 'copy'
		 * Defaults to 'text'
		 */
		mouseStyle?: 'text' | 'default' | 'copy';
		/**
		 * Enable smooth caret animation.
		 * Defaults to 'off'.
		 */
		cursorSmoothCaretAnimation?: 'off' | 'explicit' | 'on';
		/**
		 * Control the cursor style in insert mode.
		 * Defaults to 'line'.
		 */
		cursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
		/**
		 * Control the cursor style in overtype mode.
		 * Defaults to 'block'.
		 */
		overtypeCursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
		/**
		 *  Controls whether paste in overtype mode should overwrite or insert.
		 */
		overtypeOnPaste?: boolean;
		/**
		 * Control the width of the cursor when cursorStyle is set to 'line'
		 */
		cursorWidth?: number;
		/**
		 * Control the height of the cursor when cursorStyle is set to 'line'
		 */
		cursorHeight?: number;
		/**
		 * Enable font ligatures.
		 * Defaults to false.
		 */
		fontLigatures?: boolean | string;
		/**
		 * Enable font variations.
		 * Defaults to false.
		 */
		fontVariations?: boolean | string;
		/**
		 * Controls whether to use default color decorations or not using the default document color provider
		 */
		defaultColorDecorators?: 'auto' | 'always' | 'never';
		/**
		 * Disable the use of `transform: translate3d(0px, 0px, 0px)` for the editor margin and lines layers.
		 * The usage of `transform: translate3d(0px, 0px, 0px)` acts as a hint for browsers to create an extra layer.
		 * Defaults to false.
		 */
		disableLayerHinting?: boolean;
		/**
		 * Disable the optimizations for monospace fonts.
		 * Defaults to false.
		 */
		disableMonospaceOptimizations?: boolean;
		/**
		 * Should the cursor be hidden in the overview ruler.
		 * Defaults to false.
		 */
		hideCursorInOverviewRuler?: boolean;
		/**
		 * Enable that scrolling can go one screen size after the last line.
		 * Defaults to true.
		 */
		scrollBeyondLastLine?: boolean;
		/**
		 * Scroll editor on middle click
		 */
		scrollOnMiddleClick?: boolean;
		/**
		 * Enable that scrolling can go beyond the last column by a number of columns.
		 * Defaults to 5.
		 */
		scrollBeyondLastColumn?: number;
		/**
		 * Enable that the editor animates scrolling to a position.
		 * Defaults to false.
		 */
		smoothScrolling?: boolean;
		/**
		 * Enable that the editor will install a ResizeObserver to check if its container dom node size has changed.
		 * Defaults to false.
		 */
		automaticLayout?: boolean;
		/**
		 * Control the wrapping of the editor.
		 * When `wordWrap` = "off", the lines will never wrap.
		 * When `wordWrap` = "on", the lines will wrap at the viewport width.
		 * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
		 * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
		 * Defaults to "off".
		 */
		wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
		/**
		 * Override the `wordWrap` setting.
		 */
		wordWrapOverride1?: 'off' | 'on' | 'inherit';
		/**
		 * Override the `wordWrapOverride1` setting.
		 */
		wordWrapOverride2?: 'off' | 'on' | 'inherit';
		/**
		 * Control the wrapping of the editor.
		 * When `wordWrap` = "off", the lines will never wrap.
		 * When `wordWrap` = "on", the lines will wrap at the viewport width.
		 * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
		 * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
		 * Defaults to 80.
		 */
		wordWrapColumn?: number;
		/**
		 * Control indentation of wrapped lines. Can be: 'none', 'same', 'indent' or 'deepIndent'.
		 * Defaults to 'same' in vscode and to 'none' in monaco-editor.
		 */
		wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
		/**
		 * Controls the wrapping strategy to use.
		 * Defaults to 'simple'.
		 */
		wrappingStrategy?: 'simple' | 'advanced';
		/**
		 * Create a softwrap on every quoted "\n" literal.
		 * Defaults to false.
		 */
		wrapOnEscapedLineFeeds?: boolean;
		/**
		 * Configure word wrapping characters. A break will be introduced before these characters.
		 */
		wordWrapBreakBeforeCharacters?: string;
		/**
		 * Configure word wrapping characters. A break will be introduced after these characters.
		 */
		wordWrapBreakAfterCharacters?: string;
		/**
		 * Sets whether line breaks appear wherever the text would otherwise overflow its content box.
		 * When wordBreak = 'normal', Use the default line break rule.
		 * When wordBreak = 'keepAll', Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behavior is the same as for normal.
		 */
		wordBreak?: 'normal' | 'keepAll';
		/**
		 * Performance guard: Stop rendering a line after x characters.
		 * Defaults to 10000.
		 * Use -1 to never stop rendering
		 */
		stopRenderingLineAfter?: number;
		/**
		 * Configure the editor's hover.
		 */
		hover?: IEditorHoverOptions;
		/**
		 * Enable detecting links and making them clickable.
		 * Defaults to true.
		 */
		links?: boolean;
		/**
		 * Enable inline color decorators and color picker rendering.
		 */
		colorDecorators?: boolean;
		/**
		 * Controls what is the condition to spawn a color picker from a color dectorator
		 */
		colorDecoratorsActivatedOn?: 'clickAndHover' | 'click' | 'hover';
		/**
		 * Controls the max number of color decorators that can be rendered in an editor at once.
		 */
		colorDecoratorsLimit?: number;
		/**
		 * Control the behaviour of comments in the editor.
		 */
		comments?: IEditorCommentsOptions;
		/**
		 * Enable custom contextmenu.
		 * Defaults to true.
		 */
		contextmenu?: boolean;
		/**
		 * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
		 * Defaults to 1.
		 */
		mouseWheelScrollSensitivity?: number;
		/**
		 * FastScrolling mulitplier speed when pressing `Alt`
		 * Defaults to 5.
		 */
		fastScrollSensitivity?: number;
		/**
		 * Enable that the editor scrolls only the predominant axis. Prevents horizontal drift when scrolling vertically on a trackpad.
		 * Defaults to true.
		 */
		scrollPredominantAxis?: boolean;
		/**
		 * Make scrolling inertial - mostly useful with touchpad on linux.
		 */
		inertialScroll?: boolean;
		/**
		 * Enable that the selection with the mouse and keys is doing column selection.
		 * Defaults to false.
		 */
		columnSelection?: boolean;
		/**
		 * The modifier to be used to add multiple cursors with the mouse.
		 * Defaults to 'alt'
		 */
		multiCursorModifier?: 'ctrlCmd' | 'alt';
		/**
		 * Merge overlapping selections.
		 * Defaults to true
		 */
		multiCursorMergeOverlapping?: boolean;
		/**
		 * Configure the behaviour when pasting a text with the line count equal to the cursor count.
		 * Defaults to 'spread'.
		 */
		multiCursorPaste?: 'spread' | 'full';
		/**
		 * Controls the max number of text cursors that can be in an active editor at once.
		 */
		multiCursorLimit?: number;
		/**
		 * Enables middle mouse button to open links and Go To Definition
		 */
		mouseMiddleClickAction?: MouseMiddleClickAction;
		/**
		 * Configure the editor's accessibility support.
		 * Defaults to 'auto'. It is best to leave this to 'auto'.
		 */
		accessibilitySupport?: 'auto' | 'off' | 'on';
		/**
		 * Controls the number of lines in the editor that can be read out by a screen reader
		 */
		accessibilityPageSize?: number;
		/**
		 * Suggest options.
		 */
		suggest?: ISuggestOptions;
		inlineSuggest?: IInlineSuggestOptions;
		/**
		 * Smart select options.
		 */
		smartSelect?: ISmartSelectOptions;
		/**
		 *
		 */
		gotoLocation?: IGotoLocationOptions;
		/**
		 * Enable quick suggestions (shadow suggestions)
		 * Defaults to true.
		 */
		quickSuggestions?: boolean | IQuickSuggestionsOptions;
		/**
		 * Quick suggestions show delay (in ms)
		 * Defaults to 10 (ms)
		 */
		quickSuggestionsDelay?: number;
		/**
		 * Controls the spacing around the editor.
		 */
		padding?: IEditorPaddingOptions;
		/**
		 * Parameter hint options.
		 */
		parameterHints?: IEditorParameterHintOptions;
		/**
		 * Options for auto closing brackets.
		 * Defaults to language defined behavior.
		 */
		autoClosingBrackets?: EditorAutoClosingStrategy;
		/**
		 * Options for auto closing comments.
		 * Defaults to language defined behavior.
		 */
		autoClosingComments?: EditorAutoClosingStrategy;
		/**
		 * Options for auto closing quotes.
		 * Defaults to language defined behavior.
		 */
		autoClosingQuotes?: EditorAutoClosingStrategy;
		/**
		 * Options for pressing backspace near quotes or bracket pairs.
		 */
		autoClosingDelete?: EditorAutoClosingEditStrategy;
		/**
		 * Options for typing over closing quotes or brackets.
		 */
		autoClosingOvertype?: EditorAutoClosingEditStrategy;
		/**
		 * Options for auto surrounding.
		 * Defaults to always allowing auto surrounding.
		 */
		autoSurround?: EditorAutoSurroundStrategy;
		/**
		 * Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.
		 * Defaults to advanced.
		 */
		autoIndent?: 'none' | 'keep' | 'brackets' | 'advanced' | 'full';
		/**
		 * Boolean which controls whether to autoindent on paste
		 */
		autoIndentOnPaste?: boolean;
		/**
		 * Boolean which controls whether to autoindent on paste within a string when autoIndentOnPaste is enabled.
		 */
		autoIndentOnPasteWithinString?: boolean;
		/**
		 * Emulate selection behaviour of tab characters when using spaces for indentation.
		 * This means selection will stick to tab stops.
		 */
		stickyTabStops?: boolean;
		/**
		 * Enable format on type.
		 * Defaults to false.
		 */
		formatOnType?: boolean;
		/**
		 * Enable format on paste.
		 * Defaults to false.
		 */
		formatOnPaste?: boolean;
		/**
		 * Controls if the editor should allow to move selections via drag and drop.
		 * Defaults to false.
		 */
		dragAndDrop?: boolean;
		/**
		 * Enable the suggestion box to pop-up on trigger characters.
		 * Defaults to true.
		 */
		suggestOnTriggerCharacters?: boolean;
		/**
		 * Accept suggestions on ENTER.
		 * Defaults to 'on'.
		 */
		acceptSuggestionOnEnter?: 'on' | 'smart' | 'off';
		/**
		 * Accept suggestions on provider defined characters.
		 * Defaults to true.
		 */
		acceptSuggestionOnCommitCharacter?: boolean;
		/**
		 * Enable snippet suggestions. Default to 'true'.
		 */
		snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none';
		/**
		 * Copying without a selection copies the current line.
		 */
		emptySelectionClipboard?: boolean;
		/**
		 * Syntax highlighting is copied.
		 */
		copyWithSyntaxHighlighting?: boolean;
		/**
		 * The history mode for suggestions.
		 */
		suggestSelection?: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';
		/**
		 * The font size for the suggest widget.
		 * Defaults to the editor font size.
		 */
		suggestFontSize?: number;
		/**
		 * The line height for the suggest widget.
		 * Defaults to the editor line height.
		 */
		suggestLineHeight?: number;
		/**
		 * Enable tab completion.
		 */
		tabCompletion?: 'on' | 'off' | 'onlySnippets';
		/**
		 * Enable selection highlight.
		 * Defaults to true.
		 */
		selectionHighlight?: boolean;
		/**
		 * Enable selection highlight for multiline selections.
		 * Defaults to false.
		 */
		selectionHighlightMultiline?: boolean;
		/**
		 * Maximum length (in characters) for selection highlights.
		 * Set to 0 to have an unlimited length.
		 */
		selectionHighlightMaxLength?: number;
		/**
		 * Enable semantic occurrences highlight.
		 * Defaults to 'singleFile'.
		 * 'off' disables occurrence highlighting
		 * 'singleFile' triggers occurrence highlighting in the current document
		 * 'multiFile'  triggers occurrence highlighting across valid open documents
		 */
		occurrencesHighlight?: 'off' | 'singleFile' | 'multiFile';
		/**
		 * Controls delay for occurrences highlighting
		 * Defaults to 250.
		 * Minimum value is 0
		 * Maximum value is 2000
		 */
		occurrencesHighlightDelay?: number;
		/**
		 * Show code lens
		 * Defaults to true.
		 */
		codeLens?: boolean;
		/**
		 * Code lens font family. Defaults to editor font family.
		 */
		codeLensFontFamily?: string;
		/**
		 * Code lens font size. Default to 90% of the editor font size
		 */
		codeLensFontSize?: number;
		/**
		 * Control the behavior and rendering of the code action lightbulb.
		 */
		lightbulb?: IEditorLightbulbOptions;
		/**
		 * Timeout for running code actions on save.
		 */
		codeActionsOnSaveTimeout?: number;
		/**
		 * Enable code folding.
		 * Defaults to true.
		 */
		folding?: boolean;
		/**
		 * Selects the folding strategy. 'auto' uses the strategies contributed for the current document, 'indentation' uses the indentation based folding strategy.
		 * Defaults to 'auto'.
		 */
		foldingStrategy?: 'auto' | 'indentation';
		/**
		 * Enable highlight for folded regions.
		 * Defaults to true.
		 */
		foldingHighlight?: boolean;
		/**
		 * Auto fold imports folding regions.
		 * Defaults to true.
		 */
		foldingImportsByDefault?: boolean;
		/**
		 * Maximum number of foldable regions.
		 * Defaults to 5000.
		 */
		foldingMaximumRegions?: number;
		/**
		 * Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.
		 * Defaults to 'mouseover'.
		 */
		showFoldingControls?: 'always' | 'never' | 'mouseover';
		/**
		 * Controls whether clicking on the empty content after a folded line will unfold the line.
		 * Defaults to false.
		 */
		unfoldOnClickAfterEndOfLine?: boolean;
		/**
		 * Enable highlighting of matching brackets.
		 * Defaults to 'always'.
		 */
		matchBrackets?: 'never' | 'near' | 'always';
		/**
		 * Enable experimental rendering using WebGPU.
		 * Defaults to 'off'.
		 */
		experimentalGpuAcceleration?: 'on' | 'off';
		/**
		 * Enable experimental whitespace rendering.
		 * Defaults to 'svg'.
		 */
		experimentalWhitespaceRendering?: 'svg' | 'font' | 'off';
		/**
		 * Enable rendering of whitespace.
		 * Defaults to 'selection'.
		 */
		renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
		/**
		 * Enable rendering of control characters.
		 * Defaults to true.
		 */
		renderControlCharacters?: boolean;
		/**
		 * Enable rendering of current line highlight.
		 * Defaults to all.
		 */
		renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
		/**
		 * Control if the current line highlight should be rendered only the editor is focused.
		 * Defaults to false.
		 */
		renderLineHighlightOnlyWhenFocus?: boolean;
		/**
		 * Inserting and deleting whitespace follows tab stops.
		 */
		useTabStops?: boolean;
		/**
		 * Controls whether the editor should automatically remove indentation whitespace when joining lines with Delete.
		 * Defaults to false.
		 */
		trimWhitespaceOnDelete?: boolean;
		/**
		 * The font family
		 */
		fontFamily?: string;
		/**
		 * The font weight
		 */
		fontWeight?: string;
		/**
		 * The font size
		 */
		fontSize?: number;
		/**
		 * The line height
		 */
		lineHeight?: number;
		/**
		 * The letter spacing
		 */
		letterSpacing?: number;
		/**
		 * Controls fading out of unused variables.
		 */
		showUnused?: boolean;
		/**
		 * Controls whether to focus the inline editor in the peek widget by default.
		 * Defaults to false.
		 */
		peekWidgetDefaultFocus?: 'tree' | 'editor';
		/**
		 * Sets a placeholder for the editor.
		 * If set, the placeholder is shown if the editor is empty.
		*/
		placeholder?: string | undefined;
		/**
		 * Controls whether the definition link opens element in the peek widget.
		 * Defaults to false.
		 */
		definitionLinkOpensInPeek?: boolean;
		/**
		 * Controls strikethrough deprecated variables.
		 */
		showDeprecated?: boolean;
		/**
		 * Controls whether suggestions allow matches in the middle of the word instead of only at the beginning
		 */
		matchOnWordStartOnly?: boolean;
		/**
		 * Control the behavior and rendering of the inline hints.
		 */
		inlayHints?: IEditorInlayHintsOptions;
		/**
		 * Control if the editor should use shadow DOM.
		 */
		useShadowDOM?: boolean;
		/**
		 * Controls the behavior of editor guides.
		*/
		guides?: IGuidesOptions;
		/**
		 * Controls the behavior of the unicode highlight feature
		 * (by default, ambiguous and invisible characters are highlighted).
		 */
		unicodeHighlight?: IUnicodeHighlightOptions;
		/**
		 * Configures bracket pair colorization (disabled by default).
		*/
		bracketPairColorization?: IBracketPairColorizationOptions;
		/**
		 * Controls dropping into the editor from an external source.
		 *
		 * When enabled, this shows a preview of the drop location and triggers an `onDropIntoEditor` event.
		 */
		dropIntoEditor?: IDropIntoEditorOptions;
		/**
		 * Sets whether the new experimental edit context should be used instead of the text area.
		 */
		editContext?: boolean;
		/**
		 * Controls whether to render rich HTML screen reader content when the EditContext is enabled
		 */
		renderRichScreenReaderContent?: boolean;
		/**
		 * Controls support for changing how content is pasted into the editor.
		 */
		pasteAs?: IPasteAsOptions;
		/**
		 * Controls whether the editor / terminal receives tabs or defers them to the workbench for navigation.
		 */
		tabFocusMode?: boolean;
		/**
		 * Controls whether the accessibility hint should be provided to screen reader users when an inline completion is shown.
		 */
		inlineCompletionsAccessibilityVerbose?: boolean;
	}

/**
	 * Configuration options for editor padding
	 */
export interface IEditorPaddingOptions {
		/**
		 * Spacing between top edge of editor and first line.
		 */
		top?: number;
		/**
		 * Spacing between bottom edge of editor and last line.
		 */
		bottom?: number;
	}

/**
	 * Configuration options for parameter hints
	 */
export interface IEditorParameterHintOptions {
		/**
		 * Enable parameter hints.
		 * Defaults to true.
		 */
		enabled?: boolean;
		/**
		 * Enable cycling of parameter hints.
		 * Defaults to false.
		 */
		cycle?: boolean;
	}

/**
	 * Configuration options for editor scrollbars
	 */
export interface IEditorScrollbarOptions {
		/**
		 * The size of arrows (if displayed).
		 * Defaults to 11.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		arrowSize?: number;
		/**
		 * Render vertical scrollbar.
		 * Defaults to 'auto'.
		 */
		vertical?: 'auto' | 'visible' | 'hidden';
		/**
		 * Render horizontal scrollbar.
		 * Defaults to 'auto'.
		 */
		horizontal?: 'auto' | 'visible' | 'hidden';
		/**
		 * Cast horizontal and vertical shadows when the content is scrolled.
		 * Defaults to true.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		useShadows?: boolean;
		/**
		 * Render arrows at the top and bottom of the vertical scrollbar.
		 * Defaults to false.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		verticalHasArrows?: boolean;
		/**
		 * Render arrows at the left and right of the horizontal scrollbar.
		 * Defaults to false.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		horizontalHasArrows?: boolean;
		/**
		 * Listen to mouse wheel events and react to them by scrolling.
		 * Defaults to true.
		 */
		handleMouseWheel?: boolean;
		/**
		 * Always consume mouse wheel events (always call preventDefault() and stopPropagation() on the browser events).
		 * Defaults to true.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		alwaysConsumeMouseWheel?: boolean;
		/**
		 * Height in pixels for the horizontal scrollbar.
		 * Defaults to 12 (px).
		 */
		horizontalScrollbarSize?: number;
		/**
		 * Width in pixels for the vertical scrollbar.
		 * Defaults to 14 (px).
		 */
		verticalScrollbarSize?: number;
		/**
		 * Width in pixels for the vertical slider.
		 * Defaults to `verticalScrollbarSize`.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		verticalSliderSize?: number;
		/**
		 * Height in pixels for the horizontal slider.
		 * Defaults to `horizontalScrollbarSize`.
		 * **NOTE**: This option cannot be updated using `updateOptions()`
		 */
		horizontalSliderSize?: number;
		/**
		 * Scroll gutter clicks move by page vs jump to position.
		 * Defaults to false.
		 */
		scrollByPage?: boolean;
		/**
		 * When set, the horizontal scrollbar will not increase content height.
		 * Defaults to false.
		 */
		ignoreHorizontalScrollbarInContentHeight?: boolean;
	}

export interface IEditorStickyScrollOptions {
		/**
		 * Enable the sticky scroll
		 */
		enabled?: boolean;
		/**
		 * Maximum number of sticky lines to show
		 */
		maxLineCount?: number;
		/**
		 * Model to choose for sticky scroll by default
		 */
		defaultModel?: 'outlineModel' | 'foldingProviderModel' | 'indentationModel';
		/**
		 * Define whether to scroll sticky scroll with editor horizontal scrollbae
		 */
		scrollWithEditor?: boolean;
	}

/**
	 * Options which apply for all editors.
	 */
export interface IGlobalEditorOptions {
		/**
		 * The number of spaces a tab is equal to.
		 * This setting is overridden based on the file contents when `detectIndentation` is on.
		 * Defaults to 4.
		 */
		tabSize?: number;
		/**
		 * Insert spaces when pressing `Tab`.
		 * This setting is overridden based on the file contents when `detectIndentation` is on.
		 * Defaults to true.
		 */
		insertSpaces?: boolean;
		/**
		 * Controls whether `tabSize` and `insertSpaces` will be automatically detected when a file is opened based on the file contents.
		 * Defaults to true.
		 */
		detectIndentation?: boolean;
		/**
		 * Remove trailing auto inserted whitespace.
		 * Defaults to true.
		 */
		trimAutoWhitespace?: boolean;
		/**
		 * Special handling for large files to disable certain memory intensive features.
		 * Defaults to true.
		 */
		largeFileOptimizations?: boolean;
		/**
		 * Controls whether completions should be computed based on words in the document.
		 * Defaults to true.
		 */
		wordBasedSuggestions?: 'off' | 'currentDocument' | 'matchingDocuments' | 'allDocuments';
		/**
		 * Controls whether word based completions should be included from opened documents of the same language or any language.
		 */
		wordBasedSuggestionsOnlySameLanguage?: boolean;
		/**
		 * Controls whether the semanticHighlighting is shown for the languages that support it.
		 * true: semanticHighlighting is enabled for all themes
		 * false: semanticHighlighting is disabled for all themes
		 * 'configuredByTheme': semanticHighlighting is controlled by the current color theme's semanticHighlighting setting.
		 * Defaults to 'byTheme'.
		 */
		'semanticHighlighting.enabled'?: true | false | 'configuredByTheme';
		/**
		 * Keep peek editors open even when double-clicking their content or when hitting `Escape`.
		 * Defaults to false.
		 */
		stablePeek?: boolean;
		/**
		 * Lines above this length will not be tokenized for performance reasons.
		 * Defaults to 20000.
		 */
		maxTokenizationLineLength?: number;
		/**
		 * Theme to be used for rendering.
		 * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light'.
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

/**
	 * Configuration options for go to location
	 */
export interface IGotoLocationOptions {
		multiple?: GoToLocationValues;
		multipleDefinitions?: GoToLocationValues;
		multipleTypeDefinitions?: GoToLocationValues;
		multipleDeclarations?: GoToLocationValues;
		multipleImplementations?: GoToLocationValues;
		multipleReferences?: GoToLocationValues;
		multipleTests?: GoToLocationValues;
		alternativeDefinitionCommand?: string;
		alternativeTypeDefinitionCommand?: string;
		alternativeDeclarationCommand?: string;
		alternativeImplementationCommand?: string;
		alternativeReferenceCommand?: string;
		alternativeTestsCommand?: string;
	}

export interface IGuidesOptions {
		/**
		 * Enable rendering of bracket pair guides.
		 * Defaults to false.
		*/
		bracketPairs?: boolean | 'active';
		/**
		 * Enable rendering of vertical bracket pair guides.
		 * Defaults to 'active'.
		 */
		bracketPairsHorizontal?: boolean | 'active';
		/**
		 * Enable highlighting of the active bracket pair.
		 * Defaults to true.
		*/
		highlightActiveBracketPair?: boolean;
		/**
		 * Enable rendering of indent guides.
		 * Defaults to true.
		 */
		indentation?: boolean;
		/**
		 * Enable highlighting of the active indent guide.
		 * Defaults to true.
		 */
		highlightActiveIndentation?: boolean | 'always';
	}

export interface IInlineSuggestOptions {
		/**
		 * Enable or disable the rendering of automatic inline completions.
		*/
		enabled?: boolean;
		/**
		 * Configures the mode.
		 * Use `prefix` to only show ghost text if the text to replace is a prefix of the suggestion text.
		 * Use `subword` to only show ghost text if the replace text is a subword of the suggestion text.
		 * Use `subwordSmart` to only show ghost text if the replace text is a subword of the suggestion text, but the subword must start after the cursor position.
		 * Defaults to `prefix`.
		*/
		mode?: 'prefix' | 'subword' | 'subwordSmart';
		showToolbar?: 'always' | 'onHover' | 'never';
		syntaxHighlightingEnabled?: boolean;
		suppressSuggestions?: boolean;
		minShowDelay?: number;
		suppressInSnippetMode?: boolean;
		/**
		 * Does not clear active inline suggestions when the editor loses focus.
		 */
		keepOnBlur?: boolean;
		/**
		 * Font family for inline suggestions.
		 */
		fontFamily?: string | 'default';
	}

/**
	 * Configuration options for editor pasting as into behavior
	 */
export interface IPasteAsOptions {
		/**
		 * Enable paste as functionality in editors.
		 * Defaults to true.
		 */
		enabled?: boolean;
		/**
		 * Controls if a widget is shown after a drop.
		 * Defaults to 'afterPaste'.
		 */
		showPasteSelector?: 'afterPaste' | 'never';
	}

/**
	 * Configuration options for quick suggestions
	 */
export interface IQuickSuggestionsOptions {
		other?: boolean | QuickSuggestionsValue;
		comments?: boolean | QuickSuggestionsValue;
		strings?: boolean | QuickSuggestionsValue;
	}

export interface IRulerOption {
		readonly column: number;
		readonly color: string | null;
	}

export interface ISmartSelectOptions {
		selectLeadingAndTrailingWhitespace?: boolean;
		selectSubwords?: boolean;
	}

/**
	 * Configuration options for editor suggest widget
	 */
export interface ISuggestOptions {
		/**
		 * Overwrite word ends on accept. Default to false.
		 */
		insertMode?: 'insert' | 'replace';
		/**
		 * Enable graceful matching. Defaults to true.
		 */
		filterGraceful?: boolean;
		/**
		 * Prevent quick suggestions when a snippet is active. Defaults to true.
		 */
		snippetsPreventQuickSuggestions?: boolean;
		/**
		 * Favors words that appear close to the cursor.
		 */
		localityBonus?: boolean;
		/**
		 * Enable using global storage for remembering suggestions.
		 */
		shareSuggestSelections?: boolean;
		/**
		 * Select suggestions when triggered via quick suggest or trigger characters
		 */
		selectionMode?: 'always' | 'never' | 'whenTriggerCharacter' | 'whenQuickSuggestion';
		/**
		 * Enable or disable icons in suggestions. Defaults to true.
		 */
		showIcons?: boolean;
		/**
		 * Enable or disable the suggest status bar.
		 */
		showStatusBar?: boolean;
		/**
		 * Enable or disable the rendering of the suggestion preview.
		 */
		preview?: boolean;
		/**
		 * Configures the mode of the preview.
		*/
		previewMode?: 'prefix' | 'subword' | 'subwordSmart';
		/**
		 * Show details inline with the label. Defaults to true.
		 */
		showInlineDetails?: boolean;
		/**
		 * Show method-suggestions.
		 */
		showMethods?: boolean;
		/**
		 * Show function-suggestions.
		 */
		showFunctions?: boolean;
		/**
		 * Show constructor-suggestions.
		 */
		showConstructors?: boolean;
		/**
		 * Show deprecated-suggestions.
		 */
		showDeprecated?: boolean;
		/**
		 * Controls whether suggestions allow matches in the middle of the word instead of only at the beginning
		 */
		matchOnWordStartOnly?: boolean;
		/**
		 * Show field-suggestions.
		 */
		showFields?: boolean;
		/**
		 * Show variable-suggestions.
		 */
		showVariables?: boolean;
		/**
		 * Show class-suggestions.
		 */
		showClasses?: boolean;
		/**
		 * Show struct-suggestions.
		 */
		showStructs?: boolean;
		/**
		 * Show interface-suggestions.
		 */
		showInterfaces?: boolean;
		/**
		 * Show module-suggestions.
		 */
		showModules?: boolean;
		/**
		 * Show property-suggestions.
		 */
		showProperties?: boolean;
		/**
		 * Show event-suggestions.
		 */
		showEvents?: boolean;
		/**
		 * Show operator-suggestions.
		 */
		showOperators?: boolean;
		/**
		 * Show unit-suggestions.
		 */
		showUnits?: boolean;
		/**
		 * Show value-suggestions.
		 */
		showValues?: boolean;
		/**
		 * Show constant-suggestions.
		 */
		showConstants?: boolean;
		/**
		 * Show enum-suggestions.
		 */
		showEnums?: boolean;
		/**
		 * Show enumMember-suggestions.
		 */
		showEnumMembers?: boolean;
		/**
		 * Show keyword-suggestions.
		 */
		showKeywords?: boolean;
		/**
		 * Show text-suggestions.
		 */
		showWords?: boolean;
		/**
		 * Show color-suggestions.
		 */
		showColors?: boolean;
		/**
		 * Show file-suggestions.
		 */
		showFiles?: boolean;
		/**
		 * Show reference-suggestions.
		 */
		showReferences?: boolean;
		/**
		 * Show folder-suggestions.
		 */
		showFolders?: boolean;
		/**
		 * Show typeParameter-suggestions.
		 */
		showTypeParameters?: boolean;
		/**
		 * Show issue-suggestions.
		 */
		showIssues?: boolean;
		/**
		 * Show user-suggestions.
		 */
		showUsers?: boolean;
		/**
		 * Show snippet-suggestions.
		 */
		showSnippets?: boolean;
	}

/**
	 * Configuration options for unicode highlighting.
	 */
export interface IUnicodeHighlightOptions {
		/**
		 * Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII.
		 */
		nonBasicASCII?: boolean | InUntrustedWorkspace;
		/**
		 * Controls whether characters that just reserve space or have no width at all are highlighted.
		 */
		invisibleCharacters?: boolean;
		/**
		 * Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale.
		 */
		ambiguousCharacters?: boolean;
		/**
		 * Controls whether characters in comments should also be subject to unicode highlighting.
		 */
		includeComments?: boolean | InUntrustedWorkspace;
		/**
		 * Controls whether characters in strings should also be subject to unicode highlighting.
		 */
		includeStrings?: boolean | InUntrustedWorkspace;
		/**
		 * Defines allowed characters that are not being highlighted.
		 */
		allowedCharacters?: Record<string, true>;
		/**
		 * Unicode characters that are common in allowed locales are not being highlighted.
		 */
		allowedLocales?: Record<string | '_os' | '_vscode', true>;
	}

export type InUntrustedWorkspace = 'inUntrustedWorkspace';

export interface InternalEditorRenderLineNumbersOptions {
		readonly renderType: RenderLineNumbersType;
		readonly renderFn: ((lineNumber: number) => string) | null;
	}

export interface InternalEditorScrollbarOptions {
		readonly arrowSize: number;
		readonly vertical: ScrollbarVisibility;
		readonly horizontal: ScrollbarVisibility;
		readonly useShadows: boolean;
		readonly verticalHasArrows: boolean;
		readonly horizontalHasArrows: boolean;
		readonly handleMouseWheel: boolean;
		readonly alwaysConsumeMouseWheel: boolean;
		readonly horizontalScrollbarSize: number;
		readonly horizontalSliderSize: number;
		readonly verticalScrollbarSize: number;
		readonly verticalSliderSize: number;
		readonly scrollByPage: boolean;
		readonly ignoreHorizontalScrollbarInContentHeight: boolean;
	}

export interface InternalQuickSuggestionsOptions {
		readonly other: QuickSuggestionsValue;
		readonly comments: QuickSuggestionsValue;
		readonly strings: QuickSuggestionsValue;
	}

export type LineNumbersType = 'on' | 'off' | 'relative' | 'interval' | ((lineNumber: number) => string);

export type MouseMiddleClickAction = 'default' | 'openLink' | 'ctrlLeftClick';

/**
	 * A description for the overview ruler position.
	 */
export interface OverviewRulerPosition {
		/**
		 * Width of the overview ruler
		 */
		readonly width: number;
		/**
		 * Height of the overview ruler
		 */
		readonly height: number;
		/**
		 * Top position for the overview ruler
		 */
		readonly top: number;
		/**
		 * Right position for the overview ruler
		 */
		readonly right: number;
	}

export type QuickSuggestionsValue = 'on' | 'inline' | 'off';

export enum RenderLineNumbersType {
		Off = 0,
		On = 1,
		Relative = 2,
		Interval = 3,
		Custom = 4
	}

export enum RenderMinimap {
		None = 0,
		Text = 1,
		Blocks = 2
	}

export type RequiredRecursive<T> = {
		[P in keyof T]-?: T[P] extends object | undefined ? RequiredRecursive<T[P]> : T[P];
	};

export enum ScrollbarVisibility {
		Auto = 1,
		Hidden = 2,
		Visible = 3
	}

export enum ShowLightbulbIconMode {
		Off = 'off',
		OnCode = 'onCode',
		On = 'on'
	}

/**
	 * The kind of animation in which the editor's cursor should be rendered.
	 */
export enum TextEditorCursorBlinkingStyle {
		/**
		 * Hidden
		 */
		Hidden = 0,
		/**
		 * Blinking
		 */
		Blink = 1,
		/**
		 * Blinking with smooth fading
		 */
		Smooth = 2,
		/**
		 * Blinking with prolonged filled state and smooth fading
		 */
		Phase = 3,
		/**
		 * Expand collapse animation on the y axis
		 */
		Expand = 4,
		/**
		 * No-Blinking
		 */
		Solid = 5
	}

/**
	 * The style in which the editor's cursor should be rendered.
	 */
export enum TextEditorCursorStyle {
		/**
		 * As a vertical line (sitting between two characters).
		 */
		Line = 1,
		/**
		 * As a block (sitting on top of a character).
		 */
		Block = 2,
		/**
		 * As a horizontal line (sitting under a character).
		 */
		Underline = 3,
		/**
		 * As a thin vertical line (sitting between two characters).
		 */
		LineThin = 4,
		/**
		 * As an outlined block (sitting on top of a character).
		 */
		BlockOutline = 5,
		/**
		 * As a thin horizontal line (sitting under a character).
		 */
		UnderlineThin = 6
	}

/**
	 * Describes how to indent wrapped lines.
	 */
export enum WrappingIndent {
		/**
		 * No indentation => wrapped lines begin at column 1.
		 */
		None = 0,
		/**
		 * Same => wrapped lines get the same indentation as the parent.
		 */
		Same = 1,
		/**
		 * Indent => wrapped lines get +1 indentation toward the parent.
		 */
		Indent = 2,
		/**
		 * DeepIndent => wrapped lines get +2 indentation toward the parent.
		 */
		DeepIndent = 3
	}

/** 每个选项 computed 值(editor.getOption() 返回的形态)的类型,key = 选项名(没有名字的计算项用 EditorOption 成员名) */
export interface ComputedEditorOptionValues {
    acceptSuggestionOnCommitCharacter: boolean
    acceptSuggestionOnEnter: 'on' | 'off' | 'smart'
    accessibilitySupport: AccessibilitySupport
    accessibilityPageSize: number
    allowOverflow: boolean
    allowVariableLineHeights: boolean
    allowVariableFonts: boolean
    allowVariableFontsInAccessibilityMode: boolean
    ariaLabel: string
    ariaRequired: boolean
    screenReaderAnnounceInlineSuggestion: boolean
    autoClosingBrackets: 'always' | 'never' | 'languageDefined' | 'beforeWhitespace'
    autoClosingComments: 'always' | 'never' | 'languageDefined' | 'beforeWhitespace'
    autoClosingDelete: 'auto' | 'always' | 'never'
    autoClosingOvertype: 'auto' | 'always' | 'never'
    autoClosingQuotes: 'always' | 'never' | 'languageDefined' | 'beforeWhitespace'
    autoIndent: EditorAutoIndentStrategy
    autoIndentOnPaste: boolean
    autoIndentOnPasteWithinString: boolean
    automaticLayout: boolean
    autoSurround: 'never' | 'languageDefined' | 'quotes' | 'brackets'
    bracketPairColorization: Readonly<Required<IBracketPairColorizationOptions>>
    guides: Readonly<Required<IGuidesOptions>>
    stickyTabStops: boolean
    codeLens: boolean
    codeLensFontFamily: string
    codeLensFontSize: number
    colorDecorators: boolean
    colorDecoratorsActivatedOn: 'hover' | 'clickAndHover' | 'click'
    colorDecoratorsLimit: number
    columnSelection: boolean
    comments: Readonly<Required<IEditorCommentsOptions>>
    contextmenu: boolean
    copyWithSyntaxHighlighting: boolean
    cursorBlinking: TextEditorCursorBlinkingStyle
    cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit'
    cursorStyle: TextEditorCursorStyle
    overtypeCursorStyle: TextEditorCursorStyle
    cursorSurroundingLines: number
    cursorSurroundingLinesStyle: 'default' | 'all'
    cursorWidth: number
    cursorHeight: number
    disableLayerHinting: boolean
    disableMonospaceOptimizations: boolean
    domReadOnly: boolean
    dragAndDrop: boolean
    emptySelectionClipboard: boolean
    dropIntoEditor: Readonly<Required<IDropIntoEditorOptions>>
    editContext: boolean
    renderRichScreenReaderContent: boolean
    stickyScroll: Readonly<Required<IEditorStickyScrollOptions>>
    experimentalGpuAcceleration: 'on' | 'off'
    experimentalWhitespaceRendering: 'off' | 'svg' | 'font'
    extraEditorClassName: string
    fastScrollSensitivity: number
    find: Readonly<Required<IEditorFindOptions>>
    fixedOverflowWidgets: boolean
    folding: boolean
    foldingStrategy: 'auto' | 'indentation'
    foldingHighlight: boolean
    foldingImportsByDefault: boolean
    foldingMaximumRegions: number
    unfoldOnClickAfterEndOfLine: boolean
    fontFamily: string
    fontInfo: FontInfo
    fontLigatures: string
    fontSize: number
    fontWeight: string
    fontVariations: string
    formatOnPaste: boolean
    formatOnType: boolean
    glyphMargin: boolean
    gotoLocation: Readonly<Required<IGotoLocationOptions>>
    hideCursorInOverviewRuler: boolean
    hover: Readonly<Required<IEditorHoverOptions>>
    inDiffEditor: boolean
    inertialScroll: boolean
    letterSpacing: number
    lightbulb: Readonly<Required<IEditorLightbulbOptions>>
    lineDecorationsWidth: number
    lineHeight: number
    lineNumbers: InternalEditorRenderLineNumbersOptions
    lineNumbersMinChars: number
    linkedEditing: boolean
    links: boolean
    matchBrackets: 'always' | 'never' | 'near'
    minimap: Readonly<Required<IEditorMinimapOptions>>
    mouseStyle: 'default' | 'text' | 'copy'
    mouseWheelScrollSensitivity: number
    mouseWheelZoom: boolean
    multiCursorMergeOverlapping: boolean
    multiCursorModifier: 'altKey' | 'metaKey' | 'ctrlKey'
    mouseMiddleClickAction: MouseMiddleClickAction
    multiCursorPaste: 'spread' | 'full'
    multiCursorLimit: number
    occurrencesHighlight: 'off' | 'singleFile' | 'multiFile'
    occurrencesHighlightDelay: number
    overtypeOnPaste: boolean
    overviewRulerBorder: boolean
    overviewRulerLanes: number
    padding: Readonly<Required<IEditorPaddingOptions>>
    pasteAs: Readonly<Required<IPasteAsOptions>>
    parameterHints: Readonly<Required<IEditorParameterHintOptions>>
    peekWidgetDefaultFocus: 'tree' | 'editor'
    placeholder: string | undefined
    definitionLinkOpensInPeek: boolean
    quickSuggestions: InternalQuickSuggestionsOptions
    quickSuggestionsDelay: number
    readOnly: boolean
    readOnlyMessage: IMarkdownString | undefined
    renameOnType: boolean
    renderControlCharacters: boolean
    renderFinalNewline: 'on' | 'off' | 'dimmed'
    renderLineHighlight: 'all' | 'line' | 'none' | 'gutter'
    renderLineHighlightOnlyWhenFocus: boolean
    renderValidationDecorations: 'on' | 'off' | 'editable'
    renderWhitespace: 'all' | 'none' | 'boundary' | 'selection' | 'trailing'
    revealHorizontalRightPadding: number
    roundedSelection: boolean
    rulers: IRulerOption[]
    scrollbar: InternalEditorScrollbarOptions
    scrollBeyondLastColumn: number
    scrollBeyondLastLine: boolean
    scrollOnMiddleClick: boolean
    scrollPredominantAxis: boolean
    selectionClipboard: boolean
    selectionHighlight: boolean
    selectionHighlightMaxLength: number
    selectionHighlightMultiline: boolean
    selectOnLineNumbers: boolean
    showFoldingControls: 'always' | 'never' | 'mouseover'
    showUnused: boolean
    showDeprecated: boolean
    inlayHints: Readonly<Required<IEditorInlayHintsOptions>>
    snippetSuggestions: 'none' | 'top' | 'bottom' | 'inline'
    smartSelect: Readonly<Required<ISmartSelectOptions>>
    smoothScrolling: boolean
    stopRenderingLineAfter: number
    suggest: Readonly<Required<ISuggestOptions>>
    inlineSuggest: Readonly<RequiredRecursive<IInlineSuggestOptions>>
    inlineCompletionsAccessibilityVerbose: boolean
    suggestFontSize: number
    suggestLineHeight: number
    suggestOnTriggerCharacters: boolean
    suggestSelection: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix'
    tabCompletion: 'on' | 'off' | 'onlySnippets'
    tabIndex: number
    trimWhitespaceOnDelete: boolean
    unicodeHighlight: Required<IUnicodeHighlightOptions>
    unusualLineTerminators: 'off' | 'auto' | 'prompt'
    useShadowDOM: boolean
    useTabStops: boolean
    wordBreak: 'normal' | 'keepAll'
    wordSegmenterLocales: string[]
    wordSeparators: string
    wordWrap: 'wordWrapColumn' | 'on' | 'off' | 'bounded'
    wordWrapBreakAfterCharacters: string
    wordWrapBreakBeforeCharacters: string
    wordWrapColumn: number
    wordWrapOverride1: 'on' | 'off' | 'inherit'
    wordWrapOverride2: 'on' | 'off' | 'inherit'
    wrapOnEscapedLineFeeds: boolean
    effectiveCursorStyle: TextEditorCursorStyle
    editorClassName: string
    defaultColorDecorators: 'auto' | 'always' | 'never'
    pixelRatio: number
    tabFocusMode: boolean
    layoutInfo: EditorLayoutInfo
    wrappingInfo: EditorWrappingInfo
    wrappingIndent: WrappingIndent
    wrappingStrategy: 'simple' | 'advanced'
    effectiveEditContext: boolean
    effectiveAllowVariableFonts: boolean
}

/** EditorOption 的值 → ComputedEditorOptionValues 的 key */
export interface EditorOptionKeyById {
    0: 'acceptSuggestionOnCommitCharacter'
    1: 'acceptSuggestionOnEnter'
    2: 'accessibilitySupport'
    3: 'accessibilityPageSize'
    4: 'allowOverflow'
    5: 'allowVariableLineHeights'
    6: 'allowVariableFonts'
    7: 'allowVariableFontsInAccessibilityMode'
    8: 'ariaLabel'
    9: 'ariaRequired'
    12: 'screenReaderAnnounceInlineSuggestion'
    10: 'autoClosingBrackets'
    11: 'autoClosingComments'
    13: 'autoClosingDelete'
    14: 'autoClosingOvertype'
    15: 'autoClosingQuotes'
    16: 'autoIndent'
    17: 'autoIndentOnPaste'
    18: 'autoIndentOnPasteWithinString'
    19: 'automaticLayout'
    20: 'autoSurround'
    21: 'bracketPairColorization'
    22: 'guides'
    132: 'stickyTabStops'
    23: 'codeLens'
    24: 'codeLensFontFamily'
    25: 'codeLensFontSize'
    26: 'colorDecorators'
    168: 'colorDecoratorsActivatedOn'
    27: 'colorDecoratorsLimit'
    28: 'columnSelection'
    29: 'comments'
    30: 'contextmenu'
    31: 'copyWithSyntaxHighlighting'
    32: 'cursorBlinking'
    33: 'cursorSmoothCaretAnimation'
    34: 'cursorStyle'
    92: 'overtypeCursorStyle'
    35: 'cursorSurroundingLines'
    36: 'cursorSurroundingLinesStyle'
    37: 'cursorWidth'
    38: 'cursorHeight'
    39: 'disableLayerHinting'
    40: 'disableMonospaceOptimizations'
    41: 'domReadOnly'
    42: 'dragAndDrop'
    45: 'emptySelectionClipboard'
    43: 'dropIntoEditor'
    44: 'editContext'
    107: 'renderRichScreenReaderContent'
    131: 'stickyScroll'
    46: 'experimentalGpuAcceleration'
    47: 'experimentalWhitespaceRendering'
    48: 'extraEditorClassName'
    49: 'fastScrollSensitivity'
    50: 'find'
    51: 'fixedOverflowWidgets'
    52: 'folding'
    53: 'foldingStrategy'
    54: 'foldingHighlight'
    55: 'foldingImportsByDefault'
    56: 'foldingMaximumRegions'
    57: 'unfoldOnClickAfterEndOfLine'
    58: 'fontFamily'
    59: 'fontInfo'
    60: 'fontLigatures'
    61: 'fontSize'
    62: 'fontWeight'
    63: 'fontVariations'
    64: 'formatOnPaste'
    65: 'formatOnType'
    66: 'glyphMargin'
    67: 'gotoLocation'
    68: 'hideCursorInOverviewRuler'
    69: 'hover'
    70: 'inDiffEditor'
    158: 'inertialScroll'
    72: 'letterSpacing'
    73: 'lightbulb'
    74: 'lineDecorationsWidth'
    75: 'lineHeight'
    76: 'lineNumbers'
    77: 'lineNumbersMinChars'
    78: 'linkedEditing'
    79: 'links'
    80: 'matchBrackets'
    81: 'minimap'
    82: 'mouseStyle'
    83: 'mouseWheelScrollSensitivity'
    84: 'mouseWheelZoom'
    85: 'multiCursorMergeOverlapping'
    86: 'multiCursorModifier'
    87: 'mouseMiddleClickAction'
    88: 'multiCursorPaste'
    89: 'multiCursorLimit'
    90: 'occurrencesHighlight'
    91: 'occurrencesHighlightDelay'
    93: 'overtypeOnPaste'
    94: 'overviewRulerBorder'
    95: 'overviewRulerLanes'
    96: 'padding'
    97: 'pasteAs'
    98: 'parameterHints'
    99: 'peekWidgetDefaultFocus'
    100: 'placeholder'
    101: 'definitionLinkOpensInPeek'
    102: 'quickSuggestions'
    103: 'quickSuggestionsDelay'
    104: 'readOnly'
    105: 'readOnlyMessage'
    106: 'renameOnType'
    108: 'renderControlCharacters'
    109: 'renderFinalNewline'
    110: 'renderLineHighlight'
    111: 'renderLineHighlightOnlyWhenFocus'
    112: 'renderValidationDecorations'
    113: 'renderWhitespace'
    114: 'revealHorizontalRightPadding'
    115: 'roundedSelection'
    116: 'rulers'
    117: 'scrollbar'
    118: 'scrollBeyondLastColumn'
    119: 'scrollBeyondLastLine'
    171: 'scrollOnMiddleClick'
    120: 'scrollPredominantAxis'
    121: 'selectionClipboard'
    122: 'selectionHighlight'
    123: 'selectionHighlightMaxLength'
    124: 'selectionHighlightMultiline'
    125: 'selectOnLineNumbers'
    126: 'showFoldingControls'
    127: 'showUnused'
    157: 'showDeprecated'
    159: 'inlayHints'
    128: 'snippetSuggestions'
    129: 'smartSelect'
    130: 'smoothScrolling'
    133: 'stopRenderingLineAfter'
    134: 'suggest'
    71: 'inlineSuggest'
    169: 'inlineCompletionsAccessibilityVerbose'
    135: 'suggestFontSize'
    136: 'suggestLineHeight'
    137: 'suggestOnTriggerCharacters'
    138: 'suggestSelection'
    139: 'tabCompletion'
    140: 'tabIndex'
    141: 'trimWhitespaceOnDelete'
    142: 'unicodeHighlight'
    143: 'unusualLineTerminators'
    144: 'useShadowDOM'
    145: 'useTabStops'
    146: 'wordBreak'
    147: 'wordSegmenterLocales'
    148: 'wordSeparators'
    149: 'wordWrap'
    150: 'wordWrapBreakAfterCharacters'
    151: 'wordWrapBreakBeforeCharacters'
    152: 'wordWrapColumn'
    153: 'wordWrapOverride1'
    154: 'wordWrapOverride2'
    160: 'wrapOnEscapedLineFeeds'
    161: 'effectiveCursorStyle'
    162: 'editorClassName'
    167: 'defaultColorDecorators'
    163: 'pixelRatio'
    164: 'tabFocusMode'
    165: 'layoutInfo'
    166: 'wrappingInfo'
    155: 'wrappingIndent'
    156: 'wrappingStrategy'
    170: 'effectiveEditContext'
    172: 'effectiveAllowVariableFonts'
}
