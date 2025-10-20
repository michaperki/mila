import { Link, NavLink } from 'react-router-dom'
import { ReactNode } from 'react'
import BrandMark from './BrandMark'

export type TopNavSection = 'home' | 'read' | 'reader' | 'camera' | 'review' | 'vocab' | 'settings'

interface TopNavBarProps {
  current: TopNavSection
  title?: string
  subtitle?: string
  actions?: ReactNode
}

const PRIMARY_LINKS: Array<{ key: Exclude<TopNavSection, 'reader' | 'settings'>; label: string; to: string }> = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'read', label: 'Read', to: '/read' },
  { key: 'camera', label: 'Camera', to: '/camera' },
  { key: 'review', label: 'Review', to: '/review' },
  { key: 'vocab', label: 'Vocab', to: '/vocab' },
]

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

  const leftContent = isPrimarySection ? (
    <div className="top-nav__brand">
      <BrandMark size="lg" />
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
      <BrandMark size="sm" />
    </div>
  )

  const centerContent = isPrimarySection ? (
    <nav className="top-nav__links" aria-label="Primary">
      {PRIMARY_LINKS.map((link) => (
        <NavLink
          key={link.key}
          to={link.to}
          className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
          end={link.to === '/'}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  ) : (
    <div className="top-nav__page">
      <BrandMark size="sm" />
      <div>
        <h1 className="top-nav__title">{resolvedTitle}</h1>
        {subtitle && <p className="top-nav__subtitle">{subtitle}</p>}
      </div>
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
