import { AsyncLocalStorage } from 'node:async_hooks'
import type { Handler, HandlerContext, HandlerEvent } from '@netlify/functions'
import { verifyAuth } from './auth'
import { isAdmin } from './ai-usage'
import { getDb } from './mongo'

// Debug capture, server side (2026-11-22): while a developer's capture is on (Account → Debug
// capture in Mila Preview, debug-trace.ts), each request the phone makes says so in its headers
// (x-mila-capture, x-mila-action: the user action that caused it, x-mila-request: the phone's id
// for this request), and the function records what it did as spans: the request itself, each
// database operation and each AI call, with when it started and ended and where its answer came
// from. Spans are metadata: operation names, timings, field names, sizes, tokens and cost. Only a
// capture started with "exact prompts" also keeps each AI request as sent to the provider.
// Outside a capture nothing here does anything. The context follows the request through async work
// (AsyncLocalStorage), so library code (the AI cache, spend checks, model calls) records into the
// request that called it without being passed anything.

export type ServerSpan = {
  kind: 'server' | 'db' | 'ai'; name: string; start: number; end: number
  source?: string; fields?: Record<string, unknown>; prompt?: unknown
}
type Trace = { capture: string; action: string | null; request: string | null; prompts: boolean; userId: string; spans: ServerSpan[] }
const current = new AsyncLocalStorage<Trace>()
// Captures known to be on, by id, for a minute: one database read per capture and instance.
const active = new Map<string, { userId: string; prompts: boolean; until: number }>()

const header = (event: HandlerEvent, name: string) => {
  const value = event.headers?.[name] ?? event.headers?.[name.toLowerCase()]
  return typeof value === 'string' && value.length <= 80 ? value : null
}
async function traceOf(event: HandlerEvent): Promise<Trace | null> {
  const capture = header(event, 'x-mila-capture')
  if (!capture) return null
  let auth
  try { auth = verifyAuth(event) } catch { return null }
  if (!isAdmin(auth.email)) return null
  let known = active.get(capture)
  if (!known || known.until < Date.now()) {
    const doc = await (await getDb()).collection('debugCaptures').findOne({ id: capture, userId: auth.userId, stoppedAt: null }).catch(() => null)
    if (!doc) return null
    known = { userId: auth.userId, prompts: !!doc.prompts, until: Date.now() + 60_000 }
    active.set(capture, known)
  }
  if (known.userId !== auth.userId) return null
  return { capture, action: header(event, 'x-mila-action'), request: header(event, 'x-mila-request'), prompts: known.prompts, userId: auth.userId, spans: [] }
}

// A function handler that records itself while a capture is on: the request as one span (with its
// status), and whatever it did inside, written before the reply goes back (only while capturing).
export function traced(name: string, handler: Handler): Handler {
  return (async (event: HandlerEvent, context: HandlerContext) => {
    const trace = await traceOf(event).catch(() => null)
    if (!trace) return handler(event, context)
    const start = Date.now()
    const result = await current.run(trace, () => handler(event, context))
    trace.spans.unshift({ kind: 'server', name, start, end: Date.now(), fields: { status: (result as { statusCode?: number } | void)?.statusCode ?? null, method: event.httpMethod } })
    await (await getDb()).collection('debugSpans').insertMany(trace.spans.map(span => ({
      ...span, userId: trace.userId, capture: trace.capture, action: trace.action, request: trace.request, side: 'server',
    }))).catch(error => console.error('Debug spans not kept', { name: (error as Error).name }))
    return result
  }) as Handler
}

export const capturing = () => !!current.getStore()
export const promptsWanted = () => !!current.getStore()?.prompts
// Records one span in the request being captured, if any.
export function note(span: ServerSpan) { current.getStore()?.spans.push(span) }
// Times `work` as a span (database or server step) in the request being captured; otherwise just runs it.
export async function timed<T>(kind: ServerSpan['kind'], name: string, work: () => Promise<T>, describe?: (result: T) => Pick<ServerSpan, 'source' | 'fields'>): Promise<T> {
  if (!current.getStore()) return work()
  const start = Date.now()
  const result = await work()
  note({ kind, name, start, end: Date.now(), ...(describe ? describe(result) : {}) })
  return result
}
