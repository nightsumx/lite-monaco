# browser-diff 进度(fork 续作)

## 已修(src 里,均有 vitest 或场景断言)
- 折行行数:`wrapLayout`/`HeightOracle.rowsOfLine`(`__tests__/core/wraprows.test.ts`,14 条);CSS 改 `break-spaces + overflow-wrap:anywhere`
- 折行 `getContentWidth()`:`wrappedContentWidth()`(场景 10-wrap 的期望值)
- 折行 `getVisibleRanges()` 结束列(10-wrap)
- `wrappingColumn` 与 Monaco 公式一致;minimap 开启时折行右 pad 2px
- 视图区 zone:同行叠加 margin-top、domNode 高度(70-structure)
- 折叠动作 id `editor.foldLevelN` 等(actions.ts)
- 独立默认值:glyphMargin=false、overviewRulerLanes=2;显式 glyphMargin:true 占一条车道
- 括号匹配场景选择器(lite 的 `.cm-bracketBox`)

## 根因备忘
- 90-layout 里 content/scroll.width 差 400+px:Monaco 只量已渲染行,lite 量全文 → 分类为有意不同

- 开关折行(`wordWrap` off→on):`applyViewConfig` 清掉横条的 contentDOM min-width,`applyWrapWidth` 返回宽度是否变,变了就重量行高(toggle-wrap-alt-z)
- showIfCollapsed 的空区间装饰:一字宽 inline-block + 负外边距 + 1lh 高,与 Monaco 框同位同大小
- known.mjs 重写:去掉已修的折行规则,新增 10 条有具体成因的分类

## 最终(165 场景):一致 83,有差异 82;有意不同 525,monaco怪 26,bug 0,未分类 0
- 上一轮开始:一致 65,有差异 100;有意不同 467,bug 209,monaco怪 14,未分类 11
- 本轮协调者给的基线:一致 72;bug 142、有意 438、未分类 25、monaco怪 14

## 没对齐的有意不同(原因)
- 选区框(38 项/9 场景)、装饰框 top/height(12):lite 选区/内联装饰取 DOM Range 字体框,Monaco 取行盒;改选区层是大改,没做
- a11y(240 项):Monaco EditContext vs lite contenteditable,结构不同
- 含 RTL 字符的行:Monaco 整行 dir=rtl,lite 首强方向;没做
- 不折行时的 content/scroll.width(79 项):Monaco 只量渲染过的行

## 第三轮 · 块 1:smoke html(fork)
- 根因:F1 → "Show Hover" 回车选中的是第一项 "Show Definition Preview Hover"。lite 的 `showDefinitionPreviewHover`(src/lang/defhover.ts)在「光标处没有定义」时直接 `return false`,不弹任何 hover;Monaco(hoverActions.ts ShowDefinitionPreviewHoverAction)是先找定义,不论找没找到都 `showContentHover`。HTML 的 `<title>` 没有定义,所以 lite 什么都不弹。HTML 语言服务的文档数据本来就在(直接 run `editor.action.showHover` 就有),不是 provider/Shiki/Monarch 抢占的问题。
- 修:没有定义时只是不设 definition link,照常 `showHover`。
- 单测:`__tests__/lsp/lsp-docs-hover.test.ts`(9 条:HTML 标签/属性悬停与补全文档、CSS MDN 数据悬停与补全、JSON schema description 悬停与补全、真编辑器里 Show Definition Preview Hover 在 html 上弹卡)。撤掉修复后「真编辑器 html」那条变红,已验证。smoke.mjs 五种语言两边 PASS。
- 顺带发现的小缺口(没做):Monaco 的 F1 里还有 "Hide Hover"(editor.action.hideHover),lite 的命令面板没有这一项。

## 选区框 / 装饰框 / RTL 续作(第三轮)
- 选区框:**不是 lite 画法的问题,是脚本量错了标记**。差分脚本量 lite 的 `.cm-selectionBackground`(CSS 钩子,无几何),真正画选区的是 `.cm-selectedText`(selectionlayer.ts,整行高、逐视觉行一块、圆角凹角,已按 Monaco SelectionsOverlay 实现)。harness 改量 `.cm-selectedText`,known.mjs 去掉「选区框有意不同」,变成真断言:50-keys 24/28、60-mouse 12/15 一致,选区 selRects/selHeights 的差异为 0。
- 装饰框根因(用 81-deco-probe 在真页面量):Monaco 的 `className`(非 inline)是 `.cdr` 绝对定位 `<div>`,铺满行盒(高 20);`inlineClassName` 才是字体框 `<span>`(高 16)。两边 inlineClassName 完全一致。lite 把 className 也当 inline mark,所以 16 对 20。

## a11y 线(完成):AX 树差异清单与对齐(2026-11-22,Chromium CDP `Accessibility.getFullAXTree`,headless)

探针:`ax-probe.mjs <状态…>`(状态表在 `ax-states.mjs`:init/readOnly/ariaRequired/accOff/accOn/suggest/find/hover/markers/fold/palette/contextmenu)。基线:95-a11y 6 个场景各 56–60 项差异,约 240 项,全被一条泛化的「有意不同」吞掉。

逐项分类(A=能做成一样→改;B=影响播报行为→记录不硬改;C=结构不同→写理由):

