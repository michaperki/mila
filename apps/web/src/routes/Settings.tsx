import { useState } from 'react'

function Settings() {
  const [theme, setTheme] = useState('light')
  const [playbackSpeed, setPlaybackSpeed] = useState('normal')
  const [direction, setDirection] = useState('he-en')
  
  return (
    <div className="container">
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      
      <div className="flex flex-col gap-4">
        <div className="card">
          <h2 className="mb-2 font-bold">Display</h2>
          
          <div className="mb-4">
            <label className="mb-1 block">Theme</label>
            <div className="flex gap-2">
              <button 
                className={`btn ${theme === 'light' ? '' : 'btn-secondary'}`}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
              <button 
                className={`btn ${theme === 'dark' ? '' : 'btn-secondary'}`}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-2 font-bold">Language</h2>
          
          <div className="mb-4">
            <label className="mb-1 block">Translation Direction</label>
            <div className="flex gap-2">
              <button 
                className={`btn ${direction === 'he-en' ? '' : 'btn-secondary'}`}
                onClick={() => setDirection('he-en')}
              >
                Hebrew → English
              </button>
              <button 
                className={`btn ${direction === 'en-he' ? '' : 'btn-secondary'}`}
                onClick={() => setDirection('en-he')}
              >
                English → Hebrew
              </button>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h2 className="mb-2 font-bold">Audio</h2>
          
          <div className="mb-4">
            <label className="mb-1 block">Playback Speed</label>
            <div className="flex gap-2">
              <button 
                className={`btn ${playbackSpeed === 'slow' ? '' : 'btn-secondary'}`}
                onClick={() => setPlaybackSpeed('slow')}
              >
                Slow
              </button>
              <button 
                className={`btn ${playbackSpeed === 'normal' ? '' : 'btn-secondary'}`}
                onClick={() => setPlaybackSpeed('normal')}
              >
                Normal
              </button>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h2 className="mb-2 font-bold">OCR Options</h2>
          
          <div className="mb-4">
            <label className="mb-1 block">Auto-correct</label>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                className="mb-0"
              />
              <span>Apply auto-correction to OCR results</span>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h2 className="mb-2 font-bold">Storage</h2>
          
          <div className="flex justify-between items-center">
            <span>Texts and Images</span>
            <span className="text-sm">2.3 MB</span>
          </div>
          
          <button className="btn btn-secondary mt-4">
            Clear All Saved Data
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings