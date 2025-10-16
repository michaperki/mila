import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './app.css'
import './index.css';
import { initAppDB } from './lib/database';

// Initialize database as early as possible
(async () => {
  try {
    // Try to initialize the database up to 3 times
    for (let i = 0; i < 3; i++) {
      try {
        console.log(`Attempting initial database setup (attempt ${i + 1})`);
        await initAppDB();
        console.log('Initial database setup successful');
        break; // Success, break out of the loop
      } catch (attemptErr) {
        console.error(`Database setup attempt ${i + 1} failed:`, attemptErr);

        if (i < 2) {
          // Wait a bit before retrying
          console.log(`Waiting before retry ${i + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  } catch (err) {
    console.error('All initial database setup attempts failed:', err);
  }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
