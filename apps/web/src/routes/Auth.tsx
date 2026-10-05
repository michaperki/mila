import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { useAuthStore } from '../state/useAuthStore'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const user = useAuthStore((state) => state.user)
  const signIn = useAuthStore((state) => state.signIn)
  const signUp = useAuthStore((state) => state.signUp)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requestedNext = params.get('next') || '/'
  const next = /^\/(?!\/)/.test(requestedNext) && !requestedNext.includes('\\') && !/^\/(login|signup)(?:[/?#]|$)/.test(requestedNext)
    ? requestedNext : '/'
  const signingUp = mode === 'signup'

  if (user) return <Navigate to={next} replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await (signingUp ? signUp : signIn)(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <Link to="/" aria-label="Mila home"><BrandMark size="lg" /></Link>
      <h1 id="auth-title">{signingUp ? 'Create your Mila account' : 'Welcome back'}</h1>
      <p>Keep your Hebrew captures and vocabulary with you, on every device.</p>
      <form className="settings-account__form" onSubmit={submit} aria-busy={pending}>
        <label className="settings-account__label" htmlFor="auth-email">Email
          <input id="auth-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="settings-account__label" htmlFor="auth-password">Password
          <input id="auth-password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'}
            required minLength={signingUp ? 4 : undefined} value={password}
            onChange={(event) => setPassword(event.target.value)} aria-describedby={signingUp ? 'password-help' : undefined} />
        </label>
        {signingUp && <small id="password-help">Use at least 4 characters.</small>}
        {error && <div className="settings-account__alert settings-account__alert--error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p>{signingUp ? 'Already have an account? ' : 'New to Mila? '}
        <Link to={`${signingUp ? '/login' : '/signup'}?next=${encodeURIComponent(next)}`}>
          {signingUp ? 'Sign in' : 'Create account'}
        </Link>
      </p>
      <Link to="/">Continue as a guest</Link>
    </section>
  )
}
