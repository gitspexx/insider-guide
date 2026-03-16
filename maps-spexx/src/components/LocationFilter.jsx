export default function LocationFilter({ locations, active, onChange }) {
  if (!locations || locations.length < 2) return null

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange('all')}
        className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded transition-all cursor-pointer font-body ${
          active === 'all'
            ? 'bg-gold-faint border-gold/30 text-gold'
            : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
        }`}
      >
        All Cities
      </button>
      {locations.map((loc) => (
        <button
          key={loc}
          onClick={() => onChange(loc)}
          className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded transition-all cursor-pointer font-body ${
            active === loc
              ? 'bg-gold-faint border-gold/30 text-gold'
              : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
          }`}
        >
          {loc}
        </button>
      ))}
    </div>
  )
}
