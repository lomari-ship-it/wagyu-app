import { useEffect, useRef, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'

const BUCKET = 'batch-documents'

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

const emptyM = { invoice_date: '', invoice_number: '', membership_year: '2023/2024', payment_date: '', amount: '', notes: '' }
const emptyC = { invoice_date: '', invoice_number: '', membership_year: '2023/2024', payment_date: '', rate_per_head: '', head_count: '', invoiced_amount: '', notes: '' }

const fs = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', marginBottom: 20 }

function fyStartDate(y) { return `${y}-07-01` }

function InvoiceFile({ id, table, fileUrl, fileName, onUpdate }) {
  const ref = useRef()
  const [busy, setBusy] = useState(false)
  async function upload(e) {
    const file = e.target.files[0]; if (!file) return
    setBusy(true)
    const path = `invoices/${table}-${id}-${Date.now()}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) { alert(error.message); setBusy(false); return }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    await supabase.from(table).update({ file_url: data.publicUrl, file_name: file.name }).eq('id', id)
    setBusy(false); onUpdate(); e.target.value = ''
  }
  async function remove() {
    if (!window.confirm('Remove invoice file?')) return
    await supabase.from(table).update({ file_url: null, file_name: null }).eq('id', id)
    onUpdate()
  }
  return (
    <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 12 }}>Invoice:</span>
      {fileUrl ? <><a href={fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📎 {fileName}</a><button onClick={remove} className="danger-text" style={{ fontSize: 11 }}>Remove</button></> : <span className="muted" style={{ fontSize: 12 }}>None uploaded</span>}
      <label style={{ cursor: 'pointer' }}><span className="button" style={{ fontSize: 11 }}>{busy ? 'Uploading…' : fileUrl ? 'Replace' : 'Upload'}</span><input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={upload} style={{ display: 'none' }} disabled={busy} /></label>
    </div>
  )
}

export default function NamibianWagyuSociety() {
  const [memberships, setMemberships] = useState([])
  const [capitaFees, setCapitaFees] = useState([])
  const [calves, setCalves] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [loading, setLoading] = useState(true)
  const [membershipOpen, setMembershipOpen] = useState(false)
  const [capitaOpen, setCapitaOpen] = useState(false)
  const [membershipYears, setMembershipYears] = useState({})
  const [capitaYears, setCapitaYears] = useState({})
  const [showMForm, setShowMForm] = useState(false)
  const [showCForm, setShowCForm] = useState(false)
  const [mForm, setMForm] = useState(emptyM)
  const [cForm, setCForm] = useState(emptyC)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { loadAll() }, [])
  async function loadAll() {
    setLoading(true)
    const [{ data: mData }, { data: cData }, { data: calvesData }, { data: bData }] = await Promise.all([
      supabase.from('society_memberships').select('*').eq('society', 'NWS').order('membership_year'),
      supabase.from('society_herd_fees').select('*').eq('society', 'NWS').order('membership_year'),
      supabase.from('calves').select('id,owner,identity_number,ear_tag,birth_date'),
      supabase.from('cattle_register').select('id,owner,ear_tag,identity_number,purchase_date').eq('animal_type', 'breeding'),
    ])
    setMemberships(mData || []); setCapitaFees(cData || []); setCalves(calvesData || []); setBreedingAnimals(bData || []); setLoading(false)
  }
  function calcOwnerCapita(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear); const includeKW = fyStartYear >= 2026
    const oc = calves.filter(c => { if (c.owner !== owner || !c.birth_date || c.birth_date < '2023-07-01' || c.birth_date >= cutoff) return false; const id = (c.identity_number || '').toUpperCase(); return id.includes('ISA') || (includeKW && id.includes('KW')) }).length
    const ob = breedingAnimals.filter(b => b.owner === owner && b.purchase_date && b.purchase_date < cutoff).length
    return oc + ob
  }
  function getOwnerCattleList(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear); const includeKW = fyStartYear >= 2026
    const c = calves.filter(c => { if (c.owner !== owner || !c.birth_date || c.birth_date < '2023-07-01' || c.birth_date >= cutoff) return false; const id = (c.identity_number || '').toUpperCase(); return id.includes('ISA') || (includeKW && id.includes('KW')) })
    const b = breedingAnimals.filter(b => b.owner === owner && b.purchase_date && b.purchase_date < cutoff)
    return { calves: c, breeding: b }
  }
  function totalCapitaCount(fyStartYear) { return OWNERS.reduce((s, o) => s + calcOwnerCapita(o, fyStartYear), 0) || 1 }
  function calcNwsTieredAmount(headCount) {
    if (!headCount || headCount <= 0) return 0
    let amt = 0
    const tiers = [{ max: 100, rate: 100 }, { max: 200, rate: 40 }, { max: 300, rate: 30 }, { max: 500, rate: 20 }]
    let remaining = headCount; let prev = 0
    for (const tier of tiers) {
      if (remaining <= 0) break
      const inTier = Math.min(remaining, tier.max - prev)
      amt += inTier * tier.rate; remaining -= inTier; prev = tier.max
    }
    return amt
  }
  const totalM = memberships.reduce((s, m) => s + (Number(m.amount) || 0), 0)
  const totalC = capitaFees.reduce((s, c) => s + (Number(c.invoiced_amount) || 0), 0)
  function ownerCapitaTotal(owner) { return capitaFees.reduce((sum, cf) => { const fy = parseInt(cf.membership_year); const oc = calcOwnerCapita(owner, fy); const tc = totalCapitaCount(fy); return sum + (Number(cf.invoiced_amount) || 0) * (oc / tc) }, 0) }
  async function saveMembership(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    const { error } = await supabase.from('society_memberships').insert({ ...mForm, society: 'NWS', amount: Number(mForm.amount) || null, invoice_date: mForm.invoice_date || null, payment_date: mForm.payment_date || null })
    setSaving(false); if (error) { setMsg(error.message); return }
    setMForm(emptyM); setShowMForm(false); loadAll()
  }
  async function saveCapita(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    const { error } = await supabase.from('society_herd_fees').insert({ ...cForm, society: 'NWS', rate_per_head: Number(cForm.rate_per_head) || null, invoiced_count: Number(cForm.head_count) || null, invoiced_amount: Number(cForm.invoiced_amount) || null, invoice_date: cForm.invoice_date || null, payment_date: cForm.payment_date || null })
    setSaving(false); if (error) { setMsg(error.message); return }
    setCForm(emptyC); setShowCForm(false); loadAll()
  }
  const th = { textAlign: 'left', padding: '6px 8px 6px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }
  const td = { padding: '8px 8px 8px 0' }
  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 500 }}>Namibian Wagyu Society — Summary</h2>
        <ScrollTable><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}><th style={th}>Owner</th><th style={{ ...th, textAlign: 'right' }}>Membership</th><th style={{ ...th, textAlign: 'right' }}>Capita fees</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>{OWNERS.map(o => { const m=totalM/3; const c=ownerCapitaTotal(o); return (<tr key={o} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={td}>{o}</td><td style={{ ...td, textAlign:'right' }}>{fmtAmt(m)}</td><td style={{ ...td, textAlign:'right' }}>{fmtAmt(c)}</td><td style={{ ...td, textAlign:'right', fontWeight:500 }}>{fmtAmt(m+c)}</td></tr>) })}</tbody>
          <tfoot><tr style={{ fontWeight:500, borderTop:'2px solid var(--color-border)' }}><td style={{ ...td, paddingTop:10 }}>Total</td><td style={{ ...td, paddingTop:10, textAlign:'right' }}>{fmtAmt(totalM)}</td><td style={{ ...td, paddingTop:10, textAlign:'right' }}>{fmtAmt(totalC)}</td><td style={{ ...td, paddingTop:10, textAlign:'right' }}>{fmtAmt(totalM+totalC)}</td></tr></tfoot>
        </table></ScrollTable>
      </div>
      <div className="card" style={{ padding:0 }}>
        <div onClick={()=>setMembershipOpen(v=>!v)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'14px 16px',userSelect:'none' }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:500 }}>Annual Membership</h3>
          <span style={{ fontSize:18,color:'var(--color-text-muted)',transform:membershipOpen?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
        </div>
        {membershipOpen && (<div style={{ borderTop:'1px solid var(--color-border)',padding:16 }}>
          <button className="primary" style={{ marginBottom:16 }} onClick={()=>setShowMForm(v=>!v)}>{showMForm?'Cancel':'+ Add invoice'}</button>
          {showMForm && (<form onSubmit={saveMembership} style={fs}>
            <div><label>Membership year *</label><select required value={mForm.membership_year} onChange={e=>setMForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            <div><label>Invoice number *</label><input required value={mForm.invoice_number} onChange={e=>setMForm(f=>({...f,invoice_number:e.target.value}))} /></div>
            <div><label>Invoice date *</label><input required type="date" value={mForm.invoice_date} onChange={e=>setMForm(f=>({...f,invoice_date:e.target.value}))} /></div>
            <div><label>Payment date</label><input type="date" value={mForm.payment_date} onChange={e=>setMForm(f=>({...f,payment_date:e.target.value}))} /></div>
            <div><label>Total amount (N$) *</label><input required type="number" step="0.01" value={mForm.amount} onChange={e=>setMForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Notes</label><input value={mForm.notes} onChange={e=>setMForm(f=>({...f,notes:e.target.value}))} /></div>
            <div style={{ gridColumn:'1/-1' }}>{msg&&<p style={{ color:'var(--color-danger)',margin:'0 0 8px' }}>{msg}</p>}<button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save invoice'}</button></div>
          </form>)}
          {YEAR_OPTIONS.slice().reverse().map(yr => {
            const recs=memberships.filter(m=>m.membership_year===yr); if(!recs.length) return null
            const total=recs.reduce((s,r)=>s+(Number(r.amount)||0),0); const open=membershipYears[yr]===true
            return (<div key={yr} style={{ marginBottom:12,border:'1px solid var(--color-border)',borderRadius:6,overflow:'hidden' }}>
              <div onClick={()=>setMembershipYears(s=>({...s,[yr]:!open}))} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',cursor:'pointer',background:'var(--color-bg-subtle)',userSelect:'none' }}>
                <span style={{ fontWeight:500 }}>{yr}</span>
                <div className="row" style={{ gap:12 }}><span className="muted" style={{ fontSize:13 }}>{fmtAmt(total)}</span><span style={{ fontSize:16,color:'var(--color-text-muted)',transform:open?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span></div>
              </div>
              {open&&(<div style={{ padding:14 }}>{recs.map(r=>(<div key={r.id} style={{ padding:'8px 0',borderBottom:'1px solid var(--color-border)' }}>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr) auto',gap:'8px 16px',alignItems:'start' }}>
                  <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{r.invoice_number}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(r.invoice_date)}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{r.payment_date?fmtDate(r.payment_date):<span className="faint">—</span>}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Total</div><div style={{ fontWeight:500 }}>{fmtAmt(r.amount)}</div></div>
                  <button className="danger-text" style={{ fontSize:12 }} onClick={()=>supabase.from('society_memberships').delete().eq('id',r.id).then(loadAll)}>Delete</button>
                </div>
                <InvoiceFile id={r.id} table="society_memberships" fileUrl={r.file_url} fileName={r.file_name} onUpdate={loadAll} />
              </div>))}
              <div style={{ marginTop:12,padding:'12px 0',borderTop:'2px solid var(--color-border)',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
                {OWNERS.map(o=>(<div key={o} style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:10 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>{o}</div><div style={{ fontWeight:500 }}>{fmtAmt(total/3)}</div><div className="muted" style={{ fontSize:11 }}>÷ 3</div></div>))}
              </div></div>)}
            </div>)
          })}
          {!memberships.length&&<p className="muted">No membership invoices recorded yet.</p>}
        </div>)}
      </div>
      <div className="card" style={{ padding:0 }}>
        <div onClick={()=>setCapitaOpen(v=>!v)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'14px 16px',userSelect:'none' }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:500 }}>Capita Fees</h3>
          <span style={{ fontSize:18,color:'var(--color-text-muted)',transform:capitaOpen?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
        </div>
        {capitaOpen && (<div style={{ borderTop:'1px solid var(--color-border)',padding:16 }}>
          <button className="primary" style={{ marginBottom:16 }} onClick={()=>setShowCForm(v=>!v)}>{showCForm?'Cancel':'+ Add invoice'}</button>
          {showCForm && (<form onSubmit={saveCapita} style={fs}>
            <div><label>Membership year *</label><select required value={cForm.membership_year} onChange={e=>setCForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            <div><label>Invoice number *</label><input required value={cForm.invoice_number} onChange={e=>setCForm(f=>({...f,invoice_number:e.target.value}))} /></div>
            <div><label>Invoice date *</label><input required type="date" value={cForm.invoice_date} onChange={e=>setCForm(f=>({...f,invoice_date:e.target.value}))} /></div>
            <div><label>Payment date</label><input type="date" value={cForm.payment_date} onChange={e=>setCForm(f=>({...f,payment_date:e.target.value}))} /></div>
            <div><label>Rate per head (N$)</label><input type="number" step="0.01" value={cForm.rate_per_head} onChange={e=>setCForm(f=>({...f,rate_per_head:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Head count (NWS)</label><input type="number" value={cForm.head_count} onChange={e=>setCForm(f=>({...f,head_count:e.target.value}))} placeholder="0" /></div>
            <div><label>Invoiced amount (N$)</label><input type="number" step="0.01" value={cForm.invoiced_amount} onChange={e=>setCForm(f=>({...f,invoiced_amount:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Notes</label><input value={cForm.notes} onChange={e=>setCForm(f=>({...f,notes:e.target.value}))} /></div>
            <div style={{ gridColumn:'1/-1' }}>{msg&&<p style={{ color:'var(--color-danger)',margin:'0 0 8px' }}>{msg}</p>}<button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save invoice'}</button></div>
          </form>)}
          {YEAR_OPTIONS.slice().reverse().map(yr => {
            const recs=capitaFees.filter(c=>c.membership_year===yr); if(!recs.length) return null
            const total=recs.reduce((s,r)=>s+(Number(r.invoiced_amount)||0),0); const open=capitaYears[yr]===true; const fy=parseInt(yr)
            return (<div key={yr} style={{ marginBottom:12,border:'1px solid var(--color-border)',borderRadius:6,overflow:'hidden' }}>
              <div onClick={()=>setCapitaYears(s=>({...s,[yr]:!open}))} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',cursor:'pointer',background:'var(--color-bg-subtle)',userSelect:'none' }}>
                <span style={{ fontWeight:500 }}>{yr}</span>
                <div className="row" style={{ gap:12 }}><span className="muted" style={{ fontSize:13 }}>{fmtAmt(total)}</span><span style={{ fontSize:16,color:'var(--color-text-muted)',transform:open?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span></div>
              </div>
              {open&&(<div style={{ padding:14 }}>{recs.map(r=>(<div key={r.id} style={{ padding:'8px 0',borderBottom:'1px solid var(--color-border)' }}>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr) auto',gap:'8px 16px',alignItems:'start' }}>
                  <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{r.invoice_number}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(r.invoice_date)}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{r.payment_date?fmtDate(r.payment_date):<span className="faint">—</span>}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Head count</div><div>{r.invoiced_count??<span className="faint">—</span>}</div></div>
                  <div><div className="muted" style={{ fontSize:11 }}>Total</div><div style={{ fontWeight:500 }}>{fmtAmt(r.invoiced_amount)}</div></div>
                  <button className="danger-text" style={{ fontSize:12 }} onClick={()=>supabase.from('society_herd_fees').delete().eq('id',r.id).then(loadAll)}>Delete</button>
                </div>
                <InvoiceFile id={r.id} table="society_herd_fees" fileUrl={r.file_url} fileName={r.file_name} onUpdate={loadAll} />
              </div>))}
              <div style={{ marginTop:12,padding:'12px 0',borderTop:'2px solid var(--color-border)' }}>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12 }}>
                  {OWNERS.map(o=>{ const oc=calcOwnerCapita(o,fy); const tc=totalCapitaCount(fy); const amt=total*(oc/tc); const tiered=calcNwsTieredAmount(oc); return (<div key={o} style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:10 }}><div className="muted" style={{ fontSize:11,marginBottom:2 }}>{o}</div><div style={{ fontWeight:500 }}>{fmtAmt(amt)}</div><div className="muted" style={{ fontSize:11 }}>{oc} head · Our calc: {fmtAmt(tiered)}</div></div>) })}
                </div>
                <details style={{ marginTop:8 }}>
                  <summary style={{ cursor:'pointer', fontSize:13, color:'var(--color-text-muted)', userSelect:'none' }}>Show cattle counted ({totalCapitaCount(fy)} total)</summary>
                  <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }}>
                    {OWNERS.map(o => {
                      const { calves: oc, breeding: ob } = getOwnerCattleList(o, fy)
                      if (!oc.length && !ob.length) return null
                      return (<div key={o} style={{ border:'1px solid var(--color-border)', borderRadius:6, padding:10 }}>
                        <div style={{ fontWeight:500, fontSize:13, marginBottom:6 }}>{o} — {oc.length + ob.length} head</div>
                        {oc.length > 0 && <><div className="muted" style={{ fontSize:11, marginBottom:4 }}>Registered calves ({oc.length})</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 8px', fontSize:12 }}>
                          {oc.map(c => <span key={c.id}>{c.identity_number || c.ear_tag || c.id}</span>)}
                        </div></>}
                        {ob.length > 0 && <><div className="muted" style={{ fontSize:11, margin:'8px 0 4px' }}>Purchased breeding ({ob.length})</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 8px', fontSize:12 }}>
                          {ob.map(b => <span key={b.id}>{b.ear_tag || b.identity_number || b.id}</span>)}
                        </div></>}
                      </div>)
                    })}
                  </div>
                </details>
              </div></div>)}
            </div>)
          })}
          {!capitaFees.length&&<p className="muted">No capita fee invoices recorded yet.</p>}
        </div>)}
      </div>
    </div>
  )
}
