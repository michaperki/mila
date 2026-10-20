import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { expect, it } from 'vitest'
import { analysisRequest, type WordAnalysis } from '../../netlify/functions/word-analysis'

// Does the word explanation tell a pattern (נטול + a noun) from a fixed expression (להעמיד פנים)
// from words that only combine as usual (ילד גדול)? Each case is a tapped word in a sentence,
// what kind of unit it belongs to and, for a unit, its fixed words in plain spelling. Prints
// every answer for reading through and fails below the bar. Add a case for every miss met in
// the app, near misses especially.
type Kind = 'pattern' | 'fixed' | 'none'
// `built`: whether a fixed expression should say how it is built (what it says word for word).
const cases: { word: string; sentence: string; kind: Kind; lemma?: string | string[]; built?: boolean }[] = [
  // Patterns: a word that opens a frame with an open place.
  { word: 'ונטול־ינשופים', sentence: 'הלילה בגן היה שקט ונטול־ינשופים.', kind: 'pattern', lemma: 'נטול' },
  { word: 'נטול', sentence: 'אני שותה רק קפה נטול קפאין בערב.', kind: 'pattern', lemma: 'נטול' },
  { word: 'נטולת', sentence: 'היא חזרה מהחופשה רגועה ונטולת דאגות.', kind: 'pattern', lemma: 'נטול' },
  { word: 'חסר', sentence: 'הנהג היה חסר סבלנות בפקק.', kind: 'pattern', lemma: 'חסר' },
  { word: 'בעל', sentence: 'אנחנו מחפשים מועמד בעל ניסיון בניהול.', kind: 'pattern', lemma: 'בעל' },
  { word: 'כדי', sentence: 'היא הלכה לספרייה כדי ללמוד בשקט.', kind: 'pattern', lemma: 'כדי' },
  { word: 'חשבתי', sentence: 'כל הלילה חשבתי על מה שאמרת לי.', kind: 'pattern', lemma: 'לחשוב על' },
  { word: 'מלא', sentence: 'החדר היה מלא אנשים.', kind: 'pattern', lemma: 'מלא' },
  { word: 'ככל', sentence: 'ככל שעובר הזמן, קל לי יותר.', kind: 'pattern', lemma: ['ככל ש', 'ככל ש יותר'] },
  // Fixed: every word belongs to it and it means more than its words.
  { word: 'מעמיד', sentence: 'הוא מעמיד פנים שהוא ישן.', kind: 'fixed', lemma: 'להעמיד פנים' },
  { word: 'ספר', sentence: 'הילדים הולכים לבית ספר חדש השנה.', kind: 'fixed', lemma: 'בית ספר' },
  { word: 'עורך', sentence: 'עורך הדין שלו מצוין.', kind: 'fixed', lemma: 'עורך דין' },
  { word: 'בסופו', sentence: 'בסופו של דבר הוא הסכים לבוא.', kind: 'fixed', lemma: 'בסופו של דבר', built: true },
  { word: 'שברתי', sentence: 'שברתי את הראש על החידה הזאת שעה שלמה.', kind: 'fixed', lemma: 'לשבור את הראש' },
  { word: 'מושג', sentence: 'אין לי מושג איפה שמתי את המפתחות.', kind: 'fixed', lemma: 'אין לי מושג', built: true },
  { word: 'ארוחת', sentence: 'אכלנו ארוחת בוקר במרפסת.', kind: 'fixed', lemma: 'ארוחת בוקר', built: false },
  { word: 'האמת', sentence: 'למען האמת, לא הבנתי כלום בשיעור.', kind: 'fixed', lemma: 'למען האמת', built: true },
  { word: 'הולדת', sentence: 'מחר יום ההולדת של אחי.', kind: 'fixed', lemma: 'יום הולדת' },
  // None: words that only combine as usual, many of them close to a unit.
  { word: 'גדול', sentence: 'ילד גדול שיחק בחצר.', kind: 'none' },
  { word: 'אדומה', sentence: 'היא קנתה שמלה אדומה לחתונה.', kind: 'none' },
  { word: 'ספר', sentence: 'ספר המורה מונח על השולחן.', kind: 'none' },
  { word: 'בחשבון', sentence: 'יש לנו מבחן בחשבון מחר.', kind: 'none' },
  { word: 'קרים', sentence: 'הוא שתה כוס מים קרים.', kind: 'none' },
  { word: 'חתול', sentence: 'ראיתי חתול שחור ברחוב.', kind: 'none' },
  { word: 'ארוך', sentence: 'התלמידים כתבו חיבור ארוך.', kind: 'none' },
  { word: 'חדשה', sentence: 'אבא קנה מכונית חדשה.', kind: 'none' },
  { word: 'צעק', sentence: 'המורה צעק בקול רם.', kind: 'none' },
  { word: 'אכלנו', sentence: 'אכלנו פיצה עם חברים.', kind: 'none' },
  { word: 'עייף', sentence: 'אחרי העבודה הוא היה עייף מאוד.', kind: 'none' },
  { word: 'החלון', sentence: 'היא פתחה את החלון של המטבח.', kind: 'none' },
  { word: 'נקיות', sentence: 'הידיים שלו נקיות עכשיו.', kind: 'none' },
  // None: one word with prefixes attached is read as its pieces, never as a unit of its own.
  { word: 'המתלחששים', sentence: 'הוא עבר ליד המתלחששים ומיהר הלאה.', kind: 'none' },
  { word: 'ובבית', sentence: 'בבוקר הלכנו לים ובבית חיכתה לנו ארוחה.', kind: 'none' },
  { word: 'כשהגיע', sentence: 'כשהגיע הביתה, כולם כבר ישנו.', kind: 'none' },
  { word: 'מהחלון', sentence: 'היא הסתכלה מהחלון על הגשם.', kind: 'none' },
  { word: 'ושמחתי', sentence: 'קיבלתי את המכתב ושמחתי מאוד.', kind: 'none' },
  { word: 'לחבריו', sentence: 'הוא סיפר לחבריו על הטיול.', kind: 'none' },
]

