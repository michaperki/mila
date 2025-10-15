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

  // Render based on translation display mode
  if (translationDisplay === 'hidden') {
    // Hebrew only
    return (
      <div className="full-text">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id} 
            className="hebrew-text text-lg mb-3 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
            dir="rtl"
            lang="he"
            onClick={() => onChunkClick(chunk)}
          >
            {chunk.processedText}
          </div>
        ))}
      </div>
    )
  } else if (translationDisplay === 'interlinear') {
    // Interlinear mode - Hebrew with translation below each line
    return (
      <div className="full-text">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id} 
            className="interlinear-block mb-6 border-b pb-4"
            onClick={() => onChunkClick(chunk)}
          >
            <div 
              className="hebrew-text text-lg mb-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
              dir="rtl"
              lang="he"
            >
              {chunk.processedText}
            </div>
            <div className="translation p-2">
              {chunk.translation || '—'}
            </div>
          </div>
        ))}
      </div>
    )
  } else {
    // English only
    return (
      <div className="full-text">
        {processedChunks.map((chunk) => (
          <div 
            key={chunk.id} 
            className="translation p-3 mb-3 border rounded cursor-pointer hover:bg-gray-50"
            onClick={() => onChunkClick(chunk)}
          >
            {chunk.translation || '—'}
          </div>
        ))}
      </div>
    )
  }
}

export default FullTextDisplay