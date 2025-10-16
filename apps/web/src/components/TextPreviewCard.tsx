import { Link } from 'react-router-dom';
import { TextDoc } from '../types';
import { toggleNikud } from '../lib/nikud';

interface TextPreviewCardProps {
  text: TextDoc;
  showNikud?: boolean;
}

function TextPreviewCard({ text, showNikud = true }: TextPreviewCardProps) {
  // Format the date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  // Get the first chunk of text for the preview
  const firstChunk = text.chunks[0];

  // Get a preview of the text content (first ~60 characters - shorter for better display)
  const getTextPreview = () => {
    if (!firstChunk) return '';
    const textContent = showNikud ? firstChunk.text : toggleNikud(firstChunk.text, false);
    const maxLength = 60;
    return textContent.length > maxLength
      ? textContent.substring(0, maxLength) + '...'
      : textContent;
  };

  // Get a preview of the translation (first ~80 characters)
  const getTranslationPreview = () => {
    if (!firstChunk || !firstChunk.translation) return '';
    const maxLength = 80;
    return firstChunk.translation.length > maxLength
      ? firstChunk.translation.substring(0, maxLength) + '...'
      : firstChunk.translation;
  };

  // Cleaner source display text
  const getSourceLabel = (source: string) => {
    if (source === 'ocr') return 'From Image';
    return source.charAt(0).toUpperCase() + source.slice(1);
  };

  return (
    <li key={text.id} className="mb-4">
      <Link
        to={`/reader/${text.id}`}
        className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm hover:shadow"
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-lg">{text.title || 'Untitled Text'}</h3>
          <div className="flex items-center">
            <span className="text-xs bg-primary bg-opacity-10 text-primary rounded-full px-2 py-1 mr-2 font-medium">
              {text.chunks.length} {text.chunks.length === 1 ? 'sentence' : 'sentences'}
            </span>
            <time className="text-sm text-gray-500 font-medium">{formatDate(text.createdAt)}</time>
          </div>
        </div>

        {firstChunk && (
          <>
            <div className="preview-content mb-3">
              <div className="hebrew-text text-base mb-2 p-2 bg-gray-50 rounded" dir="rtl" lang="he">
                {getTextPreview()}
              </div>
              {firstChunk.translation && (
                <div className="translation text-sm text-gray-700 border-t pt-2">
                  {getTranslationPreview()}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex mt-3 border-t pt-2">
          {text.source && (
            <div className="text-xs text-gray-600 font-medium flex items-center">
              {text.source === 'ocr' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
              )}
              {getSourceLabel(text.source)}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

export default TextPreviewCard;