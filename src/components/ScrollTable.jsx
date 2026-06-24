import { useRef } from 'react'

export default function ScrollTable({ children }) {
  const ref = useRef(null)
  const scroll = (dx) => ref.current?.scrollBy({ left: dx, behavior: 'smooth' })
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button onClick={() => scroll(-250)} style={{ fontSize: 11, padding: '2px 8px' }} title="Scroll left">◄</button>
        <button onClick={() => scroll(250)} style={{ fontSize: 11, padding: '2px 8px' }} title="Scroll right">►</button>
      </div>
      <div ref={ref} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
