import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVocabStore } from '../state/useVocabStore'
import { StarredItem } from '../types'
import { groupItemsByDate, formatGroupName } from '../lib/dateUtils'
import VocabItem from '../components/VocabItem'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'

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
  const navigate = useNavigate()
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
      a.download = `readlearn-vocab-${new Date().toISOString().slice(0, 10)}.json`
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
        title="Vocabulary"
        subtitle="Saved Words"
        onBack={handleBack}
        actions={
          <button
            className="btn btn-icon bg-gray-100 hover:bg-gray-200"
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

      <main className="container">
        <p className="text-gray-600 mb-4">
          Words you've starred while reading will appear here. Use this list to review and practice your vocabulary.
        </p>

      {/* Search and view options */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="flex-grow">
            <input
              type="search"
              placeholder="Search vocabulary..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 border rounded-md shadow-sm"
            />
          </div>

          {/* View Options */}
          {/* Sort Dropdown */}
          <div className="flex-shrink-0">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="p-2 border rounded-md shadow-sm bg-white"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="alpha-he-asc">Hebrew (A-Z)</option>
              <option value="alpha-he-desc">Hebrew (Z-A)</option>
              <option value="alpha-en-asc">English (A-Z)</option>
              <option value="alpha-en-desc">English (Z-A)</option>
              <option value="freq-desc">Frequency (High-Low)</option>
              <option value="freq-asc">Frequency (Low-High)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Display
          </span>
          <button
            className={`btn btn-small ${showNikud ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
            onClick={() => setShowNikud(!showNikud)}
            aria-pressed={showNikud}
          >
            {showNikud ? 'Hide Nikud' : 'Show Nikud'}
          </button>
          <button
            className={`btn btn-small ${showTranslit ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border'}`}
            onClick={() => setShowTranslit(!showTranslit)}
            aria-pressed={showTranslit}
          >
            {showTranslit ? 'Hide Translit' : 'Show Translit'}
          </button>
        </div>
      </div>

      {/* Advanced Tools Section */}
      <div className="mb-4">
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:underline"
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Tools
        </button>

        {showAdvanced && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border flex flex-wrap gap-2">
            <button
              className="btn btn-small btn-secondary"
              onClick={handleExport}
              disabled={storeLoading || vocab.length === 0}
            >
              Export JSON
            </button>

            <button
              className="btn btn-small btn-secondary"
              onClick={handleImportClick}
              disabled={storeLoading}
            >
              Import JSON
            </button>

            <button
              className="btn btn-small bg-red-100 text-red-700 hover:bg-red-200"
              onClick={handleClearConfirm}
              disabled={storeLoading || vocab.length === 0}
            >
              Clear All
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept="application/json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Status messages */}
      {exportSuccess && (
        <div className="bg-green-100 text-green-800 p-2 rounded mb-4">
          Vocabulary exported successfully!
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-100 text-green-800 p-2 rounded mb-4">
          Vocabulary imported successfully!
        </div>
      )}

      <ErrorMessage
        error={importError}
        onDismiss={() => setImportError(null)}
      />

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

      {/* Confirmation dialog */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-md mx-auto">
            <h3 className="text-lg font-bold mb-2">Clear Vocabulary</h3>
            <p className="mb-4">Are you sure you want to remove all vocabulary items? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={handleClearCancel}
              >
                Cancel
              </button>
              <button
                className="btn bg-red-500 text-white"
                onClick={handleClearConfirmed}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vocabulary list */}
      <div className="card p-4">
        {isLoading ? (
          <div className="p-4 text-center">
            <div className="mb-2 text-primary">Loading vocabulary...</div>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-1 bg-primary animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        ) : filteredVocab.length > 0 ? (
          <div>
            {sortedAndGroupedVocab.map((group) => (
              <div key={group.groupName} className="mb-6">
                <h3 className="text-md font-semibold text-gray-700 mb-3 border-b pb-1">
                  {group.displayName} ({group.items.length})
                </h3>
                <ul className="space-y-2">
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
              </div>
            ))}
          </div>
        ) : searchTerm ? (
          <p className="p-4 text-center text-gray-500">
            No results matching "{searchTerm}". Try another search term.
          </p>
        ) : (
          <div className="p-6 text-center">
            <div className="mb-4 text-4xl">📚</div>
            <p className="mb-2 font-medium">Your vocabulary list is empty</p>
            <p className="text-sm text-gray-500 mb-4">
              Words you star while reading will appear here for review and practice.
            </p>
            <div className="bg-blue-50 p-3 rounded-lg text-left max-w-md mx-auto mb-2">
              <p className="text-sm font-medium text-blue-800 mb-1">How to add words:</p>
              <ol className="text-sm text-blue-700 list-decimal pl-5 space-y-1">
                <li>Use the Camera tab to capture and translate text</li>
                <li>Tap on any word in the Reader to see its details</li>
                <li>Click the star icon to save words to your vocabulary list</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </main>
    </>
  )
}

export default Vocab
