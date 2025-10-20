import { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';
import { getRootMeaning } from '../lib/roots';

interface FullTextDisplayProps {
  chunks: Chunk[];
  showNikud: boolean;
  translationDisplay: 'hidden' | 'inline' | 'interlinear';
  onChunkClick?: (chunk: Chunk) => void;
  onWordStar?: (token: Token, chunk: Chunk) => void;
  isWordStarred?: (token: Token) => boolean;
  textScale?: number;
}

type TooltipState = {
  token: Token;
  chunk: Chunk;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
};

type TextSegment = {
  key: string;
  text: string;
  token?: Token;
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: 'above' | 'below';
  arrowOffset: number;
};

function FullTextDisplay({
  chunks,
  showNikud,
  translationDisplay,
  onChunkClick,
  onWordStar,
  isWordStarred,
  textScale = 1,
}: FullTextDisplayProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [copiedTokenIdx, setCopiedTokenIdx] = useState<number | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  const showHebrew = translationDisplay !== 'inline';
  const showTranslation = translationDisplay !== 'hidden';

  const processedChunks = useMemo(() => {
    return chunks.map((chunk) => {
      const text = toggleNikud(chunk.text, showNikud);

      if (!chunk.tokens || chunk.tokens.length === 0) {
        return {
          chunk,
          segments: [{
            key: `${chunk.id}-text`,
            text,
          }] as TextSegment[],
          translation: chunk.translation || '—',
        };
      }

      const segments: TextSegment[] = [];
      let cursor = 0;

      chunk.tokens.forEach((token, index) => {
        const tokenText = toggleNikud(token.surface, showNikud);
        if (!tokenText) {
          return;
        }

        const searchWindow = text.slice(cursor);
        const relativeIndex = searchWindow.indexOf(tokenText);

        if (relativeIndex === -1) {
          if (cursor < text.length) {
            segments.push({
              key: `${chunk.id}-gap-${index}-${cursor}`,
              text: text.slice(cursor),
            });
            cursor = text.length;
          }

          segments.push({
            key: `${chunk.id}-token-${token.idx}`,
            text: tokenText,
            token,
          });
          return;
        }

        if (relativeIndex > 0) {
          segments.push({
            key: `${chunk.id}-gap-${index}-${cursor}`,
            text: text.slice(cursor, cursor + relativeIndex),
          });
        }

        segments.push({
          key: `${chunk.id}-token-${token.idx}`,
          text: tokenText,
          token,
        });

        cursor += relativeIndex + tokenText.length;
      });

      if (cursor < text.length) {
        segments.push({
          key: `${chunk.id}-tail-${cursor}`,
          text: text.slice(cursor),
        });
      }

      return {
        chunk,
        segments,
        translation: chunk.translation || '—',
      };
    });
  }, [chunks, showNikud]);

  const closeTooltip = useCallback(() => {
    setTooltip(null);
    setTooltipPosition(null);
  }, []);

  useEffect(() => () => {
    if (copyResetTimeoutRef.current) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

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
    if (!showHebrew) {
      closeTooltip();
    }
  }, [showHebrew, closeTooltip]);

  useEffect(() => {
    if (!tooltip) {
      setTooltipPosition(null);
    }
  }, [tooltip]);

  useEffect(() => {
    setCopiedTokenIdx(null);
    if (copyResetTimeoutRef.current) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, [tooltip?.token.idx, tooltip?.chunk.id]);

  const openTooltipForElement = useCallback((element: HTMLElement, chunk: Chunk, token: Token) => {
    const rect = element.getBoundingClientRect();
    const anchorRect = {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
    setTooltip({ token, chunk, anchorRect });
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
    if (!onChunkClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChunkClick(chunk);
    }
  }, [onChunkClick]);

  const renderToken = useCallback((chunk: Chunk, token: Token) => {
    const displaySurface = toggleNikud(token.surface, showNikud);
    const isActive = tooltip?.token?.idx === token.idx && tooltip?.chunk?.id === chunk.id;
    return (
      <button
        key={token.idx}
        type="button"
        className={`reader-word${isActive ? ' reader-word--active' : ''}`}
        onClick={(event) => handleTokenClick(event, chunk, token)}
        onKeyDown={(event) => handleTokenKeyDown(event, chunk, token)}
        aria-label={`Show definition for ${displaySurface}`}
        aria-expanded={isActive}
        data-token-idx={token.idx}
      >
        {displaySurface}
      </button>
    );
  }, [handleTokenClick, handleTokenKeyDown, showNikud, tooltip]);

  const handleCopyTooltipWord = useCallback(async () => {
    if (!tooltip) return;

    const surface = toggleNikud(tooltip.token.surface, showNikud);
    const lemma = toggleNikud(tooltip.token.lemma ?? tooltip.token.surface, showNikud);
    const gloss = tooltip.token.gloss || 'Translation unavailable';
    const textToCopy = `${lemma !== surface ? `${lemma} (${surface})` : surface} — ${gloss}`;

    try {
      await navigator.clipboard?.writeText(textToCopy);
      setCopiedTokenIdx(tooltip.token.idx);
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedTokenIdx(null);
      }, 1800);
    } catch (error) {
      console.warn('Unable to copy token to clipboard', error);
    }
  }, [tooltip, showNikud]);

  const tooltipSurface = tooltip ? toggleNikud(tooltip.token.surface, showNikud) : '';
  const tooltipLemma = tooltip ? toggleNikud(tooltip.token.lemma ?? tooltip.token.surface, showNikud) : '';
  const tooltipTransliteration = tooltip ? transliterate(toggleNikud(tooltip.token.surface, showNikud)) : '';
  const tooltipRoot = tooltip?.token.root ? toggleNikud(tooltip.token.root, showNikud) : null;
  const tooltipRootMeaning = tooltip?.token.root ? getRootMeaning(tooltip.token.root) : null;
  const tooltipIsStarred = tooltip && isWordStarred ? isWordStarred(tooltip.token) : false;

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;

    const viewportPadding = 12;
    const spacing = 12;
    const { anchorRect } = tooltip;
    const tooltipElement = tooltipRef.current;

    // Reset any inline offsets before measurement
    tooltipElement.style.left = '0px';
    tooltipElement.style.top = '0px';

    const tooltipRect = tooltipElement.getBoundingClientRect();
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;

    let left = anchorCenterX - tooltipRect.width / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));

    const spaceAbove = anchorRect.top - viewportPadding;
    const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;

    let placement: TooltipPosition['placement'] = 'above';
    let top = anchorRect.top - tooltipRect.height - spacing;

    if (top < viewportPadding && spaceBelow > spaceAbove) {
      placement = 'below';
      top = anchorRect.bottom + spacing;
    }

    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));

    const rawArrowOffset = anchorCenterX - left;
    const arrowOffset = Math.max(16, Math.min(tooltipRect.width - 16, rawArrowOffset));

    setTooltipPosition({ left, top, placement, arrowOffset });
  }, [tooltip]);

  return (
    <div className="full-text-container" style={{ '--reader-text-scale': textScale } as CSSProperties}>
      {processedChunks.map(({ chunk, segments, translation }, index) => {
        const isClickable = Boolean(onChunkClick);
        return (
          <div
            key={chunk.id}
            className={`reader-pair${isClickable ? ' reader-pair--clickable' : ''}`}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            aria-label={isClickable ? `Open sentence ${index + 1}` : undefined}
            onClick={isClickable ? () => {
              closeTooltip();
              onChunkClick?.(chunk);
            } : undefined}
            onKeyDown={isClickable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                closeTooltip();
              }
              handleChunkKeyDown(event, chunk);
            } : undefined}
          >
            <div className="reader-pair__inner">
              {showHebrew && (
                <div className="reader-pair__he" dir="rtl" lang="he">
                  {segments.map((segment) => {
                    if (segment.token) {
                      return renderToken(chunk, segment.token);
                    }
                    return (
                      <span key={segment.key} className="reader-word__text" aria-hidden="true">
                        {segment.text}
                      </span>
                    );
                  })}
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
          ref={tooltipRef}
          className={`reader-tooltip${tooltipPosition?.placement === 'below' ? ' reader-tooltip--below' : ''}`}
          style={(() => {
            const style: CSSProperties = {};
            if (tooltipPosition) {
              style.top = tooltipPosition.top;
              style.left = tooltipPosition.left;
              (style as CSSProperties & { [key: string]: string | number })['--reader-tooltip-arrow-offset'] = `${tooltipPosition.arrowOffset}px`;
            } else {
              style.visibility = 'hidden';
              style.pointerEvents = 'none';
            }
            return style;
          })()}
          data-reader-tooltip
        >
          <p className="reader-tooltip__word" dir="rtl" lang="he">
            {tooltipLemma}
          </p>
          {tooltipTransliteration && (
            <p className="reader-tooltip__translit">
              {tooltipTransliteration}
            </p>
          )}
          <p className="reader-tooltip__translation">
            {tooltip.token.gloss || 'Translation unavailable'}
          </p>
          {tooltipRoot && (
            <div className="reader-tooltip__meta">
              <span className="reader-tooltip__label">Root</span>
              <span className="reader-tooltip__value" dir="rtl" lang="he">{tooltipRoot}</span>
              {tooltipRootMeaning && (
                <span className="reader-tooltip__note">{tooltipRootMeaning}</span>
              )}
            </div>
          )}
          {tooltipSurface && tooltipSurface !== tooltipLemma && (
            <div className="reader-tooltip__meta">
              <span className="reader-tooltip__label">Surface</span>
              <span className="reader-tooltip__value" dir="rtl" lang="he">{tooltipSurface}</span>
            </div>
          )}
          {tooltip.token.pos && (
            <div className="reader-tooltip__meta">
              <span className="reader-tooltip__label">Part of Speech</span>
              <span className="reader-tooltip__value">{tooltip.token.pos}</span>
            </div>
          )}
          <div className="reader-tooltip__actions">
            {onWordStar && (
              <button
                type="button"
                className={`reader-tooltip__action${tooltipIsStarred ? ' reader-tooltip__action--active' : ''}`}
                onClick={() => {
                  onWordStar(tooltip.token, tooltip.chunk);
                }}
              >
                {tooltipIsStarred ? 'Saved' : '⭐ Save'}
              </button>
            )}
            <button
              type="button"
              className="reader-tooltip__action"
              onClick={handleCopyTooltipWord}
            >
              {copiedTokenIdx === tooltip.token.idx ? 'Copied!' : 'Copy'}
            </button>
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
