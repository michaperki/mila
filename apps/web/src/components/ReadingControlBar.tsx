interface ReadingControlBarProps {
  displayMode: 'fullText' | 'sentence' | 'word';
  setDisplayMode: (mode: 'fullText' | 'sentence' | 'word') => void;
}

const MODE_LABELS: Record<'fullText' | 'sentence' | 'word', string> = {
  fullText: 'Full Text',
  sentence: 'Sentence',
  word: 'Word',
};

function ReadingControlBar({ displayMode, setDisplayMode }: ReadingControlBarProps) {
  return (
    <nav className="reading-mode-toggle">
      <div className="mode-toggle">
        {(['fullText', 'sentence', 'word'] as const).map((mode, index) => {
          const isActive = displayMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDisplayMode(mode)}
            className={`mode-toggle__btn${isActive ? ' mode-toggle__btn--active' : ''}`}
              aria-pressed={isActive}
            >
              {MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default ReadingControlBar;
