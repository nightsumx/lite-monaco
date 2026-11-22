# 浏览器差分报告(真 Monaco 0.55.1 vs lite-monaco)

> 自动生成:`node run.mjs`。Chrome headless,Menlo 14px/行高 20,同一份场景脚本跑两边,比对 Monaco 公共 API 的几何值和少量 DOM 探针。数值默认容差 1px。

场景 353,完全一致 201,有差异 152。

| 分类 | 条数 |
|---|---|
| 有意不同 | 748 |
| monaco怪 | 66 |
| 未分类 | 295 |

## 10-wrap/cjk-emoji-url

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `722` | `709` | 有意不同: 折行宽度随断点走:URL/emoji/keep-all 的断点由 Chrome 决定,见 domBreaks |
| `a.domBreaks.5.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.6.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.7.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.8.1` | `"emoji😀emoji😀emoji😀emoji😀"` | `"😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.9.1` | `"https://example.com/path/path/path/path/path/path/path/path/path/path/path/path` | `"https://example.com/path/path/path/path/path/path/path/path/path/path/path/path` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.10.1` | `"path/path/path/path/path/path/path/path/path/path/path/path/path/path/path/path` | `"/path/path/path/path/path/path/path/path/path/path/path/path/path/path/path/pat` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.11.1` | `"path/path/"` | `"h/"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |

## 10-wrap/wordBreak-keepAll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `722` | `709` | 有意不同: 折行宽度随断点走:URL/emoji/keep-all 的断点由 Chrome 决定,见 domBreaks |
| `a.domBreaks.5.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.6.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.7.1` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | `"emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀emoji😀em` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.8.1` | `"emoji😀emoji😀emoji😀emoji😀"` | `"😀emoji😀emoji😀emoji😀emoji😀emoji😀"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.9.1` | `"https://example.com/path/path/path/path/path/path/path/path/path/path/path/path` | `"https://example.com/path/path/path/path/path/path/path/path/path/path/path/path` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.10.1` | `"path/path/path/path/path/path/path/path/path/path/path/path/path/path/path/path` | `"/path/path/path/path/path/path/path/path/path/path/path/path/path/path/path/pat` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |
| `a.domBreaks.11.1` | `"path/path/"` | `"h/"` | 有意不同: 折行 DOM 断点:CJK/emoji/URL 的可断点由 Chrome 的断行规则决定(lite 让浏览器按像素折),Monaco 按列数自己断;emoji 实际字宽也不是 2 列 |

## 20-long/line-10k-chars

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `right.pos.1,10001.left` | `753` | `751` | monaco怪: 已实测(改 stopRenderingLineAfter 不影响,不是截断):Monaco 的 FastRenderedViewLine 对等宽 ASCII 行用 charWidth×列 算光标位置,charWidth 是 offsetWidth 取整后的 8.4296875(Chrome 真实字宽 8.4287);lite 读真 DOM Range。每字 0.001px,1 万字到 2px;Monaco 自己的 DOM Range 与它的 API 值也差这么多。lite 的值更贴实际字形,不跟 |

## 20-long/line-10k-wrap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,5000.left` | `67` | `430` | monaco怪: Monaco 对视口外(没渲染)的折行行给 left=行首,lite 给真实位置 |
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
| `a.scroll.width` | `896` | `4268` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `896` | `4268` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 20-long/scrollbar-hidden

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `890` | `4262` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `890` | `4262` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

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
| `a.content.width` | `504` | `506` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 50-keys/pagedown-pageup

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 50-keys/goto-line-f1

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `81` | `73` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 50-keys/ime-compose

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `mid.sel.0.1` | `8` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `mid.sel.0.3` | `8` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `mid.value` | `"abnihao"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 50-keys/ime-compose-in-middle-wrapped

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `mid.sel.0.1` | `71` | `67` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `mid.sel.0.3` | `71` | `67` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `mid.value` | `"lorem ipsum dolor sit amet lorem ipsum dolor sit amet lorem ipsum zhondolor sit` | `"lorem ipsum dolor sit amet lorem ipsum dolor sit amet lorem ipsum dolor sit ame` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `end.cursorRect.0.0` | `68` | `359` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.0.1` | `40` | `20` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 60-mouse/wheel-scroll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0.0` | `0` | `68` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.0.1` | `0` | `-50` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.0.2` | `0` | `20` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 60-mouse/wheel-fast-sensitivity

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0` | `[0,0,0]` | `undefined` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 60-mouse/wheel-smooth-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `end.content.width` | `106` | `115` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `end.cursorRect.0.0` | `0` | `68` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.0.1` | `0` | `-50` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.cursorRect.0.2` | `0` | `20` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

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
| `a.rects.0.1` | `20` | `22` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.0.2` | `15.17` | `8.44` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.0.3` | `18` | `20` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 80-decorations/content-widget-above-below

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.rects.0.1` | `24` | `26` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.0.2` | `43.73` | `42.16` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |
| `a.rects.1.1` | `60` | `58` | 有意不同: 已实测成因(之前写的「含滚动条」不对):Monaco 的 content widget 不继承编辑器字体(取页面的 16px 系统字体、line-height:normal → 框 15.17×18),lite 的挂在编辑器 dom 里继承 Menlo 14px/20px(8.44×20)。宿主挂件想要编辑器字体的在 Monaco 里本来就得自己设,所以没改:改了会动 lite 自己的补全/hover 挂件的继承字体。右角 overlay widget 的右偏移已对齐(2×竖条+minimap,有单测) |

## 84-sel-perf/perf-10000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `perf.eval.selectAll` | `1.3` | `2.6` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |

