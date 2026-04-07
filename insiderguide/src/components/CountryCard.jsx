import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const COUNTRY_GRADIENTS = {
  colombia: 'from-yellow-900/20 via-transparent to-blue-900/10',
  brazil: 'from-green-900/20 via-transparent to-yellow-900/10',
  guatemala: 'from-sky-900/20 via-transparent to-stone-800/10',
  mexico: 'from-green-900/15 via-transparent to-red-900/10',
  peru: 'from-red-900/15 via-transparent to-stone-800/10',
  argentina: 'from-sky-900/15 via-transparent to-stone-800/10',
}

const DEFAULT_GRADIENT = 'from-stone-800/15 via-transparent to-stone-900/10'

export default function CountryCard({ country, count, locked, onLockedClick, index = 0, comingSoon = false }) {
  const gradient = COUNTRY_GRADIENTS[country.slug] || DEFAULT_GRADIENT

  const cardContent = (
    <>
      {/* Atmospheric gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-60 group-hover:opacity-100 transition-opacity duration-700`} />

      {/* Top row */}
      <div className="relative flex items-start justify-between mb-6">
        <span className="text-4xl leading-none">{country.flag_emoji}</span>
        {locked ? (
          <span className={`text-[10px] tracking-[0.15em] uppercase border px-2.5 py-1 rounded-full font-light ${
            comingSoon ? 'text-text-dim/40 border-border/50' : 'text-accent/50 border-accent/20'
          }`}>
            {comingSoon ? 'Coming soon' : 'DM to unlock'}
          </span>
        ) : (
          <span className="text-[10px] tracking-[0.12em] uppercase text-accent/60 font-light">
            {country.region}
          </span>
        )}
      </div>

      {/* Name */}
      <h2 className={`relative font-display text-[1.75rem] leading-[1.1] mb-2 transition-colors duration-300 ${
        locked ? 'text-text/30 group-hover:text-text/50' : 'text-text group-hover:text-accent'
      }`}>
        {country.name}
      </h2>

      {/* Tagline */}
      <p className="relative font-editorial italic text-text-secondary text-[15px] leading-snug mb-6">
        {country.tagline}
      </p>

      {/* Bottom row */}
      <div className="relative mt-auto flex items-center justify-between">
        <span className="text-[11px] text-accent/70 tracking-[0.1em] uppercase font-light">
          {count} {count === 1 ? 'place' : 'places'}
        </span>
        {!locked && (
          <span className="text-accent/50 text-sm group-hover:text-accent group-hover:translate-x-1 transition-all duration-300">
            &rarr;
          </span>
        )}
      </div>
    </>
  )

  if (locked) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
        onClick={onLockedClick}
        className="relative bg-bg-card border border-border rounded-xl p-6 text-left cursor-pointer group overflow-hidden transition-all duration-400 hover:border-border-hover hover:bg-bg-elevated flex flex-col min-h-[200px]"
      >
        {cardContent}
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
    >
      <Link
        to={`/${country.slug}`}
        className="relative flex flex-col min-h-[200px] bg-bg-card border border-border rounded-xl p-6 no-underline group overflow-hidden transition-all duration-400 hover:border-border-accent hover:bg-bg-elevated hover:shadow-[0_8px_40px_rgba(200,165,90,0.05)]"
      >
        {cardContent}
      </Link>
    </motion.div>
  )
}
