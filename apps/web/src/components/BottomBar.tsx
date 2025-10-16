import { NavLink, useLocation } from 'react-router-dom'
import ActiveTabIndicator from './ActiveTabIndicator'

function BottomBar() {
  const location = useLocation();
  const isReaderActive = location.pathname.includes('/reader');

  return (
    <div className="bottom-bar fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 px-4 py-2 flex justify-around items-center shadow-md z-10">
      {/* Camera / Home */}
      <NavLink
        to="/"
        className={({ isActive }) =>
          `flex flex-col items-center ${isActive ? 'text-primary font-semibold' : 'text-secondary'} relative py-1 px-2 transition-colors duration-200`
        }
        end
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <span className="text-sm">Camera</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      {/* Current Translation */}
      <NavLink
        to={location.pathname.includes('/reader') ? location.pathname : '/reader/latest'}
        className={
          `flex flex-col items-center ${isReaderActive ? 'text-primary font-semibold' : 'text-secondary'} relative py-1 px-2 transition-colors duration-200`
        }
      >
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isReaderActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span className="text-sm">Current</span>
          {isReaderActive && <ActiveTabIndicator />}
        </>
      </NavLink>

      {/* Vocabulary */}
      <NavLink
        to="/vocab"
        className={({ isActive }) =>
          `flex flex-col items-center ${isActive ? 'text-primary font-semibold' : 'text-secondary'} relative py-1 px-2 transition-colors duration-200`
        }
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4.354a4 4 0 0 1 0 5.292M15 21H3v-1a6 6 0 0 1 6-6h1.5"></path>
              <path d="M20.59 11.95a2.59 2.59 0 1 0-3.67 3.66l4.72 4.74L24 17.94l-3.4-6z"></path>
            </svg>
            <span className="text-sm">Vocab</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>

      {/* Settings */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex flex-col items-center ${isActive ? 'text-primary font-semibold' : 'text-secondary'} relative py-1 px-2 transition-colors duration-200`
        }
      >
        {({ isActive }) => (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span className="text-sm">Settings</span>
            {isActive && <ActiveTabIndicator />}
          </>
        )}
      </NavLink>
    </div>
  )
}

export default BottomBar