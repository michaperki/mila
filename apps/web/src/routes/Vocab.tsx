import { useState, useEffect, useRef } from 'react'
import { useVocabStore } from '../state/useVocabStore'
import { StarredItem } from '../types'
import { toggleNikud } from '../lib/nikud'
import { transliterate } from '../lib/translit'

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

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadVocab = async () => {
      await getVocab()
      setIsLoading(false)
    }

    loadVocab()
  }, [getVocab])

  // Get filtered vocabulary items
  const filteredVocab = searchTerm.trim() === ''
    ? vocab
    : searchVocab(searchTerm)

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
    <div className="container">
      <h1 className="text-xl font-bold mb-4">Vocabulary</h1>

      {/* Search and view options */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex-grow">
          <input
            type="search"
            placeholder="Search vocabulary..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>

        <div className="flex gap-2">
          <button
            className={`btn btn-small ${showNikud ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowNikud(!showNikud)}
          >
            {showNikud ? 'Hide Nikud' : 'Show Nikud'}
          </button>

          <button
            className={`btn btn-small ${showTranslit ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowTranslit(!showTranslit)}
          >
            {showTranslit ? 'Hide Translit' : 'Show Translit'}
          </button>
        </div>
      </div>

      {/* Export/Import buttons */}
      <div className="flex gap-2 mb-4">
        <button
          className="btn btn-secondary"
          onClick={handleExport}
          disabled={storeLoading || vocab.length === 0}
        >
          Export Vocabulary
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleImportClick}
          disabled={storeLoading}
        >
          Import Vocabulary
        </button>

        <button
          className="btn btn-secondary text-red-500"
          onClick={handleClearConfirm}
          disabled={storeLoading || vocab.length === 0}
        >
          Clear All
        </button>

        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/json"
          onChange={handleImportFile}
          style={{ display: 'none' }}
        />
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

      {importError && (
        <div className="bg-red-100 text-red-800 p-2 rounded mb-4">
          {importError}
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-800 p-2 rounded mb-4">
          {error}
        </div>
      )}

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
      <div className="card">
        {isLoading ? (
          <div className="p-4 text-center">
            <div className="mb-2 text-primary">Loading vocabulary...</div>
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-1 bg-primary animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        ) : filteredVocab.length > 0 ? (
          <ul className="divide-y">
            {filteredVocab.map((item: StarredItem) => (
              <li key={item.id} className="p-3 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="hebrew-text font-bold mb-1" dir="rtl" lang="he">
                      {showNikud ? item.lemma : toggleNikud(item.lemma, false)}
                    </div>

                    {showTranslit && (
                      <div className="text-sm italic text-gray-500 mb-1">
                        {transliterate(item.lemma)}
                      </div>
                    )}

                    <div className="text-gray-700">{item.gloss}</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn btn-small btn-secondary text-sm"
                      onClick={() => {
                        // Copy to clipboard
                        navigator.clipboard.writeText(`${item.lemma} - ${item.gloss}`);
                      }}
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>

                    <button
                      className="btn btn-small bg-red-100 text-red-700 hover:bg-red-200"
                      onClick={() => handleRemoveItem(item.id)}
                      title="Remove from vocabulary"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {item.sourceRef && (
                  <div className="mt-2 text-xs text-gray-500">
                    Added from text: {item.sourceRef.textId}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : searchTerm ? (
          <p className="p-4 text-center text-gray-500">
            No results matching "{searchTerm}". Try another search term.
          </p>
        ) : (
          <div className="p-4 text-center">
            <p className="mb-2">No vocabulary items found.</p>
            <p className="text-sm text-gray-500">
              Star words while reading to add them here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Vocab