const env = (() => { try { return readFileSync(new URL('../../.env', import.meta.url), 'utf8') } catch { return '' } })()
const apiKey = process.env.ANTHROPIC_API_KEY || env.match(/^ANTHROPIC_API_KEY\s*=\s*['"]?([^'"\s]+)/m)?.[1]
const plain = (text: string) => text.replace(/[\u0591-\u05C7]/g, '').replace(/[.,…]/g, '').replace(/[\u05BE\-–]/g, ' ').replace(/\s+/g, ' ').trim()
const kindOf = (analysis: WordAnalysis): Kind => (!analysis.phrase?.text ? 'none' : analysis.phrase.kind === 'pattern' ? 'pattern' : 'fixed')

it.skipIf(!apiKey)('tells patterns, fixed expressions and ordinary words apart', async () => {
  const client = new Anthropic({ apiKey })
  const answers = await Promise.all(cases.map(async item => {
    const response = await client.beta.messages.create(analysisRequest(item.word, item.sentence) as never, { timeout: 60_000, maxRetries: 2 }) as Anthropic.Beta.BetaMessage
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    return JSON.parse(text) as WordAnalysis
  }))
  let right = 0
  const lines = cases.map((item, i) => {
    const answer = answers[i], kind = kindOf(answer), phrase = answer.phrase
    const lemmaOk = !item.lemma || [item.lemma].flat().some(lemma => plain(phrase.lemmaPlain || phrase.lemma) === plain(lemma))
    const ok = kind === item.kind && lemmaOk
    if (ok) right++
    return [
      `${ok ? '✓' : '✗'} ${item.word} — expected ${item.kind}${item.lemma ? ` ${item.lemma}` : ''}, got ${kind}${kind !== 'none' ? ` ${phrase.lemmaPlain || phrase.lemma}` : ''}`,
      `    ${item.sentence}`,
      `    meaning: ${answer.meaning} · parts: ${answer.parts.map(part => `${part.text} ${part.meaning}`).join(' + ')} · form: ${answer.form || '—'} · lemma: ${answer.lemmaPlain || '—'}${answer.readAs ? ` · read as ${answer.readAs}` : ''}`,
      ...(phrase.literal ? [`    built: literally "${phrase.literal}" · ${phrase.built.map(part => `${part.lemma} ${part.meaning}`).join(' + ')}${phrase.literalNote ? ` · ${phrase.literalNote}` : ''}`] : []),
      ...(kind !== 'none' ? [`    unit: ${phrase.pattern || phrase.lemma} · ${phrase.meaning} · here: ${phrase.textMeaning}${phrase.examples?.length ? ` · e.g. ${phrase.examples.map(example => `${example.text} "${example.meaning}"`).join(', ')}` : ''}`] : []),
    ].join('\n')
  })
  // Whether an expression says how it is built, where that is checked: wrongly saying so is
  // what a learner would be misled by, so it is printed for reading and checked loosely.
  const builtCases = cases.flatMap((item, i) => (item.built === undefined ? [] : [!!answers[i].phrase?.literal === item.built]))
  console.log(`${lines.join('\n')}\n\n${right} of ${cases.length} right · built ${builtCases.filter(Boolean).length} of ${builtCases.length}`)
  // Wrongly finding a unit is the costlier mistake (it is what the learner is asked to save).
  const falseUnits = cases.filter((item, i) => item.kind === 'none' && kindOf(answers[i]) !== 'none').length
  expect(falseUnits).toBeLessThanOrEqual(1)
  expect(right / cases.length).toBeGreaterThanOrEqual(0.85)
  expect(builtCases.filter(Boolean).length).toBeGreaterThanOrEqual(builtCases.length - 1)
})
