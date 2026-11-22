# 浏览器差分报告(真 Monaco 0.55.1 vs lite-monaco)

> 自动生成:`node run.mjs`。Chrome headless,Menlo 14px/行高 20,同一份场景脚本跑两边,比对 Monaco 公共 API 的几何值和少量 DOM 探针。数值默认容差 1px。

场景 338,完全一致 232,有差异 106。

| 分类 | 条数 |
|---|---|
| 未分类 | 10 |
| 有意不同 | 253 |
| monaco怪 | 56 |
| bug | 34 |

## 10-wrap/cjk-emoji-url

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `734` | `732` | 未分类 |
| `a.content.width` | `734` | `709` | 有意不同: 折行宽度随断点走:URL/emoji/keep-all 的断点由 Chrome 决定,见 domBreaks |
| `a.domBreaks.5.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.6.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.7.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.8.1` | `"emoji😀emoji😀emoji😀emoji😀"` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |

## 10-wrap/wordBreak-keepAll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `734` | `732` | 未分类 |
| `a.content.width` | `734` | `709` | 有意不同: 折行宽度随断点走:URL/emoji/keep-all 的断点由 Chrome 决定,见 domBreaks |
| `a.domBreaks.5.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.6.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"i😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji�` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.7.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"moji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emo` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.8.1` | `"emoji😀emoji😀emoji😀emoji😀"` | `"😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |

## 20-long/line-10k-wrap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,5000.left` | `67` | `431` | monaco怪: Monaco 对视口外(没渲染)的折行行给 left=行首,lite 给真实位置 |
| `a.pos.1,10001.left` | `67` | `102` | monaco怪: Monaco 对视口外(没渲染)的折行行给 left=行首,lite 给真实位置 |

## 20-long/many-lines-5000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `165` | `182` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 20-long/padding

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `72` | `81` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 20-long/scrollbar-sizes

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `896` | `4270` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `896` | `4270` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 20-long/scrollbar-hidden

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `890` | `4264` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `890` | `4264` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 30-whitespace/fontFamily-serif

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.layout.lineNumbersWidth` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `a.layout.decorationsLeft` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `a.layout.contentLeft` | `69` | `57` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `a.layout.contentWidth` | `731` | `743` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `a.scroll.width` | `731` | `743` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `163` | `192` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.pos.1,2.left` | `76` | `64` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.1,3.left` | `86` | `71` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.1,4.left` | `94` | `78` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.1,7.left` | `107` | `91` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.2,3.left` | `96` | `84` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.3,5.left` | `83` | `71` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.4,3.left` | `81` | `69` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |
| `a.pos.4,6.left` | `103` | `91` | monaco怪: 比例字体:gutter 宽差 12px(见 layout.*)平移了全部 left,其余是字宽度量方式不同 |

## 30-whitespace/guides-count

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.count.guides` | `15` | `9` | 有意不同: 缩进参考线:选择器不同(Monaco .cigr,lite 另一套),数量口径不同 |

## 40-cjk-emoji/cjk-wrap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `504` | `507` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 50-keys/pagedown-pageup

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 50-keys/type-over-selection-multi

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.cursorRect.0.0` | `75` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.1.0` | `75` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.2.0` | `75` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.selRects.0` | `[0,76,85]` | `undefined` | 未分类 |
| `end.selRects.1` | `[1,76,85]` | `undefined` | 未分类 |
| `end.selRects.2` | `[2,76,85]` | `undefined` | 未分类 |
| `end.selHeights.0` | `19` | `undefined` | 未分类 |
| `end.value` | `"a1\na2\na3"` | `"aZ\naZ\naZ"` | 未分类 |

## 50-keys/goto-line-f1

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `81` | `73` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 60-mouse/wheel-scroll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0` | `[0,0,0]` | `undefined` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 60-mouse/wheel-fast-sensitivity

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0` | `[0,0,0]` | `undefined` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 60-mouse/wheel-smooth-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0` | `[0,0,0]` | `undefined` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 61-selection/big-select-all-10k

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.selRects.20` | `undefined` | `[20,68,154]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.21` | `undefined` | `[21,68,213]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.22` | `undefined` | `[22,68,272]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.23` | `undefined` | `[23,68,331]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.24` | `undefined` | `[24,68,390]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.25` | `undefined` | `[25,68,449]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.26` | `undefined` | `[26,68,498]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |
| `a.selRects.27` | `undefined` | `[27,68,154]` | 有意不同: lite 视口比可见区多渲染几行(overscan),选区框也多画这几行;可见的前 20 行逐行一致 |

