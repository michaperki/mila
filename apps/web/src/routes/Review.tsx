import { useEffect, useMemo, useRef, useState } from 'react'
import TopNavBar from '../components/TopNavBar'
import { useReviewStore } from '../state/useReviewStore'
import { useProgressStore } from '../state/useProgressStore'
import { ReviewCard, ReviewRating } from '../types'

type ReviewMode = 'recall' | 'recognition' | 'listening' | 'typing' | 'root'

const ratingConfig: Array<{ rating: ReviewRating; label: string; helper: string; tone: string }> = [
  { rating: 1, label: 'Again', helper: 'Forgot', tone: 'bg-red-100 text-red-700' },
  { rating: 2, label: 'Hard', helper: 'Barely', tone: 'bg-amber-100 text-amber-700' },
  { rating: 3, label: 'Good', helper: 'Remembered', tone: 'bg-emerald-100 text-emerald-700' },
  { rating: 4, label: 'Easy', helper: 'Too simple', tone: 'bg-blue-100 text-blue-700' },
]

const modes: Array<{ key: ReviewMode; label: string; description: string }> = [
  { key: 'recall', label: 'Heb → Eng', description: 'Recall the meaning' },
  { key: 'recognition', label: 'Eng → Heb', description: 'Recognize the form' },
  { key: 'listening', label: 'Listening', description: 'Hear and identify' },
  { key: 'typing', label: 'Typing', description: 'Type your answer' },
  { key: 'root', label: 'Roots', description: 'Drill the shoresh' },
]

const getPrompt = (card: ReviewCard, mode: ReviewMode, isFront: boolean) => {
  if (mode === 'recognition') {
    return isFront ? card.gloss : card.lemma
  }
  if (mode === 'typing' && !isFront) {
    return card.lemma
  }
  if (mode === 'root') {
    return isFront ? card.lemma : card.root || 'Root unavailable'
  }
  return isFront ? card.lemma : card.gloss
}

const formatDueCountdown = (card: ReviewCard) => {
  const diff = card.due - Date.now()
  if (diff <= 0) return 'due now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `due in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `due in ${hours}h`
  const days = Math.floor(hours / 24)
  return `due in ${days}d`
}

