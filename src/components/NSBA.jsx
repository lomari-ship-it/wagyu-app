import { useEffect, useRef, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'

const BUCKET = 'batch-documents'

function InvoiceFile({ id, table, fileUrl, fileName, onUpdate }) {
  const ref = useRef()
  const [busy, setBusy] = useState(false)
  async function upload(e) { const file=e.target.files[0]; if(!file) return; setBusy(true); const path=`invoices/${table}-${id}-${Date.now()}`; const {error}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:true}); if(error){alert(error.message);setBusy(false);return}; const {data}=supabase.storage.from(BUCKET).getPublicUrl(path); await supabase.from(table).update({file_url:data.publicUrl,file_name:file.name}).eq('id',id); setBusy(false); onUpdate(); e.target.value='' }
  async function remove() { if(!window.confirm('Remove invoice file?')) return; await supabase.from(table).update({file_url:null,file_name:null}).eq('id',id); onUpdate() }
  return (<div className="row" style={{gap:8,marginTop:6,flexWrap:'wrap'}}><span className="muted" style={{fontSize:12}}>Invoice:</span>{fileUrl?<><a href={fileUrl} target="_blank" rel="noreferrer" style={{fontSize:12}}>📎 {fileName}</a><button onClick={remove} className="danger-text" style={{fontSize:11}}>Remove</button></>:<span className="muted" style={{fontSize:12}}>None uploaded</span>}<label style={{cursor:'pointer'}}><span className="button" style={{fontSize:11}}>{busy?'Uploading…':fileUrl?'Replace':'Upload'}</span><input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={upload} style={{display:'none'}} disabled={busy}/></label></div>)
}

function fmtDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}` }
function fmtAmt(n) { if (n == null || n === '') return '—'; return `N$ ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

const YEAR_OPTIONS = (() => { const years=[]; for(let y=2023;y<=new Date().getFullYear()+1;y++) years.push(`${y}/${y+1}`); return years })()
const emptyM = { invoice_date:'', invoice_number:'', membership_year:'2023/2024', payment_date:'', amount:'', notes:'' }
const emptyH = { invoice_date:'', invoice_number:'', membership_year:'2023/2024', payment_date:'', rate_per_head:'', invoiced_count:'', invoiced_amount:'', notes:'' }

function fyLabel(y) { return `${y}/${y+1}` }
function fyStartDate(y) { return `${y}-07-01` }
function getCurrentFY() { const now=new Date(); return now.getMonth()>=6?now.getFullYear():now.getFullYear()-1 }

const fyYears = (() => { const years=[]; for(let y=2023;y<=getCurrentFY();y++) years.push(y); return years })()

const th = { textAlign:'left', padding:'6px 8px 6px 0', fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--color-text-muted)' }
const td = { padding:'8px 8px 8px 0' }

