# Monaco 单测对齐进度

> 自动生成,别手改:`node scripts/parity-report.mjs`。对标 monaco-editor 0.55.1(VS Code `86f5a62`)。

## 总览

| | 文件 | 用例 |
|---|---|---|
| Monaco 编辑器单测全集 | 157 | 3863 |
| 不适用(Monaco 内部实现,声明不做) | 39 | 581 |
| 不适用用例(同文件里单划几条,见文末) | | 3 |
| **范围内(分母)** | **118** | **3279** |
| 已接入并真跑 lite-monaco | 118 | 3279 |
| **其中通过** | | **3279** (100.0% of 分母) |

## A 编辑行为  (871/871)

| 状态 | 通过/总数 | 文件 |
|---|---|---|
| ✅ 全过 | 7/7 | contrib/bracketMatching/test/browser/bracketMatching.test.ts |
| ✅ 全过 | 4/4 | contrib/caretOperations/test/browser/moveCarretCommand.test.ts |
| ✅ 全过 | 12/12 | contrib/comment/test/browser/blockCommentCommand.test.ts |
| ✅ 全过 | 39/39 | contrib/comment/test/browser/lineCommentCommand.test.ts |
| ✅ 全过 | 2/2 | contrib/cursorUndo/test/browser/cursorUndo.test.ts |
| ✅ 全过 | 33/33 | contrib/indentation/test/browser/indentation.test.ts |
| ✅ 全过 | 39/39 | contrib/indentation/test/browser/indentationLineProcessor.test.ts |
| ✅ 全过 | 1/1 | contrib/lineSelection/test/browser/lineSelection.test.ts |
| ✅ 全过 | 10/10 | contrib/linesOperations/test/browser/copyLinesCommand.test.ts |
| ✅ 全过 | 52/52 | contrib/linesOperations/test/browser/linesOperations.test.ts |
| ✅ 全过 | 14/14 | contrib/linesOperations/test/browser/moveLinesCommand.test.ts |
| ✅ 全过 | 7/7 | contrib/linesOperations/test/browser/sortLinesCommand.test.ts |
| ✅ 全过 | 38/38 | contrib/linkedEditing/test/browser/linkedEditing.test.ts |
| ✅ 全过 | 17/17 | contrib/multicursor/test/browser/multicursor.test.ts |
| ✅ 全过 | 14/14 | contrib/smartSelect/test/browser/smartSelect.test.ts |
| ✅ 全过 | 15/15 | contrib/snippet/test/browser/snippetController2.old.test.ts |
| ✅ 全过 | 38/38 | contrib/snippet/test/browser/snippetController2.test.ts |
| ✅ 全过 | 52/52 | contrib/snippet/test/browser/snippetParser.test.ts |
| ✅ 全过 | 38/38 | contrib/snippet/test/browser/snippetSession.test.ts |
| ✅ 全过 | 16/16 | contrib/snippet/test/browser/snippetVariables.test.ts |
| ✅ 全过 | 54/54 | contrib/wordOperations/test/browser/wordOperations.test.ts |
| ✅ 全过 | 15/15 | contrib/wordPartOperations/test/browser/wordPartOperations.test.ts |
| ✅ 全过 | 25/25 | test/browser/commands/shiftCommand.test.ts |
| ✅ 全过 | 2/2 | test/browser/commands/trimTrailingWhitespaceCommand.test.ts |
| ✅ 全过 | 252/252 | test/browser/controller/cursor.test.ts |
| ✅ 全过 | 47/47 | test/browser/controller/cursorMoveCommand.test.ts |
| ✅ 全过 | 26/26 | test/browser/controller/textAreaState.test.ts |
| ✅ 全过 | 2/2 | test/common/controller/cursorAtomicMoveOperations.test.ts |

## B 查找/折叠/提示  (242/242)

