import { useCallback, useEffect, useMemo, useRef } from 'react'
import { NormalizedQuad } from '../../utils/imageProcessing'

type CapturePreviewProps = {
  imageUrl: string
  quad: NormalizedQuad
  onChange: (quad: NormalizedQuad) => void
  onConfirm: () => void
  onRetake: () => void
  isSubmitting: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function CapturePreview({ imageUrl, quad, onChange, onConfirm, onRetake, isSubmitting }: CapturePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeHandleRef = useRef<number | null>(null)
  const quadRef = useRef<NormalizedQuad>(quad)

  useEffect(() => {
    quadRef.current = quad
  }, [quad])

  const polygonPoints = useMemo(
    () => quad.map((point) => `${point.x * 100},${point.y * 100}`).join(' '),
    [quad],
  )

  const updateHandle = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = clamp((clientX - rect.left) / rect.width, 0.02, 0.98)
      const y = clamp((clientY - rect.top) / rect.height, 0.02, 0.98)
      const next: NormalizedQuad = quadRef.current.map((point, idx) =>
        idx === index ? { x, y } : point,
      ) as NormalizedQuad
      onChange(next)
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      activeHandleRef.current = index
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [],
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (activeHandleRef.current === null) return
    updateHandle(activeHandleRef.current, event.clientX, event.clientY)
  }, [updateHandle])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (activeHandleRef.current === null) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    activeHandleRef.current = null
  }, [])

  const handlePositions = useMemo(
    () =>
      quad.map((point) => ({
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
      })),
    [quad],
  )

  return (
    <div className="camera-preview">
      <div className="camera-preview__frame" ref={containerRef}>
        <img src={imageUrl} alt="Captured frame" className="camera-preview__image" />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <polygon points={polygonPoints} className="fill-primary/10 stroke-primary" strokeWidth={0.4} />
        </svg>
        {handlePositions.map((style, index) => (
          <button
            key={index}
            type="button"
            className="absolute w-5 h-5 -ml-2 -mt-2 rounded-full border border-white bg-primary text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            style={style}
            onPointerDown={handlePointerDown(index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            aria-label={`Adjust corner ${index + 1}`}
          >
            ●
          </button>
      ))}
      </div>
      <p className="camera-preview__hint">
        Drag the handles to frame the text. We will straighten and clean the capture before running OCR.
      </p>
      <div className="camera-preview__actions">
        <button className="btn btn-secondary" type="button" onClick={onRetake} disabled={isSubmitting}>
          Retake
        </button>
        <button className="btn bg-primary text-white hover:bg-primary/90" type="button" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? 'Processing…' : 'Use this capture'}
        </button>
      </div>
    </div>
  )
}

export default CapturePreview