## 84-sel-perf/perf-50000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `perf.eval.selectAll` | `5.9` | `2` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.selectAll2` | `5.6` | `1` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.extend` | `5.6` | `1.9` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.afterScroll` | `5.6` | `0.9` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |

## 85-rtl/dom-mixed-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `dom.eval.4.0` | `"<rtl>שלום עולם   x"` | `"<rtl>שלום עולם x"` | 未分类 |
| `a.pos.4,3.left` | `160` | `85` | 未分类 |
| `a.pos.5,11.left` | `68` | `76` | 未分类 |
| `a.pos.6,1.left` | `169` | `186` | 未分类 |
| `a.pos.6,2.left` | `177` | `186` | 未分类 |
| `a.pos.6,3.left` | `186` | `169` | 未分类 |
| `a.glyphs.6.0.1` | `169` | `186` | 未分类 |
| `a.glyphs.6.1.1` | `186` | `169` | 未分类 |

## 85-rtl/dom-ts-tokens

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,11.left` | `245` | `152` | 未分类 |
| `a.pos.1,22.left` | `245` | `152` | 未分类 |
| `a.pos.1,27.left` | `422` | `287` | 未分类 |
| `a.pos.2,24.left` | `472` | `262` | 未分类 |

## 85-rtl/dom-json-hebrew-keys

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,3.left` | `177` | `85` | 未分类 |
| `a.pos.1,14.left` | `177` | `85` | 未分类 |
| `a.pos.1,16.left` | `320` | `194` | 未分类 |
| `a.pos.1,31.left` | `320` | `194` | 未分类 |

## 85-rtl/keys-mixed-shift

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k10_Shift+Home.selRects.0.2` | `262` | `236` | 未分类 |
| `k11_Shift+ArrowLeft.selRects.0.2` | `262` | `236` | 未分类 |

## 85-rtl/keys-niqqud

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k04_Shift+ArrowRight.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k05_Shift+ArrowRight.selRects.0.1` | `68` | `76` | 未分类 |

## 85-rtl/keys-rtl-marks

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k06_Shift+End.cursorRect.0.0` | `371` | `295` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 85-rtl/wrap-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `c.cursorRect.0.0` | `68` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `c.selRects.2.1` | `68` | `66` | 未分类 |

## 85-rtl/deco-inline-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,1.left` | `68` | `236` | 未分类 |
| `a.pos.1,2.left` | `76` | `245` | 未分类 |
| `a.pos.1,3.left` | `177` | `253` | 未分类 |
| `a.pos.1,4.left` | `177` | `236` | 未分类 |
| `a.pos.1,5.left` | `169` | `228` | 未分类 |
| `a.pos.1,6.left` | `161` | `219` | 未分类 |
| `a.pos.1,7.left` | `152` | `211` | 未分类 |
| `a.pos.1,8.left` | `144` | `203` | 未分类 |
| `a.pos.1,9.left` | `135` | `194` | 未分类 |
| `a.pos.1,10.left` | `127` | `186` | 未分类 |
| `a.pos.1,11.left` | `118` | `177` | 未分类 |
| `a.pos.1,12.left` | `110` | `169` | 未分类 |
| `a.pos.1,13.left` | `102` | `161` | 未分类 |
| `a.pos.1,14.left` | `93` | `152` | 未分类 |
| `a.pos.1,15.left` | `262` | `144` | 未分类 |
| `a.pos.1,16.left` | `253` | `135` | 未分类 |
| `a.pos.1,17.left` | `245` | `127` | 未分类 |
| `a.pos.1,18.left` | `236` | `119` | 未分类 |
| `a.pos.1,19.left` | `228` | `110` | 未分类 |
| `a.pos.1,20.left` | `220` | `102` | 未分类 |
| `a.pos.1,21.left` | `186` | `68` | 未分类 |
| `a.pos.1,22.left` | `194` | `76` | 未分类 |
| `a.pos.1,23.left` | `203` | `85` | 未分类 |
| `a.pos.1,24.left` | `211` | `93` | 未分类 |
| `a.rects.0.0` | `84.86` | `143.73` | 未分类 |
| `a.rects.0.2` | `100.94` | `117.8` | 未分类 |

## 85-rtl/selection-box-ranges

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.selRects.0.2` | `245` | `270` | 未分类 |

## 85-rtl/tab-and-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `dom.eval.0.0` | `"    "` | `" "` | 未分类 |
| `dom.eval.0.1` | `"<rtl>שלום עולם   مرحبا بالعالم   |"` | `"<rtl>שלום עולם مرحبا بالعالم |"` | 未分类 |
| `a.pos.1,2.left` | `346` | `102` | 未分类 |

## 86-grapheme/right-hangul

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k00_ArrowRight.sel.0.1` | `4` | `2` | 未分类 |
| `k00_ArrowRight.sel.0.3` | `4` | `2` | 未分类 |
| `k00_ArrowRight.cursorRect.0.0` | `79` | `68` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k01_ArrowRight.sel.0.1` | `5` | `3` | 未分类 |
| `k01_ArrowRight.sel.0.3` | `5` | `3` | 未分类 |
| `k01_ArrowRight.cursorRect.0.0` | `91` | `68` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k02_ArrowRight.sel.0.1` | `6` | `4` | 未分类 |
| `k02_ArrowRight.sel.0.3` | `6` | `4` | 未分类 |
| `k02_ArrowRight.cursorRect.0.0` | `100` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k03_ArrowRight.sel.0.1` | `7` | `5` | 未分类 |
| `k03_ArrowRight.sel.0.3` | `7` | `5` | 未分类 |
| `k03_ArrowRight.cursorRect.0.0` | `112` | `91` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k04_ArrowRight.cursorRect.0.0` | `112` | `100` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 86-grapheme/left-hangul

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k04_ArrowLeft.sel.0.1` | `1` | `3` | 未分类 |
| `k04_ArrowLeft.sel.0.3` | `1` | `3` | 未分类 |

## 86-grapheme/shift-hangul

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k00_Shift+ArrowRight.sel.0.3` | `4` | `2` | 未分类 |
| `k01_Shift+ArrowRight.sel.0.3` | `5` | `3` | 未分类 |
| `k01_Shift+ArrowRight.cursorRect.0.0` | `91` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k01_Shift+ArrowRight.selRects.0.2` | `92` | `80` | 未分类 |
| `k02_Shift+ArrowRight.sel.0.3` | `6` | `4` | 未分类 |
| `k02_Shift+ArrowRight.cursorRect.0.0` | `100` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k02_Shift+ArrowRight.selRects.0.2` | `101` | `80` | 未分类 |
| `k03_Shift+ArrowRight.sel.0.3` | `7` | `5` | 未分类 |
| `k03_Shift+ArrowRight.cursorRect.0.0` | `112` | `91` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k03_Shift+ArrowRight.selRects.0.2` | `113` | `92` | 未分类 |
| `k04_Shift+ArrowLeft.sel.0.3` | `6` | `4` | 未分类 |
| `k04_Shift+ArrowLeft.cursorRect.0.0` | `100` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k04_Shift+ArrowLeft.selRects.0.2` | `101` | `80` | 未分类 |

