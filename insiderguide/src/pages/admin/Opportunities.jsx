import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const SCORE_COLORS = {
  hot: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'HOT' },
  warm: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'WARM' },
  low: { bg: 'bg-text-dim/10', text: 'text-text-dim', label: 'LOW' },
}

function getScoreTier(biz) {
  let score = 0
  if (!biz.website) score += 35
  if (!biz.email) score += 10
  if (!biz.instagram_handle) score += 10
  // Can't check rating/reviews from businesses table — approximate
  score += 15 // assume low reviews for most scraped businesses
  if (!biz.website && (biz.whatsapp || biz.email)) score += 10
  return { score: Math.min(score, 100), tier: score >= 50 ? 'hot' : score >= 30 ? 'warm' : 'low' }
}

export default function Opportunities() {
  const [businesses, setBusinesses] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTier, setFilterTier] = useState('hot')
  const [filterCountry, setFilterCountry] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [stats, setStats] = useState({ hot: 0, warm: 0, low: 0, total: 0, noWebsite: 0, noEmail: 0 })

  useEffect(() => {
    async function load() {
      // Get all countries
      const { data: countryData } = await supabase
        .from('countries')
        .select('id, name, slug')
        .order('name')
      setCountries(countryData || [])

      // Get all businesses (paginated)
      let allBiz = []
      let offset = 0
      while (true) {
        const { data } = await supabase
          .from('businesses')
          .select('id, name, category, city, website, email, instagram_handle, whatsapp, google_maps_url, country_id')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allBiz = allBiz.concat(data)
        if (data.length < 1000) break
        offset += 1000
      }

      // Score each
      const scored = allBiz.map(b => {
        const { score, tier } = getScoreTier(b)
        return { ...b, opp_score: score, opp_tier: tier }
      })

      // Stats
      const s = { hot: 0, warm: 0, low: 0, total: scored.length, noWebsite: 0, noEmail: 0 }
      scored.forEach(b => {
        s[b.opp_tier]++
        if (!b.website) s.noWebsite++
        if (!b.email) s.noEmail++
      })
      setStats(s)
      setBusinesses(scored)
      setLoading(false)
    }
    load()
  }, [])

  // Filters
  const filtered = businesses.filter(b => {
    if (filterTier !== 'all' && b.opp_tier !== filterTier) return false
    if (filterCountry !== 'all' && b.country_id !== filterCountry) return false
    if (filterCategory !== 'all' && b.category !== filterCategory) return false
    return true
  })

  // Unique categories
  const categories = [...new Set(businesses.map(b => b.category).filter(Boolean))].sort()

  // Country name map
  const countryMap = Object.fromEntries((countries || []).map(c => [c.id, c.name]))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-sm">Analyzing opportunities...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              &larr; Dashboard
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-gold text-sm tracking-wider">Opportunities</span>
              <span className="text-[9px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-bold">
                {stats.hot} HOT
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-gold block">{stats.total.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Total</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-red-400 block">{stats.hot.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Hot (50+)</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-yellow-400 block">{stats.warm.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Warm (30+)</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-text-dim block">{stats.low.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Low</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-orange-400 block">{stats.noWebsite.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">No Website</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-blue-400 block">{stats.noEmail.toLocaleString()}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">No Email</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['all', 'hot', 'warm', 'low'].map(tier => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                filterTier === tier
                  ? tier === 'hot' ? 'bg-red-500/15 border-red-500/40 text-red-400'
                    : tier === 'warm' ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
                    : tier === 'all' ? 'bg-gold/15 border-gold/40 text-gold'
                    : 'bg-text-dim/10 border-border text-text-dim'
                  : 'border-border text-text-dim hover:border-border'
              }`}
            >
              {tier === 'all' ? `All (${stats.total})` : `${tier} (${stats[tier]})`}
            </button>
          ))}

          <span className="w-px h-6 bg-border self-center" />

          <select
            value={filterCountry}
            onChange={e => setFilterCountry(e.target.value)}
            className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-border bg-bg-card text-text-dim cursor-pointer"
          >
            <option value="all">All Countries</option>
            {countries.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-border bg-bg-card text-text-dim cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <p className="text-sm text-text-dim mb-4">
          <strong className="text-white">HOT</strong> = no website + low reviews (perfect for website offer).
          <strong className="text-white ml-2">WARM</strong> = missing some digital presence.
        </p>

        {/* Results table */}
        <div className="bg-bg-card border border-border rounded-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_100px_80px_80px_60px] gap-2 px-4 py-2 border-b border-border text-[9px] text-text-dim uppercase tracking-wider">
            <span>Business</span>
            <span>Category</span>
            <span>City</span>
            <span>Website</span>
            <span>Email</span>
            <span>Score</span>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {filtered.slice(0, 200).map(biz => {
              const sc = SCORE_COLORS[biz.opp_tier]
              return (
                <div
                  key={biz.id}
                  className="grid grid-cols-[1fr_100px_100px_80px_80px_60px] gap-2 px-4 py-2.5 border-b border-border items-center hover:bg-bg-elevated transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-white block truncate">{biz.name}</span>
                    <span className="text-[9px] text-text-dim">{countryMap[biz.country_id] || ''}</span>
                  </div>
                  <span className="text-[10px] text-text-dim uppercase">{biz.category}</span>
                  <span className="text-[10px] text-text-dim truncate">{biz.city}</span>
                  <span className={`text-[9px] ${biz.website ? 'text-green-400' : 'text-red-400'}`}>
                    {biz.website ? 'Yes' : 'No'}
                  </span>
                  <span className={`text-[9px] ${biz.email ? 'text-green-400' : 'text-text-dim'}`}>
                    {biz.email ? 'Yes' : 'No'}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                    {biz.opp_score}
                  </span>
                </div>
              )
            })}
          </div>

          {filtered.length > 200 && (
            <div className="px-4 py-3 text-center text-[10px] text-text-dim border-t border-border">
              Showing 200 of {filtered.length.toLocaleString()} results
            </div>
          )}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-text-dim text-sm">
              No businesses match current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
