import { Fragment, useMemo, useRef } from 'react';
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
  onPrevious?: () => void;
  onNext?: () => void;
  disablePrevious?: boolean;
  disableNext?: boolean;
}

function SentenceBlock({
  chunk,
  showNikud,
  showTransliteration,
  currentIndex,
  totalChunks,
  translationDisplay = 'interlinear',
  selectedToken,
  onTokenSelect,
  onPrevious,
  onNext,
  disablePrevious,
  disableNext,
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

  const pointerStart = useRef<number | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      pointerStart.current = event.clientX;
    } else {
      pointerStart.current = null;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const deltaX = event.clientX - pointerStart.current;
    pointerStart.current = null;

    if (Math.abs(deltaX) < 48) return;
    if (deltaX < 0) {
      onNext?.();
    } else {
      onPrevious?.();
    }
  };

  const resetPointer = () => {
    pointerStart.current = null;
  };

  return (
    <div
      className="sentence-shell"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={resetPointer}
      onPointerLeave={resetPointer}
    >
      <button
        type="button"
        className="reader-arrow reader-arrow--left"
        onClick={onPrevious}
        disabled={disablePrevious}
        aria-label="Previous sentence"
      >
        ◀
      </button>

      <article className="sentence-card">
        {hasProgress && totalChunks && (
          <header className="sentence-card__header">
            <span className="progress-chip">
              Sentence&nbsp;{currentPosition + 1}/{totalChunks}
            </span>
            <div className="sentence-card__progress">
              <div className="sentence-card__progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </header>
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

        {onTokenSelect && (
          <p className="sentence-card__hint">Tap a word to open word view</p>
        )}
      </article>

      <button
        type="button"
        className="reader-arrow reader-arrow--right"
        onClick={onNext}
        disabled={disableNext}
        aria-label="Next sentence"
      >
        ▶
      </button>
    </div>
  );
}

export default SentenceBlock;
