import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import SettingsCard, { SettingsIcons } from '../components/SettingsCard'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'
import {
  selectAuthStatus,
  selectCaptureAllowance,
  selectRemainingCapturesLabel,
  selectTier,
  useAuthStore,
} from '../state/useAuthStore'
import { useTextStore } from '../state/useTextStore'
import { useVocabStore } from '../state/useVocabStore'
import { useProfileStore, DEFAULT_DISPLAY_NAME } from '../state/useProfileStore'

const normalizeNameForComparison = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

function Settings() {
  const [theme, setTheme] = useState('light')
  const [playbackSpeed, setPlaybackSpeed] = useState('normal')
  const [direction, setDirection] = useState('he-en')
  const [autoCorrect, setAutoCorrect] = useState(false)
  const [clearConfirmation, setClearConfirmation] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  const tier = useAuthStore(selectTier)
  const authStatus = useAuthStore(selectAuthStatus)
  const allowance = useAuthStore(selectCaptureAllowance)
  const remainingLabel = useAuthStore(selectRemainingCapturesLabel)
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const refreshUsage = useAuthStore((state) => state.refreshUsage)
  const signUp = useAuthStore((state) => state.signUp)
  const signIn = useAuthStore((state) => state.signIn)
  const signOut = useAuthStore((state) => state.signOut)
  const upgradeTier = useAuthStore((state) => state.upgradeTier)
 const resetUsage = useAuthStore((state) => state.resetUsage)
 const isMockPayments = useAuthStore((state) => state.isMockPayments)

  const {
    syncing: textSyncing,
    lastSyncedAt: textSyncedAt,
    lastSyncedCount: textSyncedCount,
    syncError: textSyncError,
    syncLocalToRemote: syncTexts,
  } = useTextStore((state) => ({
    syncing: state.syncing,
    lastSyncedAt: state.lastSyncedAt,
    lastSyncedCount: state.lastSyncedCount,
    syncError: state.syncError,
    syncLocalToRemote: state.syncLocalToRemote,
  }))

  const {
    syncing: vocabSyncing,
    lastSyncedAt: vocabSyncedAt,
    lastSyncedCount: vocabSyncedCount,
    syncError: vocabSyncError,
    syncLocalToRemote: syncVocab,
  } = useVocabStore((state) => ({
    syncing: state.syncing,
    lastSyncedAt: state.lastSyncedAt,
    lastSyncedCount: state.lastSyncedCount,
    syncError: state.syncError,
    syncLocalToRemote: state.syncLocalToRemote,
  }))

  const syncBusy = textSyncing || vocabSyncing
  const lastSyncedAt = useMemo(() => {
    const timestamps = [textSyncedAt ?? 0, vocabSyncedAt ?? 0].filter(Boolean)
    if (timestamps.length === 0) return null
    return Math.max(...timestamps)
  }, [textSyncedAt, vocabSyncedAt])
  const totalSynced = (textSyncedCount ?? 0) + (vocabSyncedCount ?? 0)
  const syncError = textSyncError || vocabSyncError

  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const profileName = useProfileStore((state) => state.displayName)
  const setProfileName = useProfileStore((state) => state.setDisplayName)
  const [nameDraft, setNameDraft] = useState(profileName === DEFAULT_DISPLAY_NAME ? '' : profileName)
  const [nameSaved, setNameSaved] = useState(false)
  const nameSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (user && token) {
      void refreshUsage()
    }
  }, [refreshUsage, token, user])

  useEffect(() => {
    setNameDraft(profileName === DEFAULT_DISPLAY_NAME ? '' : profileName)
  }, [profileName])

  useEffect(
    () => () => {
      if (nameSaveTimeout.current) {
        clearTimeout(nameSaveTimeout.current)
      }
    },
    [],
  )

  const normalizedCurrentName = profileName === DEFAULT_DISPLAY_NAME ? '' : profileName
  const comparableDraftName = normalizeNameForComparison(nameDraft)
  const comparableCurrentName = normalizeNameForComparison(normalizedCurrentName)
  const isNameChanged = comparableDraftName !== comparableCurrentName

  const handleNameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isNameChanged) return
    setProfileName(nameDraft)
    setNameSaved(true)
    if (nameSaveTimeout.current) {
      clearTimeout(nameSaveTimeout.current)
    }
    nameSaveTimeout.current = setTimeout(() => setNameSaved(false), 1800)
  }

  const handleNameReset = () => {
    setProfileName('')
    setNameDraft('')
    setNameSaved(true)
    if (nameSaveTimeout.current) {
      clearTimeout(nameSaveTimeout.current)
    }
    nameSaveTimeout.current = setTimeout(() => setNameSaved(false), 1800)
  }

  const handleClearData = () => {
    try {
      setTimeout(() => {
        setClearSuccess(true)
        setClearConfirmation(false)
        setTimeout(() => setClearSuccess(false), 2500)
      }, 300)
    } catch (error) {
      setClearError((error as Error).message || 'Failed to clear data. Please try again.')
    }
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthMessage(null)
    setAuthPending(true)

    try {
      if (authMode === 'signup') {
        await signUp(email, password)
        setAuthMessage({ type: 'success', text: 'Account created. You are now signed in!' })
      } else {
        await signIn(email, password)
        setAuthMessage({ type: 'success', text: 'Welcome back!' })
      }
      setEmail('')
      setPassword('')
    } catch (error) {
      setAuthMessage({ type: 'error', text: (error as Error).message })
    } finally {
      setAuthPending(false)
    }
  }

  const handleSignOut = () => {
    signOut()
    setAuthMessage({ type: 'success', text: 'Signed out.' })
  }

  const handleUpgrade = async () => {
    setAuthMessage(null)
    try {
      await upgradeTier()
      setAuthMessage({ type: 'success', text: isMockPayments ? 'Marked as premium (mock).' : 'Account upgraded!' })
    } catch (error) {
      setAuthMessage({ type: 'error', text: (error as Error).message })
    }
  }

  const handleResetUsage = async () => {
    await resetUsage()
    setAuthMessage({ type: 'success', text: 'Usage counters reset for this device.' })
    void refreshUsage()
  }

  const usageSummary = useMemo(() => {
    if (!user) {
      return 'Try one capture as a guest. Create a free account to keep scanning.'
    }
    if (allowance.limit === null) {
      return 'Unlimited captures on the premium plan.'
    }
    const remaining = allowance.remaining ?? 0
    return `${remaining} of ${allowance.limit} captures left this period.`
  }, [allowance.limit, allowance.remaining, user])

  const formatSyncLabel = useMemo(() => {
    if (!user) {
      return 'Sign in to sync offline captures and saved vocabulary.'
    }
    if (syncBusy) {
      return 'Syncing offline captures and vocabulary…'
    }
    if (syncError) {
      return `Sync issue: ${syncError}`
    }
    if (!lastSyncedAt) {
      return 'Offline items will sync automatically after your first capture.'
    }
    const timestamp = new Date(lastSyncedAt).toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    })
    return `${totalSynced} item${totalSynced === 1 ? '' : 's'} synced · ${timestamp}`
  }, [user, syncBusy, syncError, lastSyncedAt, totalSynced])

  const handleManualSync = async () => {
    if (!user || syncBusy) return
    setAuthMessage(null)
    try {
      await Promise.all([syncTexts(), syncVocab()])
      setAuthMessage({ type: 'success', text: 'Offline items synced.' })
    } catch (error) {
      setAuthMessage({ type: 'error', text: (error as Error).message || 'Manual sync failed.' })
    }
  }

  const isAuthLoading = authPending || authStatus === 'authenticating'

  return (
    <>
      <TopNavBar current="settings" title="Settings" subtitle="Preferences" />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 space-y-8 sm:px-6">
        <section className="settings-hero">
          <div className="settings-hero__intro">
            <span className="settings-hero__eyebrow">Personalise Mila</span>
            <h1 className="settings-hero__title">Settings</h1>
            <p className="settings-hero__subtitle">
              Manage your account, tailor the interface, and keep your capture data under control.
            </p>
          </div>
          <div className="settings-hero__metrics">
            <div className="settings-hero__metric">
              <span>Account</span>
              <strong>{tier === 'guest' ? 'Guest trial' : tier === 'premium' ? 'Premium' : 'Free plan'}</strong>
              <small>{usageSummary}</small>
            </div>
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
          </div>
        </section>

        {clearSuccess && <div className="alert alert--success">All local Mila data cleared.</div>}

        <ErrorMessage error={clearError} onDismiss={() => setClearError(null)} />

        <section className="settings-grid">
          <div id="account">
            <SettingsCard title="Account" icon={SettingsIcons.Account} accent="account">
              {authMessage && (
                <div
                  className={`settings-account__alert settings-account__alert--${authMessage.type === 'success' ? 'success' : 'error'}`}
                  role="status"
                >
                  {authMessage.text}
                </div>
              )}

              {user ? (
                <div className="settings-account">
                  <div className="settings-account__summary">
                    <div>
                      <p className="settings-account__email">{user.email}</p>
                      <p className="settings-account__subtitle">
                        Member since {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`settings-account__tier settings-account__tier--${user.tier}`}>
                      {user.tier === 'premium' ? 'Premium' : 'Free tier'}
                    </span>
                  </div>
                  <p className="settings-account__usage">
                    {allowance.limit === null
                      ? 'Unlimited captures on this plan.'
                      : `${allowance.remaining ?? 0} of ${allowance.limit} captures left this period (${remainingLabel}).`}
                  </p>
                  <div className="settings-account__sync">
                    <div>
                      <p className="settings-account__sync-label">Offline sync</p>
                      <p className="settings-account__sync-status">{formatSyncLabel}</p>
                    </div>
                    <div className="settings-account__sync-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={handleManualSync}
                        disabled={syncBusy}
                      >
                        {syncBusy ? 'Syncing…' : 'Sync offline data'}
                      </button>
                    </div>
                  </div>
                  <div className="settings-account__actions">
                    {user.tier === 'free' && (
                      <button type="button" className="btn btn-small" onClick={handleUpgrade}>
                        {isMockPayments ? 'Upgrade (mock)' : 'Upgrade plan'}
                      </button>
                    )}
                    <button type="button" className="btn btn-outline btn-small" onClick={handleSignOut}>
                      Sign out
                    </button>
                    {import.meta.env.DEV && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={handleResetUsage}>
                        Reset quota
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <form className="settings-account__form" onSubmit={handleAuthSubmit}>
                  <div className="settings-account__tabs">
                    <button
                      type="button"
                      className={`settings-account__tab${authMode === 'signup' ? ' settings-account__tab--active' : ''}`}
                      onClick={() => setAuthMode('signup')}
                      aria-pressed={authMode === 'signup'}
                    >
                      Create account
                    </button>
                    <button
                      type="button"
                      className={`settings-account__tab${authMode === 'login' ? ' settings-account__tab--active' : ''}`}
                      onClick={() => setAuthMode('login')}
                      aria-pressed={authMode === 'login'}
                    >
                      Sign in
                    </button>
                  </div>

                  <label className="settings-account__label">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </label>

                  <label className="settings-account__label">
                    Password
                    <input
                      type="password"
                      minLength={4}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      placeholder="Choose a password"
                    />
                  </label>

                  <button type="submit" className="btn btn-small" disabled={isAuthLoading}>
                    {isAuthLoading ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
                  </button>
                </form>
              )}

              <form className="settings-account__name" onSubmit={handleNameSubmit}>
                <label className="settings-account__label" htmlFor="preferred-name">
                  Preferred name
                  <input
                    id="preferred-name"
                    type="text"
                    autoComplete="given-name"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder="Your first name"
                  />
                </label>
                <div className="settings-account__name-actions">
                  <button type="submit" className="btn btn-outline btn-small" disabled={!isNameChanged}>
                    Save name
                  </button>
                  {(profileName !== DEFAULT_DISPLAY_NAME || nameDraft) && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={handleNameReset}>
                      Reset
                    </button>
                  )}
                </div>
                <p className="settings-account__name-hint">Used for greetings on the Home page.</p>
                {nameSaved && <p className="settings-account__name-status">Name updated.</p>}
              </form>
            </SettingsCard>
          </div>

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
                <span className="settings-storage__value">—</span>
              </div>
              <div className="settings-storage__row">
                <div>
                  <p className="settings-storage__label">Vocabulary</p>
                  <p className="settings-storage__hint">Starred words and study data</p>
                </div>
                <span className="settings-storage__value">—</span>
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
