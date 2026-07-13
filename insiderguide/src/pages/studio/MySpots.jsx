// insiderguide/src/pages/studio/MySpots.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

async function fetchSaves() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  // Creators cannot read `businesses` directly — details come from the
  // my_saved_businesses view; countries mapped client-side.
  const [savesRes, bizRes, countriesRes] = await Promise.all([
    supabase.from('creator_saves')
      .select('id, business_id, note, hidden, created_at')
      .eq('creator_id', session.user.id)
      .order('created_at', { ascending: false }),
    supabase.from('my_saved_businesses')
      .select('id, name, category, city, location, enrich_status, photo_url, country_id'),
    supabase.from('countries').select('id, name, flag_emoji'),
  ])
  if (savesRes.error || bizRes.error) return null
  const bizMap = new Map((bizRes.data || []).map((b) => [b.id, b]))
  const countryMap = new Map((countriesRes.data || []).map((c) => [c.id, c]))
  return (savesRes.data || []).map((s) => {
    const b = bizMap.get(s.business_id)
    return { ...s, business: b ? { ...b, country: countryMap.get(b.country_id) } : null }
  })
}

export default function MySpots() {
  const [saves, setSaves] = useState(null)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await fetchSaves()
      if (!cancelled && result !== null) setSaves(result)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function reload() {
    const result = await fetchSaves()
    if (result !== null) setSaves(result)
  }

  async function updateSave(id, patch) {
    setSavingId(id)
    await supabase.from('creator_saves').update(patch).eq('id', id)
    setSavingId(null)
    reload()
  }

  async function removeSave(id) {
    if (!confirm('Remove this spot from your page?')) return
    await supabase.from('creator_saves').delete().eq('id', id)
    reload()
  }

  if (saves === null) return <p className="text-text-dim text-sm">Loading…</p>

  if (saves.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="font-display text-2xl mb-2">No spots yet</h2>
        <p className="text-text-dim text-sm mb-6">Import your Google Maps saved places to build your page.</p>
        <Link to="/studio/import"
              className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm">
          Start import
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">My Spots <span className="text-text-dim text-base">({saves.length})</span></h1>
        <Link to="/studio/import" className="text-xs text-accent uppercase tracking-wider">+ Import more</Link>
      </div>
      <div className="flex flex-col gap-3">
        {saves.map((s) => (
          <div key={s.id}
               className={`bg-bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 ${s.hidden ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-text truncate">{s.business?.name || 'Unknown place'}</span>
                <span className="text-xs text-text-dim">
                  {s.business?.country?.flag_emoji} {s.business?.city || s.business?.location || ''}
                </span>
                {s.business?.enrich_status === 'pending_enrich' && (
                  <span className="text-[10px] uppercase tracking-wider text-accent-dim border border-border px-2 py-0.5 rounded-full">enriching…</span>
                )}
              </div>
              <input
                defaultValue={s.note}
                placeholder="Your personal note (shown on your page)"
                onBlur={(e) => e.target.value !== s.note && updateSave(s.id, { note: e.target.value })}
                className="mt-2 w-full bg-transparent border border-border rounded-sm px-3 py-2 text-sm text-text-secondary placeholder:text-text-dim focus:border-accent/30 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => updateSave(s.id, { hidden: !s.hidden })}
                      disabled={savingId === s.id}
                      className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-2 rounded-lg hover:text-text-secondary cursor-pointer">
                {s.hidden ? 'Show' : 'Hide'}
              </button>
              <button onClick={() => removeSave(s.id)}
                      className="text-xs uppercase tracking-wider text-red-400/70 border border-border px-3 py-2 rounded-lg hover:text-red-400 cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
