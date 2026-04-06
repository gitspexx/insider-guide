import { motion } from 'framer-motion'

const CATEGORY_STYLES = {
  eat:      { color: 'text-cat-eat',      dot: 'bg-cat-eat',      glow: 'group-hover:shadow-[0_4px_24px_rgba(123,158,188,0.06)]' },
  cafe:     { color: 'text-cat-cafe',     dot: 'bg-cat-cafe',     glow: 'group-hover:shadow-[0_4px_24px_rgba(196,149,106,0.06)]' },
  drink:    { color: 'text-cat-drink',    dot: 'bg-cat-drink',    glow: 'group-hover:shadow-[0_4px_24px_rgba(155,130,176,0.06)]' },
  stay:     { color: 'text-cat-stay',     dot: 'bg-cat-stay',     glow: 'group-hover:shadow-[0_4px_24px_rgba(123,170,142,0.06)]' },
  do:       { color: 'text-cat-do',       dot: 'bg-cat-do',       glow: 'group-hover:shadow-[0_4px_24px_rgba(192,122,142,0.06)]' },
  explore:  { color: 'text-cat-explore',  dot: 'bg-cat-explore',  glow: 'group-hover:shadow-[0_4px_24px_rgba(107,165,165,0.06)]' },
  wellness:   { color: 'text-cat-wellness',   dot: 'bg-cat-wellness',   glow: 'group-hover:shadow-[0_4px_24px_rgba(181,163,106,0.06)]' },
  essentials: { color: 'text-cat-essentials', dot: 'bg-cat-essentials', glow: 'group-hover:shadow-[0_4px_24px_rgba(138,138,138,0.06)]' },
}

const DEFAULT_STYLE = { color: 'text-text-dim', dot: 'bg-text-dim', glow: '' }

export default function BusinessCard({ business, index = 0, isTopPick = false }) {
  const isPartner = business.tier === 'partner'
  const isFeatured = business.tier === 'featured'
  const cat = CATEGORY_STYLES[business.category] || DEFAULT_STYLE

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.035, ease: 'easeOut' }}
      className={`group relative bg-bg-card border rounded-xl overflow-hidden transition-all duration-400 ${
        isTopPick
          ? 'border-border-accent/40 hover:shadow-[0_8px_40px_rgba(200,165,90,0.08)] hover:border-border-accent'
          : isPartner
          ? 'border-border-accent col-span-full md:col-span-2 hover:shadow-[0_8px_40px_rgba(200,165,90,0.08)]'
          : isFeatured
          ? 'border-border-accent/50 hover:shadow-[0_4px_30px_rgba(200,165,90,0.05)]'
          : `border-border hover:border-border-hover ${cat.glow}`
      } hover:bg-bg-elevated`}
    >
      <div className="p-5 md:p-6 flex flex-col h-full">
        {/* Header: category + tier badge */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${cat.dot} opacity-70`} />
            <span className={`text-[11px] tracking-[0.12em] uppercase font-light ${cat.color}`}>
              {business.category}
            </span>
          </div>
          {isPartner && (
            <span className="text-[10px] tracking-[0.12em] uppercase bg-accent/10 text-accent border border-accent/20 px-2.5 py-0.5 rounded-full font-medium">
              Partner
            </span>
          )}
          {isFeatured && (
            <span className="text-[10px] tracking-[0.12em] uppercase text-accent/60 font-light">
              Featured
            </span>
          )}
        </div>

        {/* Name */}
        <h3 className={`font-display text-xl leading-tight mb-1.5 transition-colors duration-300 ${
          isPartner ? 'text-accent' : 'text-text group-hover:text-accent'
        }`}>
          {business.name}
        </h3>

        {/* Description */}
        {business.description && (
          <p className={`text-[13px] leading-relaxed mb-3 ${
            isPartner ? 'font-editorial italic text-text-secondary text-[14px]' : 'text-text-dim'
          }`}>
            {business.description}
          </p>
        )}

        {/* Location */}
        {business.location && (
          <p className="text-[11px] text-text-dim tracking-[0.08em] uppercase font-light mb-3">
            {business.location}
          </p>
        )}

        {/* Recommended badge */}
        {business.recommended_badge && (
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span className="text-[11px] text-accent tracking-[0.08em] uppercase font-light">
              Recommended by Alex
            </span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-border">
          {business.google_maps_url && (
            <a
              href={business.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase font-medium text-accent border border-accent/20 px-3.5 py-2 rounded-lg hover:bg-accent/8 hover:border-accent/30 transition-all focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Maps
            </a>
          )}
          {business.instagram_handle && (
            <a
              href={business.instagram_handle.startsWith('http') ? business.instagram_handle : `https://instagram.com/${business.instagram_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.08em] uppercase font-light text-text-dim border border-border px-3.5 py-2 rounded-lg hover:text-text-secondary hover:border-border-hover transition-all focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Instagram
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
