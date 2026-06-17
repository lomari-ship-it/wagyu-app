import { useEffect, useState, useRef } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }


const BUCKET = 'batch-documents'

function daysBetween(birthDate, submissionDate) {
  if (!birthDate || !submissionDate) return null
  const d1 = new Date(birthDate)
  const d2 = new Date(submissionDate)
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24))
}

function LateTag({ days }) {
  if (days === null) return null
  if (days > 180) return <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>Very late ({days}d)</span>
  if (days > 90) return <span className="badge warning">Late ({days}d)</span>
  return null
}

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function LateRegistrations() {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCalfIds, setSelectedCalfIds] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [newInvoice, setNewInvoice] = useState({ date: '', number: '', rate: '' })
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [b, c, inv] = await Promise.all([
      supabase.from('batches').select('id, owner, submission_date, calf_ids, calf_summaries').not('submission_date', 'is', null),
      supabase.from('calves').select('*'),
      supabase.from('late_reg_invoices').select('*').order('created_at', { ascending: false }),
    ])
    if (!b.error) setBatches(b.data || [])
    if (!c.error) setCalves(c.data || [])
    if (!inv.error) setInvoices(inv.data || [])
    setLoading(false)
  }

  // Get all calves with their days late (birth to batch submission date)
  const lateCalves = []
  const invoicedCalfIds = new Set(invoices.flatMap(inv => inv.calf_ids || []))

  batches.forEach(batch => {
    if (!batch.submission_date) return
    const summaries = batch.calf_summaries || []
    const calfIds = batch.calf_ids || []
    const batchCalvesList = summaries.length > 0
      ? summaries.map(s => calves.find(c => c.id === s.id || c.ear_tag === s.earTag)).filter(Boolean)
      : calves.filter(c => calfIds.includes(c.id))

    batchCalvesList.forEach(calf => {
      const days = daysBetween(calf.birth_date, batch.submission_date)
      if (days !== null && days > 90) {
        lateCalves.push({ ...calf, days, submissionDate: batch.submission_date, batchId: batch.id, alreadyInvoiced: invoicedCalfIds.has(calf.id) })
      }
    })
  })

  lateCalves.sort((a, b) => b.days - a.days)

  const uninvoiced = lateCalves.filter(c => !c.alreadyInvoiced)
  const byOwner = {}
  lateCalves.forEach(c => {
    if (!byOwner[c.owner]) byOwner[c.owner] = { late: 0, veryLate: 0 }
    if (c.days > 180) byOwner[c.owner].veryLate++
    else byOwner[c.owner].late++
  })

  function toggleCalf(id) {
    setSelectedCalfIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function createInvoice() {
    if (selectedCalfIds.size === 0 || !newInvoice.rate) {
      setCreateMsg('Select at least one calf and enter a rate.')
      return
    }
    setCreating(true); setCreateMsg('Creating...')
    const selected = lateCalves.filter(c => selectedCalfIds.has(c.id))
    const qty = selected.length
    const rate = parseFloat(newInvoice.rate)
    const amount = qty * rate

    const byOwnerSplit = {}
    selected.forEach(c => { byOwnerSplit[c.owner] = (byOwnerSplit[c.owner] || 0) + 1 })

    const { error } = await supabase.from('late_reg_invoices').insert({
      invoice_date: newInvoice.date || null,
      invoice_number: newInvoice.number || null,
      rate_per_late_registration: rate,
      amount_payable: amount,
      calf_ids: Array.from(selectedCalfIds),
      calf_summaries: selected.map(c => ({
        id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number,
        owner: c.owner, birthDate: c.birth_date, days: c.days
      })),
    })
    if (error) { setCreateMsg('Failed: ' + error.message) }
    else {
      setCreateMsg('Invoice created.')
      setSelectedCalfIds(new Set())
      setNewInvoice({ date: '', number: '', rate: '' })
      setShowCreateForm(false)
      loadAll()
      setTimeout(() => setCreateMsg(''), 2500)
    }
    setCreating(false)
  }

  async function updateInvoice(id, field, value) {
    const updates = { [field]: value || null }
    const inv = invoices.find(i => i.id === id)
    if (inv) {
      const rate = field === 'rate_per_late_registration' ? (value ? parseFloat(value) : null) : inv.rate_per_late_registration
      const qty = (inv.calf_ids || []).length
      if (rate && qty) updates.amount_payable = rate * qty
    }
    await supabase.from('late_reg_invoices').update(updates).eq('id', id)
    loadAll()
  }

  async function deleteInvoice(id) {
    await supabase.from('late_reg_invoices').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>

      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Late birth registrations</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Calves where days from birth to batch submission date exceeds 90 days.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Late (91–180d)</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-warning-text)' }}>{lateCalves.filter(c => c.days <= 180).length}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Very late (181d+)</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-danger-text)' }}>{lateCalves.filter(c => c.days > 180).length}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 12 }}>Not yet invoiced</div>
            <div style={{ fontSize: 28, fontWeight: 500 }}>{uninvoiced.length}</div>
          </div>
        </div>

        {/* Per owner breakdown */}
        {Object.keys(byOwner).length > 0 && (
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table>
              <thead>
                <tr><th>Owner</th><th style={{ textAlign: 'right' }}>Late (91–180d)</th><th style={{ textAlign: 'right' }}>Very late (181d+)</th><th style={{ textAlign: 'right' }}>Total</th></tr>
              </thead>
              <tbody>
                {Object.entries(byOwner).sort().map(([owner, counts]) => (
                  <tr key={owner}>
                    <td>{owner}</td>
                    <td style={{ textAlign: 'right' }}>{counts.late > 0 ? <span className="badge warning">{counts.late}</span> : <span className="faint">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>{counts.veryLate > 0 ? <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>{counts.veryLate}</span> : <span className="faint">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>{counts.late + counts.veryLate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lateCalves.length === 0 && <p className="muted">No late registrations found across submitted batches.</p>}
      </div>

      {/* Create invoice */}
      {uninvoiced.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Create late registration invoice</h2>
            <button onClick={() => setShowCreateForm(v => !v)}>{showCreateForm ? 'Cancel' : 'New invoice'}</button>
          </div>

          {showCreateForm && (
            <>
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                <div><label>Invoice date</label><input type="date" value={newInvoice.date} onChange={e => setNewInvoice(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label>Invoice number</label><input style={{ width: 140 }} value={newInvoice.number} onChange={e => setNewInvoice(f => ({ ...f, number: e.target.value }))} placeholder="e.g. LB-001" /></div>
                <div><label>Rate per late registration (N$)</label><input type="number" min="0" step="0.01" style={{ width: 140 }} value={newInvoice.rate} onChange={e => setNewInvoice(f => ({ ...f, rate: e.target.value }))} placeholder="e.g. 350.00" /></div>
                {newInvoice.rate && selectedCalfIds.size > 0 && (
                  <div style={{ alignSelf: 'flex-end', paddingBottom: 4 }}>
                    <span className="muted">= {fmtCurrency(parseFloat(newInvoice.rate) * selectedCalfIds.size)} total ({selectedCalfIds.size} calves)</span>
                  </div>
                )}
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">{uninvoiced.length} uninvoiced late registrations</span>
                <button style={{ fontSize: 13 }} onClick={() => {
                  const allSelected = uninvoiced.every(c => selectedCalfIds.has(c.id))
                  setSelectedCalfIds(allSelected ? new Set() : new Set(uninvoiced.map(c => c.id)))
                }}>
                  {uninvoiced.every(c => selectedCalfIds.has(c.id)) ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
                {uninvoiced.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', background: selectedCalfIds.has(c.id) ? 'var(--color-accent-light)' : 'var(--color-surface)' }}>
                    <input type="checkbox" checked={selectedCalfIds.has(c.id)} onChange={() => toggleCalf(c.id)} style={{ width: 'auto' }} />
                    <span><strong>{c.ear_tag}</strong></span>
                    {c.identity_number && <span className="muted">{c.identity_number}</span>}
                    <span className="muted">{c.owner}</span>
                    <LateTag days={c.days} />
                  </label>
                ))}
              </div>

              <div className="row">
                <button className="primary" disabled={creating || selectedCalfIds.size === 0 || !newInvoice.rate} onClick={createInvoice}>
                  Create invoice ({selectedCalfIds.size} registrations)
                </button>
                <span className="muted">{createMsg}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Invoice list */}
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Late registration invoices</h2>
        {invoices.length === 0 ? <p className="muted">No late registration invoices yet.</p> : (
          <div className="stack">
            {invoices.map(inv => <InvoiceCard key={inv.id} invoice={inv} onUpdate={updateInvoice} onDelete={deleteInvoice} onReload={loadAll} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceCard({ invoice, onUpdate, onDelete, onReload }) {
  const [calvesOpen, setCalvesOpen] = useState(false)
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const summaries = invoice.calf_summaries || []
  const isPaid = !!invoice.payment_date
  const qty = (invoice.calf_ids || []).length
  const total = invoice.amount_payable ? parseFloat(invoice.amount_payable) : null

  const byOwner = {}
  summaries.forEach(s => { byOwner[s.owner] = (byOwner[s.owner] || 0) + 1 })
  const multiOwner = Object.keys(byOwner).length > 1

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const path = `late-reg/${invoice.id}/${file.name}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    await supabase.from('late_reg_invoices').update({ invoice_file_name: file.name, invoice_file_url: urlData.publicUrl }).eq('id', invoice.id)
    setUploading(false); onReload()
  }

  async function removeFile() {
    await supabase.from('late_reg_invoices').update({ invoice_file_name: null, invoice_file_url: null }).eq('id', invoice.id)
    onReload()
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <strong>{invoice.invoice_number || 'No invoice number'}</strong>
            <span className="muted">{qty} registration{qty !== 1 ? 's' : ''}</span>
            {multiOwner && <span className="muted">· Multiple owners</span>}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Created {new Date(invoice.created_at).toLocaleDateString()}</div>
        </div>
        <span className={`badge ${isPaid ? 'success' : 'warning'}`}>{isPaid ? 'Paid' : 'Payment pending'}</span>
      </div>

      {/* Calves collapsible */}
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setCalvesOpen(v => !v)} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          {calvesOpen ? 'Hide calves ▲' : `Show ${qty} calves ▼`}
        </button>
        {calvesOpen && (
          <div style={{ marginTop: 6 }}>
            {multiOwner && (
              <div style={{ marginBottom: 6 }}>
                {Object.entries(byOwner).map(([owner, count]) => (
                  <div key={owner} className="muted" style={{ fontSize: 12 }}>{owner}: {count}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2px 12px' }}>
              {summaries.map((s, i) => (
                <div key={i} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                  {i + 1}. {[s.identityNumber, s.earTag].filter(Boolean).join(' // ')}
                  {s.days && <LateTag days={s.days} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invoice fields */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div><label>Invoice date</label><input type="date" defaultValue={invoice.invoice_date || ''} onBlur={e => onUpdate(invoice.id, 'invoice_date', e.target.value)} /></div>
          <div><label>Invoice number</label><input style={{ width: 140 }} defaultValue={invoice.invoice_number || ''} onBlur={e => onUpdate(invoice.id, 'invoice_number', e.target.value)} placeholder="e.g. LB-001" /></div>
          <div>
            <label>Rate per registration (N$)</label>
            <div className="row" style={{ gap: 4 }}>
              <input type="number" min="0" step="0.01" style={{ width: 120 }} defaultValue={invoice.rate_per_late_registration || ''} onBlur={e => onUpdate(invoice.id, 'rate_per_late_registration', e.target.value ? parseFloat(e.target.value) : null)} />
              {total && <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>= {fmtCurrency(total)} total</span>}
            </div>
          </div>
          <div><label>Payment date</label><input type="date" defaultValue={invoice.payment_date || ''} onBlur={e => onUpdate(invoice.id, 'payment_date', e.target.value)} /></div>
        </div>
      </div>

      {/* File upload */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
        <label style={{ marginBottom: 4 }}>Invoice document</label>
        {invoice.invoice_file_url ? (
          <div className="row">
            <a href={invoice.invoice_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {invoice.invoice_file_name}</a>
            <button className="danger-text" style={{ fontSize: 12 }} onClick={removeFile}>Remove</button>
          </div>
        ) : (
          <div className="row">
            <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleUpload} />
            <button disabled={uploading} onClick={() => inputRef.current.click()} style={{ fontSize: 13 }}>
              {uploading ? 'Uploading...' : 'Upload invoice'}
            </button>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
        <button className="danger-text" onClick={() => onDelete(invoice.id)}>Delete invoice</button>
      </div>
    </div>
  )
}