export default function NSBA() {
  const [memberships, setMemberships] = useState([])
  const [herdFees, setHerdFees] = useState([])
  const [calves, setCalves] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [soldTransfers, setSoldTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [membershipOpen, setMembershipOpen] = useState(false)
  const [herdOpen, setHerdOpen] = useState(false)
  const [membershipYears, setMembershipYears] = useState({})
  const [herdYears, setHerdYears] = useState({})
  const [showMForm, setShowMForm] = useState(false)
  const [showHForm, setShowHForm] = useState(false)
  const [mForm, setMForm] = useState(emptyM)
  const [hForm, setHForm] = useState(emptyH)
  const [editingM, setEditingM] = useState(null)
  const [editingH, setEditingH] = useState(null)
  const [editMForm, setEditMForm] = useState({})
  const [editHForm, setEditHForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: mData }, { data: hData }, { data: cData }, { data: bData }, { data: soldData }] = await Promise.all([
      supabase.from('society_memberships').select('*').eq('society', 'NSBA').order('membership_year'),
      supabase.from('society_herd_fees').select('*').eq('society', 'NSBA').order('membership_year'),
      supabase.from('calves').select('id,ear_tag,identity_number,birth_date,owner,namlits_ownership'),
      supabase.from('cattle_register').select('id,ear_tag,identity_number,owner,purchase_date,namlits_ownership,archived').eq('animal_type','breeding'),
      supabase.from('kitai_transfers').select('ear_tag,sold_flag').eq('sold_flag', true),
    ])
    setMemberships(mData || [])
    setHerdFees(hData || [])
    setCalves(cData || [])
    setBreedingAnimals(bData || [])
    setSoldTransfers(soldData || [])
    setLoading(false)
  }

  function calcHerd(fyStartYear) {
    const cutoff = fyStartDate(fyStartYear + 1)
    const includeKW = fyStartYear >= 2025
    const isaCalves = calves.filter(c => {
      if (!c.birth_date || c.birth_date >= cutoff) return false
      const id = (c.identity_number || '').toUpperCase()
      return id.includes('ISA') || (includeKW && id.includes('KW'))
    })
    const purchasedBreeding = breedingAnimals.filter(b => b.purchase_date && b.purchase_date < cutoff && !b.archived)
    const soldEarTags = new Set(soldTransfers.map(t => t.ear_tag))
    const soldCalves = isaCalves.filter(c => c.sold_flag || soldEarTags.has(c.ear_tag))
    const count = isaCalves.length + purchasedBreeding.length - soldCalves.length
    return { count: Math.max(0, count), isBase: false, isaCalves, purchasedBreeding, soldCalves }
  }

  function calcOwnerHerd(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear + 1); const includeKW = fyStartYear >= 2025
    const soldEarTags = new Set(soldTransfers.map(t => t.ear_tag))
    const oc = calves.filter(c => {
      if(c.owner!==owner||!c.birth_date||c.birth_date>=cutoff) return false
      const id=(c.identity_number||'').toUpperCase()
      if(!id.includes('ISA')&&!(includeKW&&id.includes('KW'))) return false
      return !(c.sold_flag || soldEarTags.has(c.ear_tag))
    }).length
    const ob = breedingAnimals.filter(b => b.owner===owner&&b.purchase_date&&b.purchase_date<cutoff&&!b.archived).length
    return oc + ob
  }

  function getOwnerHerdList(owner, fyStartYear) {
    const cutoffStart = fyStartDate(fyStartYear)
    const cutoffEnd = fyStartDate(fyStartYear + 1)
    const includeKW = fyStartYear >= 2025
    const soldEarTags = new Set(soldTransfers.map(t => t.ear_tag))
    const allIsaCalves = calves.filter(c => {
      if(c.owner!==owner||!c.birth_date||c.birth_date>=cutoffEnd) return false
      const id=(c.identity_number||'').toUpperCase()
      return id.includes('ISA')||(includeKW&&id.includes('KW'))
    })
    const openingCalves = allIsaCalves.filter(c => c.birth_date < cutoffStart)
    const bornThisFY = allIsaCalves.filter(c => c.birth_date >= cutoffStart)
    const allPurchased = breedingAnimals.filter(b => b.owner===owner&&b.purchase_date&&b.purchase_date<cutoffEnd&&!b.archived)
    const purchasedThisFY = allPurchased.filter(b => b.purchase_date >= cutoffStart)
    const soldThisFY = allIsaCalves.filter(c => c.sold_flag || soldEarTags.has(c.ear_tag))
    return { allIsaCalves, openingCalves, bornThisFY, purchasedThisFY, allPurchased, soldThisFY }
  }
  function startEditM(r) { setEditingM(r.id); setEditMForm({ invoice_date:r.invoice_date||'', invoice_number:r.invoice_number||'', payment_date:r.payment_date||'', amount:r.amount||'', notes:r.notes||'', membership_year:r.membership_year }) }
  function startEditH(r) { setEditingH(r.id); setEditHForm({ invoice_date:r.invoice_date||'', invoice_number:r.invoice_number||'', payment_date:r.payment_date||'', rate_per_head:r.rate_per_head||'', invoiced_count:r.invoiced_count||'', invoiced_amount:r.invoiced_amount||'', notes:r.notes||'', membership_year:r.membership_year }) }

  const totalM = memberships.reduce((s, m) => s + (Number(m.amount) || 0), 0)
  const totalH = herdFees.reduce((s, hf) => s + (Number(hf.invoiced_amount) || 0), 0)

  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin:'0 0 16px', fontSize:18, fontWeight:500 }}>NSBA — Summary</h2>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}><th style={th}>Owner</th><th style={{...th,textAlign:'right'}}>Membership</th><th style={{...th,textAlign:'right'}}>Herd fees</th><th style={{...th,textAlign:'right'}}>Total</th></tr></thead>
          <tbody>{OWNERS.map(o => {
            const m = totalM / 3
            const h = herdFees.reduce((s,hf) => { const fy=parseInt(hf.membership_year); const oc=calcOwnerHerd(o,fy); return s+oc*(Number(hf.rate_per_head)||0) }, 0)
            return (<tr key={o} style={{ borderBottom:'1px solid var(--color-border)' }}><td style={td}>{o}</td><td style={{...td,textAlign:'right'}}>{fmtAmt(m)}</td><td style={{...td,textAlign:'right'}}>{fmtAmt(h)}</td><td style={{...td,textAlign:'right',fontWeight:500}}>{fmtAmt(m+h)}</td></tr>)
          })}</tbody>
          <tfoot><tr style={{ fontWeight:500, borderTop:'2px solid var(--color-border)' }}><td style={{...td,paddingTop:10}}>Total</td><td style={{...td,paddingTop:10,textAlign:'right'}}>{fmtAmt(totalM)}</td><td style={{...td,paddingTop:10,textAlign:'right'}}>{fmtAmt(totalH)}</td><td style={{...td,paddingTop:10,textAlign:'right'}}>{fmtAmt(totalM+totalH)}</td></tr></tfoot>
        </table>
      </div>

      <div className="card" style={{ padding:0 }}>
        <div onClick={()=>setMembershipOpen(v=>!v)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'14px 16px',userSelect:'none' }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:500 }}>Annual Membership</h3>
          <span style={{ fontSize:18,color:'var(--color-text-muted)',transform:membershipOpen?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
        </div>
        {membershipOpen && (<div style={{ borderTop:'1px solid var(--color-border)',padding:16 }}>
          <button className="primary" style={{ marginBottom:16 }} onClick={()=>setShowMForm(v=>!v)}>{showMForm?'Cancel':'+ Add invoice'}</button>
          {showMForm && (<form onSubmit={saveMembership} style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px 16px',marginBottom:20 }}>
            <div><label>Membership year *</label><select required value={mForm.membership_year} onChange={e=>setMForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            <div><label>Invoice number *</label><input required value={mForm.invoice_number} onChange={e=>setMForm(f=>({...f,invoice_number:e.target.value}))} /></div>
            <div><label>Invoice date *</label><input required type="date" value={mForm.invoice_date} onChange={e=>setMForm(f=>({...f,invoice_date:e.target.value}))} /></div>
            <div><label>Payment date</label><input type="date" value={mForm.payment_date} onChange={e=>setMForm(f=>({...f,payment_date:e.target.value}))} /></div>
            <div><label>Total amount (N$) *</label><input required type="number" step="0.01" value={mForm.amount} onChange={e=>setMForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Notes</label><input value={mForm.notes} onChange={e=>setMForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes" /></div>
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
              {open&&(<div style={{ padding:14 }}>{recs.map(r=>{
                const isEditing = editingM===r.id
                return (<div key={r.id} style={{ padding:'8px 0',borderBottom:'1px solid var(--color-border)' }}>
                  {isEditing ? (
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px 16px' }}>
                      <div><label style={{ fontSize:11 }}>Year</label><select value={editMForm.membership_year} onChange={e=>setEditMForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
                      <div><label style={{ fontSize:11 }}>Invoice no.</label><input value={editMForm.invoice_number} onChange={e=>setEditMForm(f=>({...f,invoice_number:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Invoice date</label><input type="date" value={editMForm.invoice_date} onChange={e=>setEditMForm(f=>({...f,invoice_date:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Payment date</label><input type="date" value={editMForm.payment_date} onChange={e=>setEditMForm(f=>({...f,payment_date:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Amount (N$)</label><input type="number" step="0.01" value={editMForm.amount} onChange={e=>setEditMForm(f=>({...f,amount:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Notes</label><input value={editMForm.notes} onChange={e=>setEditMForm(f=>({...f,notes:e.target.value}))} /></div>
                      <div style={{ gridColumn:'1/-1',display:'flex',gap:8 }}><button className="primary" disabled={saving} onClick={()=>updateMembership(r.id)}>Save</button><button onClick={()=>setEditingM(null)}>Cancel</button></div>
                    </div>
                  ) : (
                    <>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr) auto auto',gap:'8px 16px',alignItems:'start' }}>
                      <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{r.invoice_number}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(r.invoice_date)}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{r.payment_date?fmtDate(r.payment_date):<span className="faint">—</span>}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Total</div><div style={{ fontWeight:500 }}>{fmtAmt(r.amount)}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Notes</div><div style={{ fontSize:12 }}>{r.notes||<span className="faint">—</span>}</div></div>
                      <button style={{ fontSize:12 }} onClick={()=>startEditM(r)}>Edit</button>
                      <button className="danger-text" style={{ fontSize:12 }} onClick={()=>supabase.from('society_memberships').delete().eq('id',r.id).then(loadAll)}>Delete</button>
                    </div>
                    <InvoiceFile id={r.id} table="society_memberships" fileUrl={r.file_url} fileName={r.file_name} onUpdate={loadAll} />
                    </>
                  )}
                </div>)
              })}
              <div style={{ marginTop:12,padding:'12px 0',borderTop:'2px solid var(--color-border)',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
                {OWNERS.map(o=>(<div key={o} style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:10 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>{o}</div><div style={{ fontWeight:500 }}>{fmtAmt(total/3)}</div><div className="muted" style={{ fontSize:11 }}>÷ 3</div></div>))}
              </div>
              </div>)}
            </div>)
          })}
          {!memberships.length&&<p className="muted">No membership invoices recorded yet.</p>}
        </div>)}
      </div>

      <div className="card" style={{ padding:0 }}>
        <div onClick={()=>setHerdOpen(v=>!v)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'14px 16px',userSelect:'none' }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:500 }}>Herd Fees</h3>
          <span style={{ fontSize:18,color:'var(--color-text-muted)',transform:herdOpen?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
        </div>
        {herdOpen && (<div style={{ borderTop:'1px solid var(--color-border)',padding:16 }}>
          <button className="primary" style={{ marginBottom:16 }} onClick={()=>setShowHForm(v=>!v)}>{showHForm?'Cancel':'+ Add invoice'}</button>
          {showHForm && (<form onSubmit={saveHerdFee} style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px 16px',marginBottom:20 }}>
            <div><label>Membership year *</label><select required value={hForm.membership_year} onChange={e=>setHForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
            <div><label>Invoice number *</label><input required value={hForm.invoice_number} onChange={e=>setHForm(f=>({...f,invoice_number:e.target.value}))} /></div>
            <div><label>Invoice date *</label><input required type="date" value={hForm.invoice_date} onChange={e=>setHForm(f=>({...f,invoice_date:e.target.value}))} /></div>
            <div><label>Payment date</label><input type="date" value={hForm.payment_date} onChange={e=>setHForm(f=>({...f,payment_date:e.target.value}))} /></div>
            <div><label>Rate per head (N$)</label><input type="number" step="0.01" value={hForm.rate_per_head} onChange={e=>setHForm(f=>({...f,rate_per_head:e.target.value}))} placeholder="0.00" /></div>
            <div><label>NSBA invoiced count</label><input type="number" value={hForm.invoiced_count} onChange={e=>setHForm(f=>({...f,invoiced_count:e.target.value}))} placeholder="0" /></div>
            <div><label>NSBA invoiced amount (N$)</label><input type="number" step="0.01" value={hForm.invoiced_amount} onChange={e=>setHForm(f=>({...f,invoiced_amount:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Notes</label><input value={hForm.notes} onChange={e=>setHForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. Includes late registrations from previous year" /></div>
            <div style={{ gridColumn:'1/-1' }}>{msg&&<p style={{ color:'var(--color-danger)',margin:'0 0 8px' }}>{msg}</p>}<button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save invoice'}</button></div>
          </form>)}
          {fyYears.map(fyYear => {
            const label=fyLabel(fyYear)
            const {count:ourCount,isaCalves,purchasedBreeding,soldCalves}=calcHerd(fyYear)
            const invoice=herdFees.find(h=>h.membership_year===label)
            const invoicedCount=invoice?Number(invoice.invoiced_count):null
            const discrepancy=invoicedCount!=null?invoicedCount-ourCount:null
            const open=herdYears[label]===true
            return (
              <div key={label} style={{ marginBottom:12,border:'1px solid var(--color-border)',borderRadius:6,overflow:'hidden' }}>
                <div onClick={()=>setHerdYears(s=>({...s,[label]:!open}))} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',cursor:'pointer',background:'var(--color-bg-subtle)',userSelect:'none' }}>
                  <span style={{ fontWeight:500 }}>{label}</span>
                  <div className="row" style={{ gap:12 }}>
                    {discrepancy!==null&&discrepancy!==0&&<span style={{ fontSize:12,background:'var(--color-danger-bg,#fef2f2)',color:'var(--color-danger)',padding:'2px 8px',borderRadius:4 }}>Discrepancy: {discrepancy>0?'+':''}{discrepancy}</span>}
                    {discrepancy===0&&<span style={{ fontSize:12,color:'var(--color-success-text,#15803d)' }}>✓ Agrees</span>}
                    <span className="muted" style={{ fontSize:13 }}>{ourCount} head</span>
                    <span style={{ fontSize:16,color:'var(--color-text-muted)',transform:open?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
                  </div>
                </div>
                {open&&(<div style={{ padding:14 }}>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px 20px',marginBottom:16 }}>
                    <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:12 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>Our count</div><div style={{ fontSize:22,fontWeight:600 }}>{ourCount}</div><div className="muted" style={{ fontSize:11 }}>{(isaCalves||[]).length} ISA/KW{purchasedBreeding?.length ? ` + ${purchasedBreeding.length} purchased` : ''}{soldCalves?.length ? ` − ${soldCalves.length} sold` : ''}</div></div>
                    <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:12 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>NSBA invoiced</div><div style={{ fontSize:22,fontWeight:600 }}>{invoicedCount??<span className="faint">—</span>}</div></div>
                    <div style={{ background:discrepancy?'var(--color-danger-bg,#fef2f2)':'var(--color-bg-subtle)',borderRadius:6,padding:12 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>Discrepancy</div><div style={{ fontSize:22,fontWeight:600,color:discrepancy?'var(--color-danger)':undefined }}>{discrepancy!=null?(discrepancy>0?`+${discrepancy}`:discrepancy):<span className="faint">—</span>}</div></div>
                    <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:12 }}><div className="muted" style={{ fontSize:11,marginBottom:4 }}>Rate / head</div><div style={{ fontSize:18,fontWeight:600 }}>{invoice?.rate_per_head?fmtAmt(invoice.rate_per_head):<span className="faint">—</span>}</div></div>
                  </div>
                  {invoice && (editingH===invoice.id ? (
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px 16px',padding:'12px 0',borderBottom:'1px solid var(--color-border)' }}>
                      <div><label style={{ fontSize:11 }}>Year</label><select value={editHForm.membership_year} onChange={e=>setEditHForm(f=>({...f,membership_year:e.target.value}))}>{YEAR_OPTIONS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
                      <div><label style={{ fontSize:11 }}>Invoice no.</label><input value={editHForm.invoice_number} onChange={e=>setEditHForm(f=>({...f,invoice_number:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Invoice date</label><input type="date" value={editHForm.invoice_date} onChange={e=>setEditHForm(f=>({...f,invoice_date:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Payment date</label><input type="date" value={editHForm.payment_date} onChange={e=>setEditHForm(f=>({...f,payment_date:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Rate/head (N$)</label><input type="number" step="0.01" value={editHForm.rate_per_head} onChange={e=>setEditHForm(f=>({...f,rate_per_head:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>NSBA invoiced count</label><input type="number" value={editHForm.invoiced_count} onChange={e=>setEditHForm(f=>({...f,invoiced_count:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>NSBA invoiced amount</label><input type="number" step="0.01" value={editHForm.invoiced_amount} onChange={e=>setEditHForm(f=>({...f,invoiced_amount:e.target.value}))} /></div>
                      <div><label style={{ fontSize:11 }}>Notes</label><input value={editHForm.notes} onChange={e=>setEditHForm(f=>({...f,notes:e.target.value}))} /></div>
                      <div style={{ gridColumn:'1/-1',display:'flex',gap:8 }}><button className="primary" disabled={saving} onClick={()=>updateHerdFee(invoice.id)}>Save</button><button onClick={()=>setEditingH(null)}>Cancel</button></div>
                    </div>
                  ) : (
                    <>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr) auto auto',gap:'8px 16px',alignItems:'start',padding:'8px 0',borderBottom:'1px solid var(--color-border)' }}>
                      <div><div className="muted" style={{ fontSize:11 }}>Invoice no.</div><div>{invoice.invoice_number}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Invoice date</div><div>{fmtDate(invoice.invoice_date)}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Payment date</div><div>{invoice.payment_date?fmtDate(invoice.payment_date):<span className="faint">—</span>}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Invoiced amount</div><div style={{ fontWeight:500 }}>{fmtAmt(invoice.invoiced_amount)}</div></div>
                      <div><div className="muted" style={{ fontSize:11 }}>Our calc.</div><div>{invoice.rate_per_head?fmtAmt(ourCount*Number(invoice.rate_per_head)):<span className="faint">—</span>}</div></div>
                      <button style={{ fontSize:12 }} onClick={()=>startEditH(invoice)}>Edit</button>
                      <button className="danger-text" style={{ fontSize:12 }} onClick={()=>supabase.from('society_herd_fees').delete().eq('id',invoice.id).then(loadAll)}>Delete</button>
                    </div>
                    {invoice.notes&&<div style={{ fontSize:12,color:'var(--color-text-muted)',marginTop:4 }}>📝 {invoice.notes}</div>}
                    <InvoiceFile id={invoice.id} table="society_herd_fees" fileUrl={invoice.file_url} fileName={invoice.file_name} onUpdate={loadAll} />
                    </>
                  ))}
                  {!invoice&&<p className="muted" style={{ margin:0,fontSize:13 }}>No invoice recorded yet. Add one above.</p>}
                  <div style={{ marginTop:12,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
                    {OWNERS.map(o=>{ const oc=calcOwnerHerd(o,fyYear); const amt=invoice?.rate_per_head?oc*Number(invoice.rate_per_head):null; return (<div key={o} style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:10 }}><div className="muted" style={{ fontSize:11,marginBottom:2 }}>{o}</div><div style={{ fontWeight:500 }}>{amt!=null?fmtAmt(amt):<span className="faint">—</span>}</div><div className="muted" style={{ fontSize:11 }}>{oc} head</div></div>) })}
                  </div>
                  <details style={{ marginTop:8 }}>
                    <summary style={{ cursor:'pointer',fontSize:13,color:'var(--color-text-muted)',userSelect:'none' }}>Show cattle detail per owner ({ourCount} total)</summary>
                    <div style={{ marginTop:12 }}>
                      {OWNERS.map(o => {
                        const {openingCalves,bornThisFY,purchasedThisFY,allPurchased,soldThisFY,allIsaCalves}=getOwnerHerdList(o,fyYear)
                        const openCount=openingCalves.length+allPurchased.filter(b=>b.purchase_date<fyStartDate(fyYear)).length
                        const closing=openCount+bornThisFY.length+purchasedThisFY.length-soldThisFY.length
                        if(closing===0&&openCount===0) return null
                        return (<div key={o} style={{ border:'1px solid var(--color-border)',borderRadius:8,padding:12,marginBottom:10 }}>
                          <div style={{ fontWeight:600,fontSize:14,marginBottom:8,display:'flex',justifyContent:'space-between' }}>
                            <span>{o}</span><span>{closing} head</span>
                          </div>
                          <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10,fontSize:12 }}>
                            <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:'6px 8px' }}><div className="muted" style={{ fontSize:10 }}>At 01 Jul {fyYear}</div><div style={{ fontWeight:600,fontSize:16 }}>{openCount}</div></div>
                            <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:'6px 8px' }}><div className="muted" style={{ fontSize:10 }}>+ Born</div><div style={{ fontWeight:600,fontSize:16,color:bornThisFY.length>0?'var(--color-success-text,#15803d)':undefined }}>{bornThisFY.length}</div></div>
                            <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:'6px 8px' }}><div className="muted" style={{ fontSize:10 }}>+ Purchased</div><div style={{ fontWeight:600,fontSize:16,color:purchasedThisFY.length>0?'var(--color-success-text,#15803d)':undefined }}>{purchasedThisFY.length}</div></div>
                            <div style={{ background:'var(--color-bg-subtle)',borderRadius:6,padding:'6px 8px' }}><div className="muted" style={{ fontSize:10 }}>− Sold</div><div style={{ fontWeight:600,fontSize:16,color:soldThisFY.length>0?'var(--color-danger)':undefined }}>{soldThisFY.length}</div></div>
                          </div>
                          <div style={{ fontSize:11,color:'var(--color-text-muted)',marginBottom:4 }}>Cattle at 30 Jun {fyYear+1}:</div>
                          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:'2px 8px',fontSize:12 }}>
                            {allIsaCalves.filter(c=>!c.sold_flag&&!new Set(soldTransfers.map(t=>t.ear_tag)).has(c.ear_tag)).map(c=>(<span key={c.id}>{c.identity_number||c.ear_tag}</span>))}
                            {allPurchased.map(b=>(<span key={b.id} style={{ color:'var(--color-text-muted)' }}>{b.identity_number||b.ear_tag} (purch.)</span>))}
                          </div>
                        </div>)
                      })}
                    </div>
                  </details>
                </div>)}
              </div>
            )
          })}
        </div>)}
      </div>
    </div>
  )
}
