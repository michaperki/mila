import React from 'react';

interface ReadingControlBarProps {
  showNikud: boolean;
  setShowNikud: (show: boolean) => void;
  showTransliteration: boolean;
  setShowTransliteration: (show: boolean) => void;
  displayMode: 'fullText' | 'sentence' | 'word';
  setDisplayMode: (mode: 'fullText' | 'sentence' | 'word') => void;
  translationDisplay: 'hidden' | 'inline' | 'interlinear';
  setTranslationDisplay: (display: 'hidden' | 'inline' | 'interlinear') => void;
  viewMode?: 'words' | 'phrases';
  setViewMode?: (mode: 'words' | 'phrases') => void;
}

function ReadingControlBar({
  showNikud,
  setShowNikud,
  showTransliteration,
  setShowTransliteration,
  displayMode,
  setDisplayMode,
  translationDisplay,
  setTranslationDisplay,
  viewMode,
  setViewMode
}: ReadingControlBarProps) {
  return (
    <div className="reading-control-bar">
      <div className="control-inner">
        <div className="flex flex-wrap gap-2 mb-2">
          {/* Text format controls */}
          <button
            className={`btn btn-small ${showNikud ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowNikud(!showNikud)}
            aria-pressed={showNikud}
          >
            {showNikud ? 'Hide Nikud' : 'Show Nikud'}
          </button>
          
          <button
            className={`btn btn-small ${showTransliteration ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowTransliteration(!showTransliteration)}
            aria-pressed={showTransliteration}
          >
            {showTransliteration ? 'Hide Transliteration' : 'Show Transliteration'}
          </button>
        </div>

        <div className="controls-section">
          {/* Display mode selector */}
          <div className="mb-2">
            <label className="block text-sm mb-1 text-gray-500">View Mode</label>
            <div className="toggle-group">
              <button
                className={`toggle-button ${displayMode === 'fullText' ? 'active' : ''}`}
                onClick={() => setDisplayMode('fullText')}
                aria-pressed={displayMode === 'fullText'}
              >
                Full Text
              </button>
              <button
                className={`toggle-button ${displayMode === 'sentence' ? 'active' : ''}`}
                onClick={() => setDisplayMode('sentence')}
                aria-pressed={displayMode === 'sentence'}
              >
                Sentence
              </button>
              <button
                className={`toggle-button ${displayMode === 'word' ? 'active' : ''}`}
                onClick={() => setDisplayMode('word')}
                aria-pressed={displayMode === 'word'}
              >
                Word
              </button>
            </div>
          </div>

          {/* Translation display options */}
          <div className="mb-2">
            <label className="block text-sm mb-1 text-gray-500">Translation</label>
            <div className="toggle-group">
              <button
                className={`toggle-button ${translationDisplay === 'hidden' ? 'active' : ''}`}
                onClick={() => setTranslationDisplay('hidden')}
                aria-pressed={translationDisplay === 'hidden'}
              >
                Hebrew Only
              </button>
              <button
                className={`toggle-button ${translationDisplay === 'inline' ? 'active' : ''}`}
                onClick={() => setTranslationDisplay('inline')}
                aria-pressed={translationDisplay === 'inline'}
              >
                English Only
              </button>
              <button
                className={`toggle-button ${translationDisplay === 'interlinear' ? 'active' : ''}`}
                onClick={() => setTranslationDisplay('interlinear')}
                aria-pressed={translationDisplay === 'interlinear'}
              >
                Interlinear
              </button>
            </div>
          </div>

          {/* Word/Phrase view mode selector (only visible in word mode) */}
          {displayMode === 'word' && setViewMode && viewMode && (
            <div className="mb-2">
              <label className="block text-sm mb-1 text-gray-500">Analysis Mode</label>
              <div className="toggle-group">
                <button
                  className={`toggle-button ${viewMode === 'words' ? 'active' : ''}`}
                  onClick={() => setViewMode('words')}
                  aria-pressed={viewMode === 'words'}
                >
                  Words
                </button>
                <button
                  className={`toggle-button ${viewMode === 'phrases' ? 'active' : ''}`}
                  onClick={() => setViewMode('phrases')}
                  aria-pressed={viewMode === 'phrases'}
                >
                  Phrases
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReadingControlBar;