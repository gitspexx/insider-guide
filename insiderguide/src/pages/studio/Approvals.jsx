// insiderguide/src/pages/studio/Approvals.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Creator approval queue: applications + claims for the countries this
// creator covers (creator_pending_approvals RPC is caller-scoped server-side).
// Actions go through the approve-application edge fn, which authorizes the
// caller as the covering creator.

const TIER_PRICES = { listed: 'free', complete: '$50', featured: '$200', partner: '$500' }

export default function StudioApprovals() {
  const [items, setItems] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [tierPick, setTierPick] = useState({})

  async function load() {
    const { data, error } = await supabase.rpc('creator_pending_approvals')
    setItems(error ? [] : (data || []))
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data, error } = await supabase.rpc('creator_pending_approvals')
      if (!cancelled) setItems(error ? [] : (data || []))
    }
    init()
    return () => { cancelled = true }
  }, [])

  async function act(item, action, tier) {
    setBusyId(item.ref_id); setMsg(null)
    const body = item.kind === 'claim'
      ? { action: action === 'approve' ? 'approve_claim' : 'reject_claim', claim_id: item.ref_id }
      : { action, business_id: item.business_id, tier }
    const { data, error } = await supabase.functions.invoke('approve-application', { body })
    setBusyId(null)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return }
    setMsg(action === 'reject'
      ? `Rejected ${item.business_name}.`
      : item.kind === 'claim'
        ? `Claim approved — Complete ($50) upsell sent to ${item.email}.`
        : data.invoice
          ? `Approved — invoice ${data.invoice} sent to ${item.email}.`
          : `Approved — ${item.business_name} is live, welcome email sent.`)
    load()
  }

  if (items === null) return <p className="text-text-dim text-sm">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl mb-1">Approvals</h1>
      <p className="text-text-dim text-xs mb-6">
        Businesses applying or claiming their listing in the countries you cover.
        Paid tiers get an invoice; claims get the $50 Complete offer. You earn 30% of every deal.
      </p>
      {msg && <p className="text-xs text-accent mb-4">{msg}</p>}

      {items.length === 0 && (
        <p className="text-text-dim text-sm">Nothing pending. New applications and claims appear here.</p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((it) => {
          const pick = tierPick[it.ref_id] || (it.kind === 'claim' ? 'complete' : it.tier_interest) || 'listed'
          return (
            <div key={`${it.kind}-${it.ref_id}`} className="bg-bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-text">{it.business_name}</span>
                <span className="text-xs text-text-dim">{it.country_name}{it.city ? ` · ${it.city}` : ''} · {it.category}</span>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  it.kind === 'claim' ? 'text-accent border-accent/30' : 'text-text-dim border-border'}`}>
                  {it.kind === 'claim' ? 'claim request' : `wants ${it.tier_interest} (${TIER_PRICES[it.tier_interest] || 'free'})`}
                </span>
                <span className="text-xs text-text-dim">{it.email}</span>
              </div>
              {it.pitch && <p className="text-xs text-text-secondary leading-relaxed">{it.pitch}</p>}
              <div className="flex items-center gap-2 pt-1">
                {it.kind !== 'claim' && (
                  <select value={pick} onChange={(e) => setTierPick({ ...tierPick, [it.ref_id]: e.target.value })}
                          className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-text">
                    <option value="listed">listed (free)</option>
                    <option value="complete">complete ($50)</option>
                    <option value="featured">featured ($200)</option>
                    <option value="partner">partner ($500)</option>
                  </select>
                )}
                <button onClick={() => act(it, 'approve', pick)} disabled={busyId === it.ref_id}
                        className="text-xs uppercase tracking-wider bg-accent text-bg px-4 py-1.5 rounded-sm cursor-pointer disabled:opacity-50">
                  {busyId === it.ref_id ? '…'
                    : it.kind === 'claim' ? 'Approve claim'
                    : pick === 'listed' ? 'Approve + publish' : 'Approve + send invoice'}
                </button>
                <button onClick={() => act(it, 'reject')} disabled={busyId === it.ref_id}
                        className="text-xs uppercase tracking-wider text-red-400/70 border border-border px-3 py-1.5 rounded-lg hover:text-red-400 cursor-pointer">
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
