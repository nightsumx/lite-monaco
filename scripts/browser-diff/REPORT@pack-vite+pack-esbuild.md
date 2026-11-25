# 浏览器差分报告(真 Monaco 0.55.1 vs lite-monaco)

> 自动生成:`node run.mjs`。Chrome headless,Menlo 14px/行高 20,同一份场景脚本跑两边,比对 Monaco 公共 API 的几何值和少量 DOM 探针。数值默认容差 1px。

场景 356,完全一致 210,有差异 146。

| 分类 | 条数 |
|---|---|
| 有意不同 | 957 |
| monaco怪 | 74 |
| bug | 24 |
| 未分类 | 30 |

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
| `mid.sel.0.1` | `8` | `3` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |
| `mid.sel.0.3` | `8` | `3` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |
| `mid.value` | `"abnihao"` | `"ab"` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |

## 50-keys/ime-compose-in-middle-wrapped

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `mid.sel.0.1` | `71` | `67` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |
| `mid.sel.0.3` | `71` | `67` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |
| `mid.value` | `"lorem ipsum dolor sit amet lorem ipsum dolor sit amet lorem ipsum zhondolor sit` | `"lorem ipsum dolor sit amet lorem ipsum dolor sit amet lorem ipsum dolor sit ame` | 有意不同: 组字期间 value:Monaco(EditContext)每次组字更新都把组字文本写进 model(value 随组字变、每次 onDidChangeModelContent),lite 的 contenteditable 把组字文本留在 DOM、model 到提交才一次性改。第四轮·块B 在 87-ime 里实测确认(旧说法「Monaco 不改 model」是错的) |
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

## 84-sel-perf/perf-50000

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `perf.eval.selectAll` | `6` | `2` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.selectAll2` | `5.8` | `0.9` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.extend` | `6.3` | `1.7` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |
| `perf.eval.afterScroll` | `6.1` | `1` | 有意不同: 耗时测量,不是行为比对:数字每次都不同,只看量级(见 PROGRESS.md) |

## 85-rtl/dom-mixed-lines

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `dom.eval.4.0` | `"<rtl>שלום עולם   x"` | `"<rtl>שלום עולם x"` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.4,3.left` | `160` | `85` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.5,11.left` | `68` | `76` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,1.left` | `169` | `186` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,2.left` | `177` | `186` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.pos.6,3.left` | `186` | `169` | monaco怪: 分词不同:Shiki 与 Monarch 在字符串 / 注释边界处切的 token 不一样,token 边界处的光标列左右各一个位置,字形位置(glyphs 快照)一致;混排行里数字 / 空格:Monaco 把空格写成 NBSP(双向类 CS),使 RTL token 里 "1 2" 显示成 LTR,lite 的普通空格按 UBA 走 |
| `a.glyphs.6.0.1` | `169` | `186` | bug: Firefox/WebKit:混排行第 6 行里相邻两个字形的 x 互换(169/186),Chromium 一致。中性字符在 isolate 内的视觉顺序,没有拆到底也没修 |
| `a.glyphs.6.1.1` | `186` | `169` | bug: Firefox/WebKit:混排行第 6 行里相邻两个字形的 x 互换(169/186),Chromium 一致。中性字符在 isolate 内的视觉顺序,没有拆到底也没修 |

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
| `k04_Shift+ArrowRight.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `k05_Shift+ArrowRight.selRects.0.1` | `68` | `76` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/keys-rtl-marks

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `k06_Shift+End.cursorRect.0.0` | `371` | `295` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 85-rtl/wrap-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `c.cursorRect.0.0` | `68` | `84` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `c.selRects.2.1` | `68` | `66` | bug: 第四轮·块B 没拆完:tab 在 RTL 段里(Monaco 写成 NBSP 展开)、尼库德符号簇内的光标框、折行 RTL 选区第三行、选区框右缘(Home / Shift+左 到 RTL 段)差几 px 到几十 px;根因未查清 |

