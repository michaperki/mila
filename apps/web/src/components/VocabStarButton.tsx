import { useState } from 'react';
import { Token, StarredItem } from '../types';

interface VocabStarButtonProps {
  token: Token;
  isStarred: boolean;
  textId?: string;
  chunkId?: string;
  onStar: (token: Token) => void;
  className?: string;
  showLabel?: boolean;
}

function VocabStarButton({
  token,
  isStarred,
  onStar,
  className = '',
  showLabel = false
}: VocabStarButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // Prevent click event from bubbling up to parent elements
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStar(token);
  };
  
  return (
    <button
      className={`star-button ${className} ${isStarred ? 'starred' : 'not-starred'}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={isStarred ? 'Remove from vocabulary' : 'Add to vocabulary'}
      title={isStarred ? 'Remove from vocabulary' : 'Add to vocabulary'}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="16" 
        height="16" 
        viewBox="0 0 24 24"
        fill={isStarred ? 'currentColor' : 'none'}
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={`${isStarred ? 'text-yellow-500' : isHovered ? 'text-yellow-400' : 'text-gray-400'}`}
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
      
      {showLabel && (
        <span className="ml-1 text-sm">
          {isStarred ? 'Starred' : 'Star'}
        </span>
      )}
    </button>
  );
}

export default VocabStarButton;