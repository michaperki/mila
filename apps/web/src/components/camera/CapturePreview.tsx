import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const imageRef = useRef<HTMLImageElement | null>(null)
  const activeHandleRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const quadRef = useRef<NormalizedQuad>(quad)
  const layoutRef = useRef({ offsetX: 0, offsetY: 0, width: 1, height: 1 })
  const [, forceLayoutTick] = useState(0)

  useEffect(() => {
    quadRef.current = quad
  }, [quad])

  const polygonPoints = useMemo(
    () => quad.map((point) => `${point.x * 100},${point.y * 100}`).join(' '),
    [quad],
  )

  const measureLayout = useCallback(() => {
    const containerRect = containerRef.current?.getBoundingClientRect()
    const imageRect = imageRef.current?.getBoundingClientRect()
    if (!containerRect || !imageRect) return
    layoutRef.current = {
      offsetX: imageRect.left - containerRect.left,
      offsetY: imageRect.top - containerRect.top,
      width: imageRect.width || 1,
      height: imageRect.height || 1,
    }
    forceLayoutTick((tick) => tick + 1)
  }, [])

  useEffect(() => {
    measureLayout()
  }, [imageUrl, measureLayout])

  useEffect(() => {
    const handleResize = () => {
      window.requestAnimationFrame(measureLayout)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [measureLayout])

  const updateHandle = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const rect = imageRef.current?.getBoundingClientRect()
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

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (activeHandleRef.current === null || pointerIdRef.current !== event.pointerId) return
      updateHandle(activeHandleRef.current, event.clientX, event.clientY)
    },
    [updateHandle],
  )

  const handleWindowPointerUp = useCallback(
    (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return
      activeHandleRef.current = null
      pointerIdRef.current = null
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerUp)
    },
    [handleWindowPointerMove],
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerUp)
    }
  }, [handleWindowPointerMove, handleWindowPointerUp])

  const handlePointerDown = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      activeHandleRef.current = index
      pointerIdRef.current = event.pointerId
      updateHandle(index, event.clientX, event.clientY)
      window.addEventListener('pointermove', handleWindowPointerMove, { passive: false })
      window.addEventListener('pointerup', handleWindowPointerUp, { passive: false })
      window.addEventListener('pointercancel', handleWindowPointerUp, { passive: false })
    },
    [handleWindowPointerMove, handleWindowPointerUp, updateHandle],
  )

  const handlePositions = useMemo(() => {
    const { offsetX, offsetY, width, height } = layoutRef.current
    return quad.map((point) => ({
      left: `${offsetX + point.x * width}px`,
      top: `${offsetY + point.y * height}px`,
      transform: 'translate(-50%, -50%)',
      cursor: 'grab',
      touchAction: 'none' as const,
    }))
  }, [quad])

  return (
    <div className="camera-preview">
      <div className="camera-preview__frame" ref={containerRef}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Captured frame"
          className="camera-preview__image"
          onLoad={() => window.requestAnimationFrame(measureLayout)}
        />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <polygon points={polygonPoints} className="fill-primary/10 stroke-primary" strokeWidth={0.4} />
        </svg>
        {handlePositions.map((style, index) => (
          <button
            key={index}
            type="button"
            className="absolute w-5 h-5 rounded-full border border-white bg-primary text-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            style={style}
            onPointerDown={handlePointerDown(index)}
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
