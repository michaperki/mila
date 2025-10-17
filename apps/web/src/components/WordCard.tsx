import { useMemo, useState, useRef, useEffect } from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';
import { getRootMeaning } from '../lib/roots';

interface WordCardProps {
  token: Token;
  chunk: Chunk;
  showNikud: boolean;
  onStar: () => void;
  onSelectToken?: (token: Token) => void;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  disablePrevious?: boolean;
  disableNext?: boolean;
  isStarred?: boolean;
}

function WordCard({
  token,
  chunk,
  showNikud,
  onStar,
  onSelectToken,
  onNavigatePrevious,
  onNavigateNext,
  disablePrevious,
  disableNext,
  isStarred = false,
}: WordCardProps) {
  const [copied, setCopied] = useState(false);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const swipeStart = useRef<number | null>(null);

  const processedSurface = useMemo(() => toggleNikud(token.surface, showNikud), [token.surface, showNikud]);
  const processedLemma = useMemo(
    () => (token.lemma ? toggleNikud(token.lemma, showNikud) : processedSurface),
    [token.lemma, processedSurface, showNikud]
  );
  const transliteration = useMemo(() => transliterate(processedSurface), [processedSurface]);
  const rootText = useMemo(() => (token.root ? toggleNikud(token.root, showNikud) : null), [token.root, showNikud]);
  const rootMeaning = useMemo(() => (token.root ? getRootMeaning(token.root) : null), [token.root]);
  const hasDistinctSurface = useMemo(
    () => Boolean(token.lemma) && token.surface !== token.lemma,
    [token.lemma, token.surface]
  );

  useEffect(() => {
    if (!contextRef.current) return;
    const activeElement = contextRef.current.querySelector<HTMLButtonElement>(`[data-word-idx="${token.idx}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [token.idx]);

  const handleCopy = () => {
    const textToCopy = `${processedLemma} — ${token.gloss || 'unknown'}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSpeak = () => {
    alert('Text-to-speech will be implemented in a future version');
  };

  const handleContextSelect = (contextToken: Token) => {
    if (!onSelectToken) return;
    onSelectToken(contextToken);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      swipeStart.current = event.clientX;
    } else {
      swipeStart.current = null;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStart.current === null) return;
    const deltaX = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(deltaX) < 48) return;

    if (deltaX < 0) {
      onNavigateNext?.();
    } else {
      onNavigatePrevious?.();
    }
  };

  const resetSwipe = () => {
    swipeStart.current = null;
  };

  return (
    <div
      className="word-shell"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={resetSwipe}
      onPointerLeave={resetSwipe}
    >
      <button
        type="button"
        className="reader-arrow reader-arrow--left"
        onClick={onNavigatePrevious}
        disabled={disablePrevious}
        aria-label="Previous word"
      >
        ◀
      </button>

      <article className="word-card">
        <header className="word-card__header">
          <h1 className="word-card__lemma" dir="rtl" lang="he">
            {processedLemma}
          </h1>
          <p className="word-card__translit">{transliteration}</p>
          <p className="word-card__gloss">{token.gloss || '—'}</p>
        </header>

        <div className="word-card__meta">
          {rootText && (
            <div className="word-card__row">
              <span className="word-card__label">Root</span>
              <span className="word-card__value word-card__value--mono" dir="rtl" lang="he">
                {rootText}
              </span>
              {rootMeaning && <span className="word-card__note">{rootMeaning}</span>}
            </div>
          )}

          {hasDistinctSurface && (
            <div className="word-card__row">
              <span className="word-card__label">Surface Form</span>
              <span className="word-card__value" dir="rtl" lang="he">
                {processedSurface}
              </span>
            </div>
          )}

          {token.pos && (
            <div className="word-card__row">
              <span className="word-card__label">Part of Speech</span>
              <span className="word-card__value">{token.pos}</span>
            </div>
          )}
        </div>

        <div className="word-card__actions">
          <button type="button" className="word-action" onClick={handleSpeak} aria-label="Play pronunciation">
            🔊
          </button>
          <button
            type="button"
            className={`word-action${isStarred ? ' word-action--active' : ''}`}
            onClick={onStar}
            aria-pressed={isStarred}
          >
            {isStarred ? '★ Saved' : '☆ Save'}
          </button>
          <button
            type="button"
            className={`word-action${copied ? ' word-action--success' : ''}`}
            onClick={handleCopy}
            aria-label="Copy word"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>

        <section className="word-context" aria-label="Sentence context">
          <div className="word-context__list" ref={contextRef}>
            {chunk.tokens.map((contextToken) => {
              const displayToken = toggleNikud(contextToken.surface, showNikud);
              const isActive = contextToken.idx === token.idx;
              return (
                <button
                  key={contextToken.idx}
                  type="button"
                  data-word-idx={contextToken.idx}
                  className={`word-context__button${isActive ? ' word-context__button--active' : ''}`}
                  onClick={() => handleContextSelect(contextToken)}
                  dir="rtl"
                  lang="he"
                >
                  {displayToken}
                </button>
              );
            })}
          </div>
          <p className="word-context__hint">Swipe or tap to explore every word in this sentence.</p>
        </section>
      </article>

      <button
        type="button"
        className="reader-arrow reader-arrow--right"
        onClick={onNavigateNext}
        disabled={disableNext}
        aria-label="Next word"
      >
        ▶
      </button>
    </div>
  );
}

export default WordCard;
