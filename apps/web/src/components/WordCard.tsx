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
  translationDisplay?: 'hidden' | 'inline' | 'interlinear';
}

function WordCard({ token, showNikud, onStar, isStarred = false, translationDisplay = 'interlinear' }: WordCardProps) {
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
    <div className="word-card bg-white rounded-lg p-4 shadow-sm border-primary">
      {/* Word Focus Card - Primary Visual Element */}
      <div className="text-center mb-4">
        {/* Only show Hebrew text if not in English Only mode */}
        {translationDisplay !== 'inline' && (
          <div className="mb-2">
            {/* Main word in Hebrew */}
            <div className="hebrew-text text-3xl font-bold text-primary" dir="rtl" lang="he">
              {processedLemma}
            </div>

            {/* Transliteration */}
            <div className="text-lg text-secondary italic">
              {transliteration}
            </div>
          </div>
        )}

        {/* Translation directly below the main word */}
        <div className="text-lg text-secondary">
          {token.gloss || '—'}
        </div>

        {/* Action buttons in center */}
        <div className="flex justify-center gap-4 mt-2">
          <button
            className="btn btn-icon"
            onClick={handleSpeak}
            aria-label="Speak word"
          >
            🔊
          </button>

          <VocabStarButton
            token={token}
            isStarred={isStarred}
            onStar={() => onStar()}
            className="text-xl"
          />
        </div>
      </div>

      <div className="word-details border-t pt-3 space-y-2">
        {/* Part of speech - only show if not in English Only mode */}
        {translationDisplay !== 'inline' && token.lemma && (
          <div className="mb-2">
            <div className="text-sm text-secondary">Part of Speech:</div>
            <div className="font-medium">Not available</div>
          </div>
        )}

        {/* Surface form if different from lemma - only show if not in English Only mode */}
        {token.surface !== token.lemma && translationDisplay !== 'inline' && (
          <div className="mb-2">
            <div className="text-sm text-secondary">Form:</div>
            <div className="hebrew-text" dir="rtl">{processedSurface}</div>
          </div>
        )}

        {/* Root if available - only show if not in English Only mode */}
        {token.root && translationDisplay !== 'inline' && (
          <div className="mb-2">
            <div className="text-sm text-secondary">Root:</div>
            <div className="hebrew-text" dir="rtl">{toggleNikud(token.root, showNikud)}</div>
            <div className="text-xs text-gray-600 italic mt-1">
              {rootMeaning || 'No root translation available'}
            </div>
          </div>
        )}

        {/* Copy button at bottom */}
        <div className="mt-4">
          <button
            className={`btn btn-small ${copied ? 'bg-green-500' : 'btn-secondary'} w-full`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy Word'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WordCard;