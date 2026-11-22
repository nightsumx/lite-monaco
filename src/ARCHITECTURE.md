# src 分层（自顶向下）

```
index.ts / litemonaco.ts     装配器（开关 → Extension[] + overlays + themeCSS）
diffeditor.ts             两个 liteMonaco() 拼成的并排 Diff（Monaco DiffEditorWidget）
│
├── product/              仅主题：theme / themecss
├── lang/                 TS LanguageService（实现 Language 贡献）
│
└── core/                 4 对象 × 3 投影 × 2 端口
    ├── model/            Rope / ChangeSet / Selection / State / RangeSet
    ├── view/             Metrics(H×W) / viewport / tile / EditorView 循环 / tokens
    ├── input/            沼泽（禁止重想）
    ├── edit/             Command + 合一扫描（brackets / indent / find）
    ├── feature/          Field / DecoSource / Overlay 实例
    ├── chrome/           Overlay：滚动条 / minimap / ruler
    ├── diff/             linediff（Monaco advanced diff）
    └── perf.ts           预算
```

贡献只准是：Command / Field / DecoSource / Overlay / Language。
装饰进 `decorations` facet；浮层进 `EditorView.overlays`。
依赖：`product` / `lang` → `core`。core 不依赖 lang。
