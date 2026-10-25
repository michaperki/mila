// Vowelled Hebrew as it is written without vowels: in full spelling (כתיב מלא), as an Israeli
// newspaper prints it. Mila's explanations and cards arrive vowelled, and vowelled Hebrew is
// spelled defectively (לִשְׂנֹא), so taking its marks off leaves לשנא where a reader expects
// לשנוא. The vowels say where the extra letters go, following the Academy's rules for full
// spelling: a holam or kubutz becomes ו, a hiriq in an open syllable becomes י, and a ו or י
// that is a consonant inside a word is doubled. Unvowelled text is left as it is, and so is a
// maqaf, which is punctuation. What the rules can't see stays short: a kamatz katan written as
// a plain kamatz (חָכְמָה), a prefix מִ before a doubled letter (מִכָּל, but so מִלָּה), and a final
// ־ַי (רַבּוֹתַי). Checked against the full spellings the explanations give for saved words, it
// agrees on all but a few, and there the explanation was as often the one that was wrong.

const TSERE = '\u05B5', HIRIQ = '\u05B4', HOLAM = '\u05B9', HOLAM_VAV = '\u05BA', KUBUTZ = '\u05BB', DAGESH = '\u05BC', SHVA = '\u05B0', KAMATZ_KATAN = '\u05C7'
// Vowel points proper (not dagesh, shin/sin dots, meteg or rafe).
const VOWEL = /[\u05B0-\u05BB\u05C7]/
const LETTER = /[א-ת]/
// Cantillation, and every point once the extra letters are in (the maqaf U+05BE and the paseq,
// sof pasuq and nun hafukha punctuation stay).
const CANTILLATION = /[\u0591-\u05AF]/g
const POINTS = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g
// A word: letters, each with its points.
const WORD = /(?:[א-ת][\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]*)+/g

// Words spelled with no ו for their holam, or kept short by custom, where the rules would add one.
const AS_PRINTED: Record<string, string> = { לוא: 'לא', כוה: 'כה', פוה: 'פה', מושה: 'משה', אימא: 'אמא' }

type Letter = { letter: string; marks: string }

export const plainSpelling = (text: string) => text.normalize('NFC').replace(CANTILLATION, '').replace(WORD, plainWord).replace(POINTS, '')

// One word (a run of letters and their points, without a maqaf).
function plainWord(word: string): string {
  if (!VOWEL.test(word)) return word.replace(POINTS, '')
  const letters: Letter[] = []
  for (const char of word) {
    if (LETTER.test(char)) letters.push({ letter: char, marks: '' })
    else if (letters.length) letters[letters.length - 1].marks += char
  }
  const out: string[] = []
  const has = (item: Letter | undefined, mark: string) => !!item && item.marks.includes(mark)
  const isVav = (item: Letter | undefined) => item?.letter === 'ו'
  // A ו that is a vowel: holam male (וֹ) or shuruk (וּ after a letter without a vowel of its own).
  const vowelVav = (i: number) => {
    const item = letters[i]
    if (!isVav(item)) return false
    if (has(item, HOLAM) || has(item, HOLAM_VAV)) return !VOWEL.test(item.marks.replace(HOLAM, '').replace(HOLAM_VAV, ''))
    return has(item, DAGESH) && !VOWEL.test(item.marks) && i > 0 && !VOWEL.test(letters[i - 1].marks)
  }
  letters.forEach((item, i) => {
    const next = letters[i + 1]
    const last = i === letters.length - 1
    // A consonant ו or י inside the word is doubled, unless a ו or י that is a vowel letter
    // stands beside it (מְסֻיָּם is מסוים, לְקַוּוֹת is לקוות).
    if ((item.letter === 'ו' || item.letter === 'י') && i > 0 && !last && !vowelVav(i)) {
      const consonant = VOWEL.test(item.marks) || has(item, DAGESH)
      const besideVowelLetter = vowelVav(i + 1) || vowelVav(i - 1) || (item.letter === 'י' && next?.letter === 'י') || (item.letter === 'י' && has(letters[i - 1], KUBUTZ))
      const doubled = (item.letter === 'ו' && (isVav(next) || isVav(letters[i - 1]))) || (item.letter === 'י' && (next?.letter === 'י' || letters[i - 1].letter === 'י'))
      out.push(consonant && !besideVowelLetter && !doubled && !(item.letter === 'י' && startsWord(letters, i)) ? item.letter + item.letter : item.letter)
    } else out.push(item.letter)
    if (isVav(item)) return
    // Holam haser, kubutz and kamatz katan are written with ו, except a holam before an א that
    // is silent inside the word (רֹאשׁ, זֹאת, שְׂמֹאל; but לִקְפֹּא, מְאֹד).
    const silentAlef = has(item, HOLAM) && next?.letter === 'א' && !VOWEL.test(next.marks) && i + 1 < letters.length - 1
    if ((has(item, HOLAM) || has(item, KUBUTZ) || has(item, KAMATZ_KATAN)) && !vowelVav(i + 1) && !silentAlef) out.push('ו')
    // A hiriq is written with י unless one follows already, or the syllable is closed (a shva
    // after it on a letter that isn't doubled, or the word ends after the next letter with no
    // vowel), or it is a prefix מִ before a doubled letter (מִכָּל, מִשָּׁם).
    if (has(item, HIRIQ) && next && next.letter !== 'י') {
      const closed = (has(next, SHVA) && !has(next, DAGESH)) || (i + 1 === letters.length - 1 && !VOWEL.test(next.marks))
      const prefixMem = i === 0 && item.letter === 'מ' && has(next, DAGESH)
      if (!closed && !prefixMem) out.push('י')
    }
    // A tsere that stands for a hiriq before an א, ע or ר, which can't be doubled, is written
    // with י too (לְהֵעָמֵד, בֵּרַךְ, תֵּאֵר), but not the prefix מֵ (מֵאָה, מֵעַל), a noun such as
    // הֵעָרָה, or a tsere before a final guttural's patah (יוֹדֵעַ).
    if (has(item, TSERE) && next && i + 1 < letters.length - 1 && /[אער]/.test(next.letter) && !(i === 0 && /[מה]/.test(item.letter)) && /[\u05B2\u05B5-\u05B8]/.test(next.marks)) out.push('י')
  })
  const plain = out.join('')
  return AS_PRINTED[plain] ?? plain
}

// A י that is where the word itself starts, doubled by a prefix (הַיֶּלֶד, כְּשֶׁיַּנְשׁוּף), or the
// second letter of the word without a dagesh (וְיֵשׁ, בַּיִת, מַיִם, לְיַד), is not doubled; one with a
// dagesh after a letter that is no prefix is (צַיָּר).
const PREFIX = /[והבכלמש]/
function startsWord(letters: Letter[], i: number) {
  const before = letters.slice(0, i)
  if (letters[i].marks.includes(DAGESH)) return before.every(item => PREFIX.test(item.letter))
  // A segolate's ־ַיִ־ before its last letter is one י (מֵהַבַּיִת, זַיִת), a dual's ־ַיִם two (שָׁמַיִם).
  const segolate = letters[i].marks.includes(HIRIQ) && i + 2 === letters.length && letters[i + 1].letter !== 'ם'
  return i === 1 || segolate
}
