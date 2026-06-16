import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  const parts = n.toFixed(2).split('.')
  return 'N$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '-' + parts[1]
}

export default function KitaiTransfers() {
  const [tab, setTab] = useState('dna')
  const [transfers, setTransfers] = useState([])
  const [calves, setCalves] = useState([])
  const [cattle, setCattle] = useState([])
  const [batches, setBatches] = useState([])
  const [saleInvoices, setSaleInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [t, c, ca, b, si] = await Promise.all([
      supabase.from('kitai_transfers').select('*').order('created_at', { ascending: false }),
      supabase.from('calves').select('*'),
      supabase.from('cattle_register').select('*').eq('archived', true).eq('transfer_type', 'kitai'),
      supabase.from('batches').select('id, calf_ids, calf_summaries, rate_per_test, invoice_test_count, invoice_amount_payable'),
      supabase.from('kitai_sale_invoices').select('*').order('created_at', { ascending: false }),
    ])
    if (!t.error) setTransfers(t.data || [])
    if (!c.error) setCalves(c.data || [])
    if (!ca.error) setCattle(ca.data || [])
    if (!b.error) setBatches(b.data || [])
    if (!si.error) setSaleInvoices(si.data || [])
    setLoading(false)
  }

  function getDnaCost(calfId, earTag) {
    for (const batch of batches) {
      const calfIds = batch.calf_ids || []
      const summaries = batch.calf_summaries || []
      const inBatch = calfIds.includes(calfId) || summaries.some(s => s.id === calfId || s.earTag === earTag)
      if (inBatch) {
        if (batch.rate_per_test) return parseFloat(batch.rate_per_test)
        if (batch.invoice_amount_payable && batch.invoice_test_count)
          return parseFloat(batch.invoice_amount_payable) / batch.invoice_test_count
      }
    }
    return null
  }

  const transferredIds = new Set(transfers.map(t => t.animal_id))
  const eligibleCalves = calves.filter(c => !transferredIds.has(c.id) && c.sold_buyer === 'Kitai')
  const eligibleCattle = cattle.filter(c => !transferredIds.has(c.id))

  async function addTransfer(animal, type) {
    const dnaCost = type === 'calf' ? getDnaCost(animal.id, animal.ear_tag) : null
    const { error } = await supabase.from('kitai_transfers').insert({
      animal_type: type, animal_id: animal.id, owner: animal.owner,
      ear_tag: animal.ear_tag, identity_number: animal.identity_number || null,
      birth_date: animal.birth_date || null,
      transfer_date: type === 'calf' ? (animal.sold_date || null) : (animal.transfer_date || null),
      dna_cost_recoverable: dnaCost, invoice_status: 'pending', sold_flag: false,
    })
    if (error) alert('Failed: ' + error.message)
    else loadAll()
  }

  async function updateTransfer(id, updates) {
    const updates2 = { ...updates }
    const inv = transfers.find(t => t.id === id)
    if (inv) {
      const rate = updates2.rate_per_test !== undefined ? updates2.rate_per_test : inv.rate_per_test
      const qty = 1
      if (rate) updates2.dna_cost_recoverable = rate * qty
    }
    await supabase.from('kitai_transfers').update(updates2).eq('id', id)
    loadAll()
  }

  async function deleteTransfer(id) {
    await supabase.from('kitai_transfers').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
        <button className={tab === 'dna' ? 'primary' : ''} onClick={() => setTab('dna')}>DNA cost recovery</button>
        <button className={tab === 'sales' ? 'primary' : ''} onClick={() => setTab('sales')}>Sale invoices</button>
      </div>

      {tab === 'dna' && (
        <DnaRecovery
          transfers={transfers}
          eligibleCalves={eligibleCalves}
          eligibleCattle={eligibleCattle}
          getDnaCost={getDnaCost}
          onAdd={addTransfer}
          onUpdate={updateTransfer}
          onDelete={deleteTransfer}
        />
      )}

      {tab === 'sales' && (
        <SaleInvoices
          transfers={transfers}
          saleInvoices={saleInvoices}
          onReload={loadAll}
        />
      )}
    </div>
  )
}

