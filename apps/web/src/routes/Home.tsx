import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopNavBar from '../components/TopNavBar'
import { useProfileStore } from '../state/useProfileStore'
import { useProgressStore } from '../state/useProgressStore'
import { useVocabStore } from '../state/useVocabStore'
import { useReviewStore } from '../state/useReviewStore'
import { useTextStore } from '../state/useTextStore'
import { StarredItem, TextDoc } from '../types'
import { useLexicon, LexiconEntry } from '../hooks/useLexicon'
import { detectLanguage, suggestRoot, stripNikud } from '../utils/hebrew'

const DAY_IN_MS = 24 * 60 * 60 * 1000

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

const formatRelativeTime = (timestamp: number) => {
  const diffMs = Date.now() - timestamp
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

const makeManualItem = (lemma: string, gloss: string, root?: string): StarredItem => {
  const fallbackId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const generatedId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackId

  return {
    id: generatedId,
    lemma: lemma.trim(),
    gloss: gloss.trim(),
    root: root?.trim() || undefined,
    createdAt: Date.now(),
  }
}

function Home() {
  const navigate = useNavigate()
  const displayName = useProfileStore((state) => state.displayName)
  const streak = useProgressStore((state) => state.streak)
  const getReadingMinutesForRange = useProgressStore((state) => state.getReadingMinutesForRange)
  const vocab = useVocabStore((state) => state.vocab)
  const vocabLoading = useVocabStore((state) => state.isLoading)
  const getVocab = useVocabStore((state) => state.getVocab)
  const starItem = useVocabStore((state) => state.starItem)
  const texts = useTextStore((state) => state.texts)
  const textLoading = useTextStore((state) => state.isLoading)
  const getTexts = useTextStore((state) => state.getTexts)
  const reviewCards = useReviewStore((state) => state.cards)

  const { search: searchLexicon, findByLemma } = useLexicon()

  const [lemma, setLemma] = useState('')
  const [gloss, setGloss] = useState('')
  const [root, setRoot] = useState('')
  const [pronunciation, setPronunciation] = useState('')
  const [suggestions, setSuggestions] = useState<LexiconEntry[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<LexiconEntry | null>(null)
  const [detectedLang, setDetectedLang] = useState<'hebrew' | 'latin' | 'unknown'>('unknown')

  const [lemmaTouched, setLemmaTouched] = useState(false)
  const [glossTouched, setGlossTouched] = useState(false)
  const [rootTouched, setRootTouched] = useState(false)
  const [quickAddStatus, setQuickAddStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [quickAddMessage, setQuickAddMessage] = useState<string | null>(null)
  const [isVoiceSupported, setIsVoiceSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any | null>(null)

  const handleLemmaChange = useCallback(
    (value: string, options?: { entry?: LexiconEntry; fromSuggestion?: boolean }) => {
      setLemma(value)
      setLemmaTouched(true)

      const trimmed = value.trim()
      const language = detectLanguage(trimmed)
      setDetectedLang(language)

      setQuickAddStatus((prev) => (prev === 'saving' ? prev : 'idle'))
      if (!options?.fromSuggestion) {
        setQuickAddMessage(null)
      }

      if (!trimmed) {
        setSuggestions([])
        setSelectedSuggestion(null)
        if (!glossTouched) setGloss('')
        if (!rootTouched) setRoot('')
        setPronunciation('')
        return
      }

      const results = searchLexicon(trimmed)
      setSuggestions(results)

      const bestEntry =
        options?.entry ??
        findByLemma(trimmed) ??
        results.find((entry) => stripNikud(entry.lemma) === stripNikud(trimmed)) ??
        results[0] ??
        null

      if (options?.fromSuggestion) {
        setSelectedSuggestion(bestEntry)
      } else if (bestEntry && stripNikud(bestEntry.lemma) === stripNikud(trimmed)) {
        setSelectedSuggestion(bestEntry)
      } else {
        setSelectedSuggestion(null)
      }

      const derivedRoot = suggestRoot(trimmed, bestEntry?.root)
      if (options?.fromSuggestion || (!rootTouched && (derivedRoot || root.trim().length === 0))) {
        setRoot(derivedRoot || '')
        if (options?.fromSuggestion) setRootTouched(false)
      }

      if (bestEntry?.pronunciation) {
        setPronunciation(bestEntry.pronunciation)
      } else if (!options?.fromSuggestion) {
        setPronunciation('')
      }

      if (bestEntry && (!glossTouched || options?.fromSuggestion)) {
        setGloss(bestEntry.gloss)
        if (options?.fromSuggestion) setGlossTouched(false)
      }

      if (bestEntry && !options?.fromSuggestion) {
        setQuickAddMessage(`Suggestion: ${stripNikud(bestEntry.lemma)} → ${bestEntry.gloss}`)
        setQuickAddStatus('success')
      }
    },
    [searchLexicon, findByLemma, glossTouched, rootTouched, root],
  )

  const handleSuggestionSelect = useCallback(
    (entry: LexiconEntry) => {
      handleLemmaChange(entry.lemma, { entry, fromSuggestion: true })
      setQuickAddMessage(`Using dictionary entry for ${stripNikud(entry.lemma)}`)
      setQuickAddStatus('success')
    },
    [handleLemmaChange],
  )

  const handleGlossChange = useCallback(
    (value: string) => {
      setGloss(value)
      if (!glossTouched) setGlossTouched(true)
      if (!value.trim()) {
        setQuickAddStatus((prev) => (prev === 'saving' ? prev : 'idle'))
      }
    },
    [glossTouched],
  )

  const handleRootChange = useCallback(
    (value: string) => {
      setRoot(value)
      if (!rootTouched) setRootTouched(true)
    },
    [rootTouched],
  )

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speakPronunciation = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(lemma || pronunciation)
    utterance.lang = detectedLang === 'latin' ? 'en-US' : 'he-IL'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [lemma, pronunciation, detectedLang])

  useEffect(() => {
    void getVocab()
    void getTexts()
  }, [getVocab, getTexts])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'he-IL'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim()
      if (transcript) {
        handleLemmaChange(transcript)
        setQuickAddMessage('Voice captured. Review the suggestion and save.')
        setQuickAddStatus('success')
      }
      setIsListening(false)
    }
    recognition.onerror = () => {
      setIsListening(false)
      setQuickAddStatus('error')
      setQuickAddMessage('Could not capture audio. Try again.')
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsVoiceSupported(true)
  }, [handleLemmaChange])

  const handleToggleVoice = () => {
    if (!isVoiceSupported || !recognitionRef.current) return
    try {
      if (isListening) {
        recognitionRef.current.stop()
      } else {
        setQuickAddMessage(null)
        setQuickAddStatus('idle')
        recognitionRef.current.start()
        setIsListening(true)
      }
    } catch (error) {
      console.error('Voice capture error', error)
      setIsListening(false)
      setQuickAddStatus('error')
      setQuickAddMessage('Voice capture unavailable right now.')
    }
  }

  const windowStart = useMemo(() => startOfToday() - 6 * DAY_IN_MS, [])

  const wordsThisWeek = useMemo(
    () => vocab.filter((item) => item.createdAt >= windowStart).length,
    [vocab, windowStart],
  )

  const totalWords = vocab.length
  const readingMinutes = useMemo(() => getReadingMinutesForRange(7), [getReadingMinutesForRange])
  const reviewsDue = useMemo(
    () => reviewCards.filter((card) => card.due <= Date.now()).length,
    [reviewCards],
  )

  const recentWords = vocab.slice(0, 5)
  const latestText: TextDoc | undefined = texts[0]

  const handleQuickAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedLemma = lemma.trim()
    const trimmedGloss = gloss.trim()
    if (!trimmedLemma || !trimmedGloss) {
      setQuickAddStatus('error')
      setQuickAddMessage('Add both the Hebrew lemma and a quick gloss.')
      return
    }

    setQuickAddStatus('saving')
    setQuickAddMessage(null)

    try {
      const inferredRoot = rootTouched ? root.trim() : suggestRoot(trimmedLemma, selectedSuggestion?.root)
      const item = makeManualItem(trimmedLemma, trimmedGloss, inferredRoot || undefined)
      await starItem(item)
      setLemma('')
      setGloss('')
      setRoot('')
      setPronunciation('')
      setSuggestions([])
      setSelectedSuggestion(null)
      setLemmaTouched(false)
      setGlossTouched(false)
      setRootTouched(false)
      setQuickAddStatus('success')
      setQuickAddMessage('Saved to your deck. It will appear in Review.')
    } catch (error) {
      console.error('Quick add failed', error)
      setQuickAddStatus('error')
      setQuickAddMessage('Could not save the word. Try again.')
    }
  }

  const isBusy = vocabLoading || textLoading

  return (
    <>
      <TopNavBar current="home" title="Home" />
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-8 space-y-8 sm:px-6 lg:max-w-5xl">
        <header className="home-hero">
          <span className="home-hero__eyebrow">Stay on track with Mila</span>
          <h1 className="home-hero__title">Shalom, {displayName} 👋</h1>
          <p className="home-hero__support">
            Ready to keep the streak alive? Keep capturing, reviewing, and celebrating every win along the way.
          </p>
        </header>

        <section className="progress-pulse">
          <div className="progress-pulse__inner">
            <div className="space-y-2 text-center sm:text-left">
              <p className="progress-pulse__title">Progress pulse</p>
              <p className="progress-pulse__subtitle">Your momentum snapshot for the past seven days</p>
            </div>
            <div className="progress-pulse__streak">
              <p className="progress-pulse__streak-label">Streak</p>
              <p className="progress-pulse__streak-value">{streak} 🔥</p>
            </div>
          </div>

          <div className="progress-pulse__metrics">
            <div className="progress-pulse__metric">
              <label>Words this week</label>
              <strong>{wordsThisWeek}</strong>
            </div>
            <div className="progress-pulse__metric">
              <label>Reviews due</label>
              <strong>{reviewsDue}</strong>
            </div>
            <div className="progress-pulse__metric">
              <label>Minutes read</label>
              <strong>{readingMinutes}</strong>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <button className="cta-card cta-card--primary" onClick={() => navigate('/review')} type="button">
            <span className="cta-card__eyebrow">Primary</span>
            <span className="cta-card__title">Start Review</span>
            <span className="cta-card__support">
              {reviewsDue > 0 ? `${reviewsDue} card${reviewsDue === 1 ? '' : 's'} waiting` : 'All clear for now'}
            </span>
          </button>

          <button className="cta-card cta-card--secondary" onClick={() => navigate('/camera')} type="button">
            <span className="cta-card__eyebrow">Secondary</span>
            <span className="cta-card__title text-slate-900">Open Camera</span>
            <span className="cta-card__support">Capture new Hebrew in-field and save instantly</span>
          </button>
        </section>

        <section className="card rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">Quick add</h2>
              <p className="text-sm text-slate-500">Type or speak a new word and we’ll queue it for review.</p>
            </div>
            <button
              className={`btn btn-small ${isVoiceSupported ? '' : 'btn-secondary'} ${isListening ? 'bg-primary text-white' : ''}`}
              onClick={handleToggleVoice}
              type="button"
              disabled={!isVoiceSupported}
            >
              {isListening ? 'Listening…' : 'Voice'}
            </button>
          </div>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleQuickAdd}>
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="quick-lemma" className="text-xs font-semibold uppercase text-gray-500">
                Hebrew lemma
              </label>
              <input
                id="quick-lemma"
                className="input"
                placeholder="הַמִּלָּה"
                value={lemma}
                onChange={(event) => handleLemmaChange(event.target.value)}
                dir={detectedLang === 'hebrew' ? 'rtl' : 'ltr'}
              />
              <p className="text-xs text-gray-500">
                {detectedLang === 'hebrew'
                  ? 'Detected Hebrew · right-to-left'
                  : detectedLang === 'latin'
                  ? 'Detected Latin script'
                  : 'Enter a lemma or tap a suggestion'}
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="quick-gloss" className="text-xs font-semibold uppercase text-gray-500">
                Gloss / hint
              </label>
              <input
                id="quick-gloss"
                className="input"
                placeholder="quick translation"
                value={gloss}
                onChange={(event) => handleGlossChange(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="quick-root" className="text-xs font-semibold uppercase text-gray-500">
                Root
              </label>
              <input
                id="quick-root"
                className="input"
                placeholder="auto-detected"
                value={root}
                onChange={(event) => handleRootChange(event.target.value)}
                dir="rtl"
              />
              <p className="text-xs text-gray-500">
                {rootTouched ? 'Edited manually' : root ? 'Auto-detected from lexicon' : 'Will be inferred on save'}
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="quick-pronunciation" className="text-xs font-semibold uppercase text-gray-500">
                Pronunciation
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="quick-pronunciation"
                  className="input flex-1"
                  placeholder="shalom"
                  value={pronunciation}
                  onChange={(event) => setPronunciation(event.target.value)}
                />
                <button
                  className="btn btn-small"
                  type="button"
                  onClick={speakPronunciation}
                  disabled={!speechSupported || (!lemma && !pronunciation)}
                >
                  Preview
                </button>
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((entry) => (
                    <button
                      key={`${entry.lemma}-${entry.gloss}`}
                      type="button"
                      className={`px-3 py-2 rounded border text-sm transition ${
                        selectedSuggestion && stripNikud(selectedSuggestion.lemma) === stripNikud(entry.lemma)
                          ? 'border-primary text-primary bg-primary/5'
                          : 'border-gray-200 hover:border-primary hover:text-primary'
                      }`}
                      onClick={() => handleSuggestionSelect(entry)}
                    >
                      <span className="font-semibold" dir="rtl">
                        {entry.lemma}
                      </span>
                      <span className="ml-2 text-gray-500">{entry.gloss}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(gloss || root || pronunciation) && (
              <div className="sm:col-span-2">
                <div className="rounded-lg border border-gray-200 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold" dir="rtl">
                      {lemma || 'Lemma pending'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {gloss || 'Add a quick gloss'} · {root ? `Root ${root}` : 'Root pending'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {selectedSuggestion ? 'From lexicon' : rootTouched ? 'Manual entry' : 'Heuristic'}
                    </span>
                    <button
                      className="btn btn-secondary btn-small"
                      type="button"
                      onClick={speakPronunciation}
                      disabled={!speechSupported || (!lemma && !pronunciation)}
                    >
                      Play audio
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                className="btn bg-primary text-white hover:bg-primary/90"
                type="submit"
                disabled={quickAddStatus === 'saving'}
              >
                {quickAddStatus === 'saving' ? 'Saving…' : 'Save & schedule'}
              </button>
              <p
                className={`text-sm ${
                  quickAddStatus === 'error'
                    ? 'text-red-600'
                    : quickAddStatus === 'success'
                    ? 'text-emerald-600'
                    : 'text-gray-500'
                }`}
              >
                {quickAddMessage || 'Auto-saves to vocab & queues for spaced review.'}
              </p>
            </div>
          </form>
        </section>
        <section className="card rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Recent activity</h2>
            {totalWords > 0 && (
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Total words · {totalWords}
              </span>
            )}
          </div>
          {isBusy ? (
            <div className="flex items-center justify-center py-10 text-slate-500">Loading your data…</div>
          ) : recentWords.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {recentWords.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900" dir="rtl">{item.lemma}</p>
                    <p className="text-sm text-slate-500">{item.gloss}</p>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">{formatRelativeTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-10 text-center text-slate-500">
              Capture a text or quick add a word to see activity here.
            </div>
          )}
          {latestText && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Continue reading</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{latestText.title || 'Untitled capture'}</p>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>{latestText.chunks.length} segments</span>
                <Link className="btn btn-small" to={`/read/${latestText.id}`}>
                  Resume
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  )
}

export default Home
