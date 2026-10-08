import type { ConfigContext, ExpoConfig } from 'expo/config'

// The development build gets its own bundle ID so it installs next to the preview
// build (the one you carry around) instead of replacing it. Preview/production use
// app.json unchanged, which keeps their runtime fingerprint stable for updates.
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.APP_VARIANT !== 'development') return config as ExpoConfig
  return {
    ...config,
    name: 'Mila Dev',
    scheme: 'mila-dev',
    ios: { ...config.ios, bundleIdentifier: 'com.michaperki.mila.dev' },
    android: { ...config.android, package: 'com.michaperki.mila.dev' },
  } as ExpoConfig
}
