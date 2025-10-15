import { NavLink } from 'react-router-dom'

function BottomBar() {
  return (
    <div className="bottom-bar">
      <NavLink 
        to="/" 
        className={({ isActive }) => 
          `flex flex-col items-center ${isActive ? 'text-primary' : 'text-secondary'}`
        }
        end
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span className="text-sm">Home</span>
      </NavLink>
      
      <NavLink 
        to="/vocab" 
        className={({ isActive }) => 
          `flex flex-col items-center ${isActive ? 'text-primary' : 'text-secondary'}`
        }
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <span className="text-sm">Vocab</span>
      </NavLink>
    </div>
  )
}

export default BottomBar