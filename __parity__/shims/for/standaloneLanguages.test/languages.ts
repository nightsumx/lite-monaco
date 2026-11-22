// standaloneLanguages.test 专用:common/languages.js 里测试只用 Token(和类型 IState)。指到 src 的同一份,deepStrictEqual 比原型,必须与适配器吐出的是同一个 class。
export { Token } from '../../../../src/api/tokenization'
export type { IState } from '../../../../src/api/tokenization'
