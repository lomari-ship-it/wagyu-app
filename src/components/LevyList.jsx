import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LevyList({ search = '' }) {
  const [levyText, setLevyText] = useState('')
  const [levyRecords, setLevyRecords] = useState([])
  const [calves, setCalves] = useState([])
  const [statusMsg, setStatusMsg] = useState('')
  const [includeSold, setIncludeSold] = useState(false)
  const [reconciled, setReconciled] = useState(false)

  useEffect(() => {
    supabase.from('calves').select('id, owner, ear_tag, identity_number, birth_date, sold_flag').then(({ data }) => {
      setCalves(data || [])
    })
    supabase.from('levy_list_records').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data && data.length > 0) {
        setLevyRecords(data)
        setReconciled(true)
        setStatusMsg(`Showing saved Levy List (${data.length} entries).`)
      }
    })
  }, [])

  function parseLevyText(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const records = []
    for (const line of lines) {
      const parts = line.split(/\t+/).map((p) => p.trim())
      if (parts.length < 1 || parts[0].toLowerCase().includes('ident')) continue
      records.push({
        ident: parts[0],
        dob: parts[1] || null,
        mother_ident: parts[2] || null,
        father_ident: parts[3] || null,
        computer_number: parts[4] || null,
      })
    }
    return records
  }

  async function reconcile() {
    const records = parseLevyText(levyText)
    if (records.length === 0) {
      setStatusMsg('No records found. Check the format.')
      return
    }
    await supabase.from('levy_list_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await supabase.from('levy_list_records').insert(
      records.map((r) => ({ ...r, report_date: new Date().toISOString().slice(0, 10) }))
    )
    if (error) {
      setStatusMsg('Save failed: ' + error.message)
      return
    }
    setLevyRecords(records)
    setReconciled(true)
    setStatusMsg(`Reconciled ${records.length} Levy List entries.`)
  }

  const baseCalves = includeSold ? calves : calves.filter((c) => !c.sold_flag)
  const activeCalves = !search ? baseCalves : baseCalves.filter((c) =>
    (c.ear_tag || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.identity_number || '').toLowerCase().includes(search.toLowerCase())
  )
  const levyIdents = new Set(levyRecords.map((r) => (r.ident || '').toUpperCase()))
  const calfIdents = new Set(activeCalves.filter((c) => c.identity_number).map((c) => c.identity_number.toUpperCase()))

  const confirmed = activeCalves.filter((c) => c.identity_number && levyIdents.has(c.identity_number.toUpperCase()))
  const notListed = activeCalves.filter((c) => !c.identity_number || !levyIdents.has(c.identity_number.toUpperCase()))
  const unmatched = levyRecords.filter((r) => !calfIdents.has((r.ident || '').toUpperCase()))
  const soldCount = calves.filter((c) => c.sold_flag).length

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card">
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500 }}>Levy List upload</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Paste extracted Levy List data below (tab-separated: Ident, DOB, Mother, Father, Computer Number) then click Reconcile.</p>
        <textarea
          rows={6}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          value={levyText}
          onChange={(e) => setLevyText(e.target.value)}
          placeholder={'26-1001JFW\t01/02/26\t21-0002NW\t\t4043719121\n26-1030JFW\t20/02/26\t\tJFW26MULT00\t4043718883'}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={reconcile} disabled={!levyText.trim()}>Reconcile</button>
          <span className="muted">{statusMsg}</span>
        </div>
      </div>

      {reconciled && (
        <>
          {!includeSold && soldCount > 0 && (
            <p className="muted" style={{ fontSize: 12 }}>{soldCount} sold/transferred calf{soldCount !== 1 ? 'ves' : ''} excluded.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Levy List entries</div>
              <div style={{ fontSize: 28, fontWeight: 500 }}>{levyRecords.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Confirmed</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-success-text)' }}>{confirmed.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Not yet listed</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-warning-text)' }}>{notListed.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>Not in our records</div>
              <div style={{ fontSize: 28, fontWeight: 500 }}>{unmatched.length}</div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} style={{ width: 'auto' }} />
            Include sold/transferred calves
          </label>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Our calves — Levy List status</h3>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Ear tag</th>
                    <th>Identity number</th>
                    <th>Birth date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalves.map((c) => {
                    const isConfirmed = c.identity_number && levyIdents.has(c.identity_number.toUpperCase())
                    return (
                      <tr key={c.id} style={{ opacity: c.sold_flag ? 0.6 : 1 }}>
                        <td>{c.owner}</td>
                        <td><strong>{c.ear_tag}</strong>{c.sold_flag && <span className="faint" style={{ fontSize: 11 }}> (sold)</span>}</td>
                        <td>{c.identity_number || <span className="faint">—</span>}</td>
                        <td>{c.birth_date}</td>
                        <td>
                          <span className={`badge ${isConfirmed ? 'success' : 'warning'}`}>
                            {isConfirmed ? 'Confirmed' : (c.identity_number ? 'Not yet listed' : 'No ID')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {unmatched.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500 }}>Levy List entries not in our records</h3>
              <p className="muted" style={{ marginBottom: 8 }}>Older animals, other owners, or calves not yet entered.</p>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ident</th>
                      <th>DOB</th>
                      <th>Mother</th>
                      <th>Father</th>
                      <th>Computer number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((r, i) => (
                      <tr key={i}>
                        <td><strong>{r.ident}</strong></td>
                        <td>{r.dob || <span className="faint">—</span>}</td>
                        <td>{r.mother_ident || <span className="faint">—</span>}</td>
                        <td>{r.father_ident || <span className="faint">—</span>}</td>
                        <td>{r.computer_number || <span className="faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
