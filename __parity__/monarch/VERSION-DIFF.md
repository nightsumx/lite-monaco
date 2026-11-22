# Monarch 语言定义:monaco-editor 0.55.1 vs 0.58.0

lite-monaco 对标 0.55.1,但 `src/basic-languages/` 的语言定义拷自 0.58.0(那是当时唯一能直接拿到的)。
2026-11-22 把 0.55.1 也拿下来(`codeload …/tags/v0.55.1` → `~/Documents/reference/monaco-editor-0.55.1`),逐文件比对,并用 0.55.1 的原版测试再跑一遍。

## 结果

| | 文件 | 用例 | 通过 |
|---|---|---|---|
| 0.58.0 原版测试(`vitest.monarch.config.ts`) | 86 | 88 | 88 |
| 0.55.1 原版测试(`vitest.monarch-0551.config.ts`) | 85 | 86 | 86 |

跑法:

```
MONACO_EDITOR_SRC_0551=$HOME/Documents/reference/monaco-editor-0.55.1 npx vitest run --config vitest.monarch-0551.config.ts
```

0.55.1 的目录布局不同:定义和测试在 `src/basic-languages/<lang>/`,测试 import `../monaco.contribution`、`monaco-editor-core`,配置里把它们指到 lite-monaco 的对应物。

## 两版语言定义的内容差异(去掉 import 行和空白后逐文件比,81 个语言)

只有 4 个语言的定义不同,其余 77 个逐字相同。lite-monaco 用的是 0.58.0 的版本。

| 语言 | 差异 | 对 lite-monaco 的影响 |
|---|---|---|
| elixir | 0.58 把 `"…":` / `'…':` 关键字键的前瞻正则改成线性时间(防灾难性回溯) | 0.58 更安全;分词结果在两版测试里都一致 |
| ini | 0.58 把整行注释规则 `^\s*[#;].*$` 放到空白规则**之前**(0.55.1 在之后) | **行为差异(已实测)**:`  ; indented comment` 这种行首带空白的注释行,0.55.1 里被空白规则吃掉前导空白,整行变成无类型文本;0.58 整行是 `comment.ini`。0.58 是 bug 修复,lite-monaco 取 0.58 的行为。固化在 `__tests__/basic-languages/version-diff.test.ts` |
| freemarker2 | 0.58 重排了模板字符串的换行和一处 `cases` 的缩进,**逻辑等价** | 无 |
| mdx(仅测试) | 0.55.1 的 `mdx.test.ts` 多一组 JSX 用例,0.58 删了 | 0.55.1 那组用例 lite-monaco 也通过 |

## 两版的结构差异(不影响行为)

- 0.55.1:`src/basic-languages/<lang>/<lang>.contribution.ts` 注册,`monaco.contribution.ts` 汇总。0.58.0:改名为 `register.ts` / `register.all.ts`。lite-monaco 用 0.58 的命名。
- 0.58.0 多一个 `ini.test.ts`。

## 没验证

- 0.55.1 的 `monaco-editor` **包**(打包产物)没装,只用了源码仓库的定义和测试。
