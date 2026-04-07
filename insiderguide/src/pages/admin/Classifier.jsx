import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { classifyMiscBusinesses } from '../../lib/classifier'

const CAT_COLORS = {
  eat: '#7B9EBC',
  cafe: '#C4956A',
  drink: '#9B82B0',
  stay: '#7BAA8E',
  do: '#C07A8E',
  explore: '#6BA5A5',
  wellness: '#B5A36A',
  essentials: '#8A8A8A',
  misc: '#555',
}

export default function AdminClassifier() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(0)
  const [selections, setSelections] = useState({})
  const [filterCat, setFilterCat] = useState('all')
  const [filterConf, setFilterConf] = useState('all')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('businesses')
        .select('id, name, category, description, location, city, countries(name, slug)')
        .or('category.eq.misc,category.is.null')
        .order('name')

      if (data) {
        const classified = classifyMiscBusinesses(data)
        setResults(classified)

        // Auto-select high-confidence suggestions
        const auto = {}
        classified.forEach(({ business, suggestion }) => {
          if (suggestion && suggestion.confidence >= 0.4) {
            auto[business.id] = suggestion.category
          }
        })
        setSelections(auto)
      }
      setLoading(false)
    }
    load()
  }, [])

  function handleSelect(id, category) {
    setSelections((prev) => {
      if (prev[id] === category) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: category }
    })
  }

  function selectAll() {
    const next = {}
    results.forEach(({ business, suggestion }) => {
      if (suggestion) {
        next[business.id] = suggestion.category
      }
    })
    setSelections(next)
  }

  function clearAll() {
    setSelections({})
  }

  async function handleSave() {
    const entries = Object.entries(selections)
    if (entries.length === 0) return

    setSaving(true)
    setSaved(0)
    let count = 0

    // Batch in groups of 20
    for (let i = 0; i < entries.length; i += 20) {
      const batch = entries.slice(i, i + 20)
      const promises = batch.map(([id, category]) =>
        supabase.from('businesses').update({ category }).eq('id', id)
      )
      await Promise.all(promises)
      count += batch.length
      setSaved(count)
    }

    // Remove saved items from results
    const savedIds = new Set(entries.map(([id]) => id))
    setResults((prev) => prev.filter(({ business }) => !savedIds.has(business.id)))
    setSelections({})
    setSaving(false)
  }

  // Stats
  const totalMisc = results.length
  const withSuggestion = results.filter((r) => r.suggestion).length
  const selected = Object.keys(selections).length
  const highConf = results.filter((r) => r.suggestion && r.suggestion.confidence >= 0.6).length

  // Category distribution of suggestions
  const catDist = {}
  results.forEach(({ suggestion }) => {
    if (suggestion) {
      catDist[suggestion.category] = (catDist[suggestion.category] || 0) + 1
    }
  })

  // Filter
  const filtered = results.filter(({ suggestion }) => {
    if (filterCat !== 'all' && suggestion?.category !== filterCat) return false
    if (filterConf === 'high' && (!suggestion || suggestion.confidence < 0.6)) return false
    if (filterConf === 'medium' && (!suggestion || suggestion.confidence < 0.3 || suggestion.confidence >= 0.6)) return false
    if (filterConf === 'low' && (suggestion && suggestion.confidence >= 0.3)) return false
    if (filterConf === 'none' && suggestion) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-sm">Analyzing {totalMisc || ''} businesses...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Dashboard
            </Link>
            <span className="text-gold text-sm tracking-wider block mt-1">Auto-Classifier</span>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <span className="text-[10px] text-text-dim">
              {selected} selected
            </span>
            <button
              onClick={async () => { selectAll(); setTimeout(() => document.getElementById('save-btn')?.click(), 100) }}
              disabled={saving}
              className="text-[10px] uppercase tracking-wider px-3 py-1.5 bg-green-600 text-white font-bold rounded-sm cursor-pointer disabled:opacity-40 transition-colors"
            >
              Classify & Save All
            </button>
            <button
              onClick={selectAll}
              className="text-[10px] uppercase tracking-wider px-3 py-1.5 border border-border text-text-dim hover:border-gold/40 hover:text-gold rounded-sm cursor-pointer transition-colors"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="text-[10px] uppercase tracking-wider px-3 py-1.5 border border-border text-text-dim hover:border-red-400/40 hover:text-red-400 rounded-sm cursor-pointer transition-colors"
            >
              Clear
            </button>
            <button
              id="save-btn"
              onClick={handleSave}
              disabled={selected === 0 || saving}
              className="text-[10px] uppercase tracking-wider px-4 py-1.5 bg-gold text-black font-bold rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? `Saving ${saved}/${selected}...` : `Save ${selected} Changes`}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-gold block">{totalMisc}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Misc Total</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-green-400 block">{withSuggestion}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Has Suggestion</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-green-300 block">{highConf}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">High Confidence</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-yellow-400 block">{totalMisc - withSuggestion}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">No Match</span>
          </div>
          <div className="bg-bg-card border border-border rounded-sm p-3 text-center">
            <span className="text-xl text-blue-400 block">{selected}</span>
            <span className="text-[9px] text-text-dim uppercase tracking-wider">Selected</span>
          </div>
        </div>

        {/* Category distribution */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilterCat('all')}
            className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full border cursor-pointer transition-colors ${
              filterCat === 'all' ? 'bg-gold/15 border-gold/40 text-gold' : 'border-border text-text-dim hover:border-border'
            }`}
          >
            All ({totalMisc})
          </button>
          {Object.entries(catDist).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
              className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full border cursor-pointer transition-colors ${
                filterCat === cat ? 'bg-gold/15 border-gold/40 text-gold' : 'border-border text-text-dim hover:border-border'
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: CAT_COLORS[cat] || '#666' }} />
              {cat} ({count})
            </button>
          ))}
          <span className="w-px h-6 bg-border self-center mx-1" />
          {['high', 'medium', 'low', 'none'].map((level) => (
            <button
              key={level}
              onClick={() => setFilterConf(filterConf === level ? 'all' : level)}
              className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full border cursor-pointer transition-colors ${
                filterConf === level ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' : 'border-border text-text-dim hover:border-border'
              }`}
            >
              {level} conf
            </button>
          ))}
        </div>

        {/* Results list */}
        <div className="space-y-1">
          {filtered.map(({ business, suggestion }) => {
            const selectedCat = selections[business.id]
            return (
              <div
                key={business.id}
                className={`flex items-center gap-4 px-4 py-3 rounded-sm border transition-colors ${
                  selectedCat
                    ? 'bg-gold/5 border-gold/20'
                    : 'bg-bg-card border-border'
                }`}
              >
                {/* Business info */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white block truncate">{business.name}</span>
                  <span className="text-[10px] text-text-dim">
                    {business.city || 'no city'} · {business.countries?.slug || '?'}
                  </span>
                </div>

                {/* Suggestion */}
                {suggestion ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium"
                      style={{
                        color: CAT_COLORS[suggestion.category],
                        borderColor: CAT_COLORS[suggestion.category] + '40',
                        background: CAT_COLORS[suggestion.category] + '10',
                      }}
                    >
                      {suggestion.category}
                    </span>
                    <span className={`text-[10px] tabular-nums ${
                      suggestion.confidence >= 0.6 ? 'text-green-400' :
                      suggestion.confidence >= 0.3 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-text-dim">No match</span>
                )}

                {/* Category buttons */}
                <div className="flex gap-1">
                  {['eat', 'cafe', 'drink', 'stay', 'explore', 'do', 'wellness', 'essentials'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleSelect(business.id, cat)}
                      className={`text-[9px] uppercase px-2 py-1 rounded-sm border cursor-pointer transition-all ${
                        selectedCat === cat
                          ? 'border-gold/60 bg-gold/20 text-gold font-bold'
                          : suggestion?.category === cat
                          ? 'border-border text-text-dim/80 hover:border-gold/30'
                          : 'border-transparent text-text-dim/40 hover:border-border hover:text-text-dim'
                      }`}
                      title={cat}
                    >
                      {cat.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-dim text-sm">
            {totalMisc === 0 ? 'No misc businesses to classify!' : 'No results match current filters.'}
          </div>
        )}
      </div>
    </div>
  )
}
