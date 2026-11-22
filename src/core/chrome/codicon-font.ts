// The codicon font is Copyright (c) Microsoft Corporation, licensed CC BY 4.0 (npm: @vscode/codicons). See THIRD-PARTY-NOTICES.md.
// Monaco/VS Code codicon.ttf: icon font for the search box and other controls.
// 源文件: src/assets/codicon.ttf（自 monaco-editor 复制）。字体本体在 codicon-woff2.ts,这里按需加载。

const FONT_ID = 'lite-monaco-codicon-font'
let face: Promise<string> | null = null

/** 往文档里装 codicon 的 @font-face。字体是单独的块,不在主包里:图标在它到之前不画(font-display: block),
 *  文字和编辑不等它。只装进 document:shadow 根里的 @font-face 浏览器不认,而 document 里的对 shadow 根里的元素也生效。
 *  每次调用都看元素还在不在(宿主清掉 head 也能补回);块只取一次,取失败(断网、CDN 挂了)不记住,下一次调用再取。 */
export function ensureCodiconFont(doc: Document): void {
    if (doc.getElementById(FONT_ID)) return
    face ??= import('./codicon-woff2').then(m => m.CODICON_FONT_FACE)
    face.then(css => {
        if (doc.getElementById(FONT_ID)) return
        const el = doc.createElement('style')
        el.id = FONT_ID
        el.textContent = css
        doc.head.insertBefore(el, doc.head.firstChild)
    }, err => {
        face = null
        console.warn('[lite-monaco] codicon font failed to load; icons stay blank until the next editor mounts', err)
    })
}

// 本产品用到的 codicon 码位(与 codiconsLibrary.js 一致)。
export const CODICON_ICON_CSS = `
.codicon[class*="codicon-"] {
  font: normal normal normal 16px/1 codicon;
  display: inline-block;
  text-decoration: none;
  text-rendering: auto;
  text-align: center;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  user-select: none;
  -webkit-user-select: none;
}
.codicon-close:before { content: "\\ea76"; }
.codicon-add:before { content: "\\ea60"; }
.codicon-remove:before { content: "\\eb3b"; }
.codicon-arrow-right:before { content: "\\ea9c"; }
.codicon-arrow-down:before { content: "\\ea9a"; }
.codicon-arrow-up:before { content: "\\eaa1"; }
.codicon-case-sensitive:before { content: "\\eab1"; }
.codicon-chevron-down:before { content: "\\eab4"; }
.codicon-chevron-right:before { content: "\\eab6"; }
.codicon-preserve-case:before { content: "\\eb2e"; }
.codicon-regex:before { content: "\\eb38"; }
.codicon-replace-all:before { content: "\\eb3c"; }
.codicon-replace:before { content: "\\eb3d"; }
.codicon-whole-word:before { content: "\\eb7e"; }
.codicon-selection:before { content: "\\eb85"; }
.codicon-copy:before { content: "\\ebcc"; }
/* 补全 kind 符号(与 monaco codiconsLibrary 码位一致) */
.codicon-symbol-variable:before { content: "\\ea88"; }
.codicon-symbol-method:before { content: "\\ea8c"; }
.codicon-symbol-function:before { content: "\\ea8c"; }
.codicon-symbol-module:before { content: "\\ea8b"; }
.codicon-symbol-event:before { content: "\\ea86"; }
.codicon-symbol-enum:before { content: "\\ea95"; }
.codicon-symbol-text:before { content: "\\ea93"; }
.codicon-symbol-class:before { content: "\\eb5b"; }
.codicon-symbol-interface:before { content: "\\eb61"; }
.codicon-symbol-keyword:before { content: "\\eb62"; }
.codicon-symbol-field:before { content: "\\eb5f"; }
.codicon-symbol-property:before { content: "\\eb65"; }
.codicon-symbol-snippet:before { content: "\\eb66"; }
.codicon-symbol-type-parameter:before { content: "\\ea92"; }
.codicon-symbol-file:before { content: "\\eb60"; }
.codicon-symbol-namespace:before { content: "\\ea8b"; }
.codicon-symbol-package:before { content: "\\ea8b"; }
.codicon-symbol-object:before { content: "\\ea8b"; }
.codicon-symbol-constructor:before { content: "\\ea8c"; }
.codicon-symbol-array:before { content: "\\ea8a"; }
.codicon-symbol-boolean:before { content: "\\ea8f"; }
.codicon-symbol-null:before { content: "\\ea8f"; }
.codicon-symbol-number:before { content: "\\ea90"; }
.codicon-symbol-struct:before { content: "\\ea91"; }
.codicon-symbol-key:before { content: "\\ea93"; }
.codicon-symbol-constant:before { content: "\\eb5d"; }
.codicon-symbol-enum-member:before { content: "\\eb5e"; }
.codicon-symbol-operator:before { content: "\\eb64"; }
.codicon-symbol-string:before { content: "\\eb8d"; }
`
