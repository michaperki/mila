/**
 * Hebrew Root Dictionary
 * 
 * This module provides a dictionary of Hebrew words to their roots,
 * based on the Open Scriptures Hebrew Bible (OSHB) dataset.
 * 
 * The dictionary maps word forms to their Strong's number, which can be used
 * to look up the root form. This provides a more accurate root extraction
 * than pattern-based methods alone.
 */

// Type definitions
export interface HebrewLemma {
  strong: string;  // Strong's number (e.g., "1")
  root: string;    // Root form in Hebrew characters
  gloss: string;   // English gloss/definition
}

export interface HebrewWord {
  form: string;    // The actual word form as it appears in text
  lemma: string;   // Strong's number for the lemma
}

// Map of Strong's numbers to root information
export const strongRoots: Record<string, HebrewLemma> = {
  // Common Hebrew roots based on Strong's numbers
  "1": { strong: "1", root: "אב", gloss: "father" },
  "127": { strong: "127", root: "אדם", gloss: "man, human being, mankind" },
  "430": { strong: "430", root: "אלה", gloss: "God, god" },
  "3068": { strong: "3068", root: "יהוה", gloss: "the LORD" },
  "776": { strong: "776", root: "ארץ", gloss: "land, earth" },
  "8064": { strong: "8064", root: "שמים", gloss: "heaven, sky" },
  "1980": { strong: "1980", root: "הלך", gloss: "walk, go" },
  "1697": { strong: "1697", root: "דבר", gloss: "word, speech, matter" },
  "559": { strong: "559", root: "אמר", gloss: "say, speak, tell" },
  "1121": { strong: "1121", root: "בן", gloss: "son, male child" },
  "802": { strong: "802", root: "אשה", gloss: "woman, wife, female" },
  "376": { strong: "376", root: "איש", gloss: "man, husband, each" },
  "3117": { strong: "3117", root: "יום", gloss: "day, time" },
  "3212": { strong: "3212", root: "ילך", gloss: "go, come, walk" },
  "5869": { strong: "5869", root: "עין", gloss: "eye" },
  "3027": { strong: "3027", root: "יד", gloss: "hand" },
  "7200": { strong: "7200", root: "ראה", gloss: "see, look" },
  "7225": { strong: "7225", root: "ראש", gloss: "head, top, beginning" },
  "8104": { strong: "8104", root: "שמר", gloss: "keep, watch, preserve" },
  "8085": { strong: "8085", root: "שמע", gloss: "hear, listen" },
  "5414": { strong: "5414", root: "נתן", gloss: "give, put, set" },
  "6213": { strong: "6213", root: "עשה", gloss: "do, make" },
  "3045": { strong: "3045", root: "ידע", gloss: "know, learn, perceive" },
  "3808": { strong: "3808", root: "לא", gloss: "no, not" },
  "3824": { strong: "3824", root: "לב", gloss: "heart, mind, inner person" },
  "398": { strong: "398", root: "אכל", gloss: "eat, consume" },
  "3644": { strong: "3644", root: "כמו", gloss: "like, as" },
  "3605": { strong: "3605", root: "כל", gloss: "all, every, the whole" },
  "3478": { strong: "3478", root: "ישראל", gloss: "Israel" },
  "3588": { strong: "3588", root: "כי", gloss: "that, because, when" },
  "4428": { strong: "4428", root: "מלך", gloss: "king" },
  "4872": { strong: "4872", root: "משה", gloss: "Moses" },
  "5315": { strong: "5315", root: "נפש", gloss: "soul, self, life" },
  "7965": { strong: "7965", root: "שלום", gloss: "peace, welfare" },
  "6918": { strong: "6918", root: "קדש", gloss: "holy, set apart" },
  "2580": { strong: "2580", root: "חן", gloss: "favor, grace" },
  "2822": { strong: "2822", root: "חשך", gloss: "darkness" },
  "3947": { strong: "3947", root: "לקח", gloss: "take, get, fetch" },
  "3427": { strong: "3427", root: "ישב", gloss: "sit, dwell" },
  "4325": { strong: "4325", root: "מים", gloss: "water" },
  "7704": { strong: "7704", root: "שדה", gloss: "field" },
  "6440": { strong: "6440", root: "פנים", gloss: "face, presence" },
  "5971": { strong: "5971", root: "עם", gloss: "people, nation" },
  "5060": { strong: "5060", root: "נגע", gloss: "touch, reach, strike" },
  "1961": { strong: "1961", root: "היה", gloss: "be, become, happen" },
  "1004": { strong: "1004", root: "בית", gloss: "house" },
  "2719": { strong: "2719", root: "חרב", gloss: "sword" },
  "5046": { strong: "5046", root: "נגד", gloss: "tell, declare" },
  "7523": { strong: "7523", root: "רצה", gloss: "be pleased with, accept" },
  "2416": { strong: "2416", root: "חי", gloss: "alive, living" },
  "2919": { strong: "2919", root: "טוב", gloss: "good, pleasant, agreeable" },
  "4428": { strong: "4428", root: "מלך", gloss: "king" },
  "5437": { strong: "5437", root: "סבב", gloss: "turn, go around" },
  "5647": { strong: "5647", root: "עבד", gloss: "serve, work" },
  "5975": { strong: "5975", root: "עמד", gloss: "stand, stop, remain" },
  "1368": { strong: "1368", root: "גבר", gloss: "mighty man, strong, valiant" },
  "1419": { strong: "1419", root: "גדל", gloss: "great" },
  "7121": { strong: "7121", root: "קרא", gloss: "call, proclaim, read" },
  "1288": { strong: "1288", root: "ברך", gloss: "bless" },
};

