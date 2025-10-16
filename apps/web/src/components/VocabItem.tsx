import { useMemo, useState } from 'react';
import { StarredItem } from '../types';
import { toggleNikud } from '../lib/nikud';
import { transliterate } from '../lib/translit';

interface VocabItemProps {
  item: StarredItem;
  showNikud: boolean;
  showTranslit: boolean;
  onRemove: (id: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function VocabItem({ item, showNikud, showTranslit, onRemove }: VocabItemProps) {
  const [copied, setCopied] = useState(false);

  const displayedLemma = useMemo(() => {
    return showNikud ? item.lemma : toggleNikud(item.lemma, false);
  }, [item.lemma, showNikud]);

  const transliterationText = useMemo(() => {
    return showTranslit ? transliterate(item.lemma) : '';
  }, [item.lemma, showTranslit]);

  const addedOn = useMemo(() => dateFormatter.format(new Date(item.createdAt)), [item.createdAt]);
  const frequency = item.frequency ?? 1;

  const handleCopy = () => {
    navigator.clipboard.writeText(`${item.lemma} — ${item.gloss || ''}`.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <div className="flex-grow space-y-3">
        <div className="text-center">
          <h3 className="text-3xl font-bold text-gray-900" dir="rtl" lang="he">
            {displayedLemma}
          </h3>
          <p className="text-xl text-gray-700 mt-1">
            {item.gloss || '—'}
          </p>
          {transliterationText && (
            <p className="text-md italic text-gray-500 mt-1">
              {transliterationText}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-4 text-xs uppercase tracking-wide text-gray-500">
          <span>Added {addedOn}</span>
          <span>Seen {frequency}×</span>
        </div>

        {item.sourceRef && (
          <div className="p-3 bg-gray-50 rounded-md border border-gray-100 text-sm text-gray-600">
            <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Context
            </p>
            <p className="italic truncate">
              Text {item.sourceRef.textId.slice(0, 8)} • Chunk {item.sourceRef.chunkId.slice(0, 8)}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-center items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <button
          className={`btn btn-small ${copied ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>

        <button
          className="btn btn-small bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          onClick={() => onRemove(item.id)}
          title="Remove from vocabulary"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default VocabItem;
