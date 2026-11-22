import * as monaco from '../../src/index'
import '../../src/basic-languages/typescript/register'
import { install } from './page.js'
window.monaco = monaco; install(monaco); window.__ready = performance.now()