## 86-grapheme/bksp-hangul

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k04_ArrowLeft.sel.0.1` | `1` | `3` | 未分类 |
| `k04_ArrowLeft.sel.0.3` | `1` | `3` | 未分类 |
| `k05_Backspace.cursorRect.0.0` | `68` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k05_Backspace.value` | `"한"` | `"ᄒᆫ"` | 未分类 |

## 86-grapheme/del-hangul

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k00_Delete.value` | `"한 각"` | `"ᅡᆫ한 각"` | 未分类 |
| `k01_Delete.value` | `" 각"` | `"ᆫ한 각"` | 未分类 |
| `k02_ArrowRight.cursorRect.0.0` | `75` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k02_ArrowRight.value` | `" 각"` | `"ᆫ한 각"` | 未分类 |
| `k03_Delete.cursorRect.0.0` | `75` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k03_Delete.value` | `" "` | `"ᆫ 각"` | 未分类 |
| `k04_Delete.cursorRect.0.0` | `75` | `79` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k04_Delete.value` | `" "` | `"ᆫ각"` | 未分类 |

## 86-grapheme/shift-devanagari

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k00_Shift+ArrowRight.cursorRect.0.0` | `68` | `81` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k00_Shift+ArrowRight.selRects.0.2` | `68` | `82` | 未分类 |

## 86-grapheme/drag-over-flag

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.cursorRect.0.0` | `75` | `93` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 87-ime/start-update-commit

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 未分类 |
| `s01_imeSet.value` | `"abn"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abn"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.1` | `6` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.3` | `6` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"abnih"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"abnih"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.value` | `"ab你好"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.eval.ev.4` | `"chg:2:3:你好"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeSet.eval.act` | `""` | `"ab你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.1` | `"chg:2:0:n"` | `"chg:2:0:你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.2` | `"chg:2:1:ni"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.4` | `"chg:2:3:你好"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.5` | `"chg:2:2:你好"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s05_imeCommit.eval.act` | `""` | `"ab你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/cancel

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 未分类 |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `6` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `6` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"abnih"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"abnih"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.ev.4` | `"chg:2:3:"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCancel.eval.act` | `""` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/cancel-then-type

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 未分类 |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.3` | `"chg:2:2:"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.act` | `""` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_type.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 未分类 |
| `s03_type.eval.ev.2` | `"chg:3:0:i"` | `"chg:2:0:x"` | 未分类 |
| `s03_type.eval.ev.3` | `"chg:2:2:"` | `undefined` | 未分类 |
| `s03_type.eval.ev.4` | `"end"` | `undefined` | 未分类 |
| `s03_type.eval.ev.5` | `"chg:2:0:x"` | `undefined` | 未分类 |
| `s03_type.eval.act` | `""` | `"abx"` | 未分类 |