## 85-rtl/deco-inline-rtl

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.pos.1,1.left` | `68` | `236` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,2.left` | `76` | `245` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,3.left` | `177` | `253` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,4.left` | `177` | `236` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,5.left` | `169` | `228` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,6.left` | `161` | `219` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,7.left` | `152` | `211` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,8.left` | `144` | `203` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,9.left` | `135` | `194` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,10.left` | `127` | `186` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,11.left` | `118` | `177` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,12.left` | `110` | `169` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,13.left` | `102` | `161` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,14.left` | `93` | `152` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,15.left` | `262` | `144` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,16.left` | `253` | `135` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,17.left` | `245` | `127` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,18.left` | `236` | `119` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,19.left` | `228` | `110` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,20.left` | `220` | `102` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,21.left` | `186` | `68` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,22.left` | `194` | `76` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,23.left` | `203` | `85` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.pos.1,24.left` | `211` | `93` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.rects.0.0` | `84.86` | `143.73` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |
| `a.rects.0.2` | `100.94` | `117.8` | 有意不同: Monaco 的 token 在装饰边界处被劈开,每一块各自判 RTL,所以带装饰的混排行 abc 那段会变成 LTR 单独一块;lite 把装饰劈开的连续 RTL 子节点并回一个 isolate(rtl-isolate.test.ts 钉住),开关查找高亮 / 括号匹配时整行显示顺序不会变。Monaco 的做法会让行随装饰开关重排 |

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
| `k00_Shift+ArrowRight.selRects.0.2` | `68` | `82` | bug: Firefox/WebKit:天城文 Shift+→ 选一个字素簇,选区框宽 82 对 Monaco 68(Chromium 一致)。簇内字形宽度的量法(Range rect 对组合字符的切分)在 Firefox 下与 Monaco 不同,没有拆到底也没修 |

## 86-grapheme/drag-over-flag

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a.cursorRect.0.0` | `75` | `93` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |

