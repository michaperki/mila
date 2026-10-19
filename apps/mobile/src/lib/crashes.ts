import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'

// Crash and error reports go to Sentry when EXPO_PUBLIC_SENTRY_DSN is set (preview and production
// builds); without it, as in development, nothing is sent. Errors only: no screen replays, no
// performance traces, and no personal data beyond the account id (no email, no text, no photos).
export const crashReporting = !!process.env.EXPO_PUBLIC_SENTRY_DSN

export function startCrashReporting() {
  if (!crashReporting) return
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    sendDefaultPii: false,
    environment: Updates.channel || 'development',
    // An over-the-air update keeps the build's runtime, so tag which update was running.
    ...(Updates.updateId ? { dist: Updates.updateId } : {}),
  })
}

export function reportCrash(error: unknown) {
  if (crashReporting) Sentry.captureException(error)
}

// Which account the reports belong to (its id only), so a tester's report can be matched.
export function identify(userId: string | null) {
  if (crashReporting) Sentry.setUser(userId ? { id: userId } : null)
}

// A failed server request is kept as a breadcrumb, so a crash report shows the requests before it,
// with the request id to find in the Netlify logs.
export function noteFailedRequest(path: string, status: number, requestId?: string) {
  if (crashReporting) Sentry.addBreadcrumb({ category: 'api', level: 'warning', message: `${path.split('?')[0]} ${status}`, data: requestId ? { requestId } : undefined })
}

export const wrapRoot = Sentry.wrap
