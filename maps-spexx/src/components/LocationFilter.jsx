import { motion } from 'framer-motion'

export default function LocationFilter({ locations, counts, active, onChange }) {
  if (!locations || locations.length < 2) return null

  const total = Object.values(counts || {}).reduce((sum, c) => sum + c, 0)

  return (
    <div className="flex flex-wrap gap-2">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onChange('all')}
        className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded-full transition-all cursor-pointer font-body flex items-center gap-2 ${
          active === 'all'
            ? 'bg-gold/15 border-gold/40 text-gold shadow-[0_0_12px_rgba(200,155,60,0.15)]'
            : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
        }`}
      >
        All Cities
        <span className={`text-[9px] tabular-nums ${active === 'all' ? 'text-gold/60' : 'text-text-dim/60'}`}>
          {total}
        </span>
      </motion.button>
      {locations.map((loc) => (
        <motion.button
          key={loc}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(loc)}
          className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded-full transition-all cursor-pointer font-body flex items-center gap-2 ${
            active === loc
              ? 'bg-gold/15 border-gold/40 text-gold shadow-[0_0_12px_rgba(200,155,60,0.15)]'
              : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
          }`}
        >
          {loc}
          {counts && counts[loc] && (
            <span className={`text-[9px] tabular-nums ${active === loc ? 'text-gold/60' : 'text-text-dim/60'}`}>
              {counts[loc]}
            </span>
          )}
        </motion.button>
      ))}
    </div>
  )
}
