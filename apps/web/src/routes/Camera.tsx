import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ImagePicker from '../components/ImagePicker'
import InstallPrompt from '../components/InstallPrompt'
import TranslationSettings from '../components/TranslationSettings'
import TextPreviewCard from '../components/TextPreviewCard'
import ErrorMessage from '../components/ErrorMessage'
import TopNavBar from '../components/TopNavBar'
import CameraCapture from '../components/camera/CameraCapture'
import { useTextStore } from '../state/useTextStore'
import { TextDoc } from '../types'
import { processImage } from '../services/ingest'

function Camera() {
  const navigate = useNavigate()
  const { texts, getTexts, saveText } = useTextStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showSettings, setShowSettings] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [isProcessingCapture, setIsProcessingCapture] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState('Preparing capture…')

  useEffect(() => {
    const loadTexts = async () => {
      try {
        await getTexts()
        setLoadError(null)
      } catch (error) {
        console.error('Error loading texts:', error)
        setLoadError((error as Error).message || 'Failed to load texts')
      } finally {
        setIsLoading(false)
      }
    }

    loadTexts()

    // Listen for online/offline events
    const handleOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnlineStatus)
    window.addEventListener('offline', handleOnlineStatus)

    return () => {
      window.removeEventListener('online', handleOnlineStatus)
      window.removeEventListener('offline', handleOnlineStatus)
    }
  }, [getTexts])

  const toggleSettings = () => {
    setShowSettings(!showSettings)
  }

  const handleCaptureSubmit = async (blob: Blob) => {
    try {
      setCaptureError(null)
      setIsProcessingCapture(true)
      setProcessingStage('Normalising capture…')
      setProcessingProgress(20)

      const file = new File([blob], `mila-capture-${Date.now()}.png`, { type: blob.type || 'image/png' })
      const textDoc = await processImage(file, (progress) => {
        const percent = Math.round(progress * 80)
        setProcessingProgress(20 + percent)
        setProcessingStage(progress < 0.7 ? 'Running OCR…' : 'Finalising capture…')
      })

      setProcessingStage('Saving to your library…')
      await saveText(textDoc)
      setProcessingProgress(100)
      navigate(`/read/${textDoc.id}`)
    } catch (error) {
      console.error('Instant capture failed', error)
      const message = (error as Error).message || 'Capture failed. Try again.'
      setCaptureError(message)
    } finally {
      setIsProcessingCapture(false)
      setProcessingProgress(0)
    }
  }

  return (
    <>
      <TopNavBar current="camera" title="Camera">
        <button className="btn btn-icon" onClick={toggleSettings} aria-label="Open settings">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </TopNavBar>

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <TranslationSettings onClose={() => setShowSettings(false)} />
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-24 pt-8 sm:px-6">
        <section className="capture-hero">
          <div>
            <h1 className="capture-hero__title">Instant capture</h1>
            <p className="capture-hero__subtitle">
              Launch the live camera, auto-detect Hebrew text, and drop it straight into Mila to read or review.
            </p>
          </div>
          <span className="capture-hero__status">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="7" />
              <path d="M8 4v4l2 2" />
            </svg>
            Ready when you are
          </span>
        </section>

        <InstallPrompt />

        {!isOnline && (
          <div className="capture-offline">
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>You're currently offline. Some features may be limited.</span>
          </div>
        )}

        <section className="capture-shell">
          <div className="capture-shell__title">Instant camera</div>
          <CameraCapture
            onSubmit={handleCaptureSubmit}
            onError={(message) => setCaptureError(message)}
            disabled={isProcessingCapture}
            isProcessing={isProcessingCapture}
          />
          {isProcessingCapture && (
            <div className="capture-progress">
              <p className="text-sm font-medium text-primary">{processingStage}</p>
              <div className="capture-progress__bar">
                <div
                  className="capture-progress__bar-fill"
                  style={{ width: `${Math.min(processingProgress, 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <ErrorMessage error={captureError} onDismiss={() => setCaptureError(null)} />

        <ErrorMessage
          error={loadError}
          onRetry={() => {
            setIsLoading(true)
            getTexts().then(() => {
              setLoadError(null)
              setIsLoading(false)
            }).catch(err => {
              setLoadError((err as Error).message)
              setIsLoading(false)
            })
          }}
          onDismiss={() => setLoadError(null)}
        />

        <div className="source-picker">
          <h2 className="source-picker__title">Choose image source</h2>
          <ImagePicker />
        </div>

        <div className="capture-history">
          <h2 className="capture-history__title">Recent captures</h2>
          {isLoading ? (
            <div className="p-4 text-center">
              <div className="mb-2 text-primary">Loading texts...</div>
              <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-1 bg-primary animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          ) : texts.length > 0 ? (
            <ul className="space-y-3">
              {texts.map((text: TextDoc) => (
                <TextPreviewCard key={text.id} text={text} />
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center">
              <p className="mb-2">No texts yet.</p>
              <p className="text-sm text-gray-500">
                Take a photo or upload an image to get started.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default Camera
