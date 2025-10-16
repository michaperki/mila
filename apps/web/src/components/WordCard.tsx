import { useState, useMemo } from 'react';
import { Token } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';
import { getRootMeaning } from '../lib/roots';
import VocabStarButton from './VocabStarButton';

interface WordCardProps {
  token: Token;
  showNikud: boolean;
  onStar: () => void;
  isStarred?: boolean;
}

function WordCard({ token, showNikud, onStar, isStarred = false }: WordCardProps) {
  const [copied, setCopied] = useState(false);

  // Process text based on nikud setting
  const processedSurface = useMemo(() => {
    return toggleNikud(token.surface, showNikud);
  }, [token.surface, showNikud]);

  const processedLemma = useMemo(() => {
    return token.lemma ? toggleNikud(token.lemma, showNikud) : processedSurface;
  }, [token.lemma, processedSurface, showNikud]);

  // Generate transliteration
  const transliteration = useMemo(() => {
    return transliterate(processedSurface);
  }, [processedSurface]);

  // Get root meaning if available
  const rootMeaning = useMemo(() => {
    return token.root ? getRootMeaning(token.root) : null;
  }, [token.root]);

  // Handle copy to clipboard
  const handleCopy = () => {
    // Copy both Hebrew and English
    const textToCopy = `${processedLemma} - ${token.gloss || 'unknown'}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Handle text-to-speech (placeholder)
  const handleSpeak = () => {
    // In a full implementation, this would use Web Speech API
    alert('Text-to-speech will be implemented in a future version');
  };

  return (
    <div className="word-card bg-white rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          {/* Main word in Hebrew */}
          <div className="hebrew-text text-xl font-bold mb-1" dir="rtl" lang="he">
            {processedLemma}
          </div>

          {/* Transliteration */}
          <div className="text-sm text-secondary italic">
            {transliteration}
          </div>
        </div>

        {/* Star button */}
        <VocabStarButton
          token={token}
          isStarred={isStarred}
          onStar={() => onStar()}
          className="text-xl"
        />
      </div>

      <div className="word-details border-t pt-3 space-y-2">
        {/* Surface form if different from lemma */}
        {token.surface !== token.lemma && (
          <div className="mb-2">
            <div className="text-sm text-secondary">Form:</div>
            <div className="hebrew-text" dir="rtl">{processedSurface}</div>
          </div>
        )}

        {/* Root if available */}
        {token.root && (
          <div className="mb-2">
            <div className="text-sm text-secondary">Root:</div>
            <div className="hebrew-text" dir="rtl">{toggleNikud(token.root, showNikud)}</div>
            <div className="text-xs text-gray-600 italic mt-1">
              {rootMeaning || 'No root translation available'}
            </div>
          </div>
        )}

        {/* Translation */}
        <div className="mb-2">
          <div className="text-sm text-secondary">Translation:</div>
          <div className="font-medium">{token.gloss || '—'}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <button
          className={`btn btn-small ${copied ? 'bg-green-500' : 'btn-secondary'}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>

        <button
          className="btn btn-small btn-secondary"
          onClick={handleSpeak}
        >
          🔊 Speak
        </button>
      </div>
    </div>
  );
}

export default WordCard;