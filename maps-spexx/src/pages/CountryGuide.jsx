import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import BusinessCard from '../components/BusinessCard'
import EmailCapture from '../components/EmailCapture'

function getMainCity(city) {
  if (!city) return null
  return city.split(',')[0].trim()
}

// Editorial category groups
const CATEGORY_GROUPS = [
  { key: 'food-drink', label: 'Food & Drink', subtitle: 'Where to eat, drink & grab coffee', categories: ['eat', 'cafe', 'drink'], icon: '01' },
  { key: 'stay', label: 'Where to Stay', subtitle: 'Hotels, hostels & unique stays', categories: ['stay'], icon: '02' },
  { key: 'experience', label: 'Experiences', subtitle: 'Things to do, see & explore', categories: ['do', 'explore'], icon: '03' },
  { key: 'wellness', label: 'Wellness', subtitle: 'Retreats, spas & healing', categories: ['wellness'], icon: '04' },
  { key: 'essentials', label: 'Essentials', subtitle: 'Transport, services & useful spots', categories: ['essentials'], icon: '05' },
]

function SectionHeader({ number, title, subtitle, count }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div className="flex items-start gap-4">
        <span className="text-[11px] text-accent/40 font-light tabular-nums mt-1.5">{number}</span>
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-text leading-tight">{title}</h2>
          <p className="text-[13px] text-text-dim font-light mt-1">{subtitle}</p>
        </div>
      </div>
      <span className="text-[11px] text-text-dim/50 tracking-[0.1em] uppercase font-light whitespace-nowrap">
        {count} {count === 1 ? 'place' : 'places'}
      </span>
    </div>
  )
}

