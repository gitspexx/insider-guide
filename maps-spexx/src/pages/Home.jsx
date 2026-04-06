import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import CountryCard from '../components/CountryCard'
import PaywallModal from '../components/PaywallModal'

const REGION_ORDER = ['South America', 'Central America', 'Caribbean', 'Europe', 'Asia', 'Middle East', 'Africa']

export default function Home() {
  const [allCountries, setAllCountries] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [paywallCountry, setPaywallCountry] = useState(null)
  const [activeRegion, setActiveRegion] = useState('all')

  useEffect(() => {
    async function load() {
      // Fetch ALL countries (published and unpublished)
      const { data: countryData } = await supabase
        .from('countries')
        .select('*')
        .order('name')

      if (countryData) {
        setAllCountries(countryData)

        const { data: bizData } = await supabase
          .from('businesses')
          .select('country_id')

        if (bizData) {
          const map = {}
          bizData.forEach((b) => {
            map[b.country_id] = (map[b.country_id] || 0) + 1
          })
          setCounts(map)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    const country = params.get('country')
    if (ref === 'social' && country) {
      const token = localStorage.getItem('session_token') || crypto.randomUUID()
      localStorage.setItem('session_token', token)
      const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
      if (!grants.includes(country)) {
        grants.push(country)
        localStorage.setItem('access_grants', JSON.stringify(grants))
        supabase.from('access_grants').insert({
          session_token: token,
          country_slug: country,
          source: 'social_link',
        })
      }
    }
  }, [])

  // Published = open guides (clickable). Unpublished = DM paywall.
  const openCountries = allCountries.filter((c) => c.published)
  const lockedCountries = allCountries.filter((c) => !c.published)

  // Check if user has DM access grant
  function hasAccess(slug) {
    const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
    return grants.includes(slug)
  }

  // Get unique regions
  const regions = [...new Set(allCountries.map((c) => c.region).filter(Boolean))]
    .sort((a, b) => {
      const ai = REGION_ORDER.indexOf(a)
      const bi = REGION_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

  // Filter by region
  const filteredOpen = activeRegion === 'all'
    ? openCountries
    : openCountries.filter((c) => c.region === activeRegion)

  const filteredLocked = activeRegion === 'all'
    ? lockedCountries
    : lockedCountries.filter((c) => c.region === activeRegion)

  // Stats
  const totalPlaces = Object.values(counts).reduce((s, c) => s + c, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-8 h-[1px] bg-accent/40" />
          <span className="text-text-dim text-[11px] tracking-[0.2em] uppercase font-light">Loading</span>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* ─── Nav ─── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-[22px] text-text leading-none">Insider Guide</span>
            <span className="hidden sm:inline-block w-[1px] h-4 bg-border" />
            <span className="hidden sm:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">by @alexspexx</span>
          </div>
          <a href="/admin" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-text-secondary transition-colors font-light">
            Admin
          </a>
        </div>
      </motion.nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-14 overflow-hidden">
        <div className="ambient-orb w-[400px] h-[400px] bg-accent/6 -top-20 left-1/3" />

        <div className="max-w-[1120px] mx-auto px-6 py-12 md:py-16 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left: copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <span className="text-[11px] tracking-[0.25em] uppercase text-accent/70 font-light block mb-5">
                100 Countries Challenge
              </span>

              <h1 className="font-display text-[clamp(2.8rem,6vw,5.5rem)] leading-[0.92] tracking-[-0.02em] text-text mb-4">
                The Insider<br />
                <span className="text-accent-gradient italic">Guide</span>
              </h1>

              <p className="font-editorial text-[clamp(1.05rem,2vw,1.3rem)] text-text-secondary leading-relaxed max-w-md italic mb-8">
                The world, curated by someone who's actually been there.
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-6 pt-5 border-t border-border">
                <div>
                  <span className="font-display text-2xl text-text">{allCountries.length}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Countries</span>
                </div>
                <div className="w-[1px] h-8 bg-border" />
                <div>
                  <span className="font-display text-2xl text-text">{totalPlaces}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Curated Places</span>
                </div>
                <div className="w-[1px] h-8 bg-border" />
                <div>
                  <span className="font-display text-2xl text-text">{regions.length}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Regions</span>
                </div>
              </div>
            </motion.div>

            {/* Right: video showcase */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="relative"
            >
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-border bg-bg-card">
                <video
                  src="/hero-reel.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-60 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-bg/30 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-accent/70 font-light block mb-1">Now exploring</span>
                  <span className="font-display text-xl text-text">South America</span>
                </div>
                <div className="absolute top-4 right-4 w-8 h-8 border-t border-r border-accent/20 rounded-tr-lg pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b border-l border-accent/20 rounded-bl-lg pointer-events-none" />
              </div>
            </motion.div>
          </div>
        </div>

        <div className="shimmer-line max-w-[1120px] mx-auto" />
      </section>

      {/* ─── Region Filter Tabs ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pt-12 pb-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex items-center gap-5 mb-6"
        >
          <span className="text-[11px] tracking-[0.15em] uppercase text-text-dim font-light">
            Explore by Region
          </span>
          <div className="flex-1 gradient-divider" />
        </motion.div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveRegion('all')}
            className={`px-3.5 py-2 text-[11px] tracking-[0.1em] uppercase border rounded-lg transition-all duration-300 cursor-pointer font-light focus-visible:outline-none ${
              activeRegion === 'all'
                ? 'bg-accent/10 border-accent/25 text-accent'
                : 'border-border text-text-dim hover:text-text-secondary hover:border-border-hover hover:bg-bg-elevated'
            }`}
          >
            All ({allCountries.length})
          </button>
          {regions.map((region) => {
            const count = allCountries.filter((c) => c.region === region).length
            return (
              <button
                key={region}
                onClick={() => setActiveRegion(activeRegion === region ? 'all' : region)}
                className={`px-3.5 py-2 text-[11px] tracking-[0.1em] uppercase border rounded-lg transition-all duration-300 cursor-pointer font-light focus-visible:outline-none ${
                  activeRegion === region
                    ? 'bg-accent/10 border-accent/25 text-accent'
                    : 'border-border text-text-dim hover:text-text-secondary hover:border-border-hover hover:bg-bg-elevated'
                }`}
              >
                {region} ({count})
              </button>
            )
          })}
        </div>
      </section>

      {/* ─── Open Guides ─── */}
      {filteredOpen.length > 0 && (
        <section className="max-w-[1120px] mx-auto px-6 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 rounded-full bg-green-500/60" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
              Available Guides
            </span>
            <span className="text-[10px] text-text-dim/50">{filteredOpen.length}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOpen.map((country, index) => (
              <CountryCard
                key={country.id}
                country={country}
                count={counts[country.id] || 0}
                locked={false}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Coming Soon / DM to unlock ─── */}
      {filteredLocked.length > 0 && (
        <section className="max-w-[1120px] mx-auto px-6 pb-16">
          {filteredOpen.length > 0 && <div className="gradient-divider mb-8" />}

          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 rounded-full bg-accent/40" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
              Coming Soon
            </span>
            <span className="text-[10px] text-text-dim/50">{filteredLocked.length}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLocked.map((country, index) => (
              <CountryCard
                key={country.id}
                country={country}
                count={counts[country.id] || 0}
                locked={!hasAccess(country.slug)}
                onLockedClick={() => setPaywallCountry(country)}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display text-lg text-text/40">Insider Guide</span>
          <div className="flex items-center gap-6">
            <a
              href="https://instagram.com/alexspexx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light"
            >
              Instagram
            </a>
            <span className="w-[1px] h-3 bg-border" />
            <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
              Honest placement
            </span>
          </div>
        </div>
      </footer>

      {paywallCountry && (
        <PaywallModal
          country={paywallCountry}
          onClose={() => setPaywallCountry(null)}
        />
      )}
    </div>
  )
}
