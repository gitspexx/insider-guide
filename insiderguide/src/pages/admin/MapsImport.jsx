import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { classifyBusiness } from '../../lib/classifier'

const CATEGORY_MAP = {
  restaurant: 'eat', food: 'eat', bakery: 'eat',
  'meal delivery': 'eat', 'meal takeaway': 'eat',
  pizza: 'eat', 'steak house': 'eat', sushi: 'eat',
  'ice cream shop': 'eat', 'fast food': 'eat',
  seafood: 'eat', brunch: 'eat', 'breakfast restaurant': 'eat',
  hotel: 'stay', hostel: 'stay', motel: 'stay',
  lodging: 'stay', resort: 'stay', 'guest house': 'stay',
  'bed and breakfast': 'stay', campground: 'stay', cabin: 'stay',
  cafe: 'cafe', 'coffee shop': 'cafe', coffee: 'cafe', 'tea house': 'cafe',
  bar: 'drink', pub: 'drink', 'night club': 'drink',
  brewery: 'drink', 'wine bar': 'drink', 'cocktail bar': 'drink',
  'tourist attraction': 'explore', museum: 'explore', park: 'explore',
  church: 'explore', 'point of interest': 'explore', 'art gallery': 'explore',
  'travel agency': 'do', 'tour operator': 'do',
  'amusement park': 'do', zoo: 'do', aquarium: 'do',
  spa: 'wellness', gym: 'wellness', 'yoga studio': 'wellness',
  'beauty salon': 'essentials', massage: 'wellness', health: 'wellness',
}

function mapCategory(googleTypes) {
  if (!googleTypes) return null
  const types = Array.isArray(googleTypes) ? googleTypes : [googleTypes]
  for (const t of types) {
    const lower = t.toLowerCase().replace(/_/g, ' ')
    if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower]
  }
  return null
}

