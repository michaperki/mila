import { NavLink, useLocation } from 'react-router-dom'
import ActiveTabIndicator from './ActiveTabIndicator'

function BottomBar() {
  const location = useLocation()
  const pathname = location.pathname
  const isReaderActive = pathname.startsWith('/read/') || pathname.startsWith('/reader/')

  return (
    <nav className="bottom-bar" aria-label="Primary navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-bar__link${isActive ? ' bottom-bar__link--active' : ''}`}
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12L2 12L12 3L22 12L21 12" />
              <path d="M5 12V20H19V12" />
            </svg>
            <span>Home</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      <NavLink
        to="/read"
        className={({ isActive }) => {
          const active = isActive || isReaderActive
          return `bottom-bar__link${active ? ' bottom-bar__link--active' : ''}`
        }}
      >
        {({ isActive }) => {
          const active = isActive || isReaderActive
          return (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H5z" />
                <path d="M5 4v16" />
                <path d="M19 4v16" />
              </svg>
              <span>Read</span>
              {active && <ActiveTabIndicator />}
            </>
          )
        }}
      </NavLink>

      <NavLink
        to="/camera"
        className={({ isActive }) => `bottom-bar__link${isActive ? ' bottom-bar__link--active' : ''}`}
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Camera</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      <NavLink
        to="/vocab"
        className={({ isActive }) => `bottom-bar__link${isActive ? ' bottom-bar__link--active' : ''}`}
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4.354a4 4 0 0 1 0 5.292M15 21H3v-1a6 6 0 0 1 6-6h1.5" />
              <path d="M20.59 11.95a2.59 2.59 0 1 0-3.67 3.66l4.72 4.74L24 17.94l-3.4-6z" />
            </svg>
            <span>Vocab</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      <NavLink
        to="/review"
        className={({ isActive }) => `bottom-bar__link${isActive ? ' bottom-bar__link--active' : ''}`}
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5l-4 4V6a2 2 0 0 1 2-2h7" />
            </svg>
            <span>Review</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      <NavLink
        to="/settings"
        className={({ isActive }) => `bottom-bar__link${isActive ? ' bottom-bar__link--active' : ''}`}
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>
    </nav>
  )
}

export default BottomBar
