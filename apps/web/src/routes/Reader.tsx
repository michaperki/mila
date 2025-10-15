import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import SentenceBlock from '../components/SentenceBlock'
import PhraseChips from '../components/PhraseChips'
import WordCard from '../components/WordCard'
import { Chunk, Token, StarredItem } from '../types'

type ViewMode = 'words' | 'phrases'

function Reader() {
  const { textId } = useParams<{ textId: string }>()
  const navigate = useNavigate()
  const { getTextById } = useTextStore()
  const { vocab, starItem, removeItem, getVocab } = useVocabStore()

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('words')
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null)
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [showNikud, setShowNikud] = useState(true)
  const [showTransliteration, setShowTransliteration] = useState(false)
  const [text, setText] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [starredItems, setStarredItems] = useState<StarredItem[]>([])

  // Load text and vocab data
  useEffect(() => {
    const loadData = async () => {
      if (!textId) {
        navigate('/')
        return
      }

      setIsLoading(true)

      try {
        // Load text
        const loadedText = await getTextById(textId)
        if (!loadedText) {
          navigate('/')
          return
        }

        setText(loadedText)
        if (loadedText.chunks.length > 0) {
          setSelectedChunk(loadedText.chunks[0])
        }

        // Load vocabulary
        const vocabItems = await getVocab()
        setStarredItems(vocabItems)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [textId, getTextById, getVocab, navigate])

  // Check if a token is already starred
  const isTokenStarred = useCallback((token: Token): boolean => {
    if (!token.lemma) return false
    return starredItems.some(item => item.lemma === token.lemma)
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

  // Toggle star status for the selected token
  const handleToggleStar = () => {
    if (!selectedToken?.lemma || !selectedToken?.gloss) return

    const isCurrentlyStarred = isTokenStarred(selectedToken)

    if (isCurrentlyStarred) {
      // Find and remove the starred item
      const itemToRemove = starredItems.find(item => item.lemma === selectedToken.lemma)
      if (itemToRemove) {
        removeItem(itemToRemove.id)
        // Update local state
        setStarredItems(prev => prev.filter(item => item.lemma !== selectedToken.lemma))
      }
    } else {
      // Add new starred item
      const newItem = {
        id: `${selectedToken.lemma}-${Date.now()}`,
        lemma: selectedToken.lemma,
        gloss: selectedToken.gloss || 'Unknown',
        sourceRef: textId ? {
          textId,
          chunkId: selectedChunk?.id || '',
        } : undefined,
        createdAt: Date.now(),
      }

      starItem(newItem)
      // Update local state
      setStarredItems(prev => [newItem, ...prev])
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
      <div className="mb-4">
        <h1 className="text-xl font-bold mb-2">{text.title || 'Untitled Text'}</h1>

        <div className="flex flex-wrap gap-2 mb-4">
          {/* Reading controls */}
          <button
            className={`btn btn-small ${showNikud ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowNikud(!showNikud)}
          >
            {showNikud ? 'Hide Nikud' : 'Show Nikud'}
          </button>
          <button
            className={`btn btn-small ${showTransliteration ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowTransliteration(!showTransliteration)}
          >
            {showTransliteration ? 'Hide Transliteration' : 'Show Transliteration'}
          </button>

          {/* View mode selector */}
          <div className="flex border rounded overflow-hidden ml-auto">
            <button
              className={`px-3 py-1 ${viewMode === 'words' ? 'bg-primary text-white' : 'bg-gray-100'}`}
              onClick={() => setViewMode('words')}
            >
              Words
            </button>
            <button
              className={`px-3 py-1 ${viewMode === 'phrases' ? 'bg-primary text-white' : 'bg-gray-100'}`}
              onClick={() => setViewMode('phrases')}
            >
              Phrases
            </button>
          </div>
        </div>
      </div>

      {selectedChunk && (
        <>
          {/* Main content area */}
          <div className="card mb-4">
            <SentenceBlock
              chunk={selectedChunk}
              showNikud={showNikud}
              showTransliteration={showTransliteration}
              currentIndex={currentChunkIndex}
              totalChunks={text.chunks.length}
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

          {/* Word chips */}
          <div className="card mb-4">
            <PhraseChips
              chunk={selectedChunk}
              onSelectToken={handleSelectToken}
              showNikud={showNikud}
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
        </>
      )}
    </div>
  )
}

export default Reader