import { useState } from 'react'
import SettingsCard, { SettingsIcons } from '../components/SettingsCard'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'

function Settings() {
  const [theme, setTheme] = useState('light')
  const [playbackSpeed, setPlaybackSpeed] = useState('normal')
  const [direction, setDirection] = useState('he-en')
  const [autoCorrect, setAutoCorrect] = useState(false)
  const [clearConfirmation, setClearConfirmation] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  // Function to handle data clearing
  const handleClearData = () => {
    // In a real implementation, this would clear IndexedDB and localStorage
    try {
      // Simulate success
      setTimeout(() => {
        setClearSuccess(true)
        setClearConfirmation(false)
        setTimeout(() => setClearSuccess(false), 3000)
      }, 1000)
    } catch (error) {
      setClearError('Failed to clear data. Please try again.')
    }
  }

  return (
    <>
      <TopNavBar current="settings" title="Settings" subtitle="Preferences" />
      <div className="container pb-16">

      {clearSuccess && (
        <div className="bg-green-100 text-green-800 p-3 rounded mb-4">
          All data cleared successfully!
        </div>
      )}

      <ErrorMessage
        error={clearError}
        onDismiss={() => setClearError(null)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Display Settings */}
        <SettingsCard
          title="Display"
          icon={SettingsIcons.Display}
          color="bg-blue-50"
        >
          <div className="settings-section">
            <div className="settings-option-label">Theme</div>
            <div className="flex gap-2">
              <button
                className={`btn ${theme === 'light' ? '' : 'btn-secondary'}`}
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
              >
                Light
              </button>
              <button
                className={`btn ${theme === 'dark' ? '' : 'btn-secondary'}`}
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
              >
                Dark
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Changes app appearance to light or dark mode
            </div>
          </div>
        </SettingsCard>

        {/* Language Settings */}
        <SettingsCard
          title="Language"
          icon={SettingsIcons.Language}
          color="bg-purple-50"
        >
          <div className="settings-section">
            <div className="settings-option-label">Translation Direction</div>
            <div className="flex gap-2 flex-wrap">
              <button
                className={`btn ${direction === 'he-en' ? '' : 'btn-secondary'}`}
                onClick={() => setDirection('he-en')}
                aria-pressed={direction === 'he-en'}
              >
                Hebrew → English
              </button>
              <button
                className={`btn ${direction === 'en-he' ? '' : 'btn-secondary'}`}
                onClick={() => setDirection('en-he')}
                aria-pressed={direction === 'en-he'}
              >
                English → Hebrew
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Choose which language direction to translate
            </div>
          </div>
        </SettingsCard>

        {/* Audio Settings */}
        <SettingsCard
          title="Audio"
          icon={SettingsIcons.Audio}
          color="bg-green-50"
        >
          <div className="settings-section">
            <div className="settings-option-label">Playback Speed</div>
            <div className="flex gap-2">
              <button
                className={`btn ${playbackSpeed === 'slow' ? '' : 'btn-secondary'}`}
                onClick={() => setPlaybackSpeed('slow')}
                aria-pressed={playbackSpeed === 'slow'}
              >
                Slow
              </button>
              <button
                className={`btn ${playbackSpeed === 'normal' ? '' : 'btn-secondary'}`}
                onClick={() => setPlaybackSpeed('normal')}
                aria-pressed={playbackSpeed === 'normal'}
              >
                Normal
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Controls the speed of audio pronunciation
            </div>
          </div>
        </SettingsCard>

        {/* OCR Options */}
        <SettingsCard
          title="OCR Options"
          icon={SettingsIcons.OCR}
          color="bg-orange-50"
        >
          <div className="settings-section">
            <div className="settings-option-label">Text Recognition</div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="autocorrect"
                className="form-checkbox h-4 w-4 text-primary"
                checked={autoCorrect}
                onChange={() => setAutoCorrect(!autoCorrect)}
              />
              <label htmlFor="autocorrect">Apply auto-correction to OCR results</label>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Automatically attempt to fix minor OCR recognition mistakes
            </div>
          </div>
        </SettingsCard>

        {/* Storage Options */}
        <SettingsCard
          title="Storage"
          icon={SettingsIcons.Storage}
          color="bg-red-50"
        >
          <div className="settings-section mb-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <div className="settings-option-label">Texts and Images</div>
                <div className="text-xs text-gray-500">Stored in browser's local database</div>
              </div>
              <span className="text-sm bg-gray-100 px-2 py-1 rounded">2.3 MB</span>
            </div>

            <div className="flex justify-between items-center mb-3">
              <div>
                <div className="settings-option-label">Vocabulary</div>
                <div className="text-xs text-gray-500">Your starred words</div>
              </div>
              <span className="text-sm bg-gray-100 px-2 py-1 rounded">128 KB</span>
            </div>

            {clearConfirmation ? (
              <div className="border rounded p-3 bg-white">
                <p className="text-sm mb-2">Are you sure you want to clear all saved data? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    className="btn bg-red-600 text-white"
                    onClick={handleClearData}
                  >
                    Yes, Clear All Data
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setClearConfirmation(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-secondary w-full"
                onClick={() => setClearConfirmation(true)}
              >
                Clear All Saved Data
              </button>
            )}
          </div>
        </SettingsCard>

        {/* Feedback & About */}
        <SettingsCard
          title="About & Feedback"
          icon={SettingsIcons.Feedback}
          color="bg-gray-50"
        >
          <div className="mb-3">
            <h3 className="font-medium mb-1">Mila</h3>
            <p className="text-sm text-gray-600">Version 0.2.0</p>
          </div>

          <div className="mb-3">
            <div className="settings-option-label">Send Feedback</div>
            <p className="text-sm text-gray-600 mb-2">
              Help us improve by sharing your experience.
            </p>
            <button className="btn btn-secondary">
              Report Issue
            </button>
          </div>
        </SettingsCard>
      </div>
      </div>
    </>
  )
}

export default Settings