## 70-structure/fold-all

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `179` | `208` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 70-structure/fold-level-2

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `199` | `208` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 70-structure/fold-cursor-inside-moves

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `179` | `208` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 70-structure/fold-visible-ranges

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `179` | `208` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 70-structure/viewzone-basic

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.rects.0.2` | `732` | `718` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 70-structure/viewzone-lines-offset

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.rects.0.2` | `732` | `718` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `end.rects.1.2` | `732` | `718` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `end.rects.2.2` | `732` | `718` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `end.rects.3.2` | `732` | `718` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 80-decorations/whole-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.rects.0.2` | `732` | `718` | 有意不同: 整行装饰框宽。已实测根因(第四轮·块A):Monaco 的 .cdr 是铺满 lines-content(宽 = scrollWidth,含竖条 14px)的绝对定位 div,竖条是盖在上面的浮层,所以整行底色画到编辑器右缘;lite 的竖条是 .cm-scroller 旁边的一列(flex 兄弟,scroller 718、竖条 786–800),整行类挂在 .cm-line 上,画到 scroller 右缘为止,右边留 14px 没有底色(截图可见)。要对齐得把竖条改成浮层并把 scrollDOM.clientWidth 的 15 处用法(折行宽、横向滚动、滚轮、鼠标拖选、reveal)全改成扣竖条,或者把整行装饰改成独立的全宽层(会丢掉 .cm-line 上的类);影响面大于 14px 的观感,没做 |
| `a.rects.1.2` | `732` | `718` | 有意不同: 整行装饰框宽。已实测根因(第四轮·块A):Monaco 的 .cdr 是铺满 lines-content(宽 = scrollWidth,含竖条 14px)的绝对定位 div,竖条是盖在上面的浮层,所以整行底色画到编辑器右缘;lite 的竖条是 .cm-scroller 旁边的一列(flex 兄弟,scroller 718、竖条 786–800),整行类挂在 .cm-line 上,画到 scroller 右缘为止,右边留 14px 没有底色(截图可见)。要对齐得把竖条改成浮层并把 scrollDOM.clientWidth 的 15 处用法(折行宽、横向滚动、滚轮、鼠标拖选、reveal)全改成扣竖条,或者把整行装饰改成独立的全宽层(会丢掉 .cm-line 上的类);影响面大于 14px 的观感,没做 |

## 80-decorations/before-after

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.2,6.left` | `127` | `110` | 有意不同: 光标在 ::before 伪元素内容的前(lite)还是后(Monaco):同一个文本边界两种画法 |

## 80-decorations/content-widget

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.rects.0.1` | `20` | `21.5` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.0.2` | `15.17` | `8.43` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 80-decorations/content-widget-above-below

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.rects.0.1` | `24` | `25.5` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.0.2` | `43.72` | `42.17` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.1.1` | `60` | `58.5` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 84-sel-perf/perf-10000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `perf.eval.selectAll` | `1` | `5` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.shrink` | `0` | `2` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.extend` | `0` | `3` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |

## 84-sel-perf/perf-50000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `perf.eval.selectAll` | `1` | `4` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.extend` | `0` | `4` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |

## 85-rtl/dom-mixed-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `dom.eval.4.0` | `"<rtl>שלום עולם   x"` | `"<rtl>שלום עולם x"` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.4,3.left` | `161` | `85` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,1.left` | `169` | `186` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,2.left` | `177` | `194` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,3.left` | `186` | `177` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,4.left` | `194` | `177` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.glyphs.6.0.1` | `169` | `186` | 未分类 |
| `a.glyphs.6.1.1` | `186` | `169` | 未分类 |

## 85-rtl/dom-ts-tokens

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,11.left` | `245` | `152` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.1,22.left` | `245` | `152` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.1,27.left` | `422` | `287` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.2,24.left` | `472` | `262` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |

