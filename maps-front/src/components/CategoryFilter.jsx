import { motion } from 'framer-motion'

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'eat', label: 'Eat' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'drink', label: 'Drink' },
  { value: 'stay', label: 'Stay' },
  { value: 'do', label: 'Do' },
  { value: 'explore', label: 'Explore' },
  { value: 'wellness', label: 'Wellness' },
]

export default function CategoryFilter({ active, onChange, businesses = [] }) {
  const categoryCounts = {}
  businesses.forEach((b) => {
    if (b.category) {
      categoryCounts[b.category] = (categoryCounts[b.category] || 0) + 1
    }
  })

  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((cat) => {
        const count = cat.value === 'all' ? businesses.length : (categoryCounts[cat.value] || 0)
        if (cat.value !== 'all' && count === 0) return null

        return (
          <motion.button
            key={cat.value}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(cat.value)}
            className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded-full transition-colors cursor-pointer font-body flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active === cat.value
                ? 'bg-gold/15 border-gold/40 text-gold shadow-[0_0_12px_rgba(200,155,60,0.15)]'
                : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
            }`}
          >
            {cat.label}
            <span className={`text-[9px] tabular-nums ${active === cat.value ? 'text-gold/60' : 'text-text-dim/60'}`}>
              {count}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
