// 拼出完整的站点目录 site/_deploy：首页（英文 /、中文 /zh/）、docs-src/*.md 生成的文档页、
// sitemap.xml、llms.txt、robots.txt，以及首页里的 JSON-LD。部署和预览都用这一个目录：
//   node site/build.mjs && python3 -m http.server -d site/_deploy 5311
// Markdown 只认文档里用到的那几种：标题、段落、列表、引用、表格、代码块、行内代码、粗体、链接。
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeToHtml } from 'shiki'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '_deploy')
const ORIGIN = 'https://lite-monaco.dev'
const REPO = 'https://github.com/nightsumx/lite-monaco'
// IndexNow（Bing、Yandex 等）：站点根目录放 <key>.txt 证明归属，site/indexnow.mjs 在部署后把 sitemap 里的网址报上去
export const INDEXNOW_KEY = '9604bba44a5444ffa6bda7bee762cffe'
// 文档的顺序就是侧栏和 llms.txt 的顺序
const ORDER = ['getting-started', 'migrate-from-monaco', 'react', 'language-features', 'bundle-size', 'differences', 'reduce-monaco-bundle-size', 'monaco-without-web-workers']

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function inline(s) {
    const codes = []
    s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
    s = esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' rel="noopener"' : ''}>${t}</a>`)
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`)
}

