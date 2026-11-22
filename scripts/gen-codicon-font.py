#!/usr/bin/env python3
"""把 src/assets/codicon.ttf 转成 woff2 并写回 src/core/chrome/codicon-woff2.ts 的 @font-face。
需要 fonttools + brotli:pip install fonttools brotli。ttf 82 KB → woff2 36 KB,内联进 JS 后 gzip 少约 20 KB。"""
import base64, io, re, pathlib
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parent.parent
font = TTFont(root / 'src/assets/codicon.ttf')
font.flavor = 'woff2'
buf = io.BytesIO(); font.save(buf)
b64 = base64.b64encode(buf.getvalue()).decode()
p = root / 'src/core/chrome/codicon-woff2.ts'
s = p.read_text()
s2, n = re.subn(r'src: url\(data:font/(?:ttf|woff2);base64,[A-Za-z0-9+/=]+\) format\("(?:truetype|woff2)"\);',
                f'src: url(data:font/woff2;base64,{b64}) format("woff2");', s, count=1)
assert n == 1, 'font-face src not found'
p.write_text(s2)
print('woff2 bytes', len(buf.getvalue()))
