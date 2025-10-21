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
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 space-y-8 sm:px-6">
        <section className="settings-hero">
          <div className="settings-hero__intro">
            <span className="settings-hero__eyebrow">Personalise Mila</span>
            <h1 className="settings-hero__title">Settings</h1>
            <p className="settings-hero__subtitle">
              Tune the experience to match your preferences, from appearance to pronunciation and data control.
            </p>
          </div>
          <div className="settings-hero__metrics">
            <div className="settings-hero__metric">
              <span>Theme</span>
              <strong>{theme === 'light' ? 'Light' : 'Dark'}</strong>
              <small>Current appearance</small>
            </div>
            <div className="settings-hero__metric">
              <span>Direction</span>
              <strong>{direction === 'he-en' ? 'Heb → Eng' : 'Eng → Heb'}</strong>
              <small>Translation focus</small>
            </div>
            <div className="settings-hero__metric">
              <span>Playback</span>
              <strong>{playbackSpeed === 'slow' ? 'Slow' : 'Normal'}</strong>
              <small>Pronunciation speed</small>
            </div>
            <div className="settings-hero__metric">
              <span>OCR assist</span>
              <strong>{autoCorrect ? 'Enabled' : 'Off'}</strong>
              <small>Auto correction</small>
            </div>
          </div>
        </section>

        {clearSuccess && <div className="alert alert--success">All local Mila data cleared.</div>}

        <ErrorMessage error={clearError} onDismiss={() => setClearError(null)} />

        <section className="settings-grid">
          <SettingsCard title="Display" icon={SettingsIcons.Display} accent="display">
            <div className="settings-group">
              <p className="settings-group__label">Theme</p>
              <div className="settings-choice">
                <button
                  type="button"
                  className={`btn btn-small${theme === 'light' ? '' : ' btn-outline'}`}
                  onClick={() => setTheme('light')}
                  aria-pressed={theme === 'light'}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`btn btn-small${theme === 'dark' ? '' : ' btn-outline'}`}
                  onClick={() => setTheme('dark')}
                  aria-pressed={theme === 'dark'}
                >
                  Dark
                </button>
              </div>
              <p className="settings-group__hint">Switch between light and dark appearance.</p>
            </div>
          </SettingsCard>

          <SettingsCard title="Language" icon={SettingsIcons.Language} accent="language">
            <div className="settings-group">
              <p className="settings-group__label">Translation direction</p>
              <div className="settings-choice">
                <button
                  type="button"
                  className={`btn btn-small${direction === 'he-en' ? '' : ' btn-outline'}`}
                  onClick={() => setDirection('he-en')}
                  aria-pressed={direction === 'he-en'}
                >
                  Hebrew → English
                </button>
                <button
                  type="button"
                  className={`btn btn-small${direction === 'en-he' ? '' : ' btn-outline'}`}
                  onClick={() => setDirection('en-he')}
                  aria-pressed={direction === 'en-he'}
                >
                  English → Hebrew
                </button>
              </div>
              <p className="settings-group__hint">Choose which way translations flow by default.</p>
            </div>
          </SettingsCard>

          <SettingsCard title="Audio" icon={SettingsIcons.Audio} accent="audio">
            <div className="settings-group">
              <p className="settings-group__label">Playback speed</p>
              <div className="settings-choice">
                <button
                  type="button"
                  className={`btn btn-small${playbackSpeed === 'slow' ? '' : ' btn-outline'}`}
                  onClick={() => setPlaybackSpeed('slow')}
                  aria-pressed={playbackSpeed === 'slow'}
                >
                  Slow
                </button>
                <button
                  type="button"
                  className={`btn btn-small${playbackSpeed === 'normal' ? '' : ' btn-outline'}`}
                  onClick={() => setPlaybackSpeed('normal')}
                  aria-pressed={playbackSpeed === 'normal'}
                >
                  Normal
                </button>
              </div>
              <p className="settings-group__hint">Control how quickly pronunciations are spoken.</p>
            </div>
          </SettingsCard>

          <SettingsCard title="OCR options" icon={SettingsIcons.OCR} accent="ocr">
            <div className="settings-group">
              <p className="settings-group__label">Text recognition</p>
              <button
                type="button"
                className={`settings-switch${autoCorrect ? ' settings-switch--active' : ''}`}
                onClick={() => setAutoCorrect((prev) => !prev)}
                aria-pressed={autoCorrect}
              >
                <span className="settings-switch__thumb" aria-hidden="true" />
                <span className="settings-switch__label">
                  {autoCorrect ? 'Auto-correction enabled' : 'Enable auto-correction'}
                </span>
              </button>
              <p className="settings-group__hint">
                Automatically fix common recognition mistakes when scanning captures.
              </p>
            </div>
          </SettingsCard>

          <SettingsCard title="Storage" icon={SettingsIcons.Storage} accent="storage">
            <div className="settings-storage">
              <div className="settings-storage__row">
                <div>
                  <p className="settings-storage__label">Texts & images</p>
                  <p className="settings-storage__hint">Stored locally for offline access</p>
                </div>
                <span className="settings-storage__value">2.3&nbsp;MB</span>
              </div>
              <div className="settings-storage__row">
                <div>
                  <p className="settings-storage__label">Vocabulary</p>
                  <p className="settings-storage__hint">Starred words and study data</p>
                </div>
                <span className="settings-storage__value">128&nbsp;KB</span>
              </div>
            </div>
            {clearConfirmation ? (
              <div className="settings-danger">
                <p className="settings-danger__text">
                  Are you sure you want to remove all Mila data from this device? This cannot be undone.
                </p>
                <div className="settings-danger__actions">
                  <button type="button" className="btn btn-danger btn-small" onClick={handleClearData}>
                    Yes, clear everything
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => setClearConfirmation(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-small settings-storage__clear"
                onClick={() => setClearConfirmation(true)}
              >
                Clear saved data
              </button>
            )}
          </SettingsCard>

          <SettingsCard title="About & feedback" icon={SettingsIcons.Feedback} accent="feedback">
            <div className="settings-about">
              <div>
                <p className="settings-about__title">Mila</p>
                <p className="settings-about__subtitle">Version 0.2.0 · Beta channel</p>
              </div>
              <div className="settings-about__actions">
                <button type="button" className="btn btn-outline btn-small">
                  Release notes
                </button>
                <button type="button" className="btn btn-small">
                  Send feedback
                </button>
              </div>
            </div>
          </SettingsCard>
        </section>
      </main>
    </>
  )
}

export default Settings
