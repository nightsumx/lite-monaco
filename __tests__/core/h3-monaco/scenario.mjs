// 同一份场景执行器:Monaco 的 TextModel 和 lite-monaco 的 TextModel 都用它跑,结果逐步对比。
// step = { m: 方法名, a: 参数数组 };特殊 step:'@options'(取选项投影)。
const plain = (v) => {
  if (v === undefined) return null
  return JSON.parse(JSON.stringify(v, (k, x) => (x instanceof RegExp ? String(x) : x)))
}

export function runScenario(model, steps) {
  const events = []
  const sub = model.onDidChangeContent(e => events.push({
    changes: e.changes.map(c => ({ range: plain(c.range), rangeOffset: c.rangeOffset, rangeLength: c.rangeLength, text: c.text })),
    eol: e.eol, versionId: e.versionId, isFlush: e.isFlush, isUndoing: e.isUndoing, isRedoing: e.isRedoing, isEolChange: !!e.isEolChange,
  }))
  const optEvents = []
  const sub2 = model.onDidChangeOptions(e => optEvents.push({ tabSize: e.tabSize, indentSize: e.indentSize, insertSpaces: e.insertSpaces, trimAutoWhitespace: e.trimAutoWhitespace }))
  const results = []
  for (const st of steps) {
    let r
    try {
      if (st.m === '@options') {
        const o = model.getOptions()
        r = { tabSize: o.tabSize, indentSize: o.indentSize, insertSpaces: o.insertSpaces, trimAutoWhitespace: o.trimAutoWhitespace, originalIndentSize: o.originalIndentSize, defaultEOL: o.defaultEOL }
      } else if (st.m === '@state') {
        r = { value: model.getValue(), eol: model.getEOL(), version: model.getVersionId(), lines: model.getLineCount() }
      } else {
        r = plain(model[st.m](...st.a))
        // Monaco 的反向操作带内部字段 sortIndex(IValidEditOperation 没声明)
        if (Array.isArray(r)) for (const x of r) if (x && typeof x === 'object') delete x.sortIndex
      }
    } catch (e) {
      r = { error: String(e && e.message || e) }
    }
    results.push({ r, events: events.splice(0), optEvents: optEvents.splice(0) })
  }
  sub.dispose(); sub2.dispose()
  return results
}
