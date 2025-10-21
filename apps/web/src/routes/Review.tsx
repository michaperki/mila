import { useEffect, useMemo, useRef, useState } from 'react'
import TopNavBar from '../components/TopNavBar'
import { useReviewStore } from '../state/useReviewStore'
import { useProgressStore } from '../state/useProgressStore'
import { ReviewCard, ReviewRating } from '../types'

type ReviewMode = 'recall' | 'recognition' | 'listening' | 'typing' | 'root'

const ratingConfig: Array<{ rating: ReviewRating; label: string; helper: string; tone: 'again' | 'hard' | 'good' | 'easy' }> = [
  { rating: 1, label: 'Again', helper: 'Forgot', tone: 'again' },
  { rating: 2, label: 'Hard', helper: 'Barely', tone: 'hard' },
  { rating: 3, label: 'Good', helper: 'Remembered', tone: 'good' },
  { rating: 4, label: 'Easy', helper: 'Too simple', tone: 'easy' },
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

  const lastSessionLabel = useMemo(() => {
    if (!lastSessionAt) return '—'
    const diffMs = Date.now() - lastSessionAt
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(lastSessionAt).toLocaleDateString()
  }, [lastSessionAt])

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

  const promptIsHebrew = currentCard
    ? (() => {
        switch (mode) {
          case 'recognition':
            return !isFront
          case 'root':
            return isFront
          case 'typing':
            return true
          default:
            return isFront
        }
      })()
    : true

  return (
    <>
      <TopNavBar current="review" title="Review" subtitle="Stay sharp with spaced repetition" />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 space-y-8 sm:px-6">
        <section className="review-hero">
          <div className="review-hero__intro">
            <span className="review-hero__eyebrow">Keep the momentum</span>
            <h1 className="review-hero__title">Review</h1>
            <p className="review-hero__subtitle">
              Stay on top of spaced repetition with quick sessions tailored to your pace.
            </p>
          </div>
          <div className="review-hero__stats">
            <div className="review-hero__metric">
              <span>Due now</span>
              <strong>{dueCards.length}</strong>
              <small>Ready to review</small>
            </div>
            <div className="review-hero__metric">
              <span>Next 24 hours</span>
              <strong>{upcomingIn24}</strong>
              <small>On the horizon</small>
            </div>
            <div className="review-hero__metric">
              <span>Reviewed today</span>
              <strong>{answeredCount}</strong>
              <small>In this session</small>
            </div>
            <div className="review-hero__metric">
              <span>Last session</span>
              <strong>{lastSessionLabel}</strong>
              <small>Most recent wrap-up</small>
            </div>
          </div>
          <div className="review-hero__actions">
            <button
              type="button"
              className={`btn btn-small${sessionLimit === null ? '' : ' btn-outline'}`}
              onClick={() => handleRestart(null)}
              disabled={dueCards.length === 0}
            >
              Review all
            </button>
            <button
              type="button"
              className={`btn btn-small${sessionLimit === 7 ? '' : ' btn-outline'}`}
              onClick={() => handleRestart(7)}
              disabled={dueCards.length === 0}
            >
              Quick 7
            </button>
          </div>
        </section>

        <section className="review-modes card">
          <header className="review-modes__header">
            <div>
              <p className="review-modes__eyebrow">Focus mode</p>
              <h2 className="review-modes__title">Choose how you want to review</h2>
            </div>
            <span className="review-modes__pill">
              {activeCards.length} card{activeCards.length === 1 ? '' : 's'} queued
            </span>
          </header>
          <div className="review-modes__options">
            {modes.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`btn btn-small review-modes__button${mode === item.key ? '' : ' btn-outline'}`}
                onClick={() => setMode(item.key)}
                disabled={item.key === 'root' && !currentCard?.root}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="review-modes__hint">{modes.find((item) => item.key === mode)?.description}</p>
        </section>

        {activeCards.length === 0 ? (
          <section className="review-empty card">
            <div className="review-empty__icon" aria-hidden="true">
              {sessionComplete ? '🎉' : '✨'}
            </div>
            <h2 className="review-empty__title">
              {sessionComplete ? 'Nice work! All caught up.' : 'Nothing to review right now'}
            </h2>
            <p className="review-empty__subtitle">
              {sessionComplete
                ? 'Take a moment to celebrate or capture new words to grow your deck.'
                : 'You are up to date. Capture more words or check back later for new reviews.'}
            </p>
          </section>
        ) : (
          <section className="review-session">
            <article className="review-card">
              <header className="review-card__header">
                <span>
                  Card {currentIndex + 1} of {activeCards.length}
                </span>
                {currentCard && <span>{formatDueCountdown(currentCard)}</span>}
              </header>
              <div className="review-card__body">
                <p
                  className={`review-card__prompt${promptIsHebrew ? '' : ' review-card__prompt--ltr'}`}
                  dir={promptIsHebrew ? 'rtl' : 'ltr'}
                >
                  {currentCard ? getPrompt(currentCard, mode, isFront) : ''}
                </p>
                {mode === 'typing' && isFront && (
                  <input
                    className="review-input"
                    placeholder="Type your answer"
                    value={typingAnswer}
                    onChange={(event) => setTypingAnswer(event.target.value)}
                    dir="rtl"
                  />
                )}
                {mode === 'listening' && (
                  <button className="btn btn-ghost btn-small review-card__audio" onClick={handlePlayAudio} type="button">
                    Play audio
                  </button>
                )}
              </div>
              <footer className="review-card__footer">
                <button className="btn btn-secondary btn-small" onClick={handleFlip} type="button">
                  {isFront ? 'Show answer' : 'Hide answer'}
                </button>
              </footer>
            </article>

            <article className="review-ratings card">
              <header className="review-ratings__header">
                <div>
                  <p className="review-ratings__eyebrow">Rate your recall</p>
                  <h3 className="review-ratings__title">How did that go?</h3>
                </div>
                <span className="review-ratings__count">
                  {answeredCount} reviewed today
                </span>
              </header>
              <div className="review-ratings__grid">
                {ratingConfig.map(({ rating, label, helper, tone }) => (
                  <button
                    key={rating}
                    type="button"
                    className={`review-rating review-rating--${tone}`}
                    onClick={() => handleGrade(rating)}
                  >
                    <span className="review-rating__label">{label}</span>
                    <span className="review-rating__helper">{helper}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        )}
      </main>
    </>
  )
}

export default Review
