import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function fmtDate(d) { if (!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }

function fmt(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CollapsibleSection({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ padding: 0 }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '14px 16px', userSelect: 'none' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{title}</h2>
        <div className="row" style={{ gap: 12 }}>
          {count !== undefined && <span className="muted">{count} record{count !== 1 ? 's' : ''}</span>}
          <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
        </div>
      </div>
      {open && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>{children}</div>}
    </div>
  )
}

export default function Reconciliation({ search: parentSearch = '', onSearchChange }) {
  const [localSearch, setLocalSearch] = useState(parentSearch)
  const search = onSearchChange ? parentSearch : localSearch
  const setSearch = onSearchChange || setLocalSearch

  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('batches').select('*'),
      supabase.from('calves').select('id, owner, ear_tag, identity_number'),
    ]).then(([b, c]) => {
      setBatches(b.data || [])
      setCalves(c.data || [])
    })
  }, [])

  const dnaTestingCount = batches.filter((b) => b.invoice_number || b.batch_report_number || b.invoice_test_count || b.rate_per_test).length
  const totalDnaAmount = batches.reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)

  return (
    <div className="stack" style={{ gap: 16 }}>

      {/* Non-collapsible summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Summary</h2>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>DNA Testing invoices</div>
            <div style={{ fontSize: 32, fontWeight: 600 }}>{dnaTestingCount}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>DNA Testing total</div>
            <div style={{ fontSize: 32, fontWeight: 600 }}>{fmt(totalDnaAmount)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Late Registrations</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-text-muted)' }}>—</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Annual &amp; Herd Fees</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-text-muted)' }}>—</div>
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ear tag or identity number..."
          style={{ flex: 1, minWidth: 240, maxWidth: 360 }}
        />
      </div>

      <CollapsibleSection title="DNA Testing" count={dnaTestingCount} defaultOpen={false}>
        <InvoiceReconciliation search={search} />
      </CollapsibleSection>

      <CollapsibleSection title="Late Registrations" count={0} defaultOpen={false}>
        <p className="muted" style={{ margin: 0 }}>Late registration invoices will be listed here. See the Late Registrations tab to create one.</p>
      </CollapsibleSection>

      <CollapsibleSection title="Annual and Herd Fees" count={0} defaultOpen={false}>
        <p className="muted" style={{ margin: 0 }}>To be configured / structured at a later stage.</p>
      </CollapsibleSection>

    </div>
  )
}

function InvoiceReconciliation({ search = '' }) {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedBatch, setExpandedBatch] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('batches').select('*').order('invoice_date', { ascending: false }),
      supabase.from('calves').select('id, owner, ear_tag, identity_number'),
    ]).then(([b, c]) => {
      setBatches(b.data || [])
      setCalves(c.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="muted">Loading...</p>

  const relevantAll = batches.filter((b) => b.invoice_number || b.batch_report_number || b.invoice_test_count || b.rate_per_test)
  const relevant = !search ? relevantAll : relevantAll.filter((b) => {
    const summaries = b.calf_summaries || []
    const calfIds = b.calf_ids || []
    const batchCalves = summaries.length > 0
      ? summaries.map(s => calves.find(c => c.id === s.id || c.ear_tag === s.earTag) || s)
      : calves.filter(c => calfIds.includes(c.id))
    return batchCalves.some(c =>
      (c.ear_tag || c.earTag || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.identity_number || c.identityNumber || '').toLowerCase().includes(search.toLowerCase())
    )
  })

  // Calculate per-owner breakdown for a batch
  function getOwnerBreakdown(batch) {
    const summaries = batch.calf_summaries || []
    const calfIds = batch.calf_ids || []
    const batchCalves = summaries.length > 0
      ? summaries.map(s => calves.find(c => c.id === s.id || c.ear_tag === s.earTag) || s)
      : calves.filter(c => calfIds.includes(c.id))

    const byOwner = {}
    batchCalves.forEach(c => {
      const owner = c.owner || 'Unknown'
      byOwner[owner] = (byOwner[owner] || 0) + 1
    })
    return byOwner
  }

  const totalTests = relevant.reduce((s, b) => s + (b.invoice_test_count || 0), 0)
  const totalAmount = relevant.reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)

  const ownerTotals = {}
  relevant.forEach(b => {
    const breakdown = getOwnerBreakdown(b)
    const rate = b.rate_per_test || (b.invoice_test_count ? (parseFloat(b.invoice_amount_payable) || 0) / b.invoice_test_count : 0)
    Object.entries(breakdown).forEach(([owner, qty]) => {
      if (!ownerTotals[owner]) ownerTotals[owner] = { qty: 0, amount: 0 }
      ownerTotals[owner].qty += qty
      ownerTotals[owner].amount += qty * rate
    })
  })

  if (relevant.length === 0) {
    return <p className="muted">{search ? `No invoiced batches match "${search}".` : 'No invoice or batch report numbers recorded yet. Fill these in on the Batches tab.'}</p>
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>NSBA Invoices</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Pulled automatically from batch records.</p>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Owner(s)</th>
                <th>NSBA invoice no.</th>
                <th>Batch U-no.</th>
                <th style={{ textAlign: 'right' }}>Qty tests</th>
                <th style={{ textAlign: 'right' }}>Rate/test</th>
                <th style={{ textAlign: 'right' }}>Total excl. VAT</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {relevant.map((b) => {
                const breakdown = getOwnerBreakdown(b)
                const owners = Object.keys(breakdown)
                const rate = b.rate_per_test
                const total = b.invoice_amount_payable ? parseFloat(b.invoice_amount_payable) : (rate && b.invoice_test_count ? rate * b.invoice_test_count : null)
                const isExpanded = expandedBatch === b.id
                const multiOwner = owners.length > 1

                return (
                  <>
                    <tr key={b.id} style={{ borderBottom: isExpanded ? 'none' : undefined }}>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span>{owners.join(', ') || b.owner}</span>
                          {multiOwner && (
                            <button onClick={() => setExpandedBatch(isExpanded ? null : b.id)} style={{ fontSize: 11, padding: '1px 6px' }}>
                              {isExpanded ? 'Hide split ▲' : 'Show split ▼'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{b.invoice_number || <span className="faint">—</span>}</td>
                      <td>{b.batch_report_number || <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{b.invoice_test_count || <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{rate ? fmt(rate) : <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{total ? fmt(total) : <span className="faint">—</span>}</td>
                      <td>{b.payment_date ? <span className="badge success">{fmtDate(b.payment_date)}</span> : <span className="badge warning">Pending</span>}</td>
                      <td></td>
                    </tr>
                    {isExpanded && multiOwner && Object.entries(breakdown).map(([owner, qty]) => (
                      <tr key={owner} style={{ background: 'var(--color-accent-light)', fontSize: 12 }}>
                        <td style={{ paddingLeft: 24 }}>{owner}</td>
                        <td></td>
                        <td></td>
                        <td style={{ textAlign: 'right' }}>{qty}</td>
                        <td style={{ textAlign: 'right' }}>{rate ? fmt(rate) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{rate ? fmt(rate * qty) : '—'}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}>
                <td colSpan={3}>Total</td>
                <td style={{ textAlign: 'right' }}>{totalTests}</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{fmt(totalAmount)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Per owner summary</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Total DNA tests and cost allocated per owner across all batches.</p>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th style={{ textAlign: 'right' }}>Total tests</th>
                <th style={{ textAlign: 'right' }}>Total amount excl. VAT</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ownerTotals).sort().map(([owner, data]) => (
                <tr key={owner}>
                  <td><strong>{owner}</strong></td>
                  <td style={{ textAlign: 'right' }}>{data.qty}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(data.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}>
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{Object.values(ownerTotals).reduce((s, d) => s + d.qty, 0)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(Object.values(ownerTotals).reduce((s, d) => s + d.amount, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
