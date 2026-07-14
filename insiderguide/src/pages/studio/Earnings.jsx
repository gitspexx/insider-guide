// insiderguide/src/pages/studio/Earnings.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Deals write only via edge fn (admin) or the tier_paid trigger — the studio is
// read-only for deals. License request goes through the request_newsletter_license
// RPC. Reel requests toggle their own `status` (column-granted).
async function fetchEarnings() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const uid = session.user.id
  const [creatorRes, dealsRes, bizRes, leadsRes, reqRes] = await Promise.all([
    supabase.from('creators').select('newsletter_license, handle').eq('id', uid).maybeSingle(),
    supabase.from('creator_deals')
      .select('id, business_id, tier, amount_cents, creator_share_cents, status, closed_at')
      .order('closed_at', { ascending: false }),
    supabase.from('my_saved_businesses').select('id, name, city, location'),
    supabase.from('my_leads').select('email, country_slug, created_at').order('created_at', { ascending: false }),
    supabase.from('creator_requests')
      .select('id, business_id, status, notes, created_at')
      .order('created_at', { ascending: false }),
  ])
  if (creatorRes.error || dealsRes.error) return null
  const bizMap = new Map((bizRes.data || []).map((b) => [b.id, b]))
  const deals = (dealsRes.data || []).map((d) => ({ ...d, business: bizMap.get(d.business_id) || null }))
  const requests = (reqRes.data || []).map((r) => ({ ...r, business: bizMap.get(r.business_id) || null }))
  return {
    license: creatorRes.data?.newsletter_license || 'none',
    deals,
    leads: leadsRes.data || [],
    requests,
  }
}

function usd(cents) { return `$${(Number(cents || 0) / 100).toFixed(0)}` }

const STATUS_CHIP = {
  confirmed: 'text-accent border-accent/30',
  paid_out: 'text-green-400 border-green-400/30',
  pending_attribution: 'text-yellow-400 border-yellow-400/30',
}

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default function StudioEarnings() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await fetchEarnings()
      if (!cancelled && result !== null) setData(result)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function reload() {
    const result = await fetchEarnings()
    if (result !== null) setData(result)
  }

  async function requestLicense() {
    setBusy(true)
    await supabase.rpc('request_newsletter_license')
    setBusy(false)
    reload()
  }

  async function setRequestStatus(id, status) {
    setBusy(true)
    await supabase.from('creator_requests').update({ status }).eq('id', id)
    setBusy(false)
    reload()
  }

  function exportLeadsCsv() {
    const rows = data.leads
    const header = 'email,country,date\n'
    const body = rows.map((l) =>
      `${l.email},${l.country_slug || ''},${new Date(l.created_at).toISOString().slice(0, 10)}`).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'insiderguide-leads.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (data === null) return <p className="text-text-dim text-sm">Loading…</p>

  const confirmedShare = data.deals
    .filter((d) => d.status === 'confirmed' || d.status === 'paid_out')
    .reduce((s, d) => s + Number(d.creator_share_cents || 0), 0)
  const pendingShare = data.deals
    .filter((d) => d.status === 'confirmed')
    .reduce((s, d) => s + Number(d.creator_share_cents || 0), 0)
  const openRequests = data.requests.filter((r) => r.status === 'open')

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-2xl">Earnings</h1>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Lifetime earned', value: usd(confirmedShare) },
          { label: 'Pending payout', value: usd(pendingShare) },
          { label: 'Deals', value: String(data.deals.length) },
        ].map((s) => (
          <div key={s.label} className="bg-bg-card border border-border rounded-xl p-5 text-center">
            <span className="font-display text-3xl text-accent block">{s.value}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-dim">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Deals list */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Deals</h2>
        {data.deals.length === 0 ? (
          <p className="text-text-dim text-sm">
            When a business you added becomes a partner, your share appears here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.deals.map((d) => (
              <div key={d.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-text truncate block">{d.business?.name || 'Business'}</span>
                  <span className="text-[11px] text-text-dim">
                    {new Date(d.closed_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-2 py-0.5 rounded-full">
                  {d.tier}
                </span>
                <span className="text-sm text-text-secondary">{usd(d.amount_cents)}</span>
                <span className="text-sm text-accent">your {usd(d.creator_share_cents)}</span>
                <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${STATUS_CHIP[d.status] || 'text-text-dim border-border'}`}>
                  {d.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Leads */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">
            Leads <span className="text-text-dim">({data.leads.length})</span>
          </h2>
          {data.leads.length > 0 && (
            <button onClick={exportLeadsCsv}
                    className="inline-flex items-center gap-1.5 text-xs text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 cursor-pointer">
              <IconDownload /> Export CSV
            </button>
          )}
        </div>
        {data.leads.length === 0 ? (
          <p className="text-text-dim text-sm">Emails captured on your page will show here.</p>
        ) : (
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {data.leads.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm">
                <span className="text-text flex-1 truncate">{l.email}</span>
                <span className="text-text-dim text-xs">{l.country_slug || '—'}</span>
                <span className="text-text-dim text-xs">{new Date(l.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Newsletter license card */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Newsletter license</h2>
        <div className="bg-bg-card border border-border rounded-xl p-5">
          {data.license === 'none' && (
            <>
              <p className="text-sm text-text-secondary mb-3">
                Turn your captured leads into a newsletter. We operate the sending platform
                (Sendy) — request a license and we'll set you up.
              </p>
              <button onClick={requestLicense} disabled={busy}
                      className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-2.5 rounded-sm cursor-pointer disabled:opacity-50">
                {busy ? '…' : 'Request the license'}
              </button>
            </>
          )}
          {data.license === 'requested' && (
            <p className="text-sm text-text-secondary">
              <span className="text-accent">Request received.</span> We'll be in touch to set up your Sendy access.
            </p>
          )}
          {data.license === 'active' && (
            <>
              <p className="text-sm text-text-secondary mb-2">
                <span className="text-green-400">License active.</span> Your Sendy credentials were sent to you by us.
              </p>
              <a href="https://sendy.spexx.cloud" target="_blank" rel="noreferrer"
                 className="text-sm text-accent hover:underline">Open Sendy →</a>
            </>
          )}
        </div>
      </section>

      {/* Reel requests */}
      {openRequests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Reel requests</h2>
          <div className="flex flex-col gap-2">
            {openRequests.map((r) => (
              <div key={r.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-text truncate block">{r.business?.name || 'Business'} wants a reel</span>
                  {r.notes && <span className="text-[11px] text-text-dim truncate block">{r.notes}</span>}
                </div>
                <button onClick={() => setRequestStatus(r.id, 'accepted')} disabled={busy}
                        className="text-xs uppercase tracking-wider text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 cursor-pointer disabled:opacity-50">
                  Accept
                </button>
                <button onClick={() => setRequestStatus(r.id, 'declined')} disabled={busy}
                        className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-text-secondary cursor-pointer disabled:opacity-50">
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