## 87-ime/start-update-commit

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abn"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abn"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.1` | `6` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.3` | `6` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"abnih"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"abnih"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeSet.value` | `"ab你好"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeSet.eval.ev.2` | `"chg:2:1:ni"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeSet.eval.ev.4` | `"chg:2:3:你好"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeSet.eval.act` | `""` | `"ab你好"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s05_imeCommit.eval.ev.1` | `"chg:2:0:n"` | `"chg:2:0:你好"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.ev.2` | `"chg:2:1:ni"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.ev.4` | `"chg:2:3:你好"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.ev.5` | `"chg:2:2:你好"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s05_imeCommit.eval.act` | `""` | `"ab你好"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/cancel

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `6` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `6` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"abnih"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"abnih"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCancel.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCancel.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCancel.eval.ev.3` | `"chg:2:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCancel.eval.ev.4` | `"chg:2:3:"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCancel.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCancel.eval.act` | `""` | `"ab"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/cancel-then-type

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abni"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeCancel.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.2` | `"chg:3:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.3` | `"chg:2:2:"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.act` | `""` | `"ab"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |
| `s03_type.eval.ev.1` | `"chg:2:0:n"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_type.eval.ev.2` | `"chg:3:0:i"` | `"chg:2:0:x"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_type.eval.ev.3` | `"chg:2:2:"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_type.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_type.eval.ev.5` | `"chg:2:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_type.eval.act` | `""` | `"abx"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |

## 87-ime/replace-selection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"hello world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `3` | `6` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"ni world"` | `"hello world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"ni world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `2` | `6` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"你 world"` | `"hello world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"你 world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:0:5:n"` | `"chg:0:5:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"chg:0:1:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"你 world"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/replace-selection-cancel

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"hello world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `3` | `6` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"ni world"` | `"hello world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:0:5:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"ni world"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeCancel.eval.ev.1` | `"chg:0:5:n"` | `"chg:0:5:"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.3` | `"chg:0:2:"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCancel.eval.act` | `""` | `" world"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/inner-selection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `5` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abnihao"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:2:0:nihao"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abnihao"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `8` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `8` | `3` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.cursorRect.0.0` | `126` | `118` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_imeSet.value` | `"abnihao"` | `"ab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:2:0:nihao"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:2:5:nihao"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"abnihao"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:2:0:nihao"` | `"chg:2:0:你好"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:2:5:nihao"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:2:5:你好"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"ab你好"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/middle-of-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcdzef"` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcdzef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `7` | `5` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `7` | `5` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"abcdzhef"` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:4:1:zh"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"abcdzhef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"abcd中ef"` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:4:0:z"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:4:1:zh"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:4:2:中"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"abcd中ef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeCommit.eval.ev.1` | `"chg:4:0:z"` | `"chg:4:0:中"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.2` | `"chg:4:1:zh"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.3` | `"chg:4:2:中"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.4` | `"chg:4:1:中"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.act` | `""` | `"abcd中ef"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/empty-doc

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_imeSet.value` | `"a"` | `""` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s00_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s00_imeSet.eval.act` | `""` | `"a"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"あ"` | `""` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:0:1:あ"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"あ"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"あい"` | `""` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:0:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:0:1:あ"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.3` | `"chg:0:1:あい"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"あい"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:0:0:a"` | `"chg:0:0:あい"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:0:1:あ"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:0:1:あい"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"chg:0:2:あい"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"あい"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/second-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"onetwothree"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"one\ntwox\nthree"` | `"one\ntwo\nthree"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:7:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"onetwoxthree"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"one\ntwoxy\nthree"` | `"one\ntwo\nthree"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:7:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:7:1:xy"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"onetwoxythree"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:7:0:x"` | `"chg:7:0:漢"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:7:1:xy"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:7:2:漢"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"onetwo漢three"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/two-rounds

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_imeSet.sel.0.1` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s00_imeSet.sel.0.3` | `3` | `1` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s00_imeSet.value` | `"ni"` | `""` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s00_imeSet.eval.ev.1` | `"chg:0:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s00_imeSet.eval.ev.2` | `"chg:1:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s00_imeSet.eval.act` | `""` | `"ni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeCommit.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeCommit.eval.act` | `""` | `"你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |
| `s02_imeSet.sel.0.1` | `5` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `5` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"你hao"` | `"你"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.3` | `"chg:0:2:你"` | `"start"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.5` | `"start"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.6` | `"chg:1:0:h"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.7` | `"chg:2:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.8` | `"chg:3:0:o"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"你hao"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:0:0:n"` | `"chg:0:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:1:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:0:2:你"` | `"start"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `"chg:1:0:好"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.5` | `"start"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.6` | `"chg:1:0:h"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.7` | `"chg:2:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.8` | `"chg:3:0:o"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.9` | `"chg:1:3:好"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.10` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"你好"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/click-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni\ndef\nghi"` | `"abc\ndef\nghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.sel.0.1` | `2` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.sel.0.3` | `2` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.cursorRect.0.0` | `75` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_click.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_click.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_click.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:13:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:11:2:hi你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"abcnidefghi你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/click-during-then-update

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni\ndef\nghi"` | `"abc\ndef\nghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.sel.0.1` | `2` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.sel.0.3` | `2` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_click.cursorRect.0.0` | `75` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_click.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_click.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_click.eval.act` | `""` | `"abcnidefghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"abcni\ndef\nghinih"` | `"abcni\ndef\nghi"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:4:0:i"` | `"start"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:11:2:hinih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"abcnidefghinih"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |

## 87-ime/esc-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_keys.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_keys.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_keys.value` | `"abcni"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_keys.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_keys.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_keys.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:3:2:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"abc你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/blur-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_blur.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.ev.3` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.act` | `"\n1abcni\n\n\nCannot edit in read-only editorCursor added: line 3 column 1"` | `"\n1abcnixxxxxxxxxxLine 1, column 6\n\n\n"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |

## 87-ime/blur-during-refocus

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_blur.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.ev.3` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_blur.eval.act` | `"\n1abcni\n\n\nCannot edit in read-only editorCursor added: line 3 column 1"` | `"\n1abcnixxxxxxxxxxLine 1, column 6\n\n\n"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_eval.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_eval.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_eval.eval.ev.3` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_eval.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_type.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:ni"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_type.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_type.eval.ev.3` | `"end"` | `"chg:5:0:x"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_type.eval.ev.4` | `"chg:5:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_type.eval.act` | `""` | `"abcnix"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |

