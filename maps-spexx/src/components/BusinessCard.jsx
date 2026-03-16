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

export default function BusinessCard({ business }) {
  const isPartner = business.tier === 'partner'
  const isFeatured = business.tier === 'featured'

  return (
    <div
      className={`relative bg-bg-card border rounded-sm p-5 transition-all ${
        isPartner
          ? 'border-gold/40 col-span-full md:col-span-2'
          : isFeatured
          ? 'border-gold/20'
          : 'border-border hover:border-white/15'
      }`}
    >
      {isPartner && (
        <div className="absolute top-3 right-3 bg-gold text-bg text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm font-heading">
          Partner
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-2">
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
        <p className={`text-xs leading-relaxed mb-3 ${isPartner ? 'text-text-secondary font-serif italic' : 'text-text-dim'}`}>
          {business.description}
        </p>
      )}

      {business.location && (
        <p className="text-[10px] text-text-dim uppercase tracking-wider mb-3">
          {business.location}
        </p>
      )}

      {business.recommended_badge && (
        <div className="inline-flex items-center gap-1.5 text-[10px] text-gold uppercase tracking-wider mb-3">
          <span className="w-1.5 h-1.5 bg-gold rounded-full" />
          Recommended by Alex
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-2 border-t border-border">
        {business.google_maps_url && (
          <a
            href={business.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-sm hover:bg-gold-faint transition-colors"
          >
            Maps
          </a>
        )}
        {business.instagram_handle && (
          <a
            href={business.instagram_handle.startsWith('http') ? business.instagram_handle : `https://instagram.com/${business.instagram_handle.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary hover:border-white/15 transition-colors"
          >
            Instagram
          </a>
        )}
      </div>
    </div>
  )
}
