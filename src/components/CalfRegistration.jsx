import { useEffect, useState } from 'react'
import { supabase, OWNERS, NAMLITS_OWNERS } from '../lib/supabase'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }

const BREEDS = ['Wagyu', 'F1', 'F2', 'Angus']
const COLORS = [
  '1 - Red', '2 - Red and white', '3 - White and red', '4 - Yellow', '5 - Roan',
  '6 - White', '7 - Red with white on underline', '8 - Yellow and white', '9 - Black',
  '10 - Brown', '11 - Grey', '12 - Gir', '13 - Guzerat', '14 - Indu Bra.', '15 - Nellore',
]

export default function CalfRegistration({ search, onSearchChange }) {
  const emptyForm = {
    owner: '', breed: 'Wagyu', ear_tag: '', identity_mid: '', birth_date: '',
    color: '', sex: '', calf_details: 'Single', birth_mass: '', mother_id: '', father_id: '', notes: '',
    namlits_ownership: 'Kalahari Wagyu',
  }
  const [form, setForm] = useState(emptyForm)
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null)

  const idYear = form.birth_date ? form.birth_date.slice(2, 4) : new Date().getFullYear().toString().slice(2)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('calves').select('*').order('created_at', { ascending: false })
    setCalves(data || [])
    setLoading(false)
  }

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const mid = form.identity_mid.trim()
    const identityNumber = mid ? `${idYear}-${mid}JFW` : null
    const { error } = await supabase.from('calves').insert({
      owner: form.owner, breed: form.breed, ear_tag: form.ear_tag,
      identity_number: identityNumber, birth_date: form.birth_date,
      color: form.color, sex: form.sex || null, calf_details: form.calf_details,
      birth_mass: form.birth_mass ? Number(form.birth_mass) : null,
      mother_id: form.mother_id || null, father_id: form.father_id || null, notes: form.notes || null,
      namlits_ownership: form.namlits_ownership || 'Kalahari Wagyu',
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm(emptyForm)
    setShowForm(false)
    load()
  }

  function startEdit(calf) {
    setEditingId(calf.id)
    setEditError(null)
    const idYear2 = new Date().getFullYear()
    let mid = ''
    if (calf.identity_number) {
      const m = calf.identity_number.match(/^\d{4}-(.*?)JFW$/)
      if (m) mid = m[1]
    }
    setEditForm({
      owner: calf.owner || '',
      breed: calf.breed || 'Wagyu',
      ear_tag: calf.ear_tag || '',
      identity_mid: mid,
      birth_date: calf.birth_date || '',
      color: calf.color || '',
      sex: calf.sex || '',
      calf_details: calf.calf_details || 'Single',
      birth_mass: calf.birth_mass || '',
      mother_id: calf.mother_id || '',
      father_id: calf.father_id || '',
      notes: calf.notes || '',
      namlits_ownership: calf.namlits_ownership || 'Kalahari Wagyu',
      sold_date: calf.sold_date || '',
    })
  }

  async function saveEdit(calf) {
    setEditSaving(true)
    setEditError(null)
    const idYear2 = new Date().getFullYear()
    const mid = editForm.identity_mid.trim()
    const identityNumber = mid ? `${idYear2}-${mid}JFW` : null
    const { error } = await supabase.from('calves').update({
      owner: editForm.owner, breed: editForm.breed, ear_tag: editForm.ear_tag,
      identity_number: identityNumber, birth_date: editForm.birth_date,
      color: editForm.color, sex: editForm.sex || null, calf_details: editForm.calf_details,
      birth_mass: editForm.birth_mass ? Number(editForm.birth_mass) : null,
      mother_id: editForm.mother_id || null, father_id: editForm.father_id || null,
      notes: editForm.notes || null,
      namlits_ownership: editForm.namlits_ownership || 'Kalahari Wagyu',
      sold_date: editForm.sold_date || null,
    }).eq('id', calf.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setEditingId(null)
    load()
  }

  function exportCSV() {
    const headers = ['ear_tag','identity_number','owner','breed','birth_date','color','sex','calf_details','birth_mass','mother_id','father_id','namlits_ownership','notes','sold_date']
    const rows = calves.map(r => headers.map(h => { const v = r[h] ?? ''; const s = String(v); return s.includes(',') ? '"' + s + '"' : s }).join(','))
    const csv = [headers.join(','), ...rows].join(String.fromCharCode(10))
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'calves_' + new Date().toISOString().slice(0,10) + '.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  async function deleteCalf(id) {
    if (!window.confirm('Delete this calf registration?')) return
    await supabase.from('calves').delete().eq('id', id)
    load()
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportLoading(true)
    setImportError(null)
    setImportResult(null)
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
    let inserted = 0, skipped = 0, errors = []
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row = {}
      headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
      if (!row.ear_tag && !row['ear tag']) { skipped++; continue }
      const earTag = row.ear_tag || row['ear tag']
      const { error } = await supabase.from('calves').insert({
        owner: row.owner || '', breed: row.breed || 'Wagyu',
        ear_tag: earTag, identity_number: row.identity_number || row['identity number'] || null,
        birth_date: row.birth_date || row['birth date'] || null,
        color: row.color || null, sex: row.sex || null,
        calf_details: row.calf_details || row['calf details'] || 'Single',
        birth_mass: row.birth_mass ? Number(row.birth_mass) : null,
        mother_id: row.mother_id || null, father_id: row.father_id || null,
        notes: row.notes || null,
        namlits_ownership: row.namlits_ownership || 'Kalahari Wagyu',
        sold_date: row.sold_date || row['sold date'] || null,
        sold_flag: !!(row.sold_date || row['sold date']),
      })
      if (error) errors.push(`Row ${i}: ${error.message}`)
      else inserted++
    }
    setImportLoading(false)
    setImportResult({ inserted, skipped, errors })
    if (inserted > 0) load()
    e.target.value = ''
  }

  const filtered = calves.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.ear_tag || '').toLowerCase().includes(q) ||
      (c.identity_number || '').toLowerCase().includes(q) ||
      (c.owner || '').toLowerCase().includes(q) ||
      (c.breed || '').toLowerCase().includes(q)
    )
  })

  function EditCalfCard({ calf }) {
    const f = editForm
    const idYear = f.birth_date ? f.birth_date.slice(2, 4) : new Date().getFullYear().toString().slice(2)
    function set(field, value) { setEditForm(prev => ({ ...prev, [field]: value })) }
    return (
      <div className="card" style={{ border: '2px solid var(--color-primary)', padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px 16px' }}>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Owner</label>
            <select value={f.owner} onChange={(e) => set('owner', e.target.value)}>
              <option value="">Select owner</option>
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Breed</label>
            <select value={f.breed} onChange={(e) => set('breed', e.target.value)}>
              {BREEDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Color</label>
            <select value={f.color} onChange={(e) => set('color', e.target.value)}>
              <option value="">Select color</option>
              <option value="1 - Red">1 - Red</option>
              <option value="2 - Red and white">2 - Red and white</option>
              <option value="3 - White and red">3 - White and red</option>
              <option value="4 - Yellow">4 - Yellow</option>
              <option value="5 - Roan">5 - Roan</option>
              <option value="6 - White">6 - White</option>
              <option value="7 - Red with white on underline">7 - Red with white on underline</option>
              <option value="8 - Yellow and white">8 - Yellow and white</option>
              <option value="9 - Black">9 - Black</option>
              <option value="10 - Brown">10 - Brown</option>
              <option value="11 - Grey">11 - Grey</option>
              <option value="12 - Gir">12 - Gir</option>
              <option value="13 - Guzerat">13 - Guzerat</option>
              <option value="14 - Indu Bra.">14 - Indu Bra.</option>
              <option value="15 - Nellore">15 - Nellore</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Birth date</label>
            <input type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Ear tag</label>
            <input value={f.ear_tag} onChange={(e) => set('ear_tag', e.target.value)} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Identity number</label>
            <div className="row" style={{ gap: 4 }}>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{idYear}-</span>
              <input value={f.identity_mid} onChange={(e) => set('identity_mid', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>JFW</span>
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Namlits Ownership</label>
            <select value={f.namlits_ownership || 'Kalahari Wagyu'} onChange={(e) => set('namlits_ownership', e.target.value)}>
              {NAMLITS_OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Sex</label>
            <select value={f.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Calf details</label>
            <select value={f.calf_details} onChange={(e) => set('calf_details', e.target.value)}>
              <option value="Single">Single</option>
              <option value="Twin A">Twin A</option>
              <option value="Twin B">Twin B</option>
              <option value="Triplet A">Triplet A</option>
              <option value="Triplet B">Triplet B</option>
              <option value="Triplet C">Triplet C</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label>Birth mass (kg)</label>
            <input type="number" value={f.birth_mass} onChange={(e) => set('birth_mass', e.target.value)} step="0.1" />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Mother ID</label>
            <input value={f.mother_id} onChange={(e) => set('mother_id', e.target.value)} placeholder="Ear tag or identity no." />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Father ID</label>
            <input value={f.father_id} onChange={(e) => set('father_id', e.target.value)} placeholder="Ear tag or identity no." />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label>Sold / transferred date</label>
            <input type="date" value={f.sold_date || ''} onChange={(e) => set('sold_date', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>
        {editError && <p style={{ color: 'var(--color-danger)', margin: '8px 0 0' }}>{editError}</p>}
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button className="primary" onClick={() => saveEdit(calf)} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save changes'}
          </button>
          <button onClick={() => setEditingId(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  function CalfCard({ calf }) {
    if (editingId === calf.id) return <EditCalfCard calf={calf} />
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 500 }}>
              {calf.ear_tag}
              {calf.identity_number && <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{calf.identity_number}</span>}
            </div>
            <div className="muted">
              {calf.owner} &middot; Born {formatDate(calf.birth_date)} &middot; {calf.color}
              {calf.namlits_ownership && ` · ${calf.namlits_ownership}`}
              {calf.sex && ` · ${calf.sex}`}
              {calf.calf_details && calf.calf_details !== 'Single' && ` · ${calf.calf_details}`}
              {calf.birth_mass && ` · ${calf.birth_mass}kg`}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            {calf.sold_flag && <span className="badge neutral">Sold/Transferred{calf.sold_date ? ` · ${formatDate(calf.sold_date)}` : ''}</span>}
            <button style={{ fontSize: 12 }} onClick={() => startEdit(calf)}>Edit</button>
            <button className="danger-text" style={{ fontSize: 12 }} onClick={() => deleteCalf(calf.id)}>Delete</button>
          </div>
        </div>
        {calf.notes && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{calf.notes}</p>}
      </div>
    )
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search ear tag, identity no., owner…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Register calf'}
        </button>
        <button onClick={exportCSV} disabled={calves.length === 0}>Export CSV</button>
        <label style={{ cursor: 'pointer' }}>
          <span className="button">{importLoading ? 'Importing…' : 'Import CSV'}</span>
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} disabled={importLoading} />
        </label>
      </div>

      {importResult && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <p style={{ margin: 0 }}>Import complete: <strong>{importResult.inserted}</strong> inserted, <strong>{importResult.skipped}</strong> skipped.</p>
          {importResult.errors.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--color-danger)' }}>
              {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {showForm && (
        <div className="card">
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 500 }}>Register new calf</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px 16px' }}>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Owner *</label>
                <select required value={form.owner} onChange={(e) => update('owner', e.target.value)}>
                  <option value="">Select owner</option>
                  {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Breed</label>
                <select value={form.breed} onChange={(e) => update('breed', e.target.value)}>
                  {BREEDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Color *</label>
                <select required value={form.color} onChange={(e) => update('color', e.target.value)}>
                  <option value="">Select color</option>
                  <option value="1 - Red">1 - Red</option>
                  <option value="2 - Red and white">2 - Red and white</option>
                  <option value="3 - White and red">3 - White and red</option>
                  <option value="4 - Yellow">4 - Yellow</option>
                  <option value="5 - Roan">5 - Roan</option>
                  <option value="6 - White">6 - White</option>
                  <option value="7 - Red with white on underline">7 - Red with white on underline</option>
                  <option value="8 - Yellow and white">8 - Yellow and white</option>
                  <option value="9 - Black">9 - Black</option>
                  <option value="10 - Brown">10 - Brown</option>
                  <option value="11 - Grey">11 - Grey</option>
                  <option value="12 - Gir">12 - Gir</option>
                  <option value="13 - Guzerat">13 - Guzerat</option>
                  <option value="14 - Indu Bra.">14 - Indu Bra.</option>
                  <option value="15 - Nellore">15 - Nellore</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Birth date *</label>
                <input required type="date" value={form.birth_date} onChange={(e) => update('birth_date', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Ear tag number *</label>
                <input required value={form.ear_tag} onChange={(e) => update('ear_tag', e.target.value)} placeholder="e.g. NA12345" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Identity number</label>
                <div className="row" style={{ gap: 4 }}>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{idYear}-</span>
                  <input value={form.identity_mid} onChange={(e) => update('identity_mid', e.target.value)} placeholder="0001" style={{ flex: 1, minWidth: 0 }} />
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>JFW</span>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Namlits Ownership</label>
                <select value={form.namlits_ownership} onChange={(e) => update('namlits_ownership', e.target.value)}>
                  {NAMLITS_OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--color-border)', paddingTop: 8 }} />
              <div style={{ gridColumn: 'span 2' }}>
                <label>Sex</label>
                <select value={form.sex} onChange={(e) => update('sex', e.target.value)}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Calf details</label>
                <select value={form.calf_details} onChange={(e) => update('calf_details', e.target.value)}>
                  <option value="Single">Single</option>
                  <option value="Twin A">Twin A</option>
                  <option value="Twin B">Twin B</option>
                  <option value="Triplet A">Triplet A</option>
                  <option value="Triplet B">Triplet B</option>
                  <option value="Triplet C">Triplet C</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Birth mass (kg)</label>
                <input type="number" value={form.birth_mass} onChange={(e) => update('birth_mass', e.target.value)} step="0.1" />
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Mother ID</label>
                <input value={form.mother_id} onChange={(e) => update('mother_id', e.target.value)} placeholder="Ear tag or identity no." />
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label>Father ID</label>
                <input value={form.father_id} onChange={(e) => update('father_id', e.target.value)} placeholder="Ear tag or identity no." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {error && <p style={{ color: 'var(--color-danger)', margin: '0 0 8px' }}>{error}</p>}
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Register calf'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {loading
        ? <p className="muted">Loading…</p>
        : filtered.length === 0
          ? <p className="muted">No calves found.</p>
          : filtered.map(c => <CalfCard key={c.id} calf={c} />)
      }
    </div>
  )
}