## 87-ime/external-edit-before

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abc\ndefni"` | `"abc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:7:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcdefni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.value` | `"XXabc\ndefni"` | `"XXabc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.3` | `"chg:0:0:XX"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.act` | `""` | `"XXabcdefni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"XXabc\ndefnih"` | `"XXabc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:8:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:0:0:XX"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.4` | `"chg:9:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"XXabcdefnih"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeCommit.eval.ev.1` | `"chg:7:0:n"` | `"chg:0:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.2` | `"chg:8:0:i"` | `"chg:9:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.3` | `"chg:0:0:XX"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.4` | `"chg:9:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.5` | `"chg:9:3:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.act` | `""` | `"XXabcdef你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/external-edit-after

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni\ndef"` | `"abc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcnidef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.value` | `"abcni\nXXdef"` | `"abc\nXXdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.3` | `"chg:6:0:XX"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.act` | `""` | `"abcniXXdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.1` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.3` | `7` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"abcnih\nXXdef"` | `"abc\nXXdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:6:0:XX"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.4` | `"chg:3:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"abcnihXXdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:4:0:XX"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:3:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.3` | `"chg:6:0:XX"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.4` | `"chg:3:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.5` | `"chg:3:3:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.6` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.act` | `""` | `"abc你XXdef"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/external-setvalue

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.cursorRect.0.0` | `68` | `151` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `"chg:0:3:replaced"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.3` | `"chg:0:5:replaced"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.act` | `""` | `"replacedni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.sel.0.1` | `5` | `2` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |
| `s03_imeCommit.sel.0.3` | `5` | `2` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |
| `s03_imeCommit.cursorRect.0.0` | `106` | `81` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s03_imeCommit.value` | `"rep你ced"` | `"你"` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:0:3:replaced"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"chg:0:8:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:0:5:replaced"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"chg:0:5:rep你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"你"` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |

## 87-ime/external-setselection

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abcdef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"abcni\ndef"` | `"abc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcnidef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.cursorRect.0.0` | `75` | `109` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.cursorRect.0.1` | `20` | `0` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_eval.value` | `"abcni\ndef"` | `"abc\ndef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_eval.eval.ev.1` | `"chg:3:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.ev.2` | `"chg:4:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_eval.eval.act` | `""` | `"abcnidef"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.cursorRect.0.1` | `20` | `0` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s03_imeCommit.value` | `"abcni\ndef你"` | `"abc你\ndef"` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:n"` | `"chg:3:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:4:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:7:2:ef你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"abc你def"` | 有意不同: 组字中 setValue / 改光标:Monaco 把提交文本插到旧组字范围(setValue 后得到 "rep你ced" 这种乱串),lite 重画后提交文本替换了整行(setValue 后只剩「你」)。两边都不是好结果;真浏览器里 Chrome 在组字节点被换掉时会放弃组字,CDP 模拟不到,未验证 |

## 87-ime/wrapped

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `28` | `23` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `28` | `23` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"lorem ipsum dolor sit zhongamet consectetur adipiscing elit sed do eiusmod"` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:22:0:z"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:23:0:h"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"lorem ipsum dolor sit zhongamet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `25` | `23` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `25` | `23` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | `"lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:22:0:z"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:23:0:h"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.6` | `"chg:22:5:中文"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:22:0:z"` | `"chg:22:0:中文"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:23:0:h"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:24:0:o"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"chg:25:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.5` | `"chg:26:0:g"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.6` | `"chg:22:5:中文"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.7` | `"chg:22:2:中文"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.8` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"lorem ipsum dolor sit 中文amet consectetur adipiscing elit sed do eiusmod"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/rtl-line

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"שלום עולם"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"שלום עולםa"` | `"שלום עולם"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:9:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"שלום עולםa"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `12` | `10` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `12` | `10` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"שלום עולםab"` | `"שלום עולם"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:9:0:a"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:9:1:ab"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"שלום עולםab"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:9:0:a"` | `"chg:9:0:ab"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:9:1:ab"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:9:2:ab"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"שלום עולםab"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/rtl-compose-he

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.value` | `"abcש"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:3:0:ש"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"abcש"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.rtl` | `true` | `false` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `6` | `4` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.cursorRect.0.0` | `68` | `92` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s02_imeSet.value` | `"abcשל"` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:3:0:ש"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:3:1:של"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"abcשל"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.rtl` | `true` | `false` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:3:0:ש"` | `"chg:3:0:של"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:3:1:של"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:3:2:של"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"abcשל"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/multicursor

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.1` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.0.3` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.1.1` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.sel.1.3` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.cursorRect.1.0` | `92` | `75` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.value` | `"ani\nb\ncni"` | `"a\nb\nc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:5:0:n|1:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.ev.2` | `"chg:7:0:i|2:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"anibc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeCommit.eval.ev.1` | `"chg:5:0:n|1:0:n"` | `"chg:5:0:你|1:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCommit.eval.ev.2` | `"chg:7:0:i|2:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCommit.eval.ev.3` | `"chg:7:2:你|1:2:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeCommit.eval.act` | `""` | `"a你bc你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/readonly

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"abc"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.cursorRect.0.0` | `92` | `109` | monaco怪: wheel 后 Monaco 光标在视口外时 rect 是 0,lite 仍给真实位置 |
| `s01_imeSet.eval.act` | `""` | `"abcni"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeCommit.eval.act` | `""` | `"abc你"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/zwj-neighbour

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_keys.eval.act` | `""` | `"a👨‍👩‍👧b"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.value` | `"a👨‍👩‍👧xb"` | `"a👨‍👩‍👧b"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_imeSet.eval.ev.1` | `"chg:9:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s01_imeSet.eval.act` | `""` | `"a👨‍👩‍👧xb"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `12` | `10` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `12` | `10` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"a👨‍👩‍👧xyb"` | `"a👨‍👩‍👧b"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:9:0:x"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:9:1:xy"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"a👨‍👩‍👧xyb"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeCommit.eval.ev.1` | `"chg:9:0:x"` | `"chg:9:0:字"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.2` | `"chg:9:1:xy"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.3` | `"chg:9:2:字"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.ev.4` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeCommit.eval.act` | `""` | `"a👨‍👩‍👧字b"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

