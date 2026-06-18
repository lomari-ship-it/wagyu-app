import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }

const emptyBreeding = { owner: '', identity_number: '', ear_tag: '', sex: '', date_of_birth: '', breed: 'Wagyu', mother_id: '', father_id: '' }
const emptyTransfer = { type: '', date: '', customer: '', invoice_number: '', breed: 'Wagyu', sex: '', date_of_birth: '' }

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const ownerDiff = (a.owner || '').localeCompare(b.owner || '')
    if (ownerDiff !== 0) return ownerDiff
    return (a.identity_number || '').localeCompare(b.identity_number || '', undefined, { numeric: true })
  })
}

export default function CattleRegister() {
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
  const [search, setSearch] = useState('')
  const [breedingOpen, setBreedingOpen] = useState(false)
  const [generalOpen,  setGeneralOpen]  = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cattle_register').select('*')
    if (data) {
      setBreeding(sortRecords(data.filter((r) => r.animal_type === 'breeding' && !r.archived)))
      setGeneral(sortRecords(data.filter((r) => r.animal_type !== 'breeding' && !r.archived)))
      setArchived(sortRecords(data.filter((r) => r.archived)))
    }
    setLoading(false)
  }

  async function syncExistingData(overwrite = false) {
    const [{ data: calvesData }, { data: cattleData }] = await Promise.all([
      supabase.from('calves').select('ear_tag, identity_number, birth_date, sex, mother_id, father_id, breed'),
      supabase.from('cattle_register').select('id, ear_tag, sex, date_of_birth, breed, mother_id, father_id, identity_number'),
    ])
    if (!calvesData || !cattleData) { alert('Failed to load data for sync.'); return }
    const calfMap = {}
    calvesData.forEach(c => { calfMap[c.ear_tag] = c })
    const isEmpty = (v) => !v || v === 'NULL'
    let updated = 0
    for (const cattle of cattleData) {
      const calf = calfMap[cattle.ear_tag]
      if (!calf) continue
      const updates = {}
      if ((overwrite || isEmpty(cattle.sex)) && calf.sex) updates.sex = calf.sex
      if ((overwrite || isEmpty(cattle.date_of_birth)) && calf.birth_date) updates.date_of_birth = calf.birth_date
      if ((overwrite || isEmpty(cattle.breed)) && calf.breed) updates.breed = calf.breed
      if ((overwrite || isEmpty(cattle.mother_id)) && calf.mother_id) updates.mother_id = calf.mother_id
      if ((overwrite || isEmpty(cattle.father_id)) && calf.father_id) updates.father_id = calf.father_id
      if ((overwrite || isEmpty(cattle.identity_number)) && calf.identity_number) updates.identity_number = calf.identity_number
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
    })
  }

  async function saveEdit(record) {
    const updates = { owner: editForm.owner, ear_tag: editForm.ear_tag, identity_number: editForm.identity_number || null }
    if (record.animal_type === 'breeding') {
      updates.breed = editForm.breed || null
      updates.sex = editForm.sex || null
      updates.date_of_birth = editForm.date_of_birth || null
      updates.mother_id = editForm.mother_id || null
      updates.father_id = editForm.father_id || null
    }
    const { error } = await supabase.from('cattle_register').update(updates).eq('id', record.id)
    if (!error) { setEditingId(null); load() }
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

  async function markSold(id) {
    await supabase.from('cattle_register').update({ transfer_type: 'sold' }).eq('id', id)
    load()
  }

  async function markUnsold(id) {
    await supabase.from('cattle_register').update({ transfer_type: 'kitai' }).eq('id', id)
    load()
  }

  // Summary stats
  const totalActive = breeding.length + general.length
  const totalTransferred = archived.length
  const breedCounts = {}
  const sexCounts = { Male: 0, Female: 0, Unknown: 0 }
  breeding.forEach(r => {
    const b = r.breed || 'Unknown'
    breedCounts[b] = (breedCounts[b] || 0) + 1
    if (r.sex === 'Male') sexCounts.Male++
    else if (r.sex === 'Female') sexCounts.Female++
    else sexCounts.Unknown++
  })
  const ownerCounts = {}
  ;[...breeding, ...general].forEach(r => { ownerCounts[r.owner] = (ownerCounts[r.owner] || 0) + 1 })

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
        </>}
        <td style={{ textAlign: 'right' }}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="primary" onClick={() => saveEdit(record)}>Save</button>
            <button onClick={() => setEditingId(null)}>Cancel</button>
          </div>
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

      {/* ── Summary (non-collapsible) ── */}
      <div className="card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Summary</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>

          <div style={{ minWidth: 160 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totals</div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                <span>Breeding animals</span><strong>{breeding.length}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                <span>General cattle</span><strong>{general.length}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24, borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                <span style={{ fontWeight: 500 }}>Total active</span><strong>{totalActive}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24, color: 'var(--color-text-muted)' }}>
                <span>Transferred / sold</span><strong>{totalTransferred}</strong>
              </div>
            </div>
          </div>

          <div style={{ minWidth: 160 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breeding — Sex</div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                <span>Bulls (Male)</span><strong>{sexCounts.Male}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                <span>Cows / Heifers (Female)</span><strong>{sexCounts.Female}</strong>
              </div>
              {sexCounts.Unknown > 0 && (
                <div className="row" style={{ justifyContent: 'space-between', gap: 24, color: 'var(--color-text-muted)' }}>
                  <span>Unknown</span><strong>{sexCounts.Unknown}</strong>
                </div>
              )}
            </div>
          </div>

          {Object.keys(breedCounts).length > 0 && (
            <div style={{ minWidth: 160 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breeding — Breed</div>
              <div className="stack" style={{ gap: 6 }}>
                {Object.entries(breedCounts).sort((a,b) => b[1]-a[1]).map(([breed, count]) => (
                  <div key={breed} className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                    <span>{breed}</span><strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(ownerCounts).length > 0 && (
            <div style={{ minWidth: 160 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active — By Owner</div>
              <div className="stack" style={{ gap: 6 }}>
                {Object.entries(ownerCounts).sort((a,b) => b[1]-a[1]).map(([owner, count]) => (
                  <div key={owner} className="row" style={{ justifyContent: 'space-between', gap: 24 }}>
                    <span>{owner}</span><strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Search + Sync ── */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ear tag or identity number..." style={{ width: '100%', maxWidth: 360 }} />
        <div className="row" style={{ gap: 4 }}>
          <button style={{ fontSize: 12 }} onClick={() => syncExistingData(false)}>Sync from calves (fill missing)</button>
          <button style={{ fontSize: 12 }} onClick={() => { if (window.confirm('This will overwrite existing cattle register data with calf registration data. Continue?')) syncExistingData(true) }}>Sync from calves (overwrite all)</button>
        </div>
      </div>

      {/* ── Breeding animals ── */}
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
              <div style={{ gridColumn: '1 / -1' }} className="row">
                <button type="submit" className="primary" disabled={bSaving}>Add breeding animal</button>
                <span className="muted">{bMsg}</span>
              </div>
            </form>
            {loading ? <p className="muted">Loading...</p> : breeding.length === 0 ? <p className="muted">No breeding animals registered yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Sex</th><th>DOB</th><th>Breed</th><th>Mother</th><th>Father</th><th></th></tr></thead>
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
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={8}>Total breeding animals</td><td style={{ textAlign: 'right' }}>{breeding.length}</td></tr></tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── General cattle ── */}
      <div className="card">
        <SectionHeader title="General cattle register" count={general.length} open={generalOpen} onToggle={() => setGeneralOpen((v) => !v)} />
        {generalOpen && (
          <>
            {loading ? null : general.length === 0 ? <p className="muted">No general cattle records yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Sex</th><th>DOB</th><th>Breed</th><th>Mother ID</th><th>Father ID</th><th></th></tr></thead>
                  <tbody>
                    {general.filter(c => !search || (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())).map((c) => {
                      if (editingId === c.id) return <EditRow key={c.id} record={c} isBreeding={false} />
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
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={8}>Total cattle</td><td style={{ textAlign: 'right' }}>{general.length}</td></tr></tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Transferred / sold ── */}
      <div className="card">
        <SectionHeader title="Transferred / sold" count={archived.length} open={archivedOpen} onToggle={() => setArchivedOpen((v) => !v)} />
        {archivedOpen && (
          archived.length === 0 ? <p className="muted">No transferred animals yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
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
                        <td>
                          {c.ear_tag}
                          {isSold && <span className="badge success" style={{ marginLeft: 6, fontSize: 11 }}>Sold</span>}
                        </td>
                        <td>{isSold ? <span className="badge success">Sold</span> : <span className="badge warning">Pending sale</span>}</td>
                        <td><span className="badge neutral">{c.transfer_type === 'kitai' ? 'Kitai' : c.transfer_type === 'sold' ? 'Sold' : (c.transfer_type || '—')}</span></td>
                        <td>{c.transfer_date || <span className="faint">—</span>}</td>
                        <td>{c.transfer_customer || <span className="faint">—</span>}</td>
                        <td>{c.transfer_invoice_number || <span className="faint">—</span>}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                            {!isSold
                              ? <button className="primary" style={{ fontSize: 12 }} onClick={() => markSold(c.id)}>Mark sold</button>
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
                    <td colSpan={2} style={{ color: 'var(--color-success-text, #15803d)' }}>{archived.filter(r => r.transfer_type === 'sold').length} sold</td>
                    <td colSpan={3}>{archived.filter(r => r.transfer_type !== 'sold').length} pending</td>
                    <td style={{ textAlign: 'right' }}>{archived.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}
      </div>

    </div>
  )
}