- A textbox 缺 `aria-required`(ariaRequired)、`aria-autocomplete`(readOnly→none,否则 both;suggest 打开→list)、`aria-haspopup`(false/true)、`autocomplete=off`
- A `aria-roledescription` "code editor" → "editor";默认 `aria-label` 沿用 Monaco 的 "Editor content"(语言名挪到 `data-language`,不再混进读屏标签)
- A `accessibilitySupport:'off'` 的 label = "The editor is not accessible at this time. …"(Monaco `ariaLabelForScreenReaderContent`)
- A 外层 role:Monaco `code`,lite `application`(application 会让读屏进入应用模式、吞掉浏览键,比 code 差)→ 改 `code`
- A 补全列表:Monaco `listbox "Suggest"`,option 名 "label, Kind";lite 无名、option 名只有 label
- A 查找框 toggle-replace 缺 `aria-expanded`
- A 装饰层(gutter/rulers/scrollbar/overview)补 `role=presentation aria-hidden=true`
- B live region:Monaco 2×`role=alert`(assertive,交替容器)+2×polite;lite 1×`role=status polite`。lite 另外 400ms 后播「Line N, column M」,Monaco 普通模式不播 → 补 alert/status 两套 API,选区播报默认保留(改了会让用户少听到东西),记为已知行为差异
- C 无 EditContext/隐藏 textarea:lite 的 contenteditable 本身就是 textbox,AX 树里带全文 value 和每行 children;Monaco 在非读屏模式下 textbox 是空的(`accessibilityPageSize` 分页内容只在读屏模式)。结构性差异,不能在 contenteditable 上复刻

## 第三轮 · 块 2/3:两个「推断」根因实测 + 「有意不同」复核(fork,2026-11-22)
差分总量(排除 a11y):有意不同+monaco怪 525 → 287−145(a11y)=约 142 项;smoke 五种语言两边 PASS;167 场景一致 102。

**2(a) 10k 长行差 2px —— 推断是错的,真因是 lite 的两个 bug(已修)**
- 实测:`stopRenderingLineAfter` 取 undefined/-1/20000,Monaco 的 [col 100/5000/10001] 位置都不变,不是截断。
- 真因 1(`src/core/view/fontinfo.ts`):字宽读的是小数的 `getBoundingClientRect().width/256`,Monaco charWidthReader 读整数 `offsetWidth/256`。真字宽 8.4287 vs Monaco 的 8.4296875,每字 0.001px,1 万字 = 约 10px 量级的位置漂移(Monaco 的 FastRenderedViewLine 用 charWidth×列算位置)。改成 offsetWidth(为 0 = 没布局,jsdom,退回矩形宽)。
- 真因 2(`src/api/options.ts`):创建时容器还没布局,fontInfo 烤成 0.6em 估算(isTrusted=false,8.4),挂进文档后尺寸不变 → onGeometry 不再响 → 一直停在估算值。`getOption(fontInfo)`、换行列、行号栏宽都随之偏。现在挂载后每帧(有布局才试,最多 120 帧)重解析直到 trusted。
- 两处修完,lite 的 [100/5000/10001] = Monaco 的 -1px 内。剩 1 项(line-10k-chars 右端 753 vs 751)是 Monaco FastRenderedViewLine 用取整字宽线性外推、lite 读真 Range 的差,已在 known.mjs 如实重写。
- 单测:`__tests__/core/fontinfo-measure.test.ts`(3 条,撤修复变红已验证)。

**2(b) 注入文本之后光标位置 —— 推断部分错,真因是 lite 的 bug(已修)**
- 实测:Monaco 对**空区间**的 `before/after` 注入文本,没有 `showIfCollapsed` 就整条不渲染(textModel.getInjectedTextInInterval 的 `showIfCollapsed || !range.isEmpty()` 过滤);有 `showIfCollapsed` 或非空区间才渲染。lite 总是渲染 → 之前以为是「Monaco 没有注入文本节点」。
- 修:`src/api/decorations.ts` 同样过滤。单测:`__tests__/core/h2-decorations.test.ts` 新增一条。
- 场景:80-decorations 新增 injected-text-collapsed-shown、injected-text-range(同时把注入文本的内联 class 改成不带 ::after 的 `.d-inj`,旧场景的 `.d-after` 自带 `>>` 伪元素宽度把位置带偏),三个场景现在 diffs=0,已移出 known 的 monaco怪/bug 规则。

**块 3:「有意不同」复核**
- 对齐了:
  - emoji/组合符/数学字母行的 content.width 差 15–65px:`linewidthmap.ts` 的估算把 UTF-16 长度当半角列,非 ASCII 行估高后 maxLineWidth 只增不减;改为非 ASCII 行不进估算,等 DOM 实测。emoji/combining/math 场景现在一致(±1)。单测改了 linewidthmap.test.ts 一条(原来钉死的是「CJK 按字符数估」)。
  - 右角 overlay widget 的右偏移:Monaco 是 2×竖条宽 + minimap 宽(实测 712 = 800−28−60),lite 是 1×竖条。改 `src/api/widgets.ts`(底角同,2×横条高),h2-widgets 两条单测更新到 Monaco 的值。
