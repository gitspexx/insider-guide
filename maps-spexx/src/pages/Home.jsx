import { useEffect, useState } from 'react'
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
        setCountries(countryData)

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
    // Colombia is always free
    if (slug === 'colombia') return true
    const grants = JSON.parse(localStorage.getItem('access_grants') || '[]')
    return grants.includes(slug)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Insider Guide</span>
            <span className="text-gold text-sm tracking-wider">@alexspexx</span>
          </div>
          <a href="/admin" className="text-[9px] text-text-dim uppercase tracking-widest hover:text-text-secondary transition-colors">
            Admin
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <span className="text-[10px] uppercase tracking-[0.3em] text-gold-dim block mb-4">
          100 Countries Challenge
        </span>
        <h1 className="font-heading text-6xl md:text-8xl tracking-wider leading-none text-white mb-4">
          THE<br />
          <span className="text-gold">INSIDER</span><br />
          GUIDE
        </h1>
        <p className="font-serif italic text-text-secondary text-lg max-w-md mx-auto">
          The world, curated by someone who's actually been there.
        </p>
      </section>

      {/* Country Grid */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="flex items-center gap-4 mb-8">
          <span className="text-[10px] uppercase tracking-widest text-text-dim">
            Available Guides
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {countries.map((country) => (
            <CountryCard
              key={country.id}
              country={country}
              count={counts[country.id] || 0}
              locked={!isUnlocked(country.slug)}
              onLockedClick={() => setPaywallCountry(country)}
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
