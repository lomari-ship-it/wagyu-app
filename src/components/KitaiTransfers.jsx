import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  const parts = n.toFixed(2).split('.')
  return 'N$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '-' + parts[1]
}

export default function KitaiTransfers() {
  const [transfers, setTransfers] = useState([])
  const [calves, setCalves] = useState([])
  const [cattle, setCattle] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [t, c, ca, b] = await Promise.all([
      supabase.from('kitai_transfers').select('*').order('created_at', { ascending: false }),
      supabase.from('calves').select('*').eq('sold_flag', true),
      supabase.from('cattle_register').select('*').eq('archived', true).eq('transfer_type', 'sold'),
      supabase.from('batches').select('id, calf_ids, calf_summaries, rate_per_test, invoice_test_count, invoice_amount_payable'),
    ])
    if (!t.error) setTransfers(t.data || [])
    if (!c.error) setCalves(c.data || [])
    if (!ca.error) setCattle(ca.data || [])
    if (!b.error) setBatches(b.data || [])
    setLoading(false)
  }

  // Find DNA cost for a calf from its batch
  function getDnaCost(calfId, earTag) {
    for (const batch of batches) {
      const calfIds = batch.calf_ids || []
      const summaries = batch.calf_summaries || []
      const inBatch = calfIds.includes(calfId) ||
        summaries.some(s => s.id === calfId || s.earTag === earTag)
      if (inBatch) {
        if (batch.rate_per_test) return parseFloat(batch.rate_per_test)
        if (batch.invoice_amount_payable && batch.invoice_test_count) {
          return parseFloat(batch.invoice_amount_payable) / batch.invoice_test_count
        }
      }
    }
    return null
  }

  // Animals eligible for Kitai transfer (sold calves + sold cattle not yet in kitai_transfers)
  const transferredIds = new Set(transfers.map(t => t.animal_id))

  const eligibleCalves = calves.filter(c => !transferredIds.has(c.id) && c.sold_buyer === 'Kitai')
  const eligibleCattle = cattle.filter(c => !transferredIds.has(c.id) && c.transfer_customer === 'Kitai')

  async function addTransfer(animal, type) {
    const dnaCost = type === 'calf' ? getDnaCost(animal.id, animal.ear_tag) : null
    const { error } = await supabase.from('kitai_transfers').insert({
      animal_type: type,
      animal_id: animal.id,
      owner: animal.owner,
      ear_tag: animal.ear_tag,
      identity_number: animal.identity_number || null,
      birth_date: animal.birth_date || null,
      transfer_date: type === 'calf' ? (animal.sold_date || null) : (animal.transfer_date || null),
      dna_cost_recoverable: dnaCost,
      invoice_status: 'pending',
    })
    if (error) alert('Failed: ' + error.message)
    else loadAll()
  }

  async function updateTransfer(id, updates) {
    await supabase.from('kitai_transfers').update(updates).eq('id', id)
    loadAll()
  }

  async function deleteTransfer(id) {
    await supabase.from('kitai_transfers').delete().eq('id', id)
    loadAll()
  }

  const filtered = statusFilter === 'all' ? transfers : transfers.filter(t => t.invoice_status === statusFilter)

  // Totals
  const totalDna = transfers.reduce((s, t) => s + (parseFloat(t.dna_cost_recoverable) || 0), 0)
  const pendingDna = transfers.filter(t => t.invoice_status === 'pending').reduce((s, t) => s + (parseFloat(t.dna_cost_recoverable) || 0), 0)

  // Per owner totals
  const byOwner = {}
  transfers.forEach(t => {
    if (!byOwner[t.owner]) byOwner[t.owner] = { count: 0, total: 0, pending: 0 }
    byOwner[t.owner].count++
    byOwner[t.owner].total += parseFloat(t.dna_cost_recoverable) || 0
    if (t.invoice_status === 'pending') byOwner[t.owner].pending += parseFloat(t.dna_cost_recoverable) || 0
  })

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>

      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Kitai transfers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Total transferred</div>
            <div style={{ fontSize: 28, fontWeight: 500 }}>{transfers.length}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Total DNA recoverable</div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{fmtCurrency(totalDna)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Pending invoice</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-warning-text)' }}>{fmtCurrency(pendingDna)}</div>
          </div>
        </div>

        {/* Per owner breakdown */}
        {Object.keys(byOwner).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th style={{ textAlign: 'right' }}>Animals</th>
                  <th style={{ textAlign: 'right' }}>DNA cost recoverable</th>
                  <th style={{ textAlign: 'right' }}>Pending invoice</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byOwner).sort().map(([owner, data]) => (
                  <tr key={owner}>
                    <td>{owner}</td>
                    <td style={{ textAlign: 'right' }}>{data.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(data.total)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {data.pending > 0
                        ? <span style={{ color: 'var(--color-warning-text)' }}>{fmtCurrency(data.pending)}</span>
                        : <span className="faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Animals to add */}
      {(eligibleCalves.length > 0 || eligibleCattle.length > 0) && (
        <div className="card">
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>Animals sold to Kitai — not yet tracked</h2>
          <p className="muted" style={{ marginBottom: 12 }}>These animals are marked as sold to Kitai but haven't been added to the transfer tracker yet.</p>
          <div className="stack" style={{ gap: 6 }}>
            {eligibleCalves.map(c => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>CALF</span>
                  <strong>{c.ear_tag}</strong>
                  {c.identity_number && <span className="muted" style={{ marginLeft: 6 }}>{c.identity_number}</span>}
                  <span className="muted" style={{ marginLeft: 6 }}>{c.owner}</span>
                  {getDnaCost(c.id, c.ear_tag) && (
                    <span className="muted" style={{ marginLeft: 6 }}>DNA: {fmtCurrency(getDnaCost(c.id, c.ear_tag))}</span>
                  )}
                </div>
                <button className="primary" style={{ fontSize: 12 }} onClick={() => addTransfer(c, 'calf')}>Add to tracker</button>
              </div>
            ))}
            {eligibleCattle.map(c => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>CATTLE</span>
                  <strong>{c.ear_tag}</strong>
                  {c.identity_number && <span className="muted" style={{ marginLeft: 6 }}>{c.identity_number}</span>}
                  <span className="muted" style={{ marginLeft: 6 }}>{c.owner}</span>
                </div>
                <button className="primary" style={{ fontSize: 12 }} onClick={() => addTransfer(c, 'cattle')}>Add to tracker</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer list */}
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Transfer records</h2>
          <div className="row" style={{ gap: 6 }}>
            {['all', 'pending', 'invoiced'].map(s => (
              <button key={s} className={statusFilter === s ? 'primary' : ''} style={{ fontSize: 12 }} onClick={() => setStatusFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="muted">No transfer records{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''} yet.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Owner</th>
                  <th>Ear tag</th>
                  <th>Identity no.</th>
                  <th>Transfer date</th>
                  <th style={{ textAlign: 'right' }}>DNA recoverable</th>
                  <th>Invoice status</th>
                  <th>Invoice no.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td><span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span></td>
                    <td>{t.owner}</td>
                    <td><strong>{t.ear_tag}</strong></td>
                    <td>{t.identity_number || <span className="faint">—</span>}</td>
                    <td>{t.transfer_date || <span className="faint">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(t.dna_cost_recoverable)}</td>
                    <td>
                      <span className={`badge ${t.invoice_status === 'invoiced' ? 'success' : 'warning'}`}>
                        {t.invoice_status === 'invoiced' ? 'Invoiced' : 'Pending invoice'}
                      </span>
                    </td>
                    <td>
                      {t.invoice_status === 'invoiced'
                        ? <span style={{ fontSize: 13 }}>{t.invoice_number || <span className="faint">—</span>}</span>
                        : <input
                            style={{ width: 120, fontSize: 12 }}
                            defaultValue={t.invoice_number || ''}
                            placeholder="Invoice no."
                            onBlur={e => updateTransfer(t.id, { invoice_number: e.target.value || null })}
                          />
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        {t.invoice_status === 'pending' ? (
                          <button className="primary" style={{ fontSize: 12 }} onClick={() => updateTransfer(t.id, { invoice_status: 'invoiced', invoice_date: new Date().toISOString().slice(0, 10) })}>
                            Mark invoiced
                          </button>
                        ) : (
                          <button style={{ fontSize: 12 }} onClick={() => updateTransfer(t.id, { invoice_status: 'pending', invoice_date: null })}>
                            Revert
                          </button>
                        )}
                        <button className="danger-text" onClick={() => deleteTransfer(t.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}>
                  <td colSpan={5}>Total</td>
                  <td style={{ textAlign: 'right' }}>{fmtCurrency(filtered.reduce((s, t) => s + (parseFloat(t.dna_cost_recoverable) || 0), 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
