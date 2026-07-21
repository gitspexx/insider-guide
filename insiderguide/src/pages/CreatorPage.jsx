// insiderguide/src/pages/CreatorPage.jsx
import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { themeToCssVars, PALETTES } from '../lib/themes'
import BusinessCard from '../components/BusinessCard'
import CountryCard from '../components/CountryCard'
import PaywallModal from '../components/PaywallModal'
import EmailCapturePopup from '../components/EmailCapturePopup'
import Seo from '../components/Seo'

// Lazy: maplibre-gl is ~1MB minified — keep it out of the eager public bundle
// (Home/CountryGuide visitors never pay for it).
const CreatorMap = lazy(() => import('../components/creator/CreatorMap'))

/**
 * Public creator page. Reached through the /:slug catch-all (CountryGuide
 * dispatches here on a country miss + creator hit, passing `handle` as a
 * prop) — RR7 cannot param-match a fused "@" prefix, so there is no
 * dedicated /@:handle route. Both /handle and /@handle resolve.
 */
export default function CreatorPage({ handle: handleProp }) {
  const { handle: handleParam } = useParams()
  const handle = (handleProp ?? handleParam ?? '').replace(/^@/, '').toLowerCase()
  const [creator, setCreator] = useState(undefined) // undefined=loading, null=404
  const [saves, setSaves] = useState([])
  const [activeCountry, setActiveCountry] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showMap, setShowMap] = useState(false)
  // Country-guides catalog (founding creator only, gated by show_country_catalog)
  const [catalogCountries, setCatalogCountries] = useState([])
  const [catalogCounts, setCatalogCounts] = useState({})
  const [paywallCountry, setPaywallCountry] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: c } = await supabase.from('creators')
        .select('*').eq('handle', handle).eq('status', 'active').maybeSingle()
      if (cancelled) return
      setCreator(c || null)
      if (!c) return
      // No FK embedding through the safe view — parallel fetch + client merge.
      const [savesRes, countriesRes] = await Promise.all([
        supabase.from('creator_saves')
          .select('id, business_id, note, sort, pinned, created_at')
          .eq('creator_id', c.id).eq('hidden', false)
          .order('pinned', { ascending: false })
          .order('sort').order('created_at', { ascending: false }),
        supabase.from('countries').select('id, name, slug, flag_emoji, published'),
      ])
      if (cancelled) return
      // Fetch only this creator's businesses from the safe view, chunked to
      // stay under PostgREST URL-length limits.
      const ids = [...new Set((savesRes.data || []).map((s) => s.business_id))]
      let bizRows = []
      for (let i = 0; i < ids.length; i += 200) {
        const { data: chunk } = await supabase.from('creator_saved_businesses')
          .select('*').in('id', ids.slice(i, i + 200))
        if (cancelled) return
        bizRows = bizRows.concat(chunk || [])
      }
      const bizMap = new Map(bizRows.map((b) => [b.id, b]))
      const countryMap = new Map((countriesRes.data || []).map((x) => [x.id, x]))
      setSaves((savesRes.data || [])
        .map((s) => {
          const b = bizMap.get(s.business_id)
          return b ? { ...s, business: { ...b, country: countryMap.get(b.country_id) } } : null
        })
        .filter(Boolean))
    }
    load()
    return () => { cancelled = true }
  }, [handle])

  // Country-guides catalog — the same browsing experience that used to live on
  // the homepage, now shown only under the founding creator. Fetched ONLY when
  // show_country_catalog is true, so normal creators pay for no extra query.
  useEffect(() => {
    if (!creator?.show_country_catalog) return
    let cancelled = false
    async function loadCatalog() {
      const { data: countryData, error } = await supabase
        .from('countries').select('*').order('name')
      if (cancelled || error) return
      setCatalogCountries(countryData || [])
      // Per-country counts in ONE request (previously ~64 sequential
      // 1000-row scans of the whole businesses table — multi-second load).
      const { data: counts } = await supabase.rpc('country_business_counts')
      if (cancelled) return
      const map = {}
      for (const row of counts || []) map[row.country_id] = Number(row.total) || 0
      setCatalogCounts(map)
    }
    loadCatalog()
    return () => { cancelled = true }
  }, [creator?.show_country_catalog])

  // 3 tiers, published-first (region filter intentionally dropped — simple grid):
  // 1. Published = open guides (clickable). 2. Unpublished + businesses = DM
  // paywall. 3. Unpublished + 0 businesses = Coming Soon.
  const catalogOpen = catalogCountries.filter((c) => c.published)
  const catalogScraped = catalogCountries.filter((c) => !c.published && catalogCounts[c.id] > 0)
  const catalogComingSoon = catalogCountries.filter((c) => !c.published && !catalogCounts[c.id])

  const countries = useMemo(() => {
    const map = new Map()
    for (const s of saves) {
      const c = s.business.country
      if (!c) continue
      map.set(c.id, { ...c, count: (map.get(c.id)?.count || 0) + 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [saves])

  // Effective country: explicit selection wins, else default to the first
  // (most-saved) country. Derived — not effect-synced — to avoid a
  // setState-in-effect cascade (house lint rule).
  const activeCountryId = activeCountry ?? countries[0]?.id ?? null

  const visible = useMemo(() => saves.filter((s) =>
    (!activeCountryId || s.business.country?.id === activeCountryId) &&
    (!activeCategory || s.business.category === activeCategory)), [saves, activeCountryId, activeCategory])

  const categories = useMemo(() =>
    [...new Set(saves
      .filter((s) => !activeCountryId || s.business.country?.id === activeCountryId)
      .map((s) => s.business.category).filter(Boolean))], [saves, activeCountryId])

  const mapSpots = useMemo(() => visible
    .filter((s) => s.business.lat != null)
    .map((s) => ({ id: s.id, name: s.business.name, lat: s.business.lat, lng: s.business.lng })), [visible])

  const onPinClick = useCallback((id) => {
    document.getElementById(`spot-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  if (creator === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><span className="text-text-dim text-sm">Loading…</span></div>
  }
  if (creator === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <h1 className="font-display text-3xl mb-2">Creator not found</h1>
          <a href="/" className="text-accent text-sm">← Back to Insider Guide</a>
        </div>
      </div>
    )
  }

  const accent = (PALETTES[creator.theme?.palette] || PALETTES.gold).accent

  // localStorage grant check (mirrors the old homepage paywall gate).
  function hasAccess(slug) {
    const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
    return grants.includes(slug)
  }

  return (
    <div style={themeToCssVars(creator.theme)} className="min-h-screen">
      <Seo title={`${creator.display_name} — Insider Guide`}
           description={creator.bio?.slice(0, 155)} path={`/${creator.handle}`} />

      <header className="max-w-6xl mx-auto px-4 pt-14 pb-8 text-center">
        {creator.avatar_url && (
          <img src={creator.avatar_url} alt={creator.display_name}
               className="w-24 h-24 rounded-full object-cover border-2 mx-auto mb-4"
               style={{ borderColor: accent }} />
        )}
        <h1 className="font-display text-4xl md:text-5xl text-text mb-2">{creator.display_name}</h1>
        {creator.bio && <p className="text-text-secondary text-sm max-w-xl mx-auto mb-3">{creator.bio}</p>}
        <div className="flex items-center justify-center gap-4 text-xs text-text-dim uppercase tracking-[0.12em]">
          <span>{saves.length} spots</span>
          <span>·</span>
          <span>{countries.length} countries</span>
          {creator.ig_handle && (
            <>
              <span>·</span>
              <a href={`https://instagram.com/${creator.ig_handle.replace('@', '')}`}
                 target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                @{creator.ig_handle.replace('@', '')}
              </a>
            </>
          )}
        </div>
      </header>

      <nav className="max-w-6xl mx-auto px-4 flex gap-2 overflow-x-auto pb-2 mb-4">
        {countries.map((c) => (
          <button key={c.id}
                  onClick={() => { setActiveCountry(c.id); setActiveCategory(null) }}
                  className={`shrink-0 text-xs uppercase tracking-[0.12em] px-4 py-2 rounded-full border cursor-pointer transition-colors ${
                    activeCountryId === c.id
                      ? 'border-accent/40 text-accent bg-accent/8'
                      : 'border-border text-text-dim hover:text-text-secondary'}`}>
            {c.flag_emoji} {c.name} <span className="opacity-60">({c.count})</span>
          </button>
        ))}
      </nav>

      <div className="max-w-6xl mx-auto px-4 flex items-center gap-2 flex-wrap mb-6">
        <button onClick={() => setActiveCategory(null)}
                className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer ${
                  !activeCategory ? 'border-accent/40 text-accent' : 'border-border text-text-dim'}`}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                  className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer ${
                    activeCategory === cat ? 'border-accent/40 text-accent' : 'border-border text-text-dim'}`}>
            {cat}
          </button>
        ))}
        <div className="flex-1" />
        {(() => {
          const active = countries.find((c) => c.id === activeCountryId)
          return active?.published ? (
            <a href={`/${creator.handle}/${active.slug}`}
               className="text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-accent/30 text-accent hover:bg-accent/8 transition-colors">
              Full {active.name} guide →
            </a>
          ) : null
        })()}
        {mapSpots.length > 0 && (
          <button onClick={() => setShowMap((v) => !v)}
                  className="md:hidden text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-accent/30 text-accent cursor-pointer">
            {showMap ? 'List' : 'Map'}
          </button>
        )}
      </div>

      {/* Map renders only when spots carry coordinates (enrichment fills them). */}
      <div className={`max-w-6xl mx-auto px-4 pb-20 grid gap-6 ${mapSpots.length > 0 ? 'md:grid-cols-[1fr_420px]' : ''}`}>
        <div className={`grid sm:grid-cols-2 gap-4 auto-rows-min ${mapSpots.length > 0 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} ${showMap && mapSpots.length > 0 ? 'hidden md:grid' : ''}`}>
          {visible.map((s, i) => (
            <div key={s.id} id={`spot-${s.id}`}>
              <BusinessCard business={s.business} index={i} pinned={s.pinned}
                            creatorNote={s.note} creatorName={creator.display_name} />
            </div>
          ))}
          {visible.length === 0 && <p className="text-text-dim text-sm col-span-full">No spots here yet.</p>}
        </div>
        {mapSpots.length > 0 && (
          <div className={`h-[420px] md:h-[calc(100vh-140px)] md:sticky md:top-6 ${showMap ? '' : 'hidden md:block'}`}>
            <Suspense fallback={<div className="w-full h-full rounded-xl border border-border bg-bg-card animate-pulse" />}>
              <CreatorMap spots={mapSpots} accent={accent} onPinClick={onPinClick} />
            </Suspense>
          </div>
        )}
      </div>

      {/* ─── Country guides catalog (founding creator only) ─── */}
      {creator.show_country_catalog && catalogCountries.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-20">
          <div className="gradient-divider mb-10" />
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2 h-2 rounded-full bg-accent/50" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
              {creator.display_name}'s country guides
            </span>
          </div>

          {catalogOpen.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-2 h-2 rounded-full bg-green-500/60" />
                <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">Available guides</span>
                <span className="text-[10px] text-text-dim/50">{catalogOpen.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogOpen.map((country, index) => (
                  <CountryCard
                    key={country.id}
                    country={country}
                    linkPrefix={`/${creator.handle}`}
                    count={catalogCounts[country.id] || 0}
                    locked={false}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

          {catalogScraped.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-2 h-2 rounded-full bg-accent/50" />
                <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">DM to unlock</span>
                <span className="text-[10px] text-text-dim/50">{catalogScraped.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogScraped.map((country, index) => (
                  <CountryCard
                    key={country.id}
                    country={country}
                    linkPrefix={`/${creator.handle}`}
                    count={catalogCounts[country.id] || 0}
                    locked={!hasAccess(country.slug)}
                    onLockedClick={() => setPaywallCountry(country)}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

          {catalogComingSoon.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-2 h-2 rounded-full bg-text-dim/30" />
                <span className="text-[11px] tracking-[0.12em] uppercase text-text-dim font-light">Coming soon</span>
                <span className="text-[10px] text-text-dim/50">{catalogComingSoon.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogComingSoon.map((country, index) => (
                  <CountryCard
                    key={country.id}
                    country={country}
                    linkPrefix={`/${creator.handle}`}
                    count={0}
                    locked={true}
                    onLockedClick={() => setPaywallCountry(country)}
                    index={index}
                    comingSoon
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {paywallCountry && (
        <PaywallModal
          country={paywallCountry}
          onClose={() => setPaywallCountry(null)}
          hasData={!!catalogCounts[paywallCountry.id]}
        />
      )}

      {creator.email_capture_enabled && (
        <EmailCapturePopup
          countrySlug={null}
          source={`creator_${creator.handle}`}
          heading={`Get ${creator.display_name}'s new spots first`} />
      )}
    </div>
  )
}
