import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtAmt(n) {
  if (n == null || n === '') return '—'
  return `N$ ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const YEAR_OPTIONS = (() => {
  const years = []
  for (let y = 2023; y <= new Date().getFullYear() + 1; y++) years.push(`${y}/${y + 1}`)
  return years
})()

const emptyM = { invoice_date: '', invoice_number: '', membership_year: '2023/2024', payment_date: '', amount: '' }
const emptyH = { invoice_date: '', invoice_number: '', membership_year: '2023/2024', payment_date: '', rate_per_head: '', invoiced_count: '', invoiced_amount: '', notes: '' }

function fyLabel(y) { return `${y}/${y + 1}` }
function fyStartDate(y) { return `${y}-07-01` }

function getCurrentFY() {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

export default function NSBA() {
  const [memberships, setMemberships] = useState([])
  const [herdFees, setHerdFees] = useState([])
  const [calves, setCalves] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [loading, setLoading] = useState(true)
  const [membershipOpen, setMembershipOpen] = useState(false)
  const [herdOpen, setHerdOpen] = useState(false)
  const [membershipYears, setMembershipYears] = useState({})
  const [herdYears, setHerdYears] = useState({})
  const [showMForm, setShowMForm] = useState(false)
  const [showHForm, setShowHForm] = useState(false)
  const [mForm, setMForm] = useState(emptyM)
  const [hForm, setHForm] = useState(emptyH)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: mData }, { data: hData }, { data: cData }, { data: bData }] = await Promise.all([
      supabase.from('society_memberships').select('*').eq('society', 'NSBA').order('membership_year'),
      supabase.from('society_herd_fees').select('*').eq('society', 'NSBA').order('membership_year'),
      supabase.from('calves').select('id,ear_tag,identity_number,birth_date,owner,namlits_ownership'),
      supabase.from('cattle_register').select('id,ear_tag,identity_number,owner,purchase_date,namlits_ownership').eq('animal_type','breeding'),
    ])
    setMemberships(mData || [])
    setHerdFees(hData || [])
    setCalves(cData || [])
    setBreedingAnimals(bData || [])
    setLoading(false)
  }

  function calcHerd(fyStartYear) {
    if (fyStartYear === 2023) return { count: 50, isBase: true }
    const cutoff = fyStartDate(fyStartYear)
    const includeKW = fyStartYear >= 2026
    const newCalves = calves.filter(c => {
      if (!c.birth_date || c.birth_date < '2023-07-01' || c.birth_date >= cutoff) return false
      const id = (c.identity_number || '').toUpperCase()
      return id.includes('ISA') || (includeKW && id.includes('KW'))
    })
    const purchasedBreeding = breedingAnimals.filter(b => b.purchase_date && b.purchase_date < cutoff)
    return { count: 50 + newCalves.length + purchasedBreeding.length, isBase: false, newCalves, purchasedBreeding }
  }

  function calcOwnerHerd(owner, fyStartYear) {
    if (fyStartYear === 2023) {
      const baseOwner = calves.filter(c => {
        if (c.owner !== owner) return false
        const id = (c.identity_number || '').toUpperCase()
        return id.includes('ISA')
      })
      return baseOwner.length
    }
    const cutoff = fyStartDate(fyStartYear)
    const includeKW = fyStartYear >= 2026
    const oc = calves.filter(c => {
      if (c.owner !== owner || !c.birth_date || c.birth_date < '2023-07-01' || c.birth_date >= cutoff) return false
      const id = (c.identity_number || '').toUpperCase()
      return id.includes('ISA') || (includeKW && id.includes('KW'))
    }).length
    const ob = breedingAnimals.filter(b => b.owner === owner && b.purchase_date && b.purchase_date < cutoff).length
    return oc + ob
  }

  const currentFY = getCurrentFY()
  const fyYears = []
  for (let y = currentFY; y >= 2023; y--) fyYears.push(y)

  const totalM = memberships.reduce((s, m) => s + (Number(m.amount) || 0), 0)
  const totalH = herdFees.reduce((s, h) => s + (Number(h.invoiced_amount) || 0), 0)

  async function saveMembership(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    const { error } = await supabase.from('society_memberships').insert({ ...mForm, society: 'NSBA', amount: Number(mForm.amount) || null })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setMForm(emptyM); setShowMForm(false); loadAll()
  }
  async function saveHerdFee(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    const { error } = await supabase.from('society_herd_fees').insert({
      ...hForm, society: 'NSBA',
      rate_per_head: Number(hForm.rate_per_head) || null,
      invoiced_count: Number(hForm.invoiced_count) || null,
      invoiced_amount: Number(hForm.invoiced_amount) || null,
    })
    setSaving(false)
    if (error) { setMsg(error.message); return }
    setHForm(emptyH); setShowHForm(false); loadAll()
  }

  const th = { textAlign: 'left', padding: '6px 8px 6px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }
  const td = { padding: '8px 8px 8px 0' }

  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>

  return (
    <div className="stack" style={{ gap: 24 }}>

      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 500 }}>NSBA — Summary</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>Owner</th>
              <th style={{ ...th, textAlign: 'right' }}>Membership</th>
              <th style={{ ...th, textAlign: 'right' }}>Herd fees</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {OWNERS.map(o => {
              const m = totalM / 3
              const h = herdFees.reduce((s, hf) => {
                const fy = parseInt(hf.membership_year)
                const ownerCount = calcOwnerHerd(o, fy)
                return s + ownerCount * (Number(hf.rate_per_head) || 0)
              }, 0)
              return (
                <tr key={o} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>{o}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtAmt(m)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtAmt(h)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{fmtAmt(m + h)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}>
              <td style={{ ...td, paddingTop: 10 }}>Total</td>
              <td style={{ ...td, paddingTop: 10, textAlign: 'right' }}>{fmtAmt(totalM)}</td>
              <td style={{ ...td, paddingTop: 10, textAlign: 'right' }}>{fmtAmt(totalH)}</td>
              <td style={{ ...td, paddingTop: 10, textAlign: 'right' }}>{fmtAmt(totalM + totalH)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Section 1: Annual Membership */}
      <div className="card" style={{ padding: 0 }}>
        <div onClick={() => setMembershipOpen(v => !v)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'14px 16px', userSelect:'none' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Annual Membership</h3>
          <span style={{ fontSize: 18, color: 'var(--color-text-muted)', transform: membershipOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
        </div>
        {membershipOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 16 }}>
            <button className="primary" style={{ marginBottom: 16 }} onClick={() => setShowMForm(v => !v)}>{showMForm ? 'Cancel' : '+ Add invoice'}</button>
            {showMForm && (
              <form onSubmit={saveMembership} className="grid-form" style={{ marginBottom: 20 }}>
                <div><label>Membership year *</label>
                  <select required value={mForm.membership_year} onChange={e => setMForm(f => ({ ...f, membership_year: e.target.value }))}>
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div><label>Invoice number *</label><input required value={mForm.invoice_number} onChange={e => setMForm(f => ({ ...f, invoice_number: e.target.value }))} /></div>
                <div><label>Invoice date *</label><input required type="date" value={mForm.invoice_date} onChange={e => setMForm(f => ({ ...f, invoice_date: e.target.value }))} /></div>
                <div><label>Payment date</label><input type="date" value={mForm.payment_date} onChange={e => setMForm(f => ({ ...f, payment_date: e.target.value }))} /></div>
                <div><label>Total amount (N$) *</label><input required type="number" step="0.01" value={mForm.amount} onChange={e => setMForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  {msg && <p style={{ color:'var(--color-danger)', margin:'0 0 8px' }}>{msg}</p>}
                  <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save invoice'}</button>
                </div>
              </form>
            )}
            {YEAR_OPTIONS.slice().reverse().map(yr => {
              const recs = memberships.filter(m => m.membership_year === yr)
              if (!recs.length) return null
              const total = recs.reduce((s, r) => s + (Number(r.amount) || 0), 0)
              const open = membershipYears[yr] === true
              return (
                <div key={yr} style={{ marginBottom: 12, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div onClick={() => setMembershipYears(s => ({ ...s, [yr]: !open }))} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', cursor:'pointer', background:'var(--color-bg-subtle)', userSelect:'none' }}>
                    <span style={{ fontWeight: 500 }}>{yr}</span>
                    <div className="row" style={{ gap: 12 }}>
                      <span className="muted" style={{ fontSize: 13 }}>{fmtAmt(total)}</span>
                      <span style={{ fontSize: 16, color:'var(--color-text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.2s' }}>&#8964;</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ padding: 14 }}>
                      {recs.map(r => (
                        <div key={r.id} style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr) auto', gap:'8px 16px', alignItems:'start', padding:'8px 0', borderBottom:'1px solid var(--color-border)' }}>
                          <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{r.invoice_number}</div></div>
                          <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(r.invoice_date)}</div></div>
                          <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{r.payment_date ? fmtDate(r.payment_date) : <span className="faint">—</span>}</div></div>
                          <div><div className="muted" style={{ fontSize:11 }}>Total</div><div style={{ fontWeight:500 }}>{fmtAmt(r.amount)}</div></div>
                          <button className="danger-text" style={{ fontSize:12 }} onClick={() => supabase.from('society_memberships').delete().eq('id',r.id).then(loadAll)}>Delete</button>
                        </div>
                      ))}
                      <div style={{ marginTop:12, padding:'12px 0', borderTop:'2px solid var(--color-border)', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                        {OWNERS.map(o => (
                          <div key={o} style={{ background:'var(--color-bg-subtle)', borderRadius:6, padding:10 }}>
                            <div className="muted" style={{ fontSize:11, marginBottom:4 }}>{o}</div>
                            <div style={{ fontWeight:500 }}>{fmtAmt(total / 3)}</div>
                            <div className="muted" style={{ fontSize:11 }}>÷ 3</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!memberships.length && <p className="muted">No membership invoices recorded yet.</p>}
          </div>
        )}
      </div>

      {/* Section 2: Herd Fees */}
      <div className="card" style={{ padding: 0 }}>
        <div onClick={() => setHerdOpen(v => !v)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'14px 16px', userSelect:'none' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Herd Fees</h3>
          <span style={{ fontSize: 18, color:'var(--color-text-muted)', transform: herdOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.2s' }}>&#8964;</span>
        </div>
        {herdOpen && (
          <div style={{ borderTop:'1px solid var(--color-border)', padding:16 }}>
            <button className="primary" style={{ marginBottom:16 }} onClick={() => setShowHForm(v => !v)}>{showHForm ? 'Cancel' : '+ Add invoice'}</button>
            {showHForm && (
              <form onSubmit={saveHerdFee} className="grid-form" style={{ marginBottom:20 }}>
                <div><label>Membership year *</label>
                  <select required value={hForm.membership_year} onChange={e => setHForm(f => ({ ...f, membership_year: e.target.value }))}>
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div><label>Invoice number *</label><input required value={hForm.invoice_number} onChange={e => setHForm(f => ({ ...f, invoice_number: e.target.value }))} /></div>
                <div><label>Invoice date *</label><input required type="date" value={hForm.invoice_date} onChange={e => setHForm(f => ({ ...f, invoice_date: e.target.value }))} /></div>
                <div><label>Payment date</label><input type="date" value={hForm.payment_date} onChange={e => setHForm(f => ({ ...f, payment_date: e.target.value }))} /></div>
                <div><label>Rate per head (N$)</label><input type="number" step="0.01" value={hForm.rate_per_head} onChange={e => setHForm(f => ({ ...f, rate_per_head: e.target.value }))} placeholder="0.00" /></div>
                <div><label>NSBA invoiced count</label><input type="number" value={hForm.invoiced_count} onChange={e => setHForm(f => ({ ...f, invoiced_count: e.target.value }))} placeholder="0" /></div>
                <div><label>NSBA invoiced amount (N$)</label><input type="number" step="0.01" value={hForm.invoiced_amount} onChange={e => setHForm(f => ({ ...f, invoiced_amount: e.target.value }))} placeholder="0.00" /></div>
                <div><label>Notes</label><input value={hForm.notes} onChange={e => setHForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <div style={{ gridColumn:'1 / -1' }}>
                  {msg && <p style={{ color:'var(--color-danger)', margin:'0 0 8px' }}>{msg}</p>}
                  <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save invoice'}</button>
                </div>
              </form>
            )}
            {fyYears.map(fyYear => {
              const label = fyLabel(fyYear)
              const { count: ourCount, isBase } = calcHerd(fyYear)
              const invoice = herdFees.find(h => h.membership_year === label)
              const invoicedCount = invoice ? Number(invoice.invoiced_count) : null
              const discrepancy = invoicedCount != null ? invoicedCount - ourCount : null
              const open = herdYears[label] === true
              return (
                <div key={label} style={{ marginBottom:12, border:'1px solid var(--color-border)', borderRadius:6, overflow:'hidden' }}>
                  <div onClick={() => setHerdYears(s => ({ ...s, [label]: !open }))} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', cursor:'pointer', background:'var(--color-bg-subtle)', userSelect:'none' }}>
                    <span style={{ fontWeight:500 }}>{label}</span>
                    <div className="row" style={{ gap:12 }}>
                      {discrepancy !== null && discrepancy !== 0 && <span style={{ fontSize:12, background:'var(--color-danger-bg,#fef2f2)', color:'var(--color-danger)', padding:'2px 8px', borderRadius:4 }}>Discrepancy: {discrepancy > 0 ? '+' : ''}{discrepancy}</span>}
                      {discrepancy === 0 && <span style={{ fontSize:12, color:'var(--color-success-text,#15803d)' }}>✓ Agrees</span>}
                      <span className="muted" style={{ fontSize:13 }}>{ourCount} head</span>
                      <span style={{ fontSize:16, color:'var(--color-text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.2s' }}>&#8964;</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ padding:14 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'12px 20px', marginBottom:16 }}>
                        <div style={{ background:'var(--color-bg-subtle)', borderRadius:6, padding:12 }}>
                          <div className="muted" style={{ fontSize:11, marginBottom:4 }}>Our count</div>
                          <div style={{ fontSize:22, fontWeight:600 }}>{ourCount}</div>
                          {isBase && <div className="muted" style={{ fontSize:11 }}>Base — 50 ISA animals</div>}
                        </div>
                        <div style={{ background:'var(--color-bg-subtle)', borderRadius:6, padding:12 }}>
                          <div className="muted" style={{ fontSize:11, marginBottom:4 }}>NSBA invoiced</div>
                          <div style={{ fontSize:22, fontWeight:600 }}>{invoicedCount ?? <span className="faint">—</span>}</div>
                        </div>
                        <div style={{ background: discrepancy ? 'var(--color-danger-bg,#fef2f2)' : 'var(--color-bg-subtle)', borderRadius:6, padding:12 }}>
                          <div className="muted" style={{ fontSize:11, marginBottom:4 }}>Discrepancy</div>
                          <div style={{ fontSize:22, fontWeight:600, color: discrepancy ? 'var(--color-danger)' : undefined }}>
                            {discrepancy != null ? (discrepancy > 0 ? `+${discrepancy}` : discrepancy) : <span className="faint">—</span>}
                          </div>
                        </div>
                        <div style={{ background:'var(--color-bg-subtle)', borderRadius:6, padding:12 }}>
                          <div className="muted" style={{ fontSize:11, marginBottom:4 }}>Rate / head</div>
                          <div style={{ fontSize:18, fontWeight:600 }}>{invoice?.rate_per_head ? fmtAmt(invoice.rate_per_head) : <span className="faint">—</span>}</div>
                        </div>
                      </div>
                      {invoice && (
                        <>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr) auto', gap:'8px 16px', alignItems:'start', padding:'8px 0', borderBottom:'1px solid var(--color-border)' }}>
                            <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{invoice.invoice_number}</div></div>
                            <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(invoice.invoice_date)}</div></div>
                            <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{invoice.payment_date ? fmtDate(invoice.payment_date) : <span className="faint">—</span>}</div></div>
                            <div><div className="muted" style={{ fontSize:11 }}>Invoiced amount</div><div style={{ fontWeight:500 }}>{fmtAmt(invoice.invoiced_amount)}</div></div>
                            <div><div className="muted" style={{ fontSize:11 }}>Our calculation</div><div>{invoice.rate_per_head ? fmtAmt(ourCount * Number(invoice.rate_per_head)) : <span className="faint">—</span>}</div></div>
                            <button className="danger-text" style={{ fontSize:12 }} onClick={() => supabase.from('society_herd_fees').delete().eq('id',invoice.id).then(loadAll)}>Delete</button>
                          </div>
                          <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
                            {OWNERS.map(o => {
                              const oc = calcOwnerHerd(o, fyYear)
                              const amt = invoice.rate_per_head ? oc * Number(invoice.rate_per_head) : null
                              return (
                                <div key={o} style={{ background:'var(--color-bg-subtle)', borderRadius:6, padding:10 }}>
                                  <div className="muted" style={{ fontSize:11, marginBottom:2 }}>{o}</div>
                                  <div style={{ fontWeight:500 }}>{amt != null ? fmtAmt(amt) : <span className="faint">—</span>}</div>
                                  <div className="muted" style={{ fontSize:11 }}>{oc} head</div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                      {!invoice && <p className="muted" style={{ margin:0, fontSize:13 }}>No invoice recorded yet. Add one above.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