async function markdown(md) {
    const lines = md.split('\n'), html = [], toc = []
    let i = 0, title = ''
    const para = []
    const flush = () => { if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0 }
    while (i < lines.length) {
        const l = lines[i]
        let m
        if ((m = /^```(\w*)$/.exec(l))) {
            flush()
            const body = []
            while (++i < lines.length && lines[i] !== '```') body.push(lines[i])
            i++
            const code = await codeToHtml(body.join('\n'), { lang: m[1] || 'text', theme: 'vesper' })
            html.push(`<div class="doc-code">${m[1] ? `<span class="doc-lang">${m[1]}</span>` : ''}${code}</div>`)
            continue
        }
        if ((m = /^(#{1,3}) (.*)$/.exec(l))) {
            flush()
            const level = m[1].length, text = inline(m[2]), id = slug(m[2])
            if (level === 1) title = text
            else html.push(`<h${level} id="${id}"><a href="#${id}">${text}</a></h${level}>`)
            if (level === 2) toc.push({ id, text })
            i++; continue
        }
        if (/^\|/.test(l)) {
            flush()
            const rows = []
            while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++])
            const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
            const [head, , ...body] = rows
            html.push(`<div class="doc-table"><table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
            continue
        }
        if (/^- /.test(l)) {
            flush()
            const items = []
            while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2))
            html.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`)
            continue
        }
        if (/^>/.test(l)) {
            flush()
            const parts = [[]]
            while (i < lines.length && /^>/.test(lines[i])) {
                const t = lines[i++].replace(/^> ?/, '')
                if (t) parts[parts.length - 1].push(t); else parts.push([])
            }
            html.push(`<aside class="doc-note">${parts.filter(p => p.length).map(p => `<p>${inline(p.join(' '))}</p>`).join('')}</aside>`)
            continue
        }
        if (!l.trim()) { flush(); i++; continue }
        para.push(l); i++
    }
    flush()
    return { title, body: html.join('\n'), toc }
}

function frontmatter(src) {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(src)
    const meta = {}
    for (const line of (m ? m[1] : '').split('\n')) { const k = /^(\w+): (.*)$/.exec(line); if (k) meta[k[1]] = k[2] }
    return { meta, md: m ? src.slice(m[0].length) : src }
}

const head = ({ title, description, path, extra = '' }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${path}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="lite-monaco">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230a0a0a'/%3E%3Crect x='14' y='6' width='4' height='20' fill='%23ff5a1f'/%3E%3C/svg%3E">
<link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
${extra}</head>
<body class="docs">
<header class="top">
  <a class="mark" href="/" aria-label="lite-monaco home"><span class="mark-caret" aria-hidden="true"></span>lite-monaco</a>
  <nav aria-label="Site">
    <a class="ext" href="/docs/">Docs</a>
    <a class="ext" href="https://stackblitz.com/github/nightsumx/lite-monaco/tree/main/templates/vite">StackBlitz ↗</a>
    <a class="ext" href="${REPO}">GitHub ↗</a>
    <a class="ext" href="https://www.npmjs.com/package/lite-monaco">npm ↗</a>
  </nav>
</header>
`

const foot = `<footer class="foot">
  <div class="foot-mark"><span class="mark-caret" aria-hidden="true"></span>lite-monaco</div>
  <p>MIT. An independent project, not affiliated with Microsoft, Monaco Editor or VS Code; those are Microsoft product names, used here only to say whose feel it matches.</p>
  <span class="foot-links"><a href="${REPO}">GitHub ↗</a><a href="https://www.npmjs.com/package/lite-monaco">npm ↗</a></span>
</footer>
</body>
</html>
`

const sidebar = (docs, current) => `<nav class="doc-side" aria-label="Docs">
  <span class="doc-side-h">Docs</span>
  ${docs.map((d, i) => `<a href="/docs/${d.name}/"${d.name === current ? ' aria-current="page"' : ''}><i>${String(i + 1).padStart(2, '0')}</i>${d.short}</a>`).join('\n  ')}
</nav>`

const jsonld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`

export async function buildPages() {
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'))
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    for (const p of ['style.css', 'fonts', 'dist', 'og.png', 'zh']) cpSync(resolve(here, p), resolve(out, p), { recursive: true })

    const docs = []
    const names = readdirSync(resolve(here, 'docs-src')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
    for (const n of names) if (!ORDER.includes(n)) throw new Error(`docs-src/${n}.md 不在 pages.mjs 的 ORDER 里`)
    for (const name of ORDER) {
        const src = readFileSync(resolve(here, 'docs-src', name + '.md'), 'utf8')
        const { meta, md } = frontmatter(src)
        const { title, body, toc } = await markdown(md)
        docs.push({ name, meta, md, title, body, toc, short: meta.short || meta.title.replace(/^Using lite-monaco with /, '').replace(/ compared with monaco-editor$/, '') })
    }

    // 首页：英文和中文都插 JSON-LD
    const site = {
        '@context': 'https://schema.org', '@type': 'SoftwareSourceCode',
        name: 'lite-monaco', url: ORIGIN + '/', codeRepository: REPO, description: pkg.description,
        programmingLanguage: 'TypeScript', runtimePlatform: 'Web browser', license: 'https://opensource.org/licenses/MIT',
        version: pkg.version, keywords: (pkg.keywords || []).join(', '),
    }
    for (const page of ['index.html', 'zh/index.html']) {
        const html = readFileSync(resolve(here, page), 'utf8')
        if (!html.includes('<!--JSONLD-->')) throw new Error(`${page} 缺 <!--JSONLD--> 占位`)
        writeFileSync(resolve(out, page), html.replace('<!--JSONLD-->', jsonld(site)))
    }

    for (const [i, d] of docs.entries()) {
        const path = `/docs/${d.name}/`
        const prev = docs[i - 1], next = docs[i + 1]
        const crumbs = jsonld({
            '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Docs', item: `${ORIGIN}/docs/` },
                { '@type': 'ListItem', position: 2, name: d.meta.title, item: ORIGIN + path },
            ],
        })
        const page = head({ title: `${d.meta.title} · lite-monaco`, description: d.meta.description, path, extra: crumbs + '\n' })
            + `<div class="doc-wrap">
${sidebar(docs, d.name)}
<main class="doc">
  <div class="sec-rule"><span>${String(i + 1).padStart(2, '0')}</span><span>Docs</span><span class="sec-rule-r"><a href="${REPO}/blob/main/site/docs-src/${d.name}.md">source</a> · <a href="/docs/${d.name}.md">.md</a></span></div>
  <h1>${d.title}</h1>
${d.body}
  <nav class="doc-pager" aria-label="Pager">${prev ? `<a href="/docs/${prev.name}/"><small>← previous</small>${prev.short}</a>` : '<span></span>'}${next ? `<a class="next" href="/docs/${next.name}/"><small>next →</small>${next.short}</a>` : ''}</nav>
</main>
${d.toc.length > 1 ? `<nav class="doc-toc" aria-label="On this page"><span class="doc-side-h">On this page</span>${d.toc.map(t => `<a href="#${t.id}">${t.text}</a>`).join('')}</nav>` : ''}
</div>
` + foot
        mkdirSync(resolve(out, 'docs', d.name), { recursive: true })
        writeFileSync(resolve(out, 'docs', d.name, 'index.html'), page)
        writeFileSync(resolve(out, 'docs', d.name + '.md'), d.md.trimStart())
    }

    const index = head({ title: 'lite-monaco docs: a drop-in monaco-editor replacement', description: 'Documentation for lite-monaco: getting started, migrating from monaco-editor, React, TypeScript and JSON language features, bundle size, and every known difference from Monaco.', path: '/docs/' })
        + `<div class="doc-wrap">
${sidebar(docs, '')}
<main class="doc">
  <div class="sec-rule"><span>00</span><span>Docs</span><span class="sec-rule-r">the API is Monaco's · these pages cover what is different</span></div>
  <h1>lite-monaco docs</h1>
  <p>lite-monaco has the <code>monaco-editor</code> API, so <a href="https://microsoft.github.io/monaco-editor/docs.html" rel="noopener">Monaco's API reference</a> is its reference too. These pages cover setup, migration, and everything that differs.</p>
  <ul class="doc-cards">
${docs.map((d, i) => `    <li><a href="/docs/${d.name}/"><i>${String(i + 1).padStart(2, '0')}</i><b>${d.meta.title}</b><span>${esc(d.meta.description)}</span></a></li>`).join('\n')}
  </ul>
</main>
</div>
` + foot
    mkdirSync(resolve(out, 'docs'), { recursive: true })
    writeFileSync(resolve(out, 'docs', 'index.html'), index)

    const today = new Date().toISOString().slice(0, 10)
    const urls = ['/', '/zh/', '/docs/', ...docs.map(d => `/docs/${d.name}/`)]
    writeFileSync(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`)
    writeFileSync(resolve(out, INDEXNOW_KEY + '.txt'), INDEXNOW_KEY)
    writeFileSync(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
    // llms.txt（llmstxt.org）：给 AI 助手的一页说明，链接指向各篇的 Markdown 原文
    writeFileSync(resolve(out, 'llms.txt'), `# lite-monaco

> ${pkg.description} Install with \`npm i lite-monaco shiki\`, then \`import * as monaco from 'lite-monaco'\` where you had \`import * as monaco from 'monaco-editor'\`. MIT licensed.

- Same API as monaco-editor 0.55.1 (\`monaco.editor\`, \`monaco.languages\`, \`monaco.Uri\`, \`monaco.Range\`, \`monaco.KeyCode\`); Monaco's own API reference applies.
- No \`MonacoEnvironment.getWorker\`, no worker loader, no bundler plugin.
- 523 KB gzip core, against 1201 KB for monaco-editor's editor.main plus editor.worker.
- All 3279 applicable cases of Monaco's own 3863 editor unit tests pass.
- Optional dependencies: \`typescript@6\` for TS/JS IntelliSense (not 7, it has no JS API), \`vscode-json-languageservice\` / \`vscode-css-languageservice\` / \`vscode-html-languageservice\` for those languages.
- Works with @monaco-editor/react via \`loader.config({ monaco })\`.

## Docs

${docs.map(d => `- [${d.meta.title}](${ORIGIN}/docs/${d.name}.md): ${d.meta.description}`).join('\n')}

## Optional

- [Source on GitHub](${REPO})
- [npm package](https://www.npmjs.com/package/lite-monaco)
- [Live demo](${ORIGIN}/)
`)
    return { pages: urls.length, docs: docs.length }
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(await buildPages())
