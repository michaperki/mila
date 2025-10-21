import { useState, useEffect, useRef, useMemo } from 'react'
import { useVocabStore } from '../state/useVocabStore'
import { StarredItem } from '../types'
import { groupItemsByDate, formatGroupName } from '../lib/dateUtils'
import VocabItem from '../components/VocabItem'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000

const SORT_LABELS: Record<string, string> = {
  'date-desc': 'Newest First',
  'date-asc': 'Oldest First',
  'alpha-he-asc': 'Hebrew A → Z',
  'alpha-he-desc': 'Hebrew Z → A',
  'alpha-en-asc': 'English A → Z',
  'alpha-en-desc': 'English Z → A',
  'freq-desc': 'Most Frequent',
  'freq-asc': 'Least Frequent',
};

function Vocab() {
  const {
    vocab,
    getVocab,
    removeItem,
    searchVocab,
    exportVocab,
    importVocab,
    clearVocab,
    isLoading: storeLoading,
    error
  } = useVocabStore()

  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showNikud, setShowNikud] = useState(true)
  const [showTranslit, setShowTranslit] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalSaved = vocab.length

  const { recent, avgFrequency, withRoots } = useMemo(() => {
    const now = Date.now()
    const recentCount = vocab.filter((item) => now - item.createdAt <= WEEK_IN_MS).length
    const average = vocab.length
      ? Math.round(
          vocab.reduce((sum, item) => sum + (item.frequency ?? 0), 0) / Math.max(vocab.length, 1),
        )
      : 0
    const roots = vocab.filter((item) => Boolean(item.root)).length

    return {
      recent: recentCount,
      avgFrequency: average,
      withRoots: roots,
    }
  }, [vocab])

  useEffect(() => {
    const loadVocab = async () => {
      try {
        await getVocab()
      } catch (err) {
        console.error('Failed to load vocabulary:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadVocab()

    // Reload data when returning to this page
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadVocab()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [getVocab])

  // Get filtered vocabulary items
  const filteredVocab = searchTerm.trim() === ''
    ? vocab
    : searchVocab(searchTerm)

  // Group and sort the vocabulary items
  const sortedAndGroupedVocab = useMemo(() => {
    const itemsToSort = [...filteredVocab];

    // Sorting logic
    switch (sortOrder) {
      case 'date-asc':
        itemsToSort.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'date-desc':
        itemsToSort.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'alpha-he-asc':
        itemsToSort.sort((a, b) => a.lemma.localeCompare(b.lemma));
        break;
      case 'alpha-he-desc':
        itemsToSort.sort((a, b) => b.lemma.localeCompare(a.lemma));
        break;
      case 'alpha-en-asc':
        itemsToSort.sort((a, b) => a.gloss.localeCompare(b.gloss));
        break;
      case 'alpha-en-desc':
        itemsToSort.sort((a, b) => b.gloss.localeCompare(a.gloss));
        break;
      case 'freq-desc':
        itemsToSort.sort((a, b) => (b.frequency || 1) - (a.frequency || 1));
        break;
      case 'freq-asc':
        itemsToSort.sort((a, b) => (a.frequency || 1) - (b.frequency || 1));
        break;
      default:
        break;
    }

    if (sortOrder.startsWith('date')) {
      const groups = groupItemsByDate(itemsToSort);
      return Object.entries(groups)
        .filter(([_, items]) => items.length > 0)
        .map(([groupName, items]) => ({
          groupName,
          displayName: formatGroupName(groupName),
          items,
        }));
    } else {
      // Return a single group for non-date-based sorting
      return [{
        groupName: sortOrder,
        displayName: SORT_LABELS[sortOrder] || 'Custom Order',
        items: itemsToSort,
      }];
    }
  }, [filteredVocab, sortOrder]);

  // Handle removing a vocabulary item
  const handleRemoveItem = (id: string) => {
    removeItem(id)
  }

  // Handle exporting vocabulary as JSON
  const handleExport = () => {
    try {
      const jsonData = exportVocab()

      // Create a blob and download link
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // Create a download link and click it
      const a = document.createElement('a')
      a.href = url
      a.download = `mila-vocab-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()

      // Clean up
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Show success message briefly
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  // Handle importing vocabulary from JSON
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setImportError(null)

      // Read the file
      const text = await file.text()

      // Import the vocabulary
      const success = await importVocab(text)

      if (success) {
        setImportSuccess(true)
        setTimeout(() => setImportSuccess(false), 3000)
      }

      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setImportError(`Import failed: ${(err as Error).message}`)
    }
  }

  // Handle clearing vocabulary
  const handleClearConfirm = () => {
    setShowConfirmClear(true)
  }

  const handleClearCancel = () => {
    setShowConfirmClear(false)
  }

  const handleClearConfirmed = async () => {
    await clearVocab()
    setShowConfirmClear(false)
  }

  return (
    <>
      <TopNavBar
        current="vocab"
        title="Vocabulary"
        subtitle="Saved Words"
        actions={
          <button
            className="btn-icon"
            onClick={() => setShowAdvanced(prev => !prev)}
            aria-label="Toggle advanced tools"
            aria-expanded={showAdvanced}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        }
      />

      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 space-y-8 sm:px-6">
        <section className="vocab-hero">
          <div className="vocab-hero__intro">
            <span className="vocab-hero__eyebrow">Build your word bank</span>
            <h1 className="vocab-hero__title">Vocabulary</h1>
            <p className="vocab-hero__subtitle">
              Words you star while reading live here. Search, sort, and export them to keep your practice focused.
            </p>
          </div>
          <div className="vocab-hero__stats">
            <div className="vocab-hero__metric">
              <span>Saved words</span>
              <strong>{totalSaved}</strong>
              <small>Total captured</small>
            </div>
            <div className="vocab-hero__metric">
              <span>Added this week</span>
              <strong>{recent}</strong>
              <small>Past 7 days</small>
            </div>
            <div className="vocab-hero__metric">
              <span>Average reviews</span>
              <strong>{avgFrequency}</strong>
              <small>Per entry</small>
            </div>
            <div className="vocab-hero__metric">
              <span>Roots captured</span>
              <strong>{withRoots}</strong>
              <small>Linked entries</small>
            </div>
          </div>
        </section>

        <section className="vocab-toolbar card">
          <div className="vocab-toolbar__grid">
            <div className="vocab-toolbar__field">
              <label className="vocab-toolbar__label" htmlFor="vocab-search">
                Search saved words
              </label>
              <input
                id="vocab-search"
                type="search"
                placeholder="Filter by Hebrew, transliteration, or gloss…"
                className="vocab-toolbar__search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="vocab-toolbar__field vocab-toolbar__field--compact">
              <label className="vocab-toolbar__label" htmlFor="vocab-sort">
                Sort by
              </label>
              <select
                id="vocab-sort"
                className="vocab-toolbar__select"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="alpha-he-asc">Hebrew (A–Z)</option>
                <option value="alpha-he-desc">Hebrew (Z–A)</option>
                <option value="alpha-en-asc">English (A–Z)</option>
                <option value="alpha-en-desc">English (Z–A)</option>
                <option value="freq-desc">Frequency (high–low)</option>
                <option value="freq-asc">Frequency (low–high)</option>
              </select>
            </div>
          </div>
          <div className="vocab-toolbar__display">
            <span className="vocab-toolbar__label">Display</span>
            <div className="toggle-group" role="group" aria-label="Display options">
              <button
                type="button"
                className={`toggle-button${showNikud ? ' active' : ''}`}
                onClick={() => setShowNikud((prev) => !prev)}
                aria-pressed={showNikud}
              >
                {showNikud ? 'Hide nikud' : 'Show nikud'}
              </button>
              <button
                type="button"
                className={`toggle-button${showTranslit ? ' active' : ''}`}
                onClick={() => setShowTranslit((prev) => !prev)}
                aria-pressed={showTranslit}
              >
                {showTranslit ? 'Hide transliteration' : 'Show transliteration'}
              </button>
            </div>
          </div>
        </section>

        <section className="vocab-advanced card">
          <header className="vocab-advanced__header">
            <div>
              <p className="vocab-advanced__eyebrow">Power tools</p>
              <h2 className="vocab-advanced__title">Manage your word bank</h2>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-small vocab-advanced__toggle"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? 'Hide tools' : 'Show tools'}
            </button>
          </header>

          {showAdvanced && (
            <div className="vocab-advanced__panel">
              <p className="vocab-advanced__hint">Export or import your saved vocabulary, or clear everything to start fresh.</p>
              <div className="vocab-advanced__actions">
                <button
                  className="btn btn-small"
                  onClick={handleExport}
                  disabled={storeLoading || totalSaved === 0}
                  type="button"
                >
                  Export JSON
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={handleImportClick}
                  disabled={storeLoading}
                  type="button"
                >
                  Import JSON
                </button>
                <button
                  className="btn btn-danger btn-small"
                  onClick={handleClearConfirm}
                  disabled={storeLoading || totalSaved === 0}
                  type="button"
                >
                  Clear all
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          )}
        </section>

        {exportSuccess && (
          <div className="alert alert--success">
            Vocabulary exported successfully.
          </div>
        )}

        {importSuccess && (
          <div className="alert alert--success">
            Vocabulary imported successfully.
          </div>
        )}

        <ErrorMessage error={importError} onDismiss={() => setImportError(null)} />

        <ErrorMessage
          error={error}
          onRetry={async () => {
            setIsLoading(true)
            try {
              await getVocab()
              setIsLoading(false)
            } catch (err) {
              console.error('Retry failed:', err)
              setIsLoading(false)
            }
          }}
        />

        {showConfirmClear && (
          <div className="dialog-backdrop" role="presentation">
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="clear-vocab-title">
              <h3 id="clear-vocab-title" className="dialog__title">
                Clear vocabulary
              </h3>
              <p className="dialog__body">
                Are you sure you want to remove all vocabulary items? This action cannot be undone.
              </p>
              <div className="dialog__actions">
                <button type="button" className="btn btn-outline btn-small" onClick={handleClearCancel}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger btn-small" onClick={handleClearConfirmed}>
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="vocab-collection card">
          {isLoading ? (
            <div className="vocab-loading" role="status">
              <span>Loading vocabulary…</span>
              <div className="vocab-loading__track">
                <div className="vocab-loading__bar" />
              </div>
            </div>
          ) : filteredVocab.length > 0 ? (
            <div className="vocab-groups">
              {sortedAndGroupedVocab.map((group) => (
                <article key={group.groupName} className="vocab-group">
                  <header className="vocab-group__header">
                    <h3 className="vocab-group__title">{group.displayName}</h3>
                    <span className="vocab-group__count">{group.items.length}</span>
                  </header>
                  <ul className="vocab-group__list">
                    {group.items.map((item: StarredItem) => (
                      <VocabItem
                        key={item.id}
                        item={item}
                        showNikud={showNikud}
                        showTranslit={showTranslit}
                        onRemove={handleRemoveItem}
                      />
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : searchTerm ? (
            <div className="vocab-empty">
              <div className="vocab-empty__icon" aria-hidden="true">
                🔍
              </div>
              <h3 className="vocab-empty__title">No matches found</h3>
              <p className="vocab-empty__subtitle">
                Try refining your search or clear the filters to see every saved word.
              </p>
            </div>
          ) : (
            <div className="vocab-empty">
              <div className="vocab-empty__icon" aria-hidden="true">
                📚
              </div>
              <h3 className="vocab-empty__title">Your word bank is waiting</h3>
              <p className="vocab-empty__subtitle">
                Star words in the Reader to build your personal vocabulary list.
              </p>
              <ol className="vocab-empty__steps">
                <li>Use the Camera tab to capture text you want to explore.</li>
                <li>Open the Reader and tap any word to view its details.</li>
                <li>Save it with the star button to keep it handy here.</li>
              </ol>
            </div>
          )}
        </section>
      </main>
    </>
  )
}

export default Vocab
