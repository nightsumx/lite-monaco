import { register } from 'node:module'
import { createRequire } from 'node:module'
register(new URL('./hook.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'self']) {
  try { globalThis[k] = k === 'self' ? dom.window : dom.window[k] } catch (e) { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true }) }
}
