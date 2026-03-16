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

export default function CategoryFilter({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={`px-4 py-1.5 text-xs uppercase tracking-widest border rounded transition-all cursor-pointer font-body ${
            active === cat.value
              ? 'bg-gold-faint border-gold/30 text-gold'
              : 'border-border text-text-dim hover:text-text-secondary hover:border-white/15'
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
