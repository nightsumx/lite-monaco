# QA Book — lite-monaco 单测目录

**拓展规则：** 新测试只允许 (1) 关掉本表某行已写的「缺口」，或 (2) 新增一条用户能复述的行为 / 代数律。禁止再给已有律加证人，禁止把 `commands.test.ts` 抄成 1000 行 `it`。

一行 = 一份测试文件。扩行为：复制一行，改 `ID`，在「钉的行为」写用户可观察的契约，不要写实现步骤。

| 列 | 含义 |
|---|---|
| ID | 稳定编号，拓展时只追加、不改号 |
| 层 | 产品 / 模型 / 视图 / 输入 / 命令 / 特性 / 语言 / 壳 |
| 种 | 代数（纯函数）/ 投影（state→DOM·几何）/ 沼泽（DOM→state）/ LS（LanguageService）/ 入口 |
| 完备 | 对该行「钉的行为」的封口程度，见下表。**不是**功能清单完成度，更不是对标 Monaco 的百分比 |
| 缺口 | 故意没钉或还空的格；拓展时先填这里 |
| 文件 | `__tests__/` 相对路径 |
| 钉的行为 | 过了保证什么；挂了用户会碰到什么 |

### 完备四级

| 级 | 含义 | 何时升级 |
|---|---|---|
| **骨** | 只有入口或 1–2 个代表格 | 主路径每种失败都有一条 |
| **主** | 开心路径齐，边角 / 失败 / 真布局 / IME 薄 | 空、首尾、大文档、折叠旁都有格 |
| **齐** | 主路径 + 已知边角都有格；仍有声明的留白 | 留白清零，或写成代数律 |
| **律** | 双射 / 幺半群 / 有界扫描等几乎封死 | — |

层汇总（2026-08-16，目测不是计数）：

| 层 | 完备 | 一句话 |
|---|---|---|
| 模型 | 齐～律 | 文档代数最满；fixture 套数少 |
| 命令 | 齐 | 终态密；视觉几何 / IME 键不在这层 |
| 输入 | 齐 | 剪枝矩阵已填；真 IME、行装饰输入 ⛔ |
| 视图 | 主～齐 | jsdom 无真布局；几何定律有钉 |
| 特性 | 主～齐 | 查找/折叠几何齐；hover/补全少真鼠标 |
| 语言 | 主 | 有真 LS 代表格；冷启动 / worker / 诊断会话未钉 |
| 产品 | 主 | 一行接入有环 |
| 壳 | 主 | 滚动条/minimap 几何齐；Diff 无 inline/moved |

种不要混：代数绿 ≠ 手感绿。查找/折叠几何在 **T-090 / T-077**。

---

