import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const BUCKET = 'batch-documents'

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fyLabel(startYear) { return `${startYear}/${startYear + 1}` }
function fyStartDate(y) { return `${y}-07-01` }

function getCurrentFY() {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

function animalsForYear(calves, breedingAnimals, fyStartYear) {
  const cutoff = fyStartDate(fyStartYear)
  const includeKW = fyStartYear >= 2026
  const fyCalves = calves.filter(c => {
    if (!c.birth_date || c.birth_date >= cutoff) return false
    if (fyStartYear === 2023) {
      const id = (c.identity_number || '').toUpperCase()
      return id.includes('ISA')
    }
    const id = (c.identity_number || '').toUpperCase()
    return id.includes('ISA') || (includeKW && id.includes('KW'))
  })
  const fyBreeding = breedingAnimals.filter(b => b.purchase_date && b.purchase_date < cutoff)
  return { calves: fyCalves, breeding: fyBreeding, total: fyCalves.length + fyBreeding.length }
}

function PdfUpload({ year, existingPdf, onUpdate }) {
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const path = `levy-list/${year.replace('/', '-')}-${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (upErr) { alert('Upload failed: ' + upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    if (existingPdf) {
      await supabase.from('levy_list_pdfs').update({ file_name: file.name, file_url: urlData.publicUrl }).eq('id', existingPdf.id)
    } else {
      await supabase.from('levy_list_pdfs').insert({ financial_year: year, file_name: file.name, file_url: urlData.publicUrl })
    }
    setUploading(false)
    onUpdate()
    e.target.value = ''
  }

  async function removePdf() {
    if (!existingPdf || !window.confirm('Remove this levy list PDF?')) return
    await supabase.from('levy_list_pdfs').delete().eq('id', existingPdf.id)
    onUpdate()
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      <span style={{ fontWeight: 500, fontSize: 13 }}>NSBA Levy List PDF:</span>
      {existingPdf ? (
        <>
          <a href={existingPdf.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            📄 {existingPdf.file_name}
          </a>
          <button onClick={removePdf} className="danger-text" style={{ fontSize: 12 }}>Remove</button>
        </>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>No PDF uploaded</span>
      )}
      <label style={{ cursor: 'pointer' }}>
        <span className="button" style={{ fontSize: 12 }}>{uploading ? 'Uploading…' : existingPdf ? 'Replace PDF' : 'Upload PDF'}</span>
        <input ref={inputRef} type="file" accept=".pdf" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </label>
    </div>
  )
}

export default function LevyList({ search = '', onSearchChange }) {
  const [calves, setCalves] = useState([])
  const [breedingAnimals, setBreedingAnimals] = useState([])
  const [pdfsByYear, setPdfsByYear] = useState({})
  const [loading, setLoading] = useState(true)
  const [openYears, setOpenYears] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cData }, { data: bData }, { data: pData }] = await Promise.all([
      supabase.from('calves').select('id,owner,ear_tag,identity_number,birth_date,sold_flag,namlits_ownership'),
      supabase.from('cattle_register').select('id,owner,ear_tag,identity_number,purchase_date,namlits_ownership,breed').eq('animal_type', 'breeding'),
      supabase.from('levy_list_pdfs').select('*'),
    ])
    setCalves(cData || [])
    setBreedingAnimals(bData || [])
    const map = {}
    ;(pData || []).forEach(p => { map[p.financial_year] = p })
    setPdfsByYear(map)
    setLoading(false)
  }

  const currentFY = getCurrentFY()
  const fyYears = []
  for (let y = currentFY; y >= 2023; y--) fyYears.push(y)

  function toggle(label) { setOpenYears(s => ({ ...s, [label]: !s[label] })) }

  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>

  const th = { textAlign: 'left', padding: '6px 8px 6px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const td = { padding: '8px 8px 8px 0', verticalAlign: 'top' }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <input type="text" placeholder="Search ear tag, identity no., owner…" value={search} onChange={e => onSearchChange && onSearchChange(e.target.value)} style={{ width: '100%' }} />
      </div>

      {fyYears.map(fyYear => {
        const label = fyLabel(fyYear)
        const { calves: fyCalves, breeding: fyBreeding, total } = animalsForYear(calves, breedingAnimals, fyYear)
        const open = openYears[label] === true
        const q = (search || '').toLowerCase()
        const filteredCalves = q ? fyCalves.filter(c => (c.ear_tag||'').toLowerCase().includes(q) || (c.identity_number||'').toLowerCase().includes(q) || (c.owner||'').toLowerCase().includes(q)) : fyCalves
        const filteredBreeding = q ? fyBreeding.filter(b => (b.ear_tag||'').toLowerCase().includes(q) || (b.identity_number||'').toLowerCase().includes(q) || (b.owner||'').toLowerCase().includes(q)) : fyBreeding

        return (
          <div key={label} className="card" style={{ padding: 0 }}>
            <div onClick={() => toggle(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '14px 16px', userSelect: 'none' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Levy Year — {label}</h3>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{fyStartDate(fyYear).split('-').reverse().join('/')} – {`${fyYear + 1}-06-30`.split('-').reverse().join('/')}</div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="muted">{total} animals</span>
                <span style={{ fontSize: 18, color: 'var(--color-text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>&#8964;</span>
              </div>
            </div>
            {open && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: '0 16px 16px' }}>
                <PdfUpload year={label} existingPdf={pdfsByYear[label] || null} onUpdate={loadAll} />
                {filteredCalves.length > 0 && (<><div style={{ fontWeight: 500, fontSize: 13, margin: '16px 0 8px', color: 'var(--color-text-muted)' }}>Registered calves ({filteredCalves.length})</div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}><th style={th}>Owner</th><th style={th}>Ear tag</th><th style={th}>Identity no.</th><th style={th}>DOB</th><th style={th}>Namlits</th><th style={th}>Status</th></tr></thead><tbody>{filteredCalves.map(c => (<tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={td}>{c.owner}</td><td style={td}><strong>{c.ear_tag}</strong></td><td style={td}>{c.identity_number || <span className="faint">—</span>}</td><td style={td}>{fmtDate(c.birth_date)}</td><td style={td}><span className="muted" style={{ fontSize: 11 }}>{c.namlits_ownership || '—'}</span></td><td style={td}>{c.sold_flag ? <span className="badge neutral" style={{ fontSize: 11 }}>Sold</span> : <span className="badge success" style={{ fontSize: 11 }}>Active</span>}</td></tr>))}</tbody></table></div></>)}
                {filteredBreeding.length > 0 && (<><div style={{ fontWeight: 500, fontSize: 13, margin: '16px 0 8px', color: 'var(--color-text-muted)' }}>Breeding animals ({filteredBreeding.length})</div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}><th style={th}>Owner</th><th style={th}>Ear tag</th><th style={th}>Identity no.</th><th style={th}>Purchase date</th><th style={th}>Namlits</th></tr></thead><tbody>{filteredBreeding.map(b => (<tr key={b.id} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={td}>{b.owner}</td><td style={td}><strong>{b.ear_tag}</strong></td><td style={td}>{b.identity_number || <span className="faint">—</span>}</td><td style={td}>{fmtDate(b.purchase_date)}</td><td style={td}><span className="muted" style={{ fontSize: 11 }}>{b.namlits_ownership || '—'}</span></td></tr>))}</tbody></table></div></>)}
                {filteredCalves.length === 0 && filteredBreeding.length === 0 && (<p className="muted" style={{ margin: '16px 0 0' }}>{q ? 'No matches.' : 'No animals for this financial year yet.'}</p>)}
                <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--color-bg-subtle)', borderRadius: 6, display: 'flex', gap: 24 }}><span><strong>{total}</strong> total</span><span className="muted">·</span><span><strong>{filteredCalves.length}</strong> calves</span><span className="muted">·</span><span><strong>{filteredBreeding.length}</strong> breeding</span></div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
