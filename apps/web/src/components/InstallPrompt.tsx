import { useState, useEffect } from 'react';

// PWA install prompt component
function InstallPrompt() {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if the app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone ||
                         document.referrer.includes('android-app://');
    
    if (isStandalone) {
      // App is already installed, don't show prompt
      return;
    }

    // Check for iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);
    
    // For Chrome, Edge, etc: Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Store the event for later use
      setInstallEvent(e);
      // Show the install button
      setShowInstallPrompt(true);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  // Handle install button click
  const handleInstall = async () => {
    if (!installEvent) return;
    
    // Show the install prompt
    installEvent.prompt();
    
    // Wait for the user to respond to the prompt
    const choiceResult = await installEvent.userChoice;
    
    // Hide the install button regardless of user choice
    setShowInstallPrompt(false);
    setInstallEvent(null);
    
    // Log the result
    console.log(`User ${choiceResult.outcome} the install prompt`);
  };
  
  // Don't render anything if we shouldn't show the prompt
  if (!showInstallPrompt && !isIOS) return null;
  
  return (
    <div className="install-prompt card mb-4 bg-blue-50">
      {isIOS ? (
        <div className="p-3">
          <h3 className="font-bold mb-2">Install ReadLearn</h3>
          <p className="mb-2">
            To install this app on your iOS device, tap the share icon
            <span className="mx-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
            </span>
            and then "Add to Home Screen".
          </p>
        </div>
      ) : (
        <div className="p-3 flex justify-between items-center">
          <div>
            <h3 className="font-bold">Install ReadLearn</h3>
            <p className="text-sm">Install this app on your device for offline use</p>
          </div>
          <button 
            className="btn btn-primary"
            onClick={handleInstall}
          >
            Install
          </button>
        </div>
      )}
    </div>
  );
}

export default InstallPrompt;