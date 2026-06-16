import { useEffect, useState, useRef } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

const BUCKET = 'batch-documents'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  // Format as N$0,000-00
  const parts = n.toFixed(2).split('.')
  const thousands = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `N$${thousands}-${parts[1]}`
}

export default function Batches() {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [owner, setOwner] = useState('')
  const [selectedCalfIds, setSelectedCalfIds] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [b, c] = await Promise.all([
      supabase.from('batches').select('*').order('created_at', { ascending: false }),
      supabase.from('calves').select('id, owner, ear_tag, identity_number, birth_date, sold_flag').order('created_at', { ascending: false }),
    ])
    if (!b.error) setBatches(b.data || [])
    if (!c.error) setCalves(c.data || [])
    setLoading(false)
  }

  // Collect all calf IDs already in a batch
  const batchedCalfIds = new Set(batches.flatMap((b) => b.calf_ids || []))
  const filteredCalves = calves.filter((c) => c.owner === owner && !c.sold_flag && !batchedCalfIds.has(c.id))

  function toggleCalf(id) {
    setSelectedCalfIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    const allSelected = filteredCalves.every((c) => selectedCalfIds.has(c.id))
    setSelectedCalfIds(allSelected ? new Set() : new Set(filteredCalves.map((c) => c.id)))
  }

  async function createBatch() {
    if (!owner || selectedCalfIds.size === 0) return
    setCreating(true); setStatusMsg('Creating batch...')
    const selected = calves.filter((c) => selectedCalfIds.has(c.id))
    const { error } = await supabase.from('batches').insert({
      owner,
      calf_ids: Array.from(selectedCalfIds),
      calf_summaries: selected.map((c) => ({ id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number, birthDate: c.birth_date })),
    })
    if (error) { setStatusMsg('Failed: ' + error.message) }
    else {
      setStatusMsg('Batch created.'); setSelectedCalfIds(new Set()); loadAll(); setTimeout(() => setStatusMsg(''), 2500)
    }
    setCreating(false)
  }

  async function updateBatch(id, field, value) {
    await supabase.from('batches').update({ [field]: value || null }).eq('id', id)
    loadAll()
  }

  async function deleteBatch(id) {
    await supabase.from('batches').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Create birth notification batch</h2>
        <div style={{ marginBottom: 12 }}>
          <label>Owner</label>
          <select value={owner} onChange={(e) => { setOwner(e.target.value); setSelectedCalfIds(new Set()) }} style={{ width: 240 }}>
            <option value="">Select owner</option>
            {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {owner && filteredCalves.length === 0 && <p className="muted">No active calves for {owner}.</p>}
        {owner && filteredCalves.length > 0 && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">{filteredCalves.length} calf entries for {owner}</span>
              <button onClick={selectAll} style={{ fontSize: 13 }}>{filteredCalves.every((c) => selectedCalfIds.has(c.id)) ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
              {filteredCalves.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', background: selectedCalfIds.has(c.id) ? 'var(--color-accent-light)' : 'var(--color-surface)' }}>
                  <input type="checkbox" checked={selectedCalfIds.has(c.id)} onChange={() => toggleCalf(c.id)} style={{ width: 'auto' }} />
                  <span><strong>{c.ear_tag}</strong></span>
                  {[c.identity_number, c.ear_tag].filter(Boolean).join(' // ') && <span className="muted">{[c.identity_number, c.ear_tag].filter(Boolean).join(' // ')}</span>}
                  <span className="muted">{c.birth_date}</span>
                </label>
              ))}
            </div>
            <div className="row">
              <button className="primary" disabled={creating || selectedCalfIds.size === 0} onClick={createBatch}>Create batch ({selectedCalfIds.size} calves)</button>
              <span className="muted">{statusMsg}</span>
            </div>
          </>
        )}
      </div>

      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Batches</h2>
        {batches.length === 0 ? <p className="muted">No batches yet.</p> : (
          <div className="stack">
            {batches.map((b) => <BatchCard key={b.id} batch={b} onUpdate={updateBatch} onDelete={deleteBatch} onReload={loadAll} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function FileUploadField({ label, fileName, fileUrl, fieldName, batchId, onReload }) {
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setMsg('Uploading...')
    const path = `${batchId}/${fieldName}/${file.name}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (upErr) { setMsg('Upload failed: ' + upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const updates = {
      [`${fieldName}_file_name`]: file.name,
      [`${fieldName}_file_url`]: urlData.publicUrl,
    }
    await supabase.from('batches').update(updates).eq('id', batchId)
    setMsg(''); setUploading(false); onReload()
  }

  async function handleRemove() {
    await supabase.from('batches').update({
      [`${fieldName}_file_name`]: null,
      [`${fieldName}_file_url`]: null,
    }).eq('id', batchId)
    onReload()
  }

  return (
    <div>
      <label>{label}</label>
      {fileUrl ? (
        <div className="row" style={{ gap: 6 }}>
          <a href={fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {fileName}</a>
          <button className="danger-text" style={{ fontSize: 12 }} onClick={handleRemove}>Remove</button>
        </div>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleUpload} />
          <button disabled={uploading} onClick={() => inputRef.current.click()} style={{ fontSize: 13 }}>
            {uploading ? 'Uploading...' : 'Upload file'}
          </button>
          {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
        </div>
      )}
    </div>
  )
}

function BatchCard({ batch, onUpdate, onDelete, onReload }) {
  const [calvesOpen, setCalvesOpen] = useState(false)
  const summaries = batch.calf_summaries || []
  const isPending = !batch.submission_date || !batch.batch_report_number
  const hasInvoice = batch.invoice_number || batch.invoice_date
  const isPaid = !!batch.payment_date

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <strong>{batch.owner}</strong>
            <span className="muted">&mdash; {summaries.length} calves</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <button
              onClick={() => setCalvesOpen((v) => !v)}
              style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}
            >
              {calvesOpen ? 'Hide calves ▲' : `Show ${summaries.length} calves ▼`}
            </button>
            {calvesOpen && (
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2px 12px' }}>
                {summaries.map((s, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                    {i + 1}. {[s.identityNumber, s.earTag].filter(Boolean).join(' // ')}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Created {new Date(batch.created_at).toLocaleDateString()}</div>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
          <span className={`badge ${isPending ? 'warning' : 'success'}`}>{isPending ? 'Pending' : 'Submitted'}</span>
          <span className={`badge ${hasInvoice ? 'success' : 'warning'}`}>{hasInvoice ? 'Invoice received' : 'Invoice pending'}</span>
          <span className={`badge ${isPaid ? 'success' : 'warning'}`}>{isPaid ? 'Paid' : 'Payment pending'}</span>
        </div>
      </div>

      {/* Submission */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
        <div className="muted" style={{ fontWeight: 500, marginBottom: 6, fontSize: 12 }}>Submission</div>
        <div className="row">
          <div>
            <label>Submission date</label>
            <input type="date" defaultValue={batch.submission_date || ''} onBlur={(e) => onUpdate(batch.id, 'submission_date', e.target.value)} />
          </div>
          <div>
            <label>Batch Detail Report U-number</label>
            <input style={{ width: 150 }} defaultValue={batch.batch_report_number || ''} onBlur={(e) => onUpdate(batch.id, 'batch_report_number', e.target.value)} placeholder="e.g. U12345" />
          </div>
        </div>
      </div>

      {/* Invoice */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
        <div className="muted" style={{ fontWeight: 500, marginBottom: 6, fontSize: 12 }}>NSBA invoice</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div>
            <label>Invoice date</label>
            <input type="date" defaultValue={batch.invoice_date || ''} onBlur={(e) => onUpdate(batch.id, 'invoice_date', e.target.value)} />
          </div>
          <div>
            <label>Invoice number</label>
            <input style={{ width: 140 }} defaultValue={batch.invoice_number || ''} onBlur={(e) => onUpdate(batch.id, 'invoice_number', e.target.value)} placeholder="e.g. INV-1234" />
          </div>
          <div>
            <label>No. of tests invoiced</label>
            <input type="number" min="0" style={{ width: 100 }} defaultValue={batch.invoice_test_count || ''} onBlur={(e) => onUpdate(batch.id, 'invoice_test_count', e.target.value ? parseInt(e.target.value) : null)} />
          </div>
          <div>
            <label>Amount payable excl. VAT</label>
            <div className="row" style={{ gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.01" style={{ width: 130 }} defaultValue={batch.invoice_amount_payable || ''} onBlur={(e) => onUpdate(batch.id, 'invoice_amount_payable', e.target.value ? parseFloat(e.target.value) : null)} />
              {batch.invoice_amount_payable && <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtCurrency(batch.invoice_amount_payable)}</span>}
            </div>
          </div>
          <div>
            <label>Payment date</label>
            <input type="date" defaultValue={batch.payment_date || ''} onBlur={(e) => onUpdate(batch.id, 'payment_date', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Documents */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
        <div className="muted" style={{ fontWeight: 500, marginBottom: 8, fontSize: 12 }}>Documents</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          <FileUploadField
            label="Batch Detail Report (Unistel)"
            fileName={batch.batch_report_file_name}
            fileUrl={batch.batch_report_file_url}
            fieldName="batch_report"
            batchId={batch.id}
            onReload={onReload}
          />
          <FileUploadField
            label="NSBA invoice"
            fileName={batch.invoice_file_name}
            fileUrl={batch.invoice_file_url}
            fieldName="invoice"
            batchId={batch.id}
            onReload={onReload}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
        <button className="danger-text" onClick={() => onDelete(batch.id)}>Delete batch</button>
      </div>
    </div>
  )
}
