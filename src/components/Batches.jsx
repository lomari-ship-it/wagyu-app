import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }

const BUCKET = 'batch-documents'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Batches({ search: parentSearch = '', onSearchChange }) {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCalfIds, setSelectedCalfIds] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [unbatchedOpen, setUnbatchedOpen] = useState(false)
  const [batchesOpen, setBatchesOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState(parentSearch)
  const calfSearch = onSearchChange ? parentSearch : localSearch
  const setCalfSearch = onSearchChange || setLocalSearch

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

  // --- Birth Notification PDF auto-parse ---
  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.onload = resolve
      s.onerror = () => reject(new Error('Could not load PDF reader'))
      document.head.appendChild(s)
      setTimeout(() => reject(new Error('PDF reader load timed out')), 12000)
    })
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    return window.pdfjsLib
  }

  async function extractPdfText(file) {
    const pdfjs = await ensurePdfJs()
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buf }).promise
    let text = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      text += ' ' + content.items.map(it => it.str).join(' ')
    }
    return text
  }

  // Parse one Birth Notification's text into { ref, animals: [{ident, born, earTag}] }
  function parseBirthNotification(text) {
    const ref = (text.match(/\b(\d{6}-\d{3})\b/) || [])[1] || null
    const idents = [...text.matchAll(/(\d{2}-\d{3,5}[A-Z]{2,4})/g)]
    const animals = []
    for (let i = 0; i < idents.length; i++) {
      const start = idents[i].index
      const end = (i + 1 < idents.length) ? idents[i + 1].index : text.length
      const chunk = text.slice(start, end)
      const ident = idents[i][1]
      const born = (chunk.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || null
      const tags = [...chunk.matchAll(/\b(\d{8})\b/g)]
      const earTag = tags.length ? tags[tags.length - 1][1] : null
      if (earTag) animals.push({ ident, born, earTag })
    }
    return { ref, animals }
  }

  async function createBatchFromPdfs(fileList) {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setCreating(true); setStatusMsg('Reading Birth Notification(s)...')
    try {
      let allAnimals = []
      let refs = []
      for (const file of files) {
        const text = await extractPdfText(file)
        const parsed = parseBirthNotification(text)
        if (parsed.ref) refs.push(parsed.ref)
        allAnimals = allAnimals.concat(parsed.animals)
      }
      // Deduplicate animals by ident
      const seen = new Set()
      allAnimals = allAnimals.filter(a => { if (seen.has(a.ident)) return false; seen.add(a.ident); return true })

      if (allAnimals.length === 0) {
        setStatusMsg('No animals could be read from the PDF. Please check the document.')
        setCreating(false); return
      }

      // Match against the calf register by identity number OR ear tag
      const byIdent = {}, byTag = {}
      calves.forEach(c => { if (c.identity_number) byIdent[String(c.identity_number).toUpperCase()] = c; if (c.ear_tag) byTag[String(c.ear_tag)] = c })
      const matched = [], unmatched = []
      for (const a of allAnimals) {
        const hit = byIdent[a.ident.toUpperCase()] || byTag[a.earTag]
        if (hit) matched.push(hit); else unmatched.push(a)
      }

      if (matched.length === 0) {
        setStatusMsg(`None of the ${allAnimals.length} animals matched your calf register. Batch not created.`)
        setCreating(false); return
      }

      // Owner: most common owner among matched animals
      const ownerCounts = {}
      matched.forEach(c => { const o = c.owner || ''; ownerCounts[o] = (ownerCounts[o] || 0) + 1 })
      const owners = Object.keys(ownerCounts).filter(Boolean)
      const owner = owners.sort((a, b) => ownerCounts[b] - ownerCounts[a])[0] || null
      const mixedOwner = owners.length > 1

      setStatusMsg('Creating batch...')
      const { data: newBatch, error } = await supabase.from('batches').insert({
        owner,
        calf_ids: matched.map(c => c.id),
        calf_summaries: matched.map(c => ({ id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number, birthDate: c.birth_date })),
        birth_notification_ref: refs[0] || null,
      }).select().single()
      if (error) { setStatusMsg('Failed: ' + error.message); setCreating(false); return }

      // Upload each PDF to storage and record in birth_notification_files
      const bnFiles = []
      for (const file of files) {
        const path = `${newBatch.id}/birth-notifications/${file.name}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
          bnFiles.push({ name: file.name, url: urlData.publicUrl, ref: refs[0] || null, uploaded_at: new Date().toISOString() })
        }
      }
      await supabase.from('batches').update({ birth_notification_files: bnFiles }).eq('id', newBatch.id)

      let summary = `Batch created with ${matched.length} animal${matched.length !== 1 ? 's' : ''}.`
      if (unmatched.length > 0) summary += ` ${unmatched.length} not found in register: ${unmatched.slice(0, 8).map(u => u.ident).join(', ')}${unmatched.length > 8 ? '…' : ''}`
      if (mixedOwner) summary += ` Note: animals span multiple owners (${owners.join(', ')}); set to ${owner}.`
      setStatusMsg(summary)
      loadAll()
      setTimeout(() => setStatusMsg(''), 12000)
    } catch (e) {
      setStatusMsg('Error: ' + (e.message || String(e)))
    }
    setCreating(false)
  }

  async function createBatch() {
    if (selectedCalfIds.size === 0) return
    setCreating(true); setStatusMsg('Creating batch...')

    const selected = calves.filter((c) => selectedCalfIds.has(c.id))
    const ownerList = [...new Set(selected.map(c => c.owner))]

    const { data: newBatch, error } = await supabase.from('batches').insert({
      owner: ownerList[0],
      calf_ids: Array.from(selectedCalfIds),
      calf_summaries: selected.map((c) => ({
        id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number, birthDate: c.birth_date
      })),
    }).select().single()

    if (error) { setStatusMsg('Failed: ' + error.message); setCreating(false); return }

    setStatusMsg('Generating submission form...')
    await generateAndAttachSubmissionForm(newBatch, selected)

    setStatusMsg('Batch created.'); setSelectedCalfIds(new Set()); loadAll()
    setTimeout(() => setStatusMsg(''), 3000)
    setCreating(false)
  }

  async function generateAndAttachSubmissionForm(batch, batchCalves) {
    try {
      const res = await fetch('/api/generate-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calves: batchCalves, batch }),
      })
      if (!res.ok) { console.error('Submission form generation failed:', await res.text()); return }
      const blob = await res.blob()
      const fileName = `batch_submission_${batch.id}.xlsx`
      const path = `${batch.id}/submission/${fileName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true })
      if (upErr) { console.error('Upload failed:', upErr.message); return }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      await supabase.from('batches').update({
        submission_file_name: fileName,
        submission_file_url: urlData.publicUrl,
      }).eq('id', batch.id)
    } catch (e) {
      console.error('Auto-attach submission form error:', e)
    }
  }

  async function updateBatch(id, field, value) {
    const updates = { [field]: value || null }
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

  const totalCalves = calves.filter((c) => !c.sold_flag).length
  const totalBatches = batches.length
  const invoicedBatches = batches.filter((b) => b.invoice_number).length
  const pendingBatches = totalBatches - invoicedBatches

  return (
    <div className="stack" style={{ gap: 24 }}>

      {/* Non-collapsible summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Summary</h2>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Unbatched calves</div>
            <div style={{ fontSize: 32, fontWeight: 600 }}>{filteredCalves.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Total batches</div>
            <div style={{ fontSize: 32, fontWeight: 600 }}>{totalBatches}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Pending invoice</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-warning-text, #92400e)' }}>{pendingBatches}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Invoiced</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-success-text, #15803d)' }}>{invoicedBatches}</div>
          </div>
        </div>
        <input
          type="text"
          value={calfSearch}
          onChange={(e) => setCalfSearch(e.target.value)}
          placeholder="Search by ear tag or identity number..."
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

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
        {unbatchedOpen && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ marginTop: 12 }} />
            <div style={{ background: 'var(--color-accent-light)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Upload Birth Notification PDF(s)</div>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Upload one or more NSBA Birth Notification PDFs. A batch is created automatically: animals are matched to your register by ear tag or identity number, the owner is filled in, and any animals not found are flagged below.
              </p>
              <input
                id="bn-pdf-input"
                type="file"
                accept=".pdf"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { createBatchFromPdfs(e.target.files); e.target.value = '' }}
              />
              <button
                className="primary"
                disabled={creating}
                onClick={() => document.getElementById('bn-pdf-input').click()}
              >
                {creating ? 'Working...' : 'Upload Birth Notification PDF(s)'}
              </button>
              {statusMsg && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{statusMsg}</div>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Or select calves manually:</div>
            {filteredCalves.length === 0 && !calfSearch && <p className="muted">No active calves available (all already batched or none registered).</p>}
            {filteredCalves.length === 0 && calfSearch && <p className="muted">No calves match "{calfSearch}".</p>}
            {(filteredCalves.length > 0 || selectedCalfIds.size > 0) && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">{filteredCalves.length} calf entr{filteredCalves.length !== 1 ? 'ies' : 'y'} shown · {selectedCalfIds.size} selected</span>
                  <button onClick={(e) => { e.stopPropagation(); selectAll() }} style={{ fontSize: 13 }}>
                    {filteredCalves.every((c) => selectedCalfIds.has(c.id)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
                  {filteredCalves.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', background: selectedCalfIds.has(c.id) ? 'var(--color-accent-light)' : 'var(--color-surface)' }}>
                      <input type="checkbox" checked={selectedCalfIds.has(c.id)} onChange={() => toggleCalf(c.id)} style={{ width: 'auto' }} />
                      <span><strong>{c.ear_tag}</strong></span>
                      {c.identity_number && <span className="muted">{c.identity_number}</span>}
                      <span className="muted">{formatDate(c.birth_date)}</span>
                    </label>
                  ))}
                </div>
                <div className="row">
                  <button className="primary" disabled={creating || selectedCalfIds.size === 0} onClick={createBatch}>
                    Create batch ({selectedCalfIds.size} calves)
                  </button>
                  <span className="muted">{statusMsg}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div
          onClick={() => setBatchesOpen(v => !v)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Batches</h2>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</span>
            <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: batchesOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
          </div>
        </div>
        {batchesOpen && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
            {batches.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No batches yet.</p> : (
              <div className="stack" style={{ marginTop: 12 }}>
                {batches.map((b) => (
                  <BatchCard
                    key={b.id}
                    batch={b}
                    calves={calves}
                    allCalves={calves}
                    batchedCalfIds={batchedCalfIds}
                    onUpdate={updateBatch}
                    onDelete={deleteBatch}
                    onReload={loadAll}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BirthNotificationDocs({ batch, onReload }) {
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const files = Array.isArray(batch.birth_notification_files) ? batch.birth_notification_files : []

  async function handleUpload(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (picked.length === 0) return
    setUploading(true); setMsg('Uploading...')
    const added = []
    for (const file of picked) {
      const path = `${batch.id}/birth-notifications/${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (upErr) { setMsg('Upload failed: ' + upErr.message); setUploading(false); return }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      added.push({ name: file.name, url: urlData.publicUrl, uploaded_at: new Date().toISOString() })
    }
    const next = files.concat(added)
    await supabase.from('batches').update({ birth_notification_files: next }).eq('id', batch.id)
    setMsg(''); setUploading(false); onReload()
  }

  async function handleRemove(idx) {
    const next = files.filter((_, i) => i !== idx)
    await supabase.from('batches').update({ birth_notification_files: next }).eq('id', batch.id)
    onReload()
  }

  return (
    <div>
      <label>Birth Notification documents</label>
      {files.length > 0 && (
        <div className="stack" style={{ gap: 4, marginBottom: 6 }}>
          {files.map((f, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {f.name}</a>
              <button className="danger-text" style={{ fontSize: 12 }} onClick={() => handleRemove(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={handleUpload} />
        <button disabled={uploading} onClick={() => inputRef.current.click()} style={{ fontSize: 13 }}>
          {uploading ? 'Uploading...' : 'Add Birth Notification PDF'}
        </button>
        {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
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
    await supabase.from('batches').update({
      [`${fieldName}_file_name`]: file.name,
      [`${fieldName}_file_url`]: urlData.publicUrl,
    }).eq('id', batchId)
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
          <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
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
    batchCalves = summaries.map(s => {
      const found = calves.find(c => c.id === s.id || c.ear_tag === s.earTag)
      return found || s
    })
  } else if (calfIds.length > 0) {
    batchCalves = calves.filter(c => calfIds.includes(c.id))
  } else {
    alert('No calf data found for this batch.')
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

async function reGenerateSubmission(batch, calves, onReload) {
  const summaries = batch.calf_summaries || []
  const calfIds = batch.calf_ids || []
  let batchCalves = []
  if (summaries.length > 0) {
    batchCalves = summaries.map(s => {
      const found = calves.find(c => c.id === s.id || c.ear_tag === s.earTag)
      return found || s
    })
  } else if (calfIds.length > 0) {
    batchCalves = calves.filter(c => calfIds.includes(c.id))
  }
  if (batchCalves.length === 0) { alert('No calves found for this batch.'); return }

  try {
    const res = await fetch('/api/generate-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calves: batchCalves, batch }),
    })
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    const fileName = `batch_submission_${batch.id}.xlsx`
    const path = `${batch.id}/submission/${fileName}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true })
    if (upErr) throw new Error(upErr.message)
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    await supabase.from('batches').update({
      submission_file_name: fileName,
      submission_file_url: urlData.publicUrl,
    }).eq('id', batch.id)
    onReload()
  } catch (e) {
    alert('Failed to regenerate: ' + e.message)
  }
}

function BatchCard({ batch, calves, allCalves, batchedCalfIds, onUpdate, onDelete, onReload }) {
  const [calvesOpen, setCalvesOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [editingCalves, setEditingCalves] = useState(false)
  const [editSearch, setEditSearch] = useState('')
  const [editSelectedIds, setEditSelectedIds] = useState(new Set())
  const [savingEdit, setSavingEdit] = useState(false)
  const [regenMsg, setRegenMsg] = useState('')

  const summaries = batch.calf_summaries || []
  const isPending = !batch.submission_date || !batch.batch_report_number
  const hasInvoice = batch.invoice_number || batch.invoice_date
  const isPaid = !!batch.payment_date
  const testCount = batch.invoice_test_count || 0
  const calfCount = summaries.length
  const hasDiscrepancy = testCount > 0 && calfCount > 0 && testCount !== calfCount

  const thisBatchCalfIds = new Set(batch.calf_ids || [])
  const editableCalves = allCalves.filter(c =>
    !c.sold_flag && (thisBatchCalfIds.has(c.id) || !batchedCalfIds.has(c.id))
  )

  function startEditing() {
    setEditSelectedIds(new Set(batch.calf_ids || []))
    setEditSearch('')
    setEditingCalves(true)
  }

  function toggleEdit(id) {
    setEditSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function saveCalvesEdit() {
    if (editSelectedIds.size === 0) { alert('A batch must have at least one calf.'); return }
    setSavingEdit(true)
    const selected = allCalves.filter(c => editSelectedIds.has(c.id))
    const ownerList = [...new Set(selected.map(c => c.owner))]
    const { error } = await supabase.from('batches').update({
      owner: ownerList[0],
      calf_ids: Array.from(editSelectedIds),
      calf_summaries: selected.map(c => ({
        id: c.id, earTag: c.ear_tag, identityNumber: c.identity_number, birthDate: c.birth_date
      })),
    }).eq('id', batch.id)
    if (error) { alert('Save failed: ' + error.message); setSavingEdit(false); return }

    setRegenMsg('Regenerating submission form...')
    await reGenerateSubmission({ ...batch, calf_ids: Array.from(editSelectedIds) }, selected, onReload)
    setRegenMsg('')
    setSavingEdit(false)
    setEditingCalves(false)
    onReload()
  }

  const editSearchLower = editSearch.toLowerCase()
  const filteredEditable = editableCalves.filter(c =>
    !editSearch ||
    (c.ear_tag||'').toLowerCase().includes(editSearchLower) ||
    (c.identity_number||'').toLowerCase().includes(editSearchLower)
  )

  return (
    <div className="card" style={{ padding: 0 }}>
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

      {batchOpen && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            {!editingCalves ? (
              <>
                <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <button onClick={() => setCalvesOpen(v => !v)} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                    {calvesOpen ? 'Hide calves ▲' : `Show ${summaries.length} calves ▼`}
                  </button>
                  <button onClick={startEditing} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                    ✏ Edit calves
                  </button>
                </div>
                {calvesOpen && (
                  <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2px 12px' }}>
                    {summaries.map((s, i) => (
                      <div key={i} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                        {i + 1}. {[s.identityNumber, s.earTag].filter(Boolean).join(' // ')}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: 'var(--color-accent-light)' }}>
                <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Edit calves in batch — {editSelectedIds.size} selected</div>
                <input
                  type="text"
                  value={editSearch}
                  onChange={e => setEditSearch(e.target.value)}
                  placeholder="Search by ear tag or identity number..."
                  style={{ width: '100%', maxWidth: 320, marginBottom: 8 }}
                />
                <div className="stack" style={{ gap: 4, maxHeight: 240, overflowY: 'auto', marginBottom: 8 }}>
                  {filteredEditable.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', background: editSelectedIds.has(c.id) ? 'white' : 'var(--color-surface)', fontSize: 13 }}>
                      <input type="checkbox" checked={editSelectedIds.has(c.id)} onChange={() => toggleEdit(c.id)} style={{ width: 'auto' }} />
                      <strong>{c.ear_tag}</strong>
                      {c.identity_number && <span className="muted">{c.identity_number}</span>}
                      <span className="muted">{formatDate(c.birth_date)}</span>
                      {thisBatchCalfIds.has(c.id) && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>(in batch)</span>}
                    </label>
                  ))}
                </div>
                {regenMsg && <p className="muted" style={{ fontSize: 12 }}>{regenMsg}</p>}
                <div className="row" style={{ gap: 8 }}>
                  <button className="primary" disabled={savingEdit} onClick={saveCalvesEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
                  <button disabled={savingEdit} onClick={() => setEditingCalves(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

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

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
            <div className="muted" style={{ fontWeight: 500, marginBottom: 8, fontSize: 12 }}>Documents</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Batch Submission Form
                  {batch.submission_file_url && (
                    <button
                      onClick={async () => {
                        setRegenMsg('Regenerating...')
                        const batchCalves = (batch.calf_summaries || []).map(s => {
                          const found = allCalves.find(c => c.id === s.id || c.ear_tag === s.earTag)
                          return found || s
                        })
                        await reGenerateSubmission(batch, batchCalves, onReload)
                        setRegenMsg('')
                      }}
                      style={{ fontSize: 11, padding: '1px 6px', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 4 }}
                    >↺ Regen</button>
                  )}
                </label>
                {batch.submission_file_url ? (
                  <div className="row" style={{ gap: 6 }}>
                    <a href={batch.submission_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {batch.submission_file_name}</a>
                    <button className="danger-text" style={{ fontSize: 12 }} onClick={async () => {
                      await supabase.from('batches').update({ submission_file_name: null, submission_file_url: null }).eq('id', batch.id)
                      onReload()
                    }}>Remove</button>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>Not generated</span>
                    <button
                      onClick={async () => {
                        setRegenMsg('Generating...')
                        const batchCalves = (batch.calf_summaries || []).map(s => {
                          const found = allCalves.find(c => c.id === s.id || c.ear_tag === s.earTag)
                          return found || s
                        })
                        await reGenerateSubmission(batch, batchCalves, onReload)
                        setRegenMsg('')
                      }}
                      style={{ fontSize: 12 }}
                    >Generate now</button>
                  </div>
                )}
                {regenMsg && <span className="muted" style={{ fontSize: 11 }}>{regenMsg}</span>}
              </div>

              <FileUploadField
                label="Batch Detail Report (Unistel)"
                fileName={batch.batch_report_file_name}
                fileUrl={batch.batch_report_file_url}
                fieldName="batch_report"
                batchId={batch.id}
                onReload={onReload}
              />

              <FileUploadField
                label="NSBA Invoice"
                fileName={batch.invoice_file_name}
                fileUrl={batch.invoice_file_url}
                fieldName="invoice"
                batchId={batch.id}
                onReload={onReload}
              />
              <BirthNotificationDocs batch={batch} onReload={onReload} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="primary" onClick={() => generateBook(batch, calves)}>Generate birth notification</button>
            <button className="danger-text" style={{ fontSize: 13 }} onClick={() => {
              if (window.confirm('Delete this batch? This cannot be undone.')) onDelete(batch.id)
            }}>Delete batch</button>
          </div>

        </div>
      )}
    </div>
  )
}
