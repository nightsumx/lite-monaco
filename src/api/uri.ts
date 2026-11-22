// 最小 Uri(Monaco 的 Uri = vscode-uri 的 URI):parse / file / from / with / toString / fsPath。
// 只做 createModel / getModel(uri) / setModelMarkers 需要的那部分;编码规则跟 vscode-uri 一致(路径逐段 encodeURIComponent,斜杠保留)。

export interface UriComponents {
    scheme: string
    authority?: string
    path?: string
    query?: string
    fragment?: string
}

const RE = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/

function enc(s: string, keepSlash: boolean): string {
    const e = (x: string) => encodeURIComponent(x).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    return keepSlash ? s.split('/').map(e).join('/') : e(s)
}
function dec(s: string): string {
    try { return decodeURIComponent(s) } catch { return s }
}

export class Uri implements UriComponents {
    readonly scheme: string
    readonly authority: string
    readonly path: string
    readonly query: string
    readonly fragment: string

    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
        this.scheme = scheme || 'file'
        this.authority = authority || ''
        // vscode-uri _referenceResolution:http / https / file 的路径必须以 / 开头
        this.path = (this.scheme === 'http' || this.scheme === 'https' || this.scheme === 'file') && path && path[0] !== '/' ? '/' + path : path || ''
        this.query = query || ''
        this.fragment = fragment || ''
    }

    static isUri(thing: unknown): thing is Uri {
        return thing instanceof Uri
    }

    static parse(value: string, _strict = false): Uri {
        const m = RE.exec(value)
        if (!m) return new Uri('', '', '', '', '')
        return new Uri(m[2] ?? '', dec(m[4] ?? ''), dec(m[5] ?? ''), dec(m[7] ?? ''), dec(m[9] ?? ''))
    }

    static file(path: string): Uri {
        let authority = ''
        path = path.replace(/\\/g, '/')
        if (path[0] === '/' && path[1] === '/') {
            const idx = path.indexOf('/', 2)
            if (idx === -1) { authority = path.substring(2); path = '/' } else { authority = path.substring(2, idx); path = path.substring(idx) || '/' }
        }
        return new Uri('file', authority, path, '', '')
    }

    static from(c: UriComponents, _strict?: boolean): Uri {
        return new Uri(c.scheme ?? '', c.authority ?? '', c.path ?? '', c.query ?? '', c.fragment ?? '')
    }

    /** vscode-uri `joinPath`:把片段接到 uri.path 后并规范化(. / .. / 重复斜杠) */
    static joinPath(uri: Uri, ...pathFragment: string[]): Uri {
        if (!uri.path) throw new Error('[UriError]: cannot call joinPath on URI without path')
        const joined = [uri.path, ...pathFragment].join('/')
        const abs = joined.startsWith('/')
        const out: string[] = []
        for (const seg of joined.split('/')) {
            if (seg === '' || seg === '.') continue
            if (seg === '..') { if (out.length) out.pop(); continue }
            out.push(seg)
        }
        const trailing = joined.endsWith('/') && out.length > 0
        return uri.with({ path: (abs ? '/' : '') + out.join('/') + (trailing ? '/' : '') })
    }

    /** vscode-uri `URI.revive`:把 toJSON 出来的数据(或 Uri 本身)还原成 Uri;undefined/null 原样返回 */
    static revive(data: UriComponents | Uri): Uri
    static revive(data: UriComponents | Uri | undefined): Uri | undefined
    static revive(data: UriComponents | Uri | null): Uri | null
    static revive(data: UriComponents | Uri | undefined | null): Uri | undefined | null
    static revive(data: UriComponents | Uri | undefined | null): Uri | undefined | null {
        if (!data) return data
        if (data instanceof Uri) return data
        return new Uri(data.scheme, data.authority ?? '', data.path ?? '', data.query ?? '', data.fragment ?? '')
    }

    /** `null` 清空该段,`undefined` 保持(vscode-uri 语义) */
    with(change: { scheme?: string, authority?: string | null, path?: string | null, query?: string | null, fragment?: string | null }): Uri {
        const pick = <T>(v: T | null | undefined, cur: string): string => v === undefined ? cur : (v ?? '') as string
        return new Uri(
            pick(change.scheme, this.scheme), pick(change.authority, this.authority), pick(change.path, this.path),
            pick(change.query, this.query), pick(change.fragment, this.fragment),
        )
    }

    get fsPath(): string {
        let v = this.authority && this.path.length > 1 && this.scheme === 'file' ? `//${this.authority}${this.path}` : this.path
        if (/^\/[a-zA-Z]:/.test(v)) v = v[1].toLowerCase() + v.substring(2)
        return v
    }

    toString(_skipEncoding = false): string {
        let s = ''
        if (this.scheme) s += this.scheme + ':'
        if (this.authority || this.scheme === 'file') s += '//'
        if (this.authority) s += this.authority.toLowerCase()
        if (this.path) s += enc(this.path, true)
        if (this.query) s += '?' + enc(this.query, false)
        if (this.fragment) s += '#' + enc(this.fragment, false)
        return s
    }

    toJSON(): UriComponents {
        return { scheme: this.scheme, authority: this.authority, path: this.path, query: this.query, fragment: this.fragment }
    }
}