| 状态 | 通过/总数 | 文件 |
|---|---|---|
| ✅ 全过 | 3/3 | contrib/find/test/browser/find.test.ts |
| ✅ 全过 | 18/18 | contrib/find/test/browser/findController.test.ts |
| ✅ 全过 | 43/43 | contrib/find/test/browser/findModel.test.ts |
| ✅ 全过 | 8/8 | contrib/find/test/browser/replacePattern.test.ts |
| ✅ 全过 | 17/17 | contrib/folding/test/browser/foldingModel.test.ts |
| ✅ 全过 | 7/7 | contrib/folding/test/browser/foldingRanges.test.ts |
| ✅ 全过 | 18/18 | contrib/folding/test/browser/hiddenRangeModel.test.ts |
| ✅ 全过 | 1/1 | contrib/folding/test/browser/indentFold.test.ts |
| ✅ 全过 | 25/25 | contrib/folding/test/browser/indentRangeProvider.test.ts |
| ✅ 全过 | 1/1 | contrib/folding/test/browser/syntaxFold.test.ts |
| ✅ 全过 | 1/1 | contrib/gotoSymbol/test/browser/referencesModel.test.ts |
| ✅ 全过 | 2/2 | contrib/hover/test/browser/contentHover.test.ts |
| ✅ 全过 | 6/6 | contrib/hover/test/browser/hoverCopyButton.test.ts |
| ✅ 全过 | 1/1 | contrib/inlineCompletions/test/browser/suggestWidgetModel.test.ts |
| ✅ 全过 | 10/10 | contrib/parameterHints/test/browser/parameterHintsModel.test.ts |
| ✅ 全过 | 1/1 | contrib/quickAccess/test/browser/gotoLineQuickAccess.test.ts |
| ✅ 全过 | 4/4 | contrib/stickyScroll/test/browser/stickyScroll.test.ts |
| ✅ 全过 | 13/13 | contrib/suggest/test/browser/completionModel.test.ts |
| ✅ 全过 | 6/6 | contrib/suggest/test/browser/suggest.test.ts |
| ✅ 全过 | 11/11 | contrib/suggest/test/browser/suggestController.test.ts |
| ✅ 全过 | 2/2 | contrib/suggest/test/browser/suggestInlineCompletions.test.ts |
| ✅ 全过 | 20/20 | contrib/suggest/test/browser/suggestMemory.test.ts |
| ✅ 全过 | 23/23 | contrib/suggest/test/browser/suggestModel.test.ts |
| ✅ 全过 | 1/1 | contrib/suggest/test/browser/wordDistance.test.ts |

## C 纯算法/配置  (2166/2166)

| 状态 | 通过/总数 | 文件 |
|---|---|---|
| ✅ 全过 | 7/7 | contrib/codeAction/test/browser/codeAction.test.ts |
| ✅ 全过 | 3/3 | contrib/codeAction/test/browser/codeActionKeybindingResolver.test.ts |
| ✅ 全过 | 3/3 | contrib/codeAction/test/browser/codeActionModel.test.ts |
| ✅ 全过 | 5/5 | contrib/documentSymbols/test/browser/outlineModel.test.ts |
| ✅ 全过 | 4/4 | contrib/dropOrPasteInto/test/browser/editSort.test.ts |
| ✅ 全过 | 6/6 | contrib/editorState/test/browser/editorState.test.ts |
| ✅ 全过 | 10/10 | contrib/inlineCompletions/test/browser/computeGhostText.test.ts |
| ✅ 全过 | 3/3 | contrib/inlineCompletions/test/browser/getSecondaryEdits.test.ts |
| ✅ 全过 | 11/11 | contrib/inlineCompletions/test/browser/graph.test.ts |
| ✅ 全过 | 25/25 | contrib/inlineCompletions/test/browser/inlineCompletions.test.ts |
| ✅ 全过 | 3/3 | contrib/inlineCompletions/test/browser/inlineEdits.test.ts |
| ✅ 全过 | 4/4 | contrib/semanticTokens/test/browser/documentSemanticTokens.test.ts |
| ✅ 全过 | 1/1 | contrib/semanticTokens/test/browser/getSemanticTokens.test.ts |
| ✅ 全过 | 1/1 | contrib/semanticTokens/test/browser/viewportSemanticTokens.test.ts |
| ✅ 全过 | 9/9 | standalone/test/browser/monarch.test.ts |
| ✅ 全过 | 2/2 | standalone/test/browser/standaloneLanguages.test.ts |
| ✅ 全过 | 69/69 | test/browser/commands/sideEditing.test.ts |
| ✅ 全过 | 36/36 | test/browser/config/editorConfiguration.test.ts |
| ✅ 全过 | 19/19 | test/browser/config/editorLayoutProvider.test.ts |
| ✅ 全过 | 14/14 | test/browser/services/openerService.test.ts |
| ✅ 全过 | 2/2 | test/browser/view/minimapCharRenderer.test.ts |
| ✅ 全过 | 9/9 | test/browser/widget/codeEditorWidget.test.ts |
| ✅ 全过 | 4/4 | test/browser/widget/diffEditorWidget.test.ts |
| ✅ 全过 | 5/5 | test/browser/widget/observableCodeEditor.test.ts |
| ✅ 全过 | 1/1 | test/common/core/characterClassifier.test.ts |
| ✅ 全过 | 7/7 | test/common/core/cursorColumns.test.ts |
| ✅ 全过 | 1107/1107 | test/common/core/edit.test.ts |
| ✅ 全过 | 4/4 | test/common/core/lineRange.test.ts |
| ✅ 全过 | 2/2 | test/common/core/positionOffsetTransformer.test.ts |
| ✅ 全过 | 9/9 | test/common/core/range.test.ts |
| ✅ 全过 | 49/49 | test/common/diff/diffComputer.test.ts |
| ✅ 全过 | 5/5 | test/common/languages/defaultDocumentColorsComputer.test.ts |
| ✅ 全过 | 7/7 | test/common/model/bracketPairColorizer/getBracketPairsInRange.test.ts |
| ✅ 全过 | 57/57 | test/common/model/editableTextModel.test.ts |
| ✅ 全过 | 4/4 | test/common/model/editableTextModelAuto.test.ts |
| ✅ 全过 | 53/53 | test/common/model/model.line.test.ts |
| ✅ 全过 | 14/14 | test/common/model/model.modes.test.ts |
| ✅ 全过 | 32/32 | test/common/model/model.test.ts |
| ✅ 全过 | 100/100 | test/common/model/modelDecorations.test.ts |
| ✅ 全过 | 8/8 | test/common/model/modelEditOperation.test.ts |
| ✅ 全过 | 1/1 | test/common/model/modelInjectedText.test.ts |
| ✅ 全过 | 38/38 | test/common/model/textModel.test.ts |
| ✅ 全过 | 42/42 | test/common/model/textModelSearch.test.ts |
| ✅ 全过 | 29/29 | test/common/model/textModelWithTokens.test.ts |
| ✅ 全过 | 16/16 | test/common/model/tokensStore.test.ts |
| ✅ 全过 | 25/25 | test/common/model/tokenStore.test.ts |
| ✅ 全过 | 11/11 | test/common/modes/languageConfiguration.test.ts |
| ✅ 全过 | 11/11 | test/common/modes/languageSelector.test.ts |
| ✅ 全过 | 14/14 | test/common/modes/linkComputer.test.ts |
| ✅ 全过 | 13/13 | test/common/modes/supports/characterPair.test.ts |
| ✅ 全过 | 2/2 | test/common/modes/supports/electricCharacter.test.ts |
| ✅ 全过 | 4/4 | test/common/modes/supports/onEnter.test.ts |
| ✅ 全过 | 16/16 | test/common/services/editorWebWorker.test.ts |
| ✅ 全过 | 14/14 | test/common/services/findSectionHeaders.test.ts |
| ✅ 全过 | 9/9 | test/common/services/languagesAssociations.test.ts |
| ✅ 全过 | 1/1 | test/common/services/languageService.test.ts |
| ✅ 全过 | 14/14 | test/common/services/languagesRegistry.test.ts |
| ✅ 全过 | 20/20 | test/common/services/modelService.test.ts |
| ✅ 全过 | 3/3 | test/common/services/semanticTokensProviderStyling.test.ts |
| ✅ 全过 | 1/1 | test/common/services/unicodeTextModelHighlighter.test.ts |
| ✅ 全过 | 15/15 | test/common/viewLayout/lineHeights.test.ts |
| ✅ 全过 | 4/4 | test/common/viewModel/glyphLanesModel.test.ts |
| ✅ 全过 | 9/9 | test/common/viewModel/lineBreakData.test.ts |
| ✅ 全过 | 18/18 | test/common/viewModel/monospaceLineBreaksComputer.test.ts |
| ✅ 全过 | 5/5 | test/node/diffing/defaultLinesDiffComputer.test.ts |
| ✅ 全过 | 117/117 | test/node/diffing/fixtures.test.ts |