- 重新写了成因(原理由不对):content widget 的 rects 差 —— 不是「含滚动条」,是 Monaco 的 content widget 不继承编辑器字体(页面 16px 系统字体,line-height normal → 框 15.17×18),lite 的继承 Menlo 14/20。没改(会动 lite 自己补全/hover 挂件的继承字体),理由写进 known.mjs。
- 仍然没对齐(诚实记录):
  - 不折行 scroll/content.width 约 60 项,其中 90-layout 的 minimap/行号等变体 lite=1126 对 Monaco 的 620:lite 这批场景里最长行(`'x'.repeat(i*3)`,最长 117 列)被估算+全文量宽,Monaco 只量已渲染行(视口外长行不计)。是 Monaco「滚动才增长」的行为,lite 一次到位。属有意,没改,因为一次到位对用户更好(滚动条不跳)。
  - tabSize-8 content.width 317 vs 241、fontSize-8/30 等:同一机制,未逐个拆。**未验证**是否全由「视口外行是否计入」解释。
  - RTL 整行 dir=rtl、ZWJ 簇内插值、IME 组字期间 value、before/after 光标前后、整行装饰框宽 732 vs 718:均未动(RTL 本就归别的线;其余是结构差异)。
- 未验证:真机 IME、读屏、Safari/Firefox(headless Chromium 测不了)。顺带缺口(没做):Monaco F1 的 "Hide Hover"。

### 做了什么(a11y 线收尾)
- 改的源码:`src/core/feature/a11y.ts`(重写播报层:2×`role=alert` + 2×`aria-live=polite` 双容器,同 Monaco `aria.ts`,新增导出 `alert()`/`status()`,`announce()` 保留并等于 `status()`;`syncEditorAria()` 每个事务同步 aria-required/aria-autocomplete/aria-haspopup/aria-label;`setActiveDescendant()`;`screenReaderLabel()` 实现 accessibilitySupport:'off' 的「编辑器此时不可访问」)、`editorview.ts` 默认属性、`suggestwidget.ts`(listbox 名 Suggest、option 名 "label, Kind"、activedescendant 走 setActiveDescendant)、`search.ts`(aria-expanded、每次计数变化 alert「行内容, N of M found for 'q', at 行:列」)、`readonlymessage.ts`(朗读走 alert,浮层去掉自己的 role=alert)、`markernav.ts`(去 dialog、toolbar、按钮名带快捷键)、`overlay.ts`(命令面板输入框/列表名 "Type to narrow down results.")、`litemonaco.ts`(不再把语言名塞进 aria-label;选中词跳转播报走 alert)。
- 对外行为变化(Filo 不依赖,已 grep 确认):默认 aria-label "Code editor (lang)" → Monaco 的 "Editor content";外层 role application → code 且不带 aria-label;roledescription "code editor" → "editor"。
- 测试:`__tests__/core/a11y-parity.test.ts`(17 条,jsdom 的 ARIA 属性/容器结构/去重换容器/20000 字截断/只读提示/Tab 焦点模式/查找框);`k2b-a11y-placeholder.test.ts` 两处断言改成 Monaco 的值。
- 差分:`scenarios/95-a11y.mjs` 从 6 个信息级场景扩成 16 个(新增 ariaRequired、suggest、find、find-replace、markers、fold、palette、contextmenu、readonly-typing-alert、tabFocusMode-alert),新 step `ax`(`ax-states.mjs` 的 `axSummary`:AX 树里外层 role、编辑框名字/roledescription/autocomplete/haspopup、浮层 role+name、live region 个数)。`known.mjs` 去掉泛化的 a11y 规则,换成 8 条逐条写了理由的。
- 数字:原 6 个场景差异 56–60/个 → 17–20/个(合计 107,全部分类、0 未分类);新场景 suggest、find、markers、fold、readonly-typing-alert 与 Monaco 的 AX 树 0 差异。tsc 0 错误,全量 vitest 341 文件 6126 条全过。
- 剩下的差异(都是有理由的):焦点元素 class / contenteditable(结构);装饰层 role=presentation 计数(AX 树里读屏看不到);选区播报「Line N, column M」(行为差异,保留);命令面板虚拟列表 vs 全量、textbox vs combobox;右键菜单分隔线 role。
- 没做:读屏优化模式的分页文本(`accessibilityPageSize`、per-line 内容、selectionchange)——lite 的 contenteditable 本身就带全文,不是能补的缺口;`screenReaderAnnounceInlineSuggestion`(lite 没有行内补全的播报入口,选项只是占位);diff 编辑器状态没进浏览器差分(vitest 的 diff-a11y.test.ts 仍过)。
- **没验证**:真读屏软件(VoiceOver/NVDA/JAWS)的实际播报。这里只在 headless Chromium 里比 AX 树和 DOM,看不到读屏怎么念、念几遍、assertive 是否打断。

## 选区框 / 装饰框 / RTL 收尾(第三轮 · 修复)

### 1. 选区框(38 项 → 0)
- 根因在测量:harness 量的是 `.cm-selectionBackground`(只是类钩子,没有几何),真正的选区块是 `.cm-selectedText`。改了测量并删掉「选区框 有意不同」规则后,50-keys / 60-mouse 的选区项全部一致。
- 新增 `scenarios/61-selection.mjs`(20 个场景):单行、多行、短尾行、空行、全选、折行内/跨行/全选、CJK、emoji、RTL、RTL 多行、tab、多光标、相邻行多光标、列选、view zone、1 万行全选/中段选。19 个与 Monaco 逐项一致,剩 `big-select-all-10k` 8 项 = lite 视口多渲染的 overscan 行(前 20 行一致),`known.mjs` 记为有意不同。
- 顺带修了两个真差异(src/core/feature/selectionlayer.ts):
  - 换行符的半角字宽先加再取整(原先取整后再加,行尾比下一行左缘多 0.43px,被判成凹角,空行选区多画了 `cm-selInner`);
  - RTL / 混排行里选区两端 caret 不是边界:含 RTL 的段取 DOM Range 字形矩形的包络。