## 87-ime/replace-selection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"hello world"` | 未分类 |
| `s01_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `3` | `6` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"ni world"` | `"hello world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"ni world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `2` | `6` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"你 world"` | `"hello world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"你 world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:0:5:n"` | `"chg:0:5:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"chg:0:1:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"你 world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/replace-selection-cancel

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"hello world"` | 未分类 |
| `s01_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `3` | `6` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"ni world"` | `"hello world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"ni world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.1` | `"chg:0:5:n"` | `"chg:0:5:"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.3` | `"chg:0:2:"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCancel.eval.act` | `""` | `" world"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/inner-selection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 未分类 |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abnihao"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:nihao"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abnihao"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `8` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `8` | `3` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.cursorRect.0.0` | `126` | `118` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_imeSet.value` | `"abnihao"` | `"ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:nihao"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:2:5:nihao"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"abnihao"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:2:0:nihao"` | `"chg:2:0:你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:2:5:nihao"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:2:5:你好"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"ab你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/middle-of-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 未分类 |
| `s01_imeSet.value` | `"abcdzef"` | `"abcdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcdzef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `7` | `5` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `7` | `5` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"abcdzhef"` | `"abcdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:4:1:zh"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"abcdzhef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"abcd中ef"` | `"abcdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:4:1:zh"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:4:2:中"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"abcd中ef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.1` | `"chg:4:0:z"` | `"chg:4:0:中"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.2` | `"chg:4:1:zh"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.3` | `"chg:4:2:中"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.4` | `"chg:4:1:中"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.act` | `""` | `"abcd中ef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/empty-doc

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_imeSet.value` | `"a"` | `""` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.eval.act` | `""` | `"a"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"あ"` | `""` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:0:1:あ"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"あ"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"あい"` | `""` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:0:1:あ"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.3` | `"chg:0:1:あい"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"あい"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:0:0:a"` | `"chg:0:0:あい"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:0:1:あ"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:0:1:あい"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"chg:0:2:あい"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"あい"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/second-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"onetwothree"` | 未分类 |
| `s01_imeSet.value` | `"one\ntwox\nthree"` | `"one\ntwo\nthree"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:7:0:x"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"onetwoxthree"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"one\ntwoxy\nthree"` | `"one\ntwo\nthree"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:7:0:x"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:7:1:xy"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"onetwoxythree"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:7:0:x"` | `"chg:7:0:漢"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:7:1:xy"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:7:2:漢"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"onetwo漢three"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/two-rounds

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.sel.0.3` | `3` | `1` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.value` | `"ni"` | `""` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.eval.ev.1` | `"chg:0:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s00_imeSet.eval.act` | `""` | `"ni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeCommit.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeCommit.eval.act` | `""` | `"你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"你hao"` | `"你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.3` | `"chg:0:2:你"` | `"start"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.5` | `"start"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.6` | `"chg:1:0:h"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.7` | `"chg:2:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.8` | `"chg:3:0:o"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"你hao"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `"start"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `"chg:1:0:好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.5` | `"start"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.6` | `"chg:1:0:h"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.7` | `"chg:2:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.8` | `"chg:3:0:o"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.9` | `"chg:1:3:好"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.10` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"你好"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/click-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdefghi"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni\ndef\nghi"` | `"abc\ndef\nghi"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_click.sel.0.1` | `2` | `4` | 未分类 |
| `s02_click.sel.0.3` | `2` | `4` | 未分类 |
| `s02_click.cursorRect.0.0` | `75` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_click.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 未分类 |
| `s02_click.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_click.eval.act` | `""` | `"abcnidefghi"` | 未分类 |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:13:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:11:2:hi你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"abcnidefghi你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/click-during-then-update

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdefghi"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni\ndef\nghi"` | `"abc\ndef\nghi"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_click.sel.0.1` | `2` | `4` | 未分类 |
| `s02_click.sel.0.3` | `2` | `4` | 未分类 |
| `s02_click.cursorRect.0.0` | `75` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_click.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 未分类 |
| `s02_click.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_click.eval.act` | `""` | `"abcnidefghi"` | 未分类 |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"abcni\ndef\nghinih"` | `"abcni\ndef\nghi"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:4:0:i"` | `"start"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:11:2:hinih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"abcnidefghinih"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/esc-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_keys.sel.0.1` | `6` | `4` | 未分类 |
| `s02_keys.sel.0.3` | `6` | `4` | 未分类 |
| `s02_keys.value` | `"abcni"` | `"abc"` | 未分类 |
| `s02_keys.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 未分类 |
| `s02_keys.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_keys.eval.act` | `""` | `"abcni"` | 未分类 |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:3:2:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"abc你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/blur-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_blur.eval.ev.1` | `"chg:3:0:n"` | `"end"` | 未分类 |
| `s02_blur.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:ni"` | 未分类 |
| `s02_blur.eval.ev.3` | `"end"` | `undefined` | 未分类 |
| `s02_blur.eval.act` | `"\n1abcni\n\n\nCannot edit in read-only editorCursor added: line 3 column 1"` | `"\n1abcnixxxxxxxxxxLine 1, column 6\n\n\n"` | 未分类 |

## 87-ime/blur-during-refocus

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_blur.eval.ev.1` | `"chg:3:0:n"` | `"end"` | 未分类 |
| `s02_blur.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:ni"` | 未分类 |
| `s02_blur.eval.ev.3` | `"end"` | `undefined` | 未分类 |
| `s02_blur.eval.act` | `"\n1abcni\n\n\nCannot edit in read-only editorCursor added: line 3 column 1"` | `"\n1abcnixxxxxxxxxxLine 1, column 6\n\n\n"` | 未分类 |
| `s03_eval.eval.ev.1` | `"chg:3:0:n"` | `"end"` | 未分类 |
| `s03_eval.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:ni"` | 未分类 |
| `s03_eval.eval.ev.3` | `"end"` | `undefined` | 未分类 |
| `s03_eval.eval.act` | `""` | `"abcni"` | 未分类 |
| `s04_type.eval.ev.1` | `"chg:3:0:n"` | `"end"` | 未分类 |
| `s04_type.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:ni"` | 未分类 |
| `s04_type.eval.ev.3` | `"end"` | `"chg:5:0:x"` | 未分类 |
| `s04_type.eval.ev.4` | `"chg:5:0:x"` | `undefined` | 未分类 |
| `s04_type.eval.act` | `""` | `"abcnix"` | 未分类 |

