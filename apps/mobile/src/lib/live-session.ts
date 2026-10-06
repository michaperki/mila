// A bounded serial loop: never queue camera frames behind a slow network request.
export function createLiveSession<T>(options: {
  sample: (signal: AbortSignal) => Promise<T>
  onResult: (result: T) => void
  onError: (error: Error) => void
  onStop: () => void
  intervalMs?: number
  durationMs?: number
  maxSamples?: number
}) {
  let active = true
  let count = 0
  let next: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  const stop = () => {
    if (!active) return
    active = false
    controller.abort()
    clearTimeout(next)
    clearTimeout(deadline)
    options.onStop()
  }
  const deadline = setTimeout(stop, options.durationMs ?? 30000)
  const tick = async () => {
    if (!active) return
    try {
      const result = await options.sample(controller.signal)
      if (!active) return
      options.onResult(result)
      count++
      if (count >= (options.maxSamples ?? 6)) { stop(); return }
      next = setTimeout(() => { void tick() }, options.intervalMs ?? 3000)
    } catch (failure) {
      if (!active) return
      options.onError(failure instanceof Error ? failure : new Error('Camera recognition failed.'))
      stop()
    }
  }
  void tick()
  return { stop }
}
