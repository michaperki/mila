import { ReactNode } from 'react';

interface TopNavBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

function TopNavBar({ title, subtitle, onBack, actions }: TopNavBarProps) {
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 mb-4">
      <div className="container flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-icon bg-gray-100 hover:bg-gray-200"
              aria-label="Go back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <div>
            <h1 className="text-lg font-semibold leading-tight text-gray-900">{title}</h1>
            {subtitle && (
              <p className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export default TopNavBar;
