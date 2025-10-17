import { useMemo, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';

interface FullTextDisplayProps {
  chunks: Chunk[];
  showNikud: boolean;
  translationDisplay: 'hidden' | 'inline' | 'interlinear';
  onChunkClick: (chunk: Chunk) => void;
  onWordOpen?: (token: Token, chunk: Chunk) => void;
  onWordStar?: (token: Token) => void;
  isWordStarred?: (token: Token) => boolean;
  textScale?: number;
}

type TooltipState = {
  token: Token;
  chunk: Chunk;
  x: number;
  y: number;
};

function FullTextDisplay({
  chunks,
  showNikud,
  translationDisplay,
  onChunkClick,
  onWordOpen,
  onWordStar,
  isWordStarred,
  textScale = 1,
}: FullTextDisplayProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showHebrew = translationDisplay !== 'inline';
  const showTranslation = translationDisplay !== 'hidden';

  const processedChunks = useMemo(() => {
    return chunks.map((chunk) => ({
      chunk,
      processedTokens: chunk.tokens?.map((token) => ({
        token,
      })) ?? [],
      processedText: toggleNikud(chunk.text, showNikud),
    }));
  }, [chunks, showNikud]);

  const closeTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    if (!tooltip) return;

    const handleScroll = () => closeTooltip();
    const handleResize = () => closeTooltip();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTooltip();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-reader-tooltip]')) return;
      closeTooltip();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [tooltip, closeTooltip]);

  useEffect(() => {
    // Close the tooltip if the translation display changes to a mode where Hebrew is hidden
    if (!showHebrew) {
      closeTooltip();
    }
  }, [showHebrew, closeTooltip]);

  const openTooltipForElement = useCallback((element: HTMLElement, chunk: Chunk, token: Token) => {
    const rect = element.getBoundingClientRect();
    const clampedX = Math.min(Math.max(rect.left + rect.width / 2, 16), window.innerWidth - 16);
    const y = rect.top;
    setTooltip({ token, chunk, x: clampedX, y });
  }, []);

  const handleTokenClick = useCallback((
    event: React.MouseEvent<HTMLButtonElement>,
    chunk: Chunk,
    token: Token,
  ) => {
    event.stopPropagation();
    openTooltipForElement(event.currentTarget, chunk, token);
  }, [openTooltipForElement]);

  const handleTokenKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    chunk: Chunk,
    token: Token,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      openTooltipForElement(event.currentTarget, chunk, token);
    }
  }, [openTooltipForElement]);

  const handleChunkKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, chunk: Chunk) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChunkClick(chunk);
    }
  }, [onChunkClick]);

  const renderToken = useCallback((chunk: Chunk, token: Token) => {
    const displaySurface = toggleNikud(token.surface, showNikud);
    return (
      <button
        key={token.idx}
        type="button"
        className="reader-word"
        onClick={(event) => handleTokenClick(event, chunk, token)}
        onKeyDown={(event) => handleTokenKeyDown(event, chunk, token)}
      >
        {displaySurface}
      </button>
    );
  }, [handleTokenClick, handleTokenKeyDown, showNikud]);

  return (
    <div className="full-text-container" style={{ '--reader-text-scale': textScale } as CSSProperties}>
      {processedChunks.map(({ chunk }, index) => {
        const translation = chunk.translation || '—';
        return (
          <div
            key={chunk.id}
            className="reader-pair"
            role="button"
            tabIndex={0}
            aria-label={`Open sentence ${index + 1}`}
            onClick={() => {
              closeTooltip();
              onChunkClick(chunk);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                closeTooltip();
              }
              handleChunkKeyDown(event, chunk);
            }}
          >
            <div className="reader-pair__inner">
              {showHebrew && (
                <div className="reader-pair__he" dir="rtl" lang="he">
                  {chunk.tokens && chunk.tokens.length > 0
                    ? chunk.tokens.map((token, tokenIndex) => (
                        <span key={`${chunk.id}-${token.idx}`} className="reader-word__wrapper">
                          {renderToken(chunk, token)}
                          {tokenIndex < chunk.tokens.length - 1 && <span className="reader-word__space"> </span>}
                        </span>
                      ))
                    : toggleNikud(chunk.text, showNikud)}
                </div>
              )}

              {showTranslation && (
                <div className="reader-pair__en" lang="en">
                  {translation}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {tooltip && showHebrew && (
        <div
          className="reader-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
          data-reader-tooltip
        >
          <p className="reader-tooltip__word" dir="rtl" lang="he">
            {toggleNikud(tooltip.token.surface, showNikud)}
          </p>
          <p className="reader-tooltip__translation">
            {tooltip.token.gloss || 'Translation unavailable'}
          </p>
          <div className="reader-tooltip__actions">
            {onWordStar && (
              <button
                type="button"
                className="reader-tooltip__action"
                onClick={() => {
                  onWordStar(tooltip.token);
                }}
              >
                {isWordStarred?.(tooltip.token) ? 'Saved' : '⭐ Save'}
              </button>
            )}
            {onWordOpen && (
              <button
                type="button"
                className="reader-tooltip__action"
                onClick={() => {
                  onWordOpen(tooltip.token, tooltip.chunk);
                  closeTooltip();
                }}
              >
                View Word
              </button>
            )}
            <button
              type="button"
              className="reader-tooltip__action reader-tooltip__action--secondary"
              onClick={closeTooltip}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FullTextDisplay;
