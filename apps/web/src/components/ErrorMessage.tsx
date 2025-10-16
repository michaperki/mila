import React from 'react';

interface ErrorMessageProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  if (!error) return null;

  // Map common error messages to user-friendly versions
  const getFriendlyErrorMessage = (errorText: string) => {
    if (errorText.includes('Failed to execute \'transaction\'') ||
        errorText.includes('The database connection is closing') ||
        errorText.includes('database initialization failed') ||
        errorText.includes('InvalidStateError')) {
      return 'Storage setup incomplete. Please reload the page to reinitialize the database.';
    }

    if (errorText.includes('NetworkError') || errorText.includes('Failed to fetch')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }

    if (errorText.includes('QuotaExceededError')) {
      return 'Storage space limit exceeded. Try clearing some saved texts.';
    }

    if (errorText.includes('Permission denied') || errorText.includes('NotAllowedError')) {
      return 'Permission denied. Please allow access to required features.';
    }

    return errorText;
  };

  const friendlyMessage = getFriendlyErrorMessage(error);
  const needsReload = error.includes('Failed to execute \'transaction\'') ||
                      error.includes('The database connection is closing') ||
                      error.includes('database initialization failed') ||
                      error.includes('InvalidStateError');

  return (
    <div className="error-message bg-red-50 border border-red-200 text-red-800 rounded p-3 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium">Error</h3>
          <div className="mt-1 text-sm">
            {friendlyMessage}
          </div>
          
          {(onRetry || needsReload || onDismiss) && (
            <div className="mt-2 flex gap-2">
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-small bg-red-600 text-white hover:bg-red-700"
                  onClick={onRetry}
                >
                  Try Again
                </button>
              )}
              
              {needsReload && (
                <button
                  type="button"
                  className="btn btn-small bg-red-600 text-white hover:bg-red-700"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
              )}
              
              {onDismiss && (
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ErrorMessage;