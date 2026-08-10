function jsonFallback(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Logseq 有些 API 会 reject 普通对象而不是 Error，保留其中可读的诊断字段。 */
export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>
    for (const key of ['message', 'error', 'reason', 'data']) {
      const value = record[key]
      if (typeof value === 'string' && value) return value
      if (value && typeof value === 'object') {
        const nested = jsonFallback(value)
        if (nested && nested !== '{}') return nested
      }
    }
    const serialized = jsonFallback(cause)
    if (serialized && serialized !== '{}') return serialized
  }
  return String(cause)
}
