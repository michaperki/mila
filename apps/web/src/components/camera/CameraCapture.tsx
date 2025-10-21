import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import CapturePreview from './CapturePreview'
import {
  NormalizedQuad,
  detectTextQuad,
  extractQuadToCanvas,
  canvasToBlob,
} from '../../utils/imageProcessing'

type CameraCaptureProps = {
  onSubmit: (blob: Blob) => Promise<void>
  disabled?: boolean
  onError?: (message: string) => void
  isProcessing?: boolean
  leftControl?: ReactNode
  rightControl?: ReactNode
  topStatus?: ReactNode
  showControls?: boolean
}

type CapturedFrame = {
  width: number
  height: number
  imageData: ImageData
  previewUrl: string
}

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop())
}

const createImageData = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas context unavailable')
  }
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function CameraCapture({ onSubmit, disabled, onError, isProcessing, leftControl, rightControl, topStatus, showControls = true }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [initialising, setInitialising] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<CapturedFrame | null>(null)
  const [quad, setQuad] = useState<NormalizedQuad | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const resetState = useCallback(
    (resume = true) => {
      setCaptured(null)
      setQuad(null)
      setSubmitting(false)
      setError(null)
      if (resume && videoRef.current && streamRef.current) {
        void videoRef.current.play().catch((playError) => {
          console.warn('Unable to resume camera', playError)
        })
      }
    },
    [],
  )

  useEffect(() => {
    const startStream = async () => {
      try {
        setInitialising(true)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setError(null)
      } catch (err) {
        console.error('Camera access error', err)
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Enable permissions to capture instantly.'
            : 'Could not open the camera. Try another browser or device.'
        setError(message)
        onError?.(message)
      } finally {
        setInitialising(false)
      }
    }

    void startStream()

    return () => {
      stopStream(streamRef.current)
    }
  }, [onError])

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      setError('Camera is still warming up. Try again in a second.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      setError('Unable to capture frame.')
      return
    }

    context.drawImage(video, 0, 0, width, height)
    const imageData = createImageData(canvas)
    const previewUrl = canvas.toDataURL('image/png')

    setCaptured({ width, height, imageData, previewUrl })
    setQuad(detectTextQuad(imageData))

    video.pause()
  }, [])

  const handleRetake = useCallback(() => {
    resetState()
  }, [resetState])

  const handleConfirm = useCallback(async () => {
    if (!captured || !quad) return
    try {
      setSubmitting(true)
      const processedCanvas = extractQuadToCanvas(captured.imageData, quad)
      const blob = await canvasToBlob(processedCanvas, 'image/png', 0.95)
      await onSubmit(blob)
      resetState(false)
    } catch (err) {
      console.error('Capture processing failed', err)
      const message = 'We could not process that capture. Try adjusting the crop or retaking the photo.'
      setError(message)
      onError?.(message)
      resetState()
    } finally {
      setSubmitting(false)
    }
  }, [captured, onSubmit, quad, onError, resetState])

  const isBusy = submitting || Boolean(isProcessing)

  return (
    <div className="camera-capture">
      <div className="camera-viewfinder">
        {captured ? (
          <CapturePreview
            imageUrl={captured.previewUrl}
            quad={quad ?? detectTextQuad(captured.imageData)}
            onChange={setQuad}
            onConfirm={handleConfirm}
            onRetake={handleRetake}
            isSubmitting={isBusy}
          />
        ) : (
          <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
        )}
      </div>

      {!captured && showControls && (
        <div className="camera-overlay">
          <div className="camera-overlay__top">
            {error ? (
              <span className="camera-status camera-status--error">{error}</span>
            ) : initialising ? (
              <span className="camera-status">Starting camera…</span>
            ) : (
              topStatus
            )}
          </div>
          <div className="camera-overlay__bottom">
            <div className="camera-control">{leftControl}</div>
            <button
              type="button"
              className="camera-shutter"
              onClick={handleCapture}
              disabled={disabled || initialising || Boolean(error)}
              aria-label="Capture"
            />
            <div className="camera-control">{rightControl}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CameraCapture
