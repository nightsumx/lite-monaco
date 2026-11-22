// 由 scripts/gen-options.mjs 从 monaco-editor 0.55.1 的 EditorOptions 导出,勿手改。
/* eslint-disable */

/** 下标 = EditorOption 的值,内容 = 选项名 */
export const EDITOR_OPTION_NAMES: readonly string[] = [
    "acceptSuggestionOnCommitCharacter",
    "acceptSuggestionOnEnter",
    "accessibilitySupport",
    "accessibilityPageSize",
    "allowOverflow",
    "allowVariableLineHeights",
    "allowVariableFonts",
    "allowVariableFontsInAccessibilityMode",
    "ariaLabel",
    "ariaRequired",
    "autoClosingBrackets",
    "autoClosingComments",
    "screenReaderAnnounceInlineSuggestion",
    "autoClosingDelete",
    "autoClosingOvertype",
    "autoClosingQuotes",
    "autoIndent",
    "autoIndentOnPaste",
    "autoIndentOnPasteWithinString",
    "automaticLayout",
    "autoSurround",
    "bracketPairColorization",
    "guides",
    "codeLens",
    "codeLensFontFamily",
    "codeLensFontSize",
    "colorDecorators",
    "colorDecoratorsLimit",
    "columnSelection",
    "comments",
    "contextmenu",
    "copyWithSyntaxHighlighting",
    "cursorBlinking",
    "cursorSmoothCaretAnimation",
    "cursorStyle",
    "cursorSurroundingLines",
    "cursorSurroundingLinesStyle",
    "cursorWidth",
    "cursorHeight",
    "disableLayerHinting",
    "disableMonospaceOptimizations",
    "domReadOnly",
    "dragAndDrop",
    "dropIntoEditor",
    "editContext",
    "emptySelectionClipboard",
    "experimentalGpuAcceleration",
    "experimentalWhitespaceRendering",
    "extraEditorClassName",
    "fastScrollSensitivity",
    "find",
    "fixedOverflowWidgets",
    "folding",
    "foldingStrategy",
    "foldingHighlight",
    "foldingImportsByDefault",
    "foldingMaximumRegions",
    "unfoldOnClickAfterEndOfLine",
    "fontFamily",
    "_never_",
    "fontLigatures",
    "fontSize",
    "fontWeight",
    "fontVariations",
    "formatOnPaste",
    "formatOnType",
    "glyphMargin",
    "gotoLocation",
    "hideCursorInOverviewRuler",
    "hover",
    "inDiffEditor",
    "inlineSuggest",
    "letterSpacing",
    "lightbulb",
    "lineDecorationsWidth",
    "lineHeight",
    "lineNumbers",
    "lineNumbersMinChars",
    "linkedEditing",
    "links",
    "matchBrackets",
    "minimap",
    "mouseStyle",
    "mouseWheelScrollSensitivity",
    "mouseWheelZoom",
    "multiCursorMergeOverlapping",
    "multiCursorModifier",
    "mouseMiddleClickAction",
    "multiCursorPaste",
    "multiCursorLimit",
    "occurrencesHighlight",
    "occurrencesHighlightDelay",
    "overtypeCursorStyle",
    "overtypeOnPaste",
    "overviewRulerBorder",
    "overviewRulerLanes",
    "padding",
    "pasteAs",
    "parameterHints",
    "peekWidgetDefaultFocus",
    "placeholder",
    "definitionLinkOpensInPeek",
    "quickSuggestions",
    "quickSuggestionsDelay",
    "readOnly",
    "readOnlyMessage",
    "renameOnType",
    "renderRichScreenReaderContent",
    "renderControlCharacters",
    "renderFinalNewline",
    "renderLineHighlight",
    "renderLineHighlightOnlyWhenFocus",
    "renderValidationDecorations",
    "renderWhitespace",
    "revealHorizontalRightPadding",
    "roundedSelection",
    "rulers",
    "scrollbar",
    "scrollBeyondLastColumn",
    "scrollBeyondLastLine",
    "scrollPredominantAxis",
    "selectionClipboard",
    "selectionHighlight",
    "selectionHighlightMaxLength",
    "selectionHighlightMultiline",
    "selectOnLineNumbers",
    "showFoldingControls",
    "showUnused",
    "snippetSuggestions",
    "smartSelect",
    "smoothScrolling",
    "stickyScroll",
    "stickyTabStops",
    "stopRenderingLineAfter",
    "suggest",
    "suggestFontSize",
    "suggestLineHeight",
    "suggestOnTriggerCharacters",
    "suggestSelection",
    "tabCompletion",
    "tabIndex",
    "trimWhitespaceOnDelete",
    "unicodeHighlight",
    "unusualLineTerminators",
    "useShadowDOM",
    "useTabStops",
    "wordBreak",
    "wordSegmenterLocales",
    "wordSeparators",
    "wordWrap",
    "wordWrapBreakAfterCharacters",
    "wordWrapBreakBeforeCharacters",
    "wordWrapColumn",
    "wordWrapOverride1",
    "wordWrapOverride2",
    "wrappingIndent",
    "wrappingStrategy",
    "showDeprecated",
    "inertialScroll",
    "inlayHints",
    "wrapOnEscapedLineFeeds",
    "_never_",
    "_never_",
    "_never_",
    "tabFocusMode",
    "_never_",
    "_never_",
    "defaultColorDecorators",
    "colorDecoratorsActivatedOn",
    "inlineCompletionsAccessibilityVerbose",
    "_never_",
    "scrollOnMiddleClick",
    "_never_"
]