export default function CountryGuide() {
  const { slug } = useParams()
  const [country, setCountry] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: countryData } = await supabase
        .from('countries')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .single()

      if (countryData) {
        setCountry(countryData)
        const { data: bizData } = await supabase
          .from('businesses')
          .select('*')
          .eq('country_id', countryData.id)
          .eq('published', true)
          .order('name')
        setBusinesses(bizData || [])
      }
      setLoading(false)
    }
    load()
  }, [slug])

  // Top picks: partner/featured tier or recommended
  const topPicks = businesses.filter(
    (b) => b.tier === 'partner' || b.tier === 'featured' || b.recommended_badge
  ).slice(0, 10)

  const topPickIds = new Set(topPicks.map((b) => b.id))

  // Group remaining businesses by category group
  const remaining = businesses.filter((b) => !topPickIds.has(b.id))

  const categoryGroupData = CATEGORY_GROUPS.map((group) => {
    const items = remaining.filter((b) => group.categories.includes(b.category))
    return { ...group, items }
  }).filter((g) => g.items.length > 0)

  // Anything that doesn't fit a group (misc category)
  const groupedCategories = new Set(CATEGORY_GROUPS.flatMap((g) => g.categories))
  const uncategorized = remaining.filter((b) => !groupedCategories.has(b.category))

  // Cities for stats
  const cityMap = {}
  businesses.forEach((b) => {
    const main = getMainCity(b.city)
    if (main) cityMap[main] = (cityMap[main] || 0) + 1
  })
  const cityCount = Object.keys(cityMap).length

  // Quick-jump nav items
  const navSections = []
  if (topPicks.length > 0) navSections.push({ key: 'top-picks', label: 'Top Picks' })
  categoryGroupData.forEach((g) => navSections.push({ key: g.key, label: g.label }))
  if (uncategorized.length > 0) navSections.push({ key: 'other', label: 'Other' })

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

  if (!country) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <span className="font-display text-2xl text-text/40">Country not found</span>
        <Link to="/" className="text-accent text-[11px] tracking-[0.15em] uppercase font-light hover:text-accent/70 transition-colors">
          &larr; Back to guides
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* ─── Nav ─── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="text-[11px] text-text-secondary tracking-[0.1em] uppercase no-underline hover:text-accent transition-colors font-light flex items-center gap-2">
            <span>&larr;</span>
            <span>All guides</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-display text-[18px] text-text/60 leading-none">Insider Guide</span>
          </div>
        </div>
      </motion.nav>

      {/* ─── Country Hero ─── */}
      <section className="relative pt-14 overflow-hidden">
        <div className="ambient-orb w-[300px] h-[300px] bg-accent/5 top-0 right-1/4" style={{ animationDelay: '-3s' }} />

        <div className="max-w-[1120px] mx-auto px-6 py-14 md:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[11px] tracking-[0.2em] uppercase text-accent/50 font-light">
                {country.coordinates}
              </span>
            </div>

            <div className="flex items-start gap-5 md:gap-6">
              <motion.span
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2, type: 'spring', stiffness: 200 }}
                className="text-5xl md:text-6xl leading-none mt-1"
              >
                {country.flag_emoji}
              </motion.span>

              <div className="flex-1">
                <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[0.95] tracking-[-0.02em]">
                  <span className="text-accent-gradient">{country.name}</span>
                </h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="font-editorial italic text-text-secondary text-[15px] mt-3"
                >
                  {country.tagline}
                </motion.p>
              </div>
            </div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="flex items-center gap-6 mt-8 pt-5 border-t border-border"
            >
              <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
                <span className="font-display text-lg text-accent mr-1.5">{businesses.length}</span>
                places
              </span>
              <span className="w-[1px] h-4 bg-border" />
              <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
                <span className="font-display text-lg text-text/60 mr-1.5">{cityCount}</span>
                cities
              </span>
              <span className="w-[1px] h-4 bg-border" />
              <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
                <span className="font-display text-lg text-text/60 mr-1.5">{categoryGroupData.length}</span>
                categories
              </span>
            </motion.div>
          </motion.div>
        </div>

        <div className="shimmer-line max-w-[1120px] mx-auto" />
      </section>

      {/* ─── Quick-jump nav ─── */}
      {navSections.length > 1 && (
        <div className="sticky top-14 z-30 border-b border-border" style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}>
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="flex items-center gap-1 overflow-x-auto py-3 no-scrollbar">
              {navSections.map((s) => (
                <a
                  key={s.key}
                  href={`#${s.key}`}
                  className="text-[11px] tracking-[0.08em] uppercase font-light text-text-dim hover:text-accent px-3 py-1.5 rounded-lg hover:bg-accent/5 transition-all whitespace-nowrap no-underline"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Top Picks ─── */}
      {topPicks.length > 0 && (
        <section id="top-picks" className="max-w-[1120px] mx-auto px-6 pt-12 pb-6 scroll-mt-28">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <SectionHeader
              number="00"
              title="Top Picks"
              subtitle={`Alex's favorites in ${country.name}`}
              count={topPicks.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topPicks.map((biz, index) => (
                <BusinessCard key={biz.id} business={biz} index={index} isTopPick />
              ))}
            </div>
          </motion.div>
          <div className="gradient-divider mt-10" />
        </section>
      )}

      {/* ─── Category Sections ─── */}
      {categoryGroupData.map((group, gi) => (
        <section key={group.key} id={group.key} className="max-w-[1120px] mx-auto px-6 pt-10 pb-6 scroll-mt-28">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
          >
            <SectionHeader
              number={group.icon}
              title={group.label}
              subtitle={group.subtitle}
              count={group.items.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map((biz, index) => (
                <BusinessCard key={biz.id} business={biz} index={index} />
              ))}
            </div>
          </motion.div>
          {gi < categoryGroupData.length - 1 && <div className="gradient-divider mt-10" />}
        </section>
      ))}

      {/* ─── Uncategorized / Other ─── */}
      {uncategorized.length > 0 && (
        <section id="other" className="max-w-[1120px] mx-auto px-6 pt-10 pb-6 scroll-mt-28">
          <div className="gradient-divider mb-10" />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
          >
            <SectionHeader
              number="05"
              title="Other"
              subtitle="More places worth checking out"
              count={uncategorized.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uncategorized.map((biz, index) => (
                <BusinessCard key={biz.id} business={biz} index={index} />
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ─── Maps CTA ─── */}
      <section className="max-w-[1120px] mx-auto px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="relative border border-border rounded-xl overflow-hidden bg-bg-card"
        >
          <div className="absolute -top-20 -right-20 w-[250px] h-[250px] bg-accent/4 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <h3 className="font-display text-2xl md:text-3xl text-text mb-2">
                Get the full Google Maps list
              </h3>
              <p className="text-[13px] text-text-dim font-light leading-relaxed max-w-lg">
                All {businesses.length} places saved to a Google Maps list you can use offline.
                DM <span className="text-accent">@alexspexx</span> on Instagram with <span className="text-accent font-medium">&ldquo;{slug?.toUpperCase()}&rdquo;</span> and you'll get the link instantly.
              </p>
            </div>
            <a
              href="https://instagram.com/alexspexx"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.08em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all whitespace-nowrap"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              DM on Instagram
            </a>
          </div>
        </motion.div>
      </section>

      {/* ─── Email capture ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pb-16">
        <EmailCapture countrySlug={slug} />
      </section>

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
    </div>
  )
}
