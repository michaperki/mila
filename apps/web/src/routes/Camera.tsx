import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ImagePicker from '../components/ImagePicker'
import TranslationSettings from '../components/TranslationSettings'
import ErrorMessage from '../components/ErrorMessage'
import CameraCapture from '../components/camera/CameraCapture'
import { useTextStore } from '../state/useTextStore'
import { TextDoc } from '../types'
import { processImage } from '../services/ingest'

function Camera() {
  const navigate = useNavigate()
  const { texts, getTexts, saveText } = useTextStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
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
      <div className="camera-screen">
        <CameraCapture
          onSubmit={handleCaptureSubmit}
          onError={(message) => setCaptureError(message)}
          disabled={isProcessingCapture}
          isProcessing={isProcessingCapture}
        />

        <div className="camera-overlay">
          {!isOnline && (
            <div className="camera-offline" role="status">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Offline mode · uploads queued</span>
            </div>
          )}

          {isProcessingCapture && (
            <div className="camera-progress" role="status">
              <p>{processingStage}</p>
              <div className="camera-progress__bar">
                <div style={{ width: `${Math.min(processingProgress, 100)}%` }} />
              </div>
            </div>
          )}

          <div className="camera-actions">
            <button className="camera-thumb" aria-label="Upload from gallery">
              <ImagePicker minimal />
            </button>
            <button
              className="camera-shutter"
              onClick={() => {/* placeholder - actual capture handled inside component */}}
              aria-label="Capture"
              disabled={isProcessingCapture}
            />
            <button
              className="camera-library"
              onClick={() => {
                if (texts.length > 0) navigate(`/read/${texts[0].id}`)
              }}
              aria-label="Open last capture"
              disabled={texts.length === 0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h11.25M8.25 12h11.25M8.25 17.25h11.25M3 6.75h.008v.008H3V6.75zM3 12h.008v.008H3V12zm0 5.25h.008v.008H3v-.008z"
                />
              </svg>
            </button>
          </div>

          <ErrorMessage error={captureError} onDismiss={() => setCaptureError(null)} />
          <ErrorMessage
            error={loadError}
            onRetry={() => {
              setIsLoading(true)
              getTexts()
                .then(() => {
                  setLoadError(null)
                  setIsLoading(false)
                })
                .catch((err) => {
                  setLoadError((err as Error).message)
                  setIsLoading(false)
                })
            }}
            onDismiss={() => setLoadError(null)}
          />
        </div>
      </div>
    </>
  )
}

export default Camera
