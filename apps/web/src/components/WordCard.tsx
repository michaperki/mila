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

  const processedSurface = useMemo(() => toggleNikud(token.surface, showNikud), [token.surface, showNikud]);
  const processedLemma = useMemo(
    () => (token.lemma ? toggleNikud(token.lemma, showNikud) : processedSurface),
    [token.lemma, processedSurface, showNikud]
  );
  const transliteration = useMemo(() => transliterate(processedSurface), [processedSurface]);
  const rootMeaning = useMemo(() => (token.root ? getRootMeaning(token.root) : null), [token.root]);

  const showHebrew = translationDisplay !== 'inline';
  const showTranslation = translationDisplay !== 'hidden';
  const rootText = token.root ? toggleNikud(token.root, showNikud) : null;
  const hasDistinctSurface = showHebrew && Boolean(token.lemma) && token.surface !== token.lemma;

  const actionButtonClasses =
    'w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors';

  const handleCopy = () => {
    const textToCopy = `${processedLemma} - ${token.gloss || 'unknown'}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSpeak = () => {
    alert('Text-to-speech will be implemented in a future version');
  };

  return (
    <article className="w-full max-w-xl mx-auto bg-gradient-to-b from-blue-50 to-white border border-blue-100 rounded-2xl p-6 shadow-md text-center">
      <div className="space-y-3">
        {showHebrew && (
          <h1 className="text-7xl font-bold text-gray-900 text-center" dir="rtl" lang="he">
            {processedLemma}
          </h1>
        )}

        {showTranslation && (
          <p className="text-2xl text-gray-700">
            {token.gloss || '—'}
          </p>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            className={actionButtonClasses}
            onClick={handleSpeak}
            aria-label="Play pronunciation"
          >
            🔊
          </button>
          <VocabStarButton
            token={token}
            isStarred={isStarred}
            onStar={onStar}
            className={`${actionButtonClasses} text-lg`}
          />
          <button
            className={`${actionButtonClasses} ${copied ? 'border-green-400 text-green-600' : ''}`}
            onClick={handleCopy}
            aria-label="Copy word"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm text-gray-600">
        {(rootText || transliteration) && (
          <div>
            {rootText && (
              <p className="uppercase text-xs font-semibold text-gray-500 tracking-wide mb-1">
                Root
              </p>
            )}
            {rootText && (
              <p className="text-lg font-semibold text-gray-800 text-center" dir="rtl" lang="he">
                {rootText}
              </p>
            )}
            <p className="text-sm italic text-gray-500 mt-1">
              {transliteration}
            </p>
            {rootMeaning && (
              <p className="text-xs text-gray-500 mt-1">{rootMeaning}</p>
            )}
          </div>
        )}

        {token.pos && (
          <div>
            <p className="uppercase text-xs font-semibold text-gray-500 tracking-wide mb-1">
              Part of Speech
            </p>
            <p className="text-sm font-medium text-gray-800">
              {token.pos}
            </p>
          </div>
        )}

        {hasDistinctSurface && (
          <div>
            <p className="uppercase text-xs font-semibold text-gray-500 tracking-wide mb-1">
              Surface Form
            </p>
            <p className="text-lg font-semibold text-gray-800 text-center" dir="rtl" lang="he">
              {processedSurface}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export default WordCard;
