// 逐键快照:每按一个键就取一次 sel / value / 光标框 / 选区框,差异能定位到第几个键
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
export { mod }
export const S0 = { geometry: false, cursorRect: true, selRects: true }
export function trace(name, create, keys, spec = {}) {
    const steps = []
    keys.forEach((k, i) => {
        if (Array.isArray(k)) steps.push(k[0] === 'type' ? { do: 'type', text: k[1] } : { do: 'insertText', text: k[1] })
        else steps.push({ do: 'keys', keys: [k] })
        steps.push({ do: 'snap', label: `k${String(i).padStart(2, '0')}_${Array.isArray(k) ? k[1] : k}`, spec: { ...S0, ...spec } })
    })
    return { name, create, steps }
}
