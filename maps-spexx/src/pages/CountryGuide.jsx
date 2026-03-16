import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import CategoryFilter from '../components/CategoryFilter'
import LocationFilter from '../components/LocationFilter'
import BusinessCard from '../components/BusinessCard'
import EmailCapture from '../components/EmailCapture'

function getMainCity(city) {
  if (!city) return null
  return city.split(',')[0].trim()
}

export default function CountryGuide() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [country, setCountry] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)

  const activeCategory = searchParams.get('category') || 'all'
  const activeLocation = searchParams.get('location') || 'all'

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

  function handleCategoryChange(cat) {
    const params = {}
    if (cat !== 'all') params.category = cat
    if (activeLocation !== 'all') params.location = activeLocation
    setSearchParams(params)
  }

  function handleLocationChange(loc) {
    const params = {}
    if (activeCategory !== 'all') params.category = activeCategory
    if (loc !== 'all') params.location = loc
    setSearchParams(params)
  }

  const cityMap = {}
  businesses.forEach((b) => {
    const main = getMainCity(b.city)
    if (main) cityMap[main] = (cityMap[main] || 0) + 1
  })
  const uniqueLocations = Object.keys(cityMap).sort()
  const locationCounts = cityMap

  const filtered = businesses
    .filter((b) => activeCategory === 'all' || b.category === activeCategory)
    .filter((b) => activeLocation === 'all' || getMainCity(b.city) === activeLocation)

  const sorted = [...filtered].sort((a, b) => {
    const tierOrder = { partner: 0, featured: 1, listed: 2 }
    return (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2)
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.5, 1] }}
          transition={{ duration: 1.5 }}
          className="text-text-dim text-xs uppercase tracking-widest"
        >
          Loading...
        </motion.span>
      </div>
    )
  }

  if (!country) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-text-dim text-sm">Country not found.</span>
        <Link to="/" className="text-gold text-xs uppercase tracking-wider">← Back home</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header — sticky blur */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="border-b border-border backdrop-blur-sm bg-bg/80 sticky top-0 z-40"
      >
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80 transition-colors">
            ← All guides
          </Link>
          <div className="text-right">
            <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Insider Guide</span>
            <span className="text-gold text-sm tracking-wider">@alexspexx</span>
          </div>
        </div>
      </motion.header>

      {/* Country Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient orb behind hero */}
        <div className="ambient-orb w-[250px] h-[250px] bg-gold/8 top-4 right-1/4" style={{ animationDelay: '-3s' }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-6xl mx-auto px-4 py-12 relative z-10"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-gold-dim block mb-2">
            {country.coordinates}
          </span>
          <div className="flex items-start gap-4">
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
              className="text-5xl md:text-6xl"
            >
              {country.flag_emoji}
            </motion.span>
            <div>
              <h1 className="font-heading text-5xl md:text-7xl tracking-wider leading-none">
                <span className="text-gold-gradient">{country.name.toUpperCase()}</span>
              </h1>
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="font-serif italic text-text-secondary text-sm mt-2"
              >
                {country.tagline}
              </motion.p>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-[10px] text-gold uppercase tracking-wider mt-1 block"
              >
                {businesses.length} places
              </motion.span>
            </div>
          </div>
        </motion.div>
        <div className="shimmer-line max-w-6xl mx-auto" />
      </section>

      {/* Filters + Grid */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-8 flex flex-col gap-3"
        >
          <CategoryFilter active={activeCategory} onChange={handleCategoryChange} businesses={businesses} />
          <LocationFilter locations={uniqueLocations} counts={locationCounts} active={activeLocation} onChange={handleLocationChange} />
        </motion.div>

        <AnimatePresence mode="wait">
          {sorted.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <span className="text-text-dim text-sm">No places in this category yet.</span>
            </motion.div>
          ) : (
            <motion.div
              key={`${activeCategory}-${activeLocation}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {sorted.map((biz, index) => (
                <BusinessCard key={biz.id} business={biz} index={index} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Email capture */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <EmailCapture countrySlug={slug} />
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center">
        <span className="text-[9px] text-text-dim uppercase tracking-widest">
          @alexspexx · Honest placement · Limited spots
        </span>
      </footer>
    </div>
  )
}
