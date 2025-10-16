/// <reference types="vite/client" />

// OCR Worker manager for Tesseract.js
// This file manages communication with the actual web worker

type OcrResult = {
  text: string;
  lines: string[];
  words?: Array<{ text: string; bbox: any; confidence: number }>;
  hocr?: string;
};

type OcrOptions = {
  lang: string;
  progress?: (progress: number) => void;
  debug?: boolean;
};

// Track active OCR jobs and their callbacks
type OcrJob = {
  resolve: (result: OcrResult) => void;
  reject: (error: Error) => void;
  progress?: (progress: number) => void;
  startTime: number;
  options: OcrOptions;
};

// Debugging helper
const DEBUG = import.meta.env.DEV || import.meta.env.VITE_DEBUG_OCR === 'true';

// Logger function that respects debug settings
function logDebug(message: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[OCR Debug] ${message}`, ...args);
  }
}

const jobs = new Map<string, OcrJob>();
let worker: Worker | null = null;
let jobCounter = 0;
let workerInitializing = false;
let workerInitPromise: Promise<Worker> | null = null;

/**
 * Initialize the OCR web worker if not already created
 */
function initWorker(): Promise<Worker> {
  // If already initializing, return the existing promise
  if (workerInitPromise) {
    return workerInitPromise;
  }

  // If worker already exists, return it immediately
  if (worker) {
    return Promise.resolve(worker);
  }

  // Create new initialization promise
  workerInitializing = true;

  workerInitPromise = new Promise<Worker>((resolve, reject) => {
    try {
      logDebug('Creating new OCR worker instance');

      // Copy our public directory path for the OCR models
      // This helps the worker find the correct path when loaded
      const publicDir = import.meta.env.BASE_URL || '/';

      // Create a new worker instance
      const newWorker = new Worker(
        new URL('./ocr.worker.actual.ts', import.meta.url),
        { type: 'module' }
      );

      // Set up message handler
      newWorker.onmessage = (e) => {
        const { type, id, data, error, status, progress, message } = e.data;

        switch (type) {
          case 'result': {
            // OCR completed successfully
            logDebug(`Job ${id} completed successfully`);
            const job = jobs.get(id);
            if (job) {
              const duration = Date.now() - job.startTime;
              logDebug(`OCR job completed in ${duration}ms`);
              job.resolve(data);
              jobs.delete(id);
            }
            break;
          }
          case 'error': {
            // OCR failed with error
            const errorMessage = error || 'Unknown OCR error';
            logDebug(`Job ${id} failed: ${errorMessage}`);
            console.error('OCR worker error:', errorMessage);
            const job = jobs.get(id);
            if (job) {
              job.reject(new Error(errorMessage));
              jobs.delete(id);
            }
            break;
          }
          case 'status': {
            // Progress update
            if (status && progress !== undefined) {
              const job = jobs.get(id);
              if (job && job.progress) {
                job.progress(progress);
                if (job.options.debug) {
                  logDebug(`Job ${id} progress: ${status} (${Math.round(progress * 100)}%)`);
                }
              }
            }
            break;
          }
          case 'log': {
            // Logger message from the worker
            if (DEBUG || message?.status === 'debug') {
              console.log('OCR Worker:', message);
            }
            break;
          }
          case 'terminated': {
            // Worker terminated
            logDebug('OCR worker terminated');
            worker = null;
            workerInitPromise = null;
            break;
          }
        }
      };

      // Handle worker errors
      newWorker.onerror = (error) => {
        const errorMsg = `OCR worker error: ${error.message || 'Unknown error'}`;
        console.error(errorMsg, error);

        // Reject initialization if it's still pending
        if (workerInitializing) {
          workerInitializing = false;
          reject(new Error(errorMsg));
        }

        // Reject all pending jobs
        jobs.forEach(job => {
          job.reject(new Error(errorMsg));
        });
        jobs.clear();

        // Reset worker state
        worker = null;
        workerInitPromise = null;
      };

      // Initialize worker complete
      worker = newWorker;
      workerInitializing = false;
      resolve(newWorker);

    } catch (error) {
      workerInitializing = false;
      workerInitPromise = null;
      console.error('Failed to initialize OCR worker:', error);
      reject(error);
    }
  });

  return workerInitPromise;
}

/**
 * OCR function to process an image and return recognized text
 */
export async function ocr(imageBlob: Blob, options: OcrOptions): Promise<OcrResult> {
  try {
    // Initialize the worker
    logDebug('OCR process started, initializing worker');
    const workerInstance = await initWorker();

    // Create a unique ID for this OCR job
    const id = `ocr-job-${jobCounter++}`;
    const startTime = Date.now();

    logDebug(`Starting OCR job ${id}`);

    return new Promise<OcrResult>((resolve, reject) => {
      try {
        // Set a timeout to detect stalled jobs
        const jobTimeout = setTimeout(() => {
          if (jobs.has(id)) {
            logDebug(`Job ${id} timed out after 60s`);
            jobs.delete(id);
            reject(new Error('OCR processing timed out after 60 seconds'));
          }
        }, 60000); // 60 second timeout

        // Register this job with a wrapper to clear the timeout
        jobs.set(id, {
          resolve: (result) => {
            clearTimeout(jobTimeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(jobTimeout);
            reject(error);
          },
          progress: options.progress,
          startTime,
          options
        });

        // Send the image to the worker
        workerInstance.postMessage({
          id,
          imageBlob,
          options: {
            lang: options.lang,
          },
        });
      } catch (error) {
        // Clean up and reject on error
        jobs.delete(id);
        reject(new Error(`Failed to start OCR job: ${(error as Error).message}`));
      }
    });
  } catch (error) {
    throw new Error(`OCR initialization failed: ${(error as Error).message}`);
  }
}

/**
 * Terminate the worker to free resources
 */
export async function terminateWorker(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!worker) {
      resolve();
      return;
    }

    logDebug('Terminating OCR worker');

    // Send termination command to worker
    worker.postMessage({ command: 'terminate' });

    // Set up one-time handler for termination confirmation
    const handleTerminated = (e: MessageEvent) => {
      if (e.data.type === 'terminated') {
        worker?.removeEventListener('message', handleTerminated);
        worker = null;
        workerInitPromise = null;
        resolve();
      }
    };

    worker.addEventListener('message', handleTerminated);

    // Fallback: if worker doesn't respond in 3 seconds, force termination
    setTimeout(() => {
      if (worker) {
        logDebug('Forcing worker termination after timeout');
        worker.terminate();
        worker = null;
        workerInitPromise = null;
        resolve();
      }
    }, 3000);
  });
}