## 87-ime/external-edit-before

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abc\ndefni"` | `"abc\ndef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:7:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcdefni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_eval.sel.0.1` | `6` | `4` | 未分类 |
| `s02_eval.sel.0.3` | `6` | `4` | 未分类 |
| `s02_eval.value` | `"XXabc\ndefni"` | `"XXabc\ndef"` | 未分类 |
| `s02_eval.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 未分类 |
| `s02_eval.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 未分类 |
| `s02_eval.eval.ev.3` | `"chg:0:0:XX"` | `undefined` | 未分类 |
| `s02_eval.eval.act` | `""` | `"XXabcdefni"` | 未分类 |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"XXabc\ndefnih"` | `"XXabc\ndef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:0:0:XX"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.4` | `"chg:9:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"XXabcdefnih"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.2` | `"chg:8:0:i"` | `"chg:9:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.3` | `"chg:0:0:XX"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.4` | `"chg:9:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.5` | `"chg:9:3:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.act` | `""` | `"XXabcdef你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/external-edit-after

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni\ndef"` | `"abc\ndef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcnidef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_eval.sel.0.1` | `6` | `4` | 未分类 |
| `s02_eval.sel.0.3` | `6` | `4` | 未分类 |
| `s02_eval.value` | `"abcni\nXXdef"` | `"abc\nXXdef"` | 未分类 |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 未分类 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_eval.eval.ev.3` | `"chg:6:0:XX"` | `undefined` | 未分类 |
| `s02_eval.eval.act` | `""` | `"abcniXXdef"` | 未分类 |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"abcnih\nXXdef"` | `"abc\nXXdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:6:0:XX"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.4` | `"chg:3:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"abcnihXXdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.3` | `"chg:6:0:XX"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.4` | `"chg:3:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.5` | `"chg:3:3:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.act` | `""` | `"abc你XXdef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/external-setvalue

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_eval.cursorRect.0.0` | `68` | `151` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `"chg:0:3:replaced"` | 未分类 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_eval.eval.ev.3` | `"chg:0:5:replaced"` | `undefined` | 未分类 |
| `s02_eval.eval.act` | `""` | `"replacedni"` | 未分类 |
| `s03_imeCommit.sel.0.1` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.sel.0.3` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.cursorRect.0.0` | `106` | `81` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s03_imeCommit.value` | `"rep你ced"` | `"你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:0:3:replaced"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:0:8:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:0:5:replaced"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"chg:0:5:rep你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/external-setselection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 未分类 |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"abcni\ndef"` | `"abc\ndef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcnidef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_eval.cursorRect.0.0` | `75` | `109` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.cursorRect.0.1` | `20` | `0` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.value` | `"abcni\ndef"` | `"abc\ndef"` | 未分类 |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 未分类 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 未分类 |
| `s02_eval.eval.act` | `""` | `"abcnidef"` | 未分类 |
| `s03_imeCommit.cursorRect.0.1` | `20` | `0` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s03_imeCommit.value` | `"abcni\ndef你"` | `"abc你\ndef"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:7:2:ef你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"abc你def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/wrapped

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 未分类 |
| `s01_imeSet.sel.0.1` | `28` | `23` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `28` | `23` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.value` | `"lorem ipsum dolor sit zhongamet consectetur adipiscing elit sed do eiusmod"` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:22:0:z"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:23:0:h"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"lorem ipsum dolor sit zhongamet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `25` | `23` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `25` | `23` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:22:0:z"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:23:0:h"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.6` | `"chg:22:5:中文"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:22:0:z"` | `"chg:22:0:中文"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:23:0:h"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.6` | `"chg:22:5:中文"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.7` | `"chg:22:2:中文"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.8` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/rtl-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"שלום עולם"` | 未分类 |
| `s01_imeSet.value` | `"שלום עולםa"` | `"שלום עולם"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:9:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"שלום עולםa"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `12` | `10` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `12` | `10` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"שלום עולםab"` | `"שלום עולם"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:9:0:a"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:9:1:ab"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"שלום עולםab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:9:0:a"` | `"chg:9:0:ab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:9:1:ab"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:9:2:ab"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"שלום עולםab"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/rtl-compose-he

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.value` | `"abcש"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:ש"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"abcש"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.rtl` | `true` | `false` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_imeSet.value` | `"abcשל"` | `"abc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:3:0:ש"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:3:1:של"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"abcשל"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.rtl` | `true` | `false` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:ש"` | `"chg:3:0:של"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:3:1:של"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:3:2:של"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"abcשל"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/multicursor

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.sel.0.1` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.0.3` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.1.1` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.sel.1.3` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.cursorRect.1.0` | `92` | `75` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.value` | `"ani\nb\ncni"` | `"a\nb\nc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:5:0:n|1:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.2` | `"chg:7:0:i|2:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"anibc"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.ev.1` | `"chg:5:0:n|1:0:n"` | `"chg:5:0:你|1:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.ev.2` | `"chg:7:0:i|2:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.ev.3` | `"chg:7:2:你|1:2:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.act` | `""` | `"a你bc你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/readonly

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 未分类 |
| `s01_imeSet.cursorRect.0.0` | `92` | `109` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeCommit.eval.act` | `""` | `"abc你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/zwj-neighbour

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"a👨‍👩‍👧b"` | 未分类 |
| `s01_imeSet.value` | `"a👨‍👩‍👧xb"` | `"a👨‍👩‍👧b"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.ev.1` | `"chg:9:0:x"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s01_imeSet.eval.act` | `""` | `"a👨‍👩‍👧xb"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.1` | `12` | `10` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `12` | `10` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"a👨‍👩‍👧xyb"` | `"a👨‍👩‍👧b"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:9:0:x"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:9:1:xy"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"a👨‍👩‍👧xyb"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.1` | `"chg:9:0:x"` | `"chg:9:0:字"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.2` | `"chg:9:1:xy"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.3` | `"chg:9:2:字"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeCommit.eval.act` | `""` | `"a👨‍👩‍👧字b"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 87-ime/decorations-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"abc def"` | 未分类 |
| `s01_keys.eval.act` | `""` | `"abc def"` | 未分类 |
| `s02_imeSet.sel.0.1` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.sel.0.3` | `4` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.value` | `"anibc def"` | `"abc def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.1` | `"chg:1:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.ev.2` | `"chg:2:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s02_imeSet.eval.act` | `""` | `"anibc def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.1` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.sel.0.3` | `5` | `2` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.value` | `"anihbc def"` | `"abc def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.1` | `"chg:1:0:n"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.2` | `"chg:2:0:i"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.ev.3` | `"chg:1:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s03_imeSet.eval.act` | `""` | `"anihbc def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.1` | `"chg:1:0:n"` | `"chg:1:0:你"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.2` | `"chg:2:0:i"` | `"end"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.3` | `"chg:1:2:nih"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.4` | `"chg:1:3:你"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |
| `s04_imeCommit.eval.act` | `""` | `"a你bc def"` | 有意不同: 组字期间 value:Monaco EditContext 不改 model,lite contenteditable 先改 DOM |

## 90-layout/minimap-default

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-scale-2

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-left

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-maxColumn-60

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `672` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-no-chars

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-size-fill

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-size-fit

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `649` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-small-width

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/minimap-many-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `72` | `90` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `774` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-relative

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbers-interval

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbersMinChars-2

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `757` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineNumbersMinChars-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `707` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/glyphMargin-on

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `712` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/folding-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `748` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/folding-off-no-numbers

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `790` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineDecorationsWidth-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `712` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineDecorationsWidth-2ch

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `726` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/showFoldingControls-always

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/overviewRuler-hidden

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/scrollbar-useShadows-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/stickyScroll

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fixedOverflowWidgets

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/roundedSelection-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fontSize-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.content.width` | `563` | `650` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/fontSize-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `700` | `2398` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `700` | `2398` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/lineHeight-1.5-ratio

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 90-layout/automaticLayout-resize

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.scroll.width` | `732` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |
| `a.content.width` | `620` | `1126` | 有意不同: 同 91-width/start:未滚到的行 Monaco 不计、lite 按字数 × 字宽估(等宽 ASCII)。已逐个场景拆开:minimap / lineNumbers / glyphMargin / folding / fontSize / lineDecorationsWidth 等 90-layout 场景的 scroll.width 差 = content.width 差 + 布局差(0),91-width 的 walked 证明数值本身一致 |

## 91-width/40-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `732` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/widest-in-middle-600

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `732` | `4304` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `72` | `4304` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/fontSize-8

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.content.width` | `563` | `650` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/fontSize-30

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `700` | `2398` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `700` | `2398` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/minimap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `649` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `774` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/glyphMargin

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `712` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 91-width/folding-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `start.scroll.width` | `748` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `620` | `1126` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

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
| `start.content.width` | `249` | `300` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

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
| `start.scroll.width` | `896` | `4268` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |
| `start.content.width` | `896` | `4268` | 有意不同: 还没滚过:Monaco 只计渲染过的行,lite 对等宽 ASCII 行按字数 × 字宽给全文下界(横向滚动条不随竖向滚动漂;滚过全文后两边相等,见 walked) |

