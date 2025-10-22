import { Link } from 'react-router-dom'
import { ReactNode } from 'react'
import BrandMark from './BrandMark'

export type TopNavSection = 'home' | 'read' | 'reader' | 'camera' | 'review' | 'vocab' | 'settings'

interface TopNavBarProps {
  current: TopNavSection
  title?: string
  subtitle?: string
  actions?: ReactNode
}

const SECTION_LABELS: Record<TopNavSection, string> = {
  home: 'Home',
  read: 'Read',
  reader: 'Reader',
  camera: 'Camera',
  review: 'Review',
  vocab: 'Vocabulary',
  settings: 'Settings',
}

const BACK_LINKS: Partial<Record<TopNavSection, { label: string; to: string }>> = {
  reader: { label: 'Back to Read', to: '/read' },
  settings: { label: 'Back to Home', to: '/' },
}

function TopNavBar({ current, title, subtitle, actions }: TopNavBarProps) {
  const resolvedTitle = title ?? SECTION_LABELS[current]
  const isPrimarySection = current === 'home' || current === 'read' || current === 'camera' || current === 'review' || current === 'vocab'
  const backLink = BACK_LINKS[current]
  const renderBrandLink = (size: 'sm' | 'md' | 'lg') => (
    <Link to="/" className="top-nav__brand-link" aria-label="Go to Mila home">
      <BrandMark size={size} />
    </Link>
  )

  const leftContent = isPrimarySection ? (
    <div className="top-nav__brand">
      {renderBrandLink('lg')}
      <div className="top-nav__brand-copy">
        {resolvedTitle && <p className="top-nav__subtitle">{resolvedTitle}</p>}
        {subtitle && <p className="top-nav__aux">{subtitle}</p>}
      </div>
    </div>
  ) : backLink ? (
    <Link to={backLink.to} className="top-nav__back" aria-label={backLink.label}>
      <span className="top-nav__back-icon">←</span>
      {backLink.label}
    </Link>
  ) : (
    <div className="top-nav__brand">
      {renderBrandLink('sm')}
    </div>
  )

  return (
    <header className="top-nav">
      <div className="top-nav__inner mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="top-nav__left">{leftContent}</div>
        <div className="top-nav__center">
          {!isPrimarySection && (
            <div className="top-nav__page">
              {renderBrandLink('sm')}
              <div>
                <h1 className="top-nav__title">{resolvedTitle}</h1>
                {subtitle && <p className="top-nav__subtitle">{subtitle}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="top-nav__actions">{actions}</div>
      </div>
    </header>
  )
}

export default TopNavBar
