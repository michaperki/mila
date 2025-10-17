interface ReadingControlBarProps {
  displayMode: 'fullText' | 'sentence' | 'word';
  onChange: (mode: 'fullText' | 'sentence' | 'word') => void;
}

const MODE_LABELS: Record<'fullText' | 'sentence' | 'word', string> = {
  fullText: 'Full Text',
  sentence: 'Sentence',
  word: 'Word',
};

function ReadingControlBar({ displayMode, onChange }: ReadingControlBarProps) {
  return (
    <div className="reader-tabs" role="tablist" aria-label="Reader view modes">
      {(['fullText', 'sentence', 'word'] as const).map((mode) => {
        const isActive = displayMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`reader-section-${mode}`}
            className={`reader-tabs__btn${isActive ? ' reader-tabs__btn--active' : ''}`}
            onClick={() => onChange(mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

export default ReadingControlBar;