- 性能(`scenarios/84-sel-perf.mjs`,同步 setSelection + 强制布局,headless Chromium):lite 1 万行全选 4–5ms(Monaco 2ms),5 万行全选 2–4ms(Monaco 12ms);收缩/扩选/滚动后再选 1–4ms,不随行数增长。`__tests__/core/scale-invariance.test.ts` 11/11 绿。

### 2. 装饰框 top/height(12 项 → 0)
- Monaco:`className`(非 inline)是满行高的块(`.cdr`,h=20、top=0),`inlineClassName` 才是字体框 span(h=16、top=2)。lite 以前两者都是一个 mark。
- 改法:`className` 的 mark 加 `cm-decoBox`,竖向 padding = (行高−字高)/2(`--lm-deco-pad`,EditorView 量到度量后写在 scrollDOM 上;padding 不影响行布局);`inlineClassName` 单独一层 mark。删掉「装饰框 top/height」规则。
- 副作用:className 与 inlineClassName 不再落在同一个元素上(h2-decorations 的断言改成分层断言)。

### 3. RTL(`40-cjk-emoji/rtl` pos 差异 → 0)
- Monaco 把含 RTL 字符的 token 写成 `<span dir=rtl style=unicode-bidi:isolate>`。lite 的行子节点(shiki mark / 整段文本)同样处理;选区/装饰把一个 token 劈成几段时,连续含 RTL 的子节点并进同一个隔离 span(否则选中一段希伯来文,整行显示顺序会变)。`containsRTL` 抄 Monaco strings.containsRTL 的 BMP 范围。
- ←/→ 原来是「LTR 壳视觉移动」(moveVisually),隔离后与屏上顺序对不上。Monaco 的 ←/→ 恒为逻辑列 ±1(新场景 `rtl-cursor-keys` 逐键比对一致),改成逻辑列 ±1。
- 改了的自己的测试断言:`__tests__/core/commands.test.ts`「cursorCharRight 在希伯来段走视觉,不是逻辑 +1」→ 改为逻辑 +1/−1(原先声明的有意行为,与 Monaco 相反)。`bidi.test.ts`(computeOrder / moveVisually 纯函数)不变。
- 新增 `__tests__/core/rtl-isolate.test.ts`(containsRTL、含 RTL 行的隔离包裹、装饰劈开后仍在一个隔离 span)。
- **没验证**:真机 IME 在 RTL 行里组字;macOS/Windows 的辅助技术;Safari / Firefox 对 `unicode-bidi:isolate` + contenteditable 的光标行为(只在 headless Chromium 验证)。

## 第四轮·块A:不折行 content/scroll.width 拆解 + 整行装饰框宽(fork,2026-11-22)

结论:**宽度这条线 3 个真问题修了 2 个(tab、比例字体留白),剩下的差异全部拆成一个机制并用场景证明;整行装饰框宽(732 对 718)找到根因,没修(改动面太大,见下)。**

### 1. scroll/content.width(不折行,约 60 项)——没有一个是「猜的」,逐个拆开后分三类
测法:`probe-width.mjs`(同一页面里两边各自按 scrollTop 0 → 400 → 末尾 → 回 0 取 getScrollWidth/getContentWidth)+ 新场景组 `91-width`(每个配置取 start、整篇滚一遍后取 walked 两个快照)。

- **A. 真 bug(已修):tabSize 变大后宽度不对**(30-whitespace/tabSize-8:Monaco 317、lite 241)。
  - 根因:CSS `--lm-tab-size` 是 `litemonaco()` 在 `new EditorView` **之后**才写的,首屏 `\t` 行按默认 4 列量宽,量完缓存起来再也不重量;运行时改 tabSize 同样没人作废行宽缓存(`\t\tindented\t` 在 tabSize 8 是 32 列,lite 按 20 列量)。
  - 修:`EditorView` 自己管 `--lm-tab-size`(建好之前、每次事务后),tabSize 一变 → 行宽表 flush + 重估 + 重折行 + 重测行高(`applyTabSize`/`onTabSizeChanged`);等于 CSS 默认的 4 不写内联样式。
  - 单测 `__tests__/core/tabsize-width.test.ts`(4 条,撤掉修复 2 条变红)。场景 30-whitespace/tabSize-8、tabSize-2 现在 0 差异。
- **B. 真 bug(已修):比例字体下留白宽和没渲染行的估算**(30-whitespace/fontFamily-serif)。
  - lite 对没渲染的行按「字数 × 字宽」给宽度下界,只增不减。比例字体里最长的行不一定最宽 → 下界永远多一截(Georgia:content.width 184 对 Monaco 163)。修:`LineWidthOracle.canEstimate`,`fontInfo.isMonospace` 为假时不估,同 Monaco 等渲染后实测(`linewidth-estimate.test.ts`,4 条)。
  - 末列留白 4 列:Monaco 用 `fontInfo.typicalHalfwidthCharacterWidth`,lite 用探针文本量出的 `oracle.charWidth`,比例字体下两者不同(Georgia 8.27 对 6.3,差 8px)。修:比例字体用 fontInfo 的值,等宽仍用量出来的(两者相等,jsdom 里的既有断言不动)。
  - 最后一个坑(重跑 91-width 才暴露):留白值在构造时写一次,选项(字体)晚到时就是过期的(walked 942 对 934,差 4 × (8.27−6.29) = 8px)。修:字体变化时、每次 `measureGeometry` 都按当前 fontInfo 重算(不动缓存);单测在 `geometry-fix2.test.ts` 末尾,撤掉修复变红。
