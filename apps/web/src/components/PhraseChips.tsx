import { useMemo, useState } from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';

interface PhraseChipsProps {
  chunk: Chunk;
  onSelectToken: (token: Token) => void;
  showNikud: boolean;
}

function PhraseChips({ chunk, onSelectToken, showNikud }: PhraseChipsProps) {
  const [selectedTokenIdx, setSelectedTokenIdx] = useState<number | null>(null);

  // Process tokens to apply nikud settings
  const processedTokens = useMemo(() => {
    return chunk.tokens.map(token => ({
      ...token,
      displayText: toggleNikud(token.surface, showNikud)
    }));
  }, [chunk.tokens, showNikud]);

  // Handle token selection
  const handleTokenClick = (token: Token) => {
    setSelectedTokenIdx(token.idx);
    onSelectToken(token);
  };

  return (
    <div className="phrase-chips">
      <div className="mb-2">
        <h3 className="text-sm font-medium mb-1">Words:</h3>
        <div className="flex flex-wrap gap-2 mb-2" dir="rtl">
          {processedTokens.map((token) => (
            <button
              key={token.idx}
              className={`chip hebrew-text px-2 py-1 rounded transition-all ${
                selectedTokenIdx === token.idx
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => handleTokenClick(token)}
            >
              {token.displayText}
            </button>
          ))}
        </div>
      </div>

      {/* Selected token info */}
      {selectedTokenIdx !== null && (
        <div className="selected-token bg-gray-50 p-2 rounded">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-secondary">Selected word:</div>
              <div className="hebrew-text font-bold" dir="rtl">
                {processedTokens.find(t => t.idx === selectedTokenIdx)?.displayText}
              </div>
            </div>
            <div>
              <div className="text-sm text-secondary">Translation:</div>
              <div>
                {processedTokens.find(t => t.idx === selectedTokenIdx)?.gloss || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sentence translation (show only if no token is selected) */}
      {selectedTokenIdx === null && chunk.translation && (
        <div className="mt-2">
          <div className="text-sm text-secondary">Translation:</div>
          <div>{chunk.translation}</div>
        </div>
      )}
    </div>
  );
}

export default PhraseChips;