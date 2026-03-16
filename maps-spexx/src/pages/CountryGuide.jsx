import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CategoryFilter from '../components/CategoryFilter'
import LocationFilter from '../components/LocationFilter'
import BusinessCard from '../components/BusinessCard'
import EmailCapture from '../components/EmailCapture'

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

  const uniqueLocations = [...new Set(businesses.map((b) => b.city).filter(Boolean))].sort()

  const filtered = businesses
    .filter((b) => activeCategory === 'all' || b.category === activeCategory)
    .filter((b) => activeLocation === 'all' || b.city === activeLocation)

  // Sort: partner first, then featured, then listed
  const sorted = [...filtered].sort((a, b) => {
    const tierOrder = { partner: 0, featured: 1, listed: 2 }
    return (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2)
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
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
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
            ← All guides
          </Link>
          <div className="text-right">
            <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Insider Guide</span>
            <span className="text-gold text-sm tracking-wider">@alexspexx</span>
          </div>
        </div>
      </header>

      {/* Country Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 border-b border-border">
        <span className="text-[10px] uppercase tracking-[0.3em] text-gold-dim block mb-2">
          {country.coordinates}
        </span>
        <div className="flex items-start gap-4">
          <span className="text-5xl">{country.flag_emoji}</span>
          <div>
            <h1 className="font-heading text-5xl md:text-7xl tracking-wider text-white leading-none">
              {country.name.toUpperCase()}
            </h1>
            <p className="font-serif italic text-text-secondary text-sm mt-2">
              {country.tagline}
            </p>
            <span className="text-[10px] text-gold uppercase tracking-wider mt-1 block">
              {businesses.length} places
            </span>
          </div>
        </div>
      </section>

      {/* Filters + Grid */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-3">
          <CategoryFilter active={activeCategory} onChange={handleCategoryChange} />
          <LocationFilter locations={uniqueLocations} active={activeLocation} onChange={handleLocationChange} />
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-text-dim text-sm">No places in this category yet.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sorted.map((biz) => (
              <BusinessCard key={biz.id} business={biz} />
            ))}
          </div>
        )}
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