## 95-a11y/default

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/accessibilitySupport-on

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/accessibilitySupport-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/ariaLabel

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/ariaRequired

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/readOnly

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.1.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.0.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.1.text` | `""` | `"Cannot edit in read-only editor"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/screenReaderAnnounceInlineSuggestion

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `init.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `init.a11y.lives.0.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `init.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `init.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-move.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-move.a11y.lives.0.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 9"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-move.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-move.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `after-type.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `after-type.a11y.lives.0.text` | `"Cannot edit in read-only editor"` | `""` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `"Line 2, column 10"` | 有意不同: 播报行为差异:lite 光标停 400ms 后会在 polite 区播「Line N, column M」,Monaco 普通模式不播(只在读屏优化模式靠 selectionchange)。去掉会让依赖这条播报的用户少听到东西,所以保留;要关用 a11ySession({announceSelection:false}) |
| `after-type.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `after-type.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 95-a11y/find-replace

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a11y.a11y.active.cls` | `"input empty"` | `"cm-find-input"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `a11y.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | monaco怪: Monaco 的 aria 容器是全页单例,上一个场景(查找)的播报文字会留在里面;harness 每个场景重建编辑器但不清它 |
| `a11y.a11y.roles.presentation` | `21` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.checkbox` | `8` | `5` | 有意不同: DOM 里 role=checkbox 的个数:Monaco 把替换行的「保留大小写」等也画成 checkbox 节点并藏起来;AX 树(见 ax 摘要,0 差异)里读屏看到的 checkbox 两边一致 |

## 95-a11y/palette

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `ax.ax.widgets.0.role` | `"toolbar"` | `"combobox"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.0.name` | `""` | `"Type to narrow down results."` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.1.role` | `"toolbar"` | `"listbox"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.1.name` | `""` | `"Type to narrow down results."` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.2.role` | `"toolbar"` | `"option"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.2.name` | `""` | `"Add await / async"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.3.role` | `"listbox"` | `"option"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.3.name` | `"Type to narrow down results."` | `"Add Braces to Statement"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.5.role` | `"toolbar"` | `"option"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.5.name` | `""` | `"Add Cursor Below, Option+Command+DownArrow"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.6.name` | `"Add Cursor Below, Option+Command+DownArrow"` | `"Add Cursors to Line Ends, Shift+Option+I"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.7.role` | `"toolbar"` | `"option"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.7.name` | `""` | `"Add Line Comment, Command+K Command+C"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |

## 95-a11y/contextmenu

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `ax.ax.widgets.2.role` | `"checkbox"` | `"menuitem"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.2.name` | `""` | `"Cut"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.3.name` | `"Cut"` | `"Copy"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.4.name` | `"Copy"` | `"Paste"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.5.name` | `"Paste"` | `"Command Palette F1"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.6` | `{"role":"checkbox","name":""}` | `undefined` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `ax.ax.widgets.7` | `{"role":"menuitem","name":"Command Palette F1"}` | `undefined` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `a11y.a11y.active.cls` | `"shadow-root-host"` | `"cm-context-menu"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `a11y.a11y.active.attrs.role` | `undefined` | `"menu"` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `a11y.a11y.lives.0.text` | `"No results found"` | `""` | monaco怪: Monaco 的 aria 容器是全页单例,上一个场景(查找)的播报文字会留在里面;harness 每个场景重建编辑器但不清它 |
| `a11y.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | monaco怪: Monaco 的 aria 容器是全页单例,上一个场景(查找)的播报文字会留在里面;harness 每个场景重建编辑器但不清它 |
| `a11y.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.menu` | `undefined` | `1` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `a11y.a11y.roles.menuitem` | `undefined` | `5` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |
| `a11y.a11y.roles.separator` | `undefined` | `2` | 有意不同: 右键菜单:Monaco 的分隔线在 AX 树里是个 role=checkbox(disabled),焦点在 shadow-root 宿主;lite 分隔线是 role=separator,焦点在 role=menu 本身。菜单项的名字(含快捷键)和顺序一致。lite 这边更符合 ARIA |

## 95-a11y/tabFocusMode-alert

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a11y.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `a11y.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `a11y.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 未分类 |
| `a11y.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |

