import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTextStore } from '../state/useTextStore';
import { useVocabStore } from '../state/useVocabStore';
import { useProgressStore } from '../state/useProgressStore';
import FullTextDisplay from '../components/FullTextDisplay';
import ErrorMessage from '../components/ErrorMessage';
import TopNavBar from '../components/TopNavBar';
import { Chunk, Token, StarredItem, TextDoc } from '../types';

type ToastState = {
  message: string;
  variant: 'success' | 'info';
};

function Reader() {
  const { textId } = useParams<{ textId: string }>();
  const navigate = useNavigate();
  const { getTextById } = useTextStore();
  const { starItem, removeItem, getVocab } = useVocabStore();
  const recordReading = useProgressStore((state) => state.recordReading);

  const [text, setText] = useState<TextDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNikud, setShowNikud] = useState(true);
  const [translationDisplay, setTranslationDisplay] = useState<'hidden' | 'inline' | 'interlinear'>('interlinear');
  const [starredItems, setStarredItems] = useState<StarredItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starringError, setStarringError] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, variant: ToastState['variant'] = 'success') => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, variant });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  const refreshVocab = useCallback(async () => {
    try {
      const items = await getVocab();
      setStarredItems(items);
    } catch (error) {
      console.error('Error reloading vocabulary:', error);
    }
  }, [getVocab]);

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    return () => {
      if (sessionStartRef.current) {
        const durationMs = Date.now() - sessionStartRef.current;
        const minutes = Math.max(1, Math.round(durationMs / 60000));
        if (minutes > 0) {
          recordReading(minutes);
        }
      }
    };
  }, [recordReading]);

  useEffect(() => {
    const loadData = async () => {
      if (!textId) {
        navigate('/');
        return;
      }

      setIsLoading(true);

      try {
        const textPromise = getTextById(textId);
        const vocabPromise = getVocab();
        const [loadedText, vocabItems] = await Promise.allSettled([textPromise, vocabPromise]);

        if (loadedText.status === 'fulfilled') {
          if (!loadedText.value) {
            navigate('/');
            return;
          }

          setText(loadedText.value);
        } else {
          console.error('Error loading text:', loadedText.reason);
          setLoadError(`Failed to load text: ${loadedText.reason?.message || 'Unknown error'}`);
        }

        if (vocabItems.status === 'fulfilled') {
          setStarredItems(vocabItems.value);
          setLoadError(null);
        } else {
          console.error('Error loading vocabulary:', vocabItems.reason);
        }
      } catch (error) {
        console.error('Error in load operation:', error);
        setLoadError((error as Error).message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshVocab();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [textId, getTextById, getVocab, navigate, refreshVocab]);

  const isTokenStarred = useCallback((token: Token): boolean => {
    if (!token.lemma) return false;
    return starredItems.some((item) => item.lemma === token.lemma);
  }, [starredItems]);

  const resolveChunkIdForToken = useCallback((token: Token, chunk?: Chunk): string | undefined => {
    if (chunk && chunk.tokens?.some((candidate) => candidate.idx === token.idx)) {
      return chunk.id;
    }
    const fallbackChunk = text?.chunks.find((candidate) =>
      candidate.tokens?.some((candidateToken) => candidateToken.idx === token.idx),
    );
    return fallbackChunk?.id;
  }, [text]);

  const handleToggleStar = useCallback(async (tokenToToggle?: Token, sourceChunk?: Chunk) => {
    const token = tokenToToggle;
    if (!token?.lemma || !token.gloss) return;

    try {
      setStarringError(null);
      const alreadyStarred = isTokenStarred(token);

      if (alreadyStarred) {
        const itemToRemove = starredItems.find((item) => item.lemma === token.lemma);
        if (!itemToRemove) return;

        await removeItem(itemToRemove.id);
        setStarredItems((prev) => prev.filter((item) => item.lemma !== token.lemma));

        try {
          await refreshVocab();
        } catch (syncError) {
          console.warn('Error synchronizing vocab after removal:', syncError);
        }
      } else {
        const chunkId = resolveChunkIdForToken(token, sourceChunk);
        const newItem: StarredItem = {
          id: `${token.lemma}-${Date.now()}`,
          lemma: token.lemma,
          gloss: token.gloss || 'Unknown',
          sourceRef: textId ? {
            textId,
            chunkId: chunkId ?? '',
          } : undefined,
          createdAt: Date.now(),
        };

        await starItem(newItem);
        setStarredItems((prev) => [newItem, ...prev]);
        showToast('Saved to vocab!');

        try {
          await refreshVocab();
        } catch (syncError) {
          console.warn('Error synchronizing vocab after addition:', syncError);
        }
      }
    } catch (error) {
      console.error('Error toggling star status:', error);
      setStarringError((error as Error).message || 'Failed to update vocabulary');
    }
  }, [isTokenStarred, starredItems, removeItem, refreshVocab, resolveChunkIdForToken, starItem, showToast, textId]);

  const navBar = (
    <TopNavBar
      current="reader"
      title="Current"
      subtitle={text?.title || undefined}
      actions={
        <div className="relative">
          <button
            className="btn-icon"
            onClick={() => setShowSettingsPanel((prev) => !prev)}
            aria-label="Toggle reading settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          {showSettingsPanel && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Display</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`btn btn-small ${showNikud ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
                    onClick={() => setShowNikud(!showNikud)}
                    aria-pressed={showNikud}
                  >
                    {showNikud ? 'Hide Nikud' : 'Show Nikud'}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Translation</p>
                <div className="flex flex-wrap gap-2">
                  {(['hidden', 'inline', 'interlinear'] as const).map(mode => (
                    <button
                      key={mode}
                      className={`btn btn-small ${translationDisplay === mode ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
                      onClick={() => setTranslationDisplay(mode)}
                      aria-pressed={translationDisplay === mode}
                    >
                      {mode === 'hidden' ? 'Hebrew' : mode === 'inline' ? 'English' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {navBar}
        <div className="container flex items-center justify-center" style={{ minHeight: 'calc(100vh - 96px)' }}>
          <div className="text-center">
            <div className="mb-4 text-primary text-xl">Loading...</div>
            <div className="text-sm text-secondary">Please wait while we load the text</div>
          </div>
        </div>
      </>
    );
  }

  if (!text) {
    return (
      <>
        {navBar}
        <div className="container">
          <div className="card">
            <h2 className="text-xl font-bold mb-2">Text not found</h2>
            <p>The requested text could not be found.</p>
            <button
              className="btn mt-4"
              onClick={() => navigate('/')}
            >
              Return to Home
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {navBar}
      <div className="container pb-16">
        <ErrorMessage
          error={loadError}
          onRetry={() => {
            if (!textId) return;
            setIsLoading(true);
            getTextById(textId).then((freshText) => {
              setText(freshText);
              setLoadError(null);
              setIsLoading(false);
            }).catch((err) => {
              setLoadError((err as Error).message);
              setIsLoading(false);
            });
          }}
          onDismiss={() => setLoadError(null)}
        />

        <ErrorMessage
          error={starringError}
          onDismiss={() => setStarringError(null)}
        />

        <section id="reader-section-fullText" className="card mb-4 p-4">
          <FullTextDisplay
            chunks={text.chunks}
            showNikud={showNikud}
            translationDisplay={translationDisplay}
            onWordStar={handleToggleStar}
            isWordStarred={isTokenStarred}
            textScale={1}
          />
        </section>
      </div>

      {toast && (
        <div className={`toast${toast.variant === 'success' ? ' toast--success' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}

export default Reader;
