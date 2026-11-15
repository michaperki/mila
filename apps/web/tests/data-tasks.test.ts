import { describe, expect, it } from 'vitest'
import { exportRows, planImport, TASKS, type TaskEntry, updateFor } from '../netlify/functions/lib/data-tasks'
import { levelOf, TAXONOMY_VERSION } from '../netlify/functions/lib/taxonomy'

const words: TaskEntry[] = [
  { id: 'owl', lemma: 'יַנְשׁוּף', lemmaPlain: 'ינשוף', gloss: 'owl', partOfSpeech: 'noun', rank: 9000, encounters: [{ context: 'ינשוף עף' }] },
  { id: 'husband', lemma: 'ובעלה הכלומניק', gloss: 'and her good-for-nothing husband', partOfSpeech: 'phrase' },
  { id: 'stared', lemma: 'בהתה חזרה', gloss: 'stared back', partOfSpeech: 'phrase' },
  { id: 'stare', lemma: 'לִבְהוֹת', lemmaPlain: 'לבהות', gloss: 'to stare', partOfSpeech: 'verb' },
]

describe('export', () => {
  it('sends each task only what it reads, and only the words it works on', () => {
    const classify = exportRows(TASKS['classify-v1'], words)
    expect(classify).toHaveLength(4)
    expect(classify[0]).toEqual({ id: 'owl', word: 'יַנְשׁוּף', meaning: 'owl', partOfSpeech: 'noun', frequencyLevel: 'uncommon', example: 'ינשוף עף' })
    expect(exportRows(TASKS['normalize-v1'], words).map(row => row.id)).toEqual(['husband', 'stared'])
    expect(exportRows(TASKS['normalize-v1'], [{ ...words[1], archived: true }])).toEqual([])
  })
  it('works out level from frequency', () => {
    expect([levelOf(500), levelOf(2000), levelOf(9000), levelOf(20000), levelOf(undefined)]).toEqual(['core', 'common', 'uncommon', 'rare', undefined])
  })
})

describe('import', () => {
  it('previews what changes, from what to what, and leaves unchanged rows alone', () => {
    const plan = planImport('classify-v1', [
      { id: 'owl', word: 'יַנְשׁוּף', categories: ['nature'], register: 'everyday' },
      { id: 'stare', categories: ['mind'] },
      { id: 'stare', categories: ['body'] },
    ], [...words.slice(0, 3), { ...words[3], categories: ['mind'] }])
    if ('error' in plan) throw new Error(plan.error)
    expect(plan.changes).toEqual([
      { id: 'owl', lemma: 'יַנְשׁוּף', field: 'categories', from: null, to: ['nature'] },
      { id: 'owl', lemma: 'יַנְשׁוּף', field: 'register', from: null, to: 'everyday' },
    ])
    expect(plan.unchanged).toBe(1)
    expect(plan.rejected).toEqual([{ id: 'stare', reason: 'this word comes twice; only the first is used' }])
  })
  it('never lets a row touch what was learned, or a value outside the task', () => {
    const plan = planImport('classify-v1', [
      { id: 'owl', categories: ['nature'], results: [true, true] },
      { id: 'stare', categories: ['nature', 'mind', 'body', 'feelings'] },
      { id: 'stare-x', categories: ['mind'] },
      { id: 'husband', register: 'posh' },
    ], words)
    if ('error' in plan) throw new Error(plan.error)
    expect(plan.changes).toEqual([])
    expect(plan.rejected.map(row => row.id)).toEqual(['owl', 'stare', 'stare-x', 'husband'])
    expect(plan.rejected[0].reason).toContain("results can't be changed")
    expect(planImport('normalize-v1', [{ id: 'owl', gloss: 'owl', forms: [] }], words)).toMatchObject({ rejected: [{ id: 'owl' }] })
  })
  it('fixes a word into its dictionary form, archives a clause, and refuses a form saved already', () => {
    const plan = planImport('normalize-v1', [
      { id: 'husband', archived: true },
      { id: 'stared', lemma: 'לִבְהוֹת חֲזָרָה', gloss: 'to stare back', partOfSpeech: 'expression' },
    ], words)
    if ('error' in plan) throw new Error(plan.error)
    expect(plan.changes.map(change => `${change.id}.${change.field}`)).toEqual(['husband.archived', 'stared.lemma', 'stared.gloss', 'stared.partOfSpeech'])
    const duplicate = planImport('normalize-v1', [{ id: 'stared', lemma: 'לבהות' }], words)
    expect(duplicate).toMatchObject({ changes: [], rejected: [{ id: 'stared' }] })
  })
  it('updates what follows from a change, and refuses what it can\'t read', () => {
    expect(updateFor([{ id: 'stared', lemma: '', field: 'lemma', from: 'בהתה חזרה', to: 'לִבְהוֹת חֲזָרָה' }]).set).toEqual({ lemma: 'לִבְהוֹת חֲזָרָה', lemmaPlain: 'לבהות חזרה', lemmaKey: 'לבהות חזרה' })
    expect(updateFor([{ id: 'owl', lemma: '', field: 'categories', from: null, to: ['nature'] }]).set).toEqual({ categories: ['nature'], taxonomy: TAXONOMY_VERSION })
    expect(updateFor([{ id: 'owl', lemma: '', field: 'register', from: 'everyday', to: null }]).unset).toEqual({ register: '' })
    expect(planImport('classify-v1', {}, words)).toHaveProperty('error')
    expect(planImport('rename-everything', [{ id: 'owl' }], words)).toHaveProperty('error')
  })
})
