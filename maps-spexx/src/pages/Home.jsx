import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import CountryCard from '../components/CountryCard'
import PaywallModal from '../components/PaywallModal'

export default function Home() {
  const [countries, setCountries] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [paywallCountry, setPaywallCountry] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: countryData } = await supabase
        .from('countries')
        .select('*')
        .eq('published', true)
        .order('name')

      if (countryData) {
        // Custom order: colombia first, then brazil, then guatemala. Hide argentina.
        const ORDER = ['colombia', 'brazil', 'guatemala']
        const sorted = countryData
          .filter((c) => c.slug !== 'argentina')
          .sort((a, b) => {
            const ai = ORDER.indexOf(a.slug)
            const bi = ORDER.indexOf(b.slug)
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
          })
        setCountries(sorted)

        const { data: bizData } = await supabase
          .from('businesses')
          .select('country_id')
          .eq('published', true)

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

  // Check URL params for social media referral
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

  function isUnlocked(slug) {
    if (slug === 'colombia' || slug === 'brazil') return true
    const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
    return grants.includes(slug)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.5, 1] }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          className="text-text-dim text-xs uppercase tracking-widest"
        >
          Loading...
        </motion.span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header — sticky with blur */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="border-b border-border backdrop-blur-sm bg-bg/80 sticky top-0 z-40"
      >
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Insider Guide</span>
            <span className="text-gold text-sm tracking-wider">@alexspexx</span>
          </div>
          <a href="/admin" className="text-[9px] text-text-dim uppercase tracking-widest hover:text-text-secondary transition-colors">
            Admin
          </a>
        </div>
      </motion.header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-4 py-24 md:py-32 text-center overflow-hidden">
        {/* Ambient glow orbs */}
        <div className="ambient-orb w-[300px] h-[300px] bg-gold/10 top-0 left-1/4 -translate-x-1/2" />
        <div className="ambient-orb w-[200px] h-[200px] bg-gold/8 bottom-0 right-1/4 translate-x-1/2" style={{ animationDelay: '-5s' }} />

        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-[10px] uppercase tracking-[0.3em] text-gold-dim block mb-6 relative z-10"
        >
          100 Countries Challenge
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-heading text-6xl md:text-9xl tracking-wider leading-[0.9] text-white mb-6 relative z-10"
        >
          THE<br />
          <span className="text-gold-gradient">INSIDER</span><br />
          GUIDE
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="font-serif italic text-text-secondary text-lg md:text-xl max-w-lg mx-auto relative z-10"
        >
          The world, curated by someone who's actually been there.
        </motion.p>
      </section>

      {/* Shimmer divider */}
      <div className="shimmer-line max-w-6xl mx-auto" />

      {/* Country Grid */}
      <section className="max-w-6xl mx-auto px-4 py-16 pb-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex items-center gap-4 mb-10"
        >
          <span className="text-[10px] uppercase tracking-widest text-text-dim">
            Available Guides
          </span>
          <div className="flex-1 gradient-divider" />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {countries.map((country, index) => (
            <CountryCard
              key={country.id}
              country={country}
              count={counts[country.id] || 0}
              locked={!isUnlocked(country.slug)}
              onLockedClick={() => setPaywallCountry(country)}
              index={index}
            />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center">
        <span className="text-[9px] text-text-dim uppercase tracking-widest">
          @alexspexx · Honest placement · Limited spots
        </span>
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
