// base/common/network:除 FileAccess 外原样转出真 Monaco 实现。
// FileAccess.asFileUri('vs/…') 原版靠 AMD/ESM 加载器定位 out/ 目录,这里直接映射到 MONACO_SRC/src/ 下(测试夹具所在)。
import { homedir } from 'node:os'
import { resolve } from 'node:path'
export * from '../../../../reference/_vscode-src/src/vs/base/common/network'
const SRC = process.env.MONACO_SRC ?? resolve(homedir(), 'Documents/reference/_vscode-src')
export const FileAccess = {
    asFileUri(p: string) { const fsPath = resolve(SRC, 'src', p); return { fsPath, path: fsPath, scheme: 'file', toString: () => 'file://' + fsPath } },
}
