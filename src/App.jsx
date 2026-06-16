import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import CalfRegistration from './components/CalfRegistration'
import CattleRegister from './components/CattleRegister'
import Batches from './components/Batches'
import Reconciliation from './components/Reconciliation'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calves', label: 'Calf registration' },
  { id: 'cattle', label: 'Cattle register' },
  { id: 'batches', label: 'Batches & invoices' },
  { id: 'reconciliation', label: 'Reconciliation' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>F10091_JFW &mdash; J.A Delport</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Wagyu herd management</p>
        </div>
        <div className="row">
          <span className="muted">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--color-border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'primary' : ''}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'calves' && <CalfRegistration />}
        {tab === 'cattle' && <CattleRegister />}
        {tab === 'batches' && <Batches />}
        {tab === 'reconciliation' && <Reconciliation />}
      </main>
    </div>
  )
}
