import { motion } from 'framer-motion'

export default function LocationFilter({ locations, counts, active, onChange }) {
  if (!locations || locations.length < 2) return null

  const total = Object.values(counts || {}).reduce((sum, c) => sum + c, 0)

  function FilterButton({ value, label, count }) {
    const isActive = active === value
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onChange(value)}
        className={`px-3.5 py-2 text-[11px] tracking-[0.1em] uppercase border rounded-lg transition-all duration-300 cursor-pointer font-light flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none ${
          isActive
            ? 'bg-accent/10 border-accent/25 text-accent'
            : 'border-border text-text-dim hover:text-text-secondary hover:border-border-hover hover:bg-bg-elevated'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={isActive ? 'opacity-100' : 'opacity-30'}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {label}
        {count != null && (
          <span className={`text-[10px] tabular-nums ${isActive ? 'text-accent/50' : 'text-text-dim/40'}`}>
            {count}
          </span>
        )}
      </motion.button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <FilterButton value="all" label="All Cities" count={total} />
      {locations.map((loc) => (
        <FilterButton key={loc} value={loc} label={loc} count={counts?.[loc]} />
      ))}
    </div>
  )
}