/** 各选项的默认值(computed 形态,即 editor.getOption() 在不设任何选项时返回的值)。取 macOS 的;和平台相关的见 PLATFORM_DEFAULTS */
export const EDITOR_DEFAULTS: Record<string, any> = {
    "acceptSuggestionOnCommitCharacter": true,
    "acceptSuggestionOnEnter": "on",
    "accessibilitySupport": 0,
    "accessibilityPageSize": 500,
    "allowOverflow": true,
    "allowVariableLineHeights": true,
    "allowVariableFonts": true,
    "allowVariableFontsInAccessibilityMode": false,
    "ariaLabel": "Editor content",
    "ariaRequired": false,
    "autoClosingBrackets": "languageDefined",
    "autoClosingComments": "languageDefined",
    "screenReaderAnnounceInlineSuggestion": true,
    "autoClosingDelete": "auto",
    "autoClosingOvertype": "auto",
    "autoClosingQuotes": "languageDefined",
    "autoIndent": 4,
    "autoIndentOnPaste": false,
    "autoIndentOnPasteWithinString": true,
    "automaticLayout": false,
    "autoSurround": "languageDefined",
    "bracketPairColorization": {
        "enabled": true,
        "independentColorPoolPerBracketType": false
    },
    "guides": {
        "bracketPairs": false,
        "bracketPairsHorizontal": "active",
        "highlightActiveBracketPair": true,
        "indentation": true,
        "highlightActiveIndentation": true
    },
    "codeLens": true,
    "codeLensFontFamily": "",
    "codeLensFontSize": 0,
    "colorDecorators": true,
    "colorDecoratorsLimit": 500,
    "columnSelection": false,
    "comments": {
        "insertSpace": true,
        "ignoreEmptyLines": true
    },
    "contextmenu": true,
    "copyWithSyntaxHighlighting": true,
    "cursorBlinking": 1,
    "cursorSmoothCaretAnimation": "off",
    "cursorStyle": 1,
    "cursorSurroundingLines": 0,
    "cursorSurroundingLinesStyle": "default",
    "cursorWidth": 0,
    "cursorHeight": 0,
    "disableLayerHinting": false,
    "disableMonospaceOptimizations": false,
    "domReadOnly": false,
    "dragAndDrop": true,
    "dropIntoEditor": {
        "enabled": true,
        "showDropSelector": "afterDrop"
    },
    "editContext": true,
    "emptySelectionClipboard": true,
    "experimentalGpuAcceleration": "off",
    "experimentalWhitespaceRendering": "svg",
    "extraEditorClassName": "",
    "fastScrollSensitivity": 5,
    "find": {
        "cursorMoveOnType": true,
        "findOnType": true,
        "seedSearchStringFromSelection": "always",
        "autoFindInSelection": "never",
        "globalFindClipboard": false,
        "addExtraSpaceOnTop": true,
        "loop": true,
        "history": "workspace",
        "replaceHistory": "workspace"
    },
    "fixedOverflowWidgets": false,
    "folding": true,
    "foldingStrategy": "auto",
    "foldingHighlight": true,
    "foldingImportsByDefault": false,
    "foldingMaximumRegions": 5000,
    "unfoldOnClickAfterEndOfLine": false,
    "fontFamily": "Menlo, Monaco, 'Courier New', monospace",
    "fontLigatures": "\"liga\" off, \"calt\" off",
    "fontSize": 12,
    "fontWeight": "normal",
    "fontVariations": "normal",
    "formatOnPaste": false,
    "formatOnType": false,
    "glyphMargin": true,
    "gotoLocation": {
        "multiple": "peek",
        "multipleDefinitions": "peek",
        "multipleTypeDefinitions": "peek",
        "multipleDeclarations": "peek",
        "multipleImplementations": "peek",
        "multipleReferences": "peek",
        "multipleTests": "peek",
        "alternativeDefinitionCommand": "editor.action.goToReferences",
        "alternativeTypeDefinitionCommand": "editor.action.goToReferences",
        "alternativeDeclarationCommand": "editor.action.goToReferences",
        "alternativeImplementationCommand": "",
        "alternativeReferenceCommand": "",
        "alternativeTestsCommand": ""
    },
    "hideCursorInOverviewRuler": false,
    "hover": {
        "enabled": true,
        "delay": 300,
        "hidingDelay": 300,
        "sticky": true,
        "above": true
    },
    "inDiffEditor": false,
    "inlineSuggest": {
        "enabled": true,
        "mode": "subwordSmart",
        "showToolbar": "onHover",
        "suppressSuggestions": false,
        "keepOnBlur": false,
        "fontFamily": "default",
        "syntaxHighlightingEnabled": true,
        "minShowDelay": 0,
        "suppressInSnippetMode": true,
        "edits": {
            "enabled": true,
            "showCollapsed": false,
            "renderSideBySide": "auto",
            "allowCodeShifting": "always"
        },
        "triggerCommandOnProviderChange": false,
        "experimental": {
            "suppressInlineSuggestions": "",
            "showOnSuggestConflict": "never",
            "emptyResponseInformation": true
        }
    },
    "letterSpacing": 0,
    "lightbulb": {
        "enabled": "onCode"
    },
    "lineDecorationsWidth": 10,
    "lineHeight": 0,
    "lineNumbers": {
        "renderType": 1,
        "renderFn": null
    },
    "lineNumbersMinChars": 5,
    "linkedEditing": false,
    "links": true,
    "matchBrackets": "always",
    "minimap": {
        "enabled": true,
        "size": "proportional",
        "side": "right",
        "showSlider": "mouseover",
        "autohide": "none",
        "renderCharacters": true,
        "maxColumn": 120,
        "scale": 1,
        "showRegionSectionHeaders": true,
        "showMarkSectionHeaders": true,
        "markSectionHeaderRegex": "\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*)$",
        "sectionHeaderFontSize": 9,
        "sectionHeaderLetterSpacing": 1
    },
    "mouseStyle": "text",
    "mouseWheelScrollSensitivity": 1,
    "mouseWheelZoom": false,
    "multiCursorMergeOverlapping": true,
    "multiCursorModifier": "altKey",
    "mouseMiddleClickAction": "default",
    "multiCursorPaste": "spread",
    "multiCursorLimit": 10000,
    "occurrencesHighlight": "singleFile",
    "occurrencesHighlightDelay": 0,
    "overtypeCursorStyle": 2,
    "overtypeOnPaste": true,
    "overviewRulerBorder": true,
    "overviewRulerLanes": 3,
    "padding": {
        "top": 0,
        "bottom": 0
    },
    "pasteAs": {
        "enabled": true,
        "showPasteSelector": "afterPaste"
    },
    "parameterHints": {
        "enabled": true,
        "cycle": true
    },
    "peekWidgetDefaultFocus": "tree",
    "definitionLinkOpensInPeek": false,
    "quickSuggestions": {
        "other": "on",
        "comments": "off",
        "strings": "off"
    },
    "quickSuggestionsDelay": 10,
    "readOnly": false,
    "renameOnType": false,
    "renderRichScreenReaderContent": false,
    "renderControlCharacters": true,
    "renderFinalNewline": "on",
    "renderLineHighlight": "line",
    "renderLineHighlightOnlyWhenFocus": false,
    "renderValidationDecorations": "editable",
    "renderWhitespace": "selection",
    "revealHorizontalRightPadding": 15,
    "roundedSelection": true,
    "rulers": [],
    "scrollbar": {
        "vertical": 1,
        "horizontal": 1,
        "arrowSize": 11,
        "useShadows": true,
        "verticalHasArrows": false,
        "horizontalHasArrows": false,
        "horizontalScrollbarSize": 12,
        "horizontalSliderSize": 12,
        "verticalScrollbarSize": 14,
        "verticalSliderSize": 14,
        "handleMouseWheel": true,
        "alwaysConsumeMouseWheel": true,
        "scrollByPage": false,
        "ignoreHorizontalScrollbarInContentHeight": false
    },
    "scrollBeyondLastColumn": 4,
    "scrollBeyondLastLine": true,
    "scrollPredominantAxis": true,
    "selectionClipboard": true,
    "selectionHighlight": true,
    "selectionHighlightMaxLength": 200,
    "selectionHighlightMultiline": false,
    "selectOnLineNumbers": true,
    "showFoldingControls": "mouseover",
    "showUnused": true,
    "snippetSuggestions": "inline",
    "smartSelect": {
        "selectLeadingAndTrailingWhitespace": true,
        "selectSubwords": true
    },
    "smoothScrolling": false,
    "stickyScroll": {
        "enabled": true,
        "maxLineCount": 5,
        "defaultModel": "outlineModel",
        "scrollWithEditor": true
    },
    "stickyTabStops": false,
    "stopRenderingLineAfter": 10000,
    "suggest": {
        "insertMode": "insert",
        "filterGraceful": true,
        "snippetsPreventQuickSuggestions": false,
        "localityBonus": false,
        "shareSuggestSelections": false,
        "selectionMode": "always",
        "showIcons": true,
        "showStatusBar": false,
        "preview": false,
        "previewMode": "subwordSmart",
        "showInlineDetails": true,
        "showMethods": true,
        "showFunctions": true,
        "showConstructors": true,
        "showDeprecated": true,
        "matchOnWordStartOnly": true,
        "showFields": true,
        "showVariables": true,
        "showClasses": true,
        "showStructs": true,
        "showInterfaces": true,
        "showModules": true,
        "showProperties": true,
        "showEvents": true,
        "showOperators": true,
        "showUnits": true,
        "showValues": true,
        "showConstants": true,
        "showEnums": true,
        "showEnumMembers": true,
        "showKeywords": true,
        "showWords": true,
        "showColors": true,
        "showFiles": true,
        "showReferences": true,
        "showFolders": true,
        "showTypeParameters": true,
        "showSnippets": true,
        "showUsers": true,
        "showIssues": true
    },
    "suggestFontSize": 0,
    "suggestLineHeight": 0,
    "suggestOnTriggerCharacters": true,
    "suggestSelection": "first",
    "tabCompletion": "off",
    "tabIndex": 0,
    "trimWhitespaceOnDelete": false,
    "unicodeHighlight": {
        "nonBasicASCII": "inUntrustedWorkspace",
        "invisibleCharacters": true,
        "ambiguousCharacters": true,
        "includeComments": "inUntrustedWorkspace",
        "includeStrings": true,
        "allowedCharacters": {},
        "allowedLocales": {
            "_os": true,
            "_vscode": true
        }
    },
    "unusualLineTerminators": "prompt",
    "useShadowDOM": true,
    "useTabStops": true,
    "wordBreak": "normal",
    "wordSegmenterLocales": [],
    "wordSeparators": "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?",
    "wordWrap": "off",
    "wordWrapBreakAfterCharacters": " \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣",
    "wordWrapBreakBeforeCharacters": "([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋",
    "wordWrapColumn": 80,
    "wordWrapOverride1": "inherit",
    "wordWrapOverride2": "inherit",
    "wrappingIndent": 1,
    "wrappingStrategy": "simple",
    "showDeprecated": true,
    "inertialScroll": false,
    "inlayHints": {
        "enabled": "on",
        "fontSize": 0,
        "fontFamily": "",
        "padding": false,
        "maximumLength": 43
    },
    "wrapOnEscapedLineFeeds": false,
    "tabFocusMode": false,
    "defaultColorDecorators": "auto",
    "colorDecoratorsActivatedOn": "clickAndHover",
    "inlineCompletionsAccessibilityVerbose": false,
    "scrollOnMiddleClick": false
}