## 87-ime/decorations-during

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `s00_eval.eval.act` | `""` | `"abc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s01_keys.eval.act` | `""` | `"abc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.1` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.sel.0.3` | `4` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.value` | `"anibc def"` | `"abc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s02_imeSet.eval.ev.1` | `"chg:1:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.ev.2` | `"chg:2:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s02_imeSet.eval.act` | `""` | `"anibc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.1` | `5` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.sel.0.3` | `5` | `2` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.value` | `"anihbc def"` | `"abc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s03_imeSet.eval.ev.1` | `"chg:1:0:n"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.2` | `"chg:2:0:i"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.ev.3` | `"chg:1:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s03_imeSet.eval.act` | `""` | `"anihbc def"` | 有意不同: 组字中途:Monaco 的 model 已含组字文本(value、sel 随之动,焦点元素 EditContext 没有文本),lite 的 model 不含、文本在 contenteditable 的 DOM 里。结构差异:真浏览器里在组字中重画 DOM 会让 IME 放弃组字,所以 lite 不能照 Monaco 每次更新写 model |
| `s04_imeCommit.eval.ev.1` | `"chg:1:0:n"` | `"chg:1:0:你"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.2` | `"chg:2:0:i"` | `"end"` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.3` | `"chg:1:2:nih"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.4` | `"chg:1:3:你"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.ev.5` | `"end"` | `undefined` | 有意不同: 事件序列:Monaco 每次组字更新一条 onDidChangeModelContent(replace 上一次组字文本),lite 提交时一条;start / end 都有,且提交时内容变更都在 end 之前 |
| `s04_imeCommit.eval.act` | `""` | `"a你bc def"` | 有意不同: 其余 87-ime 项都是上面几类的连带(组字中途 value / 事件序列) |

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
| `ax.ax.widgets.6.name` | `"Add Cursor Below, Option+Command+DownArrow"` | `"Add Cursors to Bottom"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.7.role` | `"toolbar"` | `"option"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |
| `ax.ax.widgets.7.name` | `""` | `"Add Cursors to Line Ends, Shift+Option+I"` | 有意不同: 命令面板:Monaco 是虚拟列表(只渲染可见 7 行,输入框是 textbox + aria-haspopup=menu),lite 渲染全部命令,输入框是 ARIA 标准的 combobox(aria-controls 指向 listbox)。读屏到的是同样的「输入框 + 名叫 Type to narrow down results. 的列表 + 带快捷键读法的选项」,条数和 role 名不同;不改成 textbox,combobox 对读屏更准 |

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