## 96-diff/inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 未分类 |
| `init.diff.count.gDel` | `6` | `1` | 未分类 |

## 96-diff/auto-inline-narrow

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 未分类 |
| `init.diff.count.gDel` | `6` | `1` | 未分类 |

## 96-diff/breakpoint-1200

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 未分类 |
| `init.diff.count.gDel` | `6` | `1` | 未分类 |

## 96-diff/toggle-sbs

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `inline.diff.layout.0.left` | `52` | `72` | 未分类 |
| `inline.diff.layout.0.cw` | `-10` | `-30` | 未分类 |
| `inline.diff.layout.0.gm` | `0` | `20` | 未分类 |
| `inline.diff.count.lineDel` | `5` | `7` | 未分类 |
| `inline.diff.count.gDel` | `6` | `1` | 未分类 |

## 96-diff/lineNumbers-off

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.gIns` | `3` | `0` | 未分类 |

## 96-diff/hide-unchanged

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `3` | `6` | 未分类 |
| `init.diff.count.charDel` | `4` | `7` | 未分类 |
| `init.diff.count.hidden` | `8` | `4` | 未分类 |
| `collapsed.diff.count.charIns` | `3` | `6` | 未分类 |
| `collapsed.diff.count.charDel` | `4` | `7` | 未分类 |
| `collapsed.diff.count.hidden` | `8` | `4` | 未分类 |
| `collapsed.diff.text.hid.2` | `"5 hidden lines"` | `"14 hidden lines"` | 未分类 |
| `collapsed.diff.text.hid.4` | `"14 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.5` | `"6 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.6` | `"5 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.7` | `"6 hidden lines"` | `undefined` | 未分类 |

## 96-diff/hide-unchanged-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `1156` | `1100` | 未分类 |
| `init.diff.scroll.0.ch` | `1156` | `1100` | 未分类 |
| `init.diff.count.lineDel` | `7` | `11` | 未分类 |
| `init.diff.count.charIns` | `3` | `6` | 未分类 |
| `init.diff.count.charDel` | `9` | `13` | 未分类 |
| `init.diff.count.gDel` | `8` | `5` | 未分类 |
| `init.diff.count.hidden` | `8` | `2` | 未分类 |
| `collapsed.diff.scroll.0.h` | `1156` | `1100` | 未分类 |
| `collapsed.diff.scroll.0.ch` | `1156` | `1100` | 未分类 |
| `collapsed.diff.count.lineDel` | `7` | `11` | 未分类 |
| `collapsed.diff.count.charIns` | `3` | `6` | 未分类 |
| `collapsed.diff.count.charDel` | `9` | `13` | 未分类 |
| `collapsed.diff.count.gDel` | `8` | `5` | 未分类 |
| `collapsed.diff.count.hidden` | `8` | `2` | 未分类 |
| `collapsed.diff.text.hid.0` | `""` | `"14 hidden lines"` | 未分类 |
| `collapsed.diff.text.hid.1` | `""` | `"6 hidden lines"` | 未分类 |
| `collapsed.diff.text.hid.2` | `""` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.3` | `""` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.4` | `"14 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.5` | `"6 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.6` | `"5 hidden lines"` | `undefined` | 未分类 |
| `collapsed.diff.text.hid.7` | `"6 hidden lines"` | `undefined` | 未分类 |

## 96-diff/hide-unchanged-expand

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `3` | `6` | 未分类 |
| `init.diff.count.charDel` | `4` | `7` | 未分类 |
| `init.diff.count.hidden` | `8` | `4` | 未分类 |
| `collapsed-again.diff.count.charIns` | `3` | `6` | 未分类 |
| `collapsed-again.diff.count.charDel` | `4` | `7` | 未分类 |
| `collapsed-again.diff.count.hidden` | `8` | `4` | 未分类 |

