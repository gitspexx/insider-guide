import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import CampaignCreateModal from '../../components/CampaignCreateModal'

const CHANNEL_COLORS = {
  email: 'bg-[#4A90D9] text-white',
  whatsapp: 'bg-[#25D366] text-white',
  instagram: 'bg-[#E1306C] text-white',
}

const STATUS_BADGE = {
  draft: 'bg-gray-600 text-gray-100',
  active: 'bg-green-600 text-green-100',
  paused: 'bg-yellow-600 text-yellow-100',
  completed: 'bg-gold text-bg',
}

export default function OutreachDashboard() {
  const location = useLocation()
  const [campaigns, setCampaigns] = useState([])
  const [pendingActions, setPendingActions] = useState([])
  const [recentMessages, setRecentMessages] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  // Pre-selected businesses passed from Country.jsx bulk action
  const preSelectedBusinessIds = location.state?.preSelectedBusinessIds || null
  const preSelectedCountryId = location.state?.preSelectedCountryId || null

  useEffect(() => { load() }, [])

  // Auto-open create modal if navigated with pre-selected businesses
  useEffect(() => {
    if (preSelectedBusinessIds?.length > 0) {
      setShowCreate(true)
      // Clear location state so refresh doesn't re-trigger
      window.history.replaceState({}, '')
    }
  }, [preSelectedBusinessIds])

  async function load() {
    const [campaignsRes, pendingRes, recentRes] = await Promise.all([
      supabase
        .from('outreach_campaigns')
        .select('*, countries(name, flag_emoji), email_accounts(email), outreach_enrollments(id, status)')
        .order('created_at', { ascending: false }),
      supabase
        .from('outreach_messages')
        .select('*, businesses(name, instagram_handle, whatsapp)')
        .in('channel', ['whatsapp', 'instagram'])
        .eq('status', 'queued')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('outreach_messages')
        .select('*, businesses(name)')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(15),
    ])

    setCampaigns(campaignsRes.data || [])
    setPendingActions(pendingRes.data || [])
    setRecentMessages(recentRes.data || [])
    setLoading(false)
  }

  async function markPendingSent(messageId, businessId, step) {
    await supabase.from('outreach_messages').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', messageId)

    const touchType = step || 'W1'
    await supabase.from('businesses').update({
      last_touch_type: touchType,
      last_touch_date: new Date().toISOString().split('T')[0],
    }).eq('id', businessId)

    setPendingActions((prev) => prev.filter((m) => m.id !== messageId))
  }

  function getCampaignStats(campaign) {
    const enrollments = campaign.outreach_enrollments || []
    return {
      enrolled: enrollments.length,
      active: enrollments.filter((e) => e.status === 'active').length,
      replied: enrollments.filter((e) => e.status === 'replied').length,
      completed: enrollments.filter((e) => e.status === 'completed').length,
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Dashboard
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
              <span className="text-gold text-sm tracking-wider">Outreach</span>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-[10px] uppercase tracking-wider bg-gold text-bg px-3 py-1.5 rounded-sm hover:bg-gold/90 cursor-pointer font-heading"
          >
            + New Campaign
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8">

        {/* Campaign Cards */}
        <section>
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Campaigns</span>
          {campaigns.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-sm px-4 py-8 text-center text-text-dim text-sm">
              No campaigns yet. Create your first one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((c) => {
                const stats = getCampaignStats(c)
                return (
                  <Link
                    key={c.id}
                    to={`/admin/outreach/${c.id}`}
                    className="bg-bg-card border border-border rounded-sm p-4 hover:border-gold/30 transition-colors no-underline block"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-white text-sm font-medium block">{c.name}</span>
                        <span className="text-[10px] text-text-dim">
                          {c.countries?.flag_emoji} {c.countries?.name}
                        </span>
                      </div>
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${STATUS_BADGE[c.status] || STATUS_BADGE.draft}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Enrolled', value: stats.enrolled },
                        { label: 'Active', value: stats.active },
                        { label: 'Replied', value: stats.replied },
                        { label: 'Done', value: stats.completed },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <span className="font-heading text-lg text-gold block">{s.value}</span>
                          <span className="text-[8px] text-text-dim uppercase tracking-wider">{s.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-[9px] text-text-dim">
                      via {c.email_accounts?.email || 'no account'}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Pending Actions (WA/IG) */}
        <section>
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">
            Pending Actions ({pendingActions.length})
          </span>
          {pendingActions.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-sm px-4 py-6 text-center text-text-dim text-sm">
              No pending manual actions.
            </div>
          ) : (
            <div className="bg-bg-card border border-border rounded-sm overflow-hidden">
              {pendingActions.map((msg) => (
                <div key={msg.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                  <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm shrink-0 ${CHANNEL_COLORS[msg.channel]}`}>
                    {msg.channel === 'whatsapp' ? 'WA' : 'IG'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white block truncate">{msg.businesses?.name}</span>
                    <span className="text-[10px] text-text-dim truncate block">{msg.body?.slice(0, 80)}...</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {msg.channel === 'whatsapp' && msg.businesses?.whatsapp && (
                      <a
                        href={`https://wa.me/${msg.businesses.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg.body || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] uppercase tracking-wider text-[#25D366] border border-[#25D366]/40 px-2 py-1 rounded-sm hover:bg-[#25D366]/10 no-underline"
                      >
                        Open WA
                      </a>
                    )}
                    {msg.channel === 'instagram' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.body || '')
                          alert(`Copied! DM @${msg.businesses?.instagram_handle || ''}`)
                        }}
                        className="text-[10px] uppercase tracking-wider text-[#E1306C] border border-[#E1306C]/40 px-2 py-1 rounded-sm hover:bg-[#E1306C]/10 cursor-pointer"
                      >
                        Copy DM
                      </button>
                    )}
                    <button
                      onClick={() => markPendingSent(msg.id, msg.business_id, msg.step)}
                      className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-2 py-1 rounded-sm hover:text-white hover:border-white/20 cursor-pointer"
                    >
                      Mark Sent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Recent Activity</span>
          {recentMessages.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-sm px-4 py-6 text-center text-text-dim text-sm">
              No messages sent yet.
            </div>
          ) : (
            <div className="bg-bg-card border border-border rounded-sm overflow-hidden">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                  <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm shrink-0 ${CHANNEL_COLORS[msg.channel] || CHANNEL_COLORS.email}`}>
                    {msg.channel}
                  </span>
                  <span className="text-sm text-white flex-1 truncate">{msg.businesses?.name}</span>
                  <span className="text-[10px] text-text-dim uppercase tracking-wider shrink-0">{msg.step}</span>
                  <span className="text-[9px] text-text-dim shrink-0">
                    {msg.sent_at ? new Date(msg.sent_at).toLocaleDateString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <CampaignCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(campaign) => {
            setShowCreate(false)
            setCampaigns((prev) => [campaign, ...prev])
          }}
          preSelectedBusinessIds={preSelectedBusinessIds}
          preSelectedCountryId={preSelectedCountryId}
        />
      )}
    </div>
  )
}