/** 与 macOS 不同的默认值(Monaco 的 fontFamily / fontSize / renderFinalNewline 随平台变) */
export const PLATFORM_DEFAULTS: { win: Record<string, any>, linux: Record<string, any> } = {
    "win": {
        "fontFamily": "Consolas, 'Courier New', monospace",
        "fontSize": 14
    },
    "linux": {
        "fontFamily": "'Droid Sans Mono', 'monospace', monospace",
        "fontSize": 14,
        "renderFinalNewline": "dimmed"
    }
}

/** 简单选项(布尔 / 整数 / 浮点 / 字符串 / 枚举)的取值规格。其余选项由 validate.ts 手写校验 */
export type OptionSpec =
    | { t: 'bool' }
    | { t: 'int', min: number, max: number }
    | { t: 'float' }
    | { t: 'string' }
    | { t: 'enum', values: readonly string[] }
    | { t: 'enumMap', values: readonly string[], map: Record<string, any> }
export const OPTION_SPECS: Record<string, OptionSpec> = {
    "acceptSuggestionOnCommitCharacter": {
        "t": "bool"
    },
    "acceptSuggestionOnEnter": {
        "t": "enum",
        "values": [
            "on",
            "smart",
            "off"
        ]
    },
    "accessibilityPageSize": {
        "t": "int",
        "min": 1,
        "max": 1073741824
    },
    "allowOverflow": {
        "t": "bool"
    },
    "allowVariableLineHeights": {
        "t": "bool"
    },
    "allowVariableFonts": {
        "t": "bool"
    },
    "allowVariableFontsInAccessibilityMode": {
        "t": "bool"
    },
    "ariaLabel": {
        "t": "string"
    },
    "ariaRequired": {
        "t": "bool"
    },
    "autoClosingBrackets": {
        "t": "enum",
        "values": [
            "always",
            "languageDefined",
            "beforeWhitespace",
            "never"
        ]
    },
    "autoClosingComments": {
        "t": "enum",
        "values": [
            "always",
            "languageDefined",
            "beforeWhitespace",
            "never"
        ]
    },
    "screenReaderAnnounceInlineSuggestion": {
        "t": "bool"
    },
    "autoClosingDelete": {
        "t": "enum",
        "values": [
            "always",
            "auto",
            "never"
        ]
    },
    "autoClosingOvertype": {
        "t": "enum",
        "values": [
            "always",
            "auto",
            "never"
        ]
    },
    "autoClosingQuotes": {
        "t": "enum",
        "values": [
            "always",
            "languageDefined",
            "beforeWhitespace",
            "never"
        ]
    },
    "autoIndent": {
        "t": "enumMap",
        "values": [
            "none",
            "keep",
            "brackets",
            "advanced",
            "full"
        ],
        "map": {
            "none": 0,
            "keep": 1,
            "brackets": 2,
            "advanced": 3,
            "full": 4
        }
    },
    "autoIndentOnPaste": {
        "t": "bool"
    },
    "autoIndentOnPasteWithinString": {
        "t": "bool"
    },
    "automaticLayout": {
        "t": "bool"
    },
    "autoSurround": {
        "t": "enum",
        "values": [
            "languageDefined",
            "quotes",
            "brackets",
            "never"
        ]
    },
    "codeLens": {
        "t": "bool"
    },
    "codeLensFontFamily": {
        "t": "string"
    },
    "codeLensFontSize": {
        "t": "int",
        "min": 0,
        "max": 100
    },
    "colorDecorators": {
        "t": "bool"
    },
    "colorDecoratorsLimit": {
        "t": "int",
        "min": 1,
        "max": 1000000
    },
    "columnSelection": {
        "t": "bool"
    },
    "contextmenu": {
        "t": "bool"
    },
    "copyWithSyntaxHighlighting": {
        "t": "bool"
    },
    "cursorBlinking": {
        "t": "enumMap",
        "values": [
            "blink",
            "smooth",
            "phase",
            "expand",
            "solid"
        ],
        "map": {
            "blink": 1,
            "smooth": 2,
            "phase": 3,
            "expand": 4,
            "solid": 5
        }
    },
    "cursorSmoothCaretAnimation": {
        "t": "enum",
        "values": [
            "off",
            "explicit",
            "on"
        ]
    },
    "cursorStyle": {
        "t": "enumMap",
        "values": [
            "line",
            "block",
            "underline",
            "line-thin",
            "block-outline",
            "underline-thin"
        ],
        "map": {
            "line": 1,
            "block": 2,
            "underline": 3,
            "line-thin": 4,
            "block-outline": 5,
            "underline-thin": 6
        }
    },
    "cursorSurroundingLines": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "cursorSurroundingLinesStyle": {
        "t": "enum",
        "values": [
            "default",
            "all"
        ]
    },
    "cursorWidth": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "cursorHeight": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "disableLayerHinting": {
        "t": "bool"
    },
    "disableMonospaceOptimizations": {
        "t": "bool"
    },
    "domReadOnly": {
        "t": "bool"
    },
    "dragAndDrop": {
        "t": "bool"
    },
    "editContext": {
        "t": "bool"
    },
    "experimentalGpuAcceleration": {
        "t": "enum",
        "values": [
            "off",
            "on"
        ]
    },
    "experimentalWhitespaceRendering": {
        "t": "enum",
        "values": [
            "svg",
            "font",
            "off"
        ]
    },
    "extraEditorClassName": {
        "t": "string"
    },
    "fastScrollSensitivity": {
        "t": "float"
    },
    "fixedOverflowWidgets": {
        "t": "bool"
    },
    "folding": {
        "t": "bool"
    },
    "foldingStrategy": {
        "t": "enum",
        "values": [
            "auto",
            "indentation"
        ]
    },
    "foldingHighlight": {
        "t": "bool"
    },
    "foldingImportsByDefault": {
        "t": "bool"
    },
    "foldingMaximumRegions": {
        "t": "int",
        "min": 10,
        "max": 65000
    },
    "unfoldOnClickAfterEndOfLine": {
        "t": "bool"
    },
    "fontFamily": {
        "t": "string"
    },
    "formatOnPaste": {
        "t": "bool"
    },
    "formatOnType": {
        "t": "bool"
    },
    "glyphMargin": {
        "t": "bool"
    },
    "hideCursorInOverviewRuler": {
        "t": "bool"
    },
    "inDiffEditor": {
        "t": "bool"
    },
    "letterSpacing": {
        "t": "float"
    },
    "lineNumbersMinChars": {
        "t": "int",
        "min": 1,
        "max": 300
    },
    "linkedEditing": {
        "t": "bool"
    },
    "links": {
        "t": "bool"
    },
    "matchBrackets": {
        "t": "enum",
        "values": [
            "always",
            "near",
            "never"
        ]
    },
    "mouseStyle": {
        "t": "enum",
        "values": [
            "text",
            "default",
            "copy"
        ]
    },
    "mouseWheelScrollSensitivity": {
        "t": "float"
    },
    "mouseWheelZoom": {
        "t": "bool"
    },
    "multiCursorMergeOverlapping": {
        "t": "bool"
    },
    "multiCursorModifier": {
        "t": "enumMap",
        "values": [
            "ctrlCmd",
            "alt"
        ],
        "map": {
            "ctrlCmd": "metaKey",
            "alt": "altKey"
        }
    },
    "mouseMiddleClickAction": {
        "t": "enum",
        "values": [
            "default",
            "openLink",
            "ctrlLeftClick"
        ]
    },
    "multiCursorPaste": {
        "t": "enum",
        "values": [
            "spread",
            "full"
        ]
    },
    "multiCursorLimit": {
        "t": "int",
        "min": 1,
        "max": 100000
    },
    "occurrencesHighlight": {
        "t": "enum",
        "values": [
            "off",
            "singleFile",
            "multiFile"
        ]
    },
    "occurrencesHighlightDelay": {
        "t": "int",
        "min": 0,
        "max": 2000
    },
    "overtypeCursorStyle": {
        "t": "enumMap",
        "values": [
            "line",
            "block",
            "underline",
            "line-thin",
            "block-outline",
            "underline-thin"
        ],
        "map": {
            "line": 1,
            "block": 2,
            "underline": 3,
            "line-thin": 4,
            "block-outline": 5,
            "underline-thin": 6
        }
    },
    "overtypeOnPaste": {
        "t": "bool"
    },
    "overviewRulerBorder": {
        "t": "bool"
    },
    "overviewRulerLanes": {
        "t": "int",
        "min": 0,
        "max": 3
    },
    "peekWidgetDefaultFocus": {
        "t": "enum",
        "values": [
            "tree",
            "editor"
        ]
    },
    "definitionLinkOpensInPeek": {
        "t": "bool"
    },
    "quickSuggestionsDelay": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "readOnly": {
        "t": "bool"
    },
    "renameOnType": {
        "t": "bool"
    },
    "renderRichScreenReaderContent": {
        "t": "bool"
    },
    "renderControlCharacters": {
        "t": "bool"
    },
    "renderFinalNewline": {
        "t": "enum",
        "values": [
            "off",
            "on",
            "dimmed"
        ]
    },
    "renderLineHighlight": {
        "t": "enum",
        "values": [
            "none",
            "gutter",
            "line",
            "all"
        ]
    },
    "renderLineHighlightOnlyWhenFocus": {
        "t": "bool"
    },
    "renderValidationDecorations": {
        "t": "enum",
        "values": [
            "editable",
            "on",
            "off"
        ]
    },
    "renderWhitespace": {
        "t": "enum",
        "values": [
            "none",
            "boundary",
            "selection",
            "trailing",
            "all"
        ]
    },
    "revealHorizontalRightPadding": {
        "t": "int",
        "min": 0,
        "max": 1000
    },
    "roundedSelection": {
        "t": "bool"
    },
    "scrollBeyondLastColumn": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "scrollBeyondLastLine": {
        "t": "bool"
    },
    "scrollPredominantAxis": {
        "t": "bool"
    },
    "selectionClipboard": {
        "t": "bool"
    },
    "selectionHighlight": {
        "t": "bool"
    },
    "selectionHighlightMaxLength": {
        "t": "int",
        "min": 0,
        "max": 1073741824
    },
    "selectionHighlightMultiline": {
        "t": "bool"
    },
    "selectOnLineNumbers": {
        "t": "bool"
    },
    "showFoldingControls": {
        "t": "enum",
        "values": [
            "always",
            "never",
            "mouseover"
        ]
    },
    "showUnused": {
        "t": "bool"
    },
    "snippetSuggestions": {
        "t": "enum",
        "values": [
            "top",
            "bottom",
            "inline",
            "none"
        ]
    },
    "smoothScrolling": {
        "t": "bool"
    },
    "stickyTabStops": {
        "t": "bool"
    },
    "stopRenderingLineAfter": {
        "t": "int",
        "min": -1,
        "max": 1073741824
    },
    "suggestFontSize": {
        "t": "int",
        "min": 0,
        "max": 1000
    },
    "suggestLineHeight": {
        "t": "int",
        "min": 0,
        "max": 1000
    },
    "suggestOnTriggerCharacters": {
        "t": "bool"
    },
    "suggestSelection": {
        "t": "enum",
        "values": [
            "first",
            "recentlyUsed",
            "recentlyUsedByPrefix"
        ]
    },
    "tabCompletion": {
        "t": "enum",
        "values": [
            "on",
            "off",
            "onlySnippets"
        ]
    },
    "tabIndex": {
        "t": "int",
        "min": -1,
        "max": 1073741824
    },
    "trimWhitespaceOnDelete": {
        "t": "bool"
    },
    "unusualLineTerminators": {
        "t": "enum",
        "values": [
            "auto",
            "off",
            "prompt"
        ]
    },
    "useShadowDOM": {
        "t": "bool"
    },
    "useTabStops": {
        "t": "bool"
    },
    "wordBreak": {
        "t": "enum",
        "values": [
            "normal",
            "keepAll"
        ]
    },
    "wordSeparators": {
        "t": "string"
    },
    "wordWrap": {
        "t": "enum",
        "values": [
            "off",
            "on",
            "wordWrapColumn",
            "bounded"
        ]
    },
    "wordWrapBreakAfterCharacters": {
        "t": "string"
    },
    "wordWrapBreakBeforeCharacters": {
        "t": "string"
    },
    "wordWrapColumn": {
        "t": "int",
        "min": 1,
        "max": 1073741824
    },
    "wordWrapOverride1": {
        "t": "enum",
        "values": [
            "off",
            "on",
            "inherit"
        ]
    },
    "wordWrapOverride2": {
        "t": "enum",
        "values": [
            "off",
            "on",
            "inherit"
        ]
    },
    "showDeprecated": {
        "t": "bool"
    },
    "inertialScroll": {
        "t": "bool"
    },
    "wrapOnEscapedLineFeeds": {
        "t": "bool"
    },
    "tabFocusMode": {
        "t": "bool"
    },
    "defaultColorDecorators": {
        "t": "enum",
        "values": [
            "auto",
            "always",
            "never"
        ]
    },
    "colorDecoratorsActivatedOn": {
        "t": "enum",
        "values": [
            "clickAndHover",
            "hover",
            "click"
        ]
    },
    "inlineCompletionsAccessibilityVerbose": {
        "t": "bool"
    },
    "scrollOnMiddleClick": {
        "t": "bool"
    }
}
