import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: function Anthropic() { return { beta: { messages: { create } } } } }))
vi.mock('../netlify/functions/lib/ai-usage', () => ({ recordClaude: vi.fn() }))
import { readPage } from '../netlify/functions/lib/page-read'

const reply = (page: unknown, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: JSON.stringify(page) }] })
beforeEach(() => vi.clearAllMocks())
describe('page read', () => {
  it('sends the photo with the OCR hint and the previous page fragment', async () => {
    create.mockResolvedValue(reply({ blocks: [], startsMidSentence: false, endsMidSentence: false, continuesPrevious: false, omitted: [] }))
    await readPage({ image: 'aGVsbG8=', ocr: 'חד שמישהו', previous: 'הם חיו' })
    const request = create.mock.calls[0][0]
    expect(request.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } })
    expect(request.messages[0].content[1].text).toContain('חד שמישהו')
    expect(request.messages[0].content[1].text).toContain('הם חיו')
    expect(request.output_config.format.type).toBe('json_schema')
  })
  it('drops empty sentences and blocks', async () => {
    create.mockResolvedValue(reply({ blocks: [{ kind: 'heading', sentences: [{ he: ' ', en: '' }] }, { kind: 'paragraph', sentences: [{ he: 'שלום.', en: 'Hello.' }] }], startsMidSentence: false, endsMidSentence: false, continuesPrevious: false, omitted: ['33'] }))
    const page = await readPage({ image: 'aGVsbG8=', ocr: '' })
    expect(page.blocks).toEqual([{ kind: 'paragraph', sentences: [{ he: 'שלום.', en: 'Hello.' }] }])
  })
  it('reports refusals and truncation as errors so the endpoint falls back', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] })
    await expect(readPage({ image: 'aGVsbG8=', ocr: '' })).rejects.toMatchObject({ code: 'READ_REFUSED' })
    create.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"blo' }] })
    await expect(readPage({ image: 'aGVsbG8=', ocr: '' })).rejects.toMatchObject({ code: 'READ_TRUNCATED' })
  })
})
