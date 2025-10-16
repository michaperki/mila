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

  return (
    <li key={text.id}>
      <Link
        to={`/reader/${text.id}`}
        className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm hover:shadow"
      >
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          {text.thumbnail ? (
            <img
              src={text.thumbnail}
              alt={text.title || 'Scanned text thumbnail'}
              className="w-20 h-20 object-cover rounded-md border border-gray-200"
            />
          ) : (
            <div className="w-20 h-20 bg-gray-100 rounded-md flex items-center justify-center border border-dashed border-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1.586-1.586a2 2 0 00-2.828 0L6 14" />
              </svg>
            </div>
          )}

          <div className="flex-grow">
            {/* Title */}
            <h3 className="font-semibold text-lg mb-1">{text.title || 'Untitled Text'}</h3>

            {/* Metadata */}
            <div className="text-sm text-gray-500 mb-2">
              <div className="font-medium text-gray-600">
                {text.source === 'ocr' ? 'From Image' : 'Imported'}
              </div>
              <div>
                {text.chunks.length} {text.chunks.length === 1 ? 'sentence' : 'sentences'}
                {' '}•{' '}
                <time>{formatDate(text.createdAt)}</time>
              </div>
            </div>

            {/* Text Preview */}
            {firstChunk && (
              <div className="space-y-1">
                <p className="text-sm text-gray-700 truncate" dir="rtl" lang="he">
                  {getTextPreview()}
                </p>
                {firstChunk.translation && (
                  <p className="text-sm text-gray-500 truncate">
                    {getTranslationPreview()}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default TextPreviewCard;
