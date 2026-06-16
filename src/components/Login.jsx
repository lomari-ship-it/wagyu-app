import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: '0 20px' }}>
      <div className="card">
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 500 }}>F10091_JFW</h1>
        <p className="muted" style={{ margin: '0 0 20px' }}>J.A Delport &mdash; Wagyu herd management</p>

        <form onSubmit={handleSubmit} className="stack">
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          {error && <p style={{ color: 'var(--color-danger-text)', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" className="primary" disabled={loading} style={{ width: '100%', marginTop: 4 }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          Accounts are created by the administrator in Supabase. Contact J.A Delport if you need access.
        </p>
      </div>
    </div>
  )
}
