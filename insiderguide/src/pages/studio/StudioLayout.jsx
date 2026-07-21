// insiderguide/src/pages/studio/StudioLayout.jsx
import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TABS = [
  { to: '/studio', label: 'My Spots', end: true },
  { to: '/studio/import', label: 'Import' },
  { to: '/studio/approvals', label: 'Approvals' },
  { to: '/studio/earnings', label: 'Earnings' },
  { to: '/studio/settings', label: 'Page Settings' },
]

export default function StudioLayout() {
  const [creator, setCreator] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('creators').select('*').eq('id', session.user.id).maybeSingle()
      if (!cancelled) setCreator(data)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-display text-lg text-text">Studio</span>
          <nav className="flex gap-4">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) =>
                  `text-xs uppercase tracking-[0.12em] ${isActive ? 'text-accent' : 'text-text-dim hover:text-text-secondary'}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {creator && (
            <a href={`/@${creator.handle}`} target="_blank" rel="noreferrer"
               className="text-xs text-accent hover:underline">
              insiderguide.co/@{creator.handle} ↗
            </a>
          )}
          <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = '/'))}
                  className="text-xs text-text-dim hover:text-text-secondary cursor-pointer">
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Outlet context={{ creator, setCreator }} />
      </main>
    </div>
  )
}
