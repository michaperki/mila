import { Platform } from 'react-native'
import * as Updates from 'expo-updates'
// Which build and over-the-air update is running; attached to field reports and shown in Account.
export function appInfo() {
  return {
    platform: Platform.OS,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    updatedAt: Updates.createdAt?.toISOString() ?? null,
    embedded: Updates.isEmbeddedLaunch,
  }
}
export function describeVersion() {
  if (!Updates.isEnabled) return 'Development build'
  const when = Updates.createdAt ? Updates.createdAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date'
  return `${Updates.channel || 'no channel'} · ${Updates.isEmbeddedLaunch ? 'built-in code' : `update ${Updates.updateId?.slice(0, 8)}`} · ${when}`
}
// Checks, downloads and restarts into a newer update. Returns false when already current.
export async function applyLatestUpdate() {
  if (!Updates.isEnabled) return false
  const check = await Updates.checkForUpdateAsync()
  if (!check.isAvailable) return false
  await Updates.fetchUpdateAsync()
  await Updates.reloadAsync()
  return true
}