## 95-a11y/pageSize-default

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `sr.eval.follows` | `true` | `false` | 有意不同: accessibilityPageSize:Monaco(EditContext + accessibilitySupport:on)把光标周围 pageSize 行写进读屏内容元素(默认约 58 行,pageSize 10 时 11 行,随光标走);lite 的读屏内容就是真 DOM(contenteditable,渲染出来的行),没有一块独立的「读屏文本窗口」,所以选项可设但没有分页,也不随未渲染的光标位置移动。键盘移动光标时光标会被滚进视口,读屏读到的就是它所在的行;只有 API 直接 setPosition 且不 reveal 时才和 Monaco 不同 |
| `sr.eval.lines` | `58` | `1` | 有意不同: accessibilityPageSize:Monaco(EditContext + accessibilitySupport:on)把光标周围 pageSize 行写进读屏内容元素(默认约 58 行,pageSize 10 时 11 行,随光标走);lite 的读屏内容就是真 DOM(contenteditable,渲染出来的行),没有一块独立的「读屏文本窗口」,所以选项可设但没有分页,也不随未渲染的光标位置移动。键盘移动光标时光标会被滚进视口,读屏读到的就是它所在的行;只有 API 直接 setPosition 且不 reveal 时才和 Monaco 不同 |

## 95-a11y/pageSize-10

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `sr.eval.follows` | `true` | `false` | 有意不同: accessibilityPageSize:Monaco(EditContext + accessibilitySupport:on)把光标周围 pageSize 行写进读屏内容元素(默认约 58 行,pageSize 10 时 11 行,随光标走);lite 的读屏内容就是真 DOM(contenteditable,渲染出来的行),没有一块独立的「读屏文本窗口」,所以选项可设但没有分页,也不随未渲染的光标位置移动。键盘移动光标时光标会被滚进视口,读屏读到的就是它所在的行;只有 API 直接 setPosition 且不 reveal 时才和 Monaco 不同 |
| `sr.eval.lines` | `11` | `1` | 有意不同: accessibilityPageSize:Monaco(EditContext + accessibilitySupport:on)把光标周围 pageSize 行写进读屏内容元素(默认约 58 行,pageSize 10 时 11 行,随光标走);lite 的读屏内容就是真 DOM(contenteditable,渲染出来的行),没有一块独立的「读屏文本窗口」,所以选项可设但没有分页,也不随未渲染的光标位置移动。键盘移动光标时光标会被滚进视口,读屏读到的就是它所在的行;只有 API 直接 setPosition 且不 reveal 时才和 Monaco 不同 |

## 95-a11y/tabFocusMode-alert

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `a11y.a11y.active.cls` | `"native-edit-context"` | `"cm-content"` | 有意不同: 焦点元素的 class:Monaco 是 native-edit-context(EditContext),lite 是 cm-content。只是类名,AX 树里都是同样的 textbox |
| `a11y.a11y.active.attrs.contenteditable` | `undefined` | `"true"` | 有意不同: lite 的编辑框本身是 contenteditable(没有隐藏 textarea / EditContext),AX 树里都是 editable=richtext 的 textbox。结构性差异 |
| `a11y.a11y.lives.2.text` | `"Cursor added: line 3 column 1"` | `""` | 有意不同: AX 摘要(ax)两边 0 差异,播报文字一致;剩下是和别的 a11y 场景一样的结构差异(EditContext 元素 vs contenteditable、role 计数),不是 tabFocusMode 的问题 |
| `a11y.a11y.roles.presentation` | `14` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.none` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.roles.list` | `1` | `undefined` | 有意不同: Monaco 给装饰层(行号边栏、标尺、滚动条、overlay)补 role=presentation,吸顶滚动区带 role=none/list;lite 的装饰层本来就 aria-hidden,AX 树里这些节点都被忽略,读屏看不到差别 |
| `a11y.a11y.accessibilitySupport` | `2` | `0` | 有意不同: AX 摘要(ax)两边 0 差异,播报文字一致;剩下是和别的 a11y 场景一样的结构差异(EditContext 元素 vs contenteditable、role 计数),不是 tabFocusMode 的问题 |

