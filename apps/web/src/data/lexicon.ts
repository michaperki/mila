export type LexiconEntry = {
  lemma: string
  gloss: string
  root: string
  pronunciation: string
  tags?: string[]
  forms?: string[]
}

export const LEXICON: LexiconEntry[] = [
  { lemma: 'שלום', gloss: 'peace; hello', root: 'שלם', pronunciation: 'shalom', tags: ['greeting'] },
  { lemma: 'תודה', gloss: 'thanks', root: 'יוד', pronunciation: 'toda', tags: ['greeting'] },
  { lemma: 'בבקשה', gloss: 'please; you are welcome', root: 'בקש', pronunciation: 'bevakasha' },
  { lemma: 'ספר', gloss: 'book', root: 'ספר', pronunciation: 'sefer' },
  { lemma: 'ללמוד', gloss: 'to learn', root: 'למד', pronunciation: 'lilmod', tags: ['verb'] },
  { lemma: 'לקרוא', gloss: 'to read', root: 'קרא', pronunciation: 'likro', tags: ['verb'] },
  { lemma: 'לכתוב', gloss: 'to write', root: 'כתב', pronunciation: 'lichtov', tags: ['verb'] },
  { lemma: 'מילה', gloss: 'word', root: 'מלל', pronunciation: 'milah' },
  { lemma: 'עברית', gloss: 'Hebrew (language)', root: 'עבר', pronunciation: 'ivrit' },
  { lemma: 'אנגלית', gloss: 'English (language)', root: 'נגל', pronunciation: 'anglit' },
  { lemma: 'תלמיד', gloss: 'student (m.)', root: 'למד', pronunciation: 'talmid', tags: ['noun'] },
  { lemma: 'תלמידה', gloss: 'student (f.)', root: 'למד', pronunciation: 'talmida', tags: ['noun'] },
  { lemma: 'מורה', gloss: 'teacher', root: 'ורה', pronunciation: 'moreh', tags: ['noun'] },
  { lemma: 'לזכור', gloss: 'to remember', root: 'זכר', pronunciation: 'lizkor', tags: ['verb'] },
  { lemma: 'לזוז', gloss: 'to move', root: 'זוז', pronunciation: 'lazuz', tags: ['verb'] },
  { lemma: 'לשיר', gloss: 'to sing', root: 'שיר', pronunciation: 'lashir', tags: ['verb'] },
  { lemma: 'שיעור', gloss: 'lesson', root: 'שער', pronunciation: 'shiur' },
  { lemma: 'זמן', gloss: 'time', root: 'זמן', pronunciation: 'zman' },
  { lemma: 'חדש', gloss: 'new (m.)', root: 'חדש', pronunciation: 'chadash', tags: ['adjective'] },
  { lemma: 'חדשה', gloss: 'new (f.)', root: 'חדש', pronunciation: 'chadasha', tags: ['adjective'] },
  { lemma: 'ישן', gloss: 'old (m.)', root: 'ישן', pronunciation: 'yashan', tags: ['adjective'] },
  { lemma: 'ישנה', gloss: 'old (f.)', root: 'ישן', pronunciation: 'yeshana', tags: ['adjective'] },
  { lemma: 'לשנן', gloss: 'to memorize', root: 'שנן', pronunciation: 'leshanen', tags: ['verb'] },
  { lemma: 'לתרגל', gloss: 'to practice', root: 'תרגל', pronunciation: 'letergel', tags: ['verb'] },
  { lemma: 'עזרה', gloss: 'help', root: 'עזר', pronunciation: 'ezra' },
  { lemma: 'מילון', gloss: 'dictionary', root: 'מלל', pronunciation: 'milon' },
  { lemma: 'שאלה', gloss: 'question', root: 'שאל', pronunciation: 'sheela' },
  { lemma: 'תשובה', gloss: 'answer', root: 'שוב', pronunciation: 'teshuva' },
  { lemma: 'זיכרון', gloss: 'memory', root: 'זכר', pronunciation: 'zikaron' },
  { lemma: 'תרגול', gloss: 'practice (noun)', root: 'רגל', pronunciation: 'targul' },
  { lemma: 'דקדוק', gloss: 'grammar', root: 'דקדק', pronunciation: 'dikduk' },
]
