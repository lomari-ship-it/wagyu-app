import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function fmt(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Reconciliation() {
  const [tab, setTab] = useState('invoices')

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
        <button className={tab === 'invoices' ? 'primary' : ''} onClick={() => setTab('invoices')}>Invoice reconciliation</button>
        <button className={tab === 'levy' ? 'primary' : ''} onClick={() => setTab('levy')}>Levy List</button>
      </div>
      {tab === 'invoices' && <InvoiceReconciliation />}
      {tab === 'levy' && <LevyList />}
    </div>
  )
}

function InvoiceReconciliation() {
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

  const relevant = batches.filter((b) => b.invoice_number || b.batch_report_number || b.invoice_test_count || b.rate_per_test)

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

  // Grand totals
  const totalTests = relevant.reduce((s, b) => s + (b.invoice_test_count || 0), 0)
  const totalAmount = relevant.reduce((s, b) => s + (parseFloat(b.invoice_amount_payable) || 0), 0)

  // Per-owner totals across all batches
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
    return <p className="muted">No invoice or batch report numbers recorded yet. Fill these in on the Batches tab.</p>
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 500 }}>Invoice and batch report reconciliation</h2>
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
                      <td>{b.payment_date ? <span className="badge success">{b.payment_date}</span> : <span className="badge warning">Pending</span>}</td>
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

function LevyList() {
  const [levyText, setLevyText] = useState('')
  const [levyRecords, setLevyRecords] = useState([])
  const [calves, setCalves] = useState([])
  const [statusMsg, setStatusMsg] = useState('')
  const [includeSold, setIncludeSold] = useState(false)
  const [reconciled, setReconciled] = useState(false)

  useEffect(() => {
    supabase.from('calves').select('id, owner, ear_tag, identity_number, birth_date, sold_flag').then(({ data }) => {
      setCalves(data || [])
    })
    // Load saved levy records
    supabase.from('levy_list_records').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data && data.length > 0) {
        setLevyRecords(data)
        setReconciled(true)
        setStatusMsg(`Showing saved Levy List (${data.length} entries).`)
      }
    })
  }, [])

  function parseLevyText(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const records = []
    for (const line of lines) {
      const parts = line.split(/\t+/).map((p) => p.trim())
      if (parts.length < 1 || parts[0].toLowerCase().includes('ident')) continue
      records.push({
        ident: parts[0],
        dob: parts[1] || null,
        mother_ident: parts[2] || null,
        father_ident: parts[3] || null,
        computer_number: parts[4] || null,
      })
    }
    return records
  }

  async function reconcile() {
    const records = parseLevyText(levyText)
    if (records.length === 0) {
      setStatusMsg('No records found. Check the format.')
      return
    }

    // Save to Supabase — clear old, insert new
    await supabase.from('levy_list_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await supabase.from('levy_list_records').insert(
      records.map((r) => ({ ...r, report_date: new Date().toISOString().slice(0, 10) }))
    )
    if (error) {
      setStatusMsg('Save failed: ' + error.message)
      return
    }

    setLevyRecords(records)
    setReconciled(true)
    setStatusMsg(`Reconciled ${records.length} Levy List entries.`)
  }

  const activeCalves = includeSold ? calves : calves.filter((c) => !c.sold_flag)
  const levyIdents = new Set(levyRecords.map((r) => (r.ident || '').toUpperCase()))
  const calfIdents = new Set(activeCalves.filter((c) => c.identity_number).map((c) => c.identity_number.toUpperCase()))

  const confirmed = activeCalves.filter((c) => c.identity_number && levyIdents.has(c.identity_number.toUpperCase()))
  const notListed = activeCalves.filter((c) => !c.identity_number || !levyIdents.has(c.identity_number.toUpperCase()))
  const unmatched = levyRecords.filter((r) => !calfIdents.has((r.ident || '').toUpperCase()))
  const soldCount = calves.filter((c) => c.sold_flag).length

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>Levy List upload</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Paste extracted Levy List data below (tab-separated: Ident, DOB, Mother, Father, Computer Number) then click Reconcile.</p>
        <textarea
          rows={6}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          value={levyText}
          onChange={(e) => setLevyText(e.target.value)}
          placeholder={'26-1001JFW\t01/02/26\t21-0002NW\t\t4043719121\n26-1030JFW\t20/02/26\t\tJFW26MULT00\t4043718883'}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={reconcile} disabled={!levyText.trim()}>Reconcile</button>
          <span className="muted">{statusMsg}</span>
        </div>
      </div>

      {reconciled && (
        <>
          {!includeSold && soldCount > 0 && (
            <p className="muted" style={{ fontSize: 12 }}>{soldCount} sold/transferred calf{soldCount !== 1 ? 'ves' : ''} excluded.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Levy List entries</div>
              <div style={{ fontSize: 28, fontWeight: 500 }}>{levyRecords.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Confirmed</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-success-text)' }}>{confirmed.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Not yet listed</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-warning-text)' }}>{notListed.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Not in our records</div>
              <div style={{ fontSize: 28, fontWeight: 500 }}>{unmatched.length}</div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} style={{ width: 'auto' }} />
            Include sold/transferred calves
          </label>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Our calves — Levy List status</h3>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Ear tag</th>
                    <th>Identity number</th>
                    <th>Birth date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalves.map((c) => {
                    const isConfirmed = c.identity_number && levyIdents.has(c.identity_number.toUpperCase())
                    return (
                      <tr key={c.id} style={{ opacity: c.sold_flag ? 0.6 : 1 }}>
                        <td>{c.owner}</td>
                        <td><strong>{c.ear_tag}</strong>{c.sold_flag && <span className="faint" style={{ fontSize: 11 }}> (sold)</span>}</td>
                        <td>{c.identity_number || <span className="faint">—</span>}</td>
                        <td>{c.birth_date}</td>
                        <td>
                          <span className={`badge ${isConfirmed ? 'success' : 'warning'}`}>
                            {isConfirmed ? 'Confirmed' : (c.identity_number ? 'Not yet listed' : 'No ID')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {unmatched.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Levy List entries not in our records</h3>
              <p className="muted" style={{ marginBottom: 8 }}>Older animals, other owners, or calves not yet entered.</p>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ident</th>
                      <th>DOB</th>
                      <th>Mother</th>
                      <th>Father</th>
                      <th>Computer number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((r, i) => (
                      <tr key={i}>
                        <td><strong>{r.ident}</strong></td>
                        <td>{r.dob || <span className="faint">—</span>}</td>
                        <td>{r.mother_ident || <span className="faint">—</span>}</td>
                        <td>{r.father_ident || <span className="faint">—</span>}</td>
                        <td>{r.computer_number || <span className="faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
