// Where reading stopped: the saved passage and the sentence last selected in it.
export type LastRead = { id: string; segment: number; title: string; at: number }
export function parseLastRead(value: string): LastRead | null {
  try {
    const read = JSON.parse(value) as Partial<LastRead>
    return typeof read.id === 'string' && typeof read.segment === 'number' && typeof read.title === 'string' && typeof read.at === 'number' ? read as LastRead : null
  } catch { return null }
}
