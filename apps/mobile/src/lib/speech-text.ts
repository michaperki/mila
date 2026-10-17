// Splits Hebrew for reading aloud: one piece per sentence, and a sentence longer than `max`
// broken at the last comma or space that fits. The `speech` function reads one piece per call
// (600 characters at most), so the first piece plays while the next is fetched.
export function speechPieces(text: string | string[], max = 500): string[] {
  const parts = (Array.isArray(text) ? text : [text])
    .flatMap(part => part.split(/(?<=[.!?:;׃])\s+|\n+/))
    .map(part => part.trim()).filter(part => /[֐-׿\w]/.test(part))
  return parts.flatMap(part => {
    const pieces: string[] = []
    let rest = part
    while (rest.length > max) {
      const window = rest.slice(0, max)
      const comma = window.lastIndexOf(', '), space = window.lastIndexOf(' ')
      const cut = comma > 0 ? comma + 1 : space > 0 ? space : max
      pieces.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim()
    }
    if (rest) pieces.push(rest)
    return pieces
  })
}

// Speeds offered by the speed chip, in tap order.
export const RATES = [1, 0.5, 0.25] as const
export type Rate = typeof RATES[number]
export const nextRate = (rate: Rate): Rate => RATES[(RATES.indexOf(rate) + 1) % RATES.length]
export const rateLabel = (rate: Rate) => (rate === 1 ? '1×' : rate === 0.5 ? '½×' : '¼×')
