import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import CalfRegistration from './components/CalfRegistration'
import CattleRegister from './components/CattleRegister'
import Batches from './components/Batches'
import Reconciliation from './components/Reconciliation'
import LateRegistrations from './components/LateRegistrations'
import KitaiTransfers from './components/KitaiTransfers'
import LevyList from './components/LevyList'
import NSBA from './components/NSBA'
import NamibianWagyuSociety from './components/NamibianWagyuSociety'
import Namlits from './components/Namlits'
import Reports from './components/Reports'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calves', label: 'Calf Registrations' },
  { id: 'cattle', label: 'Cattle Register' },
  { id: 'batches', label: 'Birth Notifications and DNA Testing' },
  { id: 'late', label: 'Late Registrations' },
  { id: 'levy', label: 'Levy List' },
  { id: 'kitai', label: 'Kitai' },
  { id: 'nws', label: 'Namibian Wagyu Society' },
  { id: 'nsba', label: 'NSBA' },
  { id: 'reports', label: 'Reports' },
  { id: 'reconciliation', label: 'Reconciliation by Owner' },
  { id: 'namlits', label: 'Namlits' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [search, setSearch] = useState('')

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
        {tab === 'calves' && <CalfRegistration search={search} onSearchChange={setSearch} />}
        {tab === 'cattle' && <CattleRegister search={search} onSearchChange={setSearch} />}
        {tab === 'batches' && <Batches search={search} onSearchChange={setSearch} />}
        {tab === 'late' && <LateRegistrations search={search} onSearchChange={setSearch} />}
        {tab === 'kitai' && <KitaiTransfers search={search} onSearchChange={setSearch} />}
        {tab === 'levy' && <LevyList search={search} onSearchChange={setSearch} />}
        {tab === 'nws' && <NamibianWagyuSociety />}
        {tab === 'nsba' && <NSBA />}
        {tab === 'reports' && <Reports />}
        {tab === 'reconciliation' && <Reconciliation search={search} onSearchChange={setSearch} />}
        {tab === 'namlits' && <Namlits />}
      </main>
      <div style={{ position: 'fixed', bottom: 24, right: 20, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 999 }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ fontSize: 14, padding: '6px 10px', borderRadius: 6, opacity: 0.8 }} title="Scroll to top">↑</button>
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} style={{ fontSize: 14, padding: '6px 10px', borderRadius: 6, opacity: 0.8 }} title="Scroll to bottom">↓</button>
      </div>
    </div>
  )
}
