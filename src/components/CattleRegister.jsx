import { useEffect, useState } from 'react'
import { supabase, OWNERS } from '../lib/supabase'

const emptyBreeding = { owner: '', identity_number: '', ear_tag: '', sex: '', date_of_birth: '', breed: 'Wagyu' }
const emptyGeneral  = { owner: '', identity_number: '', ear_tag: '' }
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
  const [gForm, setGForm] = useState(emptyGeneral)
  const [bSaving, setBSaving] = useState(false)
  const [gSaving, setGSaving] = useState(false)
  const [bMsg, setBMsg] = useState('')
  const [gMsg, setGMsg] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [transferringId, setTransferringId] = useState(null)
  const [transferForm, setTransferForm] = useState(emptyTransfer)
  const [transferSaving, setTransferSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [breedingOpen, setBreedingOpen] = useState(true)
  const [generalOpen,  setGeneralOpen]  = useState(true)
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

  async function saveBreeding(e) {
    e.preventDefault(); setBSaving(true); setBMsg('Saving...')
    const { error } = await supabase.from('cattle_register').insert({
      animal_type: 'breeding', owner: bForm.owner, breed: bForm.breed || null,
      ear_tag: bForm.ear_tag, identity_number: bForm.identity_number || null,
      sex: bForm.sex || null, date_of_birth: bForm.date_of_birth || null,
    })
    if (error) { setBMsg('Failed: ' + error.message) }
    else { setBMsg('Saved.'); setBForm(emptyBreeding); load(); setTimeout(() => setBMsg(''), 2500) }
    setBSaving(false)
  }

  async function saveGeneral(e) {
    e.preventDefault(); setGSaving(true); setGMsg('Saving...')
    const { error } = await supabase.from('cattle_register').insert({
      animal_type: 'general', owner: gForm.owner,
      ear_tag: gForm.ear_tag, identity_number: gForm.identity_number || null,
    })
    if (error) { setGMsg('Failed: ' + error.message) }
    else { setGMsg('Saved.'); setGForm(emptyGeneral); load(); setTimeout(() => setGMsg(''), 2500) }
    setGSaving(false)
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
    if (transferForm.type === 'sold') {
      const { error } = await supabase.from('cattle_register').update({
        archived: true,
        transfer_type: 'sold',
        transfer_date: transferForm.date || null,
        transfer_customer: transferForm.customer || null,
        transfer_invoice_number: transferForm.invoice_number || null,
      }).eq('id', record.id)
      if (!error) { setTransferringId(null); load() }
    } else if (transferForm.type === 'breeding') {
      const { error } = await supabase.from('cattle_register').update({
        animal_type: 'breeding',
        breed: transferForm.breed || null,
        sex: transferForm.sex || null,
        date_of_birth: transferForm.date_of_birth || null,
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
    await supabase.from('cattle_register').delete().eq('id', id)
    load()
  }

  function SectionHeader({ title, count, open, onToggle, sub }) {
    return (
      <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: open ? 12 : 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{title}</h2>
          {sub && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{sub}</p>}
        </div>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: tf.type === 'sold' ? 600 : 400 }}>
                <input type="radio" name={`ttype-${record.id}`} value="sold" checked={tf.type === 'sold'} onChange={() => set('type', 'sold')} style={{ width: 'auto' }} />
                Sold
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: tf.type === 'breeding' ? 600 : 400 }}>
                <input type="radio" name={`ttype-${record.id}`} value="breeding" checked={tf.type === 'breeding'} onChange={() => set('type', 'breeding')} style={{ width: 'auto' }} />
                Move to Breeding animals
              </label>
            </div>

            {tf.type === 'sold' && (
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                <div><label>Date</label><input type="date" value={tf.date} onChange={(e) => set('date', e.target.value)} /></div>
                <div><label>Customer</label><input style={{ width: 160 }} value={tf.customer} onChange={(e) => set('customer', e.target.value)} placeholder="e.g. Kitai" /></div>
                <div><label>Invoice number</label><input style={{ width: 140 }} value={tf.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} placeholder="e.g. INV-001" /></div>
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
    <div className="stack" style={{ gap: 32 }}>

      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ear tag or identity number..."
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

      {/* Breeding animals */}
      <div className="card">
        <SectionHeader title="Breeding animals" count={breeding.length} open={breedingOpen} onToggle={() => setBreedingOpen((v) => !v)} sub="Bulls, cows and heifers used for breeding." />
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
                  <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Sex</th><th>DOB</th><th>Breed</th><th></th></tr></thead>
                  <tbody>
                    {breeding.map((c) => {
                      if (editingId === c.id) return <EditRow key={c.id} record={c} isBreeding={true} />
                      if (transferringId === c.id) return <TransferRow key={c.id} record={c} />
                      return (
                        <tr key={c.id}>
                          <td>{c.owner}</td>
                          <td>{c.identity_number || <span className="faint">—</span>}</td>
                          <td>{c.ear_tag}</td>
                          <td>{c.sex || <span className="faint">—</span>}</td>
                          <td>{c.date_of_birth || <span className="faint">—</span>}</td>
                          <td>{c.breed || <span className="faint">—</span>}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => startEdit(c)}>Edit</button>
                              <button onClick={() => startTransfer(c)}>Transfer</button>
                              <button className="danger-text" onClick={() => deleteRecord(c.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={6}>Total breeding animals</td><td style={{ textAlign: 'right' }}>{breeding.length}</td></tr></tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* General cattle */}
      <div className="card">
        <SectionHeader title="General cattle register" count={general.length} open={generalOpen} onToggle={() => setGeneralOpen((v) => !v)} sub="Owner-to-ear-tag mapping for all other registered cattle." />
        {generalOpen && (
          <>
            <form onSubmit={saveGeneral} className="grid-form" style={{ marginBottom: 12 }}>
              <div><label>Owner *</label><select required value={gForm.owner} onChange={(e) => setGForm((f) => ({ ...f, owner: e.target.value }))}><option value="">Select owner</option>{OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label>Identity number</label><input value={gForm.identity_number} onChange={(e) => setGForm((f) => ({ ...f, identity_number: e.target.value }))} placeholder="optional" /></div>
              <div><label>Ear tag number *</label><input required value={gForm.ear_tag} onChange={(e) => setGForm((f) => ({ ...f, ear_tag: e.target.value }))} placeholder="e.g. NA12345" /></div>
              <div style={{ gridColumn: '1 / -1' }} className="row">
                <button type="submit" className="primary" disabled={gSaving}>Add to register</button>
                <span className="muted">{gMsg}</span>
              </div>
            </form>
            {loading ? null : general.length === 0 ? <p className="muted">No general cattle records yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Owner</th><th>Identity number</th><th>Ear tag</th><th></th></tr></thead>
                  <tbody>
                    {general.map((c) => {
                      if (editingId === c.id) return <EditRow key={c.id} record={c} isBreeding={false} />
                      if (transferringId === c.id) return <TransferRow key={c.id} record={c} />
                      return (
                        <tr key={c.id}>
                          <td>{c.owner}</td>
                          <td>{c.identity_number || <span className="faint">—</span>}</td>
                          <td>{c.ear_tag}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => startEdit(c)}>Edit</button>
                              <button onClick={() => startTransfer(c)}>Transfer</button>
                              <button className="danger-text" onClick={() => deleteRecord(c.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={3}>Total cattle</td><td style={{ textAlign: 'right' }}>{general.length}</td></tr></tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Archived / transferred */}
      <div className="card">
        <SectionHeader title="Transferred / sold" count={archived.length} open={archivedOpen} onToggle={() => setArchivedOpen((v) => !v)} sub="Animals removed from the active register." />
        {archivedOpen && (
          archived.length === 0 ? <p className="muted">No transferred animals yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Type</th><th>Date</th><th>Customer</th><th>Invoice no.</th><th></th></tr></thead>
                <tbody>
                  {archived.map((c) => (
                    <tr key={c.id} style={{ opacity: 0.8 }}>
                      <td>{c.owner}</td>
                      <td>{c.identity_number || <span className="faint">—</span>}</td>
                      <td>{c.ear_tag}</td>
                      <td><span className="badge neutral">{c.transfer_type || '—'}</span></td>
                      <td>{c.transfer_date || <span className="faint">—</span>}</td>
                      <td>{c.transfer_customer || <span className="faint">—</span>}</td>
                      <td>{c.transfer_invoice_number || <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button onClick={() => unarchive(c.id)}>Restore</button>
                          <button className="danger-text" onClick={() => deleteRecord(c.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={7}>Total</td><td style={{ textAlign: 'right' }}>{archived.length}</td></tr></tfoot>
              </table>
            </div>
          )
        )}
      </div>

    </div>
  )
}