| ID | 层 | 种 | 完备 | 缺口 | 文件 | 钉的行为 |
|---|---|---|---|---|---|---|
| T-001 | 产品 | 入口 | 主 | 未走 IME（环境洞） | `core/lite-monaco.test.ts` | `liteMonaco()` 挂上；编辑环；theme / colors；关右键/折叠槽/粘性条/minimap/横条/行号/竖条/a11y/补全/缩进线/当前行/hover/同词/括号匹配/自动配对/输入缩进/多光标/codeActions/tsDiagnostics/history/tabIndent；`signatureHelp:false`；python `#` / html `<!--` / css `/*` / sql `--` / xml `<!--` / yaml `#` / lua `--` / shell `#` / toml `#` / vim `"` / lisp `;` / 未知语言 `//`；种子诊断；extensions + dispatch；默认 sticky / 行号 / 横条 / 竖条；关竖条仍挂独立概览条；JS 也挂灯泡；destroy 卸根 |
| T-002 | — | — | 砍 | 号作废，勿复用 | — | 曾是 monaco-shim，已删 |
| T-003 | 产品 | 投影 | 齐 | — | `core/themecss.test.ts` | 光标层撑满不裁；选区背景规则存在；诊断波浪线三档 SVG 与 ruler 同色；含 peek / find / 换行 / QuickInfo 色 |
| T-004 | 产品 | 代数 | 齐 | 只钉「命令在表里」，不钉时延数字 | `core/perf-ops.test.ts` | 操作时延表覆盖 defaultKeymap 去重后的每个命令 |
| T-010 | 模型 | 代数 | 律 | 超大 rope 时延数字不在此 | `core/rope.test.ts` | 持久化文本：行号↔偏移、插入替换、切片；五千行改中间一行首尾不变 |
| T-011 | 模型 | 代数 | 律 | — | `core/change.test.ts` | ChangeSet apply / compose / mapPos / invert；JSON 往返 |
| T-012 | 模型 | 代数 | 律 | — | `core/selection.test.ts` | 多 range 排序合并；anchor/head；变更后映射；千级乱序 cursor 排序+插入映射 |
| T-013 | 模型 | 代数 | 律 | — | `core/state.test.ts` | EditorState 纯更新；Facet / StateField 经事务；空槽回默认；同事务后者胜；卸 field |
| T-014 | 模型 | 代数 | 律 | — | `core/rangeset.test.ts` | 区间树枚举、重叠分层、随文档 map |
| T-015 | 模型 | 代数 | 齐 | — | `core/decoration.test.ts` | mark / replace / widget / 行装饰的构造与 eq；估高 40 的 block widget 撑高 heightMap |
| T-016 | 模型 | 代数 | 齐 | — | `core/history.test.ts` | undo/redo；isolate before/after/full；**整篇 load + isolate 后 undo 打字不撤空** |
| T-017 | 模型 | 代数 | 齐 | 字素簇只 smoke，细节在上游库 | `core/char.test.ts` | 码点读写；代理对往返 |
| T-018 | 模型 | 代数 | 齐 | — | `core/charcategory.test.ts` | 词 / 空白分类（词移动、整词查找） |
| T-019 | 模型 | 代数 | 齐 | — | `core/column.test.ts` | 列 ↔ 偏移：空串、混合 tab、emoji 簇占 1 列；tab 后接簇 |
| T-020 | 模型 | 代数 | 齐 | 真视觉换行靠活页（jsdom 无 wrap 像素） | `core/bidi.test.ts` | 双向文本逻辑序→视觉段；视觉光标移动；LTR 行内希伯来段视觉前进 |
| T-021 | 模型 | 代数 | 骨 | 快照馆，契约在 T-010/011/035；不加重复证人 | `core/fixtures.test.ts` | rope / ChangeSet / tile 的 fixture 快照 |
| T-030 | 视图 | 投影 | 齐 | jsdom 无真布局，视口退化为全文 | `core/editorview.test.ts` | 挂载/销毁；dispatch 改文档；增量改行保持未变行 DOM 身份；视口；大文档整篇替换不越界 |
| T-031 | 视图 | 投影 | 律 | — | `core/heightmap.test.ts` | 全文档高度：估高、变更、位置↔像素、实测回填 |
| T-032 | 视图 | 投影 | 齐 | 真字体校准只在浏览器 | `core/linewidthmap.test.ts` | 全文档行宽：max 增量；删最长行会跌；未进视口的长行也撑横滚 |
| T-033 | 视图 | 投影 | 齐 | BigScaler 真滚未在浏览器钉 | `core/viewport.test.ts` | 可见窗口算渲染区间；超高文档视口外压扁 |
| T-034 | 视图 | 投影 | 齐 | — | `core/linepatch.test.ts` | 改哪些行 → 删哪些 `.cm-line`；滚动换窗复用重叠行 |
| T-035 | 视图 | 投影 | 齐 | — | `core/buildtile.test.ts` | 文本 × 装饰 → tile 树（行/mark/widget） |
| T-036 | 视图 | 投影 | 齐 | — | `core/materialize.test.ts` | tile → 真 DOM；三层嵌套；交错 mark 重叠处套 span；block widget 画出 toDOM；EditorView 挂上后旁插入不炸 |
| T-037 | 视图 | 投影 | 齐 | 折叠 widget 映射主要在 T-055 | `core/dombridge.test.ts` | `pos ↔ (node,offset)` 双射，含虚拟化窗口；行首零长 block widget 不吃 pos |
| T-038 | 视图 | 投影 | 齐 | 真惯性滚在活页 | `core/scrollintoview.test.ts` | 事务带 scrollIntoView 时主光标行进视口；折叠后 height 变矮，末行不到未折那么远 |
| T-039 | 视图 | 投影 | 齐 | 真主题像素对照在活页 | `core/view-integration.test.ts` | shiki 色进 DOM（token span color）；keymap 改 state；乱序 token 不炸 RangeSet |
| T-040 | 视图 | 投影 | 齐 | — | `core/contrib.test.ts` | 括号/缩进扫描；彩虹括号上色；`metrics.height === heightMap`；minimap/竖条/横条/概览条挂卸；attachOverlay 挂卸 + 事务 redraw |
| T-041 | 视图 | 投影 | 主 | CSS 动画本身测不了 | `core/blink.test.ts` | 打字光标恒亮，停手后恢复闪 |
| T-042 | 视图 | 投影 | 主 | 列选拖满手感在活页 | `core/capabilities-view.test.ts` | 坐标点选、矩形列选跨空行、命令面板过滤 Enter / Esc / 点遮罩 / 无命中 Enter / ArrowDown 再 Enter / commandPaletteCommand、composition hang |
| T-043 | 视图 | 投影 | 齐 | 真滚动下的 coords 双射靠活页；jsdom 打桩 | `core/caret.test.ts` | 光标域：∀pos DOM 双射；caretCoords↔posAtCoords；点击近边；视口外无 caret |
| T-050 | 输入 | 沼泽 | 齐 | 真 IME 组合不在此（状态机在 T-065） | `core/input-flow.test.ts` | 打字 / 回车拆行 / 选区替换 / 跨行退格：DOM 变异写回 state |
| T-051 | 输入 | 沼泽 | 齐 | 移动端 pending-key 未在 jsdom 复现 | `core/input-edge.test.ts` | 空文档、首尾、连打、emoji/CJK |
| T-052 | 输入 | 沼泽 | 齐 | 拖拽块 widget ⛔（无拖块产品） | `core/input-matrix.test.ts` | Op×落点×内容 剪枝格（见 `INPUT-TEST-MATRIX.md`）；line 装饰下行内输入 class 仍在 |
| T-053 | 输入 | 沼泽 | 齐 | 千级 DOM 输入不在 jsdom | `core/input-boundary.test.ts` | 多光标扇出边界；千级 replaceSelection 每处各插一字 |
| T-054 | 输入 | 沼泽 | 齐 | 系统剪贴板权限（环境洞） | `core/input-clipboard.test.ts` | 粘贴纯文本；copy/cut；drop 不进 HTML；只有 html/图不写 doc；空串粘贴不改 doc；dragover preventDefault + copy；只读 cut 写剪贴板不删；只读 pasteCommand 不改 doc |
| T-055 | 输入 | 沼泽 | 齐 | — | `core/input-fold.test.ts` | 折叠 ⋯ 下 pos 映射；折后再回车不炸；内外层都折后回车不丢隐藏体 |
| T-056 | 输入 | 沼泽 | 齐 | — | `core/input-span.test.ts` | 高亮 span 内点选映射；嵌套重叠 mark 下 pos 双射 |
| T-057 | 输入 | 沼泽 | 齐 | — | `core/input-spanedit.test.ts` | 多 span 行内改字；跨 span 边界删第一段末字 |
| T-058 | 输入 | 沼泽 | 齐 | — | `core/input-syntaxedit.test.ts` | 删词重写；未闭合字符串跨行；未闭合块注释仍双射 |
| T-059 | 输入 | 沼泽 | 主 | jsdom 视口是桩，不是真虚拟化滚 | `core/input-virtualized.test.ts` | 只渲染视口时输入仍 DOM≡doc |
| T-060 | 输入 | 代数 | 齐 | — | `core/domchange.test.ts` | 两段文本 diff 可还原；DOM 读回带行占位 |
| T-061 | 输入 | 代数 | 主 | 新浏览器化石另开格 | `core/domchange-swamp.test.ts` | findDiff：空插入、全文删、相同串、Shift-Enter 双换行、preferredSide |
| T-062 | 输入 | 沼泽 | 齐 | — | `core/domreader.test.ts` | `\r\n` 归一；折叠占位不读进正文 |
| T-063 | 输入 | 代数 | 齐 | — | `core/domutil.test.ts` | 位置钳位（空文本/注释/空元素）；不可编节点；preferAfter 空 widget |
| T-064 | 输入 | 沼泽 | 齐 | Android/iOS 真机 delay 不在此 | `core/capabilities-swamp.test.ts` | findDiff 完备；多光标真实输入；composition；双空格 |
| T-065 | 输入 | 沼泽 | 齐 | 是状态机，不是输入法引擎 | `core/capabilities-inputstate.test.ts` | IME 状态机；Tab 焦点永久/临时 2s；Firefox copy/cut hack |
| T-070 | 命令 | 代数 | 齐 | 只钉文档+选区终态，不钉滚/闪 | `core/commands.test.ts` | 选区/光标/删除/缩进/行移动/注释/匹配括号等 StateCommand 终态；只读 insertTab / insertNewlineAndIndent 返 false；`cursorCharRight` 希伯来段走视觉；joinLines；大小写/Title Case / snake / camel / kebab / pascal / CONSTANT；sortLines / sortLinesDescending；indentToSpaces / indentToTabs；wrapInParens；reverseLines；selectInside；deleteInside；duplicateAndComment；stripLineComments；stripBlockComments；cycleSurrounding；toggleOptionalChain；toggleNullish；alignEquals；addBraces；addAwait；toggleExport；ifToTernary；unwrapTernary；functionToArrow；arrowToFunction；toggleArrowBraces；extractConstant；flipIfElse；negateIf；toggleObjectShorthand；swapOperands；toggleMemberAccess；toggleTrailingComma；splitDecl；joinDecl；unwrapIf；toggleAsync；removeBraces；inlineConstant；toggleStrictEq；splitArray / joinArray；toggleIncrement；splitString；joinString；wrapInIf；toggleSemicolon；toggleLog；toggleHexDec；mergeIf / splitIfAnd；toggleArrowParens；splitObject / joinObject；toggleAssignOp；toggleTypeImport；toggleExportDefault；split/joinCallArgs；wrapTryCatch；toggleBoolean；promoteBinding；invertComparison；reindentSelection；insertFinalNewline；duplicateSelection；selectParentSyntax；deleteBlankLines；deleteDuplicateLines；removeBrackets；insertCursorAtEndOfEachLineSelected；increment/decrementNumber；moveToNext/PrevOccurrence |
| T-071 | 命令 | 代数 | 齐 | 与 T-070 有重叠 | `core/capabilities-commands-full.test.ts` | 同上，按能力面再钉 |
| T-072 | 命令 | 代数 | 主 | 只收过一次缺口，不是全命令 | `core/gap-commands.test.ts` | 曾缺口：块注释、foldAll 等 |
| T-073 | 命令 | 代数 | 主 | 和弦 / 前缀键没有（产品砍了） | `core/keymap.test.ts` | 键 → 命令分发 |
| T-074 | 命令 | 代数 | 主 | 未穷尽所有 Mod 组合 | `core/keymap-modifiers.test.ts` | Shift+回车/删；未识别 Cmd 组合拦原生加粗等 |
| T-075 | 命令 | 代数 | 齐 | — | `core/closebrackets.test.ts` | 开括号补闭、过键、包选区；dispatch 插入 `(` 不补，inputHandler 才补 |
| T-076 | 命令 | 代数 | 齐 | — | `core/indentoninput.test.ts` | 行首打 `}` 对齐开括号行；dispatch 插入不对齐，inputHandler 才拉齐 |
| T-077 | 命令 | 投影 | 齐 | — | `core/fold.test.ts` | 谁可折；foldAll≡逐行 foldable；装饰按 from 排序；**fold 换新 heightMap**；折后前插行号下移；无折叠 unfoldAll 返 false；未折叠 unfoldCode 返 false；fold 事务改折叠块、纯选区不改；再 fold 仍折；`#region` / `#endregion` 同缩进可折；extraFold 补上缩进看不到的块；foldRecursively 外+内一起折；gotoNext/Prev/ParentFold；foldLevel(2) 只折内层；foldFromSelection 选区成块 |
| T-078 | 命令 | 代数 | 齐 | 真页手感在活页 | `core/lineselection.test.ts` | 点行号选整行；gutter mousedown 选第 2 行；点折叠箭头折起函数体 |
| T-079 | 命令 | 代数 | 齐 | — | `core/gotoline.test.ts` | 跳行 clamp；空文档；openGotoLine Enter 跳 / Esc 不跳；非法文案不跳；点遮罩不跳；gotoLineCommand 开面板 |
| T-080 | 命令 | 代数 | 齐 | — | `core/capabilities-atomic.test.ts` | 原子区间，光标不能停中间 |
| T-081 | 命令 | 代数 | 主 | 与 T-016/T-075/T-076 有重叠 | `core/capabilities-history-close.test.ts` | 历史深度 + 自动配对 + 输入缩进 |
| T-082 | 命令 | 代数 | 主 | 未穷尽每条绑定 | `core/capabilities-keymap-features.test.ts` | defaultKeymap 含主编辑键；Backspace 经 keymapHandler 真删字 |
| T-090 | 特性 | 代数 | 齐 | 真布局跳转在活页 | `core/search.test.ts` | 命中/开关/下一处/替换/flag；regex 真命中（`.` 通配，非法式空）；`$1`/`$&`/`$$` 替换；preserve-case；toggleSearchReplace 开替换栏 / 关着返 false；replaceNext 最后一处光标落末；空选区 toggleFindInSelection 返 false；selectAllSearchMatches 无命中返 false；点 × 关查找；关面板后 findNext/Prev 仍跳；Shift+Enter 上一处；Tab 进替换栏；替换栏 Enter 换当前 / Mod+Enter 全换；历史 ArrowDown 回到草稿；清空 query 去掉 no-results；替换历史 ArrowUp；再 openSearch 仍开；Prev 钮上一处；findInText 扫 from..to |
| T-091 | 特性 | 代数 | 齐 | 异步 TS 源热路径在 T-110 | `core/autocomplete.test.ts` | 文档词/关键字、防抖、接受/关、模糊；snippet 源；tabCompletion；pageNext/pagePrev 跳 5 项；未开 pageNext 返 false；closeCompletionOnSpace 关但不吃键；python `def`；未知语言无关键字；keydown `.` 接受当前项；空格关列表不替换词；再 start 仍开；显式空前缀列出关键字 |
| T-092 | 特性 | 投影 | 齐 | — | `core/completion-place.test.ts` | 补全列表顶 = caret 行底，不吸窗顶；贴底软夹 80px；贴左缘夹到 +4 |
| T-093 | 特性 | 投影 | 齐 | — | `core/completion-overlay.test.ts` | 下拉是 overlay，不进 `.cm-line` |
| T-094 | 特性 | 代数 | 齐 | 真鼠标轨迹在活页；TS hover 在 T-111 | `core/hover.test.ts` | 诊断卡命中；mousemove 弹出；mouseleave / 滚动关掉；无 hover 源不弹卡 |
| T-095 | 特性 | 代数 | 齐 | — | `core/capabilities-diagnostics.test.ts` | 诊断写入 field；随文档 map；整段删除则丢；会话挂上后 LS 诊断进 field；F8 / Shift+F8 跳下一处/上一处诊断并环回 |
| T-096 | 特性 | 代数 | 齐 | — | `core/capabilities-search-ac.test.ts` | 补全何时弹；搜索状态机；replaceAll 一次换完全部 |
| T-097 | 特性 | 代数 | 齐 | — | `core/selectionlayer.test.ts` | 选区底、当前行、同词、括号对；同词超过 200 只挂 200 条 |
| T-098 | 特性 | 代数 | 主 | 与 T-097 重叠 | `core/capabilities-selectionlayer.test.ts` | 选区层能力面 |
| T-099 | 特性 | 代数 | 齐 | — | `core/snippet.test.ts` | `$0`；同号 stop；嵌套 `${1:${2:x}}` 两处 stop；`${1|a,b|}` 取第一项；未闭合 `${` / 单独 `$` 当字面量；`${1}` 无默认占空位；Tab 走 `$1` 再 `$0`，过完清 session；Shift-Tab 回上一处，在 `$1` 上再退返 false；同号 `$1` 改一处其余跟着变；单号 stop 改字 len 跟着长；当前 `$1` 涂 active，同号另一处涂 linked |
| T-110 | 语言 | LS | 齐 | — | `core/tscompletion.test.ts` | 模糊/kind；XL 隐式不进 LS；冷启动 ensure；explicit overlay 列表含本地符号 |
| T-111 | 语言 | LS | 齐 | — | `core/tsquickinfo.test.ts` | QuickInfo DOM；真 LS hover；JSDoc；真 LS @param/@returns 进 tag 行；诊断映区间 |
| T-112 | 语言 | LS | 齐 | worker 不做 | `core/ts-intellisense.test.ts` | 全量 lib、成员补全、跨文件；rename / format / 跳转 / peek；空白处 definition/peek 返 false；只读 rename 返 false；`tsActionsAvailable`（含 tsx/jsx）；只读 format 返 false；`closePeek` / 点 ×；ArrowDown/Up 环绕；Esc；空 locations 不弹；点行跳转；toPeekLocations；isProgramLib 排除 worker/full；readLib 按文件名回退；setTsLibLoader 优先；pickList 过滤 Enter / Esc / 点行 / ArrowUp / 点遮罩；goToSymbol Esc 不跳；organizeImports；addMissingImports；removeUnusedImports；removeUnusedLocals；addTypeAnnotation；addMissingMembers；formatSelection；智能扩选；工作区符号；inlay 参数名；`;` 后 format-on-type；粘贴多行 format-on-paste；goToTypeDefinition 跳到类型名不是值 |
| T-113 | 语言 | LS | 齐 | — | `core/tsbudget.test.ts` | 大文档诊断降级；行预览；跨文件 loc；空 preview 标 (empty) / `:?` |
| T-114 | 语言 | LS | 齐 | — | `core/signature-render.test.ts` | 渲模型；打 `(` 弹出签名卡；Esc / 离开调用栈关掉；打逗号高亮下一参数 |
| T-120 | 壳 | 代数 | 齐 | — | `brackets.test.ts` | 括号深度扫；滚动种子拆分恒等 |
| T-121 | 壳 | 代数 | 齐 | — | `indent.test.ts` | 缩进列 / 探测 indent 宽 |
| T-122 | 壳 | 代数 | 律 | 冷启动全文 10k 时延不在单测 | `tokens.test.ts` | 增量 tokenize = 全文逐 token；单行编辑只重扫常数行 |
| T-123 | 壳 | 投影 | 齐 | 真拖条手感在活页 | `core/hscrollbar.test.ts` | 横条 thumb 宽只跟 vw/cw，不跟 scrollLeft 漂 |
| T-124 | 壳 | 投影 | 齐 | 同上 | `core/vscrollbar.test.ts` | 竖条 thumb 高只跟文档高/视口高 |
| T-125 | 壳 | 投影 | 齐 | canvas 在 jsdom 是空实现 | `core/minimap.test.ts` | slider 几何；滚动不发 onGeometry；resize 才重算 |
| T-126 | 壳 | 代数 | 齐 | — | `core/minimapcore.test.ts` | 行抽样、色、窗口滚动、slider 矩形；hex 可无 `#` |
| T-127 | 壳 | 代数 | 齐 | — | `core/overviewruler.test.ts` | 概览条只标光标/搜索/诊断，不含同词；搜索命中与诊断进 ruler；同像素 error 压过 cursor |
| T-128 | 壳 | 投影 | 齐 | — | `core/indentguides.test.ts` | 缩进竖线；有 view 不扫完全文；大文档挂线 ≤ 视口末+40 |
| T-129 | 壳 | 投影 | 齐 | — | `core/contextmenu.test.ts` | 右键打开；Copy / Cut；Change All；点每项 LSP；Command Palette；点菜单外关闭；滚动关菜单；Peek 子菜单含 Definition/References/Implementation/Type；Organize Imports；Format Selection |
| T-130 | 壳 | 投影 | 齐 | — | `core/readonlymessage.test.ts` | 只读时编辑弹出 tip；hide 先 fadeOut 再卸 |
| T-131 | 壳 | 投影 | 齐 | — | `core/diff-a11y.test.ts`、`core/diff-fix2.test.ts` | 并排 Diff：Monaco advanced diff 的行区间和字级改动、两侧对齐 zone、gutter ± 和行背景、Revert Block / Selection、goToNext/Prev 照 goToDiff、setModels 后撤销栈归新模型、编辑后 200ms 重算、destroy 可重复调；查找、ARIA |
| T-132 | 壳 | 代数 | 齐 | — | `core/m2-features.test.ts` | sticky 行；视口第 1 行无 sticky；maxLines 截断；overlay 画出祖先行；peek 片段；首行 focus 不越界；行 diff；fixes→变更；只读/无 fix 不弹 Quick Fix；a11y 诊断播报；自定义 label；选区变化播报行号；announceSelection:false 不播；选中表达式能收集 Extract 重构 |
| T-133 | 壳 | 代数 | 主 | 时延数字在 PERF-OPS，不在此 | `core/perf.test.ts` | 行/字符分级；L=syntax；budgetForState；括号有界 |
| T-134 | 壳 | 入口 | 骨 | 真机矩阵仍靠 DEVICE-TEST（环境洞） | `core/device-path.test.ts` | 设备路径矩阵的自动层 |
| T-135 | 壳 | 代数 | 骨 | 真 UA 在真机（环境洞） | `core/capabilities-browser.test.ts` | browser 检测面（Mac/Chrome 等）；jsdom 非 Android Chrome≥126 时 EditContext 关 |
| T-136 | 特性 | 代数 | 齐 | 色板点击不在此 | `core/hexcolor.test.ts` | `#rgb` / `#rrggbb` / `#rrggbbaa` 独立色；`abc#fff` / `#gg` / 太短不收 |
| T-137 | 特性 | 代数 | 齐 | — | `core/specialchar.test.ts` | nbsp / zwsp 标出；普通字不收 |
| T-138 | 特性 | 代数 | 齐 | 不打开系统浏览器 | `core/link.test.ts` | 光标在 https 上取出 URL，剥句点；selectLink 选中 |
| T-139 | 特性 | 代数 | 齐 | — | `core/todo.test.ts` | TODO / FIXME 钉上，TODOLIST 不收；gotoNext 环回 |
| T-140 | 特性 | 代数 | 齐 | 模板字符串不做 | `core/quotes.test.ts` | 光标在 `'hi'` 取出区间；toggle 成 `"hi"` 再换回；unwrap 拆掉引号 |
| T-141 | 特性 | 代数 | 齐 | 行中空白不标 | `core/whitespace.test.ts` | 行尾空格/Tab 钉上，行中的不收 |
| T-142 | 特性 | 代数 | 齐 | — | `core/tags.test.ts` | `<div>` 对到 `</div>`；自闭合不配；跳过去再跳回；selectAroundTag 选整段；syncMatchingTag 改另一侧名字 |
| T-146 | 特性 | 代数 | 齐 | — | `core/uri.test.ts` | 空格编成 `%20` 再解回；空选区返 false |
| T-147 | 特性 | 代数 | 齐 | — | `core/html.test.ts` | 未闭合 `<div>` 补 `</div>`；`&` ⇄ `&amp;` |
| T-144 | 特性 | 代数 | 齐 | — | `core/escape.test.ts` | 换行/反斜杠转义往返；空选区返 false |
| T-143 | 特性 | 代数 | 齐 | 只收一行 require | `core/requireimport.test.ts` | `const fs = require('fs')` → `import fs from 'fs'`；import 转回 require |
| T-145 | 特性 | 代数 | 齐 | — | `core/concat.test.ts` | `"a" + x + "b"` ⇄ `` `a${x}b` `` |
| T-148 | 特性 | 代数 | 齐 | 只收单行 | `core/refactor.test.ts` | if/else return ⇄ 三元；单行 function⇄箭头；箭头表达式 ⇄ `{ return }`；选区抽 `const _` 再内联回去；if 花括号拆回单语句；`==` ⇄ `===`；数组拆行再拼回；`i++` ⇄ `++i`；引号内拆成拼接再拼回；包 if (true)；行尾分号；console.log 包/拆；255 ⇄ 0xff；嵌套 if ⇄ &&；箭头单参括号；对象拆合；`x = x + 1` ⇄ `x += 1`；import type；export default；if/else 两支对调；if 条件加/去 `!`；`{ a: a }` ⇄ `{ a }`；`a === b` 两边对调；`obj.foo` ⇄ `obj['foo']`；调用尾逗号开关；const 多绑定拆开再拼回；无 else 的 if 拆掉；function/箭头加/去 async；调用参数拆行再拼回；true⇄false；var→let→const；===⇄!==，不吃 `=>` |

