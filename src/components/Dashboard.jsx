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

export default function Dashboard() {
  const [calves, setCalves] = useState([])
  const [cattle, setCattle] = useState([])
  const [batches, setBatches] = useState([])
  const [societyMemberships, setSocietyMemberships] = useState([])
  const [societyFees, setSocietyFees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [c, r, b, sm, sf] = await Promise.all([
        supabase.from('calves').select('id, owner, sold_flag, sold_payment_received_date'),
        supabase.from('cattle_register').select('id, owner'),
        supabase.from('batches').select('id, owner, submission_date, batch_report_number, invoice_amount_payable, payment_date, invoice_test_count'),
        supabase.from('society_memberships').select('id, society, amount, payment_date'),
        supabase.from('society_herd_fees').select('id, society, invoiced_amount, payment_date'),
      ])
      if (!c.error) setCalves(c.data || [])
      if (!r.error) setCattle(r.data || [])
      if (!b.error) setBatches(b.data || [])
      if (!sm.error) setSocietyMemberships(sm.data || [])
      if (!sf.error) setSocietyFees(sf.data || [])
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

  const nsbaMembTotal = societyMemberships.filter(m => m.society === 'NSBA').reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
  const nsbaMembPaid = societyMemberships.filter(m => m.society === 'NSBA' && m.payment_date).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
  const nsbaHerdTotal = societyFees.filter(f => f.society === 'NSBA').reduce((s, f) => s + (parseFloat(f.invoiced_amount) || 0), 0)
  const nsbaHerdPaid = societyFees.filter(f => f.society === 'NSBA' && f.payment_date).reduce((s, f) => s + (parseFloat(f.invoiced_amount) || 0), 0)
  const nwsMembTotal = societyMemberships.filter(m => m.society === 'NWS').reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
  const nwsMembPaid = societyMemberships.filter(m => m.society === 'NWS' && m.payment_date).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0)
  const nwsCapitaTotal = societyFees.filter(f => f.society === 'NWS').reduce((s, f) => s + (parseFloat(f.invoiced_amount) || 0), 0)
  const nwsCapitaPaid = societyFees.filter(f => f.society === 'NWS' && f.payment_date).reduce((s, f) => s + (parseFloat(f.invoiced_amount) || 0), 0)
  const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

      {(nsbaMembTotal > 0 || nsbaHerdTotal > 0 || nwsMembTotal > 0 || nwsCapitaTotal > 0) && (<div><h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Society fees</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{(nsbaMembTotal > 0 || nsbaHerdTotal > 0) && (<div className="card"><div className="muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>NSBA</div><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}><span className="muted" style={{ fontSize: 12 }}>Membership</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nsbaMembTotal)}</span><span className="muted" style={{ fontSize: 12 }}>Herd fees</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nsbaHerdTotal)}</span><span className="muted" style={{ fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>Outstanding</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--color-border)', paddingTop: 4, color:(nsbaMembTotal-nsbaMembPaid+nsbaHerdTotal-nsbaHerdPaid)>0?'var(--color-warning-text)':undefined }}>N$ {fmt(nsbaMembTotal-nsbaMembPaid+nsbaHerdTotal-nsbaHerdPaid)}</span></div></div>)}{(nwsMembTotal > 0 || nwsCapitaTotal > 0) && (<div className="card"><div className="muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Namibian Wagyu Society</div><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}><span className="muted" style={{ fontSize: 12 }}>Membership</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nwsMembTotal)}</span><span className="muted" style={{ fontSize: 12 }}>Capita fees</span><span style={{ fontWeight: 500, textAlign: 'right' }}>N$ {fmt(nwsCapitaTotal)}</span><span className="muted" style={{ fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>Outstanding</span><span style={{ fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--color-border)', paddingTop: 4, color:(nwsMembTotal-nwsMembPaid+nwsCapitaTotal-nwsCapitaPaid)>0?'var(--color-warning-text)':undefined }}>N$ {fmt(nwsMembTotal-nwsMembPaid+nwsCapitaTotal-nwsCapitaPaid)}</span></div></div>)}</div></div>)}
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Per owner</h2>
        <div className="card" style={{ padding: 0 }}>
          <table>
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
                const ownerOutstanding = ownerBatches
                  .filter((b) => !b.payment_date)
                  .reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)
                return (
                  <tr key={owner}>
                    <td><strong>{owner}</strong></td>
                    <td style={{ textAlign: 'right' }}>{ownerCalves}</td>
                    <td style={{ textAlign: 'right' }}>{ownerCattle}</td>
                    <td style={{ textAlign: 'right' }}>{ownerBatches.length}</td>
                    <td style={{ textAlign: 'right' }}>
                      {ownerPending > 0 ? <span className="badge warning">{ownerPending}</span> : <span className="faint">0</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {ownerOutstanding > 0
                        ? <span style={{ color: 'var(--color-warning-text)' }}>N$ {fmt(ownerOutstanding)}</span>
                        : <span className="faint">&mdash;</span>}
                    </td>
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
