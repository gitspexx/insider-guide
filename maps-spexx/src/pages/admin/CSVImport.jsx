import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const SKIP_FILES = [
  'atlas obscura', 'cedula', 'dark tourism',
  'default list', 'favorite places', 'images',
  'land', 'want to go', 'outreach',
]

const CATEGORY_MAP = {
  restaurant: 'eat', food: 'eat', bakery: 'eat',
  'meal delivery': 'eat', 'meal takeaway': 'eat',
  pizza: 'eat', 'steak house': 'eat', sushi: 'eat',
  'ice cream shop': 'eat', 'fast food': 'eat',
  seafood: 'eat', brunch: 'eat', 'breakfast restaurant': 'eat',
  hotel: 'stay', hostel: 'stay', motel: 'stay',
  lodging: 'stay', resort: 'stay', 'guest house': 'stay',
  'bed and breakfast': 'stay', campground: 'stay', cabin: 'stay',
  cafe: 'cafe', 'coffee shop': 'cafe', coffee: 'cafe',
  'tea house': 'cafe',
  bar: 'drink', pub: 'drink', 'night club': 'drink',
  brewery: 'drink', 'wine bar': 'drink', 'cocktail bar': 'drink',
  'tourist attraction': 'do', museum: 'do', park: 'do',
  'travel agency': 'do', 'tour operator': 'do',
  'amusement park': 'do', zoo: 'do', aquarium: 'do',
  'art gallery': 'do', church: 'do', 'point of interest': 'do',
  spa: 'wellness', gym: 'wellness', 'yoga studio': 'wellness',
  'beauty salon': 'wellness', massage: 'wellness', health: 'wellness',
}

function parseCountryFromFilename(filename) {
  return filename
    .replace(/ by Alexspexx/gi, '')
    .replace(/\.csv$/gi, '')
    .replace(/\.json$/gi, '')
    .replace(/_/g, ' ')
    .trim()
}

function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += char
    }
    values.push(current.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = values[i] || '' })
    return obj
  })
}