---

## README 特性 → 测试

| 表面 | T-id | 备注 |
|---|---|---|
| `liteMonaco()` | T-001 | |
| `liteMonacoThemeCSS` | T-003 | |
| `DiffEditor` | T-131 | 并排（无 inline / moved） |
| `core` 编辑环 | T-030 / T-050 / T-070 | |
| lineNumbers / foldGutter | T-030 / T-077 | |
| activeLine / selectionMatch / bracketMatch | T-097 | |
| multiCursor | T-070 / T-053 | |
| closeBrackets / indentOnInput | T-075 / T-076 | |
| bracketColors | T-040 | `bracketColorDecorations` |
| overviewRuler / minimap | T-127 / T-125 | |
| indentGuide | T-128 | |
| search / autocomplete / hover | T-090 / T-091 / T-094 | |
| history / tabIndent | T-016 / T-070 | |
| hScrollbar / vScrollbar | T-123 / T-124 | |
| contextMenu | T-129 | |
| signatureHelp | T-114 | 渲模型；`(` 触发会话 主路径薄 |
| tsDiagnostics / hover LS | T-095 / T-111 | |
| TS completion | T-110 / T-112 | |
| lineWrapping | T-132 / T-134 | 开关进 View |
| stickyScroll / codeActions | T-132 / T-099 | |
| a11y | T-131 | |
| `monaco.editor.*` 全集 | 砍 | T-002 已删 shim |
| 真 IME 引擎 / 真机矩阵 / 活页 10k 布局 | ⛔ | 环境洞，jsdom 不填 |