## 85-rtl/dom-json-hebrew-keys

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,3.left` | `177` | `85` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.1,14.left` | `177` | `85` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.1,16.left` | `320` | `194` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.1,31.left` | `320` | `194` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |

## 85-rtl/keys-mixed-shift

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k10_Shift+Home.selRects.0.2` | `262` | `236` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k11_Shift+ArrowLeft.selRects.0.2` | `262` | `236` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/keys-niqqud

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k05_Shift+ArrowRight.selRects.0.1` | `68` | `76` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/keys-rtl-marks

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k01_ArrowRight.sel.0.1` | `3` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k01_ArrowRight.sel.0.3` | `3` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k01_ArrowRight.cursorRect.0.0` | `143` | `371` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k02_ArrowRight.sel.0.1` | `4` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k02_ArrowRight.sel.0.3` | `4` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k02_ArrowRight.cursorRect.0.0` | `151` | `371` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k03_ArrowRight.sel.0.1` | `5` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k03_ArrowRight.sel.0.3` | `5` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k03_ArrowRight.cursorRect.0.0` | `219` | `371` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k04_ArrowRight.sel.0.1` | `6` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k04_ArrowRight.sel.0.3` | `6` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k04_ArrowRight.cursorRect.0.0` | `227` | `371` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k05_ArrowRight.sel.0.1` | `7` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k05_ArrowRight.sel.0.3` | `7` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k05_ArrowRight.cursorRect.0.0` | `295` | `371` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k06_Shift+End.sel.0.1` | `7` | `18` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k06_Shift+End.selRects.0` | `[0,296,448]` | `undefined` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `k06_Shift+End.selHeights.0` | `20` | `undefined` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/wrap-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `311` | `313` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `c.cursorRect.0.0` | `68` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `c.selRects.2.1` | `68` | `66` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/deco-inline-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,1.left` | `68` | `236` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,2.left` | `76` | `245` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,3.left` | `177` | `253` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,4.left` | `186` | `262` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,5.left` | `169` | `228` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,6.left` | `161` | `219` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,7.left` | `152` | `211` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,8.left` | `144` | `203` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,9.left` | `135` | `194` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,10.left` | `127` | `186` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,11.left` | `119` | `177` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,12.left` | `110` | `169` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,13.left` | `102` | `161` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,14.left` | `93` | `152` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,15.left` | `262` | `144` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,16.left` | `253` | `135` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,17.left` | `245` | `127` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,18.left` | `236` | `119` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,19.left` | `228` | `110` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,20.left` | `220` | `102` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,21.left` | `211` | `93` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,22.left` | `194` | `76` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,23.left` | `203` | `85` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,24.left` | `211` | `93` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.rects.0.0` | `84.87` | `143.73` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.rects.0.2` | `100.93` | `117.8` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |

## 85-rtl/selection-box-ranges

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.selRects.0.2` | `245` | `270` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/tab-and-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `dom.eval.0.0` | `"    "` | `" "` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `dom.eval.0.1` | `"<rtl>שלום עולם   مرحبا بالعالم   |"` | `"<rtl>שלום עולם مرحبا بالعالم |"` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |
| `a.pos.1,2.left` | `346` | `102` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 86-grapheme/shift-devanagari

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k00_Shift+ArrowRight.cursorRect.0.0` | `68` | `81` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k00_Shift+ArrowRight.selRects.0.2` | `68` | `82` | 未分类 |

## 86-grapheme/drag-over-flag

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.cursorRect.0.0` | `75` | `94` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 90-layout/minimap-default

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-scale-2

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-left

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-maxColumn-60

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `672` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-no-chars

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-size-fill

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-size-fit

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-small-width

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-many-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `72` | `90` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `774` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-relative

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-interval

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbersMinChars-2

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `757` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbersMinChars-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `707` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/glyphMargin-on

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `712` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/folding-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `748` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/folding-off-no-numbers

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `790` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineDecorationsWidth-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `712` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineDecorationsWidth-2ch

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `726` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/showFoldingControls-always

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/overviewRuler-hidden

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/scrollbar-useShadows-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/stickyScroll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fixedOverflowWidgets

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/roundedSelection-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fontSize-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `563` | `650` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fontSize-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `700` | `2399` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `700` | `2399` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineHeight-1.5-ratio

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/automaticLayout-resize

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1127` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 91-width/40-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `732` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/widest-in-middle-600

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `732` | `4306` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `72` | `4306` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/fontSize-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.content.width` | `563` | `650` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/fontSize-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `700` | `2399` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `700` | `2399` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/minimap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `649` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `774` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/glyphMargin

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `712` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/folding-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `748` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1127` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/fontFamily-serif

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.layout.lineNumbersWidth` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `start.layout.decorationsLeft` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `start.layout.contentLeft` | `69` | `57` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `start.layout.contentWidth` | `731` | `743` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `start.scroll.width` | `731` | `852` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `517` | `852` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `walked.layout.lineNumbersWidth` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `walked.layout.decorationsLeft` | `43` | `31` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `walked.layout.contentLeft` | `69` | `57` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |
| `walked.layout.contentWidth` | `731` | `743` | monaco怪: 比例字体下 Monaco 的 spaceWidth/数字宽取自 canvas measureText,lite 取 DOM 实测 |

