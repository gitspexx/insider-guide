import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AdminSubscribers() {
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('created_at', { ascending: false })
      setSubscribers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function exportCSV() {
    const headers = ['Email', 'Country', 'Source', 'Date']
    const rows = subscribers.map((s) => [
      s.email,
      s.country_slug || '',
      s.source || '',
      new Date(s.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subscribers.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Dashboard
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
              <span className="text-gold text-sm tracking-wider">Subscribers</span>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-[10px] text-text-dim uppercase tracking-wider">
              {subscribers.length} total
            </span>
            <button
              onClick={exportCSV}
              className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-bg-card border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-dim">
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Country</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id} className="border-b border-border last:border-b-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-body text-xs">{sub.email}</td>
                  <td className="px-4 py-3 text-text-dim text-xs uppercase tracking-wider">{sub.country_slug || '—'}</td>
                  <td className="px-4 py-3 text-text-dim text-xs">{sub.source || '—'}</td>
                  <td className="px-4 py-3 text-text-dim text-xs">{new Date(sub.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {subscribers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-dim text-sm">
                    No subscribers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