## 不适用清单

<details><summary>39 个文件</summary>

- standalone/test/browser/standaloneServices.test.ts (1) —— 测的是 StandaloneKeybindingService:它挂在 platform 的 IContextKeyService / ICommandService / INotificationService / ITelemetryService 依赖注入容器上,把 addDynamicKeybinding 的规则解析成 ResolvedKeybinding,并向 domNode(含 null target = 全局)的 keydown 派发。lite-monaco 的键位派发是逐 view 绑定(api/commands.ts 的 addViewKeybinding / addKeybindingRules,规则在 view 的 keymap 里匹配),没有「按 DOM 节点 + 全局 null target 挂接 keydown」的服务对象,也没有 platform DI 容器;要接就得在垫片里实现一整个 StandaloneKeybindingService(规则表 + 修饰键解析 + 派发),即实现被测行为。
- test/browser/controller/textAreaInput.test.ts (19) —— 已由 __tests__/core/parity-textarea-input.test.ts 逐条翻译覆盖(19 条真机录像的 DOM 事件回放,最终文档与选区 == 原版 final;录像数据在 __fixtures__/textarea-input-recordings.json)。不测原版 type{} 回调序列(lite-monaco 无此层)(原因存档:整文件测的是 Monaco 隐藏 <textarea> 输入协议,lite-monaco 是 contenteditable 无此层,缺失的概念:(1) ITextAreaWrapper 记录的 textarea 事件流(keydown/input/compositionstart/update/end/paste)-> TextAreaInput 回调 type{text,replacePrevCharCnt,replaceNextCharCnt,positionDelta};(2) TextAreaState 的 value/selectionStart/selectionEnd 镜像与 deduceInput 对前后 textarea 值做 diff 推导 replacePrev/replaceNext;(3) compositionend 后 textarea 值回填与 retype 重放;(4) textarea 选区/值与编辑器选区的同步(writeNativeTextAreaContent)。lite-monaco 的输入是浏览器直接改 contenteditable DOM,经 MutationObserver -> domchange.findDiff 读回 doc,没有 type 回调与 replacePrev/Next 语义,任何 shim 都只能自行合成 textarea 协议=在 shim 里实现被测行为,违反 README。对应行为(IME 选词/中间态/落定、DOM≡doc 双射)由自有 __tests__/core/input-harness.ts 的 imeCompose 等回放测试覆盖。)
- test/browser/gpu/atlas/textureAtlas.test.ts (6) —— WebGPU 渲染器内部(纹理图集及其分配器、缓冲脏区追踪、装饰 CSS 提取、对象集合缓冲)。lite-monaco 渲染走 DOM(core/view buildtile→materialize 增量 patch),没有 GPU 路径,也没有这些数据结构;垫片要造就是实现被测行为。
- test/browser/gpu/atlas/textureAtlasAllocator.test.ts (11) —— WebGPU 渲染器内部(纹理图集及其分配器、缓冲脏区追踪、装饰 CSS 提取、对象集合缓冲)。lite-monaco 渲染走 DOM(core/view buildtile→materialize 增量 patch),没有 GPU 路径,也没有这些数据结构;垫片要造就是实现被测行为。
- test/browser/gpu/bufferDirtyTracker.test.ts (2) —— WebGPU 渲染器内部(纹理图集及其分配器、缓冲脏区追踪、装饰 CSS 提取、对象集合缓冲)。lite-monaco 渲染走 DOM(core/view buildtile→materialize 增量 patch),没有 GPU 路径,也没有这些数据结构;垫片要造就是实现被测行为。
- test/browser/gpu/decorationCssRulerExtractor.test.ts (6) —— WebGPU 渲染器内部(纹理图集及其分配器、缓冲脏区追踪、装饰 CSS 提取、对象集合缓冲)。lite-monaco 渲染走 DOM(core/view buildtile→materialize 增量 patch),没有 GPU 路径,也没有这些数据结构;垫片要造就是实现被测行为。
- test/browser/gpu/objectCollectionBuffer.test.ts (6) —— WebGPU 渲染器内部(纹理图集及其分配器、缓冲脏区追踪、装饰 CSS 提取、对象集合缓冲)。lite-monaco 渲染走 DOM(core/view buildtile→materialize 增量 patch),没有 GPU 路径,也没有这些数据结构;垫片要造就是实现被测行为。
- test/browser/services/decorationRenderOptions.test.ts (6) —— 测的是 AbstractCodeEditorService.registerDecorationType / resolveDecorationOptions / DecorationTypeOptionsProvider:把 IDecorationRenderOptions(light/dark 两套 + before/after 伪元素 + overviewRulerColor + 主题色 id → CSS 变量)编译成注入 <style> 的 CSS 规则文本(断言 .monaco-editor .ced-… 选择器、border/outline 的逐边展开、rem 字号、themeColor 解析),并通过 IThemeService 的 getColorTheme().getColor(id) 取色。lite-monaco 的装饰公开 API 是 deltaDecorations 的 className/inlineClassName/beforeContentClassName/…ClassName(宿主自己提供 CSS),没有 registerDecorationType / createDecorationType 与「render options → 生成 CSS 规则」这层,也没有 IThemeService 的 theme color id 注册表;垫片要接就得实现整个 CSS 生成器,即实现被测行为。
- test/browser/view/viewLayer.test.ts (80) —— 测的是 Monaco 内部类 RenderedLinesCollection<ILine>(把当前已渲染的一段连续行号 [start, start+n) 存成 ILine[],并断言 onLinesDeleted/onLinesInserted/onLinesChanged/onTokensChanged 之后的行号平移、被删行返回值、getLine 越界抛错)。lite-monaco 的视图层是 CM7 式 docView:行 DOM 由 docview/materialize 按 doc 位置增量 patch(patchDOM 以稳定尾部锚定),没有「按行号索引的已渲染行集合」这个对象,也没有 ILine/ILineFactory 协议;垫片要造这个集合就是在垫片里实现被测行为(README 第 3 条违规)。行 DOM≡doc 的双射与增量更新由 __tests__/core 的 patchDOM / DOM≡doc 自有测试覆盖。
- test/browser/viewModel/modelLineProjection.test.ts (6) —— 已由 __tests__/core/parity-viewmodel.test.ts 逐条翻译覆盖(SplitLine / Invalid line numbers / #3662 / getViewLinesData ×3,经 SoftWrapModel + 公共 API;token 色号与视图行切分的 InlineDecoration 坐标是 Monaco 内部结构,不翻)(原因存档:测的是 Monaco ViewModel 层的 ModelLineProjection(模型行→若干视图行,含注入文本与折行)。lite-monaco 没有 ViewModel 层:视图直接由 EditorView 从 doc 投影,折行交给浏览器排版。)
- test/browser/viewModel/viewModelDecorations.test.ts (3) —— 已由 __tests__/core/parity-viewmodel.test.ts 逐条翻译覆盖(getDecorationsViewportData / #17208 / #37401,断言落在整行 DOM 上装饰的位置,不是 Monaco 按视图行切段的 InlineDecoration)(原因存档:测的是 ViewModelDecorations(模型装饰投影到视图行区间并算内联装饰类名)。lite-monaco 没有 ViewModel 层,装饰直接是 mark/widget 进 buildtile。)
- test/browser/viewModel/viewModelImpl.test.ts (19) —— 已由 __tests__/core/parity-viewmodel.test.ts 逐条翻译覆盖(#21073 / #44805 ×3 / getPlainTextToCopy ×11 / #22688 / #40926 / normalizePosition / #193262)(原因存档:测的是 Monaco ViewModelImpl(视图行号↔模型行号的映射、折叠隐藏区在视图坐标里的结果)。lite-monaco 没有 ViewModel 类与视图行号空间;折叠隐藏区的行为由 foldingmodel/HiddenRangeModel 移植(已全绿)覆盖。)
- test/common/core/lineTokens.test.ts (7) —— 测的是 Monaco 内部类 LineTokens(Uint32Array 二进制 token:偶数位 endOffset、奇数位 metadata 打包 foreground/fontStyle/tokenType/languageId)的 withInserted(把 decoration 注入文本拆成多段 token)、findTokenIndexAtOffset、inflate/sliceAndInflate、getMetadata。lite-monaco 的 token 是 shiki 产出的 ScopedToken[](相对偏移 + scope 数组,view/tokens.ts),只有 StandardTokenType 的 lineTokenTypes 一个出口,不存在 metadata 位域、languageId 编码,也没有「把注入文本并入 token 流」的操作(内联 decoration 在 lite-monaco 是 CM 式 mark/widget,不改 token 数组)。要接就得在垫片里写一整套二进制 token 容器,即实现被测行为。
- test/common/core/stringBuilder.test.ts (4) —— 测的是 Monaco 的 StringBuilder / decodeUTF16LE:往 Uint16Array 缓冲里按 UTF-16LE 逐码元写字符再一次性 decode 成字符串,是原版在渲染大量行 HTML 串时的性能工具(viewLineRenderer 里拼 <span>)。lite-monaco 的渲染走 DOM(preact / buildtile / materialize),全仓库没有任何「大量拼接 HTML 字符串」的路径,也就没有这个工具的调用点;为一个无调用方的类造出来是死代码。
- test/common/core/textEdit.test.ts (20) —— 测的是 Monaco 的 TextEdit / TextReplacement / StringText:以 (line,column) Range 寻址的不可变编辑,inverse(source) 后 applyToString 还原(Random.nextTextEdit 直接 new 原版 TextEdit)。lite-monaco 的编辑原语是以偏移寻址的 ChangeSet(core/model/change.ts,compose/invert/map),Range ↔ 偏移只在 api 边缘(model.applyEdits / getOffsetAt)转换,没有 TextEdit/StringText 这组类;inverse 往返的实质(ChangeSet.invert)已经通过 edit.test.ts 的 StringEdit 垫片(1000 例 inverse + 1000 例 compose)跑在 lite 的真实代码上。这里再造 Range 版 TextEdit 只是又包一层。
- test/common/model/bracketPairColorizer/beforeEditPositionMapper.test.ts (9) —— 测的是括号 AST 内部的 BeforeEditPositionMapper(编辑前→编辑后的 Length 偏移映射)。lite-monaco 的括号匹配不是增量 2-3 树,没有 Length/TextEditInfo 这套类型。
- test/common/model/bracketPairColorizer/brackets.test.ts (1) —— 唯一的用例直接 new Monaco 内部类 LanguageAgnosticBracketTokens + SmallImmutableSet/DenseKeyProvider,断言的是 getToken(text) 返回的内部 Token(length / bracketId / bracketIds 集合)。这些类型不在任何公开 API 上(ITextModel.bracketPairs 只暴露 BracketPairInfo / BracketInfo),lite-monaco 没有这层 token 分类表,垫片只能原样 re-export Monaco 真代码,等于测 Monaco 自己。公开面上的同类行为(括号配对/嵌套层级/多余闭括号)由 getBracketPairsInRange.test 覆盖(7/7 通过)。注:用例里的多字符括号(begin/end、\left( \right))括号树(src/api/bracketpairs.ts)和实时路径(core/edit/brackets 的 BracketTable:匹配高亮 / 彩虹括号 / 跳转,同一份词法规则 core/edit/bracketrule.ts)都支持,自有测试 __tests__/core/brackets-multichar.test.ts。
- test/common/model/bracketPairColorizer/combineTextEditInfos.test.ts (50) —— 测的是括号 AST 内部的 combineTextEditInfos(两批 TextEditInfo 合并的 Length 运算,50 例含随机)。lite-monaco 没有 TextEditInfo/Length 类型;编辑复合由 core/model/change 的 ChangeSet.compose 承担,已被 edit.test 的 StringEdit 垫片(1000 例 compose)覆盖。
- test/common/model/bracketPairColorizer/concat23Trees.test.ts (6) —— 测的是括号 AST 的 2-3 树拼接(concat23Trees/ListAstNode 的平衡)。lite-monaco 没有括号 AST。
- test/common/model/bracketPairColorizer/length.test.ts (2) —— 测的是括号 AST 内部的 Length(lineCount+columnCount 编码)运算。lite-monaco 没有此类型。
- test/common/model/bracketPairColorizer/smallImmutableSet.test.ts (2) —— 测的是括号 AST 内部的 SmallImmutableSet(括号 id 的位集)。lite-monaco 没有此结构。
- test/common/model/bracketPairColorizer/tokenizer.test.ts (1) —— 测的是括号 AST 内部的 Tokenizer(把文本切成 Bracket/Text/Length 的 AST token 流)。lite-monaco 的括号扫描不经过这个 token 流。
- test/common/model/editStack.test.ts (1) —— 唯一用例 new Monaco 内部类 SingleModelEditStackData(beforeVersionId / afterVersionId / 前后 EOL / 前后选区 / TextChange[])并断言它的 serialize()/deserialize() 二进制往返相等。SingleModelEditStackData 是 Monaco undoRedo 服务的撤销栈元素序列化格式(editStack.ts,用于跨窗口 / 热退出持久化撤销栈),不在 ITextModel 或任何公开 API 上;lite-monaco 的撤销在 core/edit/history(CM6 式 changeset 反转,存 ChangeSet 而非 TextChange 序列),没有对应对象也没有这个序列化协议。垫片只能原样 re-export Monaco 真代码,等于测 Monaco 自己。TextChange 本身的 serialize/deserialize 由 textChange.test(10/10 通过)覆盖。
- test/common/model/intervalTree.test.ts (25) —— 测的是装饰区间红黑树内部结构(IntervalTree/IntervalNode 的 insert/delete/acceptReplace、stickiness 的节点标志位、delta 懒传播)。lite-monaco 的装饰容器是 core/model/decoration 的 RangeSet(不可变、按位置有序、随 ChangeSet 映射),没有这棵树;装饰随编辑的行为(stickiness 等)由公开 API 的 modelDecorations 测试覆盖。
- test/common/model/linesTextBuffer/linesTextBuffer.test.ts (29) —— 测的是 Monaco 旧的 LinesTextBuffer 行数组缓冲实现及其 builder(chunk 拼接、BOM/EOL 探测的内部形态)。lite-monaco 没有这个缓冲类;外部行为同样由公开 model 测试覆盖。
- test/common/model/linesTextBuffer/linesTextBufferBuilder.test.ts (12) —— 测的是 Monaco 旧的 LinesTextBuffer 行数组缓冲实现及其 builder(chunk 拼接、BOM/EOL 探测的内部形态)。lite-monaco 没有这个缓冲类;外部行为同样由公开 model 测试覆盖。
- test/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.test.ts (87) —— 测的是 PieceTree 文本缓冲实现本身:直接 new PieceTreeTextBuffer/builder,断言 piece 链表、红黑树节点、chunk 拆分与 CRLF 跨块处理。lite-monaco 的文档是 core/model/rope(按行的 B 树),没有 piece/chunk 概念。缓冲的外部行为(插入删除、EOL 归一、行内容、偏移↔位置)由公开 ITextModel API 的 model/textModel/editableTextModel 测试覆盖。
- test/common/model/textChange.test.ts (10) —— 测的是 Monaco 内部纯工具类 TextChange(oldPosition/oldText/newPosition/newText 的 serialize/deserialize 与 compressConsecutiveTextChanges),它是 Monaco 撤销栈(SingleModelEditStackElement)存编辑的二进制格式。lite-monaco 的撤销是 core/edit/history 的 ChangeSet 反演,没有这个类;公开 API 只在 IValidEditOperation.textChange 上吐出一个同形状的普通对象(已由 model.test/editableTextModel 覆盖)。垫片要造这个类的序列化与合并就是实现被测行为,不接 lite-monaco 的文件原样跑只是在测 Monaco 自己。
- test/common/model/textModelTokens.test.ts (2) —— 测的是 TokenizationStateStore 的区间状态失效与回填(Monaco 的增量 tokenizer 状态机)。lite-monaco 的高亮由 shiki 逐行 grammar state 驱动,没有 TokenizationStateStore。
- test/common/modes/supports/richEditBrackets.test.ts (10) —— 测的是 Monaco 内部 BracketsUtils(在 token 文本里按反向正则找括号的纯函数)。lite-monaco 的括号匹配走配对表 + 语法树/词法扫描(core/edit/brackets),没有这组「给定正则 + 一段 token 文本 → 找前/后括号范围」的函数,也不对外暴露
- test/common/modes/supports/tokenization.test.ts (16) —— 测的是 Monaco 内部的 TokenTheme / parseTokenTheme / ColorMap / ExternalThemeTrieElement / ThemeTrieElementRule:把 ITokenThemeRule[](token 点分前缀、foreground/background/fontStyle)解析成 trie,match(languageId, token) 返回打包了 fontStyle + foreground colorId + background colorId 的 metadata,并断言 ColorMap 里颜色 id 的分配顺序、规则继承与合并。lite-monaco 的主题是 shiki 主题(api/themes.ts 把 IStandaloneThemeData.rules 翻成 TextMate settings[{scope,settings}],token 选择交给 shiki 的 TextMate 作用域匹配),没有 trie、没有 colorId/ColorMap、没有 metadata 位域,也没有 Monarch token 名到颜色的运行时匹配;对应能力(rules → scope 的翻译与继承)已在 api/themes.ts,由 __tests__/core 的 h3-theme / theme-fix2 / theme-instance 自有测试覆盖。垫片要造 trie + ColorMap 就是实现被测行为。
- test/common/modes/textToHtmlTokenizer.test.ts (5) —— 测的是 Monaco 内部函数 _tokenizeToString / tokenizeLineToHTML(TokenizationRegistry 里的 ITokenizationSupport.tokenizeEncoded → 按 metadata 的 colorId 渲染成 <span class="mtkN"> + monaco-tokenized-source 的 HTML 串,含 tab/空格 &nbsp; 展开规则)。lite-monaco 没有 TokenizationRegistry、没有 colorId/mtk 类名体系(颜色来自 shiki 主题 token 的内联样式,渲染走 DOM 增量 patch),也没有 editor.colorize / colorizeElement / tokenize 这套公开 API(grep src/api 无),因此这个函数在 lite-monaco 里没有对应物可翻译。
- test/common/services/semanticTokensDto.test.ts (4) —— 测的是 Monaco 内部的 semanticTokensDto(encode/decodeSemanticTokensDto:把语义 token 的 Uint32Array 打包成 VSBuffer 经 web worker/ext host 传输的线路格式)。lite-monaco 的语义 token 提供者与语言服务同进程,没有跨进程序列化层,也没有 VSBuffer;公开面上的语义 token 行为由 tokensStore/documentSemanticTokens 测试覆盖。
- test/common/services/textResourceConfigurationService.test.ts (22) —— 测的是 TextResourceConfigurationService:建立在 platform 的分层 IConfigurationService(ConfigurationTarget 的 default/user/workspace/folder 多层合并)+ IWorkspaceContextService(按资源找工作区文件夹)+ IModelService/ILanguageService(按资源的语言取 [lang] 覆盖)之上,断言 getValue(resource, position, section) 按资源所在文件夹与光标处语言解析的结果和 updateValue 写入哪一层。lite-monaco 的配置是单层 EditorOptions(updateOptions),按语言只有 api/options 的 per-language override,没有 ConfigurationTarget 分层、工作区文件夹与 IWorkspaceContextService;垫片要接就得实现分层配置合并,即实现被测行为。
- test/common/view/overviewZoneManager.test.ts (3) —— 测的是 Monaco 的 OverviewZoneManager.resolveColorZones:把 OverviewRulerZone(起止行、颜色 id、z)按 domHeight/outerHeight/lineHeight/pixelRatio 解析成像素 ColorZone(from/to/colorId),带「单行最小像素高、相邻同色合并、最大 6px 帽」等规则,供旧的 DOM 概览尺使用。lite-monaco 的概览尺是 core/chrome/overviewpaint:装饰按颜色分组成 [lane,startLine,endLine] 三元组(groupOverviewDecos),paintOverview 直接在 canvas 上按 ratio 算 y1/y2 并 fillRect(最小 6*dpr 高、同 lane 相邻并段),对应 Monaco 较新的 decorationsOverviewRuler,而不是 OverviewZoneManager;没有 ColorZone / OverviewRulerZone / colorId 池这套中间表示,几何算法也不同(不产出可比较的像素区间数组,直接画)。强行对比要么得在垫片里重写 resolveColorZones,要么改 paintOverview 去产出 ColorZone,都不是对齐行为而是为测试造结构。
- test/common/viewLayout/lineDecorations.test.ts (5) —— 测的是 Monaco LineDecorationsNormalizer.normalize:把一行上互相重叠的 LineDecoration(各带 className 与 InlineDecorationType)压平成不重叠的 DecorationSegment 序列,重叠段的类名串联成 'c2 c1'、按 type 决定 Before/After 只占 1 列。lite-monaco 的行内装饰是 CM6 式 mark(core/model/decoration.ts,带 rank)+ buildtile 的 MarkTile 嵌套成 DOM 子树,重叠由嵌套表达,不存在「压平成类名拼接的平铺段」这一步,也没有 LineDecoration/DecorationSegment/InlineDecorationType 数据结构;mark 嵌套顺序(低 rank 内层 CSS 赢)由 __tests__/core 的 decoration / buildtile 自有测试覆盖。垫片要造平铺段算法就是在垫片里实现被测行为。
- test/common/viewLayout/linesLayout.test.ts (12) —— 测的是 Monaco 的 LinesLayout:以「行号」为索引的纵向布局,whitespace(afterLineNumber、height、minWidth、ordinal)插入/改高/删除、getVerticalOffsetForLineNumber / getWhitespaceAtVerticalOffset / getLinesViewportData / getLineNumberAtOrAfterVerticalOffset 等纯数学。lite-monaco 的纵向布局是 core/view/heightmap 的 HeightMap(以文档偏移为键的 sum-tree,行高来自 HeightOracle 估算 + 视口内真实测量,折行靠浏览器排版),view zone 在 editorview 里登记后只作为 spaceAbove 投影进 heightmap 与行 DOM 的 margin-top,没有独立的 whitespace 行号表,也没有 LinesLayout 这个对象及其 API。垫片要把 HeightMap 改装成行号 API 就是在垫片里实现被测行为;heightmap 由 __tests__/core/heightmap.test.ts 覆盖,view zone 由 v-api / final-host 等测试覆盖。
- test/common/viewLayout/viewLineRenderer.test.ts (70) —— 已由 __tests__/core/parity-viewline-colorize.test.ts(21 条:静态着色路径 renderColorizedLine,原测快照 HTML 逐条比对)与 __tests__/core/parity-viewline-editor.test.ts(66 条:编辑器正文 DOM 上的空白记号 / RTL / 行内装饰 / 控制字符 / 字符映射)逐条翻译覆盖,70 个原测标题各有一条;有意不同:正文不截断(stopRenderingLineAfter)(原因存档:测的是 Monaco 的 renderViewLine2:把一行文本 + 行内 token(TestLineTokens 的 metadata 位域)+ LineDecoration + 空白/控制字符渲染选项,拼成 <span class="mtkN mtkw …"> 的 HTML 字符串,并给出 CharacterMapping(part/charIndex ↔ DOM 偏移)。断言全是逐 span 的类名与内容串(mtk1/mtkz/mtkw/mtki、&#160;、→ 的 canUseHalfwidthRightwardsArrow、renderControlCharacters 的 U+2400 区字符、fauxIndent 等)。lite-monaco 没有「行 → HTML 串」这一层:行 DOM 由 core/view/buildtile(Tile 树)→ materialize 增量 patch 生成,颜色来自 shiki 主题 token 的内联样式而不是 mtk 颜色 id 类,空白与特殊字符走 core/feature/whitespace.ts、specialchar.ts 的装饰,没有 CharacterMapping(位置↔DOM 靠 dombridge 的 pos↔DOM 双射)。要过这 70 条就得在垫片里写一个 mtk 类名的 HTML 渲染器,那是在垫片里实现被测行为(README 第 3 条违规)。行 DOM≡doc 与空白/特殊字符渲染由 __tests__/core 的 dombridge / domchange / whitespace / specialchar 自有测试覆盖。)
- test/common/viewModel/prefixSumComputer.test.ts (1) —— 测的是 Monaco 的 PrefixSumComputer(Uint32Array 前缀和,insertValues/removeValues/changeValue/getPrefixSum/getIndexOf,带 PrefixSumIndexOfResult 复用对象):PieceTree 的行长表和 LinesLayout 的行高表底层用它。lite-monaco 里没有这个数据结构的使用点:文档是 core/model/rope(按行串 + 长度的 B 树,lineAt/offset 由树本身给出),行高是 heightmap 的 sum-tree,minimap/gutter 的行→行号映射是各自的二分,没有任何生产代码需要「可变长数组的前缀和」。写一个没有调用方的 PrefixSumComputer 只会多出一份死代码,而垫片自己实现又是违规,所以 N/A。

</details>

## 不适用用例

- test/common/viewLayout/lineHeights.test.ts :: handles deleting lines overlapping with custom line heights —— 测的是 LineHeightsManager 按 decorationId 合并/截断连续行的内部规则。Monaco 里一条行高装饰只作用在起点所在的模型行(viewModelImpl._getCustomLineHeights 取的是 startLineNumber 那一行),管理器的 [start,end] 只是这一行折行后的视图行区间;lite-monaco 没有视图行空间(折行交给浏览器),装饰同样只作用起点行,没有「一个 id 占多行」的状态。垫片把区间拆成逐模型行的点装饰是翻译上的不得已,要让它过就得在垫片里重写管理器的 id 合并规则(虚绿)。该文件其余 15 条照常算分;装饰随删行/插行的真实行为已在真编辑器上核对:前删上移、后删不动、整段包含时塌到起点。
- test/common/viewLayout/lineHeights.test.ts :: handles inserting lines inside custom line heights range —— 同上:依赖管理器对同一 decorationId 的多行「补洞」(onLinesInserted 的 decorationsWithGaps)。lite-monaco 里一条行高装饰只占起点一行,在它中间插行没有「范围」可言。
- test/common/viewLayout/lineHeights.test.ts :: partial deletion with multiple lines for the same decoration ID —— 同上:依赖管理器的「同 id 前面已有幸存行,则被删区间塌缩出的行丢弃」规则(onLinesDeleted 的 decorationIdsSeen)。lite-monaco 没有同一 id 占多行的状态。
