import { useEffect, useState } from 'react'
import { supabase, OWNERS, NAMLITS_OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }

const emptyBreeding = { owner: '', identity_number: '', ear_tag: '', sex: '', date_of_birth: '', breed: 'Wagyu', mother_id: '', father_id: '', namlits_ownership: 'Kalahari Wagyu', purchase_date: '' }
const emptyTransfer = { type: '', date: '', customer: '', invoice_number: '', breed: 'Wagyu', sex: '', date_of_birth: '' }

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const ownerDiff = (a.owner || '').localeCompare(b.owner || '')
    if (ownerDiff !== 0) return ownerDiff
    return (a.identity_number || '').localeCompare(b.identity_number || '', undefined, { numeric: true })
  })
}

export default function CattleRegister({ search: parentSearch = '', onSearchChange }) {
  const [breeding, setBreeding] = useState([])
  const [general,  setGeneral]  = useState([])
  const [archived, setArchived] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [bForm, setBForm] = useState(emptyBreeding)
  const [bSaving, setBSaving] = useState(false)
  const [bMsg, setBMsg] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [transferringId, setTransferringId] = useState(null)
  const [transferForm, setTransferForm] = useState(emptyTransfer)
  const [transferSaving, setTransferSaving] = useState(false)
  const [localSearch, setLocalSearch] = useState(parentSearch)
  const search = onSearchChange ? parentSearch : localSearch
  const setSearch = onSearchChange || setLocalSearch
  const [breedingOpen, setBreedingOpen] = useState(false)
  const [generalOpen,  setGeneralOpen]  = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [namlitsMap,   setNamlitsMap]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data }, { data: calvesData }] = await Promise.all([
      supabase.from('cattle_register').select('*'),
      supabase.from('calves').select('ear_tag, namlits_ownership'),
    ])
    if (calvesData) {
      const map = {}
      calvesData.forEach(c => { if (c.ear_tag) map[c.ear_tag] = c.namlits_ownership })
      setNamlitsMap(map)
    }
    if (data) {
      setBreeding(sortRecords(data.filter((r) => r.animal_type === 'breeding' && !r.archived)))
      setGeneral(sortRecords(data.filter((r) => r.animal_type !== 'breeding' && !r.archived)))
      setArchived(sortRecords(data.filter((r) => r.archived)))
    }
    setLoading(false)
  }

  async function syncExistingData() {
    const [{ data: calvesData }, { data: cattleData }] = await Promise.all([
      supabase.from('calves').select('ear_tag, identity_number, birth_date, sex, mother_id, father_id, breed'),
      supabase.from('cattle_register').select('id, ear_tag, sex, date_of_birth, breed, mother_id, father_id, identity_number'),
    ])
    if (!calvesData || !cattleData) { alert('Failed to load data for sync.'); return }
    const calfMap = {}
    calvesData.forEach(c => { calfMap[c.ear_tag] = c })
    let updated = 0
    for (const cattle of cattleData) {
      const calf = calfMap[cattle.ear_tag]
      if (!calf) continue
      const updates = {}
      if (calf.sex && calf.sex !== cattle.sex) updates.sex = calf.sex
      if (calf.birth_date && calf.birth_date !== cattle.date_of_birth) updates.date_of_birth = calf.birth_date
      if (calf.breed && calf.breed !== cattle.breed) updates.breed = calf.breed
      if (calf.mother_id && calf.mother_id !== cattle.mother_id) updates.mother_id = calf.mother_id
      if (calf.father_id && calf.father_id !== cattle.father_id) updates.father_id = calf.father_id
      if (calf.identity_number && calf.identity_number !== cattle.identity_number) updates.identity_number = calf.identity_number
      if (Object.keys(updates).length > 0) {
        await supabase.from('cattle_register').update(updates).eq('id', cattle.id)
        updated++
      }
    }
    alert(`Sync complete. ${updated} record${updated !== 1 ? 's' : ''} updated.`)
    load()
  }

  async function saveBreeding(e) {
    e.preventDefault(); setBSaving(true); setBMsg('Saving...')
    const { error } = await supabase.from('cattle_register').insert({
      animal_type: 'breeding', owner: bForm.owner, breed: bForm.breed || null,
      ear_tag: bForm.ear_tag, identity_number: bForm.identity_number || null,
      sex: bForm.sex || null, date_of_birth: bForm.date_of_birth || null,
      mother_id: bForm.mother_id || null, father_id: bForm.father_id || null,
      namlits_ownership: bForm.namlits_ownership || 'Kalahari Wagyu',
    })
    if (error) { setBMsg('Failed: ' + error.message) }
    else { setBMsg('Saved.'); setBForm(emptyBreeding); load(); setTimeout(() => setBMsg(''), 2500) }
    setBSaving(false)
  }

  function startEdit(record) {
    setTransferringId(null)
    setEditingId(record.id)
    setEditForm({
      owner: record.owner || '', identity_number: record.identity_number || '',
      ear_tag: record.ear_tag || '', sex: record.sex || '',
      date_of_birth: record.date_of_birth || '', breed: record.breed || 'Wagyu',
      mother_id: record.mother_id || '', father_id: record.father_id || '',
      namlits_ownership: record.namlits_ownership || 'Kalahari Wagyu',
      purchase_date: record.purchase_date || '',
    })
  }

  async function saveEdit(record, afterSave = null) {
    const updates = { owner: editForm.owner, ear_tag: editForm.ear_tag, identity_number: editForm.identity_number || null }
    if (record.animal_type === 'breeding') {
      updates.breed = editForm.breed || null
      updates.sex = editForm.sex || null
      updates.date_of_birth = editForm.date_of_birth || null
      updates.mother_id = editForm.mother_id || null
      updates.father_id = editForm.father_id || null
      updates.namlits_ownership = editForm.namlits_ownership || 'Kalahari Wagyu'
      updates.purchase_date = editForm.purchase_date || null
    }
    updates.namlits_ownership = editForm.namlits_ownership || 'Kalahari Wagyu'
    const { error } = await supabase.from('cattle_register').update(updates).eq('id', record.id)
    if (!error) {
      setEditingId(null)
      await load()
      if (afterSave) afterSave()
    }
  }

  function startEditById(id) {
    setTimeout(() => {
      setBreeding(prev => {
        const rec = prev.find(r => r.id === id)
        if (rec) {
          setEditingId(rec.id)
          setEditForm({
            owner: rec.owner || '', identity_number: rec.identity_number || '',
            ear_tag: rec.ear_tag || '', sex: rec.sex || '',
            date_of_birth: rec.date_of_birth || '', breed: rec.breed || 'Wagyu',
            mother_id: rec.mother_id || '', father_id: rec.father_id || '',
            namlits_ownership: rec.namlits_ownership || 'Kalahari Wagyu',
            purchase_date: rec.purchase_date || '',
          })
        }
        return prev
      })
    }, 50)
  }

  function startTransfer(record) {
    setEditingId(null)
    setTransferringId(record.id)
    setTransferForm({ ...emptyTransfer, breed: record.breed || 'Wagyu', sex: record.sex || '', date_of_birth: record.date_of_birth || '' })
  }

  async function saveTransfer(record) {
    setTransferSaving(true)
    if (transferForm.type === 'kitai') {
      const { error } = await supabase.from('cattle_register').update({
        archived: true, transfer_type: 'kitai',
        transfer_date: transferForm.date || null, transfer_customer: 'Kitai',
      }).eq('id', record.id)
      if (!error) { setTransferringId(null); load() }
    } else if (transferForm.type === 'breeding') {
      const { error } = await supabase.from('cattle_register').update({
        animal_type: 'breeding', breed: transferForm.breed || null,
        sex: transferForm.sex || null, date_of_birth: transferForm.date_of_birth || null,
      }).eq('id', record.id)
      if (!error) { setTransferringId(null); load() }
    }
    setTransferSaving(false)
  }

  async function unarchive(id) {
    await supabase.from('cattle_register').update({
      archived: false, transfer_type: null, transfer_date: null,
      transfer_customer: null, transfer_invoice_number: null,
    }).eq('id', id)
    load()
  }

  async function deleteRecord(id) {
    if (!window.confirm('Delete this record? Cannot be undone.')) return
    await supabase.from('cattle_register').delete().eq('id', id)
    load()
  }

  async function markUnsold(id) {
    await supabase.from('cattle_register').update({ transfer_type: 'kitai' }).eq('id', id)
    load()
  }

  const totalBreeding = breeding.length
  const totalGeneral = general.length
  const totalSold = archived.filter(r => r.transfer_type === 'sold').length
  const totalPending = archived.filter(r => r.transfer_type !== 'sold').length

  const ownerAll = {}
  function bumpOwner(owner, key) {
    const o = owner || 'Unknown'
    if (!ownerAll[o]) ownerAll[o] = { breeding: 0, general: 0, pending: 0, sold: 0 }
    ownerAll[o][key]++
  }
  breeding.forEach(r => bumpOwner(r.owner, 'breeding'))
  general.forEach(r => bumpOwner(r.owner, 'general'))
  archived.forEach(r => bumpOwner(r.owner, r.transfer_type === 'sold' ? 'sold' : 'pending'))

  function SectionHeader({ title, count, open, onToggle }) {
    return (
      <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: open ? 12 : 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{title}</h2>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted">{count} record{count !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
        </div>
      </div>
    )
  }

  function EditRow({ record, isBreeding }) {
    return (
      <tr style={{ background: 'var(--color-accent-light)' }}>
        <td><select value={editForm.owner} onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}>{OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
        <td><input value={editForm.identity_number} onChange={(e) => setEditForm((f) => ({ ...f, identity_number: e.target.value }))} /></td>
        <td><input value={editForm.ear_tag} onChange={(e) => setEditForm((f) => ({ ...f, ear_tag: e.target.value }))} /></td>
        {isBreeding && <>
          <td><select value={editForm.sex} onChange={(e) => setEditForm((f) => ({ ...f, sex: e.target.value }))}><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option></select></td>
          <td><input type="date" value={editForm.date_of_birth} onChange={(e) => setEditForm((f) => ({ ...f, date_of_birth: e.target.value }))} /></td>
          <td><select value={editForm.breed} onChange={(e) => setEditForm((f) => ({ ...f, breed: e.target.value }))}><option value="">Select</option><option value="Wagyu">Wagyu</option><option value="F1">F1</option><option value="F2">F2</option><option value="Angus">Angus</option></select></td>
          <td><input value={editForm.mother_id || ''} onChange={(e) => setEditForm((f) => ({ ...f, mother_id: e.target.value }))} placeholder="Dam identity no." style={{ fontSize: 12 }} /></td>
          <td><input value={editForm.father_id || ''} onChange={(e) => setEditForm((f) => ({ ...f, father_id: e.target.value }))} placeholder="Sire identity no." style={{ fontSize: 12 }} /></td>
          <td><select value={editForm.namlits_ownership || 'Kalahari Wagyu'} onChange={(e) => setEditForm((f) => ({ ...f, namlits_ownership: e.target.value }))}>{NAMLITS_OWNERS.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
          <td><input type="date" value={editForm.purchase_date || ''} onChange={(e) => setEditForm((f) => ({ ...f, purchase_date: e.target.value }))} /></td>
        </>}
        <td style={{ textAlign: 'right' }}>
          {isBreeding && (() => {
            const idx = breeding.findIndex(r => r.id === record.id)
            const prev = breeding[idx - 1]
            const next = breeding[idx + 1]
            return (
              <div className="row" style={{ justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                {prev && <button style={{ fontSize: 12 }} onClick={() => saveEdit(record, () => startEditById(prev.id))}>← Prev</button>}
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', alignSelf: 'center' }}>{idx + 1} / {breeding.length}</span>
                {next && <button style={{ fontSize: 12 }} onClick={() => saveEdit(record, () => startEditById(next.id))}>Next →</button>}
                <button className="primary" style={{ fontSize: 12 }} onClick={() => saveEdit(record)}>Save</button>
                <button style={{ fontSize: 12 }} onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            )
          })()}
          {!isBreeding && (
            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
              <button className="primary" onClick={() => saveEdit(record)}>Save</button>
              <button onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  function TransferRow({ record }) {
    const tf = transferForm
    const set = (field, value) => setTransferForm((f) => ({ ...f, [field]: value }))
    const colSpan = record.animal_type === 'breeding' ? 7 : 4
    return (
      <tr style={{ background: 'var(--color-warning-bg)' }}>
        <td colSpan={colSpan}>
          <div style={{ padding: '8px 0' }}>
            <div className="muted" style={{ fontWeight: 500, marginBottom: 8 }}>Transfer: {record.identity_number || record.ear_tag}</div>
            <div className="row" style={{ marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: tf.type === 'breeding' ? 600 : 400 }}>
                <input type="radio" name={`ttype-${record.id}`} value="breeding" checked={tf.type === 'breeding'} onChange={() => set('type', 'breeding')} style={{ width: 'auto' }} />
                Move to Breeding animals
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: tf.type === 'kitai' ? 600 : 400 }}>
                <input type="radio" name={`ttype-${record.id}`} value="kitai" checked={tf.type === 'kitai'} onChange={() => set('type', 'kitai')} style={{ width: 'auto' }} />
                Transferred to Kitai pending sale
              </label>
            </div>
            {tf.type === 'kitai' && (
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                <div><label>Transfer date</label><input type="date" value={tf.date} onChange={(e) => set('date', e.target.value)} /></div>
              </div>
            )}
            {tf.type === 'breeding' && (
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                <div><label>Sex</label><select value={tf.sex} onChange={(e) => set('sex', e.target.value)}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
                <div><label>Date of birth</label><input type="date" value={tf.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></div>
                <div><label>Breed</label><select value={tf.breed} onChange={(e) => set('breed', e.target.value)}><option value="">Select</option><option value="Wagyu">Wagyu</option><option value="F1">F1</option><option value="F2">F2</option><option value="Angus">Angus</option></select></div>
              </div>
            )}
            <div className="row">
              <button className="primary" disabled={!tf.type || transferSaving} onClick={() => saveTransfer(record)}>Confirm transfer</button>
              <button onClick={() => setTransferringId(null)}>Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>Summary</h2>
        <div className="row" style={{ gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Breeding animals</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-text)' }}>{totalBreeding}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>General cattle</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-text)' }}>{totalGeneral}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Pending sale</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-warning-text, #92400e)' }}>{totalPending}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Sold / invoiced</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-success-text, #15803d)' }}>{totalSold}</div>
          </div>
        </div>
        {Object.keys(ownerAll).length > 0 && (
          <table style={{ width: '100%', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breeding</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>General</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Sale</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sold / Invoiced</th>
                <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ownerAll).sort((a,b) => a[0].localeCompare(b[0])).map(([owner, d]) => (
                <tr key={owner} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 0' }}>{owner}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0' }}>{d.breeding > 0 ? d.breeding : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0' }}>{d.general > 0 ? d.general : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0', color: d.pending > 0 ? 'var(--color-warning-text, #92400e)' : 'inherit' }}>{d.pending > 0 ? d.pending : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0' }}>{d.sold > 0 ? d.sold : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: 500 }}>{d.breeding + d.general + d.pending + d.sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ear tag or identity number..." style={{ width: '100%', maxWidth: 360 }} />
        <button style={{ fontSize: 12 }} onClick={() => { if (window.confirm('Sync cattle register from calf registrations?')) syncExistingData() }}>Sync</button>
      </div>

      <div className="card">
        <SectionHeader title="Breeding animals" count={breeding.length} open={breedingOpen} onToggle={() => setBreedingOpen((v) => !v)} />
        {breedingOpen && (
          <>
            <form onSubmit={saveBreeding} className="grid-form" style={{ marginBottom: 12 }}>
              <div><label>Owner *</label><select required value={bForm.owner} onChange={(e) => setBForm((f) => ({ ...f, owner: e.target.value }))}><option value="">Select owner</option>{OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label>Identity number *</label><input required value={bForm.identity_number} onChange={(e) => setBForm((f) => ({ ...f, identity_number: e.target.value }))} placeholder="e.g. 26-0001JFW" /></div>
              <div><label>Ear tag number *</label><input required value={bForm.ear_tag} onChange={(e) => setBForm((f) => ({ ...f, ear_tag: e.target.value }))} placeholder="e.g. NA12345" /></div>
              <div><label>Sex *</label><select required value={bForm.sex} onChange={(e) => setBForm((f) => ({ ...f, sex: e.target.value }))}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
              <div><label>Date of birth *</label><input required type="date" value={bForm.date_of_birth} onChange={(e) => setBForm((f) => ({ ...f, date_of_birth: e.target.value }))} /></div>
              <div><label>Breed *</label><select required value={bForm.breed} onChange={(e) => setBForm((f) => ({ ...f, breed: e.target.value }))}><option value="">Select</option><option value="Wagyu">Wagyu</option><option value="F1">F1</option><option value="F2">F2</option><option value="Angus">Angus</option></select></div>
              <div><label>Namlits Ownership</label><select value={bForm.namlits_ownership||'Kalahari Wagyu'} onChange={(e)=>setBForm(f=>({...f,namlits_ownership:e.target.value}))}>{NAMLITS_OWNERS.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }} className="row">
                <button type="submit" className="primary" disabled={bSaving}>Add breeding animal</button>
                <span className="muted">{bMsg}</span>
              </div>
            </form>
            {loading ? <p className="muted">Loading...</p> : breeding.length === 0 ? <p className="muted">No breeding animals registered yet.</p> : (
              <ScrollTable>
                <table>
                  <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Sex</th><th>DOB</th><th>Breed</th><th>Mother</th><th>Father</th><th>Namlits</th><th></th></tr></thead>
                  <tbody>
                    {breeding.filter(c => !search || (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())).map((c) => {
                      if (editingId === c.id) return <EditRow key={c.id} record={c} isBreeding={true} />
                      if (transferringId === c.id) return <TransferRow key={c.id} record={c} />
                      return (
                        <tr key={c.id}>
                          <td>{c.owner}</td>
                          <td>{(!c.identity_number || c.identity_number === 'NULL') ? <span className="faint">—</span> : c.identity_number}</td>
                          <td>{c.ear_tag}</td>
                          <td>{(!c.sex || c.sex === 'NULL') ? <span className="faint">—</span> : c.sex}</td>
                          <td>{(!c.date_of_birth || c.date_of_birth === 'NULL') ? <span className="faint">—</span> : formatDate(c.date_of_birth)}</td>
                          <td>{(!c.breed || c.breed === 'NULL') ? <span className="faint">—</span> : c.breed}</td>
                          <td>{(!c.mother_id || c.mother_id === 'NULL') ? <span className="faint">—</span> : c.mother_id}</td>
                          <td>{(!c.father_id || c.father_id === 'NULL') ? <span className="faint">—</span> : c.father_id}</td>
                          <td><span className="muted" style={{ fontSize: 11 }}>{c.namlits_ownership || namlitsMap[c.ear_tag] || '—'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <button style={{ fontSize: 12 }} onClick={() => startEdit(c)}>Edit</button>
                              <button style={{ fontSize: 12 }} onClick={() => startTransfer(c)}>Transfer</button>
                              <button className="danger-text" style={{ fontSize: 12 }} onClick={() => deleteRecord(c.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={9}>Total breeding animals</td><td style={{ textAlign: 'right' }}>{breeding.length}</td></tr></tfoot>
                </table>
              </ScrollTable>
            )}
          </>
        )}
      </div>

      <div className="card">
        <SectionHeader title="General cattle register" count={general.length} open={generalOpen} onToggle={() => setGeneralOpen((v) => !v)} />
        {generalOpen && (
          <>
            {loading ? null : general.length === 0 ? <p className="muted">No general cattle records yet.</p> : (
              <ScrollTable>
                <table>
                  <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Sex</th><th>DOB</th><th>Breed</th><th>Mother ID</th><th>Father ID</th><th>Namlits</th><th></th></tr></thead>
                  <tbody>
                    {general.filter(c => !search || (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())).map((c) => {
                      if (transferringId === c.id) return <TransferRow key={c.id} record={c} />
                      return (
                        <tr key={c.id}>
                          <td>{c.owner}</td>
                          <td>{(!c.identity_number || c.identity_number === 'NULL') ? <span className="faint">—</span> : c.identity_number}</td>
                          <td>{c.ear_tag}</td>
                          <td>{(!c.sex || c.sex === 'NULL') ? <span className="faint">—</span> : c.sex}</td>
                          <td>{(!c.date_of_birth || c.date_of_birth === 'NULL') ? <span className="faint">—</span> : formatDate(c.date_of_birth)}</td>
                          <td>{(!c.breed || c.breed === 'NULL') ? <span className="faint">—</span> : c.breed}</td>
                          <td>{(!c.mother_id || c.mother_id === 'NULL') ? <span className="faint">—</span> : c.mother_id}</td>
                          <td>{(!c.father_id || c.father_id === 'NULL') ? <span className="faint">—</span> : c.father_id}</td>
                          <td><span className="muted" style={{ fontSize: 11 }}>{c.namlits_ownership || namlitsMap[c.ear_tag] || '—'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <button style={{ fontSize: 12 }} onClick={() => startTransfer(c)}>Transfer</button>
                              <button className="danger-text" style={{ fontSize: 12 }} onClick={() => deleteRecord(c.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={9}>Total cattle</td><td style={{ textAlign: 'right' }}>{general.length}</td></tr></tfoot>
                </table>
              </ScrollTable>
            )}
          </>
        )}
      </div>

      <div className="card">
        <SectionHeader title="Transferred / sold" count={archived.length} open={archivedOpen} onToggle={() => setArchivedOpen((v) => !v)} />
        {archivedOpen && (
          archived.length === 0 ? <p className="muted">No transferred animals yet.</p> : (
            <ScrollTable>
              <table>
                <thead>
                  <tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Status</th><th>Type</th><th>Date</th><th>Customer</th><th>Invoice no.</th><th></th></tr>
                </thead>
                <tbody>
                  {archived.filter(c => !search || (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())).map((c) => {
                    const isSold = c.transfer_type === 'sold'
                    return (
                      <tr key={c.id} style={{ opacity: isSold ? 0.75 : 0.9, background: isSold ? 'var(--color-success-bg, #f0fdf4)' : undefined }}>
                        <td>{c.owner}</td>
                        <td>{(!c.identity_number || c.identity_number === 'NULL') ? <span className="faint">—</span> : c.identity_number}</td>
                        <td>{c.ear_tag}{isSold && <span className="badge success" style={{ marginLeft: 6, fontSize: 11 }}>Sold</span>}</td>
                        <td>{isSold ? <span className="badge success">Sold</span> : <span className="badge warning">Pending sale</span>}</td>
                        <td><span className="badge neutral">{c.transfer_type === 'kitai' ? 'Kitai' : c.transfer_type === 'sold' ? 'Sold' : (c.transfer_type || '—')}</span></td>
                        <td>{c.transfer_date || <span className="faint">—</span>}</td>
                        <td>{c.transfer_customer || <span className="faint">—</span>}</td>
                        <td>{c.transfer_invoice_number || <span className="faint">—</span>}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                            {!isSold
                              ? <span className="badge warning" style={{ fontSize: 12 }}>Awaiting Kitai invoice</span>
                              : <button style={{ fontSize: 12 }} onClick={() => markUnsold(c.id)}>Revert</button>
                            }
                            <button style={{ fontSize: 12 }} onClick={() => unarchive(c.id)}>Restore</button>
                            <button className="danger-text" style={{ fontSize: 12 }} onClick={() => deleteRecord(c.id)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}>
                    <td colSpan={3}>Total</td>
                    <td colSpan={2} style={{ color: 'var(--color-success-text, #15803d)' }}>{totalSold} sold</td>
                    <td colSpan={3}>{totalPending} pending</td>
                    <td style={{ textAlign: 'right' }}>{archived.length}</td>
                  </tr>
                </tfoot>
              </table>
            </ScrollTable>
          )
        )}
      </div>
    </div>
  )
}
