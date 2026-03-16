import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [countries, setCountries] = useState([])
  const [recent, setRecent] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data: allCountries } = await supabase.from('countries').select('*').order('name')
      setCountries(allCountries || [])

      const { data: allBiz } = await supabase.from('businesses').select('id, tier, tier_paid, country_id, name, created_at')

      if (allBiz) {
        setStats({
          total: allBiz.length,
          listed: allBiz.filter((b) => b.tier === 'listed').length,
          featured: allBiz.filter((b) => b.tier === 'featured').length,
          partner: allBiz.filter((b) => b.tier === 'partner').length,
          paid: allBiz.filter((b) => b.tier_paid).length,
          countries: allCountries?.length || 0,
        })
        setRecent(allBiz.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10))
      }
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notion-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      )
      const json = await res.json()
      if (json.ok) {
        const lines = Object.entries(json.summary).map(
          ([slug, s]) => `${slug}: ${s.upserted}/${s.fetched} synced${s.errors.length ? ` (${s.errors.length} errors)` : ''}`
        )
        setSyncResult({ ok: true, text: lines.join(' · ') })
        // Reload stats
        window.location.reload()
      } else {
        setSyncResult({ ok: false, text: json.error || 'Sync failed' })
      }
    } catch (e) {
      setSyncResult({ ok: false, text: e.message })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
            <span className="text-gold text-sm tracking-wider">Dashboard</span>
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50 disabled:cursor-wait cursor-pointer rounded-sm transition-colors"
            >
              {syncing ? 'Syncing…' : '⟳ Notion Sync'}
            </button>
            <Link to="/admin/outreach" className="text-[10px] text-gold uppercase tracking-widest hover:text-gold/80">
              Outreach
            </Link>
            <Link to="/" className="text-[10px] text-text-dim uppercase tracking-widest hover:text-text-secondary">
              View Site
            </Link>
            <Link to="/admin/subscribers" className="text-[10px] text-text-dim uppercase tracking-widest hover:text-text-secondary">
              Subscribers
            </Link>
            <button onClick={handleLogout} className="text-[10px] text-text-dim uppercase tracking-widest hover:text-red-400 cursor-pointer">
              Logout
            </button>
          </div>
        </div>
      </header>

      {syncResult && (
        <div className={`max-w-6xl mx-auto px-4 mt-4`}>
          <div className={`px-4 py-2.5 rounded-sm text-sm ${syncResult.ok ? 'bg-green-900/40 text-green-300 border border-green-700/40' : 'bg-red-900/40 text-red-300 border border-red-700/40'}`}>
            {syncResult.ok ? '✓ ' : '✗ '}{syncResult.text}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Listed', value: stats.listed },
              { label: 'Featured', value: stats.featured },
              { label: 'Partner', value: stats.partner },
              { label: 'Paid', value: stats.paid },
              { label: 'Countries', value: stats.countries },
            ].map((s) => (
              <div key={s.label} className="bg-bg-card border border-border rounded-sm p-4 text-center">
                <span className="font-heading text-2xl text-gold block">{s.value}</span>
                <span className="text-[9px] text-text-dim uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Country Switcher */}
        <div className="mb-8">
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Countries</span>
          <div className="flex flex-wrap gap-2">
            {countries.map((c) => (
              <Link
                key={c.id}
                to={`/admin/${c.slug}`}
                className="flex items-center gap-2 bg-bg-card border border-border rounded-sm px-4 py-3 hover:border-gold/30 transition-colors no-underline"
              >
                <span className="text-lg">{c.flag_emoji}</span>
                <span className="text-sm text-white">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent */}
        <div>
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Recent Businesses</span>
          <div className="bg-bg-card border border-border rounded-sm overflow-hidden">
            {recent.map((biz) => (
              <div key={biz.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
                <span className="text-sm text-white">{biz.name}</span>
                <span className="text-[9px] text-text-dim uppercase tracking-wider">
                  {biz.tier} · {new Date(biz.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
            {recent.length === 0 && (
              <div className="px-4 py-8 text-center text-text-dim text-sm">No businesses yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
