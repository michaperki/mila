import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopNavBar from '../components/TopNavBar'
import { useProfileStore } from '../state/useProfileStore'
import { useProgressStore } from '../state/useProgressStore'
import { useVocabStore } from '../state/useVocabStore'
import { useReviewStore } from '../state/useReviewStore'
import { useTextStore } from '../state/useTextStore'
import { StarredItem, TextDoc } from '../types'

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

const makeManualItem = (lemma: string, gloss: string): StarredItem => {
  const fallbackId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const generatedId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackId

  return {
    id: generatedId,
    lemma: lemma.trim(),
    gloss: gloss.trim(),
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

  const [lemma, setLemma] = useState('')
  const [gloss, setGloss] = useState('')
  const [quickAddStatus, setQuickAddStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [quickAddMessage, setQuickAddMessage] = useState<string | null>(null)
  const [isVoiceSupported, setIsVoiceSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any | null>(null)

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
        setLemma(transcript)
        setQuickAddMessage('Voice captured. Provide a gloss and save.')
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
  }, [])

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
      const item = makeManualItem(trimmedLemma, trimmedGloss)
      await starItem(item)
      setLemma('')
      setGloss('')
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
      <TopNavBar current="home" title="Home" subtitle="Stay on track with Mila" />
      <main className="container py-6 space-y-5 pb-24">
        <section className="card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-primary font-medium">Shalom, {displayName} 👋</p>
              <h1 className="text-2xl font-semibold mt-1">Ready to keep the streak alive?</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Streak</p>
              <p className="text-2xl font-semibold text-primary">{streak}🔥</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 uppercase font-semibold tracking-wide">Words this week</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{wordsThisWeek}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-600 uppercase font-semibold tracking-wide">Reviews due</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{reviewsDue}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 col-span-2 sm:col-span-1">
              <p className="text-xs text-emerald-600 uppercase font-semibold tracking-wide">Minutes read</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{readingMinutes}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            className="card flex flex-col items-start gap-1 text-left hover:bg-primary/5 transition"
            onClick={() => navigate('/review')}
          >
            <span className="text-sm text-primary font-semibold uppercase tracking-wide">Primary</span>
            <span className="text-xl font-bold">Start Review</span>
            <span className="text-sm text-gray-500">
              {reviewsDue > 0 ? `${reviewsDue} card${reviewsDue === 1 ? '' : 's'} waiting` : 'All clear for now'}
            </span>
          </button>

          <button
            className="card flex flex-col items-start gap-1 text-left hover:bg-primary/5 transition"
            onClick={() => navigate('/camera')}
          >
            <span className="text-sm text-gray-500 font-semibold uppercase tracking-wide">Secondary</span>
            <span className="text-xl font-bold">Open Camera</span>
            <span className="text-sm text-gray-500">Capture new Hebrew in-field and save instantly</span>
          </button>
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Quick add</h2>
              <p className="text-sm text-gray-500">Type or speak a new word to drop it into Review.</p>
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
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleQuickAdd}>
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="quick-lemma" className="text-xs font-semibold uppercase text-gray-500">
                Hebrew lemma
              </label>
              <input
                id="quick-lemma"
                className="input"
                placeholder="הַמִּלָּה"
                value={lemma}
                onChange={(event) => setLemma(event.target.value)}
                dir="rtl"
              />
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
                onChange={(event) => setGloss(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
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

        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            {totalWords > 0 && (
              <span className="text-xs text-gray-500 uppercase font-semibold tracking-wide">
                Total words · {totalWords}
              </span>
            )}
          </div>
          {isBusy ? (
            <div className="flex items-center justify-center py-8 text-gray-500">Loading your data…</div>
          ) : recentWords.length > 0 ? (
            <ul className="space-y-3">
              {recentWords.map((item) => (
                <li key={item.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold" dir="rtl">{item.lemma}</p>
                    <p className="text-sm text-gray-500">{item.gloss}</p>
                  </div>
                  <span className="text-xs text-gray-400">{formatRelativeTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-gray-500">
              Capture a text or quick add a word to see activity here.
            </div>
          )}
          {latestText && (
            <div className="mt-5 rounded-lg border border-dashed border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Continue reading</p>
              <p className="text-lg font-semibold mb-2">{latestText.title || 'Untitled capture'}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{latestText.chunks.length} segments</span>
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