function DnaRecovery({ transfers, eligibleCalves, eligibleCattle, getDnaCost, onAdd, onUpdate, onDelete }) {
  const [statusFilter, setStatusFilter] = useState('all')

  const totalDna = transfers.reduce((s, t) => s + (parseFloat(t.dna_cost_recoverable) || 0), 0)
  const pendingDna = transfers.filter(t => t.invoice_status === 'pending').reduce((s, t) => s + (parseFloat(t.dna_cost_recoverable) || 0), 0)

  const byOwner = {}
  transfers.forEach(t => {
    if (!byOwner[t.owner]) byOwner[t.owner] = { count: 0, total: 0, pending: 0 }
    byOwner[t.owner].count++
    byOwner[t.owner].total += parseFloat(t.dna_cost_recoverable) || 0
    if (t.invoice_status === 'pending') byOwner[t.owner].pending += parseFloat(t.dna_cost_recoverable) || 0
  })

  const filtered = statusFilter === 'all' ? transfers : transfers.filter(t => t.invoice_status === statusFilter)

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>DNA cost recovery</h2>
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
        {Object.keys(byOwner).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Owner</th><th style={{ textAlign: 'right' }}>Animals</th><th style={{ textAlign: 'right' }}>DNA recoverable</th><th style={{ textAlign: 'right' }}>Pending</th></tr></thead>
              <tbody>
                {Object.entries(byOwner).sort().map(([owner, data]) => (
                  <tr key={owner}>
                    <td>{owner}</td>
                    <td style={{ textAlign: 'right' }}>{data.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(data.total)}</td>
                    <td style={{ textAlign: 'right' }}>{data.pending > 0 ? <span style={{ color: 'var(--color-warning-text)' }}>{fmtCurrency(data.pending)}</span> : <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(eligibleCalves.length > 0 || eligibleCattle.length > 0) && (
        <div className="card">
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>Animals transferred to Kitai — not yet tracked</h2>
          <div className="stack" style={{ gap: 6 }}>
            {eligibleCalves.map(c => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>CALF</span>
                  <strong>{c.ear_tag}</strong>
                  {c.identity_number && <span className="muted" style={{ marginLeft: 6 }}>{c.identity_number}</span>}
                  <span className="muted" style={{ marginLeft: 6 }}>{c.owner}</span>
                  {getDnaCost(c.id, c.ear_tag) && <span className="muted" style={{ marginLeft: 6 }}>DNA: {fmtCurrency(getDnaCost(c.id, c.ear_tag))}</span>}
                </div>
                <button className="primary" style={{ fontSize: 12 }} onClick={() => onAdd(c, 'calf')}>Add to tracker</button>
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
                <button className="primary" style={{ fontSize: 12 }} onClick={() => onAdd(c, 'cattle')}>Add to tracker</button>
              </div>
            ))}
          </div>
        </div>
      )}

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
        {filtered.length === 0 ? <p className="muted">No transfer records yet.</p> : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Type</th><th>Owner</th><th>Ear tag</th><th>Identity no.</th><th>Transfer date</th><th style={{ textAlign: 'right' }}>DNA recoverable</th><th>Invoice status</th><th>Invoice no.</th><th></th></tr>
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
                    <td><span className={`badge ${t.invoice_status === 'invoiced' ? 'success' : 'warning'}`}>{t.invoice_status === 'invoiced' ? 'Invoiced' : 'Pending'}</span></td>
                    <td>
                      {t.invoice_status === 'invoiced'
                        ? <span style={{ fontSize: 13 }}>{t.invoice_number || <span className="faint">—</span>}</span>
                        : <input style={{ width: 120, fontSize: 12 }} defaultValue={t.invoice_number || ''} placeholder="Invoice no." onBlur={e => onUpdate(t.id, { invoice_number: e.target.value || null })} />
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        {t.invoice_status === 'pending'
                          ? <button className="primary" style={{ fontSize: 12 }} onClick={() => onUpdate(t.id, { invoice_status: 'invoiced', invoice_date: new Date().toISOString().slice(0, 10) })}>Mark invoiced</button>
                          : <button style={{ fontSize: 12 }} onClick={() => onUpdate(t.id, { invoice_status: 'pending', invoice_date: null })}>Revert</button>
                        }
                        <button className="danger-text" onClick={() => onDelete(t.id)}>Delete</button>
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

function SaleInvoices({ transfers, saleInvoices, onReload }) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [newInvoice, setNewInvoice] = useState({ date: '', number: '', amount: '', notes: '' })
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState(null)

  const invoicedIds = new Set(saleInvoices.flatMap(i => i.animal_ids || []))
  const unsold = transfers.filter(t => !t.sold_flag && !invoicedIds.has(t.id))
  const sold = transfers.filter(t => t.sold_flag || invoicedIds.has(t.id))

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function createInvoice() {
    if (selectedIds.size === 0) { setCreateMsg('Select at least one animal.'); return }
    setCreating(true); setCreateMsg('Creating...')
    const selected = transfers.filter(t => selectedIds.has(t.id))
    const { error: invErr } = await supabase.from('kitai_sale_invoices').insert({
      invoice_date: newInvoice.date || null,
      invoice_number: newInvoice.number || null,
      amount: newInvoice.amount ? parseFloat(newInvoice.amount) : null,
      notes: newInvoice.notes || null,
      animal_ids: Array.from(selectedIds),
      animal_summaries: selected.map(t => ({ id: t.id, earTag: t.ear_tag, identityNumber: t.identity_number, owner: t.owner, animalType: t.animal_type })),
    })
    if (invErr) { setCreateMsg('Failed: ' + invErr.message); setCreating(false); return }
    setCreateMsg('Invoice created.')
    setSelectedIds(new Set())
    setNewInvoice({ date: '', number: '', amount: '', notes: '' })
    setShowForm(false)
    onReload()
    setTimeout(() => setCreateMsg(''), 2500)
    setCreating(false)
  }

  async function markSold(transferId) {
    await supabase.from('kitai_transfers').update({ sold_flag: true }).eq('id', transferId)
    onReload()
  }

  async function markUnsold(transferId) {
    await supabase.from('kitai_transfers').update({ sold_flag: false }).eq('id', transferId)
    onReload()
  }

  async function updateInvoice(id, updates) {
    await supabase.from('kitai_sale_invoices').update(updates).eq('id', id)
    onReload()
  }

  async function deleteInvoice(id) {
    await supabase.from('kitai_sale_invoices').delete().eq('id', id)
    onReload()
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Kitai sale invoices</h2>
          <button onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : 'New sale invoice'}</button>
        </div>

        {showForm && (
          <>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
              <div><label>Invoice date</label><input type="date" value={newInvoice.date} onChange={e => setNewInvoice(f => ({ ...f, date: e.target.value }))} /></div>
              <div><label>Invoice number</label><input style={{ width: 140 }} value={newInvoice.number} onChange={e => setNewInvoice(f => ({ ...f, number: e.target.value }))} placeholder="e.g. KIT-001" /></div>
              <div><label>Total amount (N$)</label><input type="number" min="0" step="0.01" style={{ width: 140 }} value={newInvoice.amount} onChange={e => setNewInvoice(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label>Notes</label><input style={{ width: 200 }} value={newInvoice.notes} onChange={e => setNewInvoice(f => ({ ...f, notes: e.target.value }))} placeholder="optional" /></div>
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">{unsold.length} animals available to select</span>
              <button style={{ fontSize: 13 }} onClick={() => {
                const allSelected = unsold.every(t => selectedIds.has(t.id))
                setSelectedIds(allSelected ? new Set() : new Set(unsold.map(t => t.id)))
              }}>{unsold.every(t => selectedIds.has(t.id)) ? 'Deselect all' : 'Select all'}</button>
            </div>

            {unsold.length === 0 ? <p className="muted">No animals available — all are already on a sale invoice.</p> : (
              <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
                {unsold.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', background: selectedIds.has(t.id) ? 'var(--color-accent-light)' : 'var(--color-surface)' }}>
                    <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} style={{ width: 'auto' }} />
                    <span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span>
                    <strong>{t.ear_tag}</strong>
                    {t.identity_number && <span className="muted">{t.identity_number}</span>}
                    <span className="muted">{t.owner}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="row">
              <button className="primary" disabled={creating || selectedIds.size === 0} onClick={createInvoice}>Create invoice ({selectedIds.size} animals)</button>
              <span className="muted">{createMsg}</span>
            </div>
          </>
        )}
      </div>

      {saleInvoices.length === 0 ? <p className="muted">No sale invoices yet.</p> : (
        <div className="stack">
          {saleInvoices.map(inv => {
            const summaries = inv.animal_summaries || []
            const isPaid = !!inv.payment_date
            const isExpanded = expandedInvoice === inv.id
            const invoiceTransfers = transfers.filter(t => (inv.animal_ids || []).includes(t.id))

            return (
              <div key={inv.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <strong>{inv.invoice_number || 'No invoice number'}</strong>
                      <span className="muted">{summaries.length} animals</span>
                    </div>
                    {inv.amount && <div className="muted" style={{ fontSize: 13 }}>{fmtCurrency(inv.amount)}</div>}
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Created {new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`badge ${isPaid ? 'success' : 'warning'}`}>{isPaid ? 'Paid' : 'Payment pending'}</span>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <button onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                    {isExpanded ? 'Hide animals ▲' : `Show ${summaries.length} animals ▼`}
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: 8 }} className="stack" style={{ gap: 4 }}>
                      {invoiceTransfers.map(t => (
                        <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span>
                            <strong>{t.ear_tag}</strong>
                            {t.identity_number && <span className="muted">{t.identity_number}</span>}
                            <span className="muted">{t.owner}</span>
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <span className={`badge ${t.sold_flag ? 'success' : 'warning'}`}>{t.sold_flag ? 'Sold' : 'Pending sale'}</span>
                            {!t.sold_flag
                              ? <button className="primary" style={{ fontSize: 11 }} onClick={() => markSold(t.id)}>Mark sold</button>
                              : <button style={{ fontSize: 11 }} onClick={() => markUnsold(t.id)}>Revert</button>
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <div><label>Invoice date</label><input type="date" defaultValue={inv.invoice_date || ''} onBlur={e => updateInvoice(inv.id, { invoice_date: e.target.value || null })} /></div>
                    <div><label>Invoice number</label><input style={{ width: 140 }} defaultValue={inv.invoice_number || ''} onBlur={e => updateInvoice(inv.id, { invoice_number: e.target.value || null })} placeholder="e.g. KIT-001" /></div>
                    <div><label>Amount (N$)</label><input type="number" min="0" step="0.01" style={{ width: 130 }} defaultValue={inv.amount || ''} onBlur={e => updateInvoice(inv.id, { amount: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><label>Payment date</label><input type="date" defaultValue={inv.payment_date || ''} onBlur={e => updateInvoice(inv.id, { payment_date: e.target.value || null })} /></div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                  <button className="danger-text" onClick={() => deleteInvoice(inv.id)}>Delete invoice</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
