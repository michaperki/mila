import { v4 as uuidv4 } from 'uuid';
import { TextDoc, Chunk, Token } from '../types';
import { normalizeZeroWidth } from '../lib/rtl';
import { ocr } from './ocr.worker';
import { translateSentence, glossTokens } from './translate';
import { segmentText } from './segmentation';

// Progress callback type
type ProgressCallback = (progress: number) => void;

/**
 * Processes an image file through OCR and segmentation
 * @param imageFile The image file to process
 * @param progressCallback Optional callback for tracking progress (0-1)
 */
export async function processImage(
  imageFile: File,
  progressCallback?: ProgressCallback
): Promise<TextDoc> {
  // Update progress
  const updateProgress = (progress: number) => {
    if (progressCallback) {
      progressCallback(Math.min(1, Math.max(0, progress)));
    }
  };

  updateProgress(0.1);

  // First, normalize the image size if needed (max width 1600px)
  const normalizedImageBlob = await normalizeImageSize(imageFile);

  updateProgress(0.2);

  // Run OCR on the normalized image
  const ocrResult = await ocr(normalizedImageBlob, {
    lang: 'heb',
    progress: (p) => updateProgress(0.2 + (p * 0.6)) // 20-80% range for OCR
  });

  updateProgress(0.6);

  // Segment the OCR text into chunks (sentences and tokens)
  const chunks = segmentText(ocrResult.text);

  updateProgress(0.7);

  // Translate the chunks
  const translatedChunks = await translateChunks(chunks);

  updateProgress(0.9);

  // Create the text document
  const textDoc: TextDoc = {
    id: uuidv4(),
    source: 'ocr',
    title: `OCR Text ${new Date().toLocaleDateString()}`,
    chunks: translatedChunks,
    createdAt: Date.now(),
  };

  updateProgress(1.0);

  return textDoc;
}

/**
 * Normalizes image size for OCR processing
 * Resizes the image to a maximum width of 1600px while maintaining aspect ratio
 * Enhances contrast to make text more readable
 */
async function normalizeImageSize(imageFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const MAX_WIDTH = 1600;
    const JPEG_QUALITY = 0.9;

    // Create a URL for the image file
    const url = URL.createObjectURL(imageFile);
    const img = new Image();

    // Handle image load errors
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    // Process the image once loaded
    img.onload = () => {
      // Clean up the URL immediately
      URL.revokeObjectURL(url);

      try {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize if needed
        if (width > MAX_WIDTH) {
          const aspectRatio = height / width;
          width = MAX_WIDTH;
          height = Math.round(MAX_WIDTH * aspectRatio);
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Apply contrast enhancement to make text more readable
        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          // Simple contrast enhancement
          const contrastFactor = 1.2; // Increase contrast by 20%
          const factor = (259 * (contrastFactor + 255)) / (255 * (259 - contrastFactor));

          for (let i = 0; i < data.length; i += 4) {
            // Apply to RGB channels
            data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
            data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
            data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
            // Leave alpha channel unchanged
          }

          ctx.putImageData(imageData, 0, 0);
        } catch (imageDataError) {
          console.warn('Could not enhance image contrast', imageDataError);
          // Continue without enhancement
        }

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not convert canvas to blob'));
            }
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      } catch (error) {
        reject(new Error(`Image processing failed: ${(error as Error).message}`));
      }
    };

    // Start loading the image
    img.src = url;
  });
}

// This content is replaced by the segmentation.ts service

/**
 * Translates all chunks
 */
async function translateChunks(chunks: Chunk[]): Promise<Chunk[]> {
  // For each chunk, get a translation and token glosses
  const translatedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      // Get sentence translation
      const translation = await translateSentence(chunk.text);
      
      // Get token glosses
      const tokenSurfaces = chunk.tokens.map(token => token.surface);
      const glosses = await glossTokens(tokenSurfaces);
      
      // Assign glosses to tokens
      const tokensWithGlosses = chunk.tokens.map((token, idx) => ({
        ...token,
        gloss: glosses[idx],
      }));
      
      return {
        ...chunk,
        translation,
        tokens: tokensWithGlosses,
      };
    })
  );
  
  return translatedChunks;
}