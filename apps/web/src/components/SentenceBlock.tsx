import { useMemo } from 'react';
import { Chunk } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';
import { createRtlElement } from '../lib/rtl';

interface SentenceBlockProps {
  chunk: Chunk;
  showNikud: boolean;
  showTransliteration: boolean;
  currentIndex?: number;
  totalChunks?: number;
}

function SentenceBlock({
  chunk,
  showNikud,
  showTransliteration,
  currentIndex,
  totalChunks
}: SentenceBlockProps) {
  const processedText = useMemo(() => {
    return toggleNikud(chunk.text, showNikud);
  }, [chunk.text, showNikud]);

  const transliteratedText = useMemo(() => {
    if (!showTransliteration) return '';
    return transliterate(processedText);
  }, [processedText, showTransliteration]);

  return (
    <div className="sentence-block">
      {/* Progress indicator if index is provided */}
      {currentIndex !== undefined && totalChunks && (
        <div className="text-secondary text-sm mb-2 flex justify-between items-center">
          <div>
            {chunk.type === 'sentence' ? 'Sentence' : 'Phrase'} {currentIndex + 1} of {totalChunks}
          </div>
          <div className="progress-indicator w-16 h-1 bg-gray-200 rounded-full">
            <div
              className="h-1 bg-primary rounded-full"
              style={{ width: `${((currentIndex + 1) / totalChunks) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Hebrew text */}
      <div
        className="hebrew-text text-lg mb-2 p-2 bg-gray-50 rounded"
        dir="rtl"
        lang="he"
      >
        {processedText}
      </div>

      {/* Transliteration if enabled */}
      {showTransliteration && (
        <div className="transliteration text-sm mb-2 italic">
          {transliteratedText}
        </div>
      )}

      {/* Translation */}
      <div className="translation p-2 border-t mt-2 pt-2">
        <div className="text-sm text-secondary mb-1">Translation:</div>
        <div>{chunk.translation || '—'}</div>
      </div>

      {/* Audio button (placeholder for future implementation) */}
      <button className="icon-btn mt-2 text-secondary" disabled title="Text-to-speech (Coming soon)">
        🔊
      </button>
    </div>
  );
}

export default SentenceBlock;