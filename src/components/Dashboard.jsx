import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function fyStartDate(y) { return `${y}-07-01` }

export default function Dashboard() {
  const [calves, setCalves] = useState([])
  const [cattle, setCattle] = useState([])
  const [batches, setBatches] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [societyMemberships, setSocietyMemberships] = useState([])
  const [societyFees, setSocietyFees] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [c, r, b, cr, sm, sf, p] = await Promise.all([
        supabase.from('calves').select('id, owner, sold_flag, birth_date, identity_number'),
        supabase.from('cattle_register').select('id, owner'),
        supabase.from('batches').select('id, owner, submission_date, batch_report_number, invoice_amount_payable, payment_date, invoice_test_count, rate_per_test, calf_ids, calf_summaries'),
        supabase.from('cattle_register').select('id,owner,ear_tag,identity_number,purchase_date').eq('animal_type','breeding'),
        supabase.from('society_memberships').select('id, society, amount, payment_date, membership_year'),
        supabase.from('society_herd_fees').select('id, society, invoiced_amount, payment_date, membership_year, rate_per_head'),
        supabase.from('reconciliation_payments').select('owner, amount').order('payment_date', { ascending: false }),
      ])
      if (!c.error) setCalves(c.data || [])
      if (!r.error) setCattle(r.data || [])
      if (!b.error) setBatches(b.data || [])
      if (!cr.error) setBreedingAnimals(cr.data || [])
      if (!sm.error) setSocietyMemberships(sm.data || [])
      if (!sf.error) setSocietyFees(sf.data || [])
      if (!p.error) setPayments(p.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="muted">Loading dashboard...</p>

  const activeCalves = calves.filter((c) => !c.sold_flag).length
  const soldCalves = calves.filter((c) => c.sold_flag).length
  const pendingBatches = batches.filter((b) => !b.submission_date || !b.batch_report_number).length
  const submittedBatches = batches.filter((b) => b.submission_date && b.batch_report_number).length
  const totalTests = batches.reduce((s, b) => s + (b.invoice_test_count || 0), 0)
  const totalInvoiced = batches.reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)
  const totalPaid = batches.filter((b) => b.payment_date).reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid

  const nwsMemberships = societyMemberships.filter(m => m.society === 'NWS')
  const nwsCapita = societyFees.filter(f => f.society === 'NWS')
  const nsbaMemberships = societyMemberships.filter(m => m.society === 'NSBA')
  const nsbaHerd = societyFees.filter(f => f.society === 'NSBA')

  const nwsMembTotal = nwsMemberships.reduce((s,m) => s+(parseFloat(m.amount)||0), 0)
  const nwsCapitaTotal = nwsCapita.reduce((s,f) => s+(parseFloat(f.invoiced_amount)||0), 0)
  const nsbaMembTotal = nsbaMemberships.reduce((s,m) => s+(parseFloat(m.amount)||0), 0)
  const nsbaHerdTotal = nsbaHerd.reduce((s,f) => s+(parseFloat(f.invoiced_amount)||0), 0)
  const totalSociety = nwsMembTotal + nwsCapitaTotal + nsbaMembTotal + nsbaHerdTotal

  function calcOwnerCapita(owner, fyStartYear) {
    const cutoff = fyStartDate(fyStartYear); const includeKW = fyStartYear >= 2026
    const oc = calves.filter(c => { if(c.owner!==owner||!c.birth_date||c.birth_date<'2023-07-01'||c.birth_date>=cutoff) return false; const id=(c.identity_number||'').toUpperCase(); return id.includes('ISA')||(includeKW&&id.includes('KW')) }).length
    const ob = breedingAnimals.filter(b => b.owner===owner&&b.purchase_date&&b.purchase_date<cutoff).length
    return oc+ob
  }
  function totalCapitaCount(fy) { return OWNERS.reduce((s,o)=>s+calcOwnerCapita(o,fy),0)||1 }
  function calcOwnerHerd(owner, fyStartYear) {
    if(fyStartYear===2023) return calves.filter(c=>{if(c.owner!==owner)return false;const id=(c.identity_number||'').toUpperCase();return id.includes('ISA')}).length
    const cutoff=fyStartDate(fyStartYear); const includeKW=fyStartYear>=2026
    const oc=calves.filter(c=>{if(c.owner!==owner||!c.birth_date||c.birth_date<'2023-07-01'||c.birth_date>=cutoff)return false;const id=(c.identity_number||'').toUpperCase();return id.includes('ISA')||(includeKW&&id.includes('KW'))}).length
    const ob=breedingAnimals.filter(b=>b.owner===owner&&b.purchase_date&&b.purchase_date<cutoff).length
    return oc+ob
  }

  function ownerSocietyShare(owner) {
    const nwsM = nwsMembTotal / 3
    const nwsC = nwsCapita.reduce((s,cf)=>{ const fy=parseInt(cf.membership_year); const oc=calcOwnerCapita(owner,fy); const tc=totalCapitaCount(fy); return s+(Number(cf.invoiced_amount)||0)*(oc/tc) }, 0)
    const nsbaM = nsbaMembTotal / 3
    const nsbaH = nsbaHerd.reduce((s,hf)=>{ const fy=parseInt(hf.membership_year); const oc=calcOwnerHerd(owner,fy); return s+oc*(Number(hf.rate_per_head)||0) }, 0)
    return { nwsM, nwsC, nsbaM, nsbaH, total: nwsM+nwsC+nsbaM+nsbaH }
  }

  function ownerPaymentsTotal(owner) { return payments.filter(p=>p.owner===owner).reduce((s,p)=>s+(Number(p.amount)||0),0) }

  const fmt = (n) => n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Overview</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <StatCard label="Active calves" value={activeCalves} />
          <StatCard label="Sold/transferred" value={soldCalves} />
          <StatCard label="Cattle in register" value={cattle.length} />
          <StatCard label="Batches pending" value={pendingBatches} />
          <StatCard label="Batches submitted" value={submittedBatches} />
          <StatCard label="DNA tests invoiced" value={totalTests} />
        </div>
      </div>

      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>NSBA invoices</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <StatCard label="Total invoiced excl. VAT" value={`N$ ${fmt(totalInvoiced)}`} />
          <StatCard label="Paid" value={`N$ ${fmt(totalPaid)}`} />
          <StatCard label="Outstanding" value={`N$ ${fmt(totalOutstanding)}`} />
        </div>
      </div>

      {totalSociety > 0 && (
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Society fees</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            {(nwsMembTotal > 0 || nwsCapitaTotal > 0) && (
              <div className="card">
                <div className="muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Namibian Wagyu Society</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}>
                  <span className="muted" style={{ fontSize: 12 }}>Membership</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nwsMembTotal)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>Capita fees</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nwsCapitaTotal)}</span>
                  <span className="muted" style={{ fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>Total</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>N$ {fmt(nwsMembTotal + nwsCapitaTotal)}</span>
                </div>
              </div>
            )}
            {(nsbaMembTotal > 0 || nsbaHerdTotal > 0) && (
              <div className="card">
                <div className="muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>NSBA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}>
                  <span className="muted" style={{ fontSize: 12 }}>Membership</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nsbaMembTotal)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>Herd fees</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nsbaHerdTotal)}</span>
                  <span className="muted" style={{ fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>Total</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>N$ {fmt(nsbaMembTotal + nsbaHerdTotal)}</span>
                </div>
              </div>
            )}
          </div>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 500 }}>Society fees per owner — balance due to J.A Delport</h3>
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>Owner</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>NWS</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>NSBA</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>Total share</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>Paid</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase' }}>Balance due</th>
                </tr>
              </thead>
              <tbody>
                {OWNERS.filter(o => o !== 'J.A Delport').map((owner) => {
                  const share = ownerSocietyShare(owner)
                  const paid = ownerPaymentsTotal(owner)
                  const balance = share.total - paid
                  return (
                    <tr key={owner} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 12px' }}><strong>{owner}</strong></td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }}>N$ {fmt(share.nwsM + share.nwsC)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }}>N$ {fmt(share.nsbaM + share.nsbaH)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 500 }}>N$ {fmt(share.total)}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--color-success-text, #15803d)' }}>{paid > 0 ? `N$ ${fmt(paid)}` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: balance > 0 ? 'var(--color-warning-text, #92400e)' : balance < 0 ? 'var(--color-danger)' : 'var(--color-success-text, #15803d)' }}>
                        {balance === 0 ? '✓ Settled' : `N$ ${fmt(balance)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Per owner</h2>
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Owner</th>
                <th style={{ textAlign: 'right' }}>Calves</th>
                <th style={{ textAlign: 'right' }}>Cattle</th>
                <th style={{ textAlign: 'right' }}>Batches</th>
                <th style={{ textAlign: 'right' }}>Pending</th>
                <th style={{ textAlign: 'right' }}>Outstanding (N$)</th>
              </tr>
            </thead>
            <tbody>
              {OWNERS.map((owner) => {
                const ownerCalves = calves.filter((c) => c.owner === owner && !c.sold_flag).length
                const ownerCattle = cattle.filter((c) => c.owner === owner).length
                const ownerBatches = batches.filter((b) => b.owner === owner)
                const ownerPending = ownerBatches.filter((b) => !b.submission_date || !b.batch_report_number).length
                const ownerOutstanding = ownerBatches.filter((b) => !b.payment_date).reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)
                return (
                  <tr key={owner}>
                    <td><strong>{owner}</strong></td>
                    <td style={{ textAlign: 'right' }}>{ownerCalves}</td>
                    <td style={{ textAlign: 'right' }}>{ownerCattle}</td>
                    <td style={{ textAlign: 'right' }}>{ownerBatches.length}</td>
                    <td style={{ textAlign: 'right' }}>{ownerPending > 0 ? <span className="badge warning">{ownerPending}</span> : <span className="faint">0</span>}</td>
                    <td style={{ textAlign: 'right' }}>{ownerOutstanding > 0 ? <span style={{ color: 'var(--color-warning-text)' }}>N$ {fmt(ownerOutstanding)}</span> : <span className="faint">&mdash;</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
