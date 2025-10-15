// Mock translation service
// This provides realistic deterministic translations for Hebrew text

// Feature flag for using real translation API
// Can be controlled via localStorage or env variable
const useRealTranslate = localStorage.getItem('useRealTranslate') === 'true' ||
                         import.meta.env.VITE_USE_REAL_TRANSLATE === 'true';

// Force enable real translation for testing if env var is set
if (import.meta.env.VITE_USE_REAL_TRANSLATE === 'true') {
  localStorage.setItem('useRealTranslate', 'true');
  console.log('Real translation enabled via environment variable');
}

// Comprehensive Hebrew-English dictionary for common words
const mockDictionary: Record<string, string> = {
  // Pronouns
  'אני': 'I',
  'אתה': 'you (m.sg.)',
  'את': 'you (f.sg.)',
  'הוא': 'he',
  'היא': 'she',
  'אנחנו': 'we',
  'אנו': 'we',
  'אתם': 'you (m.pl.)',
  'אתן': 'you (f.pl.)',
  'הם': 'they (m.)',
  'הן': 'they (f.)',
  'זה': 'this (m.)',
  'זאת': 'this (f.)',
  'אלה': 'these',
  'אלו': 'those',

  // Verbs - present tense
  'אוכל': 'eating',
  'שותה': 'drinking',
  'הולך': 'going (m.sg.)',
  'הולכת': 'going (f.sg.)',
  'רואה': 'seeing',
  'שומע': 'hearing (m.sg.)',
  'שומעת': 'hearing (f.sg.)',
  'מדבר': 'speaking (m.sg.)',
  'מדברת': 'speaking (f.sg.)',
  'לומד': 'learning (m.sg.)',
  'לומדת': 'learning (f.sg.)',
  'כותב': 'writing (m.sg.)',
  'כותבת': 'writing (f.sg.)',
  'קורא': 'reading (m.sg.)',
  'קוראת': 'reading (f.sg.)',
  'יושב': 'sitting (m.sg.)',
  'יושבת': 'sitting (f.sg.)',
  'עומד': 'standing (m.sg.)',
  'עומדת': 'standing (f.sg.)',

  // Verbs - infinitive
  'לאכול': 'to eat',
  'לשתות': 'to drink',
  'ללכת': 'to go',
  'לראות': 'to see',
  'לשמוע': 'to hear',
  'לדבר': 'to speak',
  'ללמוד': 'to learn',
  'לכתוב': 'to write',
  'לקרוא': 'to read',
  'לשבת': 'to sit',
  'לעמוד': 'to stand',

  // Common nouns
  'בית': 'house',
  'ספר': 'book',
  'שולחן': 'table',
  'כיסא': 'chair',
  'מיטה': 'bed',
  'דלת': 'door',
  'חלון': 'window',
  'מחשב': 'computer',
  'טלפון': 'phone',
  'רחוב': 'street',
  'עיר': 'city',
  'מדינה': 'country',
  'שפה': 'language',
  'מילה': 'word',
  'משפט': 'sentence',
  'זמן': 'time',
  'יום': 'day',
  'לילה': 'night',
  'בוקר': 'morning',
  'ערב': 'evening',
  'שנה': 'year',
  'חודש': 'month',
  'שבוע': 'week',

  // People
  'איש': 'man',
  'אישה': 'woman',
  'ילד': 'boy',
  'ילדה': 'girl',
  'תלמיד': 'student (m.)',
  'תלמידה': 'student (f.)',
  'מורה': 'teacher',
  'חבר': 'friend (m.)',
  'חברה': 'friend (f.)',
  'משפחה': 'family',
  'הורים': 'parents',
  'אבא': 'father',
  'אמא': 'mother',
  'אח': 'brother',
  'אחות': 'sister',

  // Food and drink
  'מזון': 'food',
  'ארוחה': 'meal',
  'ארוחת בוקר': 'breakfast',
  'ארוחת צהריים': 'lunch',
  'ארוחת ערב': 'dinner',
  'לחם': 'bread',
  'חלב': 'milk',
  'מים': 'water',
  'בשר': 'meat',
  'עוף': 'chicken',
  'דג': 'fish',
  'ירקות': 'vegetables',
  'פירות': 'fruits',
  'תפוח': 'apple',
  'תפוז': 'orange',
  'בננה': 'banana',

  // Common adjectives
  'טוב': 'good',
  'רע': 'bad',
  'גדול': 'big',
  'קטן': 'small',
  'חדש': 'new',
  'ישן': 'old',
  'יפה': 'beautiful',
  'מכוער': 'ugly',
  'חם': 'hot',
  'קר': 'cold',
  'קל': 'easy',
  'קשה': 'difficult',
  'מהיר': 'fast',
  'איטי': 'slow',

  // Common adverbs
  'מאוד': 'very',
  'מעט': 'a little',
  'הרבה': 'a lot',
  'כאן': 'here',
  'שם': 'there',
  'עכשיו': 'now',
  'אחר כך': 'later',
  'לפני': 'before',
  'אחרי': 'after',

  // Greetings and common phrases
  'שלום': 'hello, peace',
  'להתראות': 'goodbye',
  'בבקשה': 'please',
  'תודה': 'thank you',
  'סליחה': 'excuse me, sorry',
  'בהצלחה': 'good luck',
  'מזל טוב': 'congratulations',
  'בתיאבון': 'bon appetit',

  // Question words
  'מה': 'what',
  'מי': 'who',
  'איפה': 'where',
  'מתי': 'when',
  'למה': 'why',
  'איך': 'how',
  'כמה': 'how much, how many',

  // Conjunctions and prepositions
  'ו': 'and',
  'או': 'or',
  'אבל': 'but',
  'כי': 'because',
  'אם': 'if',
  'גם': 'also',
  'רק': 'only',
  'עם': 'with',
  'בלי': 'without',
  'ב': 'in, at',
  'ל': 'to, for',
  'מ': 'from',
  'על': 'on',
  'תחת': 'under',
  'קודם': 'before, in front of',
  'אחר': 'after, behind',
  'בין': 'between',

  // Colors
  'אדום': 'red',
  'כחול': 'blue',
  'צהוב': 'yellow',
  'ירוק': 'green',
  'שחור': 'black',
  'לבן': 'white',

  // Numbers
  'אחד': 'one',
  'שניים': 'two',
  'שלושה': 'three',
  'ארבעה': 'four',
  'חמישה': 'five',
  'שישה': 'six',
  'שבעה': 'seven',
  'שמונה': 'eight',
  'תשעה': 'nine',
  'עשרה': 'ten',

  // Days of the week
  'יום ראשון': 'Sunday',
  'יום שני': 'Monday',
  'יום שלישי': 'Tuesday',
  'יום רביעי': 'Wednesday',
  'יום חמישי': 'Thursday',
  'יום שישי': 'Friday',
  'יום שבת': 'Saturday',
  'שבת': 'Sabbath',

  // Sample for the demo
  'עולם': 'world',
  'טקסט': 'text',
  'לדוגמה': 'example',
};

