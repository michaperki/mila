// This file is the actual Web Worker that runs Tesseract.js in a separate thread
import { createWorker } from 'tesseract.js';

// Worker context
let worker: any = null;
let workerReady = false;

// ====== HELPER FUNCTIONS ======
// Define these at the top level to ensure they're available throughout the file

// Send status update
const sendStatus = (id: string, status: string, progress: number = 0) => {
  self.postMessage({
    type: 'status',
    id,
    status,
    progress
  });
};

// Send debug log
const sendDebugLog = (message: string, data?: any) => {
  self.postMessage({
    type: 'log',
    message: {
      status: 'debug',
      message,
      data
    }
  });
};

// Safe error handler
const handleError = (error: any, jobId: string = 'unknown') => {
  console.error('OCR Worker Error:', error);
  
  // Send error message back to main thread
  self.postMessage({
    type: 'error',
    id: jobId,
    error: error?.message || 'Unknown OCR error',
    stack: error?.stack
  });
};

// ====== WORKER MESSAGE HANDLER ======
self.onmessage = async (e: MessageEvent) => {
  let currentJobId = 'unknown';
  
  try {
    const { imageBlob, options, id, command } = e.data;
    currentJobId = id || 'unknown';

    // Handle termination command
    if (command === 'terminate') {
      if (worker) {
        await worker.terminate();
        worker = null;
        workerReady = false;
        self.postMessage({ type: 'terminated' });
      }
      return;
    }

    // Update progress
    sendStatus(currentJobId, 'initializing', 0.1);
    sendDebugLog('OCR worker initialization started');

    // Initialize the Tesseract worker if not already initialized
    if (!worker || !workerReady) {
      sendStatus(currentJobId, 'loading-worker', 0.2);
      sendDebugLog('Creating Tesseract worker');

      // Create a logger function that sends progress updates
      const loggerFunction = (m: any) => {
        // Send logger messages to main thread
        self.postMessage({
          type: 'log',
          message: m
        });

        // Extract progress from logger messages
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          sendStatus(currentJobId, 'recognizing', 0.3 + (m.progress * 0.6)); // Scale progress to 30%-90% range
        }
      };

      // Use worker-specific settings, with fallbacks
      let langSources = [
        'https://raw.githubusercontent.com/tesseract-ocr/tessdata/main', // Direct GitHub source
        'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.4/tesseract-core-data/4.0.0_best',
        '/tessdata',             // Standard Tesseract path in public
        '/ocr-models',           // Original project path
      ];

      // Use the correct language code
      const langCode = 'heb';
      let loadSuccess = false;

      // Try each source until one works
      for (let i = 0; i < langSources.length; i++) {
        const langPath = langSources[i];
        try {
          sendDebugLog(`Attempting to load language data from: ${langPath}`);

          // Create new worker with current source path
          if (worker) {
            try {
              await worker.terminate();
            } catch (e) {
              // Ignore termination errors
            }
          }

          // Skip pre-check since it can be problematic in worker context
          // Just try to create the worker with this path

          // Log what we're about to try
          console.log(`Attempting to create Tesseract worker with langPath: ${langPath}`);

          worker = await createWorker({
            logger: loggerFunction,
            langPath: langPath,
            gzip: false,
          });

          // Load the Hebrew language data
          sendStatus(currentJobId, 'loading-language', 0.2);

          await worker.loadLanguage(langCode);
          await worker.initialize(langCode);

          loadSuccess = true;
          workerReady = true;
          sendDebugLog(`Successfully loaded language data from: ${langPath}`);
          break;
        } catch (error) {
          sendDebugLog(`Failed to load language data from: ${langPath}`, error);

          if (i === langSources.length - 1) {
            // This was the last source, rethrow the error
            throw new Error(`Failed to load Hebrew language data from all sources. Last error: ${(error as Error).message}`);
          }
          // Otherwise continue to the next source
        }
      }

      if (!loadSuccess) {
        throw new Error('Failed to load Hebrew language data from any source');
      }
    }
    
    sendStatus(currentJobId, 'processing', 0.3);
    sendDebugLog('Starting OCR recognition process');

    try {
      // Perform OCR with explicit timeout handling
      const recognizePromise = worker.recognize(imageBlob);

      // Set a timeout to detect stalled recognition
      const timeoutPromise = new Promise((_, reject) => {
        const timeout = setTimeout(() => {
          clearTimeout(timeout);
          reject(new Error('OCR recognition timeout after 30 seconds'));
        }, 30000); // 30 second timeout
      });

      // Race between recognition and timeout
      const result = await Promise.race([recognizePromise, timeoutPromise]) as any;

      sendDebugLog('OCR recognition completed successfully');

      // Verify result structure
      if (!result || !result.data || !result.data.text) {
        throw new Error('Invalid OCR result structure');
      }

      // Send the OCR result back to the main thread
      sendStatus(currentJobId, 'completing', 0.95);

      // Extract the required data
      const ocrResult = {
        text: result.data.text || '',
        lines: Array.isArray(result.data.lines)
          ? result.data.lines.map((line: any) => line.text || '')
          : [],
        words: Array.isArray(result.data.words)
          ? result.data.words.map((word: any) => ({
              text: word.text || '',
              bbox: word.bbox || {},
              confidence: word.confidence || 0
            }))
          : [],
        hocr: result.data.hocr || '',
      };

      self.postMessage({
        type: 'result',
        id: currentJobId,
        data: ocrResult
      });

      sendStatus(currentJobId, 'completed', 1.0);
    } catch (ocrError) {
      // Handle OCR-specific errors
      sendDebugLog('OCR recognition failed', ocrError);

      // If worker is in a bad state, reset it
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          // Ignore termination errors
        }
        worker = null;
        workerReady = false;
      }

      throw new Error(`OCR processing failed: ${(ocrError as Error).message}`);
    }
  } catch (error) {
    console.error('Fatal error in OCR worker:', error);
    handleError(error, currentJobId);
  }
};