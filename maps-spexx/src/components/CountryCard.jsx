import { Link } from 'react-router-dom'

export default function CountryCard({ country, count, locked, onLockedClick }) {
  if (locked) {
    return (
      <button
        onClick={onLockedClick}
        className="relative bg-bg-card border border-border rounded-sm p-6 text-left transition-all hover:border-white/15 cursor-pointer group"
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
      </button>
    )
  }

  return (
    <Link
      to={`/${country.slug}`}
      className="relative bg-bg-card border border-border rounded-sm p-6 transition-all hover:border-gold/30 hover:bg-gold-faint group no-underline"
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-3xl">{country.flag_emoji}</span>
        <span className="text-[10px] text-gold uppercase tracking-widest">{country.region}</span>
      </div>
      <h2 className="font-heading text-2xl tracking-wide text-white group-hover:text-gold transition-colors">
        {country.name}
      </h2>
      <p className="text-xs text-text-secondary mt-1 font-serif italic">{country.tagline}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] text-gold uppercase tracking-wider">
          {count} places
        </span>
        <span className="text-gold text-xs">→</span>
      </div>
    </Link>
  )
}
