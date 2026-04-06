import { motion } from 'framer-motion'

const CATEGORIES = [
  { value: 'all', label: 'All', dot: 'bg-text-dim' },
  { value: 'eat', label: 'Eat', dot: 'bg-cat-eat' },
  { value: 'cafe', label: 'Cafe', dot: 'bg-cat-cafe' },
  { value: 'drink', label: 'Drink', dot: 'bg-cat-drink' },
  { value: 'stay', label: 'Stay', dot: 'bg-cat-stay' },
  { value: 'do', label: 'Do', dot: 'bg-cat-do' },
  { value: 'explore', label: 'Explore', dot: 'bg-cat-explore' },
  { value: 'wellness', label: 'Wellness', dot: 'bg-cat-wellness' },
  { value: 'essentials', label: 'Essentials', dot: 'bg-cat-essentials' },
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

        const isActive = active === cat.value

        return (
          <motion.button
            key={cat.value}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(cat.value)}
            className={`px-3.5 py-2 text-[11px] tracking-[0.1em] uppercase border rounded-lg transition-all duration-300 cursor-pointer font-light flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none ${
              isActive
                ? 'bg-accent/10 border-accent/25 text-accent'
                : 'border-border text-text-dim hover:text-text-secondary hover:border-border-hover hover:bg-bg-elevated'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${cat.dot} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
            {cat.label}
            <span className={`text-[10px] tabular-nums ${isActive ? 'text-accent/50' : 'text-text-dim/40'}`}>
              {count}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
