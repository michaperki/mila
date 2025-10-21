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
    <li className="vocab-card">
      <header className="vocab-card__header">
        <p className="vocab-card__lemma" dir="rtl" lang="he">
          {displayedLemma}
        </p>
        {transliterationText && <p className="vocab-card__translit">{transliterationText}</p>}
      </header>

      <p className="vocab-card__gloss">{item.gloss || '—'}</p>

      <div className="vocab-card__meta">
        <span className="vocab-card__chip">Added {addedOn}</span>
        <span className="vocab-card__chip">Seen {frequency}×</span>
        {item.root && <span className="vocab-card__chip">Root {item.root}</span>}
      </div>

      {item.sourceRef && (
        <div className="vocab-card__context">
          <span className="vocab-card__context-label">Context</span>
          <p className="vocab-card__context-text">
            Text {item.sourceRef.textId.slice(0, 8)} · Segment {item.sourceRef.chunkId.slice(0, 8)}
          </p>
        </div>
      )}

      <footer className="vocab-card__actions">
        <button
          type="button"
          className={`btn btn-outline btn-small vocab-card__copy${copied ? ' vocab-card__copy--active' : ''}`}
          onClick={handleCopy}
          title="Copy entry to clipboard"
        >
          {copied ? 'Copied!' : 'Copy entry'}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-small"
          onClick={() => onRemove(item.id)}
          title="Remove from vocabulary"
        >
          Remove
        </button>
      </footer>
    </li>
  );
}

export default VocabItem;
