// When a saved sign-in token runs out (ms since 1970), read from the token itself, or null if it
// can't be read. Only used to decide whether the app can open before the token is refreshed;
// the server still checks every token.
export function tokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const exp = (JSON.parse(atob(base64)) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch { return null }
}
