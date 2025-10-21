import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CameraCapture from '../components/camera/CameraCapture'
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

  return (
    <div className="camera-screen">
      <CameraCapture
        onSubmit={handleCaptureSubmit}
        onError={(message) => setCaptureError(message)}
        disabled={isProcessingCapture}
        isProcessing={isProcessingCapture}
      />
    </div>
  )
}

export default Camera