## 96-diff/inline

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.lineDel` | `5` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.gDel` | `6` | `1` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/auto-inline-narrow

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.layout.0.left` | `72` | `52` | 未分类 |
| `init.diff.layout.0.w` | `350` | `42` | 未分类 |
| `init.diff.layout.0.cw` | `278` | `-10` | 未分类 |
| `init.diff.layout.0.gm` | `20` | `0` | 未分类 |
| `init.diff.layout.1.w` | `385` | `693` | 未分类 |
| `init.diff.layout.1.cw` | `333` | `641` | 未分类 |
| `init.diff.scroll.0.h` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.0.ch` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.1.h` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.1.w` | `333` | `641` | 未分类 |
| `init.diff.scroll.1.ch` | `1620` | `1680` | 未分类 |
| `init.diff.count.lineDel` | `1` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charDel` | `1` | `8` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/breakpoint-1200

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.layout.0.left` | `72` | `52` | 未分类 |
| `init.diff.layout.0.w` | `450` | `42` | 未分类 |
| `init.diff.layout.0.cw` | `378` | `-10` | 未分类 |
| `init.diff.layout.0.gm` | `20` | `0` | 未分类 |
| `init.diff.layout.1.w` | `485` | `893` | 未分类 |
| `init.diff.layout.1.cw` | `433` | `841` | 未分类 |
| `init.diff.scroll.0.h` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.0.w` | `378` | `284` | 未分类 |
| `init.diff.scroll.0.ch` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.1.h` | `1620` | `1680` | 未分类 |
| `init.diff.scroll.1.w` | `433` | `841` | 未分类 |
| `init.diff.scroll.1.ch` | `1620` | `1680` | 未分类 |
| `init.diff.count.lineDel` | `1` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `init.diff.count.charDel` | `1` | `8` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

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
| `small.diff.layout.0.left` | `72` | `52` | 未分类 |
| `small.diff.layout.0.w` | `250` | `42` | 未分类 |
| `small.diff.layout.0.h` | `400` | `300` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.layout.0.cw` | `178` | `-10` | 未分类 |
| `small.diff.layout.0.gm` | `20` | `0` | 未分类 |
| `small.diff.layout.1.w` | `285` | `493` | 未分类 |
| `small.diff.layout.1.h` | `400` | `300` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.layout.1.cw` | `233` | `441` | 未分类 |
| `small.diff.scroll.0.h` | `1620` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.0.ch` | `1620` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.1.h` | `1620` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.scroll.1.w` | `283` | `441` | 未分类 |
| `small.diff.scroll.1.ch` | `1620` | `1580` | monaco怪: automaticLayout:false 时调用无参 diff.layout():Monaco 沿用旧高度 400,lite 会重测容器(300)。lite 的行为是调用方预期的(容器变小就变小),Monaco 的是「不重量」的副作用 |
| `small.diff.count.lineDel` | `1` | `7` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |
| `small.diff.count.charDel` | `1` | `8` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 96-diff/ts-lang

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `init.diff.count.charIns` | `4` | `6` | 有意不同: 装饰 DOM 的节点个数,不是可见差异:Monaco 每个 range 一个 .line-insert/.char-insert/.gutter-delete 等 div(折行的行、跨多行的字符差会各出一个,.diff-hidden-lines 里还嵌套同类),lite 每个可见行一个、字符差按行合并,gutter 的删除/插入标记画在行装饰里而不是另起 div。要看真实位置用 rects / tops(已对齐) |

## 97-engines/suggest-open-filter-accept

| 路径 | Monaco | lite | 分类 |
|---|---|---|---|
| `down.eval.selected` | `"fob"` | `"foo"` | monaco怪: 只在整套(…96-diff 之后第一个场景)里出现:Monaco 的 ArrowDown 没有移动补全选中项(lite 移到 foo)。单独跑(node run.mjs 97-engines)Chromium/Firefox/WebKit 全部一致,加长等待无效,说明是前面 diff 场景留在 Monaco 页里的状态,原因没有拆到底 |
| `end.value` | `"fob"` | `"foo"` | monaco怪: 只在整套(…96-diff 之后第一个场景)里出现:Monaco 的 ArrowDown 没有移动补全选中项(lite 移到 foo)。单独跑(node run.mjs 97-engines)Chromium/Firefox/WebKit 全部一致,加长等待无效,说明是前面 diff 场景留在 Monaco 页里的状态,原因没有拆到底 |