export default function MapsImport() {
  const [countries, setCountries] = useState([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | scraping | comparing | importing | done | error
  const [progress, setProgress] = useState('')
  const [scraped, setScraped] = useState([])
  const [newPlaces, setNewPlaces] = useState([])
  const [existingCount, setExistingCount] = useState(0)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('countries').select('*').order('name').then(({ data }) => setCountries(data || []))
  }, [])

  async function handleScrape() {
    if (!mapsUrl || !selectedCountry) return
    setStatus('scraping')
    setProgress('Starting Apify crawler...')
    setError(null)
    setImportResult(null)
    setScraped([])
    setNewPlaces([])

    try {
      // Call scrape-maps edge function
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
          body: JSON.stringify({ url: mapsUrl }),
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Scrape failed (${res.status})`)
      }

      const result = await res.json()
      const places = result.places || []
      setScraped(places)
      setProgress(`Scraped ${places.length} places. Comparing with database...`)
      setStatus('comparing')

      // Get existing URLs and names for this country
      const country = countries.find(c => c.id === selectedCountry)
      const { data: existing } = await supabase
        .from('businesses')
        .select('name, google_maps_url')
        .eq('country_id', country.id)

      const existingUrls = new Set()
      const existingNames = new Set()
      ;(existing || []).forEach(b => {
        if (b.google_maps_url) existingUrls.add(b.google_maps_url.toLowerCase().trim())
        if (b.name) existingNames.add(b.name.toLowerCase().trim())
      })

      // Filter to only new places
      const fresh = places.filter(p => {
        const url = (p.url || p.google_maps_url || '').toLowerCase().trim()
        const name = (p.title || p.name || '').toLowerCase().trim()
        if (url && existingUrls.has(url)) return false
        if (name && existingNames.has(name)) return false
        return true
      })

      setNewPlaces(fresh)
      setExistingCount(places.length - fresh.length)
      setProgress(`Found ${fresh.length} new places (${places.length - fresh.length} already in DB)`)
      setStatus(fresh.length > 0 ? 'comparing' : 'done')

    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  async function handleImport() {
    if (newPlaces.length === 0) return
    setStatus('importing')
    setProgress('Importing new places...')

    const country = countries.find(c => c.id === selectedCountry)
    let imported = 0
    let errors = 0

    for (let i = 0; i < newPlaces.length; i += 10) {
      const batch = newPlaces.slice(i, i + 10)
      const inserts = batch.map(p => {
        const name = p.title || p.name || ''
        const googleCategory = mapCategory(p.types || p.category)
        const biz = { name, country_id: selectedCountry, city: p.city || '' }
        const classResult = classifyBusiness(biz)
        const category = googleCategory || classResult?.category || 'misc'

        return {
          name,
          country_id: selectedCountry,
          category,
          description: p.description || '',
          location: p.address || p.location || '',
          city: p.city || '',
          google_maps_url: p.url || p.google_maps_url || '',
          instagram_handle: p.instagram || '',
          email: p.email || '',
          website: p.website || '',
          tier: 'listed',
          published: true,
        }
      })

      const { error: insertErr } = await supabase.from('businesses').insert(inserts)
      if (insertErr) errors += batch.length
      else imported += batch.length
      setProgress(`Imported ${imported}/${newPlaces.length}...`)
    }

    setImportResult({ imported, errors, total: newPlaces.length })
    setStatus('done')
    setProgress(`Done! ${imported} new places added.`)
  }

  const country = countries.find(c => c.id === selectedCountry)

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              &larr; Dashboard
            </Link>
            <span className="text-gold text-sm tracking-wider block mt-1">Maps List Importer</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Step 1: Country + URL */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-2">Country</label>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
            >
              <option value="">Select country...</option>
              {countries.map(c => (
                <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-2">
              Google Maps Shared List URL
            </label>
            <input
              type="url"
              value={mapsUrl}
              onChange={e => setMapsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/..."
              className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
            />
            <p className="text-[10px] text-text-dim mt-1">
              Paste the "Share" link from your Google Maps saved list
            </p>
          </div>

          <button
            onClick={handleScrape}
            disabled={!mapsUrl || !selectedCountry || status === 'scraping'}
            className="bg-gold text-bg text-[11px] uppercase tracking-wider font-bold px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'scraping' ? 'Scraping...' : 'Scan Maps List'}
          </button>
        </div>

        {/* Progress */}
        {progress && (
          <div className="bg-bg-card border border-border rounded-sm p-4 mb-6">
            <p className="text-sm text-text-secondary">{progress}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded-sm p-4 mb-6">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Results */}
        {(status === 'comparing' || status === 'done') && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg-card border border-border rounded-sm p-4 text-center">
                <span className="text-xl text-gold block">{scraped.length}</span>
                <span className="text-[9px] text-text-dim uppercase tracking-wider">Total Scraped</span>
              </div>
              <div className="bg-bg-card border border-border rounded-sm p-4 text-center">
                <span className="text-xl text-green-400 block">{newPlaces.length}</span>
                <span className="text-[9px] text-text-dim uppercase tracking-wider">New Places</span>
              </div>
              <div className="bg-bg-card border border-border rounded-sm p-4 text-center">
                <span className="text-xl text-text-dim block">{existingCount}</span>
                <span className="text-[9px] text-text-dim uppercase tracking-wider">Already in DB</span>
              </div>
            </div>

            {/* New places preview */}
            {newPlaces.length > 0 && (
              <>
                <div className="text-[10px] text-text-dim uppercase tracking-wider">
                  New places to import:
                </div>
                <div className="bg-bg-card border border-border rounded-sm overflow-hidden max-h-[400px] overflow-y-auto">
                  {newPlaces.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0">
                      <span className="text-sm text-white flex-1 truncate">{p.title || p.name}</span>
                      <span className="text-[9px] text-text-dim truncate max-w-[200px]">{p.address || p.city || ''}</span>
                    </div>
                  ))}
                </div>

                {status !== 'done' && (
                  <button
                    onClick={handleImport}
                    disabled={status === 'importing'}
                    className="bg-green-600 text-white text-[11px] uppercase tracking-wider font-bold px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40 transition-colors w-full"
                  >
                    {status === 'importing' ? `Importing...` : `Import ${newPlaces.length} New Places`}
                  </button>
                )}
              </>
            )}

            {/* Import result */}
            {importResult && (
              <div className="bg-green-900/30 border border-green-700/40 rounded-sm p-4">
                <p className="text-sm text-green-300">
                  Imported {importResult.imported} places to {country?.name}.
                  {importResult.errors > 0 && ` (${importResult.errors} errors)`}
                </p>
              </div>
            )}

            {newPlaces.length === 0 && status === 'done' && (
              <div className="text-center py-8 text-text-dim text-sm">
                All places from this list are already in the database. Nothing new to import.
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="mt-12 border-t border-border pt-8">
          <h3 className="text-[10px] text-text-dim uppercase tracking-wider mb-4">How it works</h3>
          <ol className="space-y-2 text-sm text-text-secondary">
            <li>1. Share your Google Maps saved list (click Share &rarr; copy link)</li>
            <li>2. Paste the link above and select the country</li>
            <li>3. We crawl the list and compare against your existing database</li>
            <li>4. Only NEW places get imported (duplicates are skipped)</li>
            <li>5. Each place is auto-classified into the right category</li>
          </ol>
          <p className="text-[10px] text-text-dim mt-4">
            Cost: ~$0.003 per place scraped via Apify. Re-scraping a list only charges for the crawl —
            duplicates are filtered for free on our side.
          </p>
        </div>
      </div>
    </div>
  )
}
