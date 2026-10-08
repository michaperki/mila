// Turns raw OCR (one string, page layout line breaks) into reading segments:
// headings stay on their own, soft-wrapped lines are rejoined, sentences are split,
// and page furniture (running headers, page numbers, stray glyphs) is dropped.
export type Segment = { text: string; heading?: boolean; marker?: string }

const STRAY = /[◄►▶◀◂▸•▪■□●○◆◇★☆→←⇐⇒➔➤✓✔]/g
const END = /[.?!:;״"׳'”)]$/
const SENTENCE_END = /[.?!]$/
// A digit misread as a Latin letter or bar, used as a list marker: "I. מה ..." → "1."
const MARKER = /^(\d{1,2}|[IlI|])[.)]\s+/

const words = (line: string) => line.split(/\s+/).filter(Boolean)
const hasHebrew = (line: string) => /[֐-׿]/.test(line)

function isPageFurniture(line: string) {
  if (!hasHebrew(line)) return /^[\d\s\-–—.|]*$/.test(line) || line.length <= 2
  // Running header/footer: a short line that starts or ends with a page number.
  const count = words(line).length
  return count <= 7 && !/[.?!,:]/.test(line) && (/^\d{1,3}\s/.test(line) || /\s\d{1,3}$/.test(line))
}

export function cleanOcr(raw: string, options: { trimPageFurniture?: boolean } = {}): Segment[] {
  let lines = raw.split(/\r?\n/).map(line => line.replace(STRAY, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (options.trimPageFurniture !== false) {
    lines = lines.filter(line => hasHebrew(line) || !isPageFurniture(line))
    if (lines.length > 2 && isPageFurniture(lines[0])) lines.shift()
    if (lines.length > 2 && isPageFurniture(lines[lines.length - 1])) lines.pop()
  }
  if (lines.length === 0) return []

  // Signs, menus and labels have no sentence punctuation; each line stands alone.
  const prose = lines.some(line => SENTENCE_END.test(line))
  const longest = Math.max(...lines.map(line => line.length))
  const blocks: Segment[] = []
  let current: Segment | null = null
  const flush = () => { if (current?.text) blocks.push(current); current = null }

  lines.forEach((line, index) => {
    let marker: string | undefined
    const match = line.match(MARKER)
    if (match) { marker = /\d/.test(match[1]) ? match[1] : '1'; line = line.slice(match[0].length) }
    const previousEnded = !current || END.test(current.text)
    const heading = prose && !marker && previousEnded && index < lines.length - 1 && !END.test(line)
      && words(line).length <= 5 && line.length < longest * 0.6
    if (!prose || marker || heading || previousEnded) flush()
    if (heading) { blocks.push({ text: line, heading: true }); return }
    if (!current) { current = { text: line, ...(marker ? { marker } : {}) }; return }
    // A line ending in a maqaf/hyphen continues a compound (בית־ / הספר): no space.
    current.text = /[־-]$/.test(current.text) ? current.text + line : `${current.text} ${line}`
  })
  flush()

  return blocks.flatMap(block => {
    if (block.heading) return [block]
    const sentences = block.text.split(/(?<=[.?!])\s+(?=\S)/)
    return sentences.map((text, i) => (i === 0 && block.marker ? { text, marker: block.marker } : { text }))
  })
}

export const segmentText = (segment: Segment) => (segment.marker ? `${segment.marker}. ${segment.text}` : segment.text)

// Bounded so a run of lines can't produce a very long card title.
export function titleFrom(text: string, max = 48) {
  const line = text.split('\n').find(value => value.trim())?.trim() || ''
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`
}

const NIQQUD = /[֑-ׇ]/g
export const stripNiqqud = (text: string) => text.replace(NIQQUD, '')
// Punctuation that hugs a word but isn't part of it (Hebrew geresh ׳ / gershayim ״ are kept mid-word).
export const bareWord = (surface: string) => surface.replace(/^[\s.,!?;:״"'׳()[\]{}«»\-–—]+|[\s.,!?;:״"'׳()[\]{}«»\-–—]+$/g, '')
