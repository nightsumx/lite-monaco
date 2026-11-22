// monarch.test 专用:common/languages.js 里测试只用 Token 和 TokenizationRegistry —— 指到 src 里的同一份(Token 要和 MonarchTokenizer 吐出的是同一个 class,deepStrictEqual 比原型)。
export { Token, tokenizationRegistry as TokenizationRegistry } from '../../../../src/api/tokenization'
