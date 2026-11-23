// 部署后把 sitemap 里的网址报给 IndexNow（Bing、Yandex、Seznam 等共用，api.indexnow.org 会转给各家）。
// 归属靠站点根目录的 <key>.txt（pages.mjs 写出），不用登录。Google 不接 IndexNow，要在 Search Console 里提交 sitemap。
//   node site/indexnow.mjs            读 site/_deploy/sitemap.xml
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INDEXNOW_KEY } from './pages.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const sitemap = readFileSync(resolve(here, '_deploy', 'sitemap.xml'), 'utf8')
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
const host = new URL(urlList[0]).host
const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`, urlList }),
})
// 200 收下了，202 收下但还在核对 key；其余（403 key 不对、422 网址不属于这个 host、429 太频繁）照实报
console.log(`indexnow ${res.status} ${urlList.length} urls`, res.ok ? '' : await res.text())
if (!res.ok) process.exitCode = 1
