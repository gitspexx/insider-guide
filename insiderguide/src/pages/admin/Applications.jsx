import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Partner-page applications land as businesses rows tagged [partner-signup]
// in notes (published=false). Approve fires the approve-application edge fn:
// paid tiers get the invoice email (bank details + Stripe checkout link),
// listed gets published + a welcome email. Slack is notified either way.

const TIER_PRICES = { listed: 'free', complete: '$50', featured: '$200', partner: '$500' }

function parseApp(notes) {
  // Free-form applications say "Tier interest: X"; checkout pending rows say
  // "Tier intent: X" with a [partner-signup-paid] marker.
  const tier = notes?.match(/Tier inte(?:rest|nt): (\w+)/)?.[1] || 'listed'
  const paidPending = /\[partner-signup-paid\]/.test(notes || '')
  const approved = /\[application-approved/.test(notes || '')
  const rejected = /\[application-rejected\]/.test(notes || '')
  const invoice = notes?.match(/\[invoice (IG-[\d-]+)\]/)?.[1] || null
  const pitch = (notes || '')
    .replace(/\[partner-signup(-paid)?\][^.]*\.( Prefers a quick call\.)?/, '')
    .replace(/\[application-[^\]]*\]/g, '')
    .replace(/\[invoice [^\]]*\]/g, '')
    .replace(/\[ref [^\]]*\]/g, '')
    .trim()
  const prefersCall = /Prefers a quick call/.test(notes || '')
  return { tier, paidPending, approved, rejected, invoice, pitch, prefersCall }
}

export default function AdminApplications() {
  const [apps, setApps] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [tierPick, setTierPick] = useState({}) // business_id → tier override

  async function load() {
    const { data } = await supabase.from('businesses')
      .select('id, name, email, city, category, website, instagram_handle, notes, published, tier_paid, paid_pending_tier, created_at, countries(name, flag_emoji, slug)')
      .ilike('notes', '%[partner-signup%')
      .order('created_at', { ascending: false })
      .limit(200)
    setApps(data || [])
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data } = await supabase.from('businesses')
        .select('id, name, email, city, category, website, instagram_handle, notes, published, tier_paid, paid_pending_tier, created_at, countries(name, flag_emoji, slug)')
        .ilike('notes', '%[partner-signup%')
        .order('created_at', { ascending: false })
        .limit(200)
      if (!cancelled) setApps(data || [])
    }
    init()
    return () => { cancelled = true }
  }, [])

  async function act(app, action, tier) {
    setBusyId(app.id); setMsg(null)
    const { data, error } = await supabase.functions.invoke('approve-application', {
      body: { business_id: app.id, action, tier },
    })
    setBusyId(null)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return }
    setMsg(action === 'reject'
      ? `Rejected ${app.name}.`
      : data.invoice
        ? `Approved ${app.name} — invoice ${data.invoice} sent to ${app.email}.`
        : `Approved ${app.name} — free listing published, welcome email sent.`)
    load()
  }

  if (apps === null) return <div className="max-w-5xl mx-auto px-6 py-8"><p className="text-text-dim text-sm">Loading…</p></div>

  const pending = apps.filter((a) => { const p = parseApp(a.notes); return !p.approved && !p.rejected })
  const handled = apps.filter((a) => { const p = parseApp(a.notes); return p.approved || p.rejected })

  function Card({ app }) {
    const p = parseApp(app.notes)
    const pick = tierPick[app.id] || p.tier
    return (
      <div className="bg-bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-white">{app.name}</span>
          <span className="text-xs text-text-dim">{app.countries?.flag_emoji} {app.countries?.name}{app.city ? ` · ${app.city}` : ''} · {app.category}</span>
          <span className="text-[10px] uppercase tracking-wider text-gold border border-gold/30 px-2 py-0.5 rounded-full">
            wants {p.tier} ({TIER_PRICES[p.tier]})
          </span>
          {p.prefersCall && <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-2 py-0.5 rounded-full">prefers call</span>}
          {p.invoice && <span className="text-[10px] text-gold">{p.invoice}</span>}
          {p.rejected && <span className="text-[10px] uppercase text-red-400/70">rejected</span>}
          {p.approved && <span className="text-[10px] uppercase text-green-400/70">approved</span>}
          {p.paidPending && !app.tier_paid && (
            <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-2 py-0.5 rounded-full">awaiting payment</span>
          )}
          {app.tier_paid && !app.published && (
            <a href={`/admin/businesses/${app.id}/edit`}
               className="text-[10px] uppercase tracking-wider text-bg bg-gold px-2 py-0.5 rounded-full no-underline">
              PAID — complete details &amp; publish →
            </a>
          )}
          {app.tier_paid && app.published && <span className="text-[10px] uppercase text-green-400">paid · live</span>}
        </div>
        <div className="text-xs text-text-dim flex gap-3 flex-wrap">
          <span>{app.email}</span>
          {app.instagram_handle && <span>@{app.instagram_handle.replace('@', '')}</span>}
          {app.website && <a href={app.website} target="_blank" rel="noreferrer" className="text-gold hover:underline">site</a>}
        </div>
        {p.pitch && <p className="text-xs text-text-secondary leading-relaxed">{p.pitch}</p>}
        {!p.approved && !p.rejected && (
          <div className="flex items-center gap-2 pt-1">
            <select value={pick} onChange={(e) => setTierPick({ ...tierPick, [app.id]: e.target.value })}
                    className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
              <option value="listed">listed (free)</option>
              <option value="complete">complete ($50)</option>
              <option value="featured">featured ($200)</option>
              <option value="partner">partner ($500)</option>
            </select>
            <button onClick={() => act(app, 'approve', pick)} disabled={busyId === app.id}
                    className="text-xs uppercase tracking-wider bg-gold text-bg px-4 py-1.5 rounded-sm cursor-pointer disabled:opacity-50">
              {busyId === app.id ? '…' : pick === 'listed' ? 'Approve + publish' : 'Approve + send invoice'}
            </button>
            <button onClick={() => act(app, 'reject')} disabled={busyId === app.id}
                    className="text-xs uppercase tracking-wider text-red-400/70 border border-border px-3 py-1.5 rounded-lg hover:text-red-400 cursor-pointer">
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="font-heading text-xl text-white mb-2">Applications</h1>
      <p className="text-xs text-text-dim mb-6">
        Approve paid tiers → applicant gets an invoice (bank details + card payment link). Payment flips the tier automatically.
      </p>
      {msg && <p className="text-xs text-gold mb-4">{msg}</p>}

      <h2 className="text-[10px] uppercase tracking-wider text-text-dim mb-2">Pending ({pending.length})</h2>
      <div className="flex flex-col gap-2 mb-8">
        {pending.map((a) => <Card key={a.id} app={a} />)}
        {pending.length === 0 && <p className="text-text-dim text-xs">No pending applications.</p>}
      </div>

      {handled.length > 0 && (
        <>
          <h2 className="text-[10px] uppercase tracking-wider text-text-dim mb-2">Handled ({handled.length})</h2>
          <div className="flex flex-col gap-2 opacity-70">
            {handled.map((a) => <Card key={a.id} app={a} />)}
          </div>
        </>
      )}
    </div>
  )
}