- **C. 机制差异(没改,有实测):Monaco 只计「渲染过的行」,lite 对等宽 ASCII 行按字数 × 字宽给全文下界。**
  - 实测 `probe-width.mjs`:40 行递增文档,scrollTop=0 时 Monaco 620/lite 1126,滚到第 21–40 行后 Monaco 也变 1126;3000 行、最宽行在 2900,Monaco 全程 72→89(只涨到滚过的行),lite 一开始就是 4313。
  - 证明差异只来自「哪些行渲染过」:`91-width` 13 个配置(默认、fontSize 8/30、minimap、lineNumbers 关、glyphMargin、folding 关、tabSize 8、padding、2 千行、500 字符长行、scrollbar 尺寸、serif),**整篇滚一遍(每步停 300ms,因为 Monaco 对超过 300 字符的行和比例字体的行走 200ms 的异步量宽)之后 walked 快照 scroll.width/content.width 两边逐项一致**,没有任何 known 规则兜它;start 快照的差异才归「有意不同」。
  - 90-layout 里 minimap/lineNumbers/glyphMargin/folding/fontSize/lineDecorationsWidth… 的 scroll.width 差,拆开后 = content.width 差(同上)+ 布局差 0。50-keys/60-mouse/70-structure 的 end.content.width 差(106/115、179/208)同源:lite 渲染比可见多一圈(overscan)的行并量它们,Monaco 只量可见行;折叠后 lite 的估算仍含被折叠的行。goto-line-f1 的 81 对 73 是 Monaco 的横向 reveal(`_ensureMaxLineWidth(maxHorizontalOffset)`)把宽度顶高了一列,lite 的 reveal 路径不同,未拆到底。
  - 为什么不改成 Monaco 语义(评估):(1) lite 的模块头注释就把「横向滚动条 thumb 恒定、不随竖向滚动漂」定为定律,Filo 里在用,改了竖向滚动时 thumb 会跳,是用户可见的退化;Monaco 自己的注释也说这条「not so important」。(2) 只「不估」还不够:lite 渲染 overscan 行,要真对齐得只统计可见区间的行、并在每次滚动时补量,等于重写量宽触发点。(3) 收益只是 getScrollWidth/getContentWidth 在「没滚过的大文档」上的数值,宿主拿它定宽的场景(小文档,全渲染)现在已一致。没做,需要用户拍板;若要做,切入点是 `LineWidthMap.seedEstimate` + `measureLineWidths` 的触发条件。

### 2. 整行装饰框宽 732 对 718(80-decorations/whole-line)——根因找到,没修
- 实测(`probe-whole.mjs`、`probe-dom.mjs`、截图 `/tmp/whole-{monaco,lite}.png`):Monaco 的整行装饰是 `div.cdr.d-whole`,绝对定位,宽 = lines-content = scrollWidth(含竖条 14px),竖条是盖在上面的 invisible 浮层 → 底色画到编辑器右缘。lite 的竖条是 `.cm-scroller`(718)**旁边**的一列(flex 兄弟,786–800),整行类挂在 `.cm-line` 上,scroller 在 718 处裁掉 → 右边 14px 没有底色。**这是肉眼可见的差异**(暗色主题下整行高亮短 14px,currentLine 高亮同理),不只是数字。
- 没修的原因:要么把竖条改成浮层,同时把 `scrollDOM.clientWidth` 的约 15 处用法(折行宽、横向滚动范围、滚轮、鼠标拖选自动滚、reveal、gotoline/search/selection 层的宽)全改成「扣竖条」;要么把整行装饰改成独立的全宽层(丢掉 `.cm-line` 上的类,宿主 CSS 选择器会变)。两条都动水平几何的主干,不是一个能安全塞进这一轮的改动。known.mjs 里的说明已换成这份实测根因。

### 改动文件
src/core/view/editorview.ts(`applyTabSize`/`onTabSizeChanged`/`extraHorizontalSpace`/`canEstimate` 接线)、src/core/view/linewidthmap.ts(`canEstimate`)、__tests__/core/{tabsize-width,linewidth-estimate}.test.ts(新)、scripts/browser-diff/{scenarios/91-width.mjs(新),probe-width.mjs/probe-goto.mjs/probe-serif*.mjs/probe-whole.mjs/probe-dom.mjs/probe-shot.mjs/probe-tab.mjs(新,探针),known.mjs,PROGRESS.md}。

### 验证
- 单测:tabsize-width / linewidth-estimate / linewidthmap / geometry-fix / geometry-fix2(新增 1 条,撤掉修复变红)/ v-options / wraprows 全过。
- 全量 vitest(最后一次):6143 过、10 败(6 个文件)。都是「编辑成本不随行数增长」或别的 fork 正在改的区域,我的改动(行宽表、tabSize、留白)在编辑路径上都是 O(1),没有碰全文:
  scale-invariance(4)、brackets-multichar(1)——2 万行文档打字,隔离重跑仍超时(120s),此时工作树里 heightmap.ts / materialize.ts / specialchar.ts 有别的 fork 的大改(+109 / +97 / ...),**我没有用「撤掉我的改动再跑」去证伪**(共享树不能 stash/checkout),所以归属只是推断,不是实测;
  scanwindow(1)、r3c-fix(2)、tsfold-fix2(1)、minimap-matchbands-fix(1,耗时断言,隔离单独跑过)。
