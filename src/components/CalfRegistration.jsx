import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

const emptyForm = {
  owner: '', breed: 'Wagyu', ear_tag: '', identity_mid: '', birth_date: '',
  color: '', sex: '', calf_details: 'Single', birth_mass: '', mother_id: '', father_id: '', notes: '',
}

export default function CalfRegistration() {
  const [form, setForm] = useState(emptyForm)
  const [calves, setCalves] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [showSold, setShowSold] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => { loadCalves() }, [])

  async function loadCalves() {
    setLoading(true)
    const { data, error } = await supabase.from('calves').select('*').order('created_at', { ascending: false })
    if (!error) setCalves(data || [])
    setLoading(false)
  }

  async function syncToRegister() {
    const { data: existing } = await supabase.from('cattle_register').select('ear_tag').eq('animal_type', 'general')
    const existingTags = new Set((existing || []).map((r) => r.ear_tag))
    const toAdd = calves.filter((c) => !existingTags.has(c.ear_tag))
    if (toAdd.length === 0) { alert('All calves are already in the General cattle register.'); return }
    const rows = toAdd.map((c) => ({ animal_type: 'general', owner: c.owner, ear_tag: c.ear_tag, identity_number: c.identity_number || null }))
    const { error } = await supabase.from('cattle_register').insert(rows)
    if (error) { alert('Sync failed: ' + error.message) }
    else { alert(`${toAdd.length} calf record${toAdd.length !== 1 ? 's' : ''} added to General cattle register.`) }
  }

  async function generateBook(ownerFilter) {
    const toExport = ownerFilter
      ? calves.filter((c) => c.owner === ownerFilter && !c.sold_flag)
      : calves.filter((c) => !c.sold_flag)
    if (toExport.length === 0) { alert('No active calves to export.'); return }
    try {
      const res = await fetch('/.netlify/functions/generate-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toExport),
      })
      if (!res.ok) throw new Error('Generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `birth_notification_${ownerFilter || 'all'}_${new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Failed to generate: ' + e.message)
    }
  }

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  const idYear = form.birth_date ? form.birth_date.slice(2, 4) : '--'

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setStatusMsg('Saving...')
    let identityNumber = null
    if (form.birth_date && form.identity_mid.trim()) {
      identityNumber = `${form.birth_date.slice(2, 4)}-${form.identity_mid.trim()}JFW`
    } else if (form.identity_mid.trim()) {
      identityNumber = form.identity_mid.trim()
    }
    const { error } = await supabase.from('calves').insert({
      owner: form.owner, breed: form.breed, ear_tag: form.ear_tag,
      identity_number: identityNumber, birth_date: form.birth_date,
      color: form.color, sex: form.sex || null, calf_details: form.calf_details,
      birth_mass: form.birth_mass ? Number(form.birth_mass) : null,
      mother_id: form.mother_id || null, father_id: form.father_id || null, notes: form.notes || null,
    })
    if (error) { setStatusMsg('Save failed: ' + error.message) }
    else {
      // Auto-add to general cattle register
      await supabase.from('cattle_register').insert({
        animal_type: 'general',
        owner: form.owner,
        ear_tag: form.ear_tag,
        identity_number: identityNumber || null,
      })
      setStatusMsg('Saved.'); setForm({ ...emptyForm }); loadCalves(); setTimeout(() => setStatusMsg(''), 2500)
    }
    setSaving(false)
  }

  function startEdit(calf) {
    setEditingId(calf.id)
    const mid = calf.identity_number
      ? calf.identity_number.replace(/^\d{2}-/, '').replace(/JFW$/, '')
      : ''
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
    })
  }

  async function saveEdit(calf) {
    let identityNumber = null
    if (editForm.birth_date && editForm.identity_mid.trim()) {
      identityNumber = `${editForm.birth_date.slice(2, 4)}-${editForm.identity_mid.trim()}JFW`
    } else if (editForm.identity_mid.trim()) {
      identityNumber = editForm.identity_mid.trim()
    }
    const { error } = await supabase.from('calves').update({
      owner: editForm.owner, breed: editForm.breed, ear_tag: editForm.ear_tag,
      identity_number: identityNumber, birth_date: editForm.birth_date,
      color: editForm.color, sex: editForm.sex || null, calf_details: editForm.calf_details,
      birth_mass: editForm.birth_mass ? Number(editForm.birth_mass) : null,
      mother_id: editForm.mother_id || null, father_id: editForm.father_id || null,
      notes: editForm.notes || null,
    }).eq('id', calf.id)
    if (!error) { setEditingId(null); loadCalves() }
  }

  async function toggleSold(calf) {
    const newFlag = !calf.sold_flag
    const updates = { sold_flag: newFlag }
    if (newFlag && !calf.sold_buyer) updates.sold_buyer = 'Kitai'
    await supabase.from('calves').update(updates).eq('id', calf.id)
    loadCalves()
  }

  async function updateSoldField(calf, field, value) {
    await supabase.from('calves').update({ [field]: value }).eq('id', calf.id)
    loadCalves()
  }

  async function deleteCalf(id) {
    await supabase.from('calves').delete().eq('id', id)
    loadCalves()
  }

  const activeCount = calves.filter((c) => !c.sold_flag).length
  const soldCount = calves.filter((c) => c.sold_flag).length
  const displayed = showSold ? calves : calves.filter((c) => !c.sold_flag)

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Calf registration</h2>
          <div className="row">
            <span className="muted">{activeCount} active{soldCount > 0 ? `, ${soldCount} sold/transferred` : ''}</span>
            <button onClick={syncToRegister} style={{ fontSize: 12 }}>Sync all to cattle register</button>
            <button onClick={() => generateBook(null)} style={{ fontSize: 12 }}>Generate birth notification (all)</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="grid-form" style={{ marginBottom: 12 }}>
          <div>
            <label>Owner *</label>
            <select required value={form.owner} onChange={(e) => update('owner', e.target.value)}>
              <option value="">Select owner</option>
              {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label>Breed *</label>
            <select required value={form.breed} onChange={(e) => update('breed', e.target.value)}><option value="">Select</option><option value="Wagyu">Wagyu</option><option value="F1">F1</option><option value="F2">F2</option></select>
          </div>
          <div>
            <label>Ear tag number *</label>
            <input required value={form.ear_tag} onChange={(e) => update('ear_tag', e.target.value)} placeholder="e.g. NA12345" />
          </div>
          <div>
            <label>Identity number</label>
            <div className="row" style={{ gap: 4 }}>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{idYear}-</span>
              <input value={form.identity_mid} onChange={(e) => update('identity_mid', e.target.value)} placeholder="0001" style={{ flex: 1, minWidth: 0 }} />
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>JFW</span>
            </div>
          </div>
          <div>
            <label>Birth date *</label>
            <input required type="date" value={form.birth_date} onChange={(e) => update('birth_date', e.target.value)} />
          </div>
          <div>
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
          <div>
            <label>Sex</label>
            <select value={form.sex} onChange={(e) => update('sex', e.target.value)}>
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div>
            <label>Calf details</label>
            <select value={form.calf_details} onChange={(e) => update('calf_details', e.target.value)}>
              <option value="Single">Single</option>
              <option value="Twin">Twin</option>
              <option value="Multiple">Multiple</option>
            </select>
          </div>
          <div>
            <label>Birth mass (kg)</label>
            <input type="number" step="0.1" min="0" value={form.birth_mass} onChange={(e) => update('birth_mass', e.target.value)} placeholder="e.g. 35.5" />
          </div>
          <div>
            <label>Mother ID</label>
            <input value={form.mother_id} onChange={(e) => update('mother_id', e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label>Father ID</label>
            <input value={form.father_id} onChange={(e) => update('father_id', e.target.value)} placeholder="optional" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Additional notes</label>
            <textarea rows={2} style={{ width: '100%', resize: 'vertical' }} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Any other observations" />
          </div>
          <div style={{ gridColumn: '1 / -1' }} className="row">
            <button type="submit" className="primary" disabled={saving}>Save calf entry</button>
            <span className="muted">{statusMsg}</span>
          </div>
        </form>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
        <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} style={{ width: 'auto' }} />
        Show sold/transferred entries
      </label>

      {loading ? <p className="muted">Loading...</p> : displayed.length === 0 ? (
        <p className="muted">{showSold ? 'No calf entries saved yet.' : 'No active calf entries.'}</p>
      ) : (
        <div className="stack">
          {displayed.map((c) =>
            editingId === c.id
              ? <EditCalfCard key={c.id} calf={c} editForm={editForm} setEditForm={setEditForm} onSave={() => saveEdit(c)} onCancel={() => setEditingId(null)} />
              : <CalfCard key={c.id} calf={c} onEdit={() => startEdit(c)} onToggleSold={() => toggleSold(c)} onUpdateSoldField={(f, v) => updateSoldField(c, f, v)} onDelete={() => deleteCalf(c.id)} />
          )}
        </div>
      )}
    </div>
  )
}

