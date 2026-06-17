import { useEffect, useState, useRef } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }


const BUCKET = 'batch-documents'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


export default function Batches() {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [owner, setOwner] = useState('')
  const [selectedCalfIds, setSelectedCalfIds] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [unbatchedOpen, setUnbatchedOpen] = useState(true)
  const [calfSearch, setCalfSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [b, c] = await Promise.all([
      supabase.from('batches').select('*').order('created_at', { ascending: false }),
      supabase.from('calves').select('*').order('created_at', { ascending: false }),
    ])
    if (!b.error) setBatches(b.data || [])
    if (!c.error) setCalves(c.data || [])
    setLoading(false)
  }

  // Collect all calf IDs already in a batch
  const batchedCalfIds = new Set(batches.flatMap((b) => b.calf_ids || []))
  const searchLower = calfSearch.toLowerCase()
  const filteredCalves = calves.filter((c) => !c.sold_flag && !batchedCalfIds.has(c.id) &&
    (!calfSearch || (c.ear_tag||'').toLowerCase().includes(searchLower) || (c.identity_number||'').toLowerCase().includes(searchLower))
  )

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
    if (selectedCalfIds.size === 0) return
    setCreating(true); setStatusMsg('Creating batch...')
    const selected2 = calves.filter((c) => selectedCalfIds.has(c.id))
    const ownerList = [...new Set(selected2.map(c => c.owner))]
    const { error } = await supabase.from('batches').insert({
      owner: ownerList[0],  // primary owner; full breakdown via calf_summaries
      calf_ids: Array.from(selectedCalfIds),
      calf_summaries: selected2.map((c) => ({ id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number, birthDate: c.birth_date })),
    })
    if (error) { setStatusMsg('Failed: ' + error.message) }
    else {
      setStatusMsg('Batch created.'); setSelectedCalfIds(new Set()); loadAll(); setTimeout(() => setStatusMsg(''), 2500)
    }
    setCreating(false)
  }

  async function updateBatch(id, field, value) {
    const updates = { [field]: value || null }
    // Auto-calculate total amount when rate or qty changes
    const batch = batches.find(b => b.id === id)
    if (batch) {
      const rate = field === 'rate_per_test' ? (value ? parseFloat(value) : null) : batch.rate_per_test
      const qty = field === 'invoice_test_count' ? (value ? parseInt(value) : null) : batch.invoice_test_count
      if (rate && qty) updates.invoice_amount_payable = rate * qty
    }
    await supabase.from('batches').update(updates).eq('id', id)
    loadAll()
  }

  async function deleteBatch(id) {
    await supabase.from('batches').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card" style={{ padding: 0 }}>
        <div
          onClick={() => setUnbatchedOpen(v => !v)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Create birth notification batch</h2>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted">{filteredCalves.length} unbatched calf{filteredCalves.length !== 1 ? 'ves' : ''}</span>
            <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: unbatchedOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
          </div>
        </div>
        {unbatchedOpen && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <input
            type="text"
            value={calfSearch}
            onChange={(e) => { e.stopPropagation(); setCalfSearch(e.target.value) }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Search by ear tag or identity number..."
            style={{ width: '100%', maxWidth: 360 }}
          />
        </div>
        {filteredCalves.length === 0 && !calfSearch && <p className="muted">No active calves available (all already batched or none registered).</p>}
        {filteredCalves.length === 0 && calfSearch && <p className="muted">No calves match "{calfSearch}".</p>}
        {(filteredCalves.length > 0 || selectedCalfIds.size > 0) && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">{filteredCalves.length} calf entr{filteredCalves.length !== 1 ? 'ies' : 'y'} shown &middot; {selectedCalfIds.size} selected</span>
              <button onClick={(e) => { e.stopPropagation(); selectAll() }} style={{ fontSize: 13 }}>{filteredCalves.every((c) => selectedCalfIds.has(c.id)) ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
              {filteredCalves.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', background: selectedCalfIds.has(c.id) ? 'var(--color-accent-light)' : 'var(--color-surface)' }}>
                  <input type="checkbox" checked={selectedCalfIds.has(c.id)} onChange={() => toggleCalf(c.id)} style={{ width: 'auto' }} />
                  <span><strong>{c.ear_tag}</strong></span>
                  {[c.identity_number, c.ear_tag].filter(Boolean).join(' // ') && <span className="muted">{[c.identity_number, c.ear_tag].filter(Boolean).join(' // ')}</span>}
                  <span className="muted">{formatDate(c.birth_date)}</span>
                </label>
              ))}
            </div>
            <div className="row">
              <button className="primary" disabled={creating || selectedCalfIds.size === 0} onClick={createBatch}>Create batch ({selectedCalfIds.size} calves)</button>
              <span className="muted">{statusMsg}</span>
            </div>
          </>
        )}
        </div>}
      </div>

      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Batches</h2>
        {batches.length === 0 ? <p className="muted">No batches yet.</p> : (
          <div className="stack">
            {batches.map((b) => <BatchCard key={b.id} batch={b} calves={calves} onUpdate={updateBatch} onDelete={deleteBatch} onReload={loadAll} />)}
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

async function generateBook(batch, calves) {
  const summaries = batch.calf_summaries || []
  const calfIds = batch.calf_ids || []
  let batchCalves = []

  if (summaries.length > 0) {
    // Match full calf data from calves array using id or ear tag
    batchCalves = summaries.map(s => {
      const found = calves.find(c => c.id === s.id || c.ear_tag === s.earTag)
      return found || s
    })
  } else if (calfIds.length > 0) {
    // Fallback: use calf_ids to find calves directly
    batchCalves = calves.filter(c => calfIds.includes(c.id))
  } else {
    alert('No calf data found for this batch. Please recreate the batch.')
    return
  }
  try {
    const res = await fetch('/.netlify/functions/generate-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calves: batchCalves, batch: { owner: batch.owner, id: batch.id } }),
    })
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `birth_notification_${batch.owner}_${new Date().toISOString().slice(0,10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('Failed to generate: ' + e.message)
  }
}

function BatchCard({ batch, calves, onUpdate, onDelete, onReload }) {
  const [calvesOpen, setCalvesOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const summaries = batch.calf_summaries || []
  const isPending = !batch.submission_date || !batch.batch_report_number
  const hasInvoice = batch.invoice_number || batch.invoice_date
  const isPaid = !!batch.payment_date
  const testCount = batch.invoice_test_count || 0
  const calfCount = summaries.length
  const hasDiscrepancy = testCount > 0 && calfCount > 0 && testCount !== calfCount

  return (
    <div className="card" style={{ padding: 0 }}>

      {/* Clickable header */}
      <div
        onClick={() => setBatchOpen(v => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {batch.submission_date ? formatDate(batch.submission_date) : 'No submission date'}
            {batch.invoice_number ? ` · ${batch.invoice_number}` : ''}
            {` · ${summaries.length} calves`}
            {hasDiscrepancy && (
              <span style={{ color: 'var(--color-danger-text)', fontSize: 12, marginLeft: 8 }}>
                ⚠ {calfCount} calves vs {testCount} tests invoiced
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className={`badge ${isPending ? 'warning' : 'success'}`}>{isPending ? 'Pending' : 'Submitted'}</span>
            <span className={`badge ${hasInvoice ? 'success' : 'warning'}`}>{hasInvoice ? 'Invoice received' : 'Invoice pending'}</span>
            <span className={`badge ${isPaid ? 'success' : 'warning'}`}>{isPaid ? 'Paid' : 'Payment pending'}</span>
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: batchOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
      </div>

      {/* Collapsible content */}
      {batchOpen && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>

          {/* Calves toggle */}
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <button onClick={() => setCalvesOpen(v => !v)} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
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
                <label>Rate per test (N$)</label>
                <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <input type="number" min="0" step="0.01" style={{ width: 120 }} defaultValue={batch.rate_per_test || ''} onBlur={(e) => onUpdate(batch.id, 'rate_per_test', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 241.00" />
                  {batch.rate_per_test && batch.invoice_test_count && (
                    <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      = {fmtCurrency(batch.rate_per_test * batch.invoice_test_count)} total
                    </span>
                  )}
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
            <button className="primary" onClick={() => generateBook(batch, calves)}>Generate birth notification</button>
          </div>
        </div>
      )}
    </div>
  )
}
