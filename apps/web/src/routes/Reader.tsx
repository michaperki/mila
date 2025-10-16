import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import SentenceBlock from '../components/SentenceBlock'
import PhraseChips from '../components/PhraseChips'
import WordCard from '../components/WordCard'
import ContextMiniMap from '../components/ContextMiniMap'
import FullTextDisplay from '../components/FullTextDisplay'
import ReadingControlBar from '../components/ReadingControlBar'
import ErrorMessage from '../components/ErrorMessage'
import { toggleNikud } from '../lib/nikud'
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

  // Get the first token in the current chunk (for default word selection)
  const getFirstTokenInChunk = useCallback(() => {
    if (selectedChunk && selectedChunk.tokens.length > 0) {
      return selectedChunk.tokens[0];
    }
    return null;
  }, [selectedChunk]);

  // Get the next or previous token in the current chunk
  const navigateToTokenByOffset = useCallback((offset: number) => {
    if (!selectedChunk || !selectedToken) return;

    // Find current token index in the tokens array
    const currentIndex = selectedChunk.tokens.findIndex(t => t.idx === selectedToken.idx);
    if (currentIndex === -1) return;

    // Calculate new index with bounds checking
    const newIndex = currentIndex + offset;
    if (newIndex >= 0 && newIndex < selectedChunk.tokens.length) {
      // We're still in the same chunk
      setSelectedToken(selectedChunk.tokens[newIndex]);
    } else if (newIndex < 0 && currentChunkIndex > 0) {
      // Move to last token of previous chunk
      const prevChunk = text.chunks[currentChunkIndex - 1];
      setSelectedChunk(prevChunk);
      setCurrentChunkIndex(currentChunkIndex - 1);
      setSelectedToken(prevChunk.tokens[prevChunk.tokens.length - 1]);
    } else if (newIndex >= selectedChunk.tokens.length && currentChunkIndex < text.chunks.length - 1) {
      // Move to first token of next chunk
      const nextChunk = text.chunks[currentChunkIndex + 1];
      setSelectedChunk(nextChunk);
      setCurrentChunkIndex(currentChunkIndex + 1);
      setSelectedToken(nextChunk.tokens[0]);
    }
  }, [selectedChunk, selectedToken, currentChunkIndex, text]);

  // Select first token in word view when no token is selected
  useEffect(() => {
    if (displayMode === 'word' && !selectedToken && selectedChunk) {
      const firstToken = getFirstTokenInChunk();
      if (firstToken) {
        setSelectedToken(firstToken);
      }
    }
  }, [displayMode, selectedChunk, selectedToken, getFirstTokenInChunk]);

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
              className="btn flex items-center"
              onClick={handlePrevious}
              disabled={currentChunkIndex <= 0}
            >
              <span className="mr-1">◀</span> Previous Word
            </button>

            <button
              className="btn flex items-center"
              onClick={handleNext}
              disabled={currentChunkIndex >= text.chunks.length - 1}
            >
              Next Word <span className="ml-1">▶</span>
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
          {/* Progress indicator */}
          <div className="mb-4 flex items-center justify-between">
            <div className="text-secondary text-sm">
              Sentence {currentChunkIndex + 1} of {text.chunks.length}
            </div>
            <div className="progress-indicator w-24 h-1 bg-gray-200 rounded-full">
              <div
                className="h-1 bg-primary rounded-full"
                style={{ width: `${((currentChunkIndex + 1) / text.chunks.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Word card - always show a token, default to first if none selected */}
          <div className="mb-4">
            {(selectedToken || getFirstTokenInChunk()) && (
              <>
                <h2 className="text-lg font-semibold mb-2">🟦 Word Focus</h2>
                <WordCard
                  token={selectedToken || getFirstTokenInChunk()!}
                  onStar={handleToggleStar}
                  showNikud={showNikud}
                  isStarred={isTokenStarred(selectedToken || getFirstTokenInChunk()!)}
                  translationDisplay={translationDisplay}
                />

                {/* Context mini-map */}
                <ContextMiniMap
                  chunk={selectedChunk}
                  selectedToken={selectedToken || getFirstTokenInChunk()}
                  showNikud={showNikud}
                />
              </>
            )}
          </div>

          {/* Word selector (compact version - just shows small chips) */}
          <div className="card mb-4 p-3">
            <div className="flex flex-wrap gap-2 justify-center" dir="rtl">
              {selectedChunk.tokens.map((token) => (
                <button
                  key={token.idx}
                  className={`text-sm px-2 py-1 rounded ${selectedToken?.idx === token.idx ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  onClick={() => handleSelectToken(token)}
                >
                  {toggleNikud(token.surface, showNikud)}
                </button>
              ))}
            </div>
          </div>

          {/* Word navigation controls */}
          <div className="mb-4 flex items-center justify-between">
            <button
              className="btn flex items-center"
              onClick={() => navigateToTokenByOffset(-1)}
              disabled={currentChunkIndex <= 0 && (!selectedToken || selectedChunk?.tokens.indexOf(selectedToken) <= 0)}
            >
              <span className="mr-1">◀</span> Previous Word
            </button>

            <button
              className="btn flex items-center"
              onClick={() => navigateToTokenByOffset(1)}
              disabled={currentChunkIndex >= text.chunks.length - 1 && (!selectedToken || selectedChunk?.tokens.indexOf(selectedToken) >= (selectedChunk?.tokens.length || 0) - 1)}
            >
              Next Word <span className="ml-1">▶</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default Reader