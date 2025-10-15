import { useState, useRef, ChangeEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTextStore } from '../state/useTextStore'
import { processImage } from '../services/ingest'
import { terminateWorker } from '../services/ocr.worker'

// Component for selecting and capturing images for OCR
function ImagePicker() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailedError, setDetailedError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('Preparing')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLImageElement>(null)
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { saveText } = useTextStore()
  const navigate = useNavigate()

  // Clean up preview URL and any processing timeouts on unmount
  useEffect(() => {
    return () => {
      // Clean up image URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }

      // Clear any processing timeouts
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }

      // If unmounted during processing, terminate worker
      if (isProcessing) {
        terminateWorker().catch(console.error)
      }
    }
  }, [previewUrl, isProcessing])

  // Update progress stage based on progress value
  useEffect(() => {
    if (progress < 25) {
      setProgressStage('Preparing image...')
    } else if (progress < 35) {
      setProgressStage('Initializing OCR...')
    } else if (progress < 90) {
      setProgressStage('Running OCR...')
    } else {
      setProgressStage('Finalizing...')
    }
  }, [progress])

  // Handle file selection from file input
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    try {
      // Clear any previous errors and states
      setError(null)
      setDetailedError(null)

      // Clear any previous processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
        processingTimeoutRef.current = null
      }

      const imageFile = files[0]

      // Validate image file
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('Selected file is not an image')
      }

      // Check file size
      if (imageFile.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Image is too large (max 10MB)')
      }

      // Create and display image preview
      const objectUrl = URL.createObjectURL(imageFile)
      setPreviewUrl(objectUrl)

      // Set processing state after preview is displayed
      setIsProcessing(true)
      setProgress(10)

      // Set a timeout to detect if OCR takes too long
      processingTimeoutRef.current = setTimeout(() => {
        if (isProcessing) {
          setDetailedError(
            'OCR is taking longer than expected. This could be due to a large image ' +
            'or limited device resources. You can try again with a smaller/clearer image.'
          )
        }
      }, 20000) // Show detailed message after 20 seconds

      // Process the image after a short delay to allow preview to render
      setTimeout(async () => {
        try {
          // Normalize the image and run OCR
          setProgress(25)
          const textDoc = await processImage(imageFile, (p) => {
            // Update progress based on OCR status
            setProgress(25 + Math.floor(p * 65)) // 25-90% range for OCR
          })

          // Clear the timeout since processing completed
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current)
            processingTimeoutRef.current = null
          }

          setProgress(95)

          // Check if there's any text extracted
          if (!textDoc.chunks.length || !textDoc.chunks.some(chunk => chunk.text.trim().length > 0)) {
            throw new Error('No text was detected in the image. Please try another image with clearer text.')
          }

          // Save the processed text to the store
          await saveText(textDoc)
          setProgress(100)

          // Navigate to the reader view
          navigate(`/reader/${textDoc.id}`)
        } catch (err) {
          // Clear the timeout since processing failed
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current)
            processingTimeoutRef.current = null
          }

          const errorMessage = (err as Error).message;
          setError(`Failed to process image: ${errorMessage}`)

          // Set detailed error message based on error type
          if (errorMessage.includes('timeout') || errorMessage.includes('language')) {
            setDetailedError(
              'There was a problem with the OCR engine. This may be due to network issues ' +
              'or problems loading the Hebrew language data. Please try again, or refresh the page.'
            )
          } else if (errorMessage.includes('text')) {
            setDetailedError(
              'The OCR engine couldn\'t find any text in this image. Try an image with ' +
              'clearer text, better lighting, or less background noise.'
            )
          }

          console.error('Image processing error:', err)
          setIsProcessing(false)
        }
      }, 500)

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setError(`Failed to process image: ${(error as Error).message}`)
      console.error('Image processing error:', error)
      setIsProcessing(false)
    }
  }

  // Handle retrying after an error
  const handleRetry = () => {
    // Clean up any processing state
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }

    // Reset all state
    setError(null)
    setDetailedError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setProgress(0)
    setProgressStage('Preparing')

    // Terminate any running worker
    terminateWorker().catch(console.error)
  }

  // Handle capturing via the camera
  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment')
      fileInputRef.current.click()
    }
  }

  // Handle uploading from gallery
  const handleGalleryUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture')
      fileInputRef.current.click()
    }
  }

  return (
    <div className="image-picker">
      {!isProcessing && !previewUrl ? (
        <>
          <div className="mb-4">
            <label className="block mb-2">Upload an image or take a photo:</label>

            <div className="flex flex-col gap-2">
              {/* Camera capture button for mobile */}
              <button
                className="btn"
                onClick={handleCameraCapture}
                disabled={isProcessing}
              >
                Take Photo with Camera
              </button>

              {/* Gallery upload button */}
              <button
                className="btn btn-secondary"
                onClick={handleGalleryUpload}
                disabled={isProcessing}
              >
                Upload from Gallery
              </button>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={isProcessing}
              />
            </div>
          </div>

          <div className="text-sm">
            <p>Supported image types: JPG, PNG, GIF</p>
            <p>For best results, ensure text is clearly visible and well-lit</p>
          </div>
        </>
      ) : (
        <div className="image-preview mb-4">
          {previewUrl && (
            <div className="mb-2">
              <img
                ref={previewRef}
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-60 object-contain"
              />
            </div>
          )}

          {isProcessing ? (
            <div className="processing-status">
              <div className="progress-bar mb-2 bg-gray-200 rounded-full h-4">
                <div
                  className="bg-primary h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center">
                {progress < 25 && 'Preparing image...'}
                {progress >= 25 && progress < 90 && 'Running OCR...'}
                {progress >= 90 && 'Finalizing...'}
              </p>
            </div>
          ) : error ? (
            <div className="error-status">
              <div className="text-error mb-2">{error}</div>
              <button
                className="btn"
                onClick={handleRetry}
              >
                Try Again
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default ImagePicker