function Review() {
  const reviewCards = useReviewStore((state) => state.cards)
  const gradeCard = useReviewStore((state) => state.gradeCard)
  const lastSessionAt = useReviewStore((state) => state.lastSessionAt)
  const recordReviewSession = useProgressStore((state) => state.recordReviewSession)

  const [mode, setMode] = useState<ReviewMode>('recall')
  const [sessionLimit, setSessionLimit] = useState<number | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFront, setIsFront] = useState(true)
  const [typingAnswer, setTypingAnswer] = useState('')
  const [sessionComplete, setSessionComplete] = useState(false)
  const [answeredCount, setAnsweredCount] = useState(0)

  const sessionStartRef = useRef<number | null>(null)
  const answeredRef = useRef(0)

  const dueCards = useMemo(
    () =>
      reviewCards
        .filter((card) => card.due <= Date.now())
        .sort((a, b) => a.due - b.due),
    [reviewCards],
  )

  const upcomingIn24 = useMemo(
    () =>
      reviewCards.filter((card) => card.due > Date.now() && card.due <= Date.now() + 24 * 60 * 60 * 1000).length,
    [reviewCards],
  )

  const activeCards = useMemo(() => {
    if (!sessionLimit) return dueCards
    return dueCards.slice(0, sessionLimit)
  }, [dueCards, sessionLimit])

  const currentCard: ReviewCard | null = activeCards[currentIndex] ?? null

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (activeCards.length > 0 && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now()
      answeredRef.current = 0
      setAnsweredCount(0)
      setSessionComplete(false)
    }

    if (
      activeCards.length === 0 &&
      sessionStartRef.current !== null &&
      answeredRef.current > 0 &&
      !sessionComplete
    ) {
      const durationMs = Date.now() - sessionStartRef.current
      const minutes = Math.max(1, Math.round(durationMs / 60000))
      recordReviewSession(minutes)
      sessionStartRef.current = null
      answeredRef.current = 0
      setSessionComplete(true)
    }
  }, [activeCards.length, recordReviewSession, sessionComplete])

  useEffect(() => {
    if (currentIndex >= activeCards.length) {
      setCurrentIndex(0)
    }
  }, [activeCards.length, currentIndex])

  useEffect(() => {
    setTypingAnswer('')
  }, [currentCard?.id, mode])

  useEffect(() => {
    if (mode === 'listening' && speechSupported && currentCard && isFront) {
      const utterance = new SpeechSynthesisUtterance(currentCard.lemma)
      utterance.lang = 'he-IL'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    }
  }, [mode, speechSupported, currentCard, isFront])

  const handleFlip = () => setIsFront((prev) => !prev)

  const handleGrade = (rating: ReviewRating) => {
    if (!currentCard) return
    gradeCard(currentCard.id, rating)
    answeredRef.current += 1
    setAnsweredCount(answeredRef.current)
    setIsFront(true)
    setTypingAnswer('')
    const maxIndexAfterRemoval = Math.max(0, activeCards.length - 2)
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, maxIndexAfterRemoval)))
  }

  const handleRestart = (limit: number | null) => {
    setSessionLimit(limit)
    setCurrentIndex(0)
    setIsFront(true)
    setTypingAnswer('')
    setSessionComplete(false)
    sessionStartRef.current = null
    answeredRef.current = 0
    setAnsweredCount(0)
  }

  const handlePlayAudio = () => {
    if (!speechSupported || !currentCard) return
    const utterance = new SpeechSynthesisUtterance(currentCard.lemma)
    utterance.lang = 'he-IL'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <>
      <TopNavBar current="review" title="Review" subtitle="Stay sharp with spaced repetition" />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 space-y-5 sm:px-6">
        <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Due now: {dueCards.length}</h1>
            <p className="text-sm text-gray-500">
              {upcomingIn24 > 0 ? `${upcomingIn24} more arriving in the next 24h` : 'You are caught up for the day.'}
            </p>
            {lastSessionAt && (
              <p className="text-xs text-gray-400 mt-1">
                Last session: {new Date(lastSessionAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className={`btn btn-small ${sessionLimit === null ? 'bg-primary text-white' : ''}`}
              onClick={() => handleRestart(null)}
              disabled={dueCards.length === 0}
            >
              Review all
            </button>
            <button
              className={`btn btn-small ${sessionLimit === 7 ? 'bg-primary text-white' : ''}`}
              onClick={() => handleRestart(7)}
              disabled={dueCards.length === 0}
            >
              Quick 7
            </button>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {modes.map((item) => (
              <button
                key={item.key}
                className={`btn btn-small whitespace-nowrap ${
                  mode === item.key ? 'bg-primary text-white' : ''
                }`}
                onClick={() => setMode(item.key)}
                disabled={item.key === 'root' && !currentCard?.root}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {modes.find((item) => item.key === mode)?.description}
          </p>
        </section>

        {activeCards.length === 0 ? (
          <section className="card text-center py-12">
            <h2 className="text-xl font-semibold">
              {sessionComplete ? 'Nice work!' : 'No reviews right now'}
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              {sessionComplete
                ? 'Take a breather or add new words from the camera.'
                : 'You are up to date. Capture more words or check back later.'}
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="card review-card h-56 flex flex-col justify-between">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  Card {currentIndex + 1} of {activeCards.length}
                </span>
                {currentCard && <span>{formatDueCountdown(currentCard)}</span>}
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <p
                  className={`text-2xl font-semibold ${
                    mode === 'recognition' && isFront ? 'text-left' : 'text-right'
                  }`}
                  dir={mode === 'recognition' && isFront ? 'ltr' : 'rtl'}
                >
                  {currentCard ? getPrompt(currentCard, mode, isFront) : ''}
                </p>
                {mode === 'typing' && isFront && (
                  <input
                    className="input text-center"
                    placeholder="Type your answer"
                    value={typingAnswer}
                    onChange={(event) => setTypingAnswer(event.target.value)}
                    dir="rtl"
                  />
                )}
                {mode === 'listening' && (
                  <button className="btn btn-small" onClick={handlePlayAudio} type="button">
                    Play audio
                  </button>
                )}
              </div>
              <button className="btn btn-secondary" onClick={handleFlip} type="button">
                {isFront ? 'Show answer' : 'Hide answer'}
              </button>
            </div>

            <div className="card flex flex-col gap-3">
              <p className="text-sm text-gray-500">
                How did it go? {answeredCount} reviewed this session.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ratingConfig.map(({ rating, label, helper, tone }) => (
                  <button
                    key={rating}
                    className={`p-3 rounded-lg border text-left ${tone} border-transparent hover:opacity-90`}
                    onClick={() => handleGrade(rating)}
                  >
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs">{helper}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  )
}

export default Review