- `tsc --noEmit`:只剩 `parity-viewline-editor.test.ts` / `scanwindow.test.ts` 里 `findSpecialChars` / `unicodeHighlightRanges` 找不到名字(别的 fork 在改 specialchar 的导出),src 里没有我的类型错。
- 浏览器:30-whitespace、10-wrap、91-width 重跑(含最后一个修复)无未分类项,91-width 的 walked 快照 scroll.width / content.width 两边一致(serif 的 layout.* 是已知 monaco 怪)。90-layout 上一轮重跑也无未分类项,最后一个修复之后没有再跑。
- 没验证:Firefox/Safari 下的量宽;`goto-line-f1` 那 8px;lite 只统计可见行的「Monaco 精确模式」没做;上面 10 个失败测试里有没有一个是我造成的(见上)。

## 第四轮·块C:diff 编辑器进浏览器对照 + F1 命令面板对照 + a11y(fork,2026-11-22)

### 已修(src,有 vitest 或场景断言)
- **diff 两侧编辑器吃不到选项**:`sideExtension` 曾额外塞 facet,`api.updateOptions` 见 facet 前后没变就提前返回,视图层(fontInfo/字形边距/折行)不更新。现在只放 `readOnly`,其余走 `updateOptions(sideRaw(i))`。`applyViewOptions` 里 `cm-glyphMargin-off` 以前只加不减,改成 toggle。单测 `__tests__/core/browserdiff-r4c.test.ts`(撤掉 toggle,对应用例变红,已验证)。
- **diff 行内模式**:原文侧只留行号列的两栏布局 + 对齐占位区;主题跟随(`refreshColors`);wordWrap 继承。
- **折行后对不齐**:`EditorView.measureGeometry` 在 `oracle.lineLength` 变了也重排 heightMap;diff `align()` 并排/行内按折行实测行高算占位(`rowsH`/`realignIfWrapChanged`)。几何靠真浏览器,见 96-diff 的 wordwrap 场景。
- **懒加载高亮器首次加载一直是暗色**:`src/api/lazyhighlighter.ts` 用共享 in-flight promise,加载完成后 `ensureLazy` 返回 true 触发重装。
- **F1 命令面板**:新增 Hide Hover(`editor.action.hideHover`)、Add Selection / Move Last Selection to Previous Find Match、Add Cursors to Bottom/Top、Focus Next/Previous Cursor、Delete Word、Move Selected Text Left/Right、Increase/Decrease/Reset Editor Font Size、Show Editor Context Menu;标签大小写改成 Monaco 0.55.1 的(Find with Selection / Reverse lines / …to Next Find Match / Insert Final New Line)。13 个用例与真 Monaco 逐条一致,固化在 `browserdiff-r4c.test.ts`;`r3c-fix.test.ts` 旧标签已更新。
- 没做:Set Selection Anchor / Copy with Syntax Highlighting / Paste As / Find with Arguments;依赖语言服务的动作、开发者与主题类动作(Monaco 有、lite 不适用)。

### 场景
- `scenarios/96-diff.mjs` 41 个(并排/行内、ignoreTrimWhitespace、renderSideBySide 切换、折叠未改区、上/下一处、行装饰类、只读侧、滚动同步、窄宽度自动行内、wordwrap 等);`95-a11y` 新增 `pageSize-default|10`。

### 分类结果(known.mjs 已写;96-diff 41 场景一致 19、其余 22 个全部已分类;95-a11y 18 场景无未分类)
- 有意不同:装饰 DOM 节点个数(Monaco 每 range / 每视觉行一个 div,lite 每可见行一个);hidden-lines 文字是错位对比;lineNumbers-off 的 gutter 标记;moved-code(移动块 Monaco 另画,高度差 4px 未拆)。
- monaco怪:`automaticLayout:false` 时无参 `diff.layout()` Monaco 沿用旧高度,lite 重测。
- **bug(未修)**:① 行内模式已删除行不折行(620 对 540,`DeletedLinesWidget` 高度固定);② 行内 + 折叠未改区总高 1156 对 1100(56px,没拆);③ 折叠条位置/图标列(left=72 且显示行号);④ sash-drag 483 对 448(怀疑 harness 选择器或 lite 夹取,未验证)。
- 没写的场景:单字符替换 getLineChanges、gutter 还原/暂存箭头 hover、overview ruler 与 diff 计数。

### a11y
- `accessibilityPageSize`:实测 Monaco 读屏元素文本约 58 行(默认)/ 11 行(pageSize 10),随光标走;lite 读真 DOM(contenteditable),没有独立读屏窗口,选项可设无分页。**没有对齐**,归「有意不同」(known.mjs 有理由;只有 API setPosition 不 reveal 时才和 Monaco 不同)。对齐要另造一份读屏文本,违背 lite「DOM 即内容」。
- `95-a11y/tabFocusMode-alert`:AX 摘要两边 0 差异、播报一致;剩下 5 条与其他 a11y 场景同源(EditContext vs contenteditable、role 计数),归「有意不同」。

### 验证
- `tsc --noEmit` 干净;`browserdiff-r4c.test.ts` 26 条、`r3c-fix` 52 条过;全量 vitest 6179 条里 2 条偶发红(`lsp-docs-hover` html 真编辑器、`tslang-fix` 灯泡:负载下等待超时,单独跑 76 条全过)。
- 没验证:折行对齐 / 行内两栏 / 主题跟随的几何只靠 96-diff 场景,无 jsdom 单测;懒加载高亮器首次加载无 mock shiki 的单测;`browserdiff-r4c` 里只有 glyphMargin toggle 一条做过「撤掉修复变红」,其余未逐条回退验证。
- 未触碰协调者刚改的 `src/api/options.ts` rAF 轮询。

