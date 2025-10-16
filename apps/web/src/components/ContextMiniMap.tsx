import React from 'react';
import { Chunk, Token } from '../types';
import { toggleNikud } from '../lib/nikud';

interface ContextMiniMapProps {
  chunk: Chunk;
  selectedToken: Token | null;
  showNikud: boolean;
}

function ContextMiniMap({ chunk, selectedToken, showNikud }: ContextMiniMapProps) {
  // If no token is selected, just return the whole text
  if (!selectedToken) {
    const processedText = toggleNikud(chunk.text, showNikud);
    return (
      <div className="context-mini-map mt-2">
        <h3 className="text-sm font-medium mb-1">Context:</h3>
        <div className="text-gray-600 text-sm" dir="rtl" lang="he">
          {processedText}
        </div>
      </div>
    );
  }

  // Create a context mini-map with the selected token highlighted
  // First we need to get all tokens and their positions
  const tokens = [...chunk.tokens];
  const selectedIdx = selectedToken.idx;

  // Build an array of elements (regular text and highlighted token)
  const elements = tokens.map((token, index) => {
    const isSelected = token.idx === selectedIdx;
    const processedText = toggleNikud(token.surface, showNikud);
    
    return (
      <React.Fragment key={token.idx}>
        {index > 0 && ' '}
        <span 
          className={isSelected ? 'bg-blue-500 text-white px-1 rounded font-semibold' : 'text-gray-400'}
          dir="rtl" 
          lang="he"
        >
          {processedText}
        </span>
      </React.Fragment>
    );
  });

  return (
    <div className="context-mini-map mt-3 border-t pt-3">
      <h3 className="text-sm font-medium mb-1">Context:</h3>
      <div className="text-gray-600 text-sm" dir="rtl">
        {elements}
      </div>
    </div>
  );
}

export default ContextMiniMap;
