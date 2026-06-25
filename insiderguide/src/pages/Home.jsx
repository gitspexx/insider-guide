import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CountryCard from '../components/CountryCard'
import PaywallModal from '../components/PaywallModal'
import Seo, { SITE_URL, SITE_NAME } from '../components/Seo'

const REGION_ORDER = ['South America', 'Central America', 'Caribbean', 'Europe', 'Asia', 'Middle East', 'Africa']

// Brand logos via 21st-magic logo_search (rendered as raw SVG to avoid JSX attr issues).
const SOCIAL = [
  { name: 'Instagram', svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 264.583 264.583"><defs><radialGradient xlink:href="#a" id="f" cx="158.429" cy="578.088" r="52.352" fx="158.429" fy="578.088" gradientTransform="matrix(0 -4.03418 4.28018 0 -2332.227 942.236)" gradientUnits="userSpaceOnUse"/><radialGradient xlink:href="#b" id="g" cx="172.615" cy="600.692" r="65" fx="172.615" fy="600.692" gradientTransform="matrix(.67441 -1.16203 1.51283 .87801 -814.366 -47.835)" gradientUnits="userSpaceOnUse"/><radialGradient xlink:href="#c" id="h" cx="144.012" cy="51.337" r="67.081" fx="144.012" fy="51.337" gradientTransform="matrix(-2.3989 .67549 -.23008 -.81732 464.996 -26.404)" gradientUnits="userSpaceOnUse"/><radialGradient xlink:href="#d" id="e" cx="199.788" cy="628.438" r="52.352" fx="199.788" fy="628.438" gradientTransform="matrix(-3.10797 .87652 -.6315 -2.23914 1345.65 1374.198)" gradientUnits="userSpaceOnUse"/><linearGradient id="d"><stop offset="0" stop-color="#ff005f"/><stop offset="1" stop-color="#fc01d8"/></linearGradient><linearGradient id="c"><stop offset="0" stop-color="#780cff"/><stop offset="1" stop-color="#820bff" stop-opacity="0"/></linearGradient><linearGradient id="b"><stop offset="0" stop-color="#fc0"/><stop offset="1" stop-color="#fc0" stop-opacity="0"/></linearGradient><linearGradient id="a"><stop offset="0" stop-color="#fc0"/><stop offset=".124" stop-color="#fc0"/><stop offset=".567" stop-color="#fe4a05"/><stop offset=".694" stop-color="#ff0f3f"/><stop offset="1" stop-color="#fe0657" stop-opacity="0"/></linearGradient></defs><path fill="url(#e)" d="M204.15 18.143c-55.23 0-71.383.057-74.523.317-11.334.943-18.387 2.728-26.07 6.554-5.922 2.942-10.592 6.351-15.201 11.13-8.394 8.716-13.481 19.439-15.323 32.184-.895 6.188-1.156 7.45-1.209 39.056-.02 10.536 0 24.4 0 42.999 0 55.2.062 71.341.326 74.476.916 11.032 2.645 17.973 6.308 25.565 7 14.533 20.37 25.443 36.12 29.514 5.453 1.404 11.476 2.178 19.208 2.544 3.277.142 36.669.244 70.081.244 33.413 0 66.826-.04 70.02-.203 8.954-.422 14.153-1.12 19.901-2.606 15.852-4.09 28.977-14.838 36.12-29.575 3.591-7.409 5.412-14.614 6.236-25.07.18-2.28.255-38.626.255-74.924 0-36.304-.082-72.583-.26-74.863-.835-10.625-2.656-17.77-6.364-25.32-3.042-6.182-6.42-10.799-11.324-15.519-8.752-8.361-19.455-13.45-32.21-15.29-6.18-.894-7.41-1.158-39.033-1.213z" transform="translate(-71.816 -18.143)"/><path fill="#fff" d="M132.345 33.973c-26.716 0-30.07.117-40.563.594-10.472.48-17.62 2.136-23.876 4.567-6.47 2.51-11.958 5.87-17.426 11.335-5.472 5.464-8.834 10.948-11.354 17.412-2.44 6.252-4.1 13.397-4.57 23.858-.47 10.486-.593 13.838-.593 40.535 0 26.697.119 30.037.594 40.522.482 10.465 2.14 17.609 4.57 23.859 2.515 6.465 5.876 11.95 11.346 17.414 5.466 5.468 10.955 8.834 17.42 11.345 6.26 2.431 13.41 4.088 23.881 4.567 10.493.477 13.844.594 40.559.594 26.719 0 30.061-.117 40.555-.594 10.472-.48 17.63-2.136 23.888-4.567 6.468-2.51 11.948-5.877 17.414-11.345 5.472-5.464 8.834-10.949 11.354-17.412 2.419-6.252 4.079-13.398 4.57-23.858.472-10.486.595-13.828.595-40.525s-.123-30.047-.594-40.533c-.492-10.465-2.152-17.608-4.57-23.858-2.521-6.466-5.883-11.95-11.355-17.414-5.472-5.468-10.944-8.827-17.42-11.335-6.271-2.431-13.424-4.088-23.897-4.567-10.493-.477-13.834-.594-40.558-.594zm-8.825 17.715c2.62-.004 5.542 0 8.825 0 26.266 0 29.38.094 39.752.565 9.591.438 14.797 2.04 18.264 3.385 4.591 1.782 7.864 3.912 11.305 7.352 3.443 3.44 5.575 6.717 7.362 11.305 1.346 3.46 2.951 8.663 3.388 18.247.47 10.363.573 13.475.573 39.71 0 26.233-.102 29.346-.573 39.709-.44 9.584-2.042 14.786-3.388 18.247-1.783 4.587-3.919 7.854-7.362 11.292-3.443 3.441-6.712 5.57-11.305 7.352-3.463 1.352-8.673 2.95-18.264 3.388-10.37.47-13.486.573-39.752.573-26.268 0-29.38-.102-39.751-.573-9.592-.443-14.797-2.044-18.267-3.39-4.59-1.781-7.87-3.911-11.313-7.352-3.443-3.44-5.574-6.709-7.362-11.298-1.346-3.461-2.95-8.663-3.387-18.247-.472-10.363-.566-13.476-.566-39.726s.094-29.347.566-39.71c.438-9.584 2.04-14.786 3.387-18.25 1.783-4.588 3.919-7.865 7.362-11.305 3.443-3.441 6.722-5.57 11.313-7.357 3.468-1.351 8.675-2.949 18.267-3.389 9.075-.41 12.592-.532 30.926-.553zm61.337 16.322c-6.518 0-11.805 5.277-11.805 11.792 0 6.512 5.287 11.796 11.805 11.796 6.517 0 11.804-5.284 11.804-11.796 0-6.513-5.287-11.796-11.805-11.796zm-52.512 13.782c-27.9 0-50.519 22.603-50.519 50.482 0 27.879 22.62 50.471 50.52 50.471s50.51-22.592 50.51-50.471c0-27.879-22.613-50.482-50.513-50.482zm0 17.715c18.11 0 32.792 14.67 32.792 32.767 0 18.096-14.683 32.767-32.792 32.767-18.11 0-32.791-14.671-32.791-32.767 0-18.098 14.68-32.767 32.791-32.767z"/></svg>` },
  { name: 'TikTok', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352.28 398.67"><path fill="#25f4ee" d="M137.17 156.98v-15.56c-5.34-.73-10.76-1.18-16.29-1.18C54.23 140.24 0 194.47 0 261.13c0 40.9 20.43 77.09 51.61 98.97-20.12-21.6-32.46-50.53-32.46-82.31 0-65.7 52.69-119.28 118.03-120.81Z"/><path fill="#25f4ee" d="M140.02 333c29.74 0 54-23.66 55.1-53.13l.11-263.2h48.08c-1-5.41-1.55-10.97-1.55-16.67h-65.67l-.11 263.2c-1.1 29.47-25.36 53.13-55.1 53.13-9.24 0-17.95-2.31-25.61-6.34C105.3 323.9 121.6 333 140.02 333ZM333.13 106V91.37c-18.34 0-35.43-5.45-49.76-14.8 12.76 14.65 30.09 25.22 49.76 29.43Z"/><path fill="#fe2c55" d="M283.38 76.57c-13.98-16.05-22.47-37-22.47-59.91h-17.59c4.63 25.02 19.48 46.49 40.06 59.91ZM120.88 205.92c-30.44 0-55.21 24.77-55.21 55.21 0 21.2 12.03 39.62 29.6 48.86-6.55-9.08-10.45-20.18-10.45-32.2 0-30.44 24.77-55.21 55.21-55.21 5.68 0 11.13.94 16.29 2.55v-67.05c-5.34-.73-10.76-1.18-16.29-1.18-.96 0-1.9.05-2.85.07v51.49c-5.16-1.61-10.61-2.55-16.29-2.55Z"/><path fill="#fe2c55" d="M333.13 106v51.04c-34.05 0-65.61-10.89-91.37-29.38v133.47c0 66.66-54.23 120.88-120.88 120.88-25.76 0-49.64-8.12-69.28-21.91 22.08 23.71 53.54 38.57 88.42 38.57 66.66 0 120.88-54.23 120.88-120.88V144.33c25.76 18.49 57.32 29.38 91.37 29.38v-65.68c-6.57 0-12.97-.71-19.14-2.03Z"/><path fill="#000" d="M241.76 261.13V127.66c25.76 18.49 57.32 29.38 91.37 29.38V106c-19.67-4.21-37-14.77-49.76-29.43-20.58-13.42-35.43-34.88-40.06-59.91h-48.08l-.11 263.2c-1.1 29.47-25.36 53.13-55.1 53.13-18.42 0-34.72-9.1-44.75-23.01-17.57-9.25-29.6-27.67-29.6-48.86 0-30.44 24.77-55.21 55.21-55.21 5.68 0 11.13.94 16.29 2.55v-51.49C71.83 158.5 19.14 212.08 19.14 277.78c0 31.78 12.34 60.71 32.46 82.31C71.23 373.87 95.12 382 120.88 382c66.65 0 120.88-54.23 120.88-120.88Z"/></svg>` },
  { name: 'YouTube', svg: `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" viewBox="0 0 256 180"><path fill="red" d="M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134Z"/><path fill="#FFF" d="m102.421 128.06 66.328-38.418-66.328-38.418z"/></svg>` },
]

export default function Home() {
  const [allCountries, setAllCountries] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [paywallCountry, setPaywallCountry] = useState(null)
  const [activeRegion, setActiveRegion] = useState('all')
  const [query, setQuery] = useState('')
  const heroVideoRef = useRef(null)

  useEffect(() => {
    const v = heroVideoRef.current
    if (!v) return
    // Keep the lightweight WebP poster as the LCP; only fetch the hero loop
    // after first paint, and skip it entirely for reduced-motion / data-saver
    // users. preload="none" means nothing downloads until play() is called.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const saveData = navigator.connection?.saveData
    if (reduceMotion || saveData) return
    const tryPlay = () => {
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
    const ric = window.requestIdleCallback
    const id = ric ? ric(tryPlay, { timeout: 2000 }) : setTimeout(tryPlay, 400)
    v.addEventListener('canplay', tryPlay)
    return () => {
      v.removeEventListener('canplay', tryPlay)
      if (ric && window.cancelIdleCallback) window.cancelIdleCallback(id)
      else clearTimeout(id)
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: countryData, error: countryError } = await supabase
          .from('countries')
          .select('*')
          .order('name')

        if (countryError) {
          console.error('Failed to load countries:', countryError)
          setLoading(false)
          return
        }

        setAllCountries(countryData || [])

        // Paginate to get all businesses
        let allBiz = []
        let offset = 0
        while (true) {
          const { data, error } = await supabase
            .from('businesses')
            .select('country_id')
            .range(offset, offset + 999)
          if (error) { console.error('Failed to load businesses:', error); break }
          if (!data || data.length === 0) break
          allBiz = allBiz.concat(data)
          if (data.length < 1000) break
          offset += 1000
        }

        const map = {}
        allBiz.forEach((b) => {
          map[b.country_id] = (map[b.country_id] || 0) + 1
        })
        setCounts(map)
      } catch (err) {
        console.error('Home load error:', err)
      } finally {
        setLoading(false)
      }
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
        supabase.from('access_grants').insert({
          session_token: token,
          country_slug: country,
          source: 'social_link',
        }).then(({ error }) => {
          if (!error) {
            grants.push(country)
            localStorage.setItem('access_grants', JSON.stringify(grants))
          }
        })
      }
    }
  }, [])

  // 3 tiers:
  // 1. Published = open guides (clickable, full access)
  // 2. Unpublished + has businesses = scraped, DM paywall
  // 3. Unpublished + 0 businesses = not scraped, Coming Soon
  const openCountries = allCountries.filter((c) => c.published)
  const scrapedCountries = allCountries.filter((c) => !c.published && counts[c.id] > 0)
  const comingSoonCountries = allCountries.filter((c) => !c.published && !counts[c.id])

  function hasAccess(slug) {
    const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
    return grants.includes(slug)
  }

  // Regions
  const regions = [...new Set(allCountries.map((c) => c.region).filter(Boolean))]
    .sort((a, b) => {
      const ai = REGION_ORDER.indexOf(a)
      const bi = REGION_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

  // Filter by region + optional name query
  function filterByRegion(list) {
    const q = query.trim().toLowerCase()
    let out = activeRegion === 'all' ? list : list.filter((c) => c.region === activeRegion)
    if (q) out = out.filter((c) => (c.name || '').toLowerCase().includes(q))
    return out
  }

  // Group a list by region
  function groupByRegion(list) {
    const groups = {}
    list.forEach((c) => {
      const r = c.region || 'Other'
      if (!groups[r]) groups[r] = []
      groups[r].push(c)
    })
    return Object.entries(groups).sort((a, b) => {
      const ai = REGION_ORDER.indexOf(a[0])
      const bi = REGION_ORDER.indexOf(b[0])
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }

  const totalPlaces = Object.values(counts).reduce((s, c) => s + c, 0)
  const popular = [...allCountries]
    .filter((c) => counts[c.id] > 0)
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
    .slice(0, 5)
  const filteredOpen = filterByRegion(openCountries)
  const filteredScraped = filterByRegion(scrapedCountries)
  const filteredComingSoon = filterByRegion(comingSoonCountries)

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
      <Seo
        description="Curated travel guides from creators who've actually been there — where to eat, stay and explore, country by country. Real picks from people travelers trust, not algorithmic 4.2-star noise."
        jsonLd={[
          { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/favicon.png` },
          { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        ]}
      />
      {/* ─── Nav ─── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline group" aria-label="Insider Guide home">
            <img src="/favicon.png" alt="" width="22" height="22" className="rounded-md" />
            <span className="font-display text-[22px] text-text leading-none group-hover:text-accent transition-colors">Insider Guide</span>
            <span className="hidden md:inline-block w-[1px] h-4 bg-border" />
            <span className="hidden md:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">a network of travel creators</span>
          </Link>
          <div className="flex items-center gap-5">
            <a href="/partner" className="text-[11px] text-accent tracking-[0.12em] uppercase hover:text-accent/80 transition-colors font-light">
              Feature your business
            </a>
            <span className="hidden sm:inline-block w-[1px] h-3 bg-border" />
            <a href="/admin" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-text-secondary transition-colors font-light">
              Admin
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ─── Hero (immersive full-bleed) ─── */}
      <section className="relative min-h-[88vh] flex items-end overflow-hidden">
        <video
          ref={heroVideoRef}
          src="/hero-reel.mp4"
          poster="/hero-reel.webp"
          loop muted playsInline
          preload="none"
          disablePictureInPicture
          controls={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* scrims for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent pointer-events-none" />
        <div className="ambient-orb w-[500px] h-[500px] bg-accent/8 top-10 -right-24" />

        <div className="relative z-10 w-full max-w-[1120px] mx-auto px-6 pt-32 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-2xl"
          >
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/80 block mb-5">
              A network of travel creators
            </span>

            <h1 className="font-display text-[clamp(3rem,7vw,6rem)] leading-[0.9] tracking-[-0.02em] text-text mb-5">
              The Insider <span className="text-accent-gradient italic">Guide</span>
            </h1>

            <p className="text-[clamp(1.1rem,2vw,1.35rem)] text-text-secondary leading-relaxed max-w-lg mb-8">
              Curated travel guides by creators who've actually been there. Real lists, real recommendations — no algorithms.
            </p>

            {/* search + primary CTA */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl mb-5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${allCountries.length} countries…`}
                  aria-label="Search countries"
                  className="w-full pl-4 pr-9 py-3.5 rounded-lg bg-bg-card/80 backdrop-blur border border-border-hover text-text text-sm placeholder:text-text-dim focus:outline-none focus:border-accent/50 transition-colors duration-300"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-accent text-sm cursor-pointer">✕</button>
                )}
              </div>
              <a
                href="#guides"
                onClick={(e) => { e.preventDefault(); document.getElementById('guides')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg bg-accent text-bg text-[12px] tracking-[0.16em] uppercase font-medium hover:bg-accent/90 transition-all duration-300 no-underline whitespace-nowrap"
              >
                Explore guides <span aria-hidden="true">→</span>
              </a>
            </div>

            {/* popular quick-jumps */}
            {popular.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-8">
                <span className="text-[10px] tracking-[0.12em] uppercase text-text-dim/70 mr-1">Popular</span>
                {popular.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setQuery(c.name); document.getElementById('guides')?.scrollIntoView({ behavior: 'smooth' }) }}
                    className="px-3 py-1.5 rounded-full border border-border text-[11px] text-text-secondary hover:text-accent hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* stats + social proof */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-6 border-t border-border/60">
              <div className="flex items-center gap-6">
                <div>
                  <span className="font-display text-2xl text-text">{allCountries.length}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Countries</span>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="font-display text-2xl text-text">{totalPlaces.toLocaleString()}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Curated places</span>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <span className="font-display text-2xl text-text">{regions.length}</span>
                  <span className="text-[10px] text-text-dim tracking-[0.1em] uppercase block mt-0.5 font-light">Regions</span>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:ml-auto">
                <span className="text-[10px] tracking-[0.12em] uppercase text-text-dim/60 mr-1">Creators on</span>
                {SOCIAL.map((s) => (
                  <span
                    key={s.name}
                    title={s.name}
                    aria-label={s.name}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-text/90 p-1 opacity-80 hover:opacity-100 transition-opacity [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: s.svg }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="shimmer-line max-w-[1120px] mx-auto absolute bottom-0 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)]" />
      </section>

      {/* ─── Region Filter ─── */}
      <section id="guides" className="max-w-[1120px] mx-auto px-6 pt-12 pb-4 scroll-mt-16">
        <div className="flex flex-wrap gap-2">
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

      {/* ─── 1. Open Guides ─── */}
      {filteredOpen.length > 0 && (
        <section className="max-w-[1120px] mx-auto px-6 pt-8 pb-6">
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

      {/* ─── 2. Scraped — DM Paywall ─── */}
      {filteredScraped.length > 0 && (
        <section className="max-w-[1120px] mx-auto px-6 pt-6 pb-6">
          <div className="gradient-divider mb-8" />
          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 rounded-full bg-accent/50" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
              DM to Unlock
            </span>
            <span className="text-[10px] text-text-dim/50">{filteredScraped.length}</span>
          </div>

          {activeRegion === 'all' ? (
            // Group by region
            groupByRegion(filteredScraped).map(([region, countries]) => (
              <div key={region} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] tracking-[0.12em] uppercase text-text-dim/60 font-light">{region}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {countries.map((country, index) => (
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
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredScraped.map((country, index) => (
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
          )}
        </section>
      )}

      {/* ─── 3. Coming Soon ─── */}
      {filteredComingSoon.length > 0 && (
        <section className="max-w-[1120px] mx-auto px-6 pt-6 pb-16">
          <div className="gradient-divider mb-8" />
          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 rounded-full bg-text-dim/30" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-dim font-light">
              Coming Soon
            </span>
            <span className="text-[10px] text-text-dim/50">{filteredComingSoon.length}</span>
          </div>

          {activeRegion === 'all' ? (
            groupByRegion(filteredComingSoon).map(([region, countries]) => (
              <div key={region} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] tracking-[0.12em] uppercase text-text-dim/60 font-light">{region}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {countries.map((country, index) => (
                    <CountryCard
                      key={country.id}
                      country={country}
                      count={0}
                      locked={true}
                      onLockedClick={() => setPaywallCountry(country)}
                      index={index}
                      comingSoon
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredComingSoon.map((country, index) => (
                <CountryCard
                  key={country.id}
                  country={country}
                  count={0}
                  locked={true}
                  onLockedClick={() => setPaywallCountry(country)}
                  index={index}
                  comingSoon
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-10 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-text-dim font-light">
            <a href="/legal/privacy.html" className="hover:text-accent transition-colors">Privacy</a>
            <a href="/legal/terms.html" className="hover:text-accent transition-colors">Terms</a>
            <a href="/legal/cookies.html" className="hover:text-accent transition-colors">Cookies</a>
            <a href="/legal/data-retention.html" className="hover:text-accent transition-colors">Data Retention</a>
            <a href="/legal/acceptable-use.html" className="hover:text-accent transition-colors">Acceptable Use</a>
            <a href="/legal/refund-policy.html" className="hover:text-accent transition-colors">Refund</a>
            <a href="/legal/creator-agreement.html" className="hover:text-accent transition-colors">Creator Agreement</a>
            <a href="/legal/brand-partner-terms.html" className="hover:text-accent transition-colors">Brand Partners</a>
            <a href="/legal/listing-removal-policy.html" className="hover:text-accent transition-colors">Listing Removal</a>
            <a href="/legal/dmca.html" className="hover:text-accent transition-colors">DMCA</a>
            <span className="text-text-dim/60">© {new Date().getFullYear()} BCAX LLC</span>
          </div>
        </div>
      </footer>

      {paywallCountry && (
        <PaywallModal
          country={paywallCountry}
          onClose={() => setPaywallCountry(null)}
          hasData={!!counts[paywallCountry.id]}
        />
      )}
    </div>
  )
}
