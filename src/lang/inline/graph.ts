// 有向图(行内补全 provider 的 yieldsToGroupIds 依赖图)。移植自 inlineCompletions/browser/model/graph.ts。
export class DirectedGraph<T> {
    private readonly _nodes = new Set<T>()
    private readonly _outgoingEdges = new Map<T, Set<T>>()

    static from<T>(nodes: readonly T[], getOutgoing: (node: T) => readonly T[]): DirectedGraph<T> {
        const graph = new DirectedGraph<T>()
        for (const node of nodes) graph._nodes.add(node)
        for (const node of nodes) {
            const outgoing = getOutgoing(node)
            if (outgoing.length > 0) graph._outgoingEdges.set(node, new Set(outgoing))
        }
        return graph
    }

    /** 调用之后保证无环;返回被发现的环上节点,去掉的是「回边」 */
    removeCycles(): { foundCycles: T[] } {
        const foundCycles: T[] = []
        const visited = new Set<T>()
        const stack = new Set<T>()
        const toRemove: Array<{ from: T, to: T }> = []
        const dfs = (node: T): void => {
            visited.add(node)
            stack.add(node)
            const outgoing = this._outgoingEdges.get(node)
            if (outgoing) {
                for (const neighbor of outgoing) {
                    if (!visited.has(neighbor)) dfs(neighbor)
                    else if (stack.has(neighbor)) { foundCycles.push(neighbor); toRemove.push({ from: node, to: neighbor }) }
                }
            }
            stack.delete(node)
        }
        for (const node of this._nodes) if (!visited.has(node)) dfs(node)
        for (const { from, to } of toRemove) this._outgoingEdges.get(from)?.delete(to)
        return { foundCycles }
    }

    getOutgoing(node: T): readonly T[] {
        const outgoing = this._outgoingEdges.get(node)
        return outgoing ? Array.from(outgoing) : []
    }
}