## 91-width/tabSize-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.content.width` | `249` | `301` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/padding

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.content.width` | `72` | `81` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/many-lines-400

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.content.width` | `165` | `174` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/scrollbar-sizes

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `896` | `4270` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `896` | `4270` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 96-diff/inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/auto-inline-narrow

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/breakpoint-1200

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/toggle-sbs

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `inline.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `inline.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.gIns` | `3` | `0` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/hide-unchanged

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charDel` | `4` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.hidden` | `8` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.charDel` | `4` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.hidden` | `8` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.text.hid.2` | `"5 hidden lines"` | `"14 hidden lines"` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.4` | `"14 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.5` | `"6 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.6` | `"5 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.7` | `"6 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |

## 96-diff/hide-unchanged-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `1156` | `1100` | bug: 同上(已删除行不折行)叠加折叠条:行内 + 折叠未改区时总高 1156 对 1100,差 56px,没单独拆开 |
| `init.diff.scroll.0.ch` | `1156` | `1100` | bug: 同上(已删除行不折行)叠加折叠条:行内 + 折叠未改区时总高 1156 对 1100,差 56px,没单独拆开 |
| `init.diff.count.lineDel` | `7` | `11` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charDel` | `9` | `13` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `8` | `5` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.hidden` | `8` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.scroll.0.h` | `1156` | `1100` | bug: 同上(已删除行不折行)叠加折叠条:行内 + 折叠未改区时总高 1156 对 1100,差 56px,没单独拆开 |
| `collapsed.diff.scroll.0.ch` | `1156` | `1100` | bug: 同上(已删除行不折行)叠加折叠条:行内 + 折叠未改区时总高 1156 对 1100,差 56px,没单独拆开 |
| `collapsed.diff.count.lineDel` | `7` | `11` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.charDel` | `9` | `13` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.gDel` | `8` | `5` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.count.hidden` | `8` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed.diff.text.hid.0` | `""` | `"14 hidden lines"` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.1` | `""` | `"6 hidden lines"` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.2` | `""` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.3` | `""` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.4` | `"14 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.5` | `"6 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.6` | `"5 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |
| `collapsed.diff.text.hid.7` | `"6 hidden lines"` | `undefined` | 有意不同: .diff-hidden-lines 在 Monaco 是 8 个嵌套节点、lite 是 4 个,同下标取到的不是同一个条,文字(5 / 14 hidden lines)是错位对比;条的个数一致(side-by-side 下 scroll.h 逐项相等) |

