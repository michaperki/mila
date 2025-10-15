# Mobile Testing Guide

This document provides instructions for testing the ReadLearn application on mobile devices during development.

## Prerequisites

- Node.js v14+ and npm/pnpm installed
- A mobile device with a modern browser (iOS Safari, Android Chrome)
- Both your development computer and mobile device on the same Wi-Fi network

## Development Server Setup

### 1. Start HTTPS Development Server

```bash
# Using npm
npm run dev:https

# Using pnpm
pnpm dev:https
```

This starts the development server with HTTPS support, which is required for camera access on most mobile browsers.

The server will display several URLs, similar to:

```
  VITE v4.5.0  ready in 350 ms

  ➜  Local:   https://localhost:5173/
  ➜  Network: https://192.168.1.100:5173/
```

### 2. Accessing on Mobile Device

1. Note the "Network" URL shown in your terminal (e.g., `https://192.168.1.100:5173/`)
2. On your mobile device, open the browser and navigate to this URL
3. You will likely see a security warning since we're using a self-signed certificate
4. Tap "Advanced" and then "Proceed to site" (exact wording varies by browser)

### 3. Trust Certificate (iOS Specific)

On iOS devices, you may need to manually trust the certificate:

1. When you see the security warning, go to Settings
2. Navigate to "General" > "Profile" or "Profile & Device Management"
3. Find the certificate from the development server and tap "Trust"

## Testing Camera Access

Camera access works differently across platforms:

### iOS (Safari)
- Use the camera option in the app
- The first time, Safari will ask for permission
- You may need to tap "Allow" in the permission dialog

### Android (Chrome)
- Camera access should work without additional steps after HTTPS is set up
- Grant permission when prompted

## Testing PWA Installation

To test the PWA installation:

### iOS
1. Open the site in Safari
2. Tap the Share button (box with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Customize the name if desired, then tap "Add"

### Android
1. Open the site in Chrome
2. If the app is installable, you'll see an "Add to Home Screen" banner
3. Alternatively, tap the three-dot menu and select "Add to Home Screen"

## Troubleshooting

### Camera Not Working
- Make sure you're accessing the site via HTTPS
- Check browser permissions (may need to be reset in browser settings)
- iOS requires using Safari for camera access through web

### HTTPS Certificate Issues
- Some older devices may not support our self-signed certificates
- For persistent issues, consider using a service like ngrok to provide a secure tunnel

### PWA Not Installable
- Check browser console for any manifest errors
- Ensure the site meets PWA installability criteria
- For iOS, must use Safari; for Android, Chrome is recommended

## Using Tunneling (Alternative Method)

If you have trouble with local network access, you can use a tunneling service like ngrok:

1. Install ngrok: `npm install -g ngrok`
2. Start your dev server: `npm run dev`
3. In another terminal, run: `ngrok http 5173`
4. Use the HTTPS URL provided by ngrok on your mobile device