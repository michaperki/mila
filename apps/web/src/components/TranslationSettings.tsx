import { useState, useEffect } from 'react';

interface TranslationSettingsProps {
  onClose?: () => void;
}

function TranslationSettings({ onClose }: TranslationSettingsProps) {
  const [useRealTranslation, setUseRealTranslation] = useState(
    localStorage.getItem('useRealTranslate') === 'true'
  );
  
  const [apiBase, setApiBase] = useState(
    localStorage.getItem('apiBase') || ''
  );
  
  // Save settings to localStorage and update
  const saveSettings = () => {
    // Save real translation setting
    localStorage.setItem('useRealTranslate', useRealTranslation ? 'true' : 'false');
    
    // Save API base URL if it's provided
    if (apiBase.trim()) {
      localStorage.setItem('apiBase', apiBase.trim());
    } else {
      localStorage.removeItem('apiBase');
    }
    
    // Show success message
    alert('Settings saved. Please refresh the page for changes to take effect.');
    
    // Close the settings if onClose handler provided
    if (onClose) {
      onClose();
    }
  };
  
  // Reset all settings to defaults
  const resetSettings = () => {
    if (confirm('Reset all translation settings to defaults?')) {
      localStorage.removeItem('useRealTranslate');
      localStorage.removeItem('apiBase');
      localStorage.removeItem('translationClientId');
      
      // Update state
      setUseRealTranslation(false);
      setApiBase('');
      
      alert('Settings reset to defaults. Please refresh the page.');
    }
  };
  
  return (
    <div className="translation-settings bg-white p-4 rounded-lg shadow-lg max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Translation Settings</h2>
      
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id="useRealTranslation"
            checked={useRealTranslation}
            onChange={(e) => setUseRealTranslation(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="useRealTranslation">
            Use real translation API
          </label>
        </div>
        <p className="text-sm text-gray-500">
          When enabled, translations will be fetched from Google Translation API.
          When disabled, built-in mock translations will be used.
        </p>
      </div>
      
      {useRealTranslation && (
        <div className="mb-4">
          <label htmlFor="apiBase" className="block mb-1">
            API Base URL (optional)
          </label>
          <input
            type="text"
            id="apiBase"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="https://your-api-domain.com"
            className="w-full p-2 border rounded"
          />
          <p className="text-sm text-gray-500 mt-1">
            Enter a base URL if your API is hosted at a custom domain.
            Leave empty to use the default deployment URL.
          </p>
        </div>
      )}
      
      <div className="flex justify-end gap-2 mt-4">
        <button 
          className="px-4 py-2 bg-gray-200 rounded" 
          onClick={resetSettings}
        >
          Reset
        </button>
        <button 
          className="px-4 py-2 bg-primary text-white rounded" 
          onClick={saveSettings}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}

export default TranslationSettings;