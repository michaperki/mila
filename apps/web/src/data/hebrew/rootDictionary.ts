/**
 * Hebrew Root Dictionary
 * 
 * This module provides a dictionary of Hebrew roots based on Strong's numbers.
 * Generated from the Open Scriptures Hebrew Bible dataset.
 */

// Type definitions
export interface HebrewLemma {
  strong: string;  // Strong's number (e.g., "1")
  root: string;    // Root form in Hebrew characters
  gloss: string;   // English gloss/definition
}

// Map of Strong's numbers to root information
export const strongRoots: Record<string, HebrewLemma> = {
  "1": {
    "strong": "1",
    "root": "אָב",
    "gloss": "chief, (fore-) father(-less), [idiom] patrimony, principal. Compare names in 'Abi-'"
  },
  "3": {
    "strong": "3",
    "root": "אֵב",
    "gloss": "greenness, fruit"
  },
  "5": {
    "strong": "5",
    "root": "אֲבַגְתָא",
    "gloss": "Abagtha"
  },
  "6": {
    "strong": "6",
    "root": "אָבַד",
    "gloss": "break, destroy(-uction), [phrase] not escape, fail, lose, (cause to, make) perish, spend, [idiom] and surely, take, be undone, [idiom] utterly, be void of, have no way to flee"
  },
  "8": {
    "strong": "8",
    "root": "אֹבֵד",
    "gloss": "perish"
  },
  "9": {
    "strong": "9",
    "root": "אֲבֵדָה",
    "gloss": "lost"
  },
  "10": {
    "strong": "10",
    "root": "אֲבַדֹּה",
    "gloss": "destruction"
  },
  "11": {
    "strong": "11",
    "root": "אֲבַדּוֹן",
    "gloss": "destruction"
  },
  "12": {
    "strong": "12",
    "root": "אַבְדָן",
    "gloss": "destruction"
  },
  "13": {
    "strong": "13",
    "root": "אׇבְדַן",
    "gloss": "destruction"
  },
  "14": {
    "strong": "14",
    "root": "אָבָה",
    "gloss": "consent, rest content will, be willing"
  },
  "15": {
    "strong": "15",
    "root": "אָבֶה",
    "gloss": "desire"
  },
  "16": {
    "strong": "16",
    "root": "אֵבֶה",
    "gloss": "swift"
  },
  "17": {
    "strong": "17",
    "root": "אֲבוֹי",
    "gloss": "sorrow"
  },
  "18": {
    "strong": "18",
    "root": "אֵבוּס",
    "gloss": "crib"
  },
  "19": {
    "strong": "19",
    "root": "אִבְחָה",
    "gloss": "point"
  },
  "20": {
    "strong": "20",
    "root": "אֲבַטִּיחַ",
    "gloss": "melon"
  },
  "21": {
    "strong": "21",
    "root": "אֲבִי",
    "gloss": "Abi"
  },
  "22": {
    "strong": "22",
    "root": "אֲבִיאֵל",
    "gloss": "Abiel"
  },
  "23": {
    "strong": "23",
    "root": "אֲבִיאָסָף",
    "gloss": "Abiasaph"
  },
  "24": {
    "strong": "24",
    "root": "אָבִיב",
    "gloss": "Abib, ear, green ears of corn (not maize)"
  },
  "25": {
    "strong": "25",
    "root": "אֲבִי גִבְעוֹן",
    "gloss": "father of Gibeon"
  },
  // [Additional entries omitted for brevity]
  "500": {
    "strong": "500",
    "root": "אֶלְעָלֵא",
    "gloss": "Elealeh"
  }
};

/**
 * Gets English gloss for a Hebrew root
 * @param root The Hebrew root
 * @returns The English gloss, or null if not found
 */
export function getGlossForRoot(root: string): string | null {
  if (!root) return null;

  // Special cases that aren't in the Strong's dictionary
  const specialGlosses: Record<string, string> = {
    "עכשיו": "now, at present, currently",
    "עת": "time, period, season",
    "מחר": "tomorrow, in the future",
    "אתמול": "yesterday, in the past",
    "זמן": "time, duration, period"
  };

  // Check special cases first
  if (specialGlosses[root]) {
    return specialGlosses[root];
  }

  // Then search through strongRoots for a matching root
  for (const strong of Object.values(strongRoots)) {
    if (strong.root === root) {
      return strong.gloss;
    }
  }

  return null;
}

/**
 * Extracts the root from a Hebrew word using the dictionary
 * @param word The Hebrew word to look up
 * @returns The root if found in dictionary, or null if not found
 */
export function extractRootFromDictionary(word: string): string | null {
  if (!word) return null;
  
  // Special cases for words with irregular roots or that should be treated as their own root
  const specialCases: Record<string, string> = {
    // Time expressions that need special handling
    "עכשיו": "עכשיו",   // now (akshav) - keep as whole word
    "עכשו": "עכשיו",     // alternative spelling
    "עכשיי": "עכשיו",    // variant
    "מעכשיו": "עכשיו",   // from now
    "לעכשיו": "עכשיו",   // to now
    "ועכשיו": "עכשיו",   // and now
    "העכשיו": "עכשיו",   // the now
    "שעכשיו": "עכשיו",   // that now
  };
  
  // Check special cases first
  if (specialCases[word]) {
    return specialCases[word];
  }
  
  const commonRootEntries: Array<[string, string]> = [
    // Time expressions
    ["עתה", "עת"],     // now (ata) - from root meaning "time"
    ["היום", "יום"],   // today - from root "day"
    ["אתמול", "אתמול"], // yesterday
    ["מחר", "מחר"],    // tomorrow

    // Common nouns
    ["דבר", "דבר"],    // word/thing
    ["מלך", "מלך"],    // king
    ["איש", "איש"],    // man
    ["אשה", "איש"],    // woman (from root "man")
    ["בית", "בית"],    // house
    ["יום", "יום"],    // day
    ["עיר", "עיר"],    // city
    ["עם", "עמם"],     // people
    ["ארץ", "ארץ"],    // land
    ["שמים", "שמים"],  // heaven/sky
    ["מים", "מים"],    // water
    ["שם", "שם"],      // name
    ["יד", "יד"],      // hand
    ["רגל", "רגל"],    // foot
    ["פה", "פה"],      // mouth
    ["לב", "לבב"],     // heart
    ["ספר", "ספר"],    // book
    ["זמן", "זמן"],    // time

    // Common verbs
    ["אמר", "אמר"],    // say
    ["הלך", "הלך"],    // walk
    ["בוא", "בוא"],    // come
    ["ראה", "ראה"],    // see
    ["שמע", "שמע"],    // hear
    ["ידע", "ידע"],    // know
    ["עשה", "עשה"],    // do
    ["לקח", "לקח"],    // take
    ["נתן", "נתן"],    // give
    ["היה", "היה"],    // be
    ["דבר", "דבר"],    // speak
    ["שאל", "שאל"],    // ask
    ["קרא", "קרא"],    // read/call
    ["כתב", "כתב"],    // write
    ["לבש", "לבש"],    // wear
    ["אכל", "אכל"],    // eat
    ["שתה", "שתה"],    // drink
    ["שיר", "שיר"],    // sing
    ["למד", "למד"],    // learn

    // With common prefixes
    ["הדבר", "דבר"],
    ["ודבר", "דבר"],
    ["לדבר", "דבר"],
    ["בדבר", "דבר"],
    ["מדבר", "דבר"],
    ["המלך", "מלך"],
    ["ומלך", "מלך"],
    ["למלך", "מלך"],
    ["במלך", "מלך"],
  ];

  const commonRoots = Object.fromEntries(commonRootEntries);

  return commonRoots[word] || null;
}
