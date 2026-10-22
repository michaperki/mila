import type { ConfigContext, ExpoConfig } from 'expo/config'

// The development and preview builds each get their own bundle ID, so "Mila Dev" and "Mila
// Preview" install next to the TestFlight app instead of replacing it. Production uses app.json
// unchanged, which keeps its runtime fingerprint stable for updates. APP_VARIANT is part of the
// fingerprint, so a preview update must be published with APP_VARIANT=preview too.
const VARIANTS: Record<string, { name: string; suffix: string }> = {
  development: { name: 'Mila Dev', suffix: 'dev' },
  preview: { name: 'Mila Preview', suffix: 'preview' },
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = VARIANTS[process.env.APP_VARIANT ?? '']
  if (!variant) return config as ExpoConfig
  return {
    ...config,
    name: variant.name,
    scheme: `mila-${variant.suffix}`,
    ios: { ...config.ios, bundleIdentifier: `com.michaperki.mila.${variant.suffix}` },
    android: { ...config.android, package: `com.michaperki.mila.${variant.suffix}` },
  } as ExpoConfig
}
