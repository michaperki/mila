import { useCallback, useEffect, useRef, useState } from 'react'
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

function CameraCapture({ onSubmit, disabled, onError, isProcessing }: CameraCaptureProps) {
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
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-200 bg-black">
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
          <>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
              <button
                type="button"
                className="h-16 w-16 rounded-full border-4 border-white bg-white/80 transition hover:bg-white disabled:opacity-60"
                onClick={handleCapture}
                disabled={disabled || initialising || Boolean(error)}
                aria-label="Capture photo"
              />
            </div>
            <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between text-xs text-white/80">
              <span>{initialising ? 'Starting camera…' : 'Align text within frame'}</span>
              <span>{error ? 'No camera' : 'Auto-detect enabled'}</span>
            </div>
          </>
        )}
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!captured && (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
          <span>Need a gallery file? Use the uploader below.</span>
          <span>{initialising ? 'Preparing camera…' : 'Tap the shutter when ready.'}</span>
        </div>
      )}
    </div>
  )
}

export default CameraCapture