## 第四轮·块D:Firefox / WebKit / hi-DPI / 系统剪贴板 / 触摸(fork,2026-11-22)

结论:**换引擎、换像素比、真剪贴板、触摸模拟这四条线各自跑通了对照;找到并修了 3 个真问题(⌘V 在没有剪贴板权限时粘不进去、WebKit 双向文本边界的光标/选区框跑到行首、字体族没追加默认栈导致 Firefox 阿拉伯文宽度差 14px)。没有验证的是真机:真输入法、读屏、真 Safari、真触摸手柄/长按、系统「粘贴」确认气泡。** 下面「没验证」一节写明。

### 环境与开关(README 有用法)
- 引擎:playwright-core 1.61,Chromium = 系统 Chrome,Firefox 151、WebKit 26.5(**Playwright 的 WebKit,不是真 Safari**)直接从 cdn.playwright.dev 下进 `~/Library/Caches/ms-playwright`(`node node_modules/playwright-core/cli.js install firefox webkit`)。`ENGINE=firefox|webkit`、`DPR=2|1.5`、`TOUCH=mobile|touch`、`NOPERM=1`;结果带 `@标签` 后缀,不覆盖 `REPORT.md`。只有 Chromium 有 CDP,所以 `ime*` 步骤和 `95-a11y` 在别的引擎上跳过。
- 新文件:`clipboard.mjs`(16 例真 ⌘C/⌘X/⌘V)、`touch.mjs`(13 例)、`scenarios/97-engines.mjs`(9 个:补全弹层×3、撤销粒度、beforeinput 提交、删词、emoji/组合符、Tab 焦点、RTL 选区框边界)。

### 矩阵结果(整套场景,同一批 known.mjs 分类)
| 环境 | 场景 | 全一致 | 未分类 |
|---|---|---|---|
| Chromium DPR1(基线) | 353 | 201 | diff/IME 等别的 fork 的区域 |
| Chromium DPR2 | 354 | 208 | 同上 |
| Chromium DPR1.5 | 356 | 208 | 同上 |
| Firefox 151 | 338 | 232 | 0(修完分类后) |
| WebKit 26.5 | 338 | 227 | 0(修完分类后) |

- **hi-DPI(DPR 2 / 1.5)**:相对 DPR1 **没有新增的行为差异**——1px 边框、选区、光标、fontInfo(`offsetWidth/256` 量字宽)、滚动条、minimap 都在场景快照里,逐项与 Monaco 一致;DPR2 相对 DPR1 只多 7 条路径,全是已分类的耗时数字(perf-*)和 wheel 后视口外的 cursorRect。DPR1.5 整套里 `96-diff/auto-inline-narrow|breakpoint-1200|resize` 出现 Monaco 并排/lite 行内的差异,**单独重跑两次都只剩已分类的 2 条**,是整套顺序/负载造成的,不是 DPR 造成的。
- **Firefox**:最初 184 场景 120 一致。能修的修了(见下),剩余全部归类:折行 scroll.width 差 2px(断行规则,同 content.width 的分类)、混排行相邻字形 x 互换(bug,未拆)、天城文 Shift+→ 选区宽 82 对 68(bug,未拆)、`type-over-selection-multi`(Firefox/WebKit 下 Monaco 自己没吃到那次键入,lite 正确)。
- **WebKit**:最初 245 场景 143 一致,85-rtl 151 条、96-diff 235 条未分类。光标修复后 85-rtl 降到 5 条(同 Firefox 的几条 + 行尾 `getOffsetForColumn` Monaco 返 -1)。WebKit 独有:`letterSpacing≠0` 时原生 `\t` 不含 letter-spacing(每个 tab 多 2px 逐列累加,分类为有意不同,没修)。

### 已修(src,有测试)
1. **⌘V 在没有 clipboard 权限时什么都粘不进去**(真问题)。lite 在 keydown 里吃掉 ⌘V 再 `navigator.clipboard.readText()`,没有 clipboard-read 权限(普通网页的 Chromium、Playwright 的 WebKit)被拒。Monaco 走原生 `paste` 事件,不需要权限。修:`src/core/edit/keymap.ts` 去掉 `Mod-v` 与 Win/Linux `Shift-Insert`,让浏览器触发原生 paste,由 `clipboard.ts` 的 `handlePaste` 处理(只读时 `handlePaste` 现在会提示 read-only)。`NOPERM=1` Chromium、WebKit、Firefox 上 `clipboard.mjs` 往返 8/8 一致。单测 `__tests__/core/clipboard-native-paste.test.ts`(6 条);jsdom 里按键测试靠 `f5-replay.ts` 的 `pressRaw` 补上「没被 preventDefault 就派发 paste 事件」的浏览器默认行为(15 个旧用例据此保持)。
2. **WebKit:双向文本里选区 span 劈开文本节点,边界处 collapsed range 没有 rect**(Chromium/Firefox 有)。`caretCoords` 掉到「行盒左缘」,RTL 行里选区框和光标跳到行首(`61-selection/rtl` 左 68 对 152)。修:`editorview.ts` 里 `adjacentGlyphCaret`——取相邻字符的字形矩形,按字符方向(强 RTL/LTR,中性跟容器)取前缘/后缘。场景 `97-engines/rtl-selection-mark-boundary` 三引擎一致。**没有 jsdom 单测**(jsdom 无布局),只有这个浏览器场景。
3. **字体族没追加平台默认栈**(Monaco `getMassagedFontFamily`:`用户族, Menlo, Monaco, 'Courier New', monospace`)。`getMassagedFontFamily` 类方法早就有,但应用到 DOM 和量字宽的地方都用了原始族。Firefox 里 `Menlo, monospace` 没有 Arabic 字形,系统回退字体按比例排(5 个字 27px),Monaco 因栈里有 Courier New 走等宽回退(42px),整行宽差 14px,选区/光标位置全偏。修:`fontclasses.ts` 导出 `massagedFontFamily`,`applyFontStyle`、`applyFontStyles` 用它。单测 `__tests__/core/font-massaged.test.ts`(3 条)。Chromium 上无变化(整套重跑无新增差异)。

