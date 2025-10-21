export type NormalizedPoint = { x: number; y: number }
export type NormalizedQuad = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const fallbackQuad: NormalizedQuad = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
]

const computeLuma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

export const detectTextQuad = (imageData: ImageData): NormalizedQuad => {
  const { data, width, height } = imageData
  const totalPixels = width * height

  let totalLuma = 0
  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4
    totalLuma += computeLuma(data[offset], data[offset + 1], data[offset + 2])
  }
  const averageLuma = totalLuma / totalPixels
  const threshold = averageLuma - 15

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let hits = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const luma = computeLuma(data[offset], data[offset + 1], data[offset + 2])
      if (luma < threshold) {
        hits++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (hits < totalPixels * 0.002) {
    return fallbackQuad
  }

  const normalised = (x: number, y: number): NormalizedPoint => ({
    x: clamp(x / width, 0.02, 0.98),
    y: clamp(y / height, 0.02, 0.98),
  })

  return [
    normalised(minX, minY),
    normalised(maxX, minY),
    normalised(maxX, maxY),
    normalised(minX, maxY),
  ]
}

type Point = { x: number; y: number }

const solveHomography = (source: Point[], target: Point[]) => {
  const matrix = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const vector = new Array(8).fill(0)

  for (let i = 0; i < 4; i++) {
    const xs = source[i].x
    const ys = source[i].y
    const xd = target[i].x
    const yd = target[i].y
    const row = i * 2

    matrix[row][0] = xs
    matrix[row][1] = ys
    matrix[row][2] = 1
    matrix[row][3] = 0
    matrix[row][4] = 0
    matrix[row][5] = 0
    matrix[row][6] = -xd * xs
    matrix[row][7] = -xd * ys
    vector[row] = xd

    matrix[row + 1][0] = 0
    matrix[row + 1][1] = 0
    matrix[row + 1][2] = 0
    matrix[row + 1][3] = xs
    matrix[row + 1][4] = ys
    matrix[row + 1][5] = 1
    matrix[row + 1][6] = -yd * xs
    matrix[row + 1][7] = -yd * ys
    vector[row + 1] = yd
  }

  for (let i = 0; i < 8; i++) {
    let pivotRow = i
    for (let j = i + 1; j < 8; j++) {
      if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivotRow][i])) {
        pivotRow = j
      }
    }

    if (pivotRow !== i) {
      ;[matrix[i], matrix[pivotRow]] = [matrix[pivotRow], matrix[i]]
      ;[vector[i], vector[pivotRow]] = [vector[pivotRow], vector[i]]
    }

    const pivot = matrix[i][i] || 1e-9
    for (let k = i; k < 8; k++) {
      matrix[i][k] /= pivot
    }
    vector[i] /= pivot

    for (let j = 0; j < 8; j++) {
      if (j === i) continue
      const factor = matrix[j][i]
      if (factor === 0) continue
      for (let k = i; k < 8; k++) {
        matrix[j][k] -= factor * matrix[i][k]
      }
      vector[j] -= factor * vector[i]
    }
  }

  return [
    vector[0],
    vector[1],
    vector[2],
    vector[3],
    vector[4],
    vector[5],
    vector[6],
    vector[7],
    1,
  ]
}

const applyHomography = (matrix: number[], x: number, y: number) => {
  const denominator = matrix[6] * x + matrix[7] * y + 1
  const mappedX = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator
  const mappedY = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator
  return { x: mappedX, y: mappedY }
}

export const extractQuadToCanvas = (imageData: ImageData, quad: NormalizedQuad): HTMLCanvasElement => {
  const { width, height, data } = imageData
  const points: Point[] = quad.map((point) => ({
    x: clamp(point.x, 0, 1) * width,
    y: clamp(point.y, 0, 1) * height,
  }))

  const topWidth = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
  const bottomWidth = Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y)
  const leftHeight = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y)
  const rightHeight = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y)

  const destWidth = Math.max(1, Math.round(Math.max(topWidth, bottomWidth)))
  const destHeight = Math.max(1, Math.round(Math.max(leftHeight, rightHeight)))

  const destination = document.createElement('canvas')
  destination.width = destWidth
  destination.height = destHeight

  const destCtx = destination.getContext('2d', { willReadFrequently: true })
  if (!destCtx) return destination

  const destData = new Uint8ClampedArray(destWidth * destHeight * 4)
  const grayscale = new Float32Array(destWidth * destHeight)

  const destPoints: Point[] = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ]

  const homography = solveHomography(destPoints, points)

  let sum = 0
  let pixelIndex = 0

  for (let y = 0; y < destHeight; y++) {
    for (let x = 0; x < destWidth; x++) {
      const { x: mappedX, y: mappedY } = applyHomography(homography, x + 0.5, y + 0.5)
      const sampleX = clamp(Math.round(mappedX), 0, width - 1)
      const sampleY = clamp(Math.round(mappedY), 0, height - 1)
      const srcIndex = (sampleY * width + sampleX) * 4
      const gray = computeLuma(data[srcIndex], data[srcIndex + 1], data[srcIndex + 2])
      grayscale[pixelIndex] = gray
      sum += gray
      destData[pixelIndex * 4 + 3] = 255
      pixelIndex++
    }
  }

  const average = sum / grayscale.length || 128
  const threshold = clamp(average - 12, 40, 200)

  for (let i = 0; i < grayscale.length; i++) {
    const value = grayscale[i] < threshold ? 0 : 255
    const offset = i * 4
    destData[offset] = value
    destData[offset + 1] = value
    destData[offset + 2] = value
  }

  const processed = new ImageData(destData, destWidth, destHeight)
  destCtx.putImageData(processed, 0, 0)
  return destination
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to create blob from canvas'))
      }
    }, type, quality)
  })
