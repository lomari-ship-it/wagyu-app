import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function CollapsibleCard({ title, count, countLabel, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ padding: 0 }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{title}</h2>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted">{count} {countLabel || 'record'}{count !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
        </div>
      </div>
      {open && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>{children}</div>}
    </div>
  )
}

export default function KitaiTransfers({ search: parentSearch = '', onSearchChange }) {
  const [tab, setTab] = useState('cattle')
  const [localSearch, setLocalSearch] = useState(parentSearch)
  const globalSearch = onSearchChange ? parentSearch : localSearch
  const setGlobalSearch = onSearchChange || setLocalSearch
  const [transfers, setTransfers] = useState([])
  const [allKitaiCattle, setAllKitaiCattle] = useState([])
  const [calves, setCalves] = useState([])
  const [batches, setBatches] = useState([])
  const [saleInvoices, setSaleInvoices] = useState([])
  const [dnaInvoices, setDnaInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [t, ca, c, b, si, di] = await Promise.all([
      supabase.from('kitai_transfers').select('*').order('created_at', { ascending: false }),
      supabase.from('cattle_register').select('*').eq('archived', true).eq('transfer_type', 'kitai'),
      supabase.from('calves').select('*'),
      supabase.from('batches').select('id, calf_ids, calf_summaries, rate_per_test, invoice_test_count, invoice_amount_payable'),
      supabase.from('kitai_sale_invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('kitai_dna_invoices').select('*').order('created_at', { ascending: false }),
    ])
    const kitaiCattle = ca.data || []
    const existingTransfers = t.data || []
    if (!ca.error) setAllKitaiCattle(kitaiCattle)
    if (!c.error) setCalves(c.data || [])
    if (!b.error) setBatches(b.data || [])
    if (!si.error) setSaleInvoices(si.data || [])
    if (!di.error) setDnaInvoices(di.data || [])

    // Auto-add any kitai cattle not yet in transfers
    const transferredAnimalIds = new Set(existingTransfers.map(tr => tr.animal_id))
    const toAutoAdd = kitaiCattle.filter(c => !transferredAnimalIds.has(c.id))
    if (toAutoAdd.length > 0) {
      await supabase.from('kitai_transfers').insert(
        toAutoAdd.map(c => ({
          animal_type: 'cattle', animal_id: c.id, owner: c.owner,
          ear_tag: c.ear_tag, identity_number: c.identity_number || null,
          birth_date: c.date_of_birth || null, transfer_date: c.transfer_date || null,
          dna_cost_recoverable: null, invoice_status: 'pending', sold_flag: false,
        }))
      )
      const { data: fresh } = await supabase.from('kitai_transfers').select('*').order('created_at', { ascending: false })
      setTransfers(fresh || [])
    } else {
      if (!t.error) setTransfers(existingTransfers)
    }
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

  function getDnaCostByEarTag(earTag) {
    for (const batch of batches) {
      const summaries = batch.calf_summaries || []
      const inBatch = summaries.some(s => s.earTag === earTag)
      if (inBatch) {
        if (batch.rate_per_test) return parseFloat(batch.rate_per_test)
        if (batch.invoice_amount_payable && batch.invoice_test_count)
          return parseFloat(batch.invoice_amount_payable) / batch.invoice_test_count
      }
    }
    return null
  }

  if (loading) return <p className="muted">Loading...</p>

  const invoicedTransferIds = new Set(saleInvoices.flatMap(i => i.animal_ids || []))

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
        {['cattle', 'dna', 'invoices'].map(t => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t === 'cattle' ? 'Cattle transfers' : t === 'dna' ? 'DNA cost recovery' : 'Invoices'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          placeholder="Search by ear tag or identity number..."
          style={{ width: '100%', maxWidth: 320 }}
        />
      </div>

      {tab === 'cattle' && <CattleTransfersTab allKitaiCattle={allKitaiCattle} transfers={transfers} saleInvoices={saleInvoices} invoicedTransferIds={invoicedTransferIds} search={globalSearch} onReload={loadAll} />}
      {tab === 'dna' && <DnaTab transfers={transfers} batches={batches} calves={calves} getDnaCost={getDnaCost} getDnaCostByEarTag={getDnaCostByEarTag} allKitaiCattle={allKitaiCattle} invoicedTransferIds={invoicedTransferIds} dnaInvoices={dnaInvoices} search={globalSearch} onReload={loadAll} />}
      {tab === 'invoices' && <InvoicesTab saleInvoices={saleInvoices} transfers={transfers} dnaInvoices={dnaInvoices} getDnaCostByEarTag={getDnaCostByEarTag} search={globalSearch} onReload={loadAll} />}
    </div>
  )
}

// ─── CATTLE TRANSFERS TAB ───────────────────────────────────────────────────
function CattleTransfersTab({ allKitaiCattle, transfers, saleInvoices, invoicedTransferIds, search, onReload }) {
  const filteredCattle = search ? allKitaiCattle.filter(c => (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())) : allKitaiCattle
  const [selected, setSelected] = useState(new Set())
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceDetails, setInvoiceDetails] = useState({ date: '', number: '', amount: '', notes: '' })
  const [creating, setCreating] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [notFound, setNotFound] = useState([])
  const [importPreview, setImportPreview] = useState(null)  // { toInsert, alreadyTransferred, notFound }
  const allCattleToShow = search ? allKitaiCattle.filter(c => (c.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (c.identity_number||"").toLowerCase().includes(search.toLowerCase())) : allKitaiCattle
  const soldIds = new Set(transfers.filter(t => t.sold_flag).map(t => t.animal_id))
  const invoicedCattleIds = new Set(saleInvoices.flatMap(i => i.animal_ids || []).map(id => {
    const t = transfers.find(t => t.id === id)
    return t ? t.animal_id : null
  }).filter(Boolean))

  const pendingCattle = allKitaiCattle.filter(c => !soldIds.has(c.id) && !invoicedCattleIds.has(c.id))
  const soldCattle = allKitaiCattle.filter(c => soldIds.has(c.id) || invoicedCattleIds.has(c.id))

  const byOwner = {}
  allKitaiCattle.forEach(c => {
    if (!byOwner[c.owner]) byOwner[c.owner] = { total: 0, pending: 0, sold: 0 }
    byOwner[c.owner].total++
    if (soldIds.has(c.id) || invoicedCattleIds.has(c.id)) byOwner[c.owner].sold++
    else byOwner[c.owner].pending++
  })

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function handleKitaiImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportMsg('Reading file...'); setNotFound([])
    const text = await file.text()
    const raw = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l.length > 0)
    if (raw.length < 2) { setImportMsg('Empty file.'); setImporting(false); return }
    const headers = raw[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'))

    const eidIdx = headers.findIndex(h => h === 'eid')
    const dateIdx = headers.findIndex(h => h === 'date')
    const breedIdx = headers.findIndex(h => h.includes('f1') || h.includes('f2'))

    if (eidIdx === -1) { setImportMsg('EID column not found.'); setImporting(false); return }

    function parseDate(d) {
      if (!d) return null
      const parts = d.split('/')
      if (parts.length === 3) return parts[2] + '-' + parts[1].padStart(2,'0') + '-' + parts[0].padStart(2,'0')
      return d
    }

    // Parse valid rows
    const csvAnimals = []
    for (let i = 1; i < raw.length; i++) {
      const vals = raw[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const eid = vals[eidIdx]
      if (!eid) continue
      let isNum = true
      for (let c = 0; c < eid.length; c++) { if (eid[c] < '0' || eid[c] > '9') { isNum = false; break } }
      if (!isNum) continue
      csvAnimals.push({
        ear_tag: eid,
        transfer_date: dateIdx >= 0 ? parseDate(vals[dateIdx]) : null,
        breed: breedIdx >= 0 ? (vals[breedIdx] || null) : null,
      })
    }

    if (csvAnimals.length === 0) { setImportMsg('No valid animal rows found.'); setImporting(false); return }

    // Lookup ear tags in cattle_register (general register)
    const { data: cattleData } = await supabase.from('cattle_register')
      .select('id, ear_tag, identity_number, owner, date_of_birth, breed')
      .in('ear_tag', csvAnimals.map(a => a.ear_tag))

    const cattleMap = {}
    ;(cattleData || []).forEach(c => { cattleMap[c.ear_tag] = c })

    const found = []
    const missing = []
    csvAnimals.forEach(a => {
      if (cattleMap[a.ear_tag]) {
        found.push({ ...a, ...cattleMap[a.ear_tag] })
      } else {
        missing.push(a)
      }
    })

    setNotFound(missing)

    // Check which found animals are already transferred
    const existingTags = new Set(allKitaiCattle.map(c => c.ear_tag))
    const toInsert = found.filter(a => !existingTags.has(a.ear_tag))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('cattle_register').update({
        archived: true, transfer_type: 'kitai',
        transfer_date: toInsert[0].transfer_date,
        transfer_customer: 'Kitai',
      }).in('ear_tag', toInsert.map(a => a.ear_tag))
      if (error) { setImportMsg('Import failed: ' + error.message); setImporting(false); return }
    }

    const skipped = found.length - toInsert.length
    const msg = 'Imported ' + toInsert.length + ' animals' +
      (skipped > 0 ? ', ' + skipped + ' already transferred' : '') +
      (missing.length > 0 ? '. ' + missing.length + ' ear tag(s) not found in cattle register — see list below.' : '.')
    setImportMsg(msg)
    setImporting(false)
    if (toInsert.length > 0) { setShowImport(false); onReload() }
    e.target.value = ''
  }

  async function createInvoiceFromSelection() {
    if (selected.size === 0) return
    setCreating(true)
    // Find or create kitai_transfers records for selected cattle
    const selectedCattle = allKitaiCattle.filter(c => selected.has(c.id))
    const existingTransfers = transfers.filter(t => selected.has(t.animal_id))
    const existingAnimalIds = new Set(existingTransfers.map(t => t.animal_id))

    // Add missing cattle to transfers first
    for (const c of selectedCattle) {
      if (!existingAnimalIds.has(c.id)) {
        await supabase.from('kitai_transfers').insert({
          animal_type: 'cattle', animal_id: c.id, owner: c.owner,
          ear_tag: c.ear_tag, identity_number: c.identity_number || null,
          birth_date: c.date_of_birth || null, transfer_date: c.transfer_date || null,
          invoice_status: 'pending', sold_flag: false,
        })
      }
    }

    // Reload transfers to get fresh IDs
    const { data: freshTransfers } = await supabase.from('kitai_transfers').select('*').in('animal_id', Array.from(selected))
    const transferIds = (freshTransfers || []).map(t => t.id)

    const { error } = await supabase.from('kitai_sale_invoices').insert({
      invoice_date: invoiceDetails.date || null,
      invoice_number: invoiceDetails.number || null,
      notes: invoiceDetails.notes || null,
      animal_ids: transferIds,
      animal_summaries: (freshTransfers || []).map(t => ({
        id: t.id, earTag: t.ear_tag, identityNumber: t.identity_number,
        owner: t.owner, animalType: t.animal_type
      })),
    })
    if (error) { alert('Failed: ' + error.message) }
    else {
      // Upload file if selected
      if (invoiceFile) {
        const { data: invData } = await supabase.from('kitai_sale_invoices').select('id').order('created_at', { ascending: false }).limit(1).single()
        if (invData) {
          const path = 'kitai/' + invData.id + '/' + invoiceFile.name
          const { error: upErr } = await supabase.storage.from('batch-documents').upload(path, invoiceFile, { upsert: true })
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('batch-documents').getPublicUrl(path)
            await supabase.from('kitai_sale_invoices').update({ invoice_file_name: invoiceFile.name, invoice_file_url: urlData.publicUrl }).eq('id', invData.id)
          }
        }
      }
      setSelected(new Set())
      setShowInvoiceForm(false)
      setInvoiceDetails({ date: '', number: '', notes: '' })
      setInvoiceFile(null)
      onReload()
    }
    setCreating(false)
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Total transferred</div><div style={{ fontSize: 28, fontWeight: 500 }}>{allKitaiCattle.length}</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Pending sale</div><div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-warning-text)' }}>{pendingCattle.length}</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Sold / invoiced</div><div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-success-text)' }}>{soldCattle.length}</div></div>
        </div>
        {Object.keys(byOwner).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Owner</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pending sale</th><th style={{ textAlign: 'right' }}>Sold / invoiced</th></tr></thead>
              <tbody>
                {Object.entries(byOwner).sort().map(([owner, d]) => (
                  <tr key={owner}><td>{owner}</td><td style={{ textAlign: 'right' }}>{d.total}</td><td style={{ textAlign: 'right' }}>{d.pending > 0 ? <span style={{ color: 'var(--color-warning-text)' }}>{d.pending}</span> : '—'}</td><td style={{ textAlign: 'right' }}>{d.sold > 0 ? d.sold : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CSV Import */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: showImport ? 12 : 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Import transfers from CSV</h2>
          <button onClick={() => setShowImport(v => !v)}>{showImport ? 'Cancel' : 'Import CSV'}</button>
        </div>
        {showImport && (
          <div style={{ marginTop: 8 }}>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Accepts the weighing/transfer CSV format with EID, VID, Date, F1/F2 columns. Summary rows are automatically skipped.
            </p>
            <div style={{ marginBottom: 10 }}>
              <label>CSV file</label>
              <input type="file" accept=".csv" disabled={importing} onChange={handleKitaiImport} style={{ fontSize: 13 }} />
            </div>
            {importMsg && <p className="muted" style={{ fontSize: 12, margin: 0 }}>{importMsg}</p>}
          </div>
        )}
      </div>

      {/* Not found in register */}
      {notFound.length > 0 && (
        <div className="card" style={{ border: '2px solid var(--color-danger-text)' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--color-danger-text)' }}>⚠ {notFound.length} ear tag{notFound.length !== 1 ? 's' : ''} not found in cattle register</h2>
            <button style={{ fontSize: 12 }} onClick={() => setNotFound([])}>Dismiss</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>These ear tags from the CSV were not found in the General cattle register. Please investigate and add them manually if needed.</p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Ear tag (EID)</th><th>Transfer date</th><th>Breed</th><th>Action needed</th></tr></thead>
              <tbody>
                {notFound.map((a, i) => (
                  <tr key={i}>
                    <td><strong>{a.ear_tag}</strong></td>
                    <td>{a.transfer_date ? a.transfer_date.split('-').reverse().join('/') : '—'}</td>
                    <td>{a.breed || '—'}</td>
                    <td><span className="badge warning">Not in register</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All transferred */}
      <CollapsibleCard title="All cattle transferred to Kitai" count={allCattleToShow.length} countLabel="animal" defaultOpen={true}>
        {allCattleToShow.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No cattle transferred to Kitai yet.</p> : (
          <>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
            <button style={{ fontSize: 12 }} onClick={() => {
              const unsoldIds = allKitaiCattle.filter(c => !soldIds.has(c.id) && !invoicedCattleIds.has(c.id)).map(c => c.id)
              const allSel = unsoldIds.every(id => selected.has(id))
              setSelected(allSel ? new Set() : new Set(unsoldIds))
            }}>
              {allKitaiCattle.filter(c => !soldIds.has(c.id) && !invoicedCattleIds.has(c.id)).every(c => selected.has(c.id)) ? 'Deselect all' : 'Select all unsold'}
            </button>
            {selected.size > 0 && (
              <button className="primary" style={{ fontSize: 12 }} onClick={() => setShowInvoiceForm(v => !v)}>
                {showInvoiceForm ? 'Cancel' : `Create invoice for ${selected.size} selected`}
              </button>
            )}
          </div>

          {showInvoiceForm && (
            <div style={{ padding: 12, background: 'var(--color-accent-light)', borderRadius: 8, marginBottom: 12 }}>
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                <div><label>Invoice date</label><input type="date" value={invoiceDetails.date} onChange={e => setInvoiceDetails(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label>Invoice number</label><input style={{ width: 140 }} value={invoiceDetails.number} onChange={e => setInvoiceDetails(f => ({ ...f, number: e.target.value }))} placeholder="e.g. KIT-001" /></div>
                <div><label>Notes</label><input style={{ width: 180 }} value={invoiceDetails.notes} onChange={e => setInvoiceDetails(f => ({ ...f, notes: e.target.value }))} placeholder="optional" /></div>
              </div>
              <button className="primary" disabled={creating} onClick={createInvoiceFromSelection}>
                Confirm — create invoice ({selected.size} animals)
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th></th><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Transfer date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {allCattleToShow.map(c => {
                  const isSold = soldIds.has(c.id) || invoicedCattleIds.has(c.id)
                  return (
                    <tr key={c.id}>
                      <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} disabled={isSold} style={{ width: 'auto' }} /></td>
                      <td>{c.owner}</td>
                      <td>{c.identity_number || <span className="faint">—</span>}</td>
                      <td><strong>{c.ear_tag}</strong></td>
                      <td>{formatDate(c.transfer_date)}</td>
                      <td>{isSold ? <span className="badge success">Sold / invoiced</span> : <span className="badge warning">Pending sale</span>}</td>
<td></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </CollapsibleCard>
      {/* Sales from transfers */}
      <CollapsibleCard title="Sales from transfers" count={soldCattle.length} countLabel="animal">
        {soldCattle.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No sales recorded yet.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table>
              <thead><tr><th>Owner</th><th>Identity no.</th><th>Ear tag</th><th>Transfer date</th><th>Status</th></tr></thead>
              <tbody>
                {soldCattle.map(c => (
                  <tr key={c.id}><td>{c.owner}</td><td>{c.identity_number || <span className="faint">—</span>}</td><td><strong>{c.ear_tag}</strong></td><td>{formatDate(c.transfer_date)}</td><td><span className="badge success">Sold</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>
    </div>
  )
}

// ─── DNA COST RECOVERY TAB ──────────────────────────────────────────────────
function DnaTab({ transfers, batches, calves, getDnaCost, getDnaCostByEarTag, allKitaiCattle, invoicedTransferIds, dnaInvoices, search, onReload }) {
  const filteredTransfers = search ? transfers.filter(t => (t.ear_tag||"").toLowerCase().includes(search.toLowerCase()) || (t.identity_number||"").toLowerCase().includes(search.toLowerCase())) : transfers
  // Auto-expand all sections when searching
  useEffect(() => { if (search) { setAllOpen(true); setPendingOpen(true); setInvoicedOpen(true) } }, [search])
  const [eligibleOpen, setEligibleOpen] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedForInvoice, setSelectedForInvoice] = useState(new Set())
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceDetails, setInvoiceDetails] = useState({ number: '', date: '', notes: '' })
  const [invoicedOpen, setInvoicedOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(true)
  const [allOpen, setAllOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const transferredIds = new Set(transfers.map(t => t.animal_id))
  const eligibleCattle = allKitaiCattle.filter(c => !transferredIds.has(c.id))
  const eligibleCalves = calves.filter(c => !transferredIds.has(c.id) && c.sold_buyer === 'Kitai')

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
    else onReload()
  }

  async function updateTransfer(id, updates) {
    await supabase.from('kitai_transfers').update(updates).eq('id', id)
    onReload()
  }

  async function deleteTransfer(id) {
    await supabase.from('kitai_transfers').delete().eq('id', id)
    onReload()
  }

  // Calculate DNA cost per transfer by matching ear tag to batch
  const transfersWithDna = transfers.map(t => {
    const dnaCost = parseFloat(t.dna_cost_recoverable) || getDnaCostByEarTag(t.ear_tag) || 0
    return { ...t, dnaCost }
  })

  const totalDna = transfersWithDna.reduce((s, t) => s + t.dnaCost, 0)
  const pendingDna = transfersWithDna.filter(t => t.invoice_status === 'pending').reduce((s, t) => s + t.dnaCost, 0)
  const byOwner = {}
  transfersWithDna.forEach(t => {
    if (!byOwner[t.owner]) byOwner[t.owner] = { count: 0, total: 0, pending: 0 }
    byOwner[t.owner].count++
    byOwner[t.owner].total += t.dnaCost
    if (t.invoice_status === 'pending') byOwner[t.owner].pending += t.dnaCost
  })

  const filtered = statusFilter === 'all' ? transfers : transfers.filter(t => t.invoice_status === statusFilter)

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }


  async function createInvoiceFromSelection() {
    if (selected.size === 0) return
    setCreating(true)
    // Find or create kitai_transfers records for selected cattle
    const selectedCattle = allKitaiCattle.filter(c => selected.has(c.id))
    const existingTransfers = transfers.filter(t => selected.has(t.animal_id))
    const existingAnimalIds = new Set(existingTransfers.map(t => t.animal_id))

    // Add missing cattle to transfers first
    for (const c of selectedCattle) {
      if (!existingAnimalIds.has(c.id)) {
        await supabase.from('kitai_transfers').insert({
          animal_type: 'cattle', animal_id: c.id, owner: c.owner,
          ear_tag: c.ear_tag, identity_number: c.identity_number || null,
          birth_date: c.date_of_birth || null, transfer_date: c.transfer_date || null,
          invoice_status: 'pending', sold_flag: false,
        })
      }
    }

    // Reload transfers to get fresh IDs
    const { data: freshTransfers } = await supabase.from('kitai_transfers').select('*').in('animal_id', Array.from(selected))
    const transferIds = (freshTransfers || []).map(t => t.id)

    const { error } = await supabase.from('kitai_sale_invoices').insert({
      invoice_date: invoiceDetails.date || null,
      invoice_number: invoiceDetails.number || null,
      notes: invoiceDetails.notes || null,
      animal_ids: transferIds,
      animal_summaries: (freshTransfers || []).map(t => ({
        id: t.id, earTag: t.ear_tag, identityNumber: t.identity_number,
        owner: t.owner, animalType: t.animal_type
      })),
    })
    if (error) { alert('Failed: ' + error.message) }
    else {
      // Upload file if selected
      if (invoiceFile) {
        const { data: invData } = await supabase.from('kitai_sale_invoices').select('id').order('created_at', { ascending: false }).limit(1).single()
        if (invData) {
          const path = 'kitai/' + invData.id + '/' + invoiceFile.name
          const { error: upErr } = await supabase.storage.from('batch-documents').upload(path, invoiceFile, { upsert: true })
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('batch-documents').getPublicUrl(path)
            await supabase.from('kitai_sale_invoices').update({ invoice_file_name: invoiceFile.name, invoice_file_url: urlData.publicUrl }).eq('id', invData.id)
          }
        }
      }
      setSelected(new Set())
      setShowInvoiceForm(false)
      setInvoiceDetails({ date: '', number: '', notes: '' })
      setInvoiceFile(null)
      onReload()
    }
    setCreating(false)
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Total transferred</div><div style={{ fontSize: 28, fontWeight: 500 }}>{transfers.length}</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Total DNA recoverable</div><div style={{ fontSize: 22, fontWeight: 500 }}>{fmtCurrency(totalDna)}</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Pending invoice</div><div style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-warning-text)' }}>{fmtCurrency(pendingDna)}</div></div>
        </div>
        {Object.keys(byOwner).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Owner</th><th style={{ textAlign: 'right' }}>Animals</th><th style={{ textAlign: 'right' }}>DNA recoverable</th><th style={{ textAlign: 'right' }}>Pending</th></tr></thead>
              <tbody>
                {Object.entries(byOwner).sort().map(([owner, d]) => (
                  <tr key={owner}><td>{owner}</td><td style={{ textAlign: 'right' }}>{d.count}</td><td style={{ textAlign: 'right' }}>{fmtCurrency(d.total)}</td><td style={{ textAlign: 'right' }}>{d.pending > 0 ? <span style={{ color: 'var(--color-warning-text)' }}>{fmtCurrency(d.pending)}</span> : <span className="faint">—</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Not yet tracked */}
      {(eligibleCalves.length > 0 || eligibleCattle.length > 0) && (
        <CollapsibleCard title="Animals transferred to Kitai — not yet tracked" count={eligibleCalves.length + eligibleCattle.length} countLabel="animal" defaultOpen={true}>
          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            {eligibleCalves.map(c => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div><span className="muted" style={{ fontSize: 11, marginRight: 6 }}>CALF</span><strong>{c.ear_tag}</strong>{c.identity_number && <span className="muted" style={{ marginLeft: 6 }}>{c.identity_number}</span>}<span className="muted" style={{ marginLeft: 6 }}>{c.owner}</span>{getDnaCost(c.id, c.ear_tag) && <span className="muted" style={{ marginLeft: 6 }}>DNA: {fmtCurrency(getDnaCost(c.id, c.ear_tag))}</span>}</div>
                <button className="primary" style={{ fontSize: 12 }} onClick={() => addTransfer(c, 'calf')}>Add to tracker</button>
              </div>
            ))}
            {eligibleCattle.map(c => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <div><span className="muted" style={{ fontSize: 11, marginRight: 6 }}>CATTLE</span><strong>{c.ear_tag}</strong>{c.identity_number && <span className="muted" style={{ marginLeft: 6 }}>{c.identity_number}</span>}<span className="muted" style={{ marginLeft: 6 }}>{c.owner}</span></div>
                <button className="primary" style={{ fontSize: 12 }} onClick={() => addTransfer(c, 'cattle')}>Add to tracker</button>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Transfer records */}
      <div className="stack" style={{ gap: 12 }}>

        {/* All transfers — collapsible */}
        <div className="card" style={{ padding: 0 }}>
          <div onClick={() => setAllOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>All transfers</h2>
            <div className="row" style={{ gap: 12 }}>
              <span className="muted">{filteredTransfers.length} total · {filteredTransfers.filter(t => t.invoice_status === 'pending').length} pending · {filteredTransfers.filter(t => t.invoice_status === 'invoiced').length} invoiced</span>
              <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: allOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
            </div>
          </div>
          {allOpen && (
            <div style={{ overflowX: 'auto', borderTop: '1px solid var(--color-border)' }}>
              <table>
                <thead><tr><th>Type</th><th>Owner</th><th>Ear tag</th><th>Identity no.</th><th>Transfer date</th><th style={{ textAlign: 'right' }}>DNA recoverable</th><th>Status</th><th>Invoice no.</th></tr></thead>
                <tbody>
                  {filteredTransfers.map(t => {
                    const dnaCost = transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0
                    return (
                      <tr key={t.id}>
                        <td><span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span></td>
                        <td>{t.owner}</td>
                        <td><strong>{t.ear_tag}</strong></td>
                        <td>{t.identity_number || <span className="faint">—</span>}</td>
                        <td>{formatDate(t.transfer_date)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(dnaCost)}</td>
                        <td><span className={`badge ${t.invoice_status === 'invoiced' ? 'success' : 'warning'}`}>{t.invoice_status === 'invoiced' ? 'Invoiced' : 'Pending'}</span></td>
                        <td>{t.invoice_number || <span className="faint">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={5}>Total</td><td style={{ textAlign: 'right' }}>{fmtCurrency(filteredTransfers.reduce((s, t) => s + (transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0), 0))}</td><td colSpan={2}></td></tr></tfoot>
              </table>
            </div>
          )}
        </div>


        {/* Pending — collapsible with checkboxes */}
        <div className="card" style={{ padding: 0 }}>
          <div onClick={(e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') setPendingOpen(v => !v) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Pending</h2>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="muted">{filteredTransfers.filter(t => t.invoice_status === 'pending').length} animals{selectedForInvoice.size > 0 ? ` · ${selectedForInvoice.size} selected` : ''}</span>
              {selectedForInvoice.size > 0 && (
                <button className="primary" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); setShowInvoiceForm(v => !v) }}>
                  {showInvoiceForm ? 'Cancel' : `Invoice ${selectedForInvoice.size}`}
                </button>
              )}

              <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: pendingOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
            </div>
          </div>

          {pendingOpen && (
            <>
            <p className="muted" style={{ fontSize: 12, padding: '0 16px', marginTop: 12 }}>
              Cattle transfers are invoiced automatically when a cattle sale invoice is created (see the Invoices tab). Use this manual form only for DNA cost recovery on animals not covered by a cattle sale invoice.
            </p>
            {/* Invoice form */}
            {showInvoiceForm && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--color-accent-light)', borderRadius: 8 }}>
                <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                  <div><label>Invoice number</label><input style={{ width: 140 }} value={invoiceDetails.number} onChange={e => setInvoiceDetails(f => ({ ...f, number: e.target.value }))} placeholder="e.g. INV-001" /></div>
                  <div><label>Invoice date</label><input type="date" value={invoiceDetails.date} onChange={e => setInvoiceDetails(f => ({ ...f, date: e.target.value }))} /></div>
                  <div><label>Notes</label><input style={{ width: 160 }} value={invoiceDetails.notes} onChange={e => setInvoiceDetails(f => ({ ...f, notes: e.target.value }))} placeholder="optional" /></div>
                  <div>
                    <label>Invoice document</label>
                    <input ref={invoiceFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => setInvoiceFile(e.target.files[0] || null)} />
                    <div className="row" style={{ gap: 6 }}>
                      <button style={{ fontSize: 12 }} onClick={() => invoiceFileRef.current.click()}>{invoiceFile ? invoiceFile.name : 'Upload file'}</button>
                      {invoiceFile && <button className="danger-text" style={{ fontSize: 12 }} onClick={() => setInvoiceFile(null)}>Remove</button>}
                    </div>
                  </div>
                </div>
                <button className="primary" disabled={submitting || !invoiceDetails.number || !invoiceDetails.date} onClick={async () => {
                  setSubmitting(true)
                  const ids = Array.from(selectedForInvoice)
                  await Promise.all(ids.map(id => updateTransfer(id, {
                    invoice_status: 'invoiced',
                    invoice_number: invoiceDetails.number,
                    invoice_date: invoiceDetails.date,
                  })))
                  setSelectedForInvoice(new Set())
                  setShowInvoiceForm(false)
                  setInvoiceDetails({ number: '', date: '', notes: '' })
                  setSubmitting(false)
                }}>
                  Confirm — mark {selectedForInvoice.size} as invoiced
                </button>
              </div>
            )}

          {filteredTransfers.filter(t => t.invoice_status === 'pending').length === 0 ? (
            <p className="muted" style={{ padding: '12px 16px' }}>No pending transfers.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th></th><th>Type</th><th>Owner</th><th>Ear tag</th><th>Identity no.</th><th>Transfer date</th><th style={{ textAlign: 'right' }}>DNA recoverable</th></tr></thead>
                <tbody>
                  {filteredTransfers.filter(t => t.invoice_status === 'pending').map(t => {
                    const dnaCost = transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0
                    return (
                      <tr key={t.id} style={{ background: selectedForInvoice.has(t.id) ? 'var(--color-accent-light)' : undefined }}>
                        <td><input type="checkbox" checked={selectedForInvoice.has(t.id)} onChange={() => setSelectedForInvoice(prev => { const next = new Set(prev); next.has(t.id) ? next.delete(t.id) : next.add(t.id); return next })} style={{ width: 'auto' }} /></td>
                        <td><span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span></td>
                        <td>{t.owner}</td>
                        <td><strong>{t.ear_tag}</strong></td>
                        <td>{t.identity_number || <span className="faint">—</span>}</td>
                        <td>{formatDate(t.transfer_date)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(dnaCost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={6}>Total</td><td style={{ textAlign: 'right' }}>{fmtCurrency(filteredTransfers.filter(t => t.invoice_status === 'pending').reduce((s, t) => s + (transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0), 0))}</td></tr></tfoot>
              </table>
            </div>
          )}
            </>
          )}
        </div>

        {/* Invoiced — collapsible */}
        <div className="card" style={{ padding: 0 }}>
          <div onClick={() => setInvoicedOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Invoiced</h2>
            <div className="row" style={{ gap: 12 }}>
              <span className="muted">{filteredTransfers.filter(t => t.invoice_status === 'invoiced').length} records</span>
              <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: invoicedOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
            </div>
          </div>
          {invoicedOpen && (
            filteredTransfers.filter(t => t.invoice_status === 'invoiced').length === 0 ? (
              <p className="muted" style={{ padding: '0 16px 12px' }}>No invoiced transfers yet.</p>
            ) : (
              <div style={{ overflowX: 'auto', borderTop: '1px solid var(--color-border)' }}>
                <table>
                  <thead><tr><th>Type</th><th>Owner</th><th>Ear tag</th><th>Identity no.</th><th>Transfer date</th><th style={{ textAlign: 'right' }}>DNA recoverable</th><th>Invoice no.</th><th>Invoice date</th><th></th></tr></thead>
                  <tbody>
                    {filteredTransfers.filter(t => t.invoice_status === 'invoiced').map(t => {
                      const dnaCost = transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0
                      return (
                        <tr key={t.id}>
                          <td><span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span></td>
                          <td>{t.owner}</td>
                          <td><strong>{t.ear_tag}</strong></td>
                          <td>{t.identity_number || <span className="faint">—</span>}</td>
                          <td>{formatDate(t.transfer_date)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtCurrency(dnaCost)}</td>
                          <td>{t.invoice_number || <span className="faint">—</span>}</td>
                          <td>{formatDate(t.invoice_date)}</td>
                          <td><button style={{ fontSize: 11 }} onClick={() => updateTransfer(t.id, { invoice_status: 'pending', invoice_number: null, invoice_date: null })}>Revert</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 500, borderTop: '2px solid var(--color-border)' }}><td colSpan={5}>Total</td><td style={{ textAlign: 'right' }}>{fmtCurrency(filteredTransfers.filter(t => t.invoice_status === 'invoiced').reduce((s, t) => s + (transfersWithDna.find(tw => tw.id === t.id)?.dnaCost || 0), 0))}</td><td colSpan={3}></td></tr></tfoot>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function InvoiceFileUpload({ inv, onReload }) {
  const fileRef = useRef()
  const csvRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [csvUploading, setCsvUploading] = useState(false)

  async function handleUpload(e, field, prefix) {
    const file = e.target.files[0]
    if (!file) return
    field === 'invoice' ? setUploading(true) : setCsvUploading(true)
    const path = 'kitai/' + inv.id + '/' + prefix + file.name
    const { error } = await supabase.storage.from('batch-documents').upload(path, file, { upsert: true })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); setCsvUploading(false); return }
    const { data: urlData } = supabase.storage.from('batch-documents').getPublicUrl(path)
    const updates = field === 'invoice'
      ? { invoice_file_name: file.name, invoice_file_url: urlData.publicUrl }
      : { csv_file_name: file.name, csv_file_url: urlData.publicUrl }
    await supabase.from('kitai_sale_invoices').update(updates).eq('id', inv.id)
    setUploading(false); setCsvUploading(false); onReload()
  }

  async function removeFile(field) {
    const updates = field === 'invoice'
      ? { invoice_file_name: null, invoice_file_url: null }
      : { csv_file_name: null, csv_file_url: null }
    await supabase.from('kitai_sale_invoices').update(updates).eq('id', inv.id)
    onReload()
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <label style={{ marginBottom: 4 }}>Invoice document</label>
          {inv.invoice_file_url ? (
            <div className="row">
              <a href={inv.invoice_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {inv.invoice_file_name}</a>
              <button className="danger-text" style={{ fontSize: 12 }} onClick={() => removeFile('invoice')}>Remove</button>
            </div>
          ) : (
            <div className="row">
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => handleUpload(e, 'invoice', '')} />
              <button disabled={uploading} onClick={() => fileRef.current.click()} style={{ fontSize: 13 }}>{uploading ? 'Uploading...' : 'Upload invoice'}</button>
            </div>
          )}
        </div>
        <div>
          <label style={{ marginBottom: 4 }}>Weighbridge / CSV file</label>
          {inv.csv_file_url ? (
            <div className="row">
              <a href={inv.csv_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {inv.csv_file_name}</a>
              <button className="danger-text" style={{ fontSize: 12 }} onClick={() => removeFile('csv')}>Remove</button>
            </div>
          ) : (
            <div className="row">
              <input ref={csvRef} type="file" accept=".csv,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => handleUpload(e, 'csv', 'csv_')} />
              <button disabled={csvUploading} onClick={() => csvRef.current.click()} style={{ fontSize: 13 }}>{csvUploading ? 'Uploading...' : 'Upload CSV/file'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DnaInvoiceFileUpload({ inv, onReload }) {
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const path = 'kitai-dna/' + inv.id + '/' + file.name
    const { error } = await supabase.storage.from('batch-documents').upload(path, file, { upsert: true })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('batch-documents').getPublicUrl(path)
    await supabase.from('kitai_dna_invoices').update({ invoice_file_name: file.name, invoice_file_url: urlData.publicUrl }).eq('id', inv.id)
    setUploading(false); onReload()
  }

  async function removeFile() {
    await supabase.from('kitai_dna_invoices').update({ invoice_file_name: null, invoice_file_url: null }).eq('id', inv.id)
    onReload()
  }

  return (
    <div>
      <label style={{ marginBottom: 4 }}>Invoice document</label>
      {inv.invoice_file_url ? (
        <div className="row">
          <a href={inv.invoice_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>📄 {inv.invoice_file_name}</a>
          <button className="danger-text" style={{ fontSize: 12 }} onClick={removeFile}>Remove</button>
        </div>
      ) : (
        <div className="row">
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleUpload} />
          <button disabled={uploading} onClick={() => fileRef.current.click()} style={{ fontSize: 13 }}>{uploading ? 'Uploading...' : 'Upload invoice'}</button>
        </div>
      )}
    </div>
  )
}

// ─── SALE INVOICES TAB ───────────────────────────────────────────────────────
function InvoicesTab({ saleInvoices, transfers, dnaInvoices, getDnaCostByEarTag, search, onReload }) {
  const filteredInvoices = search ? saleInvoices.filter(inv => (inv.animal_summaries||[]).some(s => (s.earTag||"").toLowerCase().includes(search.toLowerCase()) || (s.identityNumber||"").toLowerCase().includes(search.toLowerCase()))) : saleInvoices
  const filteredDnaInvoices = search ? dnaInvoices.filter(di => (di.animal_summaries||[]).some(s => (s.earTag||"").toLowerCase().includes(search.toLowerCase()) || (s.identityNumber||"").toLowerCase().includes(search.toLowerCase()))) : dnaInvoices

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [newInvoice, setNewInvoice] = useState({ date: '', number: '', notes: '' })
  const [newInvoiceFile, setNewInvoiceFile] = useState(null)
  const newInvoiceFileRef = useRef()
  const newCsvFileRef = useRef()
  const [newCsvFile, setNewCsvFile] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState(null)
  const [expandedDnaInvoice, setExpandedDnaInvoice] = useState(null)
  const [dnaOpen, setDnaOpen] = useState(true)
  const [salesOpen, setSalesOpen] = useState(true)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [csvMsg, setCsvMsg] = useState('')
  const [csvNotFound, setCsvNotFound] = useState([])
  const csvFileRef = useRef()

  const invoicedIds = new Set(saleInvoices.flatMap(i => i.animal_ids || []))
  const unsold = transfers.filter(t => !t.sold_flag && !invoicedIds.has(t.id))

  // Summary totals
  const totalSaleInvoices = filteredInvoices.length
  const totalDnaInvoices = filteredDnaInvoices.length
  const totalSaleAnimals = filteredInvoices.reduce((s, i) => s + (i.animal_summaries||[]).length, 0)
  const totalDnaAnimals = filteredDnaInvoices.reduce((s, i) => s + (i.animal_count || 0), 0)

  function toggleSelect(id) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function handleCsvImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setCsvMsg('Reading file...'); setCsvNotFound([])
    const text = await file.text()
    const raw = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l.length > 0)
    if (raw.length < 2) { setCsvMsg('Empty file.'); return }
    const headers = raw[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'))
    const eidIdx = headers.findIndex(h => h === 'eid')
    const dateIdx = headers.findIndex(h => h === 'date')
    if (eidIdx === -1) { setCsvMsg('EID column not found.'); return }

    const csvEarTags = []
    for (let i = 1; i < raw.length; i++) {
      const vals = raw[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const eid = vals[eidIdx]
      if (!eid) continue
      let isNum = true
      for (let c = 0; c < eid.length; c++) { if (eid[c] < '0' || eid[c] > '9') { isNum = false; break } }
      if (!isNum) continue
      csvEarTags.push(eid)
    }

    if (csvEarTags.length === 0) { setCsvMsg('No valid EID rows found.'); return }
    setCsvMsg('Matching ' + csvEarTags.length + ' animals to transfers...')

    // Match against existing transfers by ear tag
    const found = transfers.filter(t => csvEarTags.includes(t.ear_tag))
    const foundTags = new Set(found.map(t => t.ear_tag))
    const missing = csvEarTags.filter(tag => !foundTags.has(tag))

    setCsvNotFound(missing)
    // Pre-select found transfers
    setSelectedIds(new Set(found.map(t => t.id)))
    // Auto-set the CSV as the weighbridge attachment
    setNewCsvFile(file)
    setShowForm(true)
    setCsvMsg(found.length + ' matched' + (missing.length > 0 ? ', ' + missing.length + ' not found in transfer records' : '') + '. CSV file will be attached to the invoice.')
    e.target.value = ''
  }

  async function createInvoice() {
    if (selectedIds.size === 0) { setCreateMsg('Select at least one animal.'); return }
    setCreating(true); setCreateMsg('Creating...')
    const selected = transfers.filter(t => selectedIds.has(t.id))
    const { data: inserted, error } = await supabase.from('kitai_sale_invoices').insert({
      invoice_date: newInvoice.date || null, invoice_number: newInvoice.number || null,
      notes: newInvoice.notes || null, animal_ids: Array.from(selectedIds),
      animal_summaries: selected.map(t => ({ id: t.id, earTag: t.ear_tag, identityNumber: t.identity_number, owner: t.owner, animalType: t.animal_type })),
    }).select().single()
    if (error) { setCreateMsg('Failed: ' + error.message); setCreating(false); return }

    // Auto-flag sold: mark these transfers sold, and flag the underlying Cattle Register
    // records as sold too (animal_type 'cattle' transfers carry animal_id = cattle_register.id).
    await Promise.all(selected.map(t => supabase.from('kitai_transfers').update({ sold_flag: true }).eq('id', t.id)))
    const cattleIds = selected.filter(t => t.animal_type === 'cattle' && t.animal_id).map(t => t.animal_id)
    if (cattleIds.length > 0) {
      await supabase.from('cattle_register').update({ transfer_type: 'sold' }).in('id', cattleIds)
    }

    // Auto-generate the linked DNA cost recovery invoice (matched by ear tag / identity number,
    // cost pulled from the DNA cost recovery sub-tab's batch lookup). Status starts 'pending';
    // invoice number is left blank for the user to fill in later.
    const dnaSummaries = selected.map(t => {
      const cost = parseFloat(t.dna_cost_recoverable) || getDnaCostByEarTag(t.ear_tag) || 0
      return { id: t.id, earTag: t.ear_tag, identityNumber: t.identity_number, owner: t.owner, animalType: t.animal_type, dnaCost: cost }
    })
    const dnaTotal = dnaSummaries.reduce((s, d) => s + d.dnaCost, 0)
    const { data: dnaInserted, error: dnaError } = await supabase.from('kitai_dna_invoices').insert({
      sale_invoice_id: inserted.id,
      status: 'pending',
      invoice_date: newInvoice.date || null,
      animal_count: selected.length,
      total_amount: dnaTotal,
      animal_summaries: dnaSummaries,
    }).select().single()
    if (!dnaError && dnaInserted) {
      await Promise.all(selected.map(t => supabase.from('kitai_transfers').update({
        invoice_status: 'invoiced', dna_invoice_id: dnaInserted.id,
      }).eq('id', t.id)))
    }

    if (inserted && newInvoiceFile) {
      const path = 'kitai/' + inserted.id + '/' + newInvoiceFile.name
      const { error: upErr } = await supabase.storage.from('batch-documents').upload(path, newInvoiceFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('batch-documents').getPublicUrl(path)
        await supabase.from('kitai_sale_invoices').update({ invoice_file_name: newInvoiceFile.name, invoice_file_url: urlData.publicUrl }).eq('id', inserted.id)
      }
    }
    if (inserted && newCsvFile) {
      const csvPath = 'kitai/' + inserted.id + '/csv_' + newCsvFile.name
      const { error: csvErr } = await supabase.storage.from('batch-documents').upload(csvPath, newCsvFile, { upsert: true })
      if (!csvErr) {
        const { data: csvUrl } = supabase.storage.from('batch-documents').getPublicUrl(csvPath)
        await supabase.from('kitai_sale_invoices').update({ csv_file_name: newCsvFile.name, csv_file_url: csvUrl.publicUrl }).eq('id', inserted.id)
      }
    }
    setCreateMsg('Invoice created.')
    setSelectedIds(new Set()); setNewInvoice({ date: '', number: '', notes: '' }); setNewInvoiceFile(null); setNewCsvFile(null); setShowForm(false)
    onReload(); setTimeout(() => setCreateMsg(''), 2500); setCreating(false)
  }

  async function updateInvoice(id, updates) { await supabase.from('kitai_sale_invoices').update(updates).eq('id', id); onReload() }
  async function deleteInvoice(id) { await supabase.from('kitai_sale_invoices').delete().eq('id', id); onReload() }

  // DNA invoice updates auto-drive status: pending -> payment_outstanding once an invoice
  // number is entered, then -> paid once a payment date is entered.
  async function updateDnaInvoice(id, updates) {
    const inv = dnaInvoices.find(d => d.id === id)
    const merged = { ...inv, ...updates }
    if (merged.payment_date) updates.status = 'paid'
    else if (merged.invoice_number) updates.status = 'payment_outstanding'
    else updates.status = 'pending'
    await supabase.from('kitai_dna_invoices').update(updates).eq('id', id)
    onReload()
  }
  async function deleteDnaInvoice(id) {
    await supabase.from('kitai_transfers').update({ invoice_status: 'pending', dna_invoice_id: null }).eq('dna_invoice_id', id)
    await supabase.from('kitai_dna_invoices').delete().eq('id', id)
    onReload()
  }

  return (
    <div className="stack" style={{ gap: 16 }}>

      {/* Summary */}
      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 500 }}>Summary</h2>
        <div className="muted" style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DNA cost recovery</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Invoices</div><div style={{ fontSize: 28, fontWeight: 500 }}>{totalDnaInvoices}</div><div className="muted" style={{ fontSize: 11 }}>{totalDnaAnimals} animals</div></div>
        </div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cattle sales</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Total invoices</div><div style={{ fontSize: 28, fontWeight: 500 }}>{totalSaleInvoices}</div><div className="muted" style={{ fontSize: 11 }}>{totalSaleAnimals} animals</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Paid</div><div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-success-text)' }}>{filteredInvoices.filter(i => i.payment_date).length}</div><div className="muted" style={{ fontSize: 11 }}>{filteredInvoices.filter(i => i.payment_date).reduce((s, i) => s + (i.animal_summaries||[]).length, 0)} animals</div></div>
          <div className="card" style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: 12 }}>Outstanding</div><div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-warning-text)' }}>{filteredInvoices.filter(i => !i.payment_date).length}</div><div className="muted" style={{ fontSize: 11 }}>{filteredInvoices.filter(i => !i.payment_date).reduce((s, i) => s + (i.animal_summaries||[]).length, 0)} animals</div></div>
        </div>
      </div>

      {/* DNA Cost Recovery Invoices */}
      <div className="card" style={{ padding: 0 }}>
        <div onClick={() => setDnaOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>DNA cost recovery</h2>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted">{totalDnaInvoices} invoice{totalDnaInvoices !== 1 ? 's' : ''} · {totalDnaAnimals} animals</span>
            <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: dnaOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
          </div>
        </div>
        {dnaOpen && (
          totalDnaInvoices === 0 ? <p className="muted" style={{ padding: '0 16px 12px' }}>No DNA invoices yet. These auto-generate when a cattle sale invoice is created.</p> : (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
              <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                {filteredDnaInvoices.map(di => {
                  const summaries = di.animal_summaries || []
                  const isExpanded = expandedDnaInvoice === di.id
                  const statusLabel = di.status === 'paid' ? 'Paid' : di.status === 'payment_outstanding' ? 'Payment outstanding' : 'Pending'
                  const statusClass = di.status === 'paid' ? 'success' : di.status === 'payment_outstanding' ? 'warning' : ''
                  return (
                    <div key={di.id} className="card" style={{ padding: 0 }}>
                      <div onClick={() => setExpandedDnaInvoice(isExpanded ? null : di.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{di.invoice_number || 'No invoice number yet'} · {di.animal_count} animals</div>
                          <div className="row" style={{ gap: 6 }}>
                            <span className={`badge ${statusClass}`}>{statusLabel}</span>
                            {di.invoice_date && <span className="muted" style={{ fontSize: 12 }}>{formatDate(di.invoice_date)}</span>}
                            <span className="muted" style={{ fontSize: 12 }}>{fmtCurrency(di.total_amount)}</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px 12px', margin: '12px 0' }}>
                            {summaries.map((s, i) => (
                              <div key={s.id || i} className="muted" style={{ fontSize: 12 }}>
                                {i + 1}. {s.earTag} {s.identityNumber ? '// ' + s.identityNumber : ''} — {s.owner} {s.dnaCost ? `(${fmtCurrency(s.dnaCost)})` : ''}
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
                            <div className="row" style={{ flexWrap: 'wrap' }}>
                              <div><label>Invoice date</label><input type="date" defaultValue={di.invoice_date || ''} onBlur={e => updateDnaInvoice(di.id, { invoice_date: e.target.value || null })} /></div>
                              <div><label>Invoice number</label><input style={{ width: 140 }} defaultValue={di.invoice_number || ''} onBlur={e => updateDnaInvoice(di.id, { invoice_number: e.target.value || null })} placeholder="e.g. DNA-001" /></div>
                              <div><label>Payment date</label><input type="date" defaultValue={di.payment_date || ''} onBlur={e => updateDnaInvoice(di.id, { payment_date: e.target.value || null })} /></div>
                            </div>
                          </div>
                          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginBottom: 8 }}>
                            <DnaInvoiceFileUpload inv={di} onReload={onReload} />
                          </div>
                          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                            <button className="danger-text" onClick={() => deleteDnaInvoice(di.id)}>Delete invoice</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* Cattle Sales Invoices */}
      <div className="card" style={{ padding: 0 }}>
        <div onClick={() => setSalesOpen(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Cattle sales</h2>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted">{totalSaleInvoices} invoice{totalSaleInvoices !== 1 ? 's' : ''} · {totalSaleAnimals} animals</span>
            <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: salesOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
          </div>
        </div>
        {salesOpen && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
            {/* New invoice form */}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: showForm ? 12 : 0 }}>
              <span className="muted" style={{ fontSize: 13 }}>{unsold.length} animals available to invoice</span>
              <div className="row" style={{ gap: 6 }}>
                <input ref={csvFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvImport} />
                <button style={{ fontSize: 12 }} onClick={() => { setShowForm(true); csvFileRef.current.click() }}>Import from CSV</button>
                <button onClick={() => { setShowForm(v => !v); setCsvMsg(''); setCsvNotFound([]) }}>{showForm ? 'Cancel' : 'New sale invoice'}</button>
              </div>
            </div>
            {csvMsg && <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>{csvMsg}</p>}
            {csvNotFound.length > 0 && (
              <div style={{ padding: 10, background: 'var(--color-danger-bg)', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-danger-text)', marginBottom: 4 }}>⚠ {csvNotFound.length} ear tag{csvNotFound.length !== 1 ? 's' : ''} not found in transfer records:</div>
                <div className="muted" style={{ fontSize: 12 }}>{csvNotFound.join(', ')}</div>
              </div>
            )}
            {showForm && (
              <>
                <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                  <div><label>Invoice date</label><input type="date" value={newInvoice.date} onChange={e => setNewInvoice(f => ({ ...f, date: e.target.value }))} /></div>
                  <div><label>Invoice number</label><input style={{ width: 140 }} value={newInvoice.number} onChange={e => setNewInvoice(f => ({ ...f, number: e.target.value }))} placeholder="e.g. KIT-001" /></div>
                  <div><label>Notes</label><input style={{ width: 160 }} value={newInvoice.notes} onChange={e => setNewInvoice(f => ({ ...f, notes: e.target.value }))} placeholder="optional" /></div>
                  <div>
                    <label>Invoice document</label>
                    <input ref={newInvoiceFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => setNewInvoiceFile(e.target.files[0] || null)} />
                    <div className="row" style={{ gap: 6 }}>
                      <button style={{ fontSize: 12 }} onClick={() => newInvoiceFileRef.current.click()}>{newInvoiceFile ? newInvoiceFile.name : 'Upload invoice'}</button>
                      {newInvoiceFile && <button className="danger-text" style={{ fontSize: 12 }} onClick={() => setNewInvoiceFile(null)}>✕</button>}
                    </div>
                  </div>
                  <div>
                    <label>Weighbridge / CSV file</label>
                    <input ref={newCsvFileRef} type="file" accept=".csv,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => setNewCsvFile(e.target.files[0] || null)} />
                    <div className="row" style={{ gap: 6 }}>
                      <button style={{ fontSize: 12 }} onClick={() => newCsvFileRef.current.click()}>{newCsvFile ? newCsvFile.name : 'Upload CSV/file'}</button>
                      {newCsvFile && <button className="danger-text" style={{ fontSize: 12 }} onClick={() => setNewCsvFile(null)}>✕</button>}
                    </div>
                  </div>
                </div>
                {unsold.length === 0 ? <p className="muted">No animals available.</p> : (
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

            {/* Invoice list */}
            {filteredInvoices.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No sale invoices yet.</p> : (
              <div className="stack" style={{ marginTop: 12 }}>
                {filteredInvoices.map(inv => {
                  const summaries = inv.animal_summaries || []
                  const isPaid = !!inv.payment_date
                  const isExpanded = expandedInvoice === inv.id
                  const invoiceTransfers = transfers.filter(t => (inv.animal_ids || []).includes(t.id))
                  return (
                    <div key={inv.id} className="card" style={{ padding: 0 }}>
                      <div onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '12px 16px', userSelect: 'none' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{inv.invoice_number || 'No invoice number'} · {summaries.length} animals</div>
                          <div className="row" style={{ gap: 6 }}>
                            <span className={`badge ${isPaid ? 'success' : 'warning'}`}>{isPaid ? 'Paid' : 'Payment pending'}</span>
                            {inv.invoice_date && <span className="muted" style={{ fontSize: 12 }}>{formatDate(inv.invoice_date)}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--color-text-muted)', display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
                          <div style={{ marginTop: 12, marginBottom: 8 }}>
                            <span className="badge success">Sold (auto-flagged on invoice creation)</span>
                          </div>
                          <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
                            {invoiceTransfers.map(t => (
                              <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background-secondary)', borderRadius: 6 }}>
                                <div className="row" style={{ gap: 8 }}><span className="muted" style={{ fontSize: 11 }}>{t.animal_type?.toUpperCase()}</span><strong>{t.ear_tag}</strong>{t.identity_number && <span className="muted">{t.identity_number}</span>}<span className="muted">{t.owner}</span></div>
                                <div className="row" style={{ gap: 6 }}>
                                  <span className="badge success" style={{ fontSize: 11 }}>Sold</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                            <div className="row" style={{ flexWrap: 'wrap' }}>
                              <div><label>Invoice date</label><input type="date" defaultValue={inv.invoice_date || ''} onBlur={e => updateInvoice(inv.id, { invoice_date: e.target.value || null })} /></div>
                              <div><label>Invoice number</label><input style={{ width: 140 }} defaultValue={inv.invoice_number || ''} onBlur={e => updateInvoice(inv.id, { invoice_number: e.target.value || null })} /></div>
                              <div><label>Payment date</label><input type="date" defaultValue={inv.payment_date || ''} onBlur={e => updateInvoice(inv.id, { payment_date: e.target.value || null })} /></div>
                            </div>
                          </div>
                          <InvoiceFileUpload inv={inv} onReload={onReload} />
                          <div style={{ marginTop: 8 }}>
                            <button className="danger-text" onClick={() => deleteInvoice(inv.id)}>Delete invoice</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


