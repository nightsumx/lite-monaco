// monaco-editor 0.58.0 的 src/languages/definitions/test/testRunner.ts → lite-monaco。
// 逻辑一字不改(loadLanguage 后 timeout(0),再 editor.tokenize 逐行比对 {startIndex,type});
// 只把三处依赖换掉:node:test → vitest 的 test,'../register.all' / '../_.contribution' → lite-monaco 的基础语言,
// '../../../editor' → lite-monaco 的 monaco.editor。
import '../../src/basic-languages/register.all'
import { loadLanguage } from '../../src/basic-languages/_.contribution'
import assert from 'node:assert'
import { test } from 'vitest'
import { editor } from '../../src/basic-languages/_monaco'

export interface IRelaxedToken { startIndex: number, type: string }
export interface ITestItem { line: string, tokens: IRelaxedToken[] }

function timeout(ms: number) { return new Promise((resolve) => { setTimeout(resolve, ms) }) }

export function testTokenization(_language: string | string[], tests: ITestItem[][]): void {
    const languages = typeof _language === 'string' ? [_language] : _language
    const mainLanguage = languages[0]
    test(mainLanguage + ' tokenization', async () => {
        await Promise.all(languages.map((l) => loadLanguage(l)))
        await timeout(0)
        runTests(mainLanguage, tests)
    })
}

function runTests(languageId: string, tests: ITestItem[][]): void { tests.forEach((t) => runTest(languageId, t)) }

function runTest(languageId: string, test: ITestItem[]): void {
    const text = test.map((t) => t.line).join('\n')
    const actualTokens = editor.tokenize(text, languageId)
    const actual = actualTokens.map((lineTokens, index) => ({
        line: test[index].line,
        tokens: lineTokens.map((t) => ({ startIndex: t.offset, type: t.type })),
    }))
    assert.deepStrictEqual(actual, test)
}
