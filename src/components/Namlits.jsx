import { useEffect, useState } from 'react'
import { supabase, NAMLITS_OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }

const thStyle = { textAlign: 'left', padding: '6px 8px 6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }
const tdStyle = { padding: '8px 8px 8px 0', verticalAlign: 'top' }
const borderTop = { borderTop: '2px solid var(--color-border)' }

function SectionHeader({ title, count, open, onToggle, badge }) {
  return (
    <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
      <div className="row" style={{ gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{title}</h3>
        {badge && <span className="badge neutral" style={{ fontSize: 11 }}>{badge}</span>}
      </div>
      <div className="row" style={{ gap: 12 }}>
        <span className="muted">{count} record{count !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
      </div>
    </div>
  )
}

function CattleTable({ cattle, showSoldBadge = false }) {
  if (cattle.length === 0) return <p className="muted" style={{ margin: '12px 0' }}>No cattle in this category.</p>
  return (
    <ScrollTable>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Ear tag</th>
            <th style={thStyle}>Identity no.</th>
            <th style={thStyle}>Color</th>
            <th style={thStyle}>Sex</th>
            <th style={thStyle}>DOB</th>
            <th style={thStyle}>Breed</th>
            <th style={thStyle}>Namlits Ownership</th>
            {showSoldBadge && <th style={thStyle}>Status</th>}
          </tr>
        </thead>
        <tbody>
          {cattle.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={tdStyle}>{c.owner}</td>
              <td style={tdStyle}><strong>{c.ear_tag}</strong></td>
              <td style={tdStyle}>{c.identity_number || <span className="faint">—</span>}</td>
              <td style={tdStyle}>{c.color || <span className="faint">—</span>}</td>
              <td style={tdStyle}>{c.sex || <span className="faint">—</span>}</td>
              <td style={tdStyle}>{c.birth_date ? formatDate(c.birth_date) : <span className="faint">—</span>}</td>
              <td style={tdStyle}>{c.breed || <span className="faint">—</span>}</td>
              <td style={tdStyle}>{c.namlits_ownership || <span className="faint">—</span>}</td>
              {showSoldBadge && (
                <td style={tdStyle}>
                  {c._sold ? <span className="badge success" style={{ fontSize: 11 }}>Sold</span> : <span className="badge neutral" style={{ fontSize: 11 }}>Active</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 500, ...borderTop }}>
            <td style={{ ...tdStyle, paddingTop: 10 }} colSpan={showSoldBadge ? 8 : 7}>Total</td>
            <td style={{ ...tdStyle, paddingTop: 10, textAlign: 'right' }}>{cattle.length}</td>
          </tr>
        </tfoot>
      </table>
    </ScrollTable>
  )
}

export default function Namlits() {
  const [calves, setCalves] = useState([])
  const [soldIds, setSoldIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState({
    all: false, sold: false,
    ...Object.fromEntries(NAMLITS_OWNERS.map(o => [o, false])),
  })

  useEffect(() => {
    loadData()
    const sub = supabase
      .channel('namlits-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calves' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitai_transfers' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: calvesData }, { data: transfersData }] = await Promise.all([
      supabase.from('calves').select('*').order('created_at', { ascending: false }),
      supabase.from('kitai_transfers').select('ear_tag, sold_flag').eq('sold_flag', true),
    ])
    const allCalves = calvesData || []
    setCalves(allCalves)
    const soldEarTags = new Set((transfersData || []).map(t => t.ear_tag).filter(Boolean))
    const sold = new Set(allCalves.filter(c => c.sold_flag || soldEarTags.has(c.ear_tag)).map(c => c.id))
    setSoldIds(sold)
    setLoading(false)
  }

  function toggle(key) { setOpen(s => ({ ...s, [key]: !s[key] })) }

  const allWithFlag = calves.map(c => ({ ...c, _sold: soldIds.has(c.id) }))
  const activeCalves = allWithFlag.filter(c => !c._sold)
  const soldCalves = allWithFlag.filter(c => c._sold)
  const summaryRows = NAMLITS_OWNERS.map(owner => ({
    owner,
    active: activeCalves.filter(c => c.namlits_ownership === owner).length,
    sold: soldCalves.filter(c => c.namlits_ownership === owner).length,
    total: allWithFlag.filter(c => c.namlits_ownership === owner).length,
  }))

  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 500 }}>Namlits — Summary</h2>
        <ScrollTable>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={thStyle}>Namlits Ownership</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Active</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sold</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(row => (
                <tr key={row.owner} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={tdStyle}>{row.owner}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.active > 0 ? row.active : <span className="faint">—</span>}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.sold > 0 ? <span style={{ color: 'var(--color-success-text, #15803d)' }}>{row.sold}</span> : <span className="faint">—</span>}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{row.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 500, ...borderTop }}>
                <td style={{ ...tdStyle, paddingTop: 10 }}>Total</td>
                <td style={{ ...tdStyle, paddingTop: 10, textAlign: 'right' }}>{activeCalves.length}</td>
                <td style={{ ...tdStyle, paddingTop: 10, textAlign: 'right', color: soldCalves.length > 0 ? 'var(--color-success-text, #15803d)' : undefined }}>{soldCalves.length}</td>
                <td style={{ ...tdStyle, paddingTop: 10, textAlign: 'right' }}>{allWithFlag.length}</td>
              </tr>
            </tfoot>
          </table>
        </ScrollTable>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <SectionHeader title="All registered cattle" count={allWithFlag.length} open={open.all} onToggle={() => toggle('all')} />
        {open.all && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}><CattleTable cattle={allWithFlag} showSoldBadge /></div>}
      </div>

      {NAMLITS_OWNERS.map(owner => {
        const ownerActive = activeCalves.filter(c => c.namlits_ownership === owner)
        if (ownerActive.length === 0) return null
        return (
          <div key={owner} className="card" style={{ padding: 0 }}>
            <SectionHeader title={owner} count={ownerActive.length} open={open[owner]} onToggle={() => toggle(owner)} badge="Active" />
            {open[owner] && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}><CattleTable cattle={ownerActive} /></div>}
          </div>
        )
      })}

      <div className="card" style={{ padding: 0 }}>
        <SectionHeader title="Sold cattle" count={soldCalves.length} open={open.sold} onToggle={() => toggle('sold')} />
        {open.sold && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
            {soldCalves.length === 0 ? <p className="muted" style={{ margin: '12px 0' }}>No sold cattle recorded.</p> : <CattleTable cattle={soldCalves} />}
          </div>
        )}
      </div>
    </div>
  )
}
