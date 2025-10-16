import { Link } from 'react-router-dom'
import { ReactNode } from 'react'

export type TopNavSection = 'camera' | 'current' | 'vocab' | 'settings'

interface TopNavBarProps {
  current: TopNavSection
  title?: string
  subtitle?: string
  actions?: ReactNode
}

const TOP_LEVEL_LINKS: Array<{ key: TopNavSection; label: string; to: string }> = [
  { key: 'current', label: 'Current', to: '/reader/latest' },
  { key: 'vocab', label: 'Vocab', to: '/vocab' },
  { key: 'settings', label: 'Settings', to: '/settings' },
]

const SECTION_LABELS: Record<TopNavSection, string> = {
  camera: 'Camera',
  current: 'Current',
  vocab: 'Vocabulary',
  settings: 'Settings',
}

function TopNavBar({ current, title, subtitle, actions }: TopNavBarProps) {
  const resolvedTitle = title ?? SECTION_LABELS[current]

  const isCamera = current === 'camera'

  const leftContent = isCamera ? (
    <div className="top-nav__brand">
      <h1 className="top-nav__title">{resolvedTitle}</h1>
      {subtitle && <p className="top-nav__subtitle">{subtitle}</p>}
    </div>
  ) : (
    <Link to="/" className="top-nav__back" aria-label="Back to Camera">
      <span className="top-nav__back-icon">←</span>
      Camera
    </Link>
  )

  const centerContent = isCamera ? (
    <nav className="top-nav__links" aria-label="Primary">
      {TOP_LEVEL_LINKS.map((link) => (
        <Link
          key={link.key}
          to={link.to}
          className={`top-nav__link${current === link.key ? ' top-nav__link--active' : ''}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  ) : (
    <div className="top-nav__brand">
      <h1 className="top-nav__title">{resolvedTitle}</h1>
      {subtitle && <p className="top-nav__subtitle">{subtitle}</p>}
    </div>
  )

  return (
    <header className="top-nav">
      <div className="container top-nav__inner">
        <div className="top-nav__left">{leftContent}</div>
        <div className="top-nav__center">{centerContent}</div>
        <div className="top-nav__actions">{actions}</div>
      </div>
    </header>
  )
}

export default TopNavBar
