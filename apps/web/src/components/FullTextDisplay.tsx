import { useMemo } from 'react'
import { Chunk } from '../types'
import { toggleNikud } from '../lib/nikud'

interface FullTextDisplayProps {
  chunks: Chunk[]
  showNikud: boolean
  translationDisplay: 'hidden' | 'inline' | 'interlinear'
  onChunkClick: (chunk: Chunk) => void
}

function FullTextDisplay({
  chunks,
  showNikud,
  translationDisplay,
  onChunkClick
}: FullTextDisplayProps) {
  // Process all chunks for display
  const processedChunks = useMemo(() => {
    return chunks.map(chunk => ({
      ...chunk,
      processedText: toggleNikud(chunk.text, showNikud)
    }))
  }, [chunks, showNikud])

  // For hidden or inline modes, we use fixed width containers
  if (translationDisplay === 'hidden') {
    // Hebrew only
    return (
      <div className="full-text-container">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id}
            className="full-text-block"
            onClick={() => onChunkClick(chunk)}
          >
            <div 
              className="hebrew-text-container"
            >
              <div
                className="hebrew-text p-2 mb-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                dir="rtl"
                lang="he"
              >
                {chunk.processedText}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  } else if (translationDisplay === 'inline') {
    // English only
    return (
      <div className="full-text-container">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id}
            className="full-text-block"
            onClick={() => onChunkClick(chunk)}
          >
            <div className="english-text-container">
              <div
                className="translation p-3 mb-3 border rounded cursor-pointer hover:bg-gray-50"
              >
                {chunk.translation || '—'}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  } else {
    // Interlinear mode - Hebrew with translation below each line
    return (
      <div className="full-text-container">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id}
            className="interlinear-wrapper mb-6 border-b pb-4"
            onClick={() => onChunkClick(chunk)}
          >
            <div className="interlinear-block">
              <div className="hebrew-text-container">
                <div 
                  className="hebrew-text p-2 mb-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                  dir="rtl"
                  lang="he"
                >
                  {chunk.processedText}
                </div>
              </div>
              <div className="english-text-container">
                <div className="translation p-2">
                  {chunk.translation || '—'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }
}

export default FullTextDisplay