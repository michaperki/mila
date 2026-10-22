import type { Db } from 'mongodb'

// Three short passages every library starts with (beginner, intermediate, advanced), so there is
// something to read before the learner has photographed or pasted anything. They are ordinary
// passages once added: read, renamed and deleted like any other, and never added again.

type Line = { he: string; en: string; heading?: boolean; paragraph?: boolean }
type Starter = { id: string; title: string; lines: Line[] }

export const STARTERS: Starter[] = [
  {
    id: 'starter-beginner',
    title: 'Morning in Tel Aviv (beginner)',
    lines: [
      { he: 'בוקר בתל אביב', en: 'Morning in Tel Aviv', heading: true },
      { he: 'אני קם בשבע בבוקר.', en: 'I get up at seven in the morning.', paragraph: true },
      { he: 'אני שותה קפה ואוכל לחם עם גבינה.', en: 'I drink coffee and eat bread with cheese.' },
      { he: 'אחר כך אני הולך לים.', en: 'Then I go to the sea.' },
      { he: 'הים כחול והשמש חמה.', en: 'The sea is blue and the sun is hot.', paragraph: true },
      { he: 'על החוף יש הרבה אנשים.', en: 'There are a lot of people on the beach.' },
      { he: 'ילדים משחקים בחול, וכלב קטן רץ אחרי כדור.', en: 'Children play in the sand, and a little dog runs after a ball.' },
      { he: 'אני יושב על ספסל וקורא ספר.', en: 'I sit on a bench and read a book.' },
      { he: 'בעשר אני חוזר הביתה, כי יש לי עבודה.', en: 'At ten I go back home, because I have work.', paragraph: true },
    ],
  },
  {
    id: 'starter-intermediate',
    title: 'The neighbour on the third floor (intermediate)',
    lines: [
      { he: 'השכנה מהקומה השלישית', en: 'The neighbour on the third floor', heading: true },
      { he: 'כשעברתי לדירה החדשה, לא הכרתי אף אחד בבניין.', en: "When I moved into the new apartment, I didn't know anyone in the building.", paragraph: true },
      { he: 'ביום השני דפקה בדלת אישה מבוגרת עם עוגה ביד.', en: 'On the second day an older woman knocked on the door with a cake in her hand.' },
      { he: '"אני רינה, מהקומה השלישית," היא אמרה. "ברוך הבא לבניין."', en: '"I\'m Rina, from the third floor," she said. "Welcome to the building."' },
      { he: 'הזמנתי אותה להיכנס, ושתינו תה במטבח שעדיין היה מלא בקופסאות.', en: 'I invited her in, and we drank tea in the kitchen, which was still full of boxes.', paragraph: true },
      { he: 'היא סיפרה לי שהיא גרה בבניין כבר ארבעים שנה ומכירה את כל השכנים.', en: 'She told me she had lived in the building for forty years and knew all the neighbours.' },
      { he: 'מאז, בכל יום שישי היא משאירה לי משהו קטן ליד הדלת: פרחים, עוגיות או עיתון.', en: 'Since then, every Friday she leaves me something small by the door: flowers, cookies or a newspaper.', paragraph: true },
      { he: 'בשבוע שעבר החלטתי להפתיע אותה בחזרה, ואפיתי לה עוגת שוקולד.', en: 'Last week I decided to surprise her back, and I baked her a chocolate cake.' },
      { he: 'היא צחקה ואמרה שזו הפעם הראשונה מזה שנים שמישהו אופה בשבילה.', en: 'She laughed and said it was the first time in years that someone had baked for her.' },
    ],
  },
  {
    id: 'starter-advanced',
    title: 'In praise of slow reading (advanced)',
    lines: [
      { he: 'בשבח הקריאה האיטית', en: 'In praise of slow reading', heading: true },
      { he: 'בעידן שבו כל מידע נמצא במרחק לחיצה, נדמה שהקריאה עצמה הפכה למיומנות של סריקה.', en: 'In an age when all information is a click away, it seems that reading itself has become a skill of scanning.', paragraph: true },
      { he: 'אנחנו מדלגים על פסקאות, מחפשים את השורה התחתונה וממהרים לכותרת הבאה.', en: 'We skip paragraphs, look for the bottom line and hurry on to the next headline.' },
      { he: 'אלא שטקסט טוב אינו נמסר לקורא בבת אחת; הוא נחשף בהדרגה, למי שמוכן להתעכב עליו.', en: 'But a good text is not handed to the reader all at once; it reveals itself gradually, to whoever is willing to linger over it.' },
      { he: 'מי שלומד שפה זרה מגלה זאת מהר מכולם.', en: 'Anyone learning a foreign language finds this out before everyone else.', paragraph: true },
      { he: 'מילה אחת שאינה מוכרת עשויה לעצור את הקריאה כולה, אך דווקא העצירה הזאת היא שמאפשרת למילה להיחקק בזיכרון.', en: 'A single unfamiliar word can stop the whole reading, but it is precisely this pause that lets the word be engraved in memory.' },
      { he: 'לכן כדאי לוותר לפעמים על השאיפה להספיק הרבה, ולהסתפק בעמוד אחד שנקרא לעומק.', en: 'So it is sometimes worth giving up the urge to get through a lot, and settling for one page read in depth.', paragraph: true },
      { he: 'בסופו של דבר, מה שנשאר איתנו אינו מספר הספרים שסיימנו, אלא המשפטים שהסכמנו לחיות איתם זמן מה.', en: 'In the end, what stays with us is not the number of books we finished, but the sentences we agreed to live with for a while.' },
    ],
  },
]

// A starter as a saved passage, in the shape the app saves a page read in (one chunk per line).
export function starterDoc(starter: Starter, createdAt: number) {
  return {
    textId: starter.id, source: 'ocr' as const, layout: 'page' as const, starter: true, title: starter.title, createdAt,
    chunks: starter.lines.map((line, i) => ({
      id: `${starter.id}-${i}`, type: line.heading ? 'phrase' as const : 'sentence' as const, text: line.he, translation: line.en,
      tokens: line.he.split(/\s+/).filter(Boolean).map((surface, idx) => ({ idx, surface })), ...(line.paragraph ? { paragraph: true } : {}),
    })),
  }
}

// Adds the starters to a library once: the first time it is loaded, whenever the account was made.
// Claiming the account's `startersAdded` first means two loads at once can't add them twice.
export async function addStarters(db: Db, userId: string) {
  const claimed = await db.collection('users').updateOne({ userId, startersAdded: { $exists: false } }, { $set: { startersAdded: Date.now() } })
  if (!claimed.modifiedCount) return
  // A millisecond apart, so the beginner passage is listed first.
  const now = Date.now()
  await db.collection('texts').insertMany(STARTERS.map((starter, i) => ({ ...starterDoc(starter, now - i), userId, updatedAt: now })))
}