## 96-diff/revealFirstDiff

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineIns` | `1` | `3` | 未分类 |
| `init.diff.count.charIns` | `1` | `4` | 未分类 |
| `init.diff.count.gIns` | `1` | `3` | 未分类 |
| `rev.diff.count.lineIns` | `1` | `3` | 未分类 |
| `rev.diff.count.charIns` | `1` | `4` | 未分类 |
| `rev.diff.count.gIns` | `1` | `3` | 未分类 |

## 96-diff/scroll-sync

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `mod300.diff.count.lineIns` | `0` | `2` | 未分类 |
| `mod300.diff.count.charIns` | `0` | `2` | 未分类 |
| `mod300.diff.count.charDel` | `3` | `5` | 未分类 |
| `mod300.diff.count.gIns` | `0` | `2` | 未分类 |
| `orig120.diff.count.charIns` | `2` | `4` | 未分类 |
| `orig120.diff.count.charDel` | `0` | `2` | 未分类 |

## 96-diff/scroll-sync-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 未分类 |
| `init.diff.count.gDel` | `6` | `1` | 未分类 |
| `mod300.diff.count.lineIns` | `0` | `2` | 未分类 |
| `mod300.diff.count.lineDel` | `7` | `10` | 未分类 |
| `mod300.diff.count.charIns` | `0` | `2` | 未分类 |
| `mod300.diff.count.charDel` | `9` | `11` | 未分类 |
| `mod300.diff.count.gIns` | `0` | `2` | 未分类 |
| `mod300.diff.count.gDel` | `8` | `4` | 未分类 |

## 96-diff/edit-modified

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `typed.diff.count.charIns` | `4` | `6` | 未分类 |
| `undo.diff.count.charIns` | `4` | `6` | 未分类 |

## 96-diff/edit-original

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `typed.diff.count.charDel` | `2` | `4` | 未分类 |

## 96-diff/empty-vs-text

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `2` | `4` | 未分类 |

## 96-diff/text-vs-empty

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charDel` | `2` | `4` | 未分类 |

## 96-diff/wordwrap

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineIns` | `9` | `1` | 未分类 |
| `init.diff.count.lineDel` | `10` | `1` | 未分类 |
| `init.diff.count.gIns` | `9` | `1` | 未分类 |
| `init.diff.count.gDel` | `10` | `1` | 未分类 |
| `ww.diff.count.lineIns` | `9` | `1` | 未分类 |
| `ww.diff.count.lineDel` | `10` | `1` | 未分类 |
| `ww.diff.count.gIns` | `9` | `1` | 未分类 |
| `ww.diff.count.gDel` | `10` | `1` | 未分类 |

## 96-diff/wordwrap-inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `620` | `460` | 未分类 |
| `init.diff.scroll.0.ch` | `620` | `460` | 未分类 |
| `init.diff.scroll.1.h` | `620` | `540` | 未分类 |
| `init.diff.scroll.1.ch` | `620` | `540` | 未分类 |
| `init.diff.count.lineIns` | `5` | `1` | 未分类 |
| `init.diff.count.gIns` | `5` | `1` | 未分类 |
| `ww.diff.scroll.0.h` | `620` | `460` | 未分类 |
| `ww.diff.scroll.0.ch` | `620` | `460` | 未分类 |
| `ww.diff.scroll.1.h` | `620` | `540` | 未分类 |
| `ww.diff.scroll.1.ch` | `620` | `540` | 未分类 |
| `ww.diff.count.lineIns` | `5` | `1` | 未分类 |
| `ww.diff.count.gIns` | `5` | `1` | 未分类 |

## 96-diff/char-diff-words

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `4` | `8` | 未分类 |

## 96-diff/moved-code

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.scroll.0.h` | `1016` | `1020` | 未分类 |
| `init.diff.scroll.0.ch` | `1016` | `1020` | 未分类 |
| `init.diff.scroll.1.h` | `1016` | `1020` | 未分类 |
| `init.diff.scroll.1.ch` | `1016` | `1020` | 未分类 |
| `init.diff.count.lineIns` | `0` | `10` | 未分类 |
| `init.diff.count.charIns` | `0` | `10` | 未分类 |
| `init.diff.count.gIns` | `0` | `10` | 未分类 |

## 96-diff/sash-drag

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `sash.eval.0` | `483` | `448` | 未分类 |

## 96-diff/resize

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `small.diff.layout.0.left` | `52` | `72` | 未分类 |
| `small.diff.layout.0.h` | `400` | `300` | 未分类 |
| `small.diff.layout.0.cw` | `-10` | `-30` | 未分类 |
| `small.diff.layout.0.gm` | `0` | `20` | 未分类 |
| `small.diff.layout.1.h` | `400` | `300` | 未分类 |
| `small.diff.scroll.0.h` | `1680` | `1580` | 未分类 |
| `small.diff.scroll.0.ch` | `1680` | `1580` | 未分类 |
| `small.diff.scroll.1.h` | `1680` | `1580` | 未分类 |
| `small.diff.scroll.1.ch` | `1680` | `1580` | 未分类 |
| `small.diff.count.lineDel` | `5` | `7` | 未分类 |
| `small.diff.count.gDel` | `6` | `1` | 未分类 |

## 96-diff/ts-lang

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `4` | `6` | 未分类 |

## 96-diff/compact

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.layout.0.left` | `72` | `52` | 未分类 |
| `init.diff.layout.0.cw` | `378` | `398` | 未分类 |
| `init.diff.layout.0.gm` | `20` | `0` | 未分类 |
| `init.diff.scroll.0.w` | `378` | `398` | 未分类 |

## 97-engines/suggest-open-filter-accept

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `down.eval.selected` | `"fob"` | `"foo"` | 未分类 |
| `end.value` | `"fob"` | `"foo"` | 未分类 |

## 97-engines/tab-focus-order

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `tab.sel.0.1` | `1` | `5` | 未分类 |
| `tab.sel.0.3` | `1` | `5` | 未分类 |
| `tab.value` | `"x"` | `"    x"` | 未分类 |
| `tab.eval` | `"BODY"` | `"DIV"` | 未分类 |
| `end.sel.0.1` | `1` | `5` | 未分类 |
| `end.sel.0.3` | `1` | `5` | 未分类 |
| `end.cursorRect.0.0` | `68` | `101` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `end.value` | `"x"` | `"    x"` | 未分类 |