## 本轮关掉的缺口

| ID | 句子 |
|---|---|
| T-070 | mergeIf / splitIfAnd；toggleArrowParens；splitObject / joinObject；toggleAssignOp；toggleTypeImport；toggleExportDefault |
| T-148 | 嵌套 if ⇄ &&；箭头单参括号；对象拆合；`+=` 折叠；import type；export default |
| T-070 | joinString；wrapInIf；toggleSemicolon；toggleLog；toggleHexDec |
| T-148 | 字面量拆开再拼回；包 if (true)；行尾分号；console.log；255 ⇄ 0xff |
| T-145 | `"a" + x + "b"` ⇄ 模板字符串 |
| T-070 | removeBraces；inlineConstant；toggleStrictEq；splitArray / joinArray；toggleIncrement；splitString |
| T-148 | 拆 if 花括号；抽 `_` 再内联；`==` ⇄ `===`；数组拆合；`i++` ⇄ `++i`；字符串拆拼接 |
| T-070 | swapOperands；toggleMemberAccess；toggleTrailingComma；splitDecl / joinDecl；unwrapIf；toggleAsync |
| T-148 | 比较两边对调；`.` ⇄ `[]`；尾逗号；声明拆合；拆 if；async 开关 |
| T-070 | arrowToFunction；toggleArrowBraces；extractConstant；flipIfElse；negateIf；toggleObjectShorthand |
| T-148 | function⇄箭头往返；箭头花括号；抽 const _；if 两支对调；否定条件；对象简写 |
| T-070 | ifToTernary；unwrapTernary；functionToArrow；split/joinCallArgs；wrapTryCatch；toggleBoolean；promoteBinding；invertComparison |
| T-148 | if/else return ⇄ 三元；单行 function→箭头；调用参数拆行再拼回；true⇄false；var→let→const；===⇄!== |
| T-070 | addBraces；addAwait；toggleExport |
| T-147 | closeHtmlTag；HTML 实体编解码 |
| T-070 | toggleNullish；alignEquals；stripBlockComments |
| T-142 | syncMatchingTag 把另一侧改成当前名 |
| T-146 | URI 编解码选区 |
| T-070 | stripLineComments；cycleSurrounding；toggleOptionalChain |
| T-143 | import ⇄ require |
| T-145 | 拼接转模板字符串 |
| T-070 | deleteInside；CONSTANT_CASE；duplicateAndComment |
| T-142 | selectAroundTag 选整段元素 |
| T-144 | 选区 escape / unescape |
| T-070 | reindentSelection |
| T-112 | removeUnusedLocals 删未用变量，不删 import |
| T-142 | `<div>` 对到 `</div>` |
| T-143 | require → import |
| T-070 | wrapInParens；reverseLines；selectInside |
| T-112 | addMissingMembers 给 implements 补方法 |
| T-140 | unwrapQuotes 拆掉引号 |
| T-070 | indentToSpaces / indentToTabs |
| T-112 | addTypeAnnotation 给 const 补 number |
| T-140 | `'hi'` ⇄ `"hi"` |
| T-141 | 行尾空白钉上 |
| T-070 | Pascal Case；sortLinesDescending |
| T-077 | foldFromSelection 选区成块 |
| T-112 | 粘贴多行后补空格 |
| T-139 | TODO / FIXME；gotoNext 环回 |
| T-070 | increment/decrementNumber；moveToNext/PrevOccurrence |
| T-077 | foldLevel(2) 只折内层 |
| T-112 | removeUnusedImports 只删未用 import |
| T-137 | nbsp / zwsp 标出 |
| T-138 | 光标处 https URL，剥句点 |
| T-070 | deleteDuplicateLines；snake/camel/kebab；removeBrackets |
| T-077 | gotoNext/Prev/ParentFold |
| T-112 | addMissingImports 补跨文件类型 |
| T-136 | `#rgb` / `#rrggbb` / `#rrggbbaa` 独立色；贴着字的 `#` 不收 |
| T-070 | deleteBlankLines；选区每行末一个光标 |
| T-077 | foldRecursively 外+内一起折，再折返 false |
| T-112 | goToTypeDefinition 跳到类型名，不是值声明 |
| T-129 | Peek 子菜单含 Type；点 Go to Type / Peek Type |
| T-095 | F8 下一处诊断，末条环回；Shift+F8 上一处 |
| T-070 | duplicateSelection；selectParentSyntax 先内后括号 |
| T-094 | 键盘 showHover 在诊断上弹出卡片 |
| T-070 | Title Case；sortLines；insertFinalNewline |
| T-132 | 两个未用变量能收集 Fix all |
| T-070 | joinLines；选区/词大小写变换 |
| T-112 | goToImplementation 跳到 class 实现 |
| T-112 | 语义同符号高亮（getDocumentHighlights） |
| T-112 | 智能扩选 / 缩选；工作区符号；inlay 参数名；`;` 后 format-on-type |
| T-112 | formatSelection 只改选区，空选区返 false |
| T-132 | 选中表达式能收集 Extract 重构 |
| T-129 | 右键 / 面板有 Format Selection |
| T-112 | 改 `<div>` 的名字，`</div>` 一起变 |
| T-112 | 函数上 `/*` 再打 `*` 展开 JSDoc `@param` |
| T-112 | organizeImports 合并同模块 import；只读返 false |
| T-129 | 右键 / 面板有 Organize Imports |
| T-112 | tsx 打 `>` 补 JSX 闭合标签 |
| T-099 | 当前 `$1` 涂 active，同号另一处涂 linked |
| T-077 | extraFold 补上缩进看不到的块；TS outlining 映成折行 |
| T-099 | 同号 `$1` 改一处其余跟着变；单号 stop 改字 len 跟着长 |
| T-099 | Shift-Tab 回上一处；$1 上再退返 false |
| T-070 | cursorCharRight 希伯来段走视觉，不是逻辑 +1 |
| T-020 | 左右键接 moveVisually（视觉换行仍是环境洞） |
| T-099 | 嵌套 `${1:${2:x}}` 解析内层；`${1|a,b|}` 取第一项 |
| T-077 | `#region` / `#endregion` 同缩进可折 |
| T-052 | line 装饰下行内输入，行 class 仍在 |
| T-015 | block widget 物化；EditorView 挂上后旁插入不炸 |
| T-036 | block widget 画出 toDOM；replace 占隐藏区间长 |
| T-037 | 行首零长 block widget pos 双射 |
| T-090 | regex 真命中（`.` 通配，非法式空）；`$1`/`$&`/`$$` 替换 |
| T-131 | 行数少的一侧补对齐 zone，斜纹画在 fill 层 |
| T-019 | 空串、混合 tab、emoji 簇列宽 |
| T-061 | 空插入 / 全文删 / 相同串 findDiff |
| T-079 | 空文档；Goto 面板 Enter / Esc |
| T-082 | Backspace 经 defaultKeymap 真删字 |
| T-133 | 字符阈值升档；L=syntax；budgetForState |
| T-040 | 彩虹括号空 palette / 成对上色 |
| T-001 | `search:false` 不装 searchField |
| T-003 | 选区背景 CSS |
| T-016 | 整篇 load + isolate 后 undo 打字不撤空 |
| T-099 | 双 stop snippet |
| T-111 | JSDoc hover |
| T-114 | triggerSignatureHelp 派事件 |
| T-128 | 有 view 不给全文挂线 |
| T-129 | Change All 菜单项 |
| T-001 | theme 名决定 style id，明暗 CSS 不同 |
| T-003 | 诊断波浪线三档 SVG 与 ruler 同色 |
| T-013 | 空槽回默认；同事务后者胜；卸 field |
| T-036 | 三层嵌套；交错 mark |
| T-063 | 空节点钳位；preferAfter 空 widget |
| T-079 | 非法文案 Enter 不跳 |
| T-095 | tsDiagnosticsSession 写入 field |
| T-099 | 同号 stop 各占一处 |
| T-111 | 真 LS @param/@returns |
| T-114 | 打 ( 弹出签名卡 |
| T-040 | minimap/竖条/横条/概览条挂卸 |
| T-055 | 内外层都折后回车不丢隐藏体 |
| T-092 | 贴底软夹；贴左缘 |
| T-110 | 冷启动 explicit ensure |
| T-129 | 点每项 LSP 调 provider |
| T-019 | tab 后接 emoji 簇 |
| T-058 | 未闭合块注释仍双射 |
| T-128 | 大文档挂线 ≤ 视口末+40 |
| T-012 | 千级乱序 cursor 排序+插入映射 |
| T-097 | 同词超过 200 只挂 200 条 |
| T-042 | 面板过滤 Enter 跑 Select All / Esc 不改 |
| T-053 | 千级 replaceSelection 每处各插一字 |
| T-054 | 只有 html/图不写 doc |
| T-075 | dispatch 插入 ( 不补闭符 |
| T-096 | replaceAll 一次换完全部 |
| T-099 | 嵌套模板不解析内层 |
| T-112 | rename / format 终态 |
| T-132 | a11y role + live region |
| T-001 | lineWrapping class + 默认 a11y role |
| T-010 | 五千行改中间一行首尾不变 |
| T-038 | 折叠后 height 变矮，末行不到未折那么远 |
| T-042 | 矩形选跨空行 |
| T-057 | 跨 span 边界删第一段末字 |
| T-078 | gutter mousedown 选第 2 行 |
| T-090 | regex 钮只翻 flag，命中仍字面 |
| T-110 | explicit overlay 列表含本地符号 |
| T-112 | goToDefinition 跳本文件声明 |
| T-001 | contextMenu:false 不弹菜单 |
| T-015 | 估高 40 的 block widget 撑高 heightMap |
| T-056 | 嵌套重叠 mark 下 pos 双射 |
| T-076 | dispatch } 不对齐，inputHandler 才拉齐 |
| T-077 | 折后前插一行折叠行号下移 |
| T-094 | mousemove 后弹出诊断卡 |
| T-112 | peekDefinition 弹出面板 |
| T-114 | Esc 关掉签名卡 |
| T-001 | foldGutter:false 不画折叠箭头 |
| T-020 | LTR 行内希伯来段视觉前进 |
| T-078 | 点折叠箭头折起函数体 |
| T-099 | 单独 $ 当字面量 |
| T-112 | goToReferences peek；goToSymbol Enter 跳转 |
| T-114 | 光标离开调用栈关签名卡 |
| T-132 | a11ySession 播报 error 数 |
| T-001 | stickyScroll:false 不挂粘性条 |
| T-090 | preserve-case Hello→World |
| T-112 | peekReferences 弹出引用面板 |
| T-114 | 打逗号高亮下一参数 |
| T-132 | sticky overlay 画出祖先行 |
| T-001 | minimap:false 不挂缩略图 |
| T-039 | shiki token span 上色 |
| T-090 | toggleSearchReplace 开替换栏 |
| T-091 | snippet 源 for 展开循环 |
| T-094 | 滚动关掉 hover 卡 |
| T-129 | 点 Command Palette 打开面板 |
| T-131 | goToPrevChange 回上一条 |
| T-001 | hScrollbar:false；signatureHelp:false 不弹卡 |
| T-065 | toggleTabFocusMode / 临时 2s |
| T-094 | mouseleave 关掉 hover 卡 |
| T-112 | tsActionsAvailable；closePeek |
| T-129 | 点 Cut 删选区 |
| T-001 | 关行号/竖条/a11y/补全不装 |
| T-091 | tabCompletion；pageNext 跳 5 项 |
| T-112 | 点 peek × 关面板 |
| T-130 | hide 先 fadeOut 再卸 |
| T-131 | 改右侧不改 original |
| T-001 | 关缩进线/当前行 |
| T-091 | pagePrev 回 5 项；closeCompletionOnSpace 关但不吃键 |
| T-054 | dragover preventDefault + copy |
| T-112 | peek ArrowDown 1/2→2/2 |
| T-135 | jsdom EditContext 关 |
| T-001 | hover / 同词 / 多光标 / 自动配对 / 输入缩进 / 括号匹配 / codeActions 关 |
| T-001 | python `#`；html `<!-- -->`；种子诊断波浪线 |
| T-001 | colors 覆盖；默认不换行；选区不 onChange；extensions + dispatch |
| T-016 | isolateHistory=after 不与后组合并 |
| T-090 | replaceNext 最后一处光标落替换末 |
| T-112 | peek ArrowUp 环绕；Esc；空 locations 不弹；点行跳转关面板 |
| T-099 | Tab 过完 $1 落到 $0，再 Tab 清 session |
| T-129 | 点菜单外关闭 |
| T-131 | goToNextChange 从末条环回第一条 |
| T-054 | 空串粘贴消费事件不改 doc |
| T-090 | 空选区 toggleFindInSelection 返 false |
| T-001 | css `/* */`；sql `--`；tsDiagnostics:false；默认 sticky；destroy 卸根 |
| T-112 | toPeekLocations；isProgramLib 排除 worker/full |
| T-001 | history:false undo 无效；tabIndent:false Tab 不缩进；未知语言 `//`；默认行号 |
| T-079 | 点 Goto 遮罩关面板不跳 |
| T-129 | 滚动关掉右键菜单 |
| T-090 | selectAllSearchMatches 无命中返 false |
| T-001 | 默认横条；关竖条仍挂独立概览条；JS 挂灯泡 |
| T-090 | 点 × 关查找；toggleSearchReplace 关着返 false |
| T-042 | 点调色板遮罩关；过滤无命中 Enter 不跑 |
| T-091 | python `de` 命中 `def` |
| T-099 | 未闭合 `${` 当字面量 |
| T-054 | 只读 cut 写剪贴板不删 |
| T-131 | 两侧相同 goToNext/Prev 返 false |
| T-132 | runCodeActionsMenu 只读或无 fix 返 false |
| T-001 | 默认竖条；xml `<!-- -->` |
| T-090 | 关面板后 findNext 仍跳；Shift+Enter 上一处；Tab 进替换栏；替换栏 Enter |
| T-091 | 未开 pageNext 返 false；未知语言无关键字；keydown `.` 接受 |
| T-099 | 单独 `$` 当字面量 |
| T-112 | readLib 按文件名回退 |
| T-132 | peek 首行 focus 不越到 0 |
| T-131 | destroy 卸根，再 destroy 不炸 |
| T-077 | 无折叠 unfoldAll 返 false |
| T-090 | 关面板后 findPrev；历史 ArrowDown 回草稿；替换栏 Mod+Enter 全换 |
| T-091 | 空格关补全不替换词 |
| T-042 | commandPaletteCommand 打开面板 |
| T-099 | `${1}` 无默认占空位 |
| T-131 | setModels 换两侧，撤销栈归新模型 |
| T-054 | 只读 pasteCommand 不改 doc |
| T-132 | 视口第 1 行无 sticky；maxLines 截断；自定义 label；选区播报行号 |
| T-077 | 未折叠 unfoldCode 返 false |
| T-079 | gotoLineCommand 开面板 |
| T-129 | Peek 子菜单含 Definition/References |
| T-131 | 默认忽略行尾空白 |
| T-090 | 清空 query 去掉 no-results；替换历史 ArrowUp |
| T-001 | yaml `#` |
| T-001 | lua `--` |
| T-112 | pickList 过滤 Enter / Esc |
| T-090 | 再 openSearch 仍开；Prev 钮上一处；findInText 扫 from..to |
| T-042 | ArrowDown 再 Enter 跑第二项 |
| T-094 | 无 hover 源不弹卡 |
| T-077 | fold 事务改折叠块，纯选区不改 |
| T-113 | 空 preview 标 (empty) / `:?` |
| T-040 | attachOverlay 挂卸 + 事务 redraw |
| T-112 | setTsLibLoader 优先；点 pickList 行；goToSymbol Esc 不跳 |
| T-077 | 再 fold 仍折 |
| T-001 | shell `#` |
| T-132 | announceSelection:false 不播 |
| T-070 | 只读 insertTab 返 false |
| T-003 | 含 peek / find / 换行 / QuickInfo 色 |
| T-127 | 搜索命中与诊断进 ruler；同像素 error 压过 cursor |
| T-112 | tsx/jsx 可用；只读 format 返 false；pickList 点遮罩 |
| T-099 | javascript 也有 for 片段 |
| T-001 | toml `#` |
| T-001 | vim `"`；lisp `;` |
| T-126 | hex 可无 `#` |
| T-112 | 空白处 definition/peek 返 false；只读 rename；pickList ArrowUp |
| T-070 | 只读 insertNewlineAndIndent 返 false |
| T-091 | 再 start 仍开；显式空前缀列出关键字 |

## 几何契约（扩功能时勿回退）

| ID | 完备 | 契约 |
|---|---|---|
| T-090 | 齐 | 查找换当前命中、拨 flag → **同一个** `heightMap` 对象 |
| T-077 | 齐 | 折叠 / 展开 → **新的** `heightMap` |
| T-032 / T-123 | 齐 | 横滚 thumb = `viewportWidth / contentWidth`，contentWidth 来自行宽表不是 DOM `scrollWidth` |
| T-031 / T-040 | 齐 | 竖向高度来自 heightMap，`metrics.height === heightMap.height` |

## 怎么拓展

1. 新文件：下一空号（产品 T-005…，模型 T-022…，或整段 T-140+）。  
2. 只加行，不改已有 ID。  
3. 「钉的行为」写失败时用户能复述的一句话。  
4. 补格先改「缺口」再升「完备」（骨→主→齐→律）。不要用百分数。  
5. 细到单条 `it` 时在表下加子表 `T-090-a`，不要拆掉文件行。  
6. 输入组合格继续写 `core/INPUT-TEST-MATRIX.md`，这里只留文件入口。