// Common Hebrew sentence patterns with translations
const mockSentences: Record<string, string> = {
  'שלום עולם': 'Hello world',
  'זהו טקסט לדוגמה': 'This is an example text',
  'אני אוהב לקרוא ספרים': 'I like to read books',
  'מה שלומך': 'How are you?',
  'נעים מאוד להכיר אותך': 'Nice to meet you',
  'איפה אתה גר': 'Where do you live?',
  'אני גר בתל אביב': 'I live in Tel Aviv',
  'כמה זה עולה': 'How much does it cost?',
  'מה השעה': 'What time is it?',
  'מזג האוויר נעים היום': 'The weather is pleasant today',
  'אני רוצה ללמוד עברית': 'I want to learn Hebrew',
  'אני מדבר קצת עברית': 'I speak a little Hebrew',
  'הספר הזה מעניין מאוד': 'This book is very interesting',
  'אני אוהב את השפה העברית': 'I love the Hebrew language',
};

// Cache for translations to improve performance
const translationCache = new Map<string, string>();

/**
 * Translates a sentence from Hebrew to English with improved sentence structure
 */
export async function translateSentence(text: string): Promise<string> {
  // Check cache first
  if (translationCache.has(text)) {
    return translationCache.get(text)!;
  }

  if (useRealTranslate) {
    // This would call the real translation API if implemented
    const translation = await realTranslateSentence(text);
    translationCache.set(text, translation);
    return translation;
  }

  // Use our mock dictionary for deterministic results
  // Try exact match first
  if (mockSentences[text]) {
    const translation = mockSentences[text];
    translationCache.set(text, translation);
    return translation;
  }

  // For complex sentences, try to split by punctuation or conjunctions
  // and translate each part separately, then recombine
  const puncts = /[.?!,;:]/g;
  if (puncts.test(text)) {
    const parts = text.split(puncts).filter(Boolean);
    const translatedParts = await Promise.all(parts.map(part => translateSentence(part.trim())));
    const translation = translatedParts.join('. ').replace(/\.\./g, '.');
    translationCache.set(text, translation);
    return translation;
  }

  // For unknown sentences, try to improve the word-by-word translation
  const words = text.split(/\s+/);
  const translatedWords = words.map(word => {
    const normalized = word.replace(/[.,?!;:]/g, '');
    return mockDictionary[normalized] || word; // Keep original if not found
  });

  // Basic post-processing to improve readability
  let translation = translatedWords.join(' ');

  // Remove duplicate words
  translation = translation.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Fix spacing around punctuation
  translation = translation.replace(/\s+([.,?!;:])/g, '$1');

  // Ensure proper capitalization
  translation = translation.charAt(0).toUpperCase() + translation.slice(1);

  // Add period at the end if missing
  if (!/[.?!]$/.test(translation)) {
    translation += '.';
  }

  translationCache.set(text, translation);
  return translation;
}

