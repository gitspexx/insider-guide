import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function CountryCard({ country, count, locked, onLockedClick, index = 0 }) {
  if (locked) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
        whileHover={{ y: -3, transition: { duration: 0.2 } }}
        onClick={onLockedClick}
        className="relative bg-bg-card border border-border rounded-sm p-6 text-left transition-all hover:border-white/15 cursor-pointer group gradient-border"
      >
        <div className="flex items-start justify-between mb-4">
          <span className="text-3xl">{country.flag_emoji}</span>
          <span className="text-[9px] uppercase tracking-widest text-text-dim border border-border px-2 py-0.5 rounded-sm">
            Locked
          </span>
        </div>
        <h2 className="font-heading text-2xl tracking-wide text-white/40 group-hover:text-white/60 transition-colors">
          {country.name}
        </h2>
        <p className="text-xs text-text-dim mt-1 font-serif italic">{country.tagline}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-text-dim uppercase tracking-wider">
            {count} places
          </span>
        </div>
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Link
        to={`/${country.slug}`}
        className="relative block bg-bg-card border border-border rounded-sm p-6 transition-all hover:border-gold/30 group no-underline gradient-border overflow-hidden"
      >
        {/* Subtle hover glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative flex items-start justify-between mb-4">
          <motion.span
            className="text-3xl"
            whileHover={{ scale: 1.2, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            {country.flag_emoji}
          </motion.span>
          <span className="text-[10px] text-gold uppercase tracking-widest">{country.region}</span>
        </div>
        <h2 className="relative font-heading text-2xl tracking-wide text-white group-hover:text-gold transition-colors duration-300">
          {country.name}
        </h2>
        <p className="relative text-xs text-text-secondary mt-1 font-serif italic">{country.tagline}</p>
        <div className="relative mt-3 flex items-center gap-2">
          <span className="text-[10px] text-gold uppercase tracking-wider">
            {count} places
          </span>
          <motion.span
            className="text-gold text-xs"
            initial={{ x: 0 }}
            whileHover={{ x: 4 }}
          >
            →
          </motion.span>
        </div>
      </Link>
    </motion.div>
  )
}
