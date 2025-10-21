const HEBREW_RANGE = /[\u0590-\u05FF]/
const NIKUD_RANGE = /[\u0591-\u05BD\u05BF\u05C1-\u05C7]/g

const COMMON_PREFIXES = ['ה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש', 'ת', 'י']
const COMMON_SUFFIXES = ['ים', 'ות', 'ה', 'ך', 'ן']

export const containsHebrew = (value: string) => HEBREW_RANGE.test(value)

export const stripNikud = (value: string) => value.normalize('NFD').replace(NIKUD_RANGE, '')

const removeNonHebrew = (value: string) => value.replace(/[^א-ת]/g, '')

const stripPrefixes = (value: string) => {
  let result = value
  for (const prefix of COMMON_PREFIXES) {
    if (result.startsWith(prefix) && result.length > 3) {
      result = result.slice(1)
    } else {
      break
    }
  }
  return result
}

const stripSuffixes = (value: string) => {
  for (const suffix of COMMON_SUFFIXES) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 3) {
      return value.slice(0, value.length - suffix.length)
    }
  }
  return value
}

export const suggestRoot = (lemma: string, hintedRoot?: string) => {
  if (hintedRoot && hintedRoot.trim().length >= 2) {
    return hintedRoot.trim()
  }

  if (!containsHebrew(lemma)) return undefined

  let candidate = stripNikud(lemma)
  candidate = removeNonHebrew(candidate)
  candidate = stripPrefixes(candidate)
  candidate = stripSuffixes(candidate)

  if (candidate.length >= 3) {
    return candidate.slice(0, 3)
  }

  return candidate || undefined
}

export const detectLanguage = (lemma: string) => {
  if (containsHebrew(lemma)) return 'hebrew'
  if (/^[a-zA-Z\s'-]+$/.test(lemma.trim())) return 'latin'
  return 'unknown'
}