// Map of word forms to Strong's numbers
// This is a small subset for demonstration - would need to be expanded with full OSHB data
export const wordDictionary: Record<string, string> = {
  // Word forms mapped to their Strong's numbers
  "אב": "1",
  "אבי": "1",
  "אבינו": "1",
  "אביו": "1",
  "אדם": "127",
  "אדמה": "127",
  "אלהים": "430",
  "אלהי": "430",
  "יהוה": "3068",
  "ארץ": "776",
  "הארץ": "776", 
  "בארץ": "776",
  "שמים": "8064",
  "השמים": "8064",
  "לשמים": "8064",
  "הלך": "1980",
  "ילך": "1980",
  "הלכו": "1980",
  "דבר": "1697",
  "דברי": "1697",
  "הדבר": "1697",
  "אמר": "559",
  "אומר": "559",
  "יאמר": "559",
  "בן": "1121",
  "בני": "1121",
  "הבן": "1121",
  "אשה": "802",
  "אשת": "802",
  "האשה": "802",
  "איש": "376",
  "האיש": "376",
  "לאיש": "376",
  "יום": "3117",
  "היום": "3117",
  "ביום": "3117",
  "עין": "5869",
  "עיני": "5869",
  "עיניו": "5869",
  "יד": "3027",
  "ידי": "3027",
  "ידו": "3027",
  "ראה": "7200",
  "יראה": "7200",
  "ראיתי": "7200",
  "ראש": "7225",
  "ראשי": "7225",
  "הראש": "7225",
  "שמר": "8104",
  "שומר": "8104",
  "ישמור": "8104",
  "שמע": "8085",
  "שומע": "8085",
  "ישמע": "8085",
  "נתן": "5414",
  "נותן": "5414",
  "יתן": "5414",
  "עשה": "6213",
  "עושה": "6213",
  "יעשה": "6213",
  "ידע": "3045",
  "יודע": "3045",
  "ידעתי": "3045",
  "לא": "3808",
  "לב": "3824",
  "הלב": "3824",
  "לבי": "3824",
  "אכל": "398",
  "אוכל": "398",
  "יאכל": "398",
  "כמו": "3644",
  "כל": "3605",
  "כול": "3605",
  "הכל": "3605",
  "ישראל": "3478",
  "ישראלי": "3478",
  "כי": "3588",
  "מלך": "4428",
  "המלך": "4428",
  "מלכי": "4428",
  "משה": "4872",
  "למשה": "4872",
  "נפש": "5315",
  "הנפש": "5315",
  "נפשי": "5315",
  "שלום": "7965",
  "השלום": "7965",
  "קדש": "6918",
  "קדוש": "6918",
  "הקדש": "6918",
};

/**
 * Extracts the root from a Hebrew word using the OSHB dictionary
 * @param word The Hebrew word to analyze
 * @returns The root of the word, or null if not found
 */
export function extractRootFromDictionary(word: string): string | null {
  if (!word) return null;
  
  // Remove nikud (vowel points) for consistent matching
  const normalized = word.normalize('NFKD').replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '');
  
  // Try to find the word directly in the dictionary
  const strongNumber = wordDictionary[normalized];
  if (strongNumber) {
    const root = strongRoots[strongNumber];
    return root ? root.root : null;
  }
  
  // Try removing common prefixes (ה, ב, ל, כ, ו, מ, ש)
  for (const prefix of ['ה', 'ב', 'ל', 'כ', 'ו', 'מ', 'ש', 'וה', 'וב', 'ול', 'וכ', 'ומ', 'וש']) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 1) {
      const withoutPrefix = normalized.substring(prefix.length);
      const strongNumber = wordDictionary[withoutPrefix];
      if (strongNumber) {
        const root = strongRoots[strongNumber];
        return root ? root.root : null;
      }
    }
  }
  
  // Try removing common suffixes (ים, ות, י, ו, ך, ה)
  for (const suffix of ['ים', 'ות', 'י', 'ו', 'ך', 'ה', 'נו', 'כם', 'הם', 'יו', 'יה']) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      const withoutSuffix = normalized.substring(0, normalized.length - suffix.length);
      const strongNumber = wordDictionary[withoutSuffix];
      if (strongNumber) {
        const root = strongRoots[strongNumber];
        return root ? root.root : null;
      }
    }
  }
  
  return null;
}

/**
 * Gets English gloss for a Hebrew root
 * @param root The Hebrew root
 * @returns The English gloss, or null if not found
 */
export function getGlossForRoot(root: string): string | null {
  if (!root) return null;
  
  // Search through strongRoots for a matching root
  for (const strong of Object.values(strongRoots)) {
    if (strong.root === root) {
      return strong.gloss;
    }
  }
  
  return null;
}