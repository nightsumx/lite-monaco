// 子进程里加载 monaco-editor 的 esm:把 .css 当空模块
export async function load(url, ctx, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }
  return next(url, ctx)
}