function parseGeoJSON(json) {
  if (json.type === 'FeatureCollection' && json.features) {
    return json.features.map((f) => ({
      Title: f.properties?.Title || f.properties?.name || f.properties?.title || '',
      URL: f.properties?.['Google Maps URL'] || f.properties?.google_maps_url || f.properties?.url || '',
      Note: f.properties?.Note || f.properties?.Comment || '',
      Location: f.properties?.Location?.Address || f.properties?.address || '',
    }))
  }
  if (Array.isArray(json)) {
    return json.map((item) => ({
      Title: item.Title || item.title || item.name || '',
      URL: item.URL || item.url || item.google_maps_url || '',
      Note: item.Note || item.note || '',
      Location: item.Location || item.location || item.address || '',
    }))
  }
  return []
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function CSVImport() {
  const [countries, setCountries] = useState([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [detectedCountry, setDetectedCountry] = useState('')
  const [showNewCountry, setShowNewCountry] = useState(false)
  const [newCountryName, setNewCountryName] = useState('')
  const [newCountryFlag, setNewCountryFlag] = useState('')
  const [creatingCountry, setCreatingCountry] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState([])
  const [existingUrls, setExistingUrls] = useState(new Set())
  const [existingNames, setExistingNames] = useState(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, found: { email: 0, whatsapp: 0, instagram: 0, website: 0 } })
  const [enrichResult, setEnrichResult] = useState(null)
  const [importedIds, setImportedIds] = useState([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('countries').select('*').order('name')
      setCountries(data || [])
    }
    load()
  }, [])

  useEffect(() => {
    async function loadExisting() {
      if (!selectedCountry) return
      const country = countries.find((c) => c.id === selectedCountry)
      if (!country) return

      const { data } = await supabase
        .from('businesses')
        .select('name, google_maps_url')
        .eq('country_id', country.id)

      const urls = new Set()
      const names = new Set()
      ;(data || []).forEach((b) => {
        if (b.google_maps_url) urls.add(b.google_maps_url.toLowerCase().trim())
        if (b.name) names.add(b.name.toLowerCase().trim())
      })
      setExistingUrls(urls)
      setExistingNames(names)
    }
    loadExisting()
  }, [selectedCountry, countries])

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    setImportResult(null)
    setEnrichResult(null)
    setImportedIds([])

    const detected = parseCountryFromFilename(file.name)
    setDetectedCountry(detected)

    const isSkip = SKIP_FILES.some((s) => detected.toLowerCase() === s)
    if (isSkip) {
      setParsed([])
      setImportResult({ ok: false, text: `"${detected}" is in the skip list (non-business file)` })
      return
    }

    // Auto-select country or pre-fill new country form
    const match = countries.find((c) =>
      c.name.toLowerCase() === detected.toLowerCase() ||
      c.slug.toLowerCase() === detected.toLowerCase()
    )
    if (match) {
      setSelectedCountry(match.id)
      setShowNewCountry(false)
    } else {
      // No match — pre-fill "Add New" form with detected name
      setShowNewCountry(true)
      setNewCountryName(detected.charAt(0).toUpperCase() + detected.slice(1))
      setSelectedCountry('')
    }

    const text = await file.text()
    let items = []

    if (file.name.endsWith('.json')) {
      try {
        items = parseGeoJSON(JSON.parse(text))
      } catch (e) {
        setImportResult({ ok: false, text: 'Invalid JSON file' })
        return
      }
    } else {
      items = parseCSV(text)
    }

    // Clean and filter
    items = items
      .filter((item) => (item.Title || '').trim())
      .map((item) => ({
        name: (item.Title || '').trim(),
        google_maps_url: (item.URL || '').trim(),
        note: (item.Note || item.Comment || '').trim(),
        location: (item.Location || '').trim(),
      }))

    setParsed(items)
  }, [countries])

  function getStatus(item) {
    const url = item.google_maps_url?.toLowerCase().trim()
    const name = item.name?.toLowerCase().trim()
    if (url && existingUrls.has(url)) return 'duplicate'
    if (name && existingNames.has(name)) return 'exists'
    return 'new'
  }

  const newItems = parsed.filter((p) => getStatus(p) === 'new')
  const dupeItems = parsed.filter((p) => getStatus(p) !== 'new')

  async function handleImport() {
    if (!selectedCountry || newItems.length === 0) return
    setImporting(true)
    setImportResult(null)

    try {
      const BATCH_SIZE = 50
      const allInserted = []

      for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
        const batch = newItems.slice(i, i + BATCH_SIZE).map((item) => ({
          country_id: selectedCountry,
          name: item.name,
          google_maps_url: item.google_maps_url || null,
          location: item.location || null,
          notes: item.note || null,
          tier: 'listed',
          outreach_status: 'to_contact',
          published: true,
          category: 'misc',
        }))

        const { data, error } = await supabase
          .from('businesses')
          .insert(batch)
          .select('id, name, google_maps_url')

        if (error) throw error
        if (data) allInserted.push(...data)
      }

      // Get country slug for tagging
      const country = countries.find((c) => c.id === selectedCountry)
      const countryTag = country?.slug || 'unknown'

      // Sync to CRM contacts table (use insert, not upsert — partial index breaks PostgREST upsert)
      const MAPS_PROJECT_ID = '11111111-1111-1111-1111-111111111111'
      let contactsSynced = 0
      for (let i = 0; i < allInserted.length; i += BATCH_SIZE) {
        const contactBatch = allInserted.slice(i, i + BATCH_SIZE).map((biz) => ({
          project_id: MAPS_PROJECT_ID,
          name: biz.name,
          status: 'lead',
          source: 'google-takeout',
          external_id: `maps:${biz.id}`,
          external_url: biz.google_maps_url || null,
          tags: ['maps-import', countryTag],
        }))

        const { data: contactData, error: contactErr } = await supabase
          .from('contacts')
          .insert(contactBatch)
          .select('id')
        if (!contactErr && contactData) contactsSynced += contactData.length
      }

      // Auto-create pipeline for this country if it doesn't exist
      const { data: existingPipelines } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('project_id', MAPS_PROJECT_ID)

      const pipelineName = `${country?.name || countryTag} Pipeline`
      const hasPipeline = existingPipelines?.some((p) =>
        p.name.toLowerCase().includes(countryTag)
      )

      if (!hasPipeline && country) {
        await supabase.from('pipelines').insert({
          project_id: MAPS_PROJECT_ID,
          name: pipelineName,
          description: `Outreach pipeline for ${country.name} businesses`,
          stages: JSON.stringify([
            { id: 'to_contact', name: 'To Contact', color: '#9CA3AF' },
            { id: 'contacted', name: 'Contacted', color: '#F59E0B' },
            { id: 'replied', name: 'Replied', color: '#3B82F6' },
            { id: 'negotiating', name: 'Negotiating', color: '#8B5CF6' },
            { id: 'customer', name: 'Customer', color: '#10B981' },
            { id: 'lost', name: 'Lost', color: '#EF4444' },
          ]),
          is_default: false,
        })
      }

      setImportedIds(allInserted.map((b) => b.id))
      setImportResult({
        ok: true,
        text: `Imported ${allInserted.length} businesses · ${contactsSynced} contacts synced · ${hasPipeline ? 'Pipeline exists' : 'Pipeline created'}`,
      })

      // Refresh existing data
      const { data: refreshed } = await supabase
        .from('businesses')
        .select('name, google_maps_url')
        .eq('country_id', selectedCountry)
      const urls = new Set()
      const names = new Set()
      ;(refreshed || []).forEach((b) => {
        if (b.google_maps_url) urls.add(b.google_maps_url.toLowerCase().trim())
        if (b.name) names.add(b.name.toLowerCase().trim())
      })
      setExistingUrls(urls)
      setExistingNames(names)
    } catch (e) {
      setImportResult({ ok: false, text: e.message })
    } finally {
      setImporting(false)
    }
  }

  async function handleEnrich() {
    if (importedIds.length === 0) return
    setEnriching(true)
    setEnrichResult(null)
    setEnrichProgress({ done: 0, total: importedIds.length, found: { email: 0, whatsapp: 0, instagram: 0, website: 0 } })

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // Process in batches of 5 to avoid rate limits
      const BATCH = 5
      const progress = { done: 0, total: importedIds.length, found: { email: 0, whatsapp: 0, instagram: 0, website: 0 } }

      for (let i = 0; i < importedIds.length; i += BATCH) {
        const batch = importedIds.slice(i, i + BATCH)

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-contacts`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ business_ids: batch }),
          }
        )

        const json = await res.json()
        if (json.results) {
          json.results.forEach((r) => {
            progress.done++
            if (r.email) progress.found.email++
            if (r.whatsapp) progress.found.whatsapp++
            if (r.instagram) progress.found.instagram++
            if (r.website) progress.found.website++
          })
        } else {
          progress.done += batch.length
        }

        setEnrichProgress({ ...progress })
      }

      setEnrichResult({
        ok: true,
        text: `Enriched ${progress.done} businesses — ${progress.found.email} emails, ${progress.found.whatsapp} WhatsApp, ${progress.found.instagram} Instagram found`,
      })
    } catch (e) {
      setEnrichResult({ ok: false, text: e.message })
    } finally {
      setEnriching(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e) {
    const file = e.target.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              &larr; Dashboard
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
              <span className="text-gold text-sm tracking-wider">Import Google Takeout</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-sm p-12 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-gold bg-gold/5'
              : 'border-border hover:border-gold/40 hover:bg-white/[0.01]'
          }`}
          onClick={() => document.getElementById('file-input').click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".csv,.json"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="text-3xl mb-3 opacity-60">
            {fileName ? '📄' : '📂'}
          </div>
          <p className="text-white text-sm mb-1">
            {fileName || 'Drop your Google Takeout CSV or JSON here'}
          </p>
          <p className="text-text-dim text-[10px] uppercase tracking-wider">
            {fileName
              ? `${parsed.length} entries parsed · ${newItems.length} new · ${dupeItems.length} duplicates`
              : 'Supports CSV and GeoJSON from Google Takeout'}
          </p>
          {detectedCountry && (
            <p className="text-gold text-xs mt-2">
              Detected: <span className="font-medium">{detectedCountry}</span>
            </p>
          )}
        </div>

        {/* Country Selector */}
        {parsed.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-2">
                  Target Country
                </label>
                {!showNewCountry ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedCountry}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowNewCountry(true)
                          setSelectedCountry('')
                          setNewCountryName(detectedCountry ? detectedCountry.charAt(0).toUpperCase() + detectedCountry.slice(1) : '')
                        } else {
                          setSelectedCountry(e.target.value)
                        }
                      }}
                      className="flex-1 bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
                    >
                      <option value="">Select country...</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.flag_emoji} {c.name}
                        </option>
                      ))}
                      <option value="__new__">+ Add New Country</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newCountryFlag}
                      onChange={(e) => setNewCountryFlag(e.target.value)}
                      placeholder="🇻🇳"
                      className="w-16 bg-bg-card border border-border rounded-sm px-3 py-3 text-sm text-white text-center focus:border-gold/30 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newCountryName}
                      onChange={(e) => setNewCountryName(e.target.value)}
                      placeholder="Country name (e.g. Vietnam)"
                      className="flex-1 bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!newCountryName.trim()) return
                        setCreatingCountry(true)
                        try {
                          const { data, error } = await supabase
                            .from('countries')
                            .insert({
                              name: newCountryName.trim(),
                              slug: slugify(newCountryName.trim()),
                              flag_emoji: newCountryFlag.trim() || '🏳️',
                              published: true,
                            })
                            .select()
                            .single()
                          if (error) throw error
                          setCountries((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
                          setSelectedCountry(data.id)
                          setShowNewCountry(false)
                          setNewCountryName('')
                          setNewCountryFlag('')
                        } catch (e) {
                          setImportResult({ ok: false, text: `Failed to create country: ${e.message}` })
                        } finally {
                          setCreatingCountry(false)
                        }
                      }}
                      disabled={creatingCountry || !newCountryName.trim()}
                      className="bg-gold text-bg font-heading text-[11px] uppercase tracking-wider px-4 py-3 rounded-sm hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors whitespace-nowrap"
                    >
                      {creatingCountry ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewCountry(false); setNewCountryName(''); setNewCountryFlag('') }}
                      className="text-text-dim hover:text-white text-sm px-2 py-3 cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing || !selectedCountry || newItems.length === 0}
                  className="bg-gold text-bg font-heading text-[11px] uppercase tracking-wider px-6 py-3 rounded-sm hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {importing ? `Importing...` : `Import ${newItems.length} New`}
                </button>
                {importedIds.length > 0 && (
                  <button
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="border border-gold/50 text-gold font-heading text-[11px] uppercase tracking-wider px-6 py-3 rounded-sm hover:bg-gold/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {enriching
                      ? `Scraping ${enrichProgress.done}/${enrichProgress.total}...`
                      : `Enrich Contacts (${importedIds.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {importResult && (
          <div className={`px-4 py-3 rounded-sm text-sm ${
            importResult.ok
              ? 'bg-green-900/40 text-green-300 border border-green-700/40'
              : 'bg-red-900/40 text-red-300 border border-red-700/40'
          }`}>
            {importResult.ok ? '✓ ' : '✗ '}{importResult.text}
          </div>
        )}

        {enrichResult && (
          <div className={`px-4 py-3 rounded-sm text-sm ${
            enrichResult.ok
              ? 'bg-green-900/40 text-green-300 border border-green-700/40'
              : 'bg-red-900/40 text-red-300 border border-red-700/40'
          }`}>
            {enrichResult.ok ? '✓ ' : '✗ '}{enrichResult.text}
          </div>
        )}

        {/* Enrichment Progress */}
        {enriching && (
          <div className="bg-bg-card border border-border rounded-sm p-4">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-text-dim mb-2">
              <span>Scraping contacts via Apify</span>
              <span>{enrichProgress.done}/{enrichProgress.total}</span>
            </div>
            <div className="w-full bg-border rounded-full h-1.5 mb-3">
              <div
                className="bg-gold h-1.5 rounded-full transition-all"
                style={{ width: `${(enrichProgress.done / enrichProgress.total) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Emails', val: enrichProgress.found.email, icon: '📧' },
                { label: 'WhatsApp', val: enrichProgress.found.whatsapp, icon: '💬' },
                { label: 'Instagram', val: enrichProgress.found.instagram, icon: '📸' },
                { label: 'Websites', val: enrichProgress.found.website, icon: '🌐' },
              ].map((s) => (
                <div key={s.label} className="bg-bg border border-border rounded-sm p-2">
                  <span className="text-lg block">{s.icon}</span>
                  <span className="font-heading text-xl text-gold block">{s.val}</span>
                  <span className="text-[9px] text-text-dim uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview Table */}
        {parsed.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-text-dim uppercase tracking-wider">
                Preview ({parsed.length} entries)
              </span>
              <div className="flex gap-3 text-[10px] uppercase tracking-wider">
                <span className="text-green-400">{newItems.length} new</span>
                <span className="text-yellow-400">{dupeItems.length} duplicates</span>
              </div>
            </div>
            <div className="bg-bg-card border border-border rounded-sm overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-card z-10">
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-dim">
                    <th className="text-left px-4 py-3 w-12">Status</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Google Maps URL</th>
                    <th className="text-left px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((item, i) => {
                    const status = getStatus(item)
                    return (
                      <tr
                        key={i}
                        className={`border-b border-border last:border-b-0 ${
                          status === 'new'
                            ? 'hover:bg-green-900/10'
                            : 'opacity-50 hover:bg-yellow-900/10'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          {status === 'new' ? (
                            <span className="text-green-400 text-xs">NEW</span>
                          ) : (
                            <span className="text-yellow-400 text-xs">DUP</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-white">{item.name}</td>
                        <td className="px-4 py-2.5">
                          {item.google_maps_url ? (
                            <a
                              href={item.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold text-xs hover:underline truncate block max-w-[300px]"
                            >
                              {item.google_maps_url.slice(0, 60)}...
                            </a>
                          ) : (
                            <span className="text-text-dim text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-text-dim text-xs truncate max-w-[200px]">
                          {item.note || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* How it works */}
        {!fileName && (
          <div className="bg-bg-card border border-border rounded-sm p-6">
            <h3 className="font-heading text-lg tracking-wider text-white mb-4">How It Works</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: '1',
                  title: 'Upload',
                  desc: 'Drop your Google Takeout CSV or JSON file. Country is auto-detected from the filename.',
                },
                {
                  step: '2',
                  title: 'Import',
                  desc: 'New businesses are added to the maps database and synced as leads in Spexx CRM.',
                },
                {
                  step: '3',
                  title: 'Enrich',
                  desc: 'Apify scrapes each Google Maps listing for email, WhatsApp, Instagram, and website.',
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <span className="font-heading text-2xl text-gold">{s.step}</span>
                  <div>
                    <span className="text-white text-sm font-medium block mb-1">{s.title}</span>
                    <span className="text-text-dim text-xs leading-relaxed">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Google Takeout Instructions */}
        {!fileName && (
          <div className="text-center py-4">
            <p className="text-text-dim text-[10px] uppercase tracking-wider mb-2">
              Export from Google Takeout
            </p>
            <p className="text-text-dim text-xs leading-relaxed max-w-lg mx-auto">
              Go to{' '}
              <a
                href="https://takeout.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold hover:underline"
              >
                takeout.google.com
              </a>
              {' '}&rarr; Deselect all &rarr; Select &quot;Saved&quot; (Maps) &rarr; Export.
              You&apos;ll get CSV files per list (e.g. &quot;Colombia by Alexspexx.csv&quot;).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
