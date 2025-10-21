import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNavBar from '../components/TopNavBar'
import ErrorMessage from '../components/ErrorMessage'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import { TextDoc } from '../types'

const computeWordCount = (text: TextDoc) =>
  text.chunks.reduce((total, chunk) => total + (chunk.tokens?.length || 0), 0)

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

function Read() {
  const [query, setQuery] = useState('')
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const { texts, getTexts, deleteText, isLoading: textsLoading } = useTextStore()
  const { vocab, getVocab } = useVocabStore()

  useEffect(() => {
    void getTexts()
    void getVocab()
  }, [getTexts, getVocab])

  const starredByText = useMemo(() => {
    const map = new Map<string, number>()
    vocab.forEach((item) => {
      const textId = item.sourceRef?.textId
      if (!textId) return
      map.set(textId, (map.get(textId) || 0) + 1)
    })
    return map
  }, [vocab])

  const filteredTexts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return texts
    return texts.filter((text) => {
      const title = text.title?.toLowerCase() ?? ''
      const chunkPreview = text.chunks[0]?.text?.toLowerCase() ?? ''
      return title.includes(normalized) || chunkPreview.includes(normalized)
    })
  }, [texts, query])

  const handleDelete = async (textId: string) => {
    const confirmed = window.confirm('Delete this capture? This cannot be undone.')
    if (!confirmed) return

    try {
      setLibraryError(null)
      setPendingDeleteId(textId)
      await deleteText(textId)
    } catch (error) {
      console.error('Failed to delete capture', error)
      setLibraryError((error as Error).message || 'Could not delete capture. Please try again.')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <>
      <TopNavBar current="read" title="Read" />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 space-y-6 sm:px-6">
        <section className="library-hero">
          <div>
            <h1 className="library-hero__title">Your library</h1>
            <p className="library-hero__subtitle">
              {texts.length > 0
                ? `${texts.length} saved text${texts.length === 1 ? '' : 's'} ready to revisit.`
                : 'Capture something new and it will appear here.'}
            </p>
          </div>
          <Link className="btn library-hero__cta" to="/camera">
            Capture new text
          </Link>
        </section>

        <section className="library-search">
          <label className="library-search__label" htmlFor="library-search">
            Search library
          </label>
          <input
            id="library-search"
            className="library-search__input"
            placeholder="Filter by title or content"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </section>

        <ErrorMessage error={libraryError} onDismiss={() => setLibraryError(null)} />

        <section className="library-grid">
          {textsLoading ? (
            <div className="library-empty">Loading texts…</div>
          ) : filteredTexts.length === 0 ? (
            <div className="library-empty">
              <p>No texts found.</p>
              <p className="library-empty__hint">Try adjusting your search or capture something new.</p>
            </div>
          ) : (
            filteredTexts.map((text) => {
              const wordCount = computeWordCount(text)
              const savedCount = starredByText.get(text.id) || 0
              const progress = wordCount > 0 ? Math.round((savedCount / wordCount) * 100) : 0

              return (
                <article key={text.id} className="library-card">
                  <div className="library-card__header">
                    <div>
                      <h2 className="library-card__title">{text.title || 'Untitled capture'}</h2>
                      <p className="library-card__meta">
                        Added {formatDate(text.createdAt)} · {wordCount} words · {text.chunks.length} segments
                      </p>
                    </div>
                    <div className="library-card__actions">
                      <Link className="btn btn-outline btn-small" to={`/read/${text.id}`}>
                        Open
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small library-card__delete"
                        onClick={() => handleDelete(text.id)}
                        disabled={pendingDeleteId === text.id}
                      >
                        {pendingDeleteId === text.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  <div className="library-card__progress">
                    <div className="library-card__progress-label">
                      <span>Practice coverage</span>
                      <span>
                        {progress}% ({savedCount} saved)
                      </span>
                    </div>
                    <div className="library-card__progress-track">
                      <div className="library-card__progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  {text.chunks[0] && (
                    <p className="library-card__preview" dir="rtl">
                      {text.chunks[0].text}
                    </p>
                  )}
                </article>
              )
            })
          )}
        </section>
      </main>
    </>
  )
}

export default Read
