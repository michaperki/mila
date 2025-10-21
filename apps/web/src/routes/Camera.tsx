import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CameraCapture from '../components/camera/CameraCapture'
import ImagePicker from '../components/ImagePicker'
import { useTextStore } from '../state/useTextStore'
import { processImage } from '../services/ingest'

function Camera() {
  const navigate = useNavigate()
  const { texts, getTexts, saveText } = useTextStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [isProcessingCapture, setIsProcessingCapture] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState('Preparing capture…')
  const [showGallery, setShowGallery] = useState(false)

  useEffect(() => {
    const loadTexts = async () => {
      try {
        await getTexts()
        setLoadError(null)
      } catch (error) {
        console.error('Error loading texts:', error)
        setLoadError((error as Error).message || 'Failed to load texts')
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

  const statusMessage = isProcessingCapture
    ? processingStage
    : isOnline
    ? 'Camera ready'
    : 'Offline · queued uploads'

  const leftControl = (
    <button
      type="button"
      className="camera-controls__button"
      onClick={() => setShowGallery(true)}
      aria-label="Select photo"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v10.5m-18 0A2.25 2.25 0 005.25 18.75h13.5A2.25 2.25 0 0021 16.5m-18 0v1.125C3 18.66 3.84 19.5 4.875 19.5h14.25c1.035 0 1.875-.84 1.875-1.875V16.5m-9-1.125l3-3 4.5 4.5m-10.5-2.25l1.5 1.5"
        />
      </svg>
    </button>
  )

  const topStatus = (
    <div className="camera-top">
      <button type="button" className="camera-back" onClick={() => navigate(-1)}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>
      <span className={`camera-status${!isOnline ? ' camera-status--error' : ''}`}>{statusMessage}</span>
      <span className="camera-top-spacer" />
    </div>
  )

  return (
    <div className="camera-screen">
      <CameraCapture
        onSubmit={handleCaptureSubmit}
        onError={(message) => setCaptureError(message)}
        disabled={isProcessingCapture}
        isProcessing={isProcessingCapture}
        leftControl={leftControl}
        rightControl={null}
        topStatus={topStatus}
      />

      {isProcessingCapture && (
        <div className="camera-progress" role="status">
          <p>{processingStage}</p>
          <div className="camera-progress__bar">
            <div style={{ width: `${Math.min(processingProgress, 100)}%` }} />
          </div>
        </div>
      )}

      {(captureError || loadError) && (
        <div className="camera-toast camera-toast--error" role="alert">
          <span>{captureError || loadError}</span>
          <button
            type="button"
            onClick={() => {
              setCaptureError(null)
              setLoadError(null)
              void getTexts()
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showGallery && (
        <div className="camera-gallery" onClick={() => setShowGallery(false)}>
          <div className="camera-gallery__sheet" onClick={(event) => event.stopPropagation()}>
            <button className="camera-gallery__close" type="button" onClick={() => setShowGallery(false)}>
              Close
            </button>
            <ImagePicker />
          </div>
        </div>
      )}
    </div>
  )
}

export default Camera