function EditCalfCard({ calf, editForm, setEditForm, onSave, onCancel }) {
  const f = editForm
  const set = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))
  const idYear = f.birth_date ? f.birth_date.slice(2, 4) : '--'
  return (
    <div className="card" style={{ border: '2px solid var(--color-accent)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Editing: {calf.ear_tag}</strong>
        <div className="row">
          <button className="primary" onClick={onSave}>Save changes</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <div className="grid-form">
        <div>
          <label>Owner</label>
          <select value={f.owner} onChange={(e) => set('owner', e.target.value)}>
            {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label>Breed</label>
          <select value={f.breed} onChange={(e) => set('breed', e.target.value)}><option value="">Select</option><option value="Wagyu">Wagyu</option><option value="F1">F1</option><option value="F2">F2</option></select>
        </div>
        <div>
          <label>Ear tag</label>
          <input value={f.ear_tag} onChange={(e) => set('ear_tag', e.target.value)} />
        </div>
        <div>
          <label>Identity number</label>
          <div className="row" style={{ gap: 4 }}>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{idYear}-</span>
            <input value={f.identity_mid} onChange={(e) => set('identity_mid', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>JFW</span>
          </div>
        </div>
        <div>
          <label>Birth date</label>
          <input type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
        </div>
        <div>
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
        <div>
          <label>Sex</label>
          <select value={f.sex} onChange={(e) => set('sex', e.target.value)}>
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div>
          <label>Calf details</label>
          <select value={f.calf_details} onChange={(e) => set('calf_details', e.target.value)}>
            <option value="Single">Single</option>
            <option value="Twin">Twin</option>
            <option value="Multiple">Multiple</option>
          </select>
        </div>
        <div>
          <label>Birth mass (kg)</label>
          <input type="number" step="0.1" min="0" value={f.birth_mass} onChange={(e) => set('birth_mass', e.target.value)} />
        </div>
        <div>
          <label>Mother ID</label>
          <input value={f.mother_id} onChange={(e) => set('mother_id', e.target.value)} />
        </div>
        <div>
          <label>Father ID</label>
          <input value={f.father_id} onChange={(e) => set('father_id', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Notes</label>
          <textarea rows={2} style={{ width: '100%', resize: 'vertical' }} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function CalfCard({ calf, onEdit, onToggleSold, onUpdateSoldField, onDelete }) {
  return (
    <div className="card" style={{ opacity: calf.sold_flag ? 0.8 : 1 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <strong>{calf.ear_tag}</strong>
            {calf.breed && <span className="muted">{calf.breed}</span>}
            {calf.identity_number && <span className="muted">ID: {calf.identity_number}</span>}
            {calf.sold_flag && <span className="badge neutral">Sold/Transferred</span>}
          </div>
          <div className="muted">
            {calf.owner} &middot; Born {calf.birth_date} &middot; {calf.color}
            {calf.sex && ` · ${calf.sex}`}
            {calf.calf_details && calf.calf_details !== 'Single' && ` · ${calf.calf_details}`}
            {calf.birth_mass && ` · ${calf.birth_mass} kg`}
          </div>
          {(calf.mother_id || calf.father_id) && (
            <div className="muted" style={{ marginTop: 2 }}>
              {calf.mother_id && `Dam: ${calf.mother_id}`}
              {calf.mother_id && calf.father_id && ' · '}
              {calf.father_id && `Sire: ${calf.father_id}`}
            </div>
          )}
          {calf.notes && <div className="muted" style={{ marginTop: 4 }}>{calf.notes}</div>}
        </div>
        <div className="row">
          <button onClick={onEdit}>Edit</button>
          <button onClick={onToggleSold}>{calf.sold_flag ? 'Unmark sold' : 'Mark sold'}</button>
          <button className="danger-text" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {calf.sold_flag && (
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
          <div className="muted" style={{ fontWeight: 500, marginBottom: 6 }}>Sold / transferred details</div>
          <div className="row">
            <div><label>Buyer</label><input style={{ width: 120 }} defaultValue={calf.sold_buyer || 'Kitai'} onBlur={(e) => onUpdateSoldField('sold_buyer', e.target.value)} /></div>
            <div><label>Sold date</label><input type="date" defaultValue={calf.sold_date || ''} onBlur={(e) => onUpdateSoldField('sold_date', e.target.value || null)} /></div>
            <div><label>My invoice number</label><input style={{ width: 140 }} defaultValue={calf.sold_invoice_number || ''} onBlur={(e) => onUpdateSoldField('sold_invoice_number', e.target.value)} placeholder="e.g. INV-2026-01" /></div>
            <div><label>My invoice date</label><input type="date" defaultValue={calf.sold_invoice_date || ''} onBlur={(e) => onUpdateSoldField('sold_invoice_date', e.target.value || null)} /></div>
            <div><label>Payment received date</label><input type="date" defaultValue={calf.sold_payment_received_date || ''} onBlur={(e) => onUpdateSoldField('sold_payment_received_date', e.target.value || null)} /></div>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className={`badge ${calf.sold_payment_received_date ? 'success' : 'warning'}`}>
              {calf.sold_payment_received_date ? 'Payment received' : 'Payment pending'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
