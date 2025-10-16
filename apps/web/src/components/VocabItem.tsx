import { useState } from 'react';
import { StarredItem } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';

interface VocabItemProps {
  item: StarredItem;
  showNikud: boolean;
  showTranslit: boolean;
  onRemove: (id: string) => void;
}

function VocabItem({ item, showNikud, showTranslit, onRemove }: VocabItemProps) {
  const [copied, setCopied] = useState(false);

  // Handle copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(`${item.lemma} - ${item.gloss}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li className="p-4 hover:bg-gray-50 transition-colors border border-gray-100 rounded-md mb-2 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="flex-grow">
          <div className="hebrew-text text-xl font-bold mb-1" dir="rtl" lang="he">
            {showNikud ? item.lemma : toggleNikud(item.lemma, false)}
          </div>

          {showTranslit && (
            <div className="text-sm italic text-gray-500 mb-1">
              {transliterate(item.lemma)}
            </div>
          )}

          <div className="text-gray-700 font-medium">{item.gloss}</div>

          {/* Source context information */}
          {item.sourceRef && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-sm border-l-2 border-primary">
              <div className="text-xs text-gray-500 mb-1 font-medium">
                Source context:
              </div>
              {/* This would ideally show the actual text chunk, but for now we'll show a placeholder */}
              <div className="text-gray-600 italic">
                "{item.lemma}" from text ID: {item.sourceRef.textId.substring(0, 8)}...
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 ml-4">
          <button
            className={`btn btn-small ${copied ? 'bg-green-500 text-white' : 'btn-secondary'}`}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <button
            className="btn btn-small bg-red-100 text-red-700 hover:bg-red-200"
            onClick={() => onRemove(item.id)}
            title="Remove from vocabulary"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export default VocabItem;