// 首帧之后再做的事:rAF 里排一个 0ms 定时器 = 浏览器把这一帧画完之后的第一个任务。
// 只用 setTimeout(0) 不行:它常常排在首帧之前,几十毫秒的活会把首帧顶后。
// 页面在后台(rAF 不触发)或没有 rAF(测试环境)时,200ms 的兜底定时器保证一定会跑。
// 返回取消函数;已经跑过或取消过就是空操作。

export function afterNextPaint(fn: () => void): () => void {
    let done = false
    let raf = 0
    let t1 = 0
    let t2 = 0
    const g = typeof window !== 'undefined' ? window : undefined
    const run = () => {
        if (done) return
        done = true
        cancel()
        fn()
    }
    const cancel = () => {
        g?.clearTimeout(t1)
        g?.clearTimeout(t2)
        if (raf) g?.cancelAnimationFrame(raf)
        t1 = t2 = raf = 0
    }
    if (!g) {
        t1 = setTimeout(run, 0) as unknown as number
        return () => { done = true; clearTimeout(t1) }
    }
    if (typeof g.requestAnimationFrame === 'function')
        raf = g.requestAnimationFrame(() => { raf = 0; t1 = g.setTimeout(run, 0) })
    t2 = g.setTimeout(run, typeof g.requestAnimationFrame === 'function' ? 200 : 0)
    return () => { done = true; cancel() }
}