## 96-diff/hide-unchanged-expand

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charDel` | `4` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.hidden` | `8` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed-again.diff.count.charIns` | `3` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed-again.diff.count.charDel` | `4` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `collapsed-again.diff.count.hidden` | `8` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/revealFirstDiff

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineIns` | `1` | `3` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charIns` | `1` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gIns` | `1` | `3` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `rev.diff.count.lineIns` | `1` | `3` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `rev.diff.count.charIns` | `1` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `rev.diff.count.gIns` | `1` | `3` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/scroll-sync

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `mod300.diff.count.lineIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.charIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.charDel` | `3` | `5` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.gIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `orig120.diff.count.charIns` | `2` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `orig120.diff.count.charDel` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/scroll-sync-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.lineIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.lineDel` | `7` | `10` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.charIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.charDel` | `9` | `11` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.gIns` | `0` | `2` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `mod300.diff.count.gDel` | `8` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/edit-modified

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `typed.diff.count.charIns` | `4` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `undo.diff.count.charIns` | `4` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/edit-original

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `typed.diff.count.charDel` | `2` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/empty-vs-text

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `2` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/text-vs-empty

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charDel` | `2` | `4` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/wordwrap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineIns` | `9` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.lineDel` | `10` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gIns` | `9` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `10` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.count.lineIns` | `9` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.count.lineDel` | `10` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.count.gIns` | `9` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.count.gDel` | `10` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/wordwrap-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `init.diff.scroll.0.ch` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `init.diff.scroll.1.h` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `init.diff.scroll.1.ch` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `init.diff.count.lineIns` | `5` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gIns` | `5` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.scroll.0.h` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `ww.diff.scroll.0.ch` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `ww.diff.scroll.1.h` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `ww.diff.scroll.1.ch` | `620` | `540` | bug: 行内模式下已删除行不折行:Monaco 的删除行区块(inline-deleted-lines)按修改侧宽度折行,总高 620;lite 的 DeletedLinesWidget 高度固定 lines.length*lineHeight,总高 540。要修得让该 widget 用实测折行高度并随宽度重排,没做 |
| `ww.diff.count.lineIns` | `5` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `ww.diff.count.gIns` | `5` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/char-diff-words

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `4` | `8` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/moved-code

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `1016` | `1020` | 有意不同: 移动检测(experimental.showMoves)关着:Monaco 的 lineIns 为 0 因为它把移动块当成「移动」装饰另画,lite 把同样的行当插入/删除行装饰画;高度差 4px(1016 / 1020)来自一条占位区的取整,未单独拆 |
| `init.diff.scroll.0.ch` | `1016` | `1020` | 有意不同: 移动检测(experimental.showMoves)关着:Monaco 的 lineIns 为 0 因为它把移动块当成「移动」装饰另画,lite 把同样的行当插入/删除行装饰画;高度差 4px(1016 / 1020)来自一条占位区的取整,未单独拆 |
| `init.diff.scroll.1.h` | `1016` | `1020` | 有意不同: 移动检测(experimental.showMoves)关着:Monaco 的 lineIns 为 0 因为它把移动块当成「移动」装饰另画,lite 把同样的行当插入/删除行装饰画;高度差 4px(1016 / 1020)来自一条占位区的取整,未单独拆 |
| `init.diff.scroll.1.ch` | `1016` | `1020` | 有意不同: 移动检测(experimental.showMoves)关着:Monaco 的 lineIns 为 0 因为它把移动块当成「移动」装饰另画,lite 把同样的行当插入/删除行装饰画;高度差 4px(1016 / 1020)来自一条占位区的取整,未单独拆 |
| `init.diff.count.lineIns` | `0` | `10` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charIns` | `0` | `10` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gIns` | `0` | `10` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/sash-drag

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `sash.eval.0` | `483` | `448` | bug: 拖动后分隔条位置 483 对 448(差 35px)。怀疑是对照脚本拖的 sash 节点/坐标换算在两边不同(未验证:没有对着 DOM 查 lite 的 sash 命中区),也可能是 lite 的 sash 拖动有最小宽度夹取;未拆 |

## 96-diff/resize

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `small.diff.layout.0.h` | `400` | `300` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.layout.1.h` | `400` | `300` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.0.h` | `1680` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.0.ch` | `1680` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.1.h` | `1680` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.1.ch` | `1680` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `small.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/ts-lang

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `4` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 97-engines/tab-focus-order

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `tab.eval` | `"TEXTAREA"` | `"DIV"` | 有意不同: 焦点元素:Chromium 里 Monaco 用 EditContext(DIV);Firefox/WebKit 没有 EditContext,Monaco 退回隐藏 textarea,lite 始终是 contenteditable(DIV)。结构性差异,Tab 键行为(进入编辑器、再 Tab 离开)一致 |
