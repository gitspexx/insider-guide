import { motion } from 'framer-motion'

const CATEGORY_COLORS = {
  eat: 'text-blue-400',
  cafe: 'text-orange-400',
  drink: 'text-purple-400',
  stay: 'text-green-400',
  do: 'text-pink-400',
  explore: 'text-cyan-400',
  wellness: 'text-yellow-400',
  misc: 'text-gray-400',
}

const CATEGORY_GLOW = {
  eat: 'group-hover:shadow-[0_0_20px_rgba(96,165,250,0.06)]',
  cafe: 'group-hover:shadow-[0_0_20px_rgba(251,146,60,0.06)]',
  drink: 'group-hover:shadow-[0_0_20px_rgba(192,132,252,0.06)]',
  stay: 'group-hover:shadow-[0_0_20px_rgba(74,222,128,0.06)]',
  do: 'group-hover:shadow-[0_0_20px_rgba(244,114,182,0.06)]',
  explore: 'group-hover:shadow-[0_0_20px_rgba(34,211,238,0.06)]',
  wellness: 'group-hover:shadow-[0_0_20px_rgba(250,204,21,0.06)]',
  misc: 'group-hover:shadow-[0_0_20px_rgba(156,163,175,0.06)]',
}

export default function BusinessCard({ business, index = 0 }) {
  const isPartner = business.tier === 'partner'
  const isFeatured = business.tier === 'featured'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`group relative bg-bg-card border rounded-sm p-5 transition-all duration-300 overflow-hidden ${
        isPartner
          ? 'border-gold/40 col-span-full md:col-span-2 hover:shadow-[0_4px_30px_rgba(200,155,60,0.15)]'
          : isFeatured
          ? 'border-gold/20 hover:shadow-[0_4px_24px_rgba(200,155,60,0.08)]'
          : `border-border hover:border-white/10 ${CATEGORY_GLOW[business.category] || ''}`
      }`}
    >
      {/* Subtle gradient overlay on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${
        isPartner
          ? 'bg-gradient-to-br from-gold/[0.03] via-transparent to-transparent'
          : 'bg-gradient-to-br from-white/[0.02] via-transparent to-transparent'
      }`} />

      {isPartner && (
        <div className="absolute top-3 right-3 bg-gold text-bg text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm font-heading z-10">
          Partner
        </div>
      )}

      <div className="relative flex items-start justify-between gap-3 mb-2">
        <div>
          <span className={`text-[10px] uppercase tracking-widest ${CATEGORY_COLORS[business.category] || 'text-text-dim'}`}>
            {business.category}
          </span>
          <h3 className={`font-heading text-lg tracking-wide leading-tight mt-0.5 ${isPartner ? 'text-gold' : 'text-white'}`}>
            {business.name}
          </h3>
        </div>
      </div>

      {business.description && (
        <p className={`relative text-xs leading-relaxed mb-3 ${isPartner ? 'text-text-secondary font-serif italic' : 'text-text-dim'}`}>
          {business.description}
        </p>
      )}

      {business.location && (
        <p className="relative text-[10px] text-text-dim uppercase tracking-wider mb-3">
          {business.location}
        </p>
      )}

      {business.recommended_badge && (
        <div className="relative inline-flex items-center gap-1.5 text-[10px] text-gold uppercase tracking-wider mb-3">
          <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
          Recommended by Alex
        </div>
      )}

      <div className="relative flex gap-2 mt-auto pt-2 border-t border-border">
        {business.google_maps_url && (
          <a
            href={business.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-sm hover:bg-gold-faint hover:shadow-[0_0_8px_rgba(200,155,60,0.1)] transition-all"
          >
            Maps
          </a>
        )}
        {business.instagram_handle && (
          <a
            href={business.instagram_handle.startsWith('http') ? business.instagram_handle : `https://instagram.com/${business.instagram_handle.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary hover:border-white/15 transition-all"
          >
            Instagram
          </a>
        )}
      </div>
    </motion.div>
  )
}
