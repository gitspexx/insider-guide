import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { classifyMiscBusinesses } from '../../lib/classifier'

const REGION_ORDER = ['South America', 'Central America', 'Caribbean', 'Europe', 'Asia', 'Middle East', 'Africa']
const VPS_API = 'http://161.97.77.80:8899'
const VPS_KEY = 'spexx-botsol-2026'

export default function MapsLinks() {
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(null)
  const [scraping, setScraping] = useState(null)
  const [syncResult, setSyncResult] = useState({})
  const [bizCounts, setBizCounts] = useState({})
  const [vpsStatus, setVpsStatus] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: countryData } = await supabase
        .from('countries')
        .select('*')
        .order('name')
      setCountries(countryData || [])

      // Get business counts (paginated)
      let allBiz = []
      let offset = 0
      while (true) {
        const { data } = await supabase
          .from('businesses')
          .select('country_id')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allBiz = allBiz.concat(data)
        if (data.length < 1000) break
        offset += 1000
      }
      const counts = {}
      allBiz.forEach(b => { counts[b.country_id] = (counts[b.country_id] || 0) + 1 })
      setBizCounts(counts)
      setLoading(false)
    }
    load()
    fetchVpsStatus()
  }, [])

  async function fetchVpsStatus() {
    try {
      const res = await fetch(`${VPS_API}/status`, {
        headers: { 'X-Api-Key': VPS_KEY },
      })
      if (res.ok) setVpsStatus(await res.json())
      else setVpsStatus({ error: 'offline' })
    } catch {
      setVpsStatus({ error: 'unreachable' })
    }
  }

  async function handleUpdateLink(id, link) {
    await supabase.from('countries').update({ maps_link: link }).eq('id', id)
    setCountries(prev => prev.map(c => c.id === id ? { ...c, maps_link: link } : c))
  }

  async function handleTogglePublished(id, published) {
    await supabase.from('countries').update({ published }).eq('id', id)
    setCountries(prev => prev.map(c => c.id === id ? { ...c, published } : c))
  }

  // ─── Apify Sync (existing — uses Maps list link) ───
  async function handleSync(country) {
    if (!country.maps_link || syncing) return
    setSyncing(country.id)
    setSyncResult(prev => ({ ...prev, [country.id]: null }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-maps-list`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ url: country.maps_link }),
        }
      )

      if (!res.ok) throw new Error(`Scrape failed (${res.status})`)
      const { places } = await res.json()

      const { data: existing } = await supabase
        .from('businesses')
        .select('name, google_maps_url')
        .eq('country_id', country.id)

      const existUrls = new Set((existing || []).map(b => (b.google_maps_url || '').toLowerCase().trim()).filter(Boolean))
      const existNames = new Set((existing || []).map(b => (b.name || '').toLowerCase().trim()).filter(Boolean))

      const newPlaces = places.filter(p => {
        const url = (p.google_maps_url || p.url || '').toLowerCase().trim()
        const name = (p.title || p.name || '').toLowerCase().trim()
        if (!name || name.length < 2) return false
        return !(url && existUrls.has(url)) && !(name && existNames.has(name))
      })

      if (newPlaces.length > 0) {
        for (let i = 0; i < newPlaces.length; i += 10) {
          const batch = newPlaces.slice(i, i + 10)
          const inserts = batch.map(p => {
            const name = p.title || p.name || ''
            const biz = { name, country_id: country.id, city: p.city || '' }
            const result = classifyMiscBusinesses([{ ...biz, category: 'misc' }])[0]
            return {
              name, country_id: country.id,
              category: result?.suggestion?.category || 'misc',
              location: p.address || '', city: p.city || '',
              google_maps_url: p.google_maps_url || p.url || '',
              website: p.website || '', tier: 'listed', published: true,
            }
          })
          await supabase.from('businesses').insert(inserts)
        }
      }

      // Classify remaining misc
      const { data: miscBiz } = await supabase
        .from('businesses')
        .select('id, name, category, description, location, city')
        .eq('country_id', country.id)
        .eq('category', 'misc')
      if (miscBiz && miscBiz.length > 0) {
        const classified = classifyMiscBusinesses(miscBiz)
        for (const { business, suggestion } of classified) {
          if (suggestion) await supabase.from('businesses').update({ category: suggestion.category }).eq('id', business.id)
        }
      }

      // Update counts
      const { data: updatedBiz } = await supabase.from('businesses').select('country_id').eq('country_id', country.id)
      setBizCounts(prev => ({ ...prev, [country.id]: updatedBiz?.length || 0 }))

      setSyncResult(prev => ({ ...prev, [country.id]: { ok: true, scraped: places.length, new: newPlaces.length } }))
    } catch (err) {
      setSyncResult(prev => ({ ...prev, [country.id]: { ok: false, error: err.message } }))
    } finally {
      setSyncing(null)
    }
  }

  // ─── Botsol Deep Scrape (VPS — full keyword expansion) ───
  async function handleDeepScrape(country) {
    if (scraping) return
    setScraping(country.id)
    setSyncResult(prev => ({ ...prev, [country.id]: null }))

    try {
      const res = await fetch(`${VPS_API}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': VPS_KEY },
        body: JSON.stringify({ country: country.slug }),
      })

      if (!res.ok) throw new Error(`VPS error (${res.status})`)
      const data = await res.json()

      setSyncResult(prev => ({
        ...prev,
        [country.id]: { ok: true, message: data.message || `Scrape queued for ${country.name}` }
      }))
    } catch (err) {
      setSyncResult(prev => ({
        ...prev,
        [country.id]: { ok: false, error: `VPS: ${err.message}` }
      }))
    } finally {
      setScraping(null)
    }
  }

  // Group by region
  const byRegion = {}
  countries.forEach(c => {
    const region = c.region || 'Other'
    if (!byRegion[region]) byRegion[region] = []
    byRegion[region].push(c)
  })
  const sortedRegions = Object.keys(byRegion).sort((a, b) => {
    const ai = REGION_ORDER.indexOf(a)
    const bi = REGION_ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  const vpsOnline = vpsStatus && !vpsStatus.error

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-sm">Loading countries...</span>
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
              <span className="text-gold text-sm tracking-wider">Maps Links</span>
              <span className="text-[9px] bg-gold/15 text-gold px-2 py-0.5 rounded-full font-bold">
                {countries.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* VPS Status indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${vpsOnline ? 'bg-green-500' : 'bg-red-500/50'}`} />
              <span className="text-[9px] text-text-dim uppercase tracking-wider">
                Botsol VPS {vpsOnline ? 'Online' : 'Offline'}
              </span>
              {vpsOnline && vpsStatus.current && vpsStatus.state !== 'idle' && (
                <span className="text-[9px] text-gold">
                  {vpsStatus.state}: {vpsStatus.current}
                </span>
              )}
            </div>
            <button
              onClick={fetchVpsStatus}
              className="text-[9px] text-text-dim border border-border px-2 py-1 rounded cursor-pointer hover:border-gold/30 transition-colors"
            >
              Refresh
            </button>
            <div className="text-right">
              <span className="text-[9px] text-text-dim uppercase tracking-wider block">
                {countries.filter(c => c.published).length} published · {countries.filter(c => c.maps_link).length} with maps
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <p className="text-sm text-text-dim mb-4">
          <strong className="text-white">Sync</strong> = Apify (fast, costs CU, uses your Maps list link).
          <strong className="text-white ml-2">Scrape</strong> = Botsol VPS (free, deep keyword search, runs overnight).
        </p>

        {/* Bulk actions */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={async () => {
              const unscraped = countries.filter(c => !bizCounts[c.id] && c.slug)
              if (!unscraped.length) return
              try {
                const res = await fetch(`${VPS_API}/queue`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Api-Key': VPS_KEY },
                  body: JSON.stringify({ countries: unscraped.map(c => c.slug) }),
                })
                if (res.ok) {
                  const data = await res.json()
                  alert(`Queued ${data.queue.length} countries for deep scrape`)
                }
              } catch {
                alert('VPS unreachable')
              }
            }}
            disabled={!vpsOnline}
            className="text-[10px] uppercase tracking-wider px-3 py-1.5 border border-gold/40 text-gold hover:bg-gold/10 rounded-sm cursor-pointer disabled:opacity-30 transition-colors"
          >
            Queue All Unscraped
          </button>
        </div>

        {sortedRegions.map(region => (
          <div key={region} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] text-text-dim uppercase tracking-wider font-bold">{region}</span>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[9px] text-text-dim">{byRegion[region].length}</span>
            </div>

            <div className="space-y-2">
              {byRegion[region].map(country => {
                const result = syncResult[country.id]
                const isSyncing = syncing === country.id
                const isScraping = scraping === country.id
                const count = bizCounts[country.id] || 0

                return (
                  <div
                    key={country.id}
                    className="rounded-lg p-4"
                    style={{ background: 'var(--color-bg-card, #13110F)', border: '1px solid var(--color-border, rgba(237,232,223,0.07))' }}
                  >
                    {/* Top row */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl">{country.flag_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-white block">{country.name}</span>
                        {country.keywords && country.keywords.length > 0 && (
                          <span className="text-[9px] text-text-dim font-mono">
                            Keywords: {country.keywords.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <span className="text-sm font-bold text-gold tabular-nums block">{count}</span>
                          <span className="text-[8px] text-text-dim">places</span>
                        </div>
                        <button
                          onClick={() => handleTogglePublished(country.id, !country.published)}
                          className={`text-[9px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors ${
                            country.published
                              ? 'bg-green-500/15 text-green-400'
                              : 'bg-bg-elevated text-text-dim hover:text-text-secondary'
                          }`}
                        >
                          {country.published ? 'LIVE' : 'OFF'}
                        </button>
                      </div>
                    </div>

                    {/* Maps link + action buttons */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-text-dim font-medium shrink-0 w-14">Maps Link</span>
                      <input
                        type="url"
                        defaultValue={country.maps_link || ''}
                        onBlur={e => {
                          if (e.target.value !== (country.maps_link || '')) {
                            handleUpdateLink(country.id, e.target.value)
                          }
                        }}
                        placeholder="https://maps.app.goo.gl/..."
                        className="flex-1 bg-bg-elevated border border-border rounded-md px-3 py-2 text-xs text-white font-mono focus:border-gold/30 focus:outline-none placeholder:text-text-dim/30"
                      />
                      {country.maps_link && (
                        <>
                          <a
                            href={country.maps_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-gold border border-gold/30 px-2.5 py-2 rounded-md hover:bg-gold/10 transition-colors shrink-0"
                          >
                            Open
                          </a>
                          <button
                            onClick={() => handleSync(country)}
                            disabled={isSyncing}
                            className="text-[9px] font-bold bg-gold text-black px-3 py-2 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-wait transition-colors shrink-0"
                          >
                            {isSyncing ? 'Syncing...' : 'Sync'}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeepScrape(country)}
                        disabled={isScraping || !vpsOnline}
                        className="text-[9px] font-bold bg-blue-600 text-white px-3 py-2 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-wait transition-colors shrink-0"
                        title="Deep scrape via Botsol VPS (free, runs overnight)"
                      >
                        {isScraping ? 'Queued...' : 'Scrape'}
                      </button>
                    </div>

                    {/* Result */}
                    {result && (
                      <div className={`mt-2 text-[10px] px-3 py-1.5 rounded ${
                        result.ok
                          ? 'bg-green-900/30 text-green-300'
                          : 'bg-red-900/30 text-red-300'
                      }`}>
                        {result.ok
                          ? result.message || `Scraped ${result.scraped} places → ${result.new} new imported`
                          : `Error: ${result.error}`
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
