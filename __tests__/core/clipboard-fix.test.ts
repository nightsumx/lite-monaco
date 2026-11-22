// 剪贴板对齐 Monaco 0.52(bug 4 多光标按行分发、bug 6 空选区整行复制/剪切/行首粘贴)。
// 期望值:/tmp/lc-hunt/c-input/clip1.ts 与 f5/pclip.ts 在对照页上用真实 ⌘C/⌘X/⌘V 实测 Monaco 的结果
// (终态文档 + 选区,以及复制后系统剪贴板里的文本)。
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, setMacPlatform } from './f5-replay'

setMacPlatform()
const lm = await import('../../src/litemonaco')
const core = await import('../../src/core/index')
const { resetClipboardMeta } = await import('../../src/core/input/clipboard')

// 系统剪贴板替身(jsdom 没有 navigator.clipboard)
let clipboard = '__init__'
Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => { clipboard = t }, readText: async () => clipboard },
})
const flush = () => new Promise(r => setTimeout(r, 0))

interface Row { name: string, doc: string, clip: string | null, keys: string[], monaco: string, clipboard: string | null }
const ROWS: Row[] = [
    {"name": "copy selection", "doc": "⟨hello⟩ world", "clip": null, "keys": ["Meta+c"], "monaco": "⟨hello⟩ world", "clipboard": "hello"},
    {"name": "cut selection", "doc": "⟨hello ⟩world", "clip": null, "keys": ["Meta+x"], "monaco": "‸world", "clipboard": "hello "},
    {"name": "copy empty sel (whole line)", "doc": "aaa\nb‸bb\nccc", "clip": null, "keys": ["Meta+c"], "monaco": "aaa\nb‸bb\nccc", "clipboard": "bbb\n"},
    {"name": "cut empty sel (whole line)", "doc": "aaa\nb‸bb\nccc", "clip": null, "keys": ["Meta+x"], "monaco": "aaa\n‸ccc", "clipboard": "bbb\n"},
    {"name": "cut empty sel last line", "doc": "aaa\nbbb\nc‸cc", "clip": null, "keys": ["Meta+x"], "monaco": "aaa\nbbb‸", "clipboard": "ccc\n"},
    {"name": "copy line, paste mid other line", "doc": "aaa\nb‸bb\nccc", "clip": null, "keys": ["Meta+c", "ArrowDown", "Meta+v"], "monaco": "aaa\nbbb\nbbb\nc‸cc", "clipboard": null},
    {"name": "cut line, paste mid other line", "doc": "a‸aa\nbbb\nccc", "clip": null, "keys": ["Meta+x", "ArrowDown", "Meta+v"], "monaco": "bbb\naaa\n‸ccc", "clipboard": null},
    {"name": "copy line, paste over selection", "doc": "a‸aa\nbbb\nccc", "clip": null, "keys": ["Meta+c", "ArrowDown", "Shift+ArrowRight", "Meta+v"], "monaco": "aaa\nbaaa\n‸b\nccc", "clipboard": null},
    {"name": "copy line twice paste (2 cursors same line)", "doc": "a‸a‸a\nbbb", "clip": null, "keys": ["Meta+c"], "monaco": "a‸a‸a\nbbb", "clipboard": "aaa\n"},
    {"name": "multi-cursor copy", "doc": "⟨a1⟩\n⟨b2⟩\n⟨c3⟩", "clip": null, "keys": ["Meta+c"], "monaco": "⟨a1⟩\n⟨b2⟩\n⟨c3⟩", "clipboard": "a1\nb2\nc3"},
    {"name": "multi-cursor copy+paste spread", "doc": "⟨a1⟩\n⟨b2⟩\n⟨c3⟩\n\n\n", "clip": null, "keys": ["Meta+c", "ArrowRight", "Meta+v"], "monaco": "a1a1‸\nb2b2‸\nc3c3‸\n\n\n", "clipboard": null},
    {"name": "multi-cursor paste 3 lines into 3 cursors", "doc": "x‸\ny‸\nz‸", "clip": "A\nB\nC", "keys": ["Meta+v"], "monaco": "xA‸\nyB‸\nzC‸", "clipboard": null},
    {"name": "multi-cursor paste 2 lines into 3 cursors", "doc": "x‸\ny‸\nz‸", "clip": "A\nB", "keys": ["Meta+v"], "monaco": "xA\nB‸\nyA\nB‸\nzA\nB‸", "clipboard": null},
    {"name": "multi-cursor empty-sel copy (3 lines) + paste", "doc": "‸a1\n‸b2\n‸c3", "clip": null, "keys": ["Meta+c", "Meta+v"], "monaco": "a1‸a1\nb2‸b2\nc3‸c3", "clipboard": null},
    {"name": "paste empty clipboard", "doc": "a⟨b⟩c", "clip": "", "keys": ["Meta+v"], "monaco": "a‸c", "clipboard": null},
    {"name": "paste trailing newline", "doc": "a‸bc", "clip": "X\n", "keys": ["Meta+v"], "monaco": "aX\n‸bc", "clipboard": null},
    {"name": "cut empty mid col2", "doc": "aaa\nbb‸bb\nccc", "clip": null, "keys": ["Meta+x"], "monaco": "aaa\n‸ccc", "clipboard": "bbbb\n"},
    {"name": "cut empty last col2", "doc": "aaa\nbbbb\nccc‸", "clip": null, "keys": ["Meta+x"], "monaco": "aaa\nbbbb‸", "clipboard": "ccc\n"},
    {"name": "cut only line", "doc": "a‸bc", "clip": null, "keys": ["Meta+x"], "monaco": "‸", "clipboard": "abc\n"},
    {"name": "cut 2 cursors diff lines", "doc": "a‸a\nbb\nc‸c\ndd", "clip": null, "keys": ["Meta+x"], "monaco": "‸bb\n‸dd", "clipboard": "aa\ncc\n"},
    {"name": "cut 2 cursors last two lines", "doc": "aa\nb‸b\nc‸c", "clip": null, "keys": ["Meta+x"], "monaco": "aa\n‸", "clipboard": "bb\ncc\n"},
    {"name": "mixed empty+sel copy", "doc": "a‸a\n⟨bb⟩\ncc", "clip": null, "keys": ["Meta+c"], "monaco": "a‸a\n⟨bb⟩\ncc", "clipboard": "aa\nbb"},
    {"name": "copy line, paste at col0 of other", "doc": "a‸aa\nbbb\nccc", "clip": null, "keys": ["Meta+c", "ArrowDown", "Meta+ArrowLeft", "Meta+v"], "monaco": "aaa\naaa\n‸bbb\nccc", "clipboard": null},
    {"name": "copy line, paste at eol of last", "doc": "a‸aa\nbbb\nccc", "clip": null, "keys": ["Meta+c", "Meta+ArrowDown", "Meta+v"], "monaco": "aaa\nbbb\naaa\nccc‸", "clipboard": null},
    {"name": "copy line, paste twice", "doc": "a‸aa\nbbb", "clip": null, "keys": ["Meta+c", "Meta+v", "Meta+v"], "monaco": "aaa\naaa\na‸aa\nbbb", "clipboard": null},
    {"name": "cut line, paste twice + undo", "doc": "a‸aa\nbbb\nccc", "clip": null, "keys": ["Meta+x", "Meta+v", "Meta+v", "Meta+z"], "monaco": "aaa\n‸bbb\nccc", "clipboard": null},
]

beforeEach(() => { resetClipboardMeta(); clipboard = '__init__' })

describe('剪贴板 —— Monaco 实测', () => {
    for (const row of ROWS) {
        it(row.name, async () => {
            if (row.clip !== null) clipboard = row.clip
            const r = mount({ lm, core }, { doc: row.doc })
            try {
                for (const k of row.keys) { r.press(k); await flush() }
                expect(r.result()).toBe(row.monaco)
                if (row.clipboard !== null) expect(clipboard).toBe(row.clipboard)
            } finally { r.destroy() }
        })
    }
})

describe('剪贴板 —— 元数据只认本编辑器复制出去的文本', () => {
    it('外部程序改了剪贴板(文本不同)→ 不按整行插到行首', async () => {
        const r = mount({ lm, core }, { doc: 'aaa\nb‸bb' })
        try {
            r.press('Meta+c'); await flush()
            clipboard = 'bbb\n'.toUpperCase()
            r.press('ArrowUp'); r.press('Meta+v'); await flush()
            expect(r.result()).toBe('aBBB\n‸aa\nbbb')
        } finally { r.destroy() }
    })
})
