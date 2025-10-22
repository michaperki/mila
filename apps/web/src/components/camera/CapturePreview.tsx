import { useCallback, useEffect, useMemo, useRef } from 'react'
import { NormalizedQuad } from '../../utils/imageProcessing'

type CapturePreviewProps = {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  quad: NormalizedQuad
  onChange: (quad: NormalizedQuad) => void
  onConfirm: () => void
  onRetake: () => void
  isSubmitting: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function CapturePreview({
  imageUrl,
  imageWidth,
  imageHeight,
  quad,
  onChange,
  onConfirm,
  onRetake,
  isSubmitting,
}: CapturePreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const activeHandleRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const quadRef = useRef<NormalizedQuad>(quad)

  useEffect(() => {
    quadRef.current = quad
  }, [quad])

  const updateHandle = useCallback(
    (index: number, x: number, y: number) => {
      const next: NormalizedQuad = quadRef.current.map((point, idx) =>
        idx === index ? { x, y } : point,
      ) as NormalizedQuad
      onChange(next)
    },
    [onChange],
  )

  const getNormalizedFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg || imageWidth === 0 || imageHeight === 0) {
        return null
      }
      const point = svg.createSVGPoint()
      point.x = clientX
      point.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return null
      const inverted = ctm.inverse()
      const svgPoint = point.matrixTransform(inverted as DOMMatrix)
      const x = clamp(svgPoint.x / imageWidth, 0.02, 0.98)
      const y = clamp(svgPoint.y / imageHeight, 0.02, 0.98)
      return { x, y }
    },
    [imageWidth, imageHeight],
  )

  const handlePointerDown = useCallback(
    (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()
      activeHandleRef.current = index
      pointerIdRef.current = event.pointerId
      svgRef.current?.setPointerCapture(event.pointerId)
      const coords = getNormalizedFromClient(event.clientX, event.clientY)
      if (!coords) return
      updateHandle(index, coords.x, coords.y)
    },
    [getNormalizedFromClient, updateHandle],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      if (activeHandleRef.current === null) return
      event.preventDefault()
      const coords = getNormalizedFromClient(event.clientX, event.clientY)
      if (!coords) return
      updateHandle(activeHandleRef.current, coords.x, coords.y)
    },
    [getNormalizedFromClient, updateHandle],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (pointerIdRef.current !== event.pointerId) return
      svgRef.current?.releasePointerCapture(event.pointerId)
      activeHandleRef.current = null
      pointerIdRef.current = null
    },
    [],
  )

  const safeWidth = imageWidth || 1
  const safeHeight = imageHeight || 1

  const absolutePoints = useMemo(
    () =>
      quad.map((point) => ({
        x: point.x * safeWidth,
        y: point.y * safeHeight,
      })),
    [quad, safeWidth, safeHeight],
  )

  const polygonPoints = useMemo(
    () => absolutePoints.map((point) => `${point.x},${point.y}`).join(' '),
    [absolutePoints],
  )

  const handleRadius = useMemo(() => {
    const base = Math.max(safeWidth, safeHeight) * 0.02
    return Math.max(18, Math.min(base, 48))
  }, [safeWidth, safeHeight])

  const strokeWidth = useMemo(() => Math.max(safeWidth, safeHeight) * 0.004, [safeWidth, safeHeight])

  const frameStyle = imageWidth > 0 && imageHeight > 0 ? { aspectRatio: imageWidth / imageHeight } : undefined

  return (
    <div className="camera-preview">
      <div className="camera-preview__frame" style={frameStyle}>
        <svg
          ref={svgRef}
          className="camera-preview__canvas"
          viewBox={`0 0 ${safeWidth} ${safeHeight}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: '100%', height: 'auto', maxHeight: '100%', touchAction: 'none' }}
        >
          <image href={imageUrl} width={safeWidth} height={safeHeight} preserveAspectRatio="xMidYMid meet" />
          <polygon
            points={polygonPoints}
            className="camera-preview__polygon"
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {absolutePoints.map((point, index) => (
            <circle
              key={index}
              className="camera-preview__handle"
              cx={point.x}
              cy={point.y}
              r={handleRadius}
              onPointerDown={handlePointerDown(index)}
              aria-label={`Adjust corner ${index + 1}`}
            />
          ))}
        </svg>
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
