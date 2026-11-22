# CM7 输入管线单测组合矩阵

一次输入测试 = `操作 Op × 落点 Loc × 内容 Content × 装饰 Deco × 光标 Caret × 后续 Then` 的一次取值。
6 维笛卡尔积 = 9×6×6×4×4×4 = 13824 格。本表按建模剪枝到**真实可达格**,逐格补测。

## 因子维度

| 维度 | 取值 |
|---|---|
| **Op 操作** | insert 插入 / delete 删除 / enter 回车拆行 / bksp 退格合并 / replace 选区替换 / paste 粘贴多行 / ime 输入法 |
| **Loc 落点** | docStart 文档首 / lineStart 行首 / mid 行中 / lineEnd 行末 / docEnd 文档末 / empty 空行 |
| **Content 内容** | ascii / cjk / emoji代理对 / tab空格 / multi多行 / empty空串 |
| **Deco 装饰** | none 无 / mark 高亮span / replace 折叠widget / **line 行装饰(⛔未接输入路径)** |
| **Caret 光标** | single 单光标 / multi 多光标 / sel 单选区 / crossSel 跨行选区 |
| **Then 后续** | none / undo / redo / retype 再输入 |

## 全局剪枝规则(建模推导)

- **R1** `redo`/`undo` 只作 Then,不作 Op(无前置操作的 redo/undo 无意义) → 砍 2 个 Op 值
- **R2** `empty空串` Content 只对 delete/replace/bksp 有意义(空串×insert=无操作) → 大量格剪
- **R3** 内容无关的 Op(bksp/enter/undo)对 cjk/emoji/tab 冗余 → 每类只留 1 代表格
- **R4** `line行装饰`下所有输入 Op → ⛔ CM7 未接 line 装饰输入路径,留空
- **R5** 拖拽 drop / 块级 widget 输入 → ⛔ 无 handler,留空(不在本 6 维内,单列附录)
- **R6** `replace折叠`下的输入 Op → 折叠区原子,输入落点贴边界;只测「折叠区旁输入」代表格
- **R7** multi多光标 × Content 只测 ascii(多光标关注扇出,与字符集正交)
- **R8** crossSel 只配 replace/delete/bksp(跨行选区的语义就是替换/删除)

## 状态图例

✅ 已有测试 | 🆕 待补 | ⛔ 缺功能留空 | ✂️ 剪枝(理由)

