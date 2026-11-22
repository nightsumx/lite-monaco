// 拖放 / 粘贴编辑(Monaco dropOrPasteInto/browser/edit.ts)的纯函数:多个 provider 给出的 edit 按 yieldTo 排序。
// edit A 声明 yieldTo B(按 kind 前缀或 mimeType)= A 让位给 B,B 排在 A 前面;让位链做拓扑排序,环就原样返回并告警。

/** HierarchicalKind 的结构形态(只要 contains):'a.b' 包含 'a.b.c','' 包含一切 */
export interface KindLike { readonly value: string, contains(other: KindLike): boolean }
/** Monaco languages.DropYieldTo */
export type DropYieldTo = { readonly kind: KindLike } | { readonly mimeType: string }

export interface YieldingEdit {
    readonly kind: KindLike | undefined
    readonly handledMimeType?: string
    readonly yieldTo?: readonly DropYieldTo[]
}

export function sortEditsByYieldTo<T extends YieldingEdit>(edits: readonly T[]): T[] {
    const yieldsTo = (yTo: DropYieldTo, other: T): boolean =>
        'mimeType' in yTo ? yTo.mimeType === other.handledMimeType : !!other.kind && yTo.kind.contains(other.kind)

    // 每个 edit 让位给哪些 edit
    const yieldsToMap = new Map<T, T[]>()
    for (const edit of edits) {
        for (const yTo of edit.yieldTo ?? []) {
            for (const other of edits) {
                if (other === edit || !yieldsTo(yTo, other)) continue
                let arr = yieldsToMap.get(edit)
                if (!arr) yieldsToMap.set(edit, arr = [])
                arr.push(other)
            }
        }
    }
    if (!yieldsToMap.size) return Array.from(edits)

    // 拓扑排序:先放被让位的,再放自己
    const visited = new Set<T>()
    const stack: T[] = []
    const visit = (nodes: T[]): T[] => {
        if (!nodes.length) return []
        const node = nodes[0]
        if (stack.includes(node)) { console.warn('Yield to cycle detected', node); return nodes }
        if (visited.has(node)) return visit(nodes.slice(1))
        let pre: T[] = []
        const yTo = yieldsToMap.get(node)
        if (yTo) { stack.push(node); pre = visit(yTo); stack.pop() }
        visited.add(node)
        return [...pre, node, ...visit(nodes.slice(1))]
    }
    return visit(Array.from(edits))
}