### 系统剪贴板(`clipboard.mjs`,Chromium + grantPermissions)
16 例里 15 例与 Monaco 一致(复制/剪切/空选区整行、多光标复制与粘回、多光标行数不匹配、CRLF、粘贴保留缩进、选区上粘贴、纯 html 剪贴板不粘、html+plain 取 plain、copyWithSyntaxHighlighting 关、只读下剪切/粘贴、API 触发、右键菜单三项)。剩 1 例 `emptySelectionClipboard:false`:Monaco 复制空选区会把剪贴板**清空**(text ''、types []),lite 不动剪贴板——当作 Monaco 怪癖,不对齐。

### 触摸(`touch.mjs`,Chromium `hasTouch`+`isMobile`)
一致:点按落光标、点行尾、横向滑动、点按后 insertText、点行号栏、已有选区保持、视口宽度。不同:双击/三击——Monaco 有自己的 tapCount 手势选词/选行,lite 把触摸交给原生 contenteditable,headless 模拟里没有原生选词,所以光标不变;竖滑距离 Monaco 自己的手势与原生滚动不同(lite 恰为 400);焦点元素 Monaco 是 EditContext 宿主、lite 是 contenteditable(`autocapitalize/autocorrect/autocomplete/spellcheck` 属性一致)。

### 没验证(原因)
- **真机输入法**(CDP `imeSetComposition` 只是模拟;Firefox/WebKit 没有 CDP,`ime*` 在那两个引擎上根本没跑)。
- **读屏**(VoiceOver/NVDA/JAWS):只有 Chromium AX 树快照(第三轮),Firefox/WebKit 的无障碍树没看。
- **真 Safari / 真 Firefox 桌面版**:跑的是 Playwright 自带的 WebKit/Firefox 构建,和用户的发行版有差距;系统「粘贴」确认气泡(Safari/Firefox 对 `readText`)没模拟。
- **真触摸**:系统选区手柄、长按菜单、软键盘弹出/收起(headless 没有)、捏合缩放;只验证了事件和属性。
- **hi-DPI 的真屏幕**:DPR2/1.5 是 Chromium 的设备像素比模拟,不是真 Retina/混合缩放屏;没有逐像素截图比对,只比了几何快照。
- **未修的已知差异**:WebKit `letterSpacing` 下 tab 宽;Firefox/WebKit 混排行相邻字形 x 互换、天城文选区宽(分类为 bug);`type-over-selection-multi` 的 Monaco 吞键原因没拆;整套里 `97-engines/suggest-open-filter-accept` 在 96-diff 之后第一个跑时 Monaco 的 ArrowDown 不动补全选中项(单独跑三引擎一致,加长等待无效,known.mjs 里按「monaco怪」写明未拆到底)。
- 顺手修的 harness 泄漏:`95-a11y/tabFocusMode-alert` 切了全局 tabFocusMode 不切回,导致后面所有场景 Tab 不再插缩进(取完快照后切回)。

### 改动文件
src/core/edit/keymap.ts、src/core/input/clipboard.ts、src/core/view/editorview.ts(`caretCoords` 回退 + `adjacentGlyphCaret`、import)、src/core/view/fontinfo.ts、src/core/options/fontclasses.ts;__tests__/core/{clipboard-native-paste,font-massaged}.test.ts(新)、f5-replay.ts、editcmds-fix2.test.ts;scripts/browser-diff/{lib.mjs,run.mjs,clipboard.mjs(新),touch.mjs(新),scenarios/97-engines.mjs(新),scenarios/95-a11y.mjs,known.mjs,README.md,PROGRESS.md}。

### 验证
- 针对性 vitest(clipboard-fix、input-clipboard、contextmenu、k3-multicursor、h1-events、editcmds-fix2、tsformaton、clipboard-native-paste、font-massaged、monaco-types-behavior、editor-static-api)全过。
- 全量 vitest 一次:6153 条 11 败(7 个文件),隔离重跑 5 个文件转绿;剩 `scale-invariance`(3,2 万行打字/Enter/Backspace)和 `brackets-multichar`(1)是 60–120s 超时,当时机器负载 50–140(别的 fork 在跑);负载降到 ~10 后单独重跑这两个文件 63 条**全过**,所以是负载超时,不是回归。
- `tsc --noEmit`:只剩 `parity-viewline-editor.test.ts` / `scanwindow.test.ts` 里 `findSpecialChars` / `unicodeHighlightRanges` 找不到名字(别的 fork 在改 specialchar 导出),不是我的改动。