> 状态更新:全部 🆕 待补格已补入 `input-matrix.test.ts`(编号对应表格 #),下表 🆕 已全部转 ✅🆕(=本轮补上)。

## 主表:剪枝后的可达格

下表每行 = 一个待验证组合。Deco 缺省 none;Then 缺省 none;未列出的因子取默认(single/ascii)。
「已覆盖」列指向现有测试文件。

### Op = insert 插入

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| I1 | mid | ascii | none | single | none | ✅ | flow:行内插入单字符 |
| I2 | lineEnd | ascii | none | single | none | ✅ | flow:行尾追加 |
| I3 | docStart | ascii | none | single | none | ✅ | edge:文档最开头插入 |
| I4 | docEnd | ascii | none | single | none | ✅ | edge:文档最末尾插入 |
| I5 | empty | ascii | none | single | none | ✅ | edge/flow:空行输入 |
| I6 | mid | cjk | none | single | none | ✅ | edge:CJK 混合行内插入 |
| I7 | mid | emoji | none | single | none | ✅ | edge:输入 emoji |
| I8 | mid | tab | none | single | none | ✅ | edge:tab/多空格 |
| I9 | mid | ascii | none | multi | none | ✅ | flow:多光标各处插入 |
| I10 | mid | ascii | mark | single | none | ✅🆕 | span 行内插入(区外) |
| I11 | mid | ascii | replace | single | none | ✅🆕 | 折叠区【后】插入(抓出读路径真 bug,已修) |
| I12 | lineStart | ascii | replace | single | none | ✅🆕 | 折叠区【前】插入(同 bug) |
| I19 | mid | ascii | replace | single | none | ✅🆕 | 折叠区【后】删字符(读路径同修) |
| I13 | mid | ascii | none | single | undo | ✅ | flow:输入后 undo |
| I14 | mid | ascii | none | single | retype | ✅ | flow:undo 后继续输入 |
| I15 | mid | cjk | mark | single | none | ✅🆕 | CJK × span 插入 |
| I16 | mid | emoji | mark | single | none | ✅🆕 | emoji × span 插入 |
| I17 | mid | ascii | line | single | none | ⛔ | R4 line 装饰输入未接 |
| I18 | lineEnd | ascii | none | multi | undo | ✅🆕 | 多光标插入后 undo |

### Op = delete 删除(退格删字符,非合并)

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| D1 | mid | ascii | none | single | none | ✅ | flow:退格删字 |
| D2 | mid | ascii | none | single | retype | ✅ | edge:打字再逐个退格 |
| D3 | mid | emoji | none | single | none | ✅🆕 | 删 emoji(整代理对) |
| D4 | mid | cjk | none | single | none | ✅🆕 | 删 CJK 字 |
| D5 | mid | ascii | mark | single | none | ✅ | spanedit:span 内删字符 |
| D6 | mid | ascii | none | multi | none | ✅ | edge:多光标删除各处 |
| D7 | docEnd | ascii | none | single | none | ✅🆕 | 文档末删字符 |
| D8 | mid | ascii | none | single | undo | ✅🆕 | 删字后 undo 复原 |

### Op = enter 回车拆行

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| E1 | lineEnd | - | none | single | none | ✅ | flow:行末回车 |
| E2 | mid | - | none | single | none | ✅ | flow:行中回车拆两行 |
| E3 | docStart | - | none | single | none | ✅ | edge:文档开头回车 |
| E4 | empty | - | none | single | none | ✅ | edge:空行上回车再回车 |
| E5 | lineEnd | - | none | single | undo | ✅ | flow:回车后 undo |
| E6 | mid | - | mark | single | none | ✅🆕 | span 行中回车拆行 |
| E7 | lineEnd | - | none | single | retype | ✅ | flow:回车两下再输入(回归) |
| E8 | mid | emoji | none | single | none | ✅🆕 | emoji 之间回车(edge有,补 mid) |
| E9 | mid | - | none | multi | none | ✅🆕 | 多光标同时回车 |

### Op = bksp 退格合并(行首退格并入上行)

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| B1 | lineStart | ascii | none | single | none | ✅ | flow:第2行首退格合并 |
| B2 | empty | - | none | single | none | ✅ | flow:空行行首退格删空行 |
| B3 | lineStart | ascii | none | single | none(L3) | ✅ | flow:第3行首退格只并2、3 |
| B4 | lineStart | ascii | none | single | undo | ✅ | flow:跨行退格后 undo |
| B5 | lineStart | ascii | mark | single | none | ✅🆕 | span 行首退格合并 |
| B6 | lineStart | cjk | none | single | none | ✅🆕 | CJK 行退格合并 |
| B7 | docStart | - | none | single | none | ✅🆕 | 首行首退格(无上行→无操作) |

### Op = replace 选区替换

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| R1 | mid | ascii | none | sel | none | ✅ | flow:选中一段打字覆盖 |
| R2 | mid | multi | none | sel | none | ✅ | flow:选区替换成多字符 |
| R3 | lineEnd | ascii | none | sel | none | ✅ | flow:选中全行打字 |
| R4 | mid | ascii | none | crossSel | none | ✅ | flow:跨行选区覆盖 |
| R5 | mid | empty | none | crossSel | none | ✅ | flow:跨行选区删除(空串) |
| R6 | mid | multi | none | crossSel | none | ✅ | flow:跨行选区替换成多行 |
| R7 | mid | ascii | none | crossSel | undo | ✅ | edge:跨行选区替换后 undo |
| R8 | mid | ascii | mark | sel | none | ✅🆕 | span 内选区替换 |
| R9 | mid | cjk | none | sel | none | ✅🆕 | CJK 选区替换 |
| R10 | mid | emoji | none | sel | none | ✅🆕 | 选区含 emoji 替换 |
| R11 | mid | ascii | none | sel | undo | ✅🆕 | 单选区替换后 undo |

### Op = paste 粘贴多行

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| P1 | mid | multi | none | single | none | ✅ | flow:光标处粘贴两行 |
| P2 | lineEnd | multi | none | single | none | ✅ | flow:行末粘贴三行 |
| P3 | mid | multi | none | single | none(midDoc) | ✅ | flow:多行文档中间粘贴 |
| P4 | empty | multi | none | single | none | ✅ | edge:空文档粘贴多行 |
| P5 | mid | multi | none | single | undo | ✅ | edge:粘贴多行后 undo |
| P6 | mid | multi | none | sel | none | ✅🆕 | 选区上粘贴多行(先删后插) |
| P7 | mid | multi | mark | single | none | ✅🆕 | span 行内粘贴多行 |
| P8 | mid | cjk | none | single | none | ✅🆕 | 粘贴含 CJK 多行 |

### Op = ime 输入法

| # | Loc | Content | Deco | Caret | Then | 状态 | 归属 |
|---|---|---|---|---|---|---|---|
| M1 | mid | cjk | none | single | none | ✅ | flow:单段 ni→你 |
| M2 | mid | cjk | none | single | none(多段) | ✅ | flow:多段连续选词 |
| M3 | mid | cjk | none | single | none(midText) | ✅ | flow:已有文本中间落字 |
| M4 | mid | empty | none | single | none | ✅ | edge:IME 落定空(取消) |
| M5 | lineEnd | cjk | none | single | retype | ✅ | edge:IME 后紧接普通输入 |
| M6 | mid | cjk | mark | single | none | ✅🆕 | span 行内 IME 落字 |
| M7 | mid | cjk | none | single | undo | ✅🆕 | IME 落定后 undo |
| M8 | empty | cjk | none | single | none | ✅🆕 | 空行上 IME 落字 |

## 附录:6 维外的缺功能格(⛔ 留空,需先实现功能)

| 能力 | 现状 | 需先做 |
|---|---|---|
| 拖拽 drop 输入 | ✅ 有 drop/dragover handler(clipboard.ts,纯文本落主选区,防原生 HTML 破双射) | 单测 `input-clipboard.test.ts` |
| 块级 widget 输入 | ✅ 物化 + 零长 widget 旁 dispatch / pos 双射 | DOM 输入绕行未钉（活页） |
| line 行装饰下输入 | ✅ 行内输入后 line class 仍在 | |
| replace 折叠区【内】落点 | ⛔ 折叠原子,内部无落点(设计如此) | 非 bug,契约即贴边界 |
| ~~replace 折叠区【旁】输入~~ | ✅ 已修(原 ⛔ 读路径未 widget-aware) | DOMReader 撞 widget 从 doc 切隐藏原文 |

## 补测结果

全部待补格已补入 `input-matrix.test.ts`(24 格,编号对应表格 #),全绿:
- insert: I10,I15,I16,I18 (I11/I12 折叠输入落 input-fold 系列)
- delete: D3,D4,D7,D8
- enter: E6,E8,E9
- bksp: B5,B6,B7
- replace: R8,R9,R10,R11
- paste: P6,P7,P8
- ime: M6,M7,M8

**副产物(补测暴露的 harness 真缺陷,已修)**:harness 的 `typeText`/`deleteText`/`replaceSelection`/`imeCompose`
原来只改「行首个文本节点」(单 span 假设)。多 span 行(mark 高亮把行切成多个 `<span>`)下,落点在非首 span 时
改错节点 → DOM 与预期不符。加 `textNodeAt`/`allText` 让这些原语按行内偏移定位到承载落点的**那个** span 文本节点。
这不是 lite-monaco bug,是测试地基自身的隐藏 bug,修掉后一整类 mark×op 组合格才可测。

补测原则:每格先跑复现(可能抓出真 bug,如折叠系列),区外精确双射、区内贴边界。
