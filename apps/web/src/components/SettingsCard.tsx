import { ReactNode } from 'react'

type SettingsCardAccent = 'display' | 'language' | 'audio' | 'ocr' | 'storage' | 'feedback'

type SettingsCardProps = {
  title: string
  icon: ReactNode
  children: ReactNode
  accent?: SettingsCardAccent
}

function SettingsCard({ title, icon, children, accent }: SettingsCardProps) {
  return (
    <section className={`settings-panel card${accent ? ` settings-panel--${accent}` : ''}`}>
      <header className="settings-panel__header">
        <span className="settings-panel__icon" aria-hidden="true">
          {icon}
        </span>
        <h2 className="settings-panel__title">{title}</h2>
      </header>
      <div className="settings-panel__body">{children}</div>
    </section>
  )
}

export const SettingsIcons = {
  Display: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
      <path d="M7 20h10" />
      <path d="M9 16l-.5 4" />
      <path d="M15 16l.5 4" />
    </svg>
  ),
  Language: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 8h14" />
      <path d="M7 4h10" />
      <path d="M9 16c1.5-2.5 3.5-4 6-5" />
      <path d="M12 12 9 21" />
      <path d="M12 12l3 9" />
    </svg>
  ),
  Audio: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  OCR: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6v6H9z" />
      <path d="M4 9h2" />
      <path d="M18 15h2" />
      <path d="M9 4v2" />
      <path d="M15 4v2" />
      <path d="M9 18v2" />
      <path d="M15 18v2" />
    </svg>
  ),
  Storage: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="18" height="6" rx="2" />
      <rect x="3" y="9" width="18" height="6" rx="2" />
      <rect x="3" y="15" width="18" height="6" rx="2" />
      <path d="M7 9v6" />
      <path d="M12 15v6" />
    </svg>
  ),
  Feedback: (
    <svg xmlns="http://www.w3.org/2000/svg" className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20 18v-8a2 2 0 0 0-2-2h-4l-3-3-3 3H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h5l3 3 3-3h4a2 2 0 0 0 2-2Z" />
      <path d="M8.5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M15.5 12h.01" />
    </svg>
  ),
}

export default SettingsCard
