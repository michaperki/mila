import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import SentenceBlock from '../components/SentenceBlock'
import PhraseChips from '../components/PhraseChips'
import WordCard from '../components/WordCard'
import FullTextDisplay from '../components/FullTextDisplay'
import ReadingControlBar from '../components/ReadingControlBar'
import ErrorMessage from '../components/ErrorMessage'
import { Chunk, Token, StarredItem } from '../types'

type ViewMode = 'words' | 'phrases'
type DisplayMode = 'fullText' | 'sentence' | 'word'

function Reader() {
  const { textId } = useParams<{ textId: string }>()
  const navigate = useNavigate()
  const { getTextById } = useTextStore()
  const { vocab, starItem, removeItem, getVocab } = useVocabStore()

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('words')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('sentence')
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null)
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [showNikud, setShowNikud] = useState(true)
  const [showTransliteration, setShowTransliteration] = useState(false)
  const [text, setText] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [starredItems, setStarredItems] = useState<StarredItem[]>([])
  const [translationDisplay, setTranslationDisplay] = useState<'hidden' | 'inline' | 'interlinear'>('inline')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [starringError, setStarringError] = useState<string | null>(null)

  // Load text and vocab data
  useEffect(() => {
    const loadData = async () => {
      if (!textId) {
        navigate('/')
        return
      }

      setIsLoading(true)

      try {
        // Load in parallel for better performance
        const textPromise = getTextById(textId)
        const vocabPromise = getVocab()

        // Wait for both to complete
        const [loadedText, vocabItems] = await Promise.allSettled([textPromise, vocabPromise])

        // Handle text loading result
        if (loadedText.status === 'fulfilled') {
          if (!loadedText.value) {
            navigate('/')
            return
          }

          setText(loadedText.value)
          if (loadedText.value.chunks.length > 0) {
            setSelectedChunk(loadedText.value.chunks[0])
          }
        } else {
          console.error('Error loading text:', loadedText.reason)
          setLoadError(`Failed to load text: ${loadedText.reason?.message || 'Unknown error'}`)
        }

        // Handle vocab loading result
        if (vocabItems.status === 'fulfilled') {
          setStarredItems(vocabItems.value)
          setLoadError(null) // Clear any previous errors if vocab loaded but text had an error
        } else {
          console.error('Error loading vocabulary:', vocabItems.reason)
          // Don't set error just for vocab, as we can still show the text
        }
      } catch (error) {
        console.error('Error in load operation:', error)
        setLoadError((error as Error).message || 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()

    // Reload starred items when returning to this page
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        getVocab().then(items => {
          setStarredItems(items)
        }).catch(error => {
          console.error('Error reloading vocabulary:', error)
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [textId, getTextById, getVocab, navigate])

  // Check if a token is already starred
  const isTokenStarred = useCallback((token: Token): boolean => {
    if (!token.lemma) return false
    return starredItems.some(item => item.lemma === token.lemma)
  }, [starredItems])

  // Get set of starred lemmas for faster lookup
  const starredLemmaSet = useMemo(() => {
    const set = new Set<string>()
    starredItems.forEach(item => {
      if (item.lemma) set.add(item.lemma)
    })
    return set
  }, [starredItems])

  // Navigation
  const handlePrevious = () => {
    if (!text || currentChunkIndex <= 0) return

    setCurrentChunkIndex(currentChunkIndex - 1)
    setSelectedChunk(text.chunks[currentChunkIndex - 1])
    setSelectedToken(null) // Reset selected token on navigation
  }

  const handleNext = () => {
    if (!text || currentChunkIndex >= text.chunks.length - 1) return

    setCurrentChunkIndex(currentChunkIndex + 1)
    setSelectedChunk(text.chunks[currentChunkIndex + 1])
    setSelectedToken(null) // Reset selected token on navigation
  }

  const handleSelectChunk = (chunk: Chunk) => {
    setSelectedChunk(chunk)
    const index = text.chunks.findIndex((c: Chunk) => c.id === chunk.id)
    if (index !== -1) {
      setCurrentChunkIndex(index)
    }
    setSelectedToken(null) // Reset selected token on chunk change
  }

  const handleSelectToken = (token: Token) => {
    setSelectedToken(token)
    // Auto-switch to word view when selecting a token
    setViewMode('words')
  }

  // Toggle star status for any token
  const handleToggleStar = async (tokenToStar?: Token) => {
    // Use passed token or selected token
    const token = tokenToStar || selectedToken

    if (!token?.lemma || !token?.gloss) return

    try {
      setStarringError(null)
      const isCurrentlyStarred = isTokenStarred(token)

      if (isCurrentlyStarred) {
        // Find and remove the starred item
        const itemToRemove = starredItems.find(item => item.lemma === token.lemma)
        if (itemToRemove) {
          await removeItem(itemToRemove.id)

          // Update local state - this needs to happen here to provide immediate feedback
          setStarredItems(prev => prev.filter(item => item.lemma !== token.lemma))

          // Also fetch from database to ensure consistency
          try {
            const updatedItems = await getVocab()
            setStarredItems(updatedItems)
          } catch (syncError) {
            console.warn('Error synchronizing vocab after removal:', syncError)
            // We already updated the local state, so no need to show an error
          }
        }
      } else {
        // Add new starred item
        const newItem = {
          id: `${token.lemma}-${Date.now()}`,
          lemma: token.lemma,
          gloss: token.gloss || 'Unknown',
          sourceRef: textId ? {
            textId,
            chunkId: selectedChunk?.id || '',
          } : undefined,
          createdAt: Date.now(),
        }

        await starItem(newItem)

        // Update local state - this needs to happen here to provide immediate feedback
        setStarredItems(prev => [newItem, ...prev])

        // Also fetch from database to ensure consistency
        try {
          const updatedItems = await getVocab()
          setStarredItems(updatedItems)
        } catch (syncError) {
          console.warn('Error synchronizing vocab after addition:', syncError)
          // We already updated the local state, so no need to show an error
        }
      }
    } catch (error) {
      console.error('Error toggling star status:', error)
      setStarringError((error as Error).message || 'Failed to update vocabulary')
    }
  }

  // Loading states
  if (isLoading) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="text-center">
          <div className="mb-4 text-primary text-xl">Loading...</div>
          <div className="text-sm text-secondary">Please wait while we load the text</div>
        </div>
      </div>
    )
  }

  if (!text) {
    return (
      <div className="container">
        <div className="card">
          <h2 className="text-xl font-bold mb-2">Text not found</h2>
          <p>The requested text could not be found.</p>
          <button
            className="btn mt-4"
            onClick={() => navigate('/')}
          >
            Return to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container pb-16">
      <h1 className="text-xl font-bold mb-4">{text.title || 'Untitled Text'}</h1>

      <ReadingControlBar
        showNikud={showNikud}
        setShowNikud={setShowNikud}
        showTransliteration={showTransliteration}
        setShowTransliteration={setShowTransliteration}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        translationDisplay={translationDisplay}
        setTranslationDisplay={setTranslationDisplay}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <ErrorMessage
        error={loadError}
        onRetry={() => {
          setIsLoading(true)
          getTextById(textId!).then(text => {
            setText(text)
            setLoadError(null)
            setIsLoading(false)
          }).catch(err => {
            setLoadError((err as Error).message)
            setIsLoading(false)
          })
        }}
        onDismiss={() => setLoadError(null)}
      />

      <ErrorMessage
        error={starringError}
        onDismiss={() => setStarringError(null)}
      />

      {/* Full Text Mode */}
      {displayMode === 'fullText' && text && (
        <div className="card mb-4 p-4">
          <FullTextDisplay
            chunks={text.chunks}
            showNikud={showNikud}
            translationDisplay={translationDisplay}
            onChunkClick={(chunk) => {
              setSelectedChunk(chunk);
              const index = text.chunks.findIndex((c: Chunk) => c.id === chunk.id);
              if (index !== -1) {
                setCurrentChunkIndex(index);
              }
              setDisplayMode('sentence');
            }}
          />
        </div>
      )}

      {/* Sentence Mode */}
      {displayMode === 'sentence' && selectedChunk && (
        <>
          <div className="card mb-4">
            <SentenceBlock
              chunk={selectedChunk}
              showNikud={showNikud}
              showTransliteration={showTransliteration}
              currentIndex={currentChunkIndex}
              totalChunks={text.chunks.length}
              translationDisplay={translationDisplay}
            />
          </div>

          {/* Navigation controls */}
          <div className="mb-4 flex items-center justify-between">
            <button
              className="btn"
              onClick={handlePrevious}
              disabled={currentChunkIndex <= 0}
            >
              ← Previous
            </button>

            <button
              className="btn"
              onClick={handleNext}
              disabled={currentChunkIndex >= text.chunks.length - 1}
            >
              Next →
            </button>
          </div>

          {/* Button to view word details */}
          <div className="mb-4 text-center">
            <button
              className="btn"
              onClick={() => setDisplayMode('word')}
            >
              View Word Details
            </button>
          </div>
        </>
      )}

      {/* Word Mode */}
      {displayMode === 'word' && selectedChunk && (
        <>
          <div className="card mb-4">
            <SentenceBlock
              chunk={selectedChunk}
              showNikud={showNikud}
              showTransliteration={showTransliteration}
              currentIndex={currentChunkIndex}
              totalChunks={text.chunks.length}
              translationDisplay={translationDisplay}
            />
          </div>

          {/* Word chips */}
          <div className="card mb-4">
            <PhraseChips
              chunk={selectedChunk}
              onSelectToken={handleSelectToken}
              showNikud={showNikud}
              onStarToken={handleToggleStar}
              starredTokens={starredLemmaSet}
              textId={textId}
            />
          </div>

          {/* Word card (if a token is selected in word mode) */}
          {viewMode === 'words' && selectedToken && (
            <div className="mb-4">
              <WordCard
                token={selectedToken}
                onStar={handleToggleStar}
                showNikud={showNikud}
                isStarred={isTokenStarred(selectedToken)}
              />
            </div>
          )}

          {/* Navigation controls */}
          <div className="mb-4 flex items-center justify-between">
            <button
              className="btn"
              onClick={handlePrevious}
              disabled={currentChunkIndex <= 0}
            >
              ← Previous
            </button>

            <button
              className="btn"
              onClick={handleNext}
              disabled={currentChunkIndex >= text.chunks.length - 1}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default Reader