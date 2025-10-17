import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import SentenceBlock from '../components/SentenceBlock'
import WordCard from '../components/WordCard'
import FullTextDisplay from '../components/FullTextDisplay'
import ReadingControlBar from '../components/ReadingControlBar'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'
import { Chunk, Token, StarredItem } from '../types'
type DisplayMode = 'fullText' | 'sentence' | 'word'

const READER_VIEW_STORAGE_KEY = 'mila:reader:last-view';

function Reader() {
  const { textId } = useParams<{ textId: string }>()
  const navigate = useNavigate()
  const { getTextById } = useTextStore()
  const { vocab, starItem, removeItem, getVocab } = useVocabStore()

  // State
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window === 'undefined') return 'fullText';
    const stored = window.sessionStorage.getItem(READER_VIEW_STORAGE_KEY);
    return stored === 'sentence' || stored === 'word' || stored === 'fullText' ? stored : 'fullText';
  })
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null)
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [showNikud, setShowNikud] = useState(true)
  const showTransliteration = true
  const [text, setText] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [starredItems, setStarredItems] = useState<StarredItem[]>([])
  const [translationDisplay, setTranslationDisplay] = useState<'hidden' | 'inline' | 'interlinear'>('interlinear')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [starringError, setStarringError] = useState<string | null>(null)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)

  const updateDisplayMode = useCallback((mode: DisplayMode) => {
    if (mode === 'word' && selectedChunk) {
      setSelectedToken((prev) => {
        if (prev) return prev;
        return selectedChunk.tokens[0] ?? null;
      });
    }

    setDisplayMode(mode);

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(READER_VIEW_STORAGE_KEY, mode);
      } catch (err) {
        console.warn('Unable to persist reader view mode:', err);
      }
    }
  }, [selectedChunk]);

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
    updateDisplayMode('word')
  }

  const handleWordOpenFromFullText = useCallback((token: Token, chunk: Chunk) => {
    setSelectedChunk(chunk)
    if (text) {
      const index = text.chunks.findIndex((c: Chunk) => c.id === chunk.id)
      if (index !== -1) {
        setCurrentChunkIndex(index)
      }
    }
    setSelectedToken(token)
    updateDisplayMode('word')
  }, [text, updateDisplayMode])

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

  const navBar = (
    <TopNavBar
      current="current"
      title="Current"
      subtitle={text?.title || undefined}
      actions={
        <div className="relative">
          <button
            className="btn-icon"
            onClick={() => setShowSettingsPanel(prev => !prev)}
            aria-label="Toggle reading settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          {showSettingsPanel && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Display</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`btn btn-small ${showNikud ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
                    onClick={() => setShowNikud(!showNikud)}
                    aria-pressed={showNikud}
                  >
                    {showNikud ? 'Hide Nikud' : 'Show Nikud'}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Translation</p>
                <div className="flex flex-wrap gap-2">
                  {(['hidden', 'inline', 'interlinear'] as const).map(mode => (
                    <button
                      key={mode}
                      className={`btn btn-small ${translationDisplay === mode ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
                      onClick={() => setTranslationDisplay(mode)}
                      aria-pressed={translationDisplay === mode}
                    >
                      {mode === 'hidden' ? 'Hebrew' : mode === 'inline' ? 'English' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    />
  )

  // Loading states
  if (isLoading) {
    return (
      <>
        {navBar}
        <div className="container flex items-center justify-center" style={{ minHeight: 'calc(100vh - 96px)' }}>
          <div className="text-center">
            <div className="mb-4 text-primary text-xl">Loading...</div>
            <div className="text-sm text-secondary">Please wait while we load the text</div>
          </div>
        </div>
      </>
    )
  }

  if (!text) {
    return (
      <>
        {navBar}
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
      </>
    )
  }

  const activeToken = selectedToken || getFirstTokenInChunk();
  const activeTokenIndex = selectedChunk && activeToken
    ? selectedChunk.tokens.findIndex((token) => token.idx === activeToken.idx)
    : -1;
  const atStartOfText = selectedChunk
    ? activeTokenIndex <= 0 && currentChunkIndex <= 0
    : true;
  const atEndOfText = selectedChunk
    ? activeTokenIndex >= (selectedChunk.tokens.length - 1) && currentChunkIndex >= text.chunks.length - 1
    : true;

  return (
    <>
      {navBar}
      <div className="container pb-16">

      <div className="reader-toolbar">
        <ReadingControlBar
          displayMode={displayMode}
          onChange={updateDisplayMode}
        />
      </div>

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
        <section id="reader-section-fullText" className="card mb-4 p-4">
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
              updateDisplayMode('sentence');
            }}
            onWordOpen={handleWordOpenFromFullText}
            onWordStar={handleToggleStar}
            isWordStarred={isTokenStarred}
            textScale={1}
          />
        </section>
      )}

      {/* Sentence Mode */}
      {displayMode === 'sentence' && selectedChunk && (
        <section id="reader-section-sentence">
          <SentenceBlock
            chunk={selectedChunk}
            showNikud={showNikud}
            showTransliteration={showTransliteration}
            currentIndex={currentChunkIndex}
            totalChunks={text.chunks.length}
            translationDisplay={translationDisplay}
            selectedToken={selectedToken}
            onTokenSelect={handleSelectToken}
            onPrevious={handlePrevious}
            onNext={handleNext}
            disablePrevious={currentChunkIndex <= 0}
            disableNext={currentChunkIndex >= text.chunks.length - 1}
          />
        </section>
      )}

      {/* Word Mode */}
      {displayMode === 'word' && selectedChunk && activeToken && (
        <section id="reader-section-word">
          <WordCard
            token={activeToken}
            chunk={selectedChunk}
            showNikud={showNikud}
            onStar={() => handleToggleStar(activeToken)}
            isStarred={isTokenStarred(activeToken)}
            onSelectToken={handleSelectToken}
            onNavigatePrevious={() => navigateToTokenByOffset(-1)}
            onNavigateNext={() => navigateToTokenByOffset(1)}
            disablePrevious={atStartOfText}
            disableNext={atEndOfText}
          />
        </section>
      )}
      </div>
    </>
  )
}

export default Reader
