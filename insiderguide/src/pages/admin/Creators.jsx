import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// VA-facing outreach copy for creator-imported businesses. Not a DB row —
// the real campaign engine is contact/project-based CRM infra we don't touch.
// {business} / {handle} / {ig} / {url} are filled in by the VA when sending.
const CREATOR_OUTREACH_TEMPLATE =
  'Subject: {handle} added {business} to their Insider Guide\n\n' +
  'Hi — {handle} (@{ig}) added {business} to their Insider Guide travel map, so ' +
  'travelers browsing their page already see you. Want the Featured or Partner ' +
  'placement (pinned spot, creator endorsement, a story/reel)? Details + checkout: {url}'

async function fetchCreators() {
  const { data } = await supabase.from('creators')
    .select('id, handle, display_name, status, newsletter_license, dm_automations_enabled')
    .order('created_at', { ascending: false })
  return data || []
}

const APPLICATIONS_PAGE = 100

// Inbound applications from the public /creators form. anon holds INSERT only,
// so this admin list (is_admin() RLS) is the sole read surface for them.
//
// status is filtered SERVER-side and the count is exact. Filtering pending rows
// out of a page the server already truncated meant any decided row newer than a
// pending one pushed it out of the payload — past 200 decisions the oldest
// genuine application was invisible and the queue rendered as empty. Now only
// other pending rows can crowd the page, and `total` says when that happens.
async function fetchApplications(limit = APPLICATIONS_PAGE) {
  const [appsRes, countriesRes] = await Promise.all([
    supabase.from('creator_applications')
      .select('id, full_name, email, social_handle, country_id, city, list_url, pitch, status, created_at',
        { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('countries').select('id, name, flag_emoji'),
  ])
  const names = {}
  for (const c of countriesRes.data || []) names[c.id] = `${c.flag_emoji || ''} ${c.name}`.trim()
  // A swallowed error here is indistinguishable from an empty queue, and the
  // conclusion an admin draws from it — "nobody applied" — is the expensive one.
  const failure = appsRes.error || countriesRes.error
  if (failure) console.error('admin/Creators: applications fetch failed', failure)
  return {
    applications: appsRes.data || [],
    total: appsRes.count ?? 0,
    countryNames: names,
    error: failure ? failure.message : null,
  }
}

// The column check constraint already pins the scheme, but this list is the one
// place applicant-supplied text becomes an href — don't rely on a single lock.
function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : null
}

// Per-creator overview numbers for the list rows. Few creators — cheap
// head-count queries per creator beat fetching whole tables (PostgREST caps
// un-limited selects at 1000 rows).
async function fetchCreatorStats(creators) {
  const { data: deals } = await supabase.from('creator_deals')
    .select('creator_id, creator_share_cents, status')
  const stats = {}
  await Promise.all(creators.map(async (c) => {
    const [saves, leads] = await Promise.all([
      supabase.from('creator_saves')
        .select('id', { count: 'exact', head: true }).eq('creator_id', c.id),
      supabase.from('newsletter_subscribers')
        .select('id', { count: 'exact', head: true }).eq('source', `creator_${c.handle}`),
    ])
    const mine = (deals || []).filter((d) => d.creator_id === c.id)
    stats[c.id] = {
      spots: saves.count || 0,
      leads: leads.count || 0,
      earnedCents: mine.filter((d) => d.status !== 'pending_attribution')
        .reduce((sum, d) => sum + (d.creator_share_cents || 0), 0),
    }
  }))
  return stats
}

// Businesses this creator imported that still need contacting.
async function fetchCreatorImports(handle) {
  const marker = `[creator-import @${handle}]`
  const { data } = await supabase.from('businesses')
    .select('id, name, email, city, tier_paid, outreach_status, notes')
    .ilike('notes', `%${marker}%`)
    .eq('outreach_status', 'to_contact')
    .eq('tier_paid', false)
    .order('created_at', { ascending: false })
    .limit(200)
  return data || []
}

// Deals + THIS creator's saved businesses (for the business picker). Admin can
// read creator_saves (admin_all_saves policy) and businesses (is_admin full
// access), so we scope the picker to the panel creator via a nested join —
// the public creator_saved_businesses view is NOT creator-scoped and would leak
// every creator's saves into the picker.
async function fetchCreatorPanel(creatorId, handle) {
  const [dealsRes, savedRes, reqRes] = await Promise.all([
    supabase.from('creator_deals')
      .select('id, business_id, tier, amount_cents, creator_share_cents, status, closed_at')
      .eq('creator_id', creatorId).order('closed_at', { ascending: false }),
    supabase.from('creator_saves')
      .select('business_id, businesses(id, name, city, tier_paid, outreach_status, enrich_status)')
      .eq('creator_id', creatorId),
    supabase.from('creator_requests').select('id, business_id, status, notes').eq('creator_id', creatorId),
  ])
  const imports = await fetchCreatorImports(handle)
  // Flatten; drop any rows whose business row didn't resolve (should not
  // happen for admin, defensive). Used by the spots table AND the pickers.
  const saved = (savedRes.data || [])
    .map((s) => s.businesses)
    .filter(Boolean)
  const funnel = {
    toContact: saved.filter((b) => b.outreach_status === 'to_contact' && !b.tier_paid).length,
    contacted: saved.filter((b) => b.outreach_status && !['new', 'to_contact'].includes(b.outreach_status) && !b.tier_paid).length,
    converted: saved.filter((b) => b.tier_paid).length,
  }
  return {
    deals: dealsRes.data || [],
    saved,
    funnel,
    requests: reqRes.data || [],
    imports,
  }
}

function usd(c) { return `$${(Number(c || 0) / 100).toFixed(0)}` }

export default function AdminCreators() {
  const [creators, setCreators] = useState([])
  const [stats, setStats] = useState({})            // creator_id → { spots, leads, earnedCents }
  const [form, setForm] = useState({ email: '', handle: '', display_name: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [panel, setPanel] = useState(null)          // { deals, saved, funnel, requests, imports }
  const [dealForm, setDealForm] = useState({ business_id: '', tier: 'featured', amount_cents: 20000 })
  const [reqForm, setReqForm] = useState({ business_id: '', notes: '' })
  const [applications, setApplications] = useState([])
  const [applicationsTotal, setApplicationsTotal] = useState(0)
  const [applicationsLimit, setApplicationsLimit] = useState(APPLICATIONS_PAGE)
  const [applicationsError, setApplicationsError] = useState(null)
  const [countryNames, setCountryNames] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const rows = await fetchCreators()
      if (cancelled) return
      setCreators(rows)
      const apps = await fetchApplications(APPLICATIONS_PAGE)
      if (cancelled) return
      setApplications(apps.applications)
      setApplicationsTotal(apps.total)
      setApplicationsError(apps.error)
      setCountryNames(apps.countryNames)
      const st = await fetchCreatorStats(rows)
      if (!cancelled) setStats(st)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Kept off the mount effect's dependencies on purpose: paging the queue must
  // not re-run fetchCreatorStats, which is one head-count query per creator.
  async function reloadApplications(limit = applicationsLimit) {
    setApplicationsLimit(limit)
    const apps = await fetchApplications(limit)
    setApplications(apps.applications)
    setApplicationsTotal(apps.total)
    setApplicationsError(apps.error)
  }

  async function reload() {
    const rows = await fetchCreators()
    setCreators(rows)
    setStats(await fetchCreatorStats(rows))
  }

  async function call(body) {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('invite-creator', { body })
    setBusy(false)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return false }
    return true
  }

  // status/reviewer_notes are the only granted columns; RLS gates the row to
  // admins. Approving does NOT create the creator — the invite form below does,
  // so a handle is still chosen by a human.
  async function setApplicationStatus(id, status) {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('creator_applications').update({ status }).eq('id', id)
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    reloadApplications()
  }

  // Spam that clears the one-row-per-request and dedupe triggers still lands in
  // this queue, and rejecting it leaves it on file forever. DELETE is granted to
  // authenticated and gated to admins by admin_all_creator_applications.
  async function deleteApplication(id, who) {
    if (!confirm(`Delete the application from ${who}? This cannot be undone.`)) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('creator_applications').delete().eq('id', id)
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    reloadApplications()
  }

  function prefillInvite(app) {
    setForm({ email: app.email, handle: '', display_name: app.full_name })
    setMsg(`Loaded ${app.email} into the invite form above — pick a handle, then Invite.`)
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (await call({ action: 'invite', ...form })) {
      setMsg(`Invited ${form.email} as @${form.handle}. They sign in at /studio/login.`)
      setForm({ email: '', handle: '', display_name: '' })
      reload()
    }
  }

  async function openPanel(c) {
    if (openId === c.id) { setOpenId(null); setPanel(null); return }
    setOpenId(c.id)
    setPanel(null)
    setPanel(await fetchCreatorPanel(c.id, c.handle))
  }

  async function refreshPanel(c) { setPanel(await fetchCreatorPanel(c.id, c.handle)) }

  async function addDeal(c) {
    if (!dealForm.business_id) { setMsg('Pick a business'); return }
    if (await call({ action: 'record_deal', creator_id: c.id, ...dealForm })) {
      setDealForm({ business_id: '', tier: 'featured', amount_cents: 20000 })
      refreshPanel(c)
    }
  }

  async function resolveDeal(c, deal_id) {
    if (await call({ action: 'resolve_attribution', deal_id })) refreshPanel(c)
  }

  async function markPaid(c, deal_id) {
    if (await call({ action: 'update_deal', deal_id, status: 'paid_out' })) refreshPanel(c)
  }

  async function setLicense(c, newsletter_license) {
    if (await call({ action: 'set_license', creator_id: c.id, newsletter_license })) reload()
  }

  async function setDm(c) {
    if (await call({ action: 'set_dm', creator_id: c.id, enabled: !c.dm_automations_enabled })) reload()
  }

  async function addRequest(c) {
    if (!reqForm.business_id) { setMsg('Pick a business'); return }
    if (await call({ action: 'add_request', creator_id: c.id, ...reqForm })) {
      setReqForm({ business_id: '', notes: '' })
      refreshPanel(c)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="font-heading text-xl text-white mb-6">Creators</h1>

      <form onSubmit={handleInvite} className="bg-bg-card border border-border rounded-xl p-5 mb-8 grid md:grid-cols-4 gap-3">
        <input required type="email" placeholder="Email" value={form.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input required placeholder="handle" value={form.handle} pattern="[a-z0-9_]{3,30}"
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

      {applicationsError && (
        <div className="mb-8 bg-red-400/5 border border-red-400/30 rounded-xl px-4 py-3">
          <span className="text-[10px] uppercase tracking-wider text-red-400/70 block mb-1">
            Creator applications could not be loaded
          </span>
          <p className="text-xs text-text-secondary">
            {applicationsError} — this list is empty because the read failed, not because nobody applied.
          </p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="mb-8">
          <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">
            Creator applications ({applicationsTotal} pending
            {applications.length < applicationsTotal ? `, showing ${applications.length}` : ''})
          </span>
          <div className="flex flex-col gap-2">
            {applications.map((a) => (
              <div key={a.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-white">{a.full_name}</span>
                  <span className="text-xs text-text-dim">{a.email}</span>
                  <span className="text-xs text-gold">{a.social_handle}</span>
                  <span className="text-[11px] text-text-dim">
                    {countryNames[a.country_id] || '—'}{a.city ? ` · ${a.city}` : ''}
                  </span>
                  <span className="text-[11px] text-text-dim">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                {a.pitch && <p className="text-xs text-text-secondary">{a.pitch}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {safeUrl(a.list_url) && (
                    <a href={safeUrl(a.list_url)} target="_blank" rel="noreferrer"
                       className="text-[11px] text-gold hover:underline truncate max-w-xs">{a.list_url}</a>
                  )}
                  <button onClick={() => prefillInvite(a)}
                          className="text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer">
                    Prefill invite
                  </button>
                  <button onClick={() => setApplicationStatus(a.id, 'approved')} disabled={busy}
                          className="text-xs uppercase tracking-wider text-green-400 border border-green-400/30 px-3 py-1.5 rounded-lg hover:bg-green-400/10 cursor-pointer disabled:opacity-50">
                    Mark approved
                  </button>
                  <button onClick={() => setApplicationStatus(a.id, 'rejected')} disabled={busy}
                          className="text-xs uppercase tracking-wider text-red-400/70 border border-border px-3 py-1.5 rounded-lg hover:text-red-400 cursor-pointer disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => deleteApplication(a.id, a.email)} disabled={busy}
                          className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-red-400 cursor-pointer disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          {applications.length < applicationsTotal && (
            <button onClick={() => reloadApplications(applicationsLimit + APPLICATIONS_PAGE)} disabled={busy}
                    className="mt-2 text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer disabled:opacity-50">
              Load {Math.min(APPLICATIONS_PAGE, applicationsTotal - applications.length)} more
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {creators.map((c) => (
          <div key={c.id} className="bg-bg-card border border-border rounded-xl">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <a href={`/@${c.handle}`} target="_blank" rel="noreferrer" className="text-sm text-white hover:text-gold">@{c.handle}</a>
                <span className="text-xs text-text-dim">{c.display_name}</span>
                <span className={`text-[10px] uppercase tracking-wider ${c.status === 'active' ? 'text-gold' : 'text-red-400/70'}`}>{c.status}</span>
                {stats[c.id] && (
                  <span className="text-[11px] text-text-dim">
                    {stats[c.id].spots} spots · {stats[c.id].leads} leads · earned <span className="text-gold">{usd(stats[c.id].earnedCents)}</span>
                  </span>
                )}
                <select value={c.newsletter_license}
                        onChange={(e) => setLicense(c, e.target.value)}
                        className="bg-bg border border-border rounded-sm px-2 py-1 text-[11px] text-white">
                  <option value="none">license: none</option>
                  <option value="requested">license: requested</option>
                  <option value="active">license: active</option>
                </select>
                <button onClick={() => setDm(c)} disabled={busy}
                        className={`text-[11px] px-2 py-1 rounded-sm border cursor-pointer ${
                          c.dm_automations_enabled
                            ? 'border-gold/40 text-gold'
                            : 'border-border text-text-dim hover:text-white'}`}>
                  DM auto: {c.dm_automations_enabled ? 'on' : 'off'}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => call({ action: 'set_status', creator_id: c.id, status: c.status === 'active' ? 'paused' : 'active' }).then((ok) => ok && reload())}
                        className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-white cursor-pointer">
                  {c.status === 'active' ? 'Pause' : 'Activate'}
                </button>
                <button onClick={() => openPanel(c)}
                        className="text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer">
                  {openId === c.id ? 'Close' : 'Deals'}
                </button>
              </div>
            </div>

            {openId === c.id && (
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                {panel === null ? (
                  <p className="text-text-dim text-sm">Loading…</p>
                ) : (
                  <>
                    {/* Spots + outreach funnel */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">
                        Spots ({panel.saved.length})
                      </span>
                      <div className="flex gap-4 text-[11px] mb-2">
                        <span className="text-text-dim">to contact <span className="text-white">{panel.funnel.toContact}</span></span>
                        <span className="text-text-dim">contacted <span className="text-white">{panel.funnel.contacted}</span></span>
                        <span className="text-text-dim">converted <span className="text-gold">{panel.funnel.converted}</span></span>
                      </div>
                      {panel.saved.length === 0 ? (
                        <p className="text-text-dim text-xs">No spots imported yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                          {panel.saved.map((b) => (
                            <div key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-xs">
                              <span className="text-white truncate">{b.name}</span>
                              <span className="text-text-dim">{b.city || '—'}</span>
                              <span className={b.enrich_status === 'enriched' ? 'text-green-400/70' : 'text-text-dim'}>
                                {(b.enrich_status || '').replace('_', ' ') || '—'}
                              </span>
                              <span className={b.tier_paid ? 'text-gold' : 'text-text-dim'}>
                                {b.tier_paid ? 'PAID' : (b.outreach_status || '').replace('_', ' ') || '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Deals */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">Deals</span>
                      {panel.deals.length === 0 && <p className="text-text-dim text-xs mb-2">No deals yet.</p>}
                      <div className="flex flex-col gap-1.5 mb-3">
                        {panel.deals.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 text-xs">
                            <span className="text-white flex-1 truncate">{d.tier} · {usd(d.amount_cents)} → {usd(d.creator_share_cents)}</span>
                            <span className="text-text-dim">{d.status.replace('_', ' ')}</span>
                            {d.status === 'pending_attribution' && (
                              <button onClick={() => resolveDeal(c, d.id)} className="text-gold border border-gold/30 px-2 py-0.5 rounded cursor-pointer">Confirm</button>
                            )}
                            {d.status === 'confirmed' && (
                              <button onClick={() => markPaid(c, d.id)} className="text-green-400 border border-green-400/30 px-2 py-0.5 rounded cursor-pointer">Mark paid</button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                        <select value={dealForm.business_id} onChange={(e) => setDealForm({ ...dealForm, business_id: e.target.value })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="">Pick business…</option>
                          {panel.saved.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <select value={dealForm.tier}
                                onChange={(e) => setDealForm({ ...dealForm, tier: e.target.value, amount_cents: e.target.value === 'partner' ? 50000 : 20000 })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="featured">featured</option>
                          <option value="partner">partner</option>
                        </select>
                        <input type="number" value={dealForm.amount_cents}
                               onChange={(e) => setDealForm({ ...dealForm, amount_cents: parseInt(e.target.value) || 0 })}
                               className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white w-24" />
                        <button onClick={() => addDeal(c)} disabled={busy}
                                className="text-xs bg-gold text-bg px-3 rounded-sm cursor-pointer disabled:opacity-50">Add deal</button>
                      </div>
                    </div>

                    {/* Add reel request */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">Add reel request</span>
                      <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                        <select value={reqForm.business_id} onChange={(e) => setReqForm({ ...reqForm, business_id: e.target.value })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="">Pick business…</option>
                          {panel.saved.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <input placeholder="Note (optional)" value={reqForm.notes}
                               onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
                               className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white" />
                        <button onClick={() => addRequest(c)} disabled={busy}
                                className="text-xs bg-gold text-bg px-3 rounded-sm cursor-pointer disabled:opacity-50">Add</button>
                      </div>
                    </div>

                    {/* Creator imports — VA outreach segment */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">
                        Creator imports to contact ({panel.imports.length})
                      </span>
                      {panel.imports.length === 0 ? (
                        <p className="text-text-dim text-xs">Nothing pending — all imported spots are contacted or already paid.</p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto mb-2">
                            {panel.imports.map((b) => (
                              <div key={b.id} className="flex items-center gap-2 text-xs">
                                <span className="text-white flex-1 truncate">{b.name}</span>
                                <span className="text-text-dim">{b.email || 'no email'}</span>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                CREATOR_OUTREACH_TEMPLATE
                                  .replaceAll('{handle}', '@' + c.handle)
                                  .replaceAll('{ig}', c.handle)
                                  .replaceAll('{url}', `https://insiderguide.co/partner?ref=creator_${c.handle}`))
                              setMsg('Outreach template copied. Fill {business} per recipient.')
                            }}
                            className="text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer">
                            Copy outreach template
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
