import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNavBar from '../components/TopNavBar'
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
  const { texts, getTexts, isLoading: textsLoading } = useTextStore()
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

  return (
    <>
      <TopNavBar current="read" title="Read" subtitle="Jump back into any capture" />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 space-y-5 sm:px-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Your library</h1>
            <p className="text-sm text-gray-500">
              {texts.length > 0 ? `${texts.length} saved text${texts.length === 1 ? '' : 's'}` : 'Capture a new text to get started.'}
            </p>
          </div>
          <Link className="btn" to="/camera">
            Capture new text
          </Link>
        </section>

        <section className="card">
          <label className="text-xs font-semibold uppercase text-gray-500 mb-2 block" htmlFor="library-search">
            Search
          </label>
          <input
            id="library-search"
            className="input"
            placeholder="Search titles or content"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </section>

        <section className="space-y-3">
          {textsLoading ? (
            <div className="card flex items-center justify-center py-8 text-gray-500">Loading texts…</div>
          ) : filteredTexts.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-gray-600 mb-2">No texts found.</p>
              <p className="text-sm text-gray-500">Try adjusting your search or capture something new.</p>
            </div>
          ) : (
            filteredTexts.map((text) => {
              const wordCount = computeWordCount(text)
              const savedCount = starredByText.get(text.id) || 0
              const progress = wordCount > 0 ? Math.round((savedCount / wordCount) * 100) : 0

              return (
                <article key={text.id} className="card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {text.title || 'Untitled capture'}
                      </h2>
                      <p className="text-sm text-gray-500">
                        Added {formatDate(text.createdAt)} · {wordCount} words · {text.chunks.length} segments
                      </p>
                    </div>
                    <Link className="btn btn-small" to={`/read/${text.id}`}>
                      Open
                    </Link>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
                      <span>Practice coverage</span>
                      <span>{progress}% ({savedCount} saved)</span>
                    </div>
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-primary rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  {text.chunks[0] && (
                    <p className="mt-3 text-sm text-gray-600 line-clamp-2" dir="rtl">
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
