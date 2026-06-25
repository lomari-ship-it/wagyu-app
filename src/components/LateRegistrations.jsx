import { useEffect, useState, useRef } from 'react'
import { supabase, OWNERS } from '../lib/supabase'
import ScrollTable from './ScrollTable'


function formatDate(d) { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }




const BUCKET = 'batch-documents'


function daysBetween(birthDate, submissionDate) {
  if (!birthDate || !submissionDate) return null
  const d1 = new Date(birthDate)
  const d2 = new Date(submissionDate)
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24))
}


function LateTag({ days }) {
  if (days === null) return null
  if (days > 180) return <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>Very late ({days}d)</span>
  if (days > 90) return <span className="badge warning">Late ({days}d)</span>
  return null
}


function fmtCurrency(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return 'N$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


export default function LateRegistrations({ search: parentSearch = '', onSearchChange }) {
  const [batches, setBatches] = useState([])
  const [calves, setCalves] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCalfIds, setSelectedCalfIds] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
