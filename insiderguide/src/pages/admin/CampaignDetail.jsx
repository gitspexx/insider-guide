import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const CHANNEL_COLORS = {
  email: 'bg-[#4A90D9] text-white',
  whatsapp: 'bg-[#25D366] text-white',
  instagram: 'bg-[#E1306C] text-white',
}

const ENROLLMENT_STATUS = {
  active: 'bg-green-600 text-green-100',
  replied: 'bg-yellow-600 text-yellow-100',
  completed: 'bg-gold text-bg',
  paused: 'bg-gray-600 text-gray-100',
  opted_out: 'bg-red-600 text-red-100',
}

export default function CampaignDetail() {
  const { campaignId } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)

  // Preview state
  const [previews, setPreviews] = useState({}) // { enrollmentId: { subject, body, body_html, loading, error } }
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 })

  useEffect(() => { load() }, [campaignId])

  async function load() {
    const { data: c } = await supabase
      .from('outreach_campaigns')
      .select('*, countries(name, flag_emoji), email_accounts(email, display_name)')
      .eq('id', campaignId)
      .single()

    setCampaign(c)

    if (c) {
      const { data: enr } = await supabase
        .from('outreach_enrollments')
        .select('*, businesses(id, name, category, email, location, instagram_handle, whatsapp, outreach_status)')
        .eq('campaign_id', c.id)
        .order('enrolled_at', { ascending: true })

      setEnrollments(enr || [])
    }
    setLoading(false)
  }

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  // Fire-and-forget Notion reverse sync
  async function notionSync(businessId, fields) {
    try {
      const session = await getSession()
      if (!session) return
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notion-reverse-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ business_id: businessId, fields }),
        }
      ).catch(() => {})
    } catch (_) { /* fire-and-forget */ }
  }

  async function generatePreviews() {
    if (generating) return
    setGenerating(true)
    const session = await getSession()
    if (!session) { setGenerating(false); return }
    const activeEnrollments = enrollments.filter((e) => e.status === 'active')

    for (const enr of activeEnrollments) {
      setPreviews((prev) => ({ ...prev, [enr.id]: { loading: true } }))

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-outreach`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              business_id: enr.business_id,
              step: enr.current_step,
            }),
          }
        )
        const json = await res.json()
        if (json.ok) {
          setPreviews((prev) => ({
            ...prev,
            [enr.id]: {
              subject: json.subject,
              body: json.body,
              body_html: json.body_html,
              channel: json.channel,
              step: enr.current_step,
              businessId: enr.business_id,
              loading: false,
            },
          }))
        } else {
          setPreviews((prev) => ({
            ...prev,
            [enr.id]: { error: json.error || 'Generation failed', loading: false },
          }))
        }
      } catch (err) {
        setPreviews((prev) => ({
          ...prev,
          [enr.id]: { error: err.message, loading: false },
        }))
      }
    }
    setGenerating(false)
  }

  async function sendAll() {
    if (sending) return
    setSending(true)
    const session = await getSession()
    if (!session) { setSending(false); return }

    // Filter to email previews only (WA/IG are manual)
    const emailPreviews = Object.entries(previews).filter(
      ([, p]) => !p.loading && !p.error && p.channel === 'email'
    )

    setSendProgress({ sent: 0, total: emailPreviews.length })

    for (const [enrollmentId, preview] of emailPreviews) {
      const enrollment = enrollments.find((e) => e.id === enrollmentId)
      if (!enrollment) continue

      // Create message record
      const { data: message, error: msgError } = await supabase
        .from('outreach_messages')
        .insert({
          enrollment_id: enrollmentId,
          business_id: preview.businessId,
          step: preview.step,
          channel: 'email',
          subject: preview.subject,
          body: preview.body,
          body_html: preview.body_html,
          email_account_id: campaign.email_account_id,
          status: 'queued',
        })
        .select()
        .single()

      if (msgError || !message) {
        console.error('Failed to create message:', msgError)
        continue
      }

      // Send via edge function
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ message_id: message.id }),
          }
        )
        const json = await res.json()
        if (!json.ok) {
          console.error('Send failed:', json.error)
        }
      } catch (err) {
        console.error('Send error:', err)
      }

      setSendProgress((prev) => ({ ...prev, sent: prev.sent + 1 }))
    }

    // Save WA/IG messages as queued (for pending actions)
    const manualPreviews = Object.entries(previews).filter(
      ([, p]) => !p.loading && !p.error && p.channel !== 'email'
    )

    for (const [enrollmentId, preview] of manualPreviews) {
      await supabase.from('outreach_messages').insert({
        enrollment_id: enrollmentId,
        business_id: preview.businessId,
        step: preview.step,
        channel: preview.channel,
        subject: preview.subject || null,
        body: preview.body,
        status: 'queued',
      })
    }

    // Update campaign status to active
    if (campaign.status === 'draft') {
      await supabase.from('outreach_campaigns').update({ status: 'active' }).eq('id', campaign.id)
      setCampaign((prev) => ({ ...prev, status: 'active' }))
    }

    setSending(false)
    setPreviews({})
    await load() // Refresh data
  }

  async function toggleCampaignStatus() {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    await supabase.from('outreach_campaigns').update({ status: newStatus }).eq('id', campaign.id)
    setCampaign((prev) => ({ ...prev, status: newStatus }))
  }

  async function updateEnrollmentStatus(enrollmentId, newStatus) {
    await supabase.from('outreach_enrollments').update({ status: newStatus }).eq('id', enrollmentId)

    const enrollment = enrollments.find((e) => e.id === enrollmentId)

    if (newStatus === 'replied' && enrollment) {
      await supabase.from('businesses').update({ outreach_status: 'replied' }).eq('id', enrollment.business_id)
      notionSync(enrollment.business_id, { outreach_status: 'replied' })
    }

    if (newStatus === 'paused' && enrollment) {
      notionSync(enrollment.business_id, { outreach_status: 'paused' })
    }

    setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? { ...e, status: newStatus } : e)))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-text-dim text-sm">Campaign not found.</span>
        <Link to="/admin/outreach" className="text-gold text-xs uppercase tracking-wider">← Outreach</Link>
      </div>
    )
  }

  const stats = {
    enrolled: enrollments.length,
    active: enrollments.filter((e) => e.status === 'active').length,
    replied: enrollments.filter((e) => e.status === 'replied').length,
    completed: enrollments.filter((e) => e.status === 'completed').length,
  }

  const activeEnrollments = enrollments.filter((e) => e.status === 'active')
  const previewCount = Object.values(previews).filter((p) => !p.loading && !p.error).length
  const emailPreviewCount = Object.values(previews).filter((p) => !p.loading && !p.error && p.channel === 'email').length

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin/outreach" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Outreach
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Campaign</span>
              <span className="text-gold text-sm tracking-wider">{campaign.name}</span>
            </div>
            <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
              campaign.status === 'active' ? 'bg-green-600 text-green-100' :
              campaign.status === 'paused' ? 'bg-yellow-600 text-yellow-100' :
              campaign.status === 'completed' ? 'bg-gold text-bg' : 'bg-gray-600 text-gray-100'
            }`}>
              {campaign.status}
            </span>
          </div>
          <div className="flex gap-3 items-center">
            {(campaign.status === 'active' || campaign.status === 'paused') && (
              <button
                onClick={toggleCampaignStatus}
                className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer"
              >
                {campaign.status === 'active' ? 'Pause' : 'Resume'}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Enrolled', value: stats.enrolled },
            { label: 'Active', value: stats.active },
            { label: 'Replied', value: stats.replied },
            { label: 'Completed', value: stats.completed },
            { label: 'Reply Rate', value: stats.enrolled ? `${Math.round((stats.replied / stats.enrolled) * 100)}%` : '—' },
          ].map((s) => (
            <div key={s.label} className="bg-bg-card border border-border rounded-sm p-4 text-center">
              <span className="font-heading text-2xl text-gold block">{s.value}</span>
              <span className="text-[9px] text-text-dim uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Campaign Info */}
        <div className="flex gap-4 text-[10px] text-text-dim">
          <span>{campaign.countries?.flag_emoji} {campaign.countries?.name}</span>
          <span>via {campaign.email_accounts?.email || '—'}</span>
        </div>

        {/* Generate + Send Controls */}
        {activeEnrollments.length > 0 && (
          <div className="bg-bg-card border border-border rounded-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-white block">
                  {previewCount > 0
                    ? `${previewCount} messages previewed (${emailPreviewCount} emails)`
                    : `${activeEnrollments.length} active enrollments ready`}
                </span>
                <span className="text-[10px] text-text-dim">
                  {previewCount > 0
                    ? 'Review below, then send all emails. WA/IG will be queued for manual send.'
                    : 'Generate AI-personalized messages for the current step of each enrollment.'}
                </span>
              </div>
              <div className="flex gap-3">
                {previewCount === 0 ? (
                  <button
                    onClick={generatePreviews}
                    disabled={generating}
                    className="text-[10px] uppercase tracking-wider bg-gold text-bg px-4 py-2 rounded-sm hover:bg-gold/90 cursor-pointer font-heading disabled:opacity-50 disabled:cursor-wait"
                  >
                    {generating ? 'Generating...' : `Generate ${activeEnrollments.length} Messages`}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setPreviews({})}
                      className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-2 rounded-sm hover:text-text-secondary cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      onClick={sendAll}
                      disabled={sending}
                      className="text-[10px] uppercase tracking-wider bg-gold text-bg px-4 py-2 rounded-sm hover:bg-gold/90 cursor-pointer font-heading disabled:opacity-50 disabled:cursor-wait"
                    >
                      {sending
                        ? `Sending ${sendProgress.sent}/${sendProgress.total}...`
                        : `Send All (${emailPreviewCount} emails)`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview Cards */}
        {Object.keys(previews).length > 0 && (
          <section>
            <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Message Previews</span>
            <div className="flex flex-col gap-3">
              {enrollments.filter((e) => previews[e.id]).map((enr) => {
                const p = previews[enr.id]
                return (
                  <div key={enr.id} className="bg-bg-card border border-border rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${CHANNEL_COLORS[p.channel] || CHANNEL_COLORS.email}`}>
                        {p.channel || enr.current_step}
                      </span>
                      <span className="text-sm text-white font-medium">{enr.businesses?.name}</span>
                      <span className="text-[10px] text-text-dim">{enr.businesses?.email}</span>
                      <span className="text-[9px] text-text-dim uppercase tracking-wider ml-auto">{p.step}</span>
                    </div>

                    {p.loading ? (
                      <span className="text-text-dim text-sm">Generating...</span>
                    ) : p.error ? (
                      <span className="text-red-400 text-sm">{p.error}</span>
                    ) : (
                      <>
                        {p.subject && (
                          <div className="mb-2">
                            <span className="text-[9px] text-text-dim uppercase tracking-wider">Subject: </span>
                            <input
                              type="text"
                              value={p.subject}
                              onChange={(e) =>
                                setPreviews((prev) => ({
                                  ...prev,
                                  [enr.id]: { ...prev[enr.id], subject: e.target.value },
                                }))
                              }
                              className="bg-transparent border-b border-border text-sm text-white w-full focus:border-gold/30 focus:outline-none pb-1"
                            />
                          </div>
                        )}
                        <textarea
                          value={p.body}
                          onChange={(e) =>
                            setPreviews((prev) => ({
                              ...prev,
                              [enr.id]: { ...prev[enr.id], body: e.target.value },
                            }))
                          }
                          rows={4}
                          className="w-full bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white focus:border-gold/30 focus:outline-none resize-y"
                        />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Enrollments Table */}
        <section>
          <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-3">Enrollments</span>
          <div className="bg-bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-dim">
                  <th className="text-left px-4 py-3">Business</th>
                  <th className="text-left px-3 py-3">Step</th>
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="text-left px-3 py-3">Next Action</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enr) => (
                  <tr key={enr.id} className="border-b border-border last:border-b-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{enr.businesses?.name}</span>
                      <span className="text-[10px] text-text-dim block">{enr.businesses?.email}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] uppercase tracking-wider text-gold font-heading">{enr.current_step}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${ENROLLMENT_STATUS[enr.status] || ENROLLMENT_STATUS.active}`}>
                        {enr.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] text-text-dim">
                        {enr.next_action_at ? new Date(enr.next_action_at).toLocaleDateString() : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {enr.status === 'active' && (
                          <>
                            <button
                              onClick={() => updateEnrollmentStatus(enr.id, 'replied')}
                              className="text-[10px] text-yellow-400 uppercase tracking-wider hover:text-yellow-300 cursor-pointer"
                            >
                              Replied
                            </button>
                            <button
                              onClick={() => updateEnrollmentStatus(enr.id, 'paused')}
                              className="text-[10px] text-text-dim uppercase tracking-wider hover:text-white cursor-pointer"
                            >
                              Pause
                            </button>
                          </>
                        )}
                        {enr.status === 'paused' && (
                          <button
                            onClick={() => updateEnrollmentStatus(enr.id, 'active')}
                            className="text-[10px] text-green-400 uppercase tracking-wider hover:text-green-300 cursor-pointer"
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {enrollments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-dim text-sm">
                      No enrollments in this campaign.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
