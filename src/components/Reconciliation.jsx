import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'

const PAYER = 'J.A Delport'
const DEBTORS = OWNERS.filter(o => o !== PAYER)

function fmtDate(d) { if (!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}` }
function fmtN(val) { const n=parseFloat(val); if(isNaN(n)||n===0) return '—'; return 'N$\u00a0'+n.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fyStartDate(y) { return `${y}-07-01` }

export default function Reconciliation() {
  const [batches, setBatches] = useState([])
  const [lateInvoices, setLateInvoices] = useState([])
  const [calves, setCalves] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [memberships, setMemberships] = useState([])
  const [herdFees, setHerdFees] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [payForm, setPayForm] = useState({ owner: DEBTORS[0], amount: '', date: '', reference: '', notes: '' })
  const [saving, setSaving] = useState(false)
  // Track which owner/category rows are expanded for payments
  const [expandedRows, setExpandedRows] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [b,li,c,cr,sm,sf,p] = await Promise.all([
      supabase.from('batches').select('*').order('invoice_date',{ascending:false}),
      supabase.from('late_reg_invoices').select('*').order('created_at',{ascending:false}),
      supabase.from('calves').select('id,owner,ear_tag,identity_number,birth_date,sold_flag'),
      supabase.from('cattle_register').select('id,owner,ear_tag,identity_number,purchase_date,archived').eq('animal_type','breeding'),
      supabase.from('society_memberships').select('*').order('membership_year'),
      supabase.from('society_herd_fees').select('*').order('membership_year'),
      supabase.from('reconciliation_payments').select('*').order('payment_date',{ascending:false}),
    ])
    setBatches(b.data||[]); setLateInvoices(li.data||[]); setCalves(c.data||[])
    setBreedingAnimals(cr.data||[]); setMemberships(sm.data||[]); setHerdFees(sf.data||[])
    setPayments(p.data||[])
    setLoading(false)
  }

  function calcOwnerCapita(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear+1); const includeKW = fyStartYear>=2025
    const oc = calves.filter(c=>{if(c.owner!==owner||!c.birth_date||c.birth_date>=cutoff)return false;const id=(c.identity_number||'').toUpperCase();return id.includes('ISA')||(includeKW&&id.includes('KW'))}).length
    const ob = breedingAnimals.filter(b=>b.owner===owner&&b.purchase_date&&b.purchase_date<cutoff&&!b.archived).length
    return oc+ob
  }
  function totalCapitaCount(fy) { return OWNERS.reduce((s,o)=>s+calcOwnerCapita(o,fy),0)||1 }

  function calcOwnerHerd(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear+1); const includeKW = fyStartYear>=2025
    const oc = calves.filter(c=>{if(c.owner!==owner||!c.birth_date||c.birth_date>=cutoff||c.sold_flag)return false;const id=(c.identity_number||'').toUpperCase();return id.includes('ISA')||(includeKW&&id.includes('KW'))}).length
    const ob = breedingAnimals.filter(b=>b.owner===owner&&b.purchase_date&&b.purchase_date<cutoff&&!b.archived).length
    return oc+ob
  }

  const nwsM = memberships.filter(m=>m.society==='NWS')
  const nwsC = herdFees.filter(f=>f.society==='NWS')
  const nsbaM = memberships.filter(m=>m.society==='NSBA')
  const nsbaH = herdFees.filter(f=>f.society==='NSBA')

  // Per-owner shares
  function ownerShare(owner) {
    const dna = batches.reduce((s,b)=>{
      const summaries=b.calf_summaries||[]; const calfIds=b.calf_ids||[]
      const bc=summaries.length>0?summaries.map(cs=>calves.find(c=>c.id===cs.id||c.ear_tag===cs.earTag)||cs):calves.filter(c=>calfIds.includes(c.id))
      const cnt=bc.filter(c=>(c.owner||c.owner_name||'')===''+owner).length
      const rate=b.rate_per_test||(b.invoice_test_count?(parseFloat(b.invoice_amount_payable)||0)/b.invoice_test_count:0)
      const extra=(b.additional_invoices||[]).reduce((s2,i)=>{
        const iQty=i.qty||0; const iRate=i.rate||0; const iTotal=i.amount||(iQty*iRate)
        return s2+(iTotal/OWNERS.length)
      },0)
      return s+cnt*rate+extra
    },0)

    const lateReg = lateInvoices.reduce((s,inv)=>{
      const sums=inv.calf_summaries||[]
      const ownerSums=sums.filter(cs=>cs.owner===owner)
      return s+ownerSums.reduce((s2,cs)=>s2+(cs.rate||parseFloat(inv.rate_per_late_registration)||0),0)
    },0)

    const nwsMembShare = nwsM.reduce((s,m)=>s+(Number(m.amount)||0)/3,0)
    const nwsCapShare = nwsC.reduce((s,cf)=>{ const fy=parseInt(cf.membership_year); const oc=calcOwnerCapita(owner,fy); const tc=totalCapitaCount(fy); return s+(Number(cf.invoiced_amount)||0)*(oc/tc) },0)
    const nsbaMembShare = nsbaM.reduce((s,m)=>s+(Number(m.amount)||0)/3,0)
    const nsbaHerdShare = nsbaH.reduce((s,hf)=>{ const fy=parseInt(hf.membership_year); const oc=calcOwnerHerd(owner,fy); return s+oc*(Number(hf.rate_per_head)||0) },0)

    return { dna, lateReg, nwsMembShare, nwsCapShare, nsbaMembShare, nsbaHerdShare,
      total: dna+lateReg+nwsMembShare+nwsCapShare+nsbaMembShare+nsbaHerdShare }
  }

  function ownerPaid(owner, category) {
    return payments.filter(p=>p.owner===owner&&(category===undefined||p.category===category)).reduce((s,p)=>s+(Number(p.amount)||0),0)
  }

  async function savePayment(e) {
    e.preventDefault(); setSaving(true)
    const { error } = await supabase.from('reconciliation_payments').insert({
      owner:payForm.owner, amount:Number(payForm.amount)||0, payment_date:payForm.date||null,
      reference:payForm.reference||null, notes:payForm.notes||null,
    })
    setSaving(false)
    if(error){alert('Failed: '+error.message);return}
    setPayForm({owner:DEBTORS[0],amount:'',date:'',reference:'',notes:''})
    setShowPayForm(false); loadAll()
  }

  async function deletePayment(id) {
    if(!window.confirm('Delete this payment record?')) return
    await supabase.from('reconciliation_payments').delete().eq('id',id); loadAll()
  }

  async function updatePayment(id, fields) {
    await supabase.from('reconciliation_payments').update(fields).eq('id', id); loadAll()
  }

  const totalSocietyFeesPerDebtor = DEBTORS.reduce((s,d)=>{ const sh=ownerShare(d); return s+sh.nwsMembShare+sh.nwsCapShare+sh.nsbaMembShare+sh.nsbaHerdShare+sh.lateReg },0)
  const totalPaidToJA = DEBTORS.reduce((s,d)=>s+ownerPaid(d),0)
  const totalStillOwed = totalSocietyFeesPerDebtor - totalPaidToJA

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Summary card */}
      <div className="card">
        <h2 style={{ margin:'0 0 4px',fontSize:18,fontWeight:600 }}>Summary</h2>
        <p className="muted" style={{ margin:'0 0 16px',fontSize:13 }}><strong>{PAYER}</strong> pays all society invoices up front and is reimbursed by the other owners.</p>
        <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead><tr style={{ borderBottom:'2px solid var(--color-border)' }}>
            <th style={{ textAlign:'left',padding:'6px 8px 6px 0',fontSize:12,textTransform:'uppercase',color:'var(--color-text-muted)' }}>Owner</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:11,textTransform:'uppercase',color:'var(--color-text-muted)' }}>NWS memb.</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:11,textTransform:'uppercase',color:'var(--color-text-muted)' }}>NWS capita</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:11,textTransform:'uppercase',color:'var(--color-text-muted)' }}>NSBA memb.</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:11,textTransform:'uppercase',color:'var(--color-text-muted)' }}>NSBA herd</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:11,textTransform:'uppercase',color:'var(--color-text-muted)' }}>Late reg.</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,textTransform:'uppercase',color:'var(--color-text-muted)' }}>Total owed</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,textTransform:'uppercase',color:'var(--color-text-muted)' }}>Paid</th>
            <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,textTransform:'uppercase',color:'var(--color-text-muted)' }}>Balance due</th>
          </tr></thead>
          <tbody>{DEBTORS.map(o=>{
            const s=ownerShare(o); const paid=ownerPaid(o)
            const total=s.nwsMembShare+s.nwsCapShare+s.nsbaMembShare+s.nsbaHerdShare+s.lateReg
            const bal=total-paid
            return(<tr key={o} style={{ borderBottom:'1px solid var(--color-border)' }}>
              <td style={{ padding:'10px 8px 10px 0' }}><strong>{o}</strong></td>
              <td style={{ textAlign:'right',padding:'10px 0',fontSize:13 }}>{s.nwsMembShare>0?fmtN(s.nwsMembShare):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontSize:13 }}>{s.nwsCapShare>0?fmtN(s.nwsCapShare):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontSize:13 }}>{s.nsbaMembShare>0?fmtN(s.nsbaMembShare):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontSize:13 }}>{s.nsbaHerdShare>0?fmtN(s.nsbaHerdShare):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontSize:13 }}>{s.lateReg>0?fmtN(s.lateReg):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontWeight:600 }}>{fmtN(total)}</td>
              <td style={{ textAlign:'right',padding:'10px 0',color:'var(--color-success-text,#15803d)',fontWeight:500 }}>{paid>0?fmtN(paid):'—'}</td>
              <td style={{ textAlign:'right',padding:'10px 0',fontWeight:700,color:bal>0.01?'var(--color-warning-text,#92400e)':bal<-0.01?'var(--color-danger)':'var(--color-success-text,#15803d)' }}>
                {Math.abs(bal)<0.01?'✓ Settled':fmtN(bal)}
              </td>
            </tr>)
          })}</tbody>
          <tfoot><tr style={{ borderTop:'2px solid var(--color-border)',fontWeight:600 }}>
            <td style={{ padding:'8px 8px 8px 0' }}>Total</td>
            <td colSpan={5}></td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN(totalSocietyFeesPerDebtor)}</td>
            <td style={{ textAlign:'right',padding:'8px 0',color:'var(--color-success-text,#15803d)' }}>{totalPaidToJA>0?fmtN(totalPaidToJA):'—'}</td>
            <td style={{ textAlign:'right',padding:'8px 0',color:totalStillOwed>0.01?'var(--color-warning-text,#92400e)':'var(--color-success-text,#15803d)' }}>{fmtN(totalStillOwed)}</td>
          </tr></tfoot>
        </table></ScrollTable>
      </div>

            {/* Payments section */}
      <div className="card">
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
          <h2 style={{ margin:0,fontSize:18,fontWeight:500 }}>Reimbursements to {PAYER}</h2>
          <button className="primary" style={{ fontSize:13 }} onClick={()=>setShowPayForm(v=>!v)}>{showPayForm?'Cancel':'+ Record payment'}</button>
        </div>
        {showPayForm&&(
          <form onSubmit={savePayment} style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px 16px',marginBottom:20,padding:16,background:'var(--color-bg-subtle)',borderRadius:8 }}>
            <div><label>From owner *</label><select required value={payForm.owner} onChange={e=>setPayForm(f=>({...f,owner:e.target.value}))}>{DEBTORS.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div><label>Amount (N$) *</label><input required type="number" step="0.01" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" /></div>
            <div><label>Payment date *</label><input required type="date" value={payForm.date} onChange={e=>setPayForm(f=>({...f,date:e.target.value}))} /></div>
            <div><label>Reference</label><input value={payForm.reference} onChange={e=>setPayForm(f=>({...f,reference:e.target.value}))} placeholder="EFT ref / cheque no." /></div>
            <div><label>Notes</label><input value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} /></div>
            <div style={{ gridColumn:'1/-1' }}><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save payment'}</button></div>
          </form>
        )}
        {payments.length===0?<p className="muted">No reimbursement payments recorded yet.</p>:(
          <PaymentsTable payments={payments} onDelete={deletePayment} onUpdate={updatePayment} />
        )}
      </div>

      {/* DNA Testing collapsible */}
      <CollapsibleCard title="DNA Testing" badge={`${batches.filter(b=>b.invoice_number||b.invoice_test_count).length} invoices`}>
        <DnaSection batches={batches} calves={calves} />
      </CollapsibleCard>

      {/* Late Registrations */}
      <CollapsibleCard title="Late Registrations" badge={`${lateInvoices.length} invoices`}>
        <LateRegSection lateInvoices={lateInvoices} />
      </CollapsibleCard>

      {/* NWS Annual Membership */}
      <CollapsibleCard title="NWS — Annual Membership" badge={`${nwsM.length} invoices`}>
        <MembershipSection records={nwsM} society="NWS" />
      </CollapsibleCard>

      {/* NWS Capita Fees */}
      <CollapsibleCard title="NWS — Capita Fees" badge={`${nwsC.length} invoices`}>
        <CapitaSection records={nwsC} calcOwnerCapita={calcOwnerCapita} totalCapitaCount={totalCapitaCount} />
      </CollapsibleCard>

      {/* NSBA Annual Membership */}
      <CollapsibleCard title="NSBA — Annual Membership" badge={`${nsbaM.length} invoices`}>
        <MembershipSection records={nsbaM} society="NSBA" />
      </CollapsibleCard>

      {/* NSBA Herd Fees */}
      <CollapsibleCard title="NSBA — Herd Fees" badge={`${nsbaH.length} invoices`}>
        <HerdSection records={nsbaH} calcOwnerHerd={calcOwnerHerd} />
      </CollapsibleCard>
    </div>
  )
}

function CollapsibleCard({ title, badge, children }) {
  const [open,setOpen]=useState(false)
  return (
    <div className="card" style={{ padding:0 }}>
      <div onClick={()=>setOpen(v=>!v)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'14px 16px',userSelect:'none' }}>
        <div className="row" style={{ gap:8 }}>
          <h2 style={{ margin:0,fontSize:16,fontWeight:500 }}>{title}</h2>
          {badge&&<span className="badge neutral" style={{ fontSize:11 }}>{badge}</span>}
        </div>
        <span style={{ fontSize:18,color:'var(--color-text-muted)',transform:open?'rotate(0deg)':'rotate(-90deg)',transition:'transform 0.2s' }}>&#8964;</span>
      </div>
      {open&&<div style={{ padding:'0 16px 16px',borderTop:'1px solid var(--color-border)' }}>{children}</div>}
    </div>
  )
}

function PaymentsTable({ payments, onDelete, onUpdate }) {
  const [editingId, setEditingId]=useState(null)
  const [editForm, setEditForm]=useState({})

  function startEdit(p) {
    setEditingId(p.id)
    setEditForm({ owner:p.owner, amount:p.amount||'', date:p.payment_date||'', reference:p.reference||'', notes:p.notes||'' })
  }

  async function saveEdit(id) {
    await onUpdate(id,{ owner:editForm.owner, amount:Number(editForm.amount)||0, payment_date:editForm.date||null, reference:editForm.reference||null, notes:editForm.notes||null })
    setEditingId(null)
  }

  return (
    <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
      <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
        {['From','Date','Amount','Ref','Notes',''].map(h=><th key={h} style={{ textAlign:h==='Amount'?'right':'left',padding:'6px 8px 6px 0',fontSize:12,textTransform:'uppercase',color:'var(--color-text-muted)' }}>{h}</th>)}
      </tr></thead>
      <tbody>{payments.map(p=>(
        editingId===p.id ? (
          <tr key={p.id} style={{ borderBottom:'1px solid var(--color-border)',background:'var(--color-bg-subtle)' }}>
            <td style={{ padding:'6px 8px 6px 0' }}><select value={editForm.owner} onChange={e=>setEditForm(f=>({...f,owner:e.target.value}))} style={{ fontSize:13 }}>{DEBTORS.map(d=><option key={d} value={d}>{d}</option>)}</select></td>
            <td style={{ padding:'6px 0' }}><input type="date" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))} style={{ fontSize:13 }} /></td>
            <td style={{ padding:'6px 0' }}><input type="number" step="0.01" value={editForm.amount} onChange={e=>setEditForm(f=>({...f,amount:e.target.value}))} style={{ fontSize:13,textAlign:'right',width:110 }} /></td>
            <td style={{ padding:'6px 0' }}><input value={editForm.reference} onChange={e=>setEditForm(f=>({...f,reference:e.target.value}))} style={{ fontSize:13 }} /></td>
            <td style={{ padding:'6px 0' }}><input value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} style={{ fontSize:13 }} /></td>
            <td style={{ padding:'6px 0' }}><div className="row" style={{ gap:4 }}><button className="primary" style={{ fontSize:11 }} onClick={()=>saveEdit(p.id)}>Save</button><button style={{ fontSize:11 }} onClick={()=>setEditingId(null)}>Cancel</button></div></td>
          </tr>
        ) : (
          <tr key={p.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
            <td style={{ padding:'8px 8px 8px 0' }}><strong>{p.owner}</strong></td>
            <td style={{ padding:'8px 0' }}>{fmtDate(p.payment_date)}</td>
            <td style={{ textAlign:'right',padding:'8px 0',color:'var(--color-success-text,#15803d)',fontWeight:500 }}>{fmtN(p.amount)}</td>
            <td style={{ padding:'8px 0',fontSize:12 }}>{p.reference||<span className="faint">—</span>}</td>
            <td style={{ padding:'8px 0',fontSize:12 }}>{p.notes||<span className="faint">—</span>}</td>
            <td style={{ padding:'8px 0' }}><div className="row" style={{ gap:4 }}><button style={{ fontSize:11 }} onClick={()=>startEdit(p)}>Edit</button><button className="danger-text" style={{ fontSize:12 }} onClick={()=>onDelete(p.id)}>Delete</button></div></td>
          </tr>
        )
      ))}</tbody>
    </table></ScrollTable>
  )
}

function DnaSection({ batches, calves }) {
  const [expandedBatch,setExpandedBatch]=useState(null)
  const relevant=batches.filter(b=>b.invoice_number||b.batch_report_number||b.invoice_test_count||b.rate_per_test)
  const totalTests=relevant.reduce((s,b)=>s+(b.invoice_test_count||0),0)
  const totalAmt=relevant.reduce((s,b)=>s+(parseFloat(b.invoice_amount_payable)||0),0)

  function getBreakdown(batch) {
    const summaries=batch.calf_summaries||[]; const calfIds=batch.calf_ids||[]
    const bc=summaries.length>0?summaries.map(s=>calves.find(c=>c.id===s.id||c.ear_tag===s.earTag)||s):calves.filter(c=>calfIds.includes(c.id))
    const byOwner={}; bc.forEach(c=>{const o=c.owner||'Unknown';byOwner[o]=(byOwner[o]||0)+1})
    return byOwner
  }

  if(relevant.length===0) return <p className="muted" style={{ marginTop:12 }}>No invoiced batches recorded yet.</p>
  return (
    <div style={{ marginTop:12 }}>
      <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice no.</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Batch no.</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Total tests</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Total invoice</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Payment date</th>
        </tr></thead>
        <tbody>{relevant.map(b=>{
          const bd=getBreakdown(b); const owners=Object.keys(bd); const multi=owners.length>1
          const total=b.invoice_amount_payable?parseFloat(b.invoice_amount_payable):((b.rate_per_test&&b.invoice_test_count)?b.rate_per_test*b.invoice_test_count:null)
          const isExp=expandedBatch===b.id
          return (<><tr key={b.id} style={{ borderBottom:isExp?'none':'1px solid var(--color-border)',cursor:'pointer' }} onClick={()=>setExpandedBatch(isExp?null:b.id)}>
            <td style={{ padding:'8px 0',fontWeight:500 }}>{b.invoice_number||<span className="faint">—</span>}</td>
            <td style={{ padding:'8px 0' }}>{b.batch_report_number||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{b.invoice_test_count||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0',fontWeight:500 }}>{total?fmtN(total):<span className="faint">—</span>}</td>
            <td style={{ padding:'8px 0' }}>{b.payment_date?<span className="badge success" style={{ fontSize:11 }}>{b.payment_date.split('-').reverse().join('/')}</span>:<span className="badge warning" style={{ fontSize:11 }}>Pending</span>}<span style={{ fontSize:11,color:'var(--color-text-muted)',marginLeft:6 }}>{isExp?'▲':'▼'}</span></td>
          </tr>
          {isExp&&(<tr style={{ borderBottom:'1px solid var(--color-border)',background:'var(--color-bg-subtle)' }}>
            <td colSpan={5} style={{ padding:'8px 0 8px 16px' }}>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8 }}>
                {owners.map(o=>{const q=bd[o];const rate=b.rate_per_test||(total&&b.invoice_test_count?total/b.invoice_test_count:0);return(<div key={o} style={{ fontSize:12 }}><span style={{ fontWeight:500 }}>{o}</span><span className="muted"> — {q} tests</span>{rate>0&&<span className="muted"> = {fmtN(q*rate)}</span>}</div>)})}
              </div>
              {(b.additional_invoices||[]).map(ai=>(<div key={ai.id} style={{ fontSize:12,padding:'4px 0',borderTop:'1px dashed var(--color-border)',display:'flex',gap:16 }}><span className="muted">+ Supplementary</span>{ai.number&&<span>{ai.number}</span>}{ai.qty&&<span>{ai.qty} tests</span>}{ai.amount&&<span style={{ fontWeight:500 }}>{fmtN(ai.amount)}</span>}{ai.notes&&<span className="muted">{ai.notes}</span>}</div>))}
            </td>
          </tr>)}
          {(b.additional_invoices||[]).map(ai=>(
            <tr key={ai.id} style={{ background:'var(--color-bg-subtle)',fontSize:12 }}>
              <td style={{ padding:'4px 0 4px 16px',color:'var(--color-text-muted)' }}>+ Supplementary invoice</td>
              <td style={{ padding:'4px 0' }}>{ai.number||<span className="faint">—</span>}</td><td></td>
              <td style={{ textAlign:'right',padding:'4px 0' }}>{ai.qty||<span className="faint">—</span>}</td>
              <td style={{ textAlign:'right',padding:'4px 0' }}>{ai.amount?fmtN(ai.amount):'—'}</td><td></td>
            </tr>
          ))}</>)
        })}</tbody>
        <tfoot><tr style={{ fontWeight:500,borderTop:'2px solid var(--color-border)' }}>
          <td colSpan={3} style={{ padding:'8px 0' }}>Total</td>
          <td style={{ textAlign:'right',padding:'8px 0' }}>{totalTests}</td>
          <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN(totalAmt)}</td><td></td>
        </tr></tfoot>
      </table></ScrollTable>
    </div>
  )
}

function LateRegSection({ lateInvoices }) {
  const total=lateInvoices.reduce((s,i)=>s+(parseFloat(i.amount_payable)||0),0)
  if(lateInvoices.length===0) return <p className="muted" style={{ marginTop:12 }}>No late registration invoices recorded yet.</p>
  return (
    <div style={{ marginTop:12 }}>
      <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice no.</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Date</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Late</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Very late</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Amount</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice</th>
        </tr></thead>
                <tbody>{lateInvoices.map(inv=>{
          const sums=inv.calf_summaries||[];
          const byOwner={};
          sums.forEach(cs=>{const o=cs.owner||'?';if(!byOwner[o])byOwner[o]={late:0,veryLate:0,amount:0};const vl=cs.days>180;byOwner[o][vl?'veryLate':'late']++;byOwner[o].amount+=(cs.rate||parseFloat(inv.rate_per_late_registration)||0)});
          const hasOwners=Object.keys(byOwner).length>0;
          return(<><tr key={inv.id} style={{ borderBottom:hasOwners?'none':'1px solid var(--color-border)' }}>
            <td style={{ padding:'8px 0',fontWeight:500 }}>{inv.invoice_number||<span className="faint">—</span>}</td>
            <td style={{ padding:'8px 0' }}>{inv.invoice_date?inv.invoice_date.split('-').reverse().join('/'):<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{inv.late_count||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{inv.very_late_count||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0',fontWeight:500 }}>{fmtN(inv.amount_payable)}</td>
            <td style={{ padding:'8px 0' }}>{inv.file_url||inv.invoice_file_url?<a href={inv.file_url||inv.invoice_file_url} target="_blank" rel="noreferrer" style={{ fontSize:12 }}>View</a>:<span className="faint" style={{ fontSize:12 }}>—</span>}</td>
          </tr>
          {hasOwners&&(<tr style={{ borderBottom:'1px solid var(--color-border)',background:'var(--color-bg-subtle)' }}>
            <td colSpan={6} style={{ padding:'4px 0 6px 16px' }}>
              {Object.entries(byOwner).map(([o,v])=>(<div key={o} style={{ fontSize:12,marginBottom:2 }}><span style={{ fontWeight:500 }}>{o}</span>{v.late>0&&<span className="muted"> — {v.late} late</span>}{v.veryLate>0&&<span className="muted"> + {v.veryLate} very late</span>}{v.amount>0&&<span className="muted"> = {fmtN(v.amount)}</span>}</div>))}
            </td>
          </tr>)}
          </>)})}</tbody>
        <tfoot><tr style={{ fontWeight:500,borderTop:'2px solid var(--color-border)' }}>
          <td colSpan={4} style={{ padding:'8px 0' }}>Total</td>
          <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN(total)}</td><td></td>
        </tr></tfoot>
      </table></ScrollTable>
    </div>
  )
}

function MembershipSection({ records, society }) {
  const total=records.reduce((s,r)=>s+(Number(r.amount)||0),0)
  const perOwner=total/3
  if(records.length===0) return <p className="muted" style={{ marginTop:12 }}>No {society} membership invoices recorded.</p>
  return (
    <div style={{ marginTop:12 }}>
      <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Year</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice no.</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Total</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Per owner (÷3)</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Payment</th>
        </tr></thead>
        <tbody>{records.map(r=>(
          <tr key={r.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
            <td style={{ padding:'8px 0' }}>{r.membership_year}</td>
            <td style={{ padding:'8px 0' }}>{r.invoice_number||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0',fontWeight:500 }}>{fmtN(r.amount)}</td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN((Number(r.amount)||0)/3)}</td>
            <td style={{ padding:'8px 0' }}>{r.payment_date?<span className="badge success" style={{ fontSize:11 }}>{r.payment_date.split('-').reverse().join('/')}</span>:<span className="badge warning" style={{ fontSize:11 }}>Pending</span>}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr style={{ fontWeight:500,borderTop:'2px solid var(--color-border)' }}>
          <td colSpan={2} style={{ padding:'8px 0' }}>Total</td>
          <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN(total)}</td>
          <td style={{ textAlign:'right',padding:'8px 0' }}>{fmtN(perOwner)}</td><td></td>
        </tr></tfoot>
      </table></ScrollTable>
    </div>
  )
}

function CapitaSection({ records, calcOwnerCapita, totalCapitaCount }) {
  if(records.length===0) return <p className="muted" style={{ marginTop:12 }}>No NWS capita fee invoices recorded.</p>
  return (
    <div style={{ marginTop:12 }}>
      <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Year</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice no.</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoiced</th>
          {OWNERS.map(o=><th key={o} style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>{o.split(' ').pop()}</th>)}
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Payment</th>
        </tr></thead>
        <tbody>{records.map(cf=>{
          const fy=parseInt(cf.membership_year); const tc=totalCapitaCount(fy); const total=Number(cf.invoiced_amount)||0
          return (<tr key={cf.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
            <td style={{ padding:'8px 0' }}>{cf.membership_year}</td>
            <td style={{ padding:'8px 0' }}>{cf.invoice_number||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0',fontWeight:500 }}>{fmtN(total)}</td>
            {OWNERS.map(o=>{const oc=calcOwnerCapita(o,fy); return <td key={o} style={{ textAlign:'right',padding:'8px 0' }}><div>{fmtN(total*(oc/tc))}</div><div className="muted" style={{ fontSize:11 }}>{oc} head</div></td>})}
            <td style={{ padding:'8px 0' }}>{cf.payment_date?<span className="badge success" style={{ fontSize:11 }}>{cf.payment_date.split('-').reverse().join('/')}</span>:<span className="badge warning" style={{ fontSize:11 }}>Pending</span>}</td>
          </tr>)
        })}</tbody>
      </table></ScrollTable>
    </div>
  )
}

function HerdSection({ records, calcOwnerHerd }) {
  if(records.length===0) return <p className="muted" style={{ marginTop:12 }}>No NSBA herd fee invoices recorded.</p>
  return (
    <div style={{ marginTop:12 }}>
      <ScrollTable><table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ borderBottom:'1px solid var(--color-border)' }}>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Year</th>
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoice no.</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Rate/head</th>
          <th style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Invoiced</th>
          {OWNERS.map(o=><th key={o} style={{ textAlign:'right',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>{o.split(' ').pop()}</th>)}
          <th style={{ textAlign:'left',padding:'6px 0',fontSize:12,color:'var(--color-text-muted)' }}>Payment</th>
        </tr></thead>
        <tbody>{records.map(hf=>{
          const fy=parseInt(hf.membership_year); const rate=Number(hf.rate_per_head)||0
          return (<tr key={hf.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
            <td style={{ padding:'8px 0' }}>{hf.membership_year}</td>
            <td style={{ padding:'8px 0' }}>{hf.invoice_number||<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0' }}>{rate?fmtN(rate):<span className="faint">—</span>}</td>
            <td style={{ textAlign:'right',padding:'8px 0',fontWeight:500 }}>{fmtN(hf.invoiced_amount)}</td>
            {OWNERS.map(o=>{const oc=calcOwnerHerd(o,fy); return <td key={o} style={{ textAlign:'right',padding:'8px 0' }}><div>{rate?fmtN(oc*rate):<span className="faint">—</span>}</div><div className="muted" style={{ fontSize:11 }}>{oc} head</div></td>})}
            <td style={{ padding:'8px 0' }}>{hf.payment_date?<span className="badge success" style={{ fontSize:11 }}>{hf.payment_date.split('-').reverse().join('/')}</span>:<span className="badge warning" style={{ fontSize:11 }}>Pending</span>}</td>
          </tr>)
        })}</tbody>
      </table></ScrollTable>
    </div>
  )
}