// Cache for token glosses
const glossCache = new Map<string, string>();

/**
 * Provides glosses for individual tokens with improved handling
 */
export async function glossTokens(tokens: string[]): Promise<string[]> {
  if (useRealTranslate) {
    // This would call the real translation API if implemented
    return realGlossTokens(tokens);
  }

  // Use our mock dictionary with caching
  return tokens.map(token => {
    // Check cache first
    if (glossCache.has(token)) {
      return glossCache.get(token)!;
    }

    // Remove punctuation and normalize
    const normalized = token.replace(/[.,?!;:]/g, '').trim();
    if (!normalized) return '—';

    // Look up in dictionary
    let gloss = mockDictionary[normalized];

    if (!gloss) {
      // Try lowercase version
      const lowercaseToken = normalized.toLowerCase();
      gloss = mockDictionary[lowercaseToken];

      if (!gloss) {
        // Try removing prefixes (for Hebrew clitics)
        for (const prefix of Object.keys({ 'ו': 'and', 'ה': 'the', 'ב': 'in', 'כ': 'like', 'ל': 'to', 'מ': 'from', 'ש': 'that' })) {
          if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
            const withoutPrefix = normalized.substring(prefix.length);
            gloss = mockDictionary[withoutPrefix];
            if (gloss) {
              gloss = `(${mockDictionary[prefix] || prefix}-)${gloss}`;
              break;
            }
          }
        }

        // If still not found, provide a fallback
        if (!gloss) {
          gloss = '—';
        }
      }
    }

    // Cache the result
    glossCache.set(token, gloss);
    return gloss;
  });
}

/**
 * Real translation function (placeholder - would be implemented with actual API)
 */
async function realTranslateSentence(text: string): Promise<string> {
  try {
    const response = await realTranslate({
      sourceLang: 'he',
      targetLang: 'en',
      sentences: [text],
    });
    
    return response.sentenceTranslations[0] || '—';
  } catch (error) {
    console.error('Translation error:', error);
    return '—';
  }
}

/**
 * Real token glossing function (placeholder - would be implemented with actual API)
 */
async function realGlossTokens(tokens: string[]): Promise<string[]> {
  try {
    // The API requires at least one sentence, so we'll create a dummy sentence
    // This addresses the "Missing or invalid sentences parameter" error
    const response = await realTranslate({
      sourceLang: 'he',
      targetLang: 'en',
      sentences: ['dummy'],  // Add a dummy sentence to satisfy API requirement
      tokens: [tokens],
    });

    return response.tokenGlosses?.[0] || tokens.map(() => '—');
  } catch (error) {
    console.error('Token glossing error:', error);
    return tokens.map(() => '—');
  }
}

/**
 * Real translation API call to our serverless function
 */
export async function realTranslate(payload: {
  sourceLang: string;
  targetLang: string;
  sentences: string[];
  tokens?: string[][];
}): Promise<{
  sentenceTranslations: string[];
  tokenGlosses?: string[][];
}> {
  try {
    // Determine API endpoint (supports local dev, Vercel, Netlify, etc.)
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const apiEndpoint = `${apiBase}/api/translate`;

    // Call our translation API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add client identifier for rate limiting if needed
        'X-Client-ID': getClientId()
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // If the API fails, log error and fall back to mock translation
      console.error(`Translation API error: ${response.status}`, await response.text());
      throw new Error(`API returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('Real translation failed, falling back to mock:', error);

    // Fall back to mock translations
    return {
      sentenceTranslations: payload.sentences.map(sentence => {
        // Try to find exact match in mock sentences
        if (mockSentences[sentence]) {
          return mockSentences[sentence];
        }
        // Fall back to word-by-word translation
        const words = sentence.split(/\s+/);
        return words
          .map(word => {
            const normalized = word.replace(/[.,?!;:]/g, '');
            return mockDictionary[normalized] || word;
          })
          .join(' ');
      }),
      tokenGlosses: payload.tokens?.map(tokenArray =>
        tokenArray.map(token => {
          const normalized = token.replace(/[.,?!;:]/g, '');
          return mockDictionary[normalized] || '—';
        })
      )
    };
  }
}

/**
 * Generate a consistent client ID for rate limiting
 */
function getClientId(): string {
  // Try to get existing client ID from localStorage
  let clientId = localStorage.getItem('translationClientId');

  if (!clientId) {
    // Generate a new client ID if none exists
    clientId = `client-${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('translationClientId', clientId);
  }

  return clientId;
}