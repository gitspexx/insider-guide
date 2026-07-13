import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

async function fetchCreators() {
  const { data } = await supabase.from('creators').select('*').order('created_at', { ascending: false })
  return data || []
}

export default function AdminCreators() {
  const [creators, setCreators] = useState([])
  const [form, setForm] = useState({ email: '', handle: '', display_name: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Async fn inside the effect + a separate reload() — the flat
  // react-hooks/set-state-in-effect rule rejects a useCallback loader that
  // setStates synchronously when called from an effect (see MySpots.jsx).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const rows = await fetchCreators()
      if (!cancelled) setCreators(rows)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function reload() {
    setCreators(await fetchCreators())
  }

  async function call(body) {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('invite-creator', { body })
    setBusy(false)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return false }
    reload()
    return true
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (await call({ action: 'invite', ...form })) {
      setMsg(`Invited ${form.email} as @${form.handle}. They sign in at /studio/login.`)
      setForm({ email: '', handle: '', display_name: '' })
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="font-heading text-xl text-white mb-6">Creators</h1>

      <form onSubmit={handleInvite} className="bg-bg-card border border-border rounded-xl p-5 mb-8 grid md:grid-cols-4 gap-3">
        <input required type="email" placeholder="Email" value={form.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input required placeholder="handle" value={form.handle} pattern="[a-z0-9_.]{3,30}"
               onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input placeholder="Display name" value={form.display_name}
               onChange={(e) => setForm({ ...form, display_name: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <button disabled={busy} className="bg-gold text-bg text-sm uppercase tracking-wider rounded-sm cursor-pointer disabled:opacity-50">
          {busy ? '…' : 'Invite'}
        </button>
      </form>
      {msg && <p className="text-xs text-gold mb-4">{msg}</p>}

      <div className="flex flex-col gap-2">
        {creators.map((c) => (
          <div key={c.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <a href={`/@${c.handle}`} target="_blank" rel="noreferrer" className="text-sm text-white hover:text-gold">@{c.handle}</a>
              <span className="text-xs text-text-dim ml-3">{c.display_name}</span>
              <span className={`text-[10px] uppercase tracking-wider ml-3 ${c.status === 'active' ? 'text-gold' : 'text-red-400/70'}`}>{c.status}</span>
            </div>
            <button onClick={() => call({ action: 'set_status', creator_id: c.id, status: c.status === 'active' ? 'paused' : 'active' })}
                    className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-white cursor-pointer">
              {c.status === 'active' ? 'Pause' : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
