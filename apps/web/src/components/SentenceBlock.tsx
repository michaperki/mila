import { Fragment, useMemo } from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';

interface SentenceBlockProps {
  chunk: Chunk;
  showNikud: boolean;
  showTransliteration: boolean;
  currentIndex?: number;
  totalChunks?: number;
  translationDisplay?: 'hidden' | 'inline' | 'interlinear';
  selectedToken?: Token | null;
  onTokenSelect?: (token: Token) => void;
}

function SentenceBlock({
  chunk,
  showNikud,
  showTransliteration,
  currentIndex,
  totalChunks,
  translationDisplay = 'interlinear',
  selectedToken,
  onTokenSelect
}: SentenceBlockProps) {
  const processedText = useMemo(() => {
    return toggleNikud(chunk.text, showNikud);
  }, [chunk.text, showNikud]);

  const transliteratedText = useMemo(() => {
    if (!showTransliteration) return '';
    return transliterate(processedText);
  }, [processedText, showTransliteration]);

  const showHebrew = translationDisplay !== 'inline';
  const showTranslation = translationDisplay !== 'hidden';
  const hasProgress = typeof currentIndex === 'number' && Boolean(totalChunks);
  const currentPosition = typeof currentIndex === 'number' ? currentIndex : 0;
  const progressPercent =
    hasProgress && totalChunks
      ? Math.min(100, Math.max(0, ((currentPosition + 1) / totalChunks) * 100))
      : 0;

  return (
    <div className="sentence-block p-6 bg-white rounded-xl shadow-sm border border-gray-200">
      {hasProgress && totalChunks && (
        <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
          <span className="font-medium">
            Sentence {currentPosition + 1} / {totalChunks}
          </span>
          <div className="w-24 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-1 bg-blue-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="sentence-content">
        {showHebrew && (
          <div className="sentence-content__hebrew" dir="rtl" lang="he">
            {chunk.tokens.length > 0 ? (
              chunk.tokens.map((token, index) => {
                const displayText = toggleNikud(token.surface, showNikud);
                const isActive = selectedToken && selectedToken.idx === token.idx;

                const element = onTokenSelect ? (
                  <button
                    type="button"
                    onClick={() => onTokenSelect(token)}
                    className={`sentence-token${isActive ? ' sentence-token--active' : ''}`}
                  >
                    {displayText}
                  </button>
                ) : (
                  <span className="sentence-token sentence-token--static">
                    {displayText}
                  </span>
                );

                return (
                  <Fragment key={`fragment-${token.idx}`}>
                    {element}
                    {index < chunk.tokens.length - 1 && <span className="sentence-space"> </span>}
                  </Fragment>
                );
              })
            ) : (
              <span>{processedText}</span>
            )}
          </div>
        )}

        {showHebrew && showTransliteration && (
          <p className="sentence-content__transliteration">
            {transliteratedText}
          </p>
        )}

        {showTranslation && (
          <p className="sentence-content__translation">
            {chunk.translation || '—'}
          </p>
        )}
      </div>
    </div>
  );
}

export default SentenceBlock;
