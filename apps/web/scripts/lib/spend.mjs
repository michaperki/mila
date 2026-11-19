// A spending cap that holds (2026-11-19, after the distractor batch cost $0.45 against an estimate of
// $0.26): every paid batch script sends its requests through `cappedBatch`, which
// - counts each request's input exactly with the token-counting API (free),
// - takes its output at the most it can be, `max_tokens` (thinking included), which every request
//   must set,
// - and refuses to send anything unless that worst case, at batch price, is within the cap Mike
//   approved, given as `--cap <dollars>`. Without a cap it only reports the worst case.
// A request that reaches `max_tokens` is cut short and comes back unusable, never dearer.

export const PRICES = { 'claude-opus-5-5': { input: 4, output: 20 }, 'claude-sonnet-5-5': { input: 2, output: 10 } }
export const BATCH = 0.5

export const anthropic = key => (path, init = {}) => fetch(`https://api.anthropic.com/v1/${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', ...(init.headers || {}) } })

// `--cap 0.30` from the command line, or null.
export function capOf(argv) {
  const at = argv.indexOf('--cap')
  const cap = at >= 0 ? Number(argv[at + 1]) : NaN
  return Number.isFinite(cap) && cap > 0 ? cap : null
}

// The most `requests` can cost: input exactly, output at max_tokens, at batch price.
export async function worstCase(api, requests) {
  let input = 0, output = 0, dollars = 0
  for (const { params } of requests) {
    const price = PRICES[params.model]
    if (!price) throw new Error(`No price for ${params.model}`)
    if (!Number.isInteger(params.max_tokens)) throw new Error('Every request must set max_tokens')
    const { model, system, messages, output_config } = params
    const counted = await (await api('messages/count_tokens', { method: 'POST', body: JSON.stringify({ model, system, messages, ...(output_config?.format ? { output_config: { format: output_config.format } } : {}) }) })).json()
    if (typeof counted.input_tokens !== 'number') throw new Error(`Counting failed: ${JSON.stringify(counted).slice(0, 200)}`)
    input += counted.input_tokens; output += params.max_tokens
    dollars += (counted.input_tokens * price.input + params.max_tokens * price.output) / 1e6 * BATCH
  }
  return { input, output, dollars }
}

// Sends `requests` as one batch only within `cap`, and waits for the results. Returns null (having
// sent nothing) when there is no cap or the worst case is over it.
export async function cappedBatch(api, requests, cap, log = console.log) {
  const worst = await worstCase(api, requests)
  log(`${requests.length} requests: input ${worst.input} tokens (counted), output at most ${worst.output} tokens. At most $${worst.dollars.toFixed(3)} at batch price.`)
  if (cap === null) { log('No --cap given: nothing sent.'); return null }
  if (worst.dollars > cap) { log(`Over the cap of $${cap.toFixed(2)}: nothing sent. Lower max_tokens or send fewer requests.`); return null }
  const created = await (await api('messages/batches', { method: 'POST', body: JSON.stringify({ requests }) })).json()
  if (!created.id) throw new Error(`Batch not created: ${JSON.stringify(created).slice(0, 300)}`)
  log(`Batch ${created.id}, within the cap of $${cap.toFixed(2)}`)
  let batch = created
  while (batch.processing_status !== 'ended') {
    await new Promise(resolve => setTimeout(resolve, 15000))
    batch = await (await api(`messages/batches/${created.id}`)).json()
    log(' ', batch.processing_status, JSON.stringify(batch.request_counts))
  }
  const lines = (await (await api(`messages/batches/${created.id}/results`)).text()).trim().split('\n').map(line => JSON.parse(line))
  return { id: created.id, lines, worst }
}

// What a message cost, at batch price (its model as the API names it, which may carry a date).
export const costOf = message => {
  const price = PRICES[Object.keys(PRICES).find(model => String(message.model).startsWith(model)) ?? 'claude-opus-5-5']
  return (message.usage.input_tokens * price.input + message.usage.output_tokens * price.output) / 1e6 * BATCH
}
