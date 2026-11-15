// One request at a time for the same thing: a call made while one is on its way for the same
// key gets that one's answer instead of asking (and paying) again. Once it settles, the next
// call asks anew, so a failure is retried the next time rather than kept.
export function sharing<T>() {
  const pending = new Map<string, Promise<T>>()
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const found = pending.get(key)
    if (found) return found
    const promise = run().finally(() => { if (pending.get(key) === promise) pending.delete(key) })
    pending.set(key, promise)
    return promise
  }
}
