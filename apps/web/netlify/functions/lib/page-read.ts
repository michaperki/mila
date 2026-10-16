import Anthropic from '@anthropic-ai/sdk'
import { recordClaude } from './ai-usage'

// One vision-model pass over a photographed page, used when the learner commits to
// reading it (not for live preview). The model sees the photo and Google Vision's OCR
// as a hint, so it can fix misread letters, leave out page furniture, keep the page's
// paragraphs and headings, and translate each sentence with the page as context.
export type PageSentence = { he: string; en: string }
export type PageBlock = { kind: 'heading' | 'paragraph'; sentences: PageSentence[] }
export type PageRead = {
  blocks: PageBlock[]
  // The first sentence finishes one from the previous page / the last one runs onto the next page.
  startsMidSentence: boolean
  endsMidSentence: boolean
  // True only when a previous-page fragment was sent and this page completes it.
  continuesPrevious: boolean
  // Running headers, page numbers and other text left out of the reading, for field reports.
  omitted: string[]
}

const sentence = {
  type: 'object', additionalProperties: false, required: ['he', 'en'],
  properties: {
    he: { type: 'string', description: 'The Hebrew sentence exactly as printed (corrected for OCR misreadings), without niqqud.' },
    en: { type: 'string', description: 'Natural English translation of this sentence in the context of the page.' },
  },
} as const

const schema = {
  type: 'object', additionalProperties: false, required: ['blocks', 'startsMidSentence', 'endsMidSentence', 'continuesPrevious', 'omitted'],
  properties: {
    blocks: {
      type: 'array',
      description: 'The readable text in reading order: each heading or paragraph, split into sentences.',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'sentences'],
        properties: { kind: { type: 'string', enum: ['heading', 'paragraph'] }, sentences: { type: 'array', items: sentence } },
      },
    },
    startsMidSentence: { type: 'boolean', description: 'True if the first sentence on the page begins partway through a sentence.' },
    endsMidSentence: { type: 'boolean', description: 'True if the last sentence on the page is cut off and continues on the next page.' },
    continuesPrevious: { type: 'boolean', description: 'True only if a previous-page fragment was given and this page\'s first sentence completes it.' },
    omitted: { type: 'array', items: { type: 'string' }, description: 'Text deliberately left out: running headers or footers (book or chapter title repeated on every page), page numbers, captions of cut-off neighbouring pages.' },
  },
} as const

const SYSTEM = `You transcribe and translate photographed Hebrew text for an app that teaches English speakers to read Hebrew.

You get a photo and the text Google's OCR read from it. The OCR is a hint: it often drops or swaps letters (especially at the start of a line, and where niqqud or dagesh is printed), merges lines, and misreads punctuation. Read the photo and give the text that is actually printed. Never "improve" the author's wording; only fix recognition errors.

- Write Hebrew without niqqud, keeping the printed spelling.
- Leave out page furniture: running headers and footers such as the book or chapter title repeated at the top of each page, page numbers, and partial text from a neighbouring page at the edge of the photo. List what you left out in "omitted".
- Keep a real title or chapter heading as a "heading" block. Keep the page's paragraph breaks.
- Split paragraphs into sentences at the printed sentence punctuation. Dialogue keeps its quotation marks.
- Translate each sentence into natural, idiomatic English that a reader of a published translation would expect, using the surrounding sentences for context. Keep names as they are usually written in English.
- If the page begins partway through a sentence, set startsMidSentence and give the fragment as the first sentence. If the last sentence is cut off at the bottom of the page, set endsMidSentence and translate the fragment as far as it goes, ending with "…".
- If there is no Hebrew text in the photo, return no blocks.`

let client: Anthropic | null = null

export async function readPage(input: { image: string; ocr: string; previous?: string; userId: string }): Promise<PageRead> {
  client ??= new Anthropic()
  const previous = input.previous
    ? `\n\nThe previous page ended mid-sentence with:\n${input.previous}\nIf this page's first sentence completes it, set continuesPrevious, give only the part printed on this page as the first sentence's "he", and translate the complete joined sentence as its "en". If it does not (a different page or book), ignore it.`
    : ''
  const started = Date.now()
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // A page is a bounded transcription task; low effort keeps it well inside the
    // function's 60-second limit.
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.image } },
        { type: 'text', text: `OCR text (hint only):\n${input.ocr || '(none)'}${previous}` },
      ],
    }],
  }, { timeout: 45000, maxRetries: 0 })
  // Recorded before any checks: a refused or truncated read still used tokens.
  await recordClaude(input.userId, 'page', response, Date.now() - started)
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('Page read refused'), { code: 'READ_REFUSED' })
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('Page read truncated'), { code: 'READ_TRUNCATED' })
  const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const page = JSON.parse(text) as PageRead
  // Drop empty sentences/blocks the model may emit around furniture it removed.
  page.blocks = page.blocks
    .map(block => ({ ...block, sentences: block.sentences.filter(item => item.he.trim()) }))
    .filter(block => block.sentences.length)
  return page
}
