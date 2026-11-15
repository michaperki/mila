// An AI's answer as pasted: the JSON array in it, wherever it is (inside a code block, after a
// sentence), or the rows of an object that has them.
export function rowsIn(text: string): unknown[] | null {
  const start = text.indexOf('['), end = text.lastIndexOf(']')
  const tries = [text.trim(), start >= 0 && end > start ? text.slice(start, end + 1) : '']
  for (const attempt of tries) {
    if (!attempt) continue
    try {
      const parsed = JSON.parse(attempt) as unknown
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)) return (parsed as { rows: unknown[] }).rows
    } catch { /* the next way of reading it */ }
  }
  return null
}
