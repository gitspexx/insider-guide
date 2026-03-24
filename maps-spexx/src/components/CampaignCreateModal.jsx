import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DEFAULT_SEQUENCE = [
  { step: 'E1', channel: 'email', delay_days: 0 },
  { step: 'E2', channel: 'email', delay_days: 3 },
  { step: 'E3', channel: 'email', delay_days: 5 },
  { step: 'W1', channel: 'whatsapp', delay_days: 5 },
  { step: 'W2', channel: 'whatsapp', delay_days: 6 },
  { step: 'IG1', channel: 'instagram', delay_days: 7 },
  { step: 'IG2', channel: 'instagram', delay_days: 7 },
]

const CHANNEL_COLORS = {
  email: 'text-[#4A90D9]',
  whatsapp: 'text-[#25D366]',
  instagram: 'text-[#E1306C]',
}

export default function CampaignCreateModal({ onClose, onCreated, preSelectedBusinessIds, preSelectedCountryId }) {
  const navigate = useNavigate()
  const id = useId()
  const [countries, setCountries] = useState([])
  const [emailAccounts, setEmailAccounts] = useState([])
  const [businesses, setBusinesses] = useState([])
  const [loadingBiz, setLoadingBiz] = useState(false)
  const [creating, setCreating] = useState(false)

  const [name, setName] = useState('')
  const [countryId, setCountryId] = useState(preSelectedCountryId || '')
  const [emailAccountId, setEmailAccountId] = useState('')
  const [sequence, setSequence] = useState(DEFAULT_SEQUENCE)
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    async function init() {
      const [cRes, eRes] = await Promise.all([
        supabase.from('countries').select('id, name, flag_emoji').order('name'),
        supabase.from('email_accounts').select('id, email, display_name').eq('is_active', true),
      ])
      setCountries(cRes.data || [])
      setEmailAccounts(eRes.data || [])
      if (eRes.data?.length) setEmailAccountId(eRes.data[0].id)
    }
    init()
  }, [])

  useEffect(() => {
    if (!countryId) { setBusinesses([]); return }
    setLoadingBiz(true)
    supabase
      .from('businesses')
      .select('id, name, category, email, location')
      .eq('country_id', countryId)
      .eq('outreach_status', 'to_contact')
      .not('email', 'is', null)
      .order('name')
      .then(({ data }) => {
        setBusinesses(data || [])
        setLoadingBiz(false)
        // Auto-select businesses passed from Country.jsx bulk action
        if (preSelectedBusinessIds?.length > 0 && data?.length > 0) {
          const validIds = new Set(data.map((b) => b.id))
          const toSelect = preSelectedBusinessIds.filter((id) => validIds.has(id))
          if (toSelect.length > 0) setSelectedIds(new Set(toSelect))
        }
      })
  }, [countryId])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === businesses.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(businesses.map((b) => b.id)))
  }

  function updateDelay(index, value) {
    setSequence((prev) => prev.map((s, i) => (i === index ? { ...s, delay_days: parseInt(value) || 0 } : s)))
  }

  async function handleCreate() {
    if (!name.trim() || !countryId || !emailAccountId || selectedIds.size === 0) return
    setCreating(true)

    const { data: campaign, error } = await supabase
      .from('outreach_campaigns')
      .insert({
        name: name.trim(),
        country_id: countryId,
        email_account_id: emailAccountId,
        sequence_config: sequence,
        status: 'draft',
      })
      .select('*, countries(name, flag_emoji), email_accounts(email)')
      .single()

    if (error || !campaign) {
      alert('Failed to create campaign: ' + (error?.message || 'Unknown error'))
      setCreating(false)
      return
    }

    // Create enrollments
    const enrollments = [...selectedIds].map((bizId) => ({
      campaign_id: campaign.id,
      business_id: bizId,
      current_step: sequence[0].step,
      status: 'active',
      next_action_at: new Date().toISOString(),
      enrolled_at: new Date().toISOString(),
    }))

    const { error: enrollError } = await supabase.from('outreach_enrollments').insert(enrollments)

    if (enrollError) {
      alert('Campaign created but enrollment failed: ' + enrollError.message)
      setCreating(false)
      return
    }

    navigate(`/admin/outreach/${campaign.id}`)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div role="dialog" aria-modal="true" className="bg-bg-card border border-border rounded-sm p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
        <h2 className="font-heading text-xl tracking-wider text-white mb-5">New Campaign</h2>

        <div className="flex flex-col gap-4">
          {/* Campaign Name */}
          <div>
            <label htmlFor={`${id}-campaign-name`} className="text-[9px] uppercase tracking-[0.3em] text-text-dim block mb-1">Campaign Name</label>
            <input
              id={`${id}-campaign-name`}
              type="text"
              name="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Argentina Cafes - March 2026"
              className="w-full bg-bg border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Country + Email Account */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${id}-country`} className="text-[9px] uppercase tracking-[0.3em] text-text-dim block mb-1">Country</label>
              <select
                id={`${id}-country`}
                name="country"
                value={countryId}
                onChange={(e) => { setCountryId(e.target.value); setSelectedIds(new Set()) }}
                className="w-full bg-bg border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="">Select country...</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-email-account`} className="text-[9px] uppercase tracking-[0.3em] text-text-dim block mb-1">Email Account</label>
              <select
                id={`${id}-email-account`}
                name="email-account"
                value={emailAccountId}
                onChange={(e) => setEmailAccountId(e.target.value)}
                className="w-full bg-bg border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {emailAccounts.length === 0 && <option value="">No accounts configured</option>}
                {emailAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.display_name || a.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sequence Config */}
          <div>
            <label htmlFor={`${id}-sequence`} className="text-[9px] uppercase tracking-[0.3em] text-text-dim block mb-2">Sequence (delay in days between steps)</label>
            <div id={`${id}-sequence`} className="grid grid-cols-7 gap-2">
              {sequence.map((s, i) => (
                <div key={s.step} className="text-center">
                  <span className={`text-[10px] font-heading block mb-1 ${CHANNEL_COLORS[s.channel]}`}>{s.step}</span>
                  <input
                    type="number"
                    name={`sequence-delay-${s.step}`}
                    min="0"
                    max="30"
                    value={s.delay_days}
                    onChange={(e) => updateDelay(i, e.target.value)}
                    className="w-full bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-center text-white focus:border-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Business Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[9px] uppercase tracking-[0.3em] text-text-dim">
                Select Businesses {countryId && `(${selectedIds.size}/${businesses.length})`}
              </label>
              {businesses.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-[10px] text-gold uppercase tracking-wider hover:text-gold/80 cursor-pointer"
                >
                  {selectedIds.size === businesses.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {!countryId ? (
              <div className="bg-bg border border-border rounded-sm px-4 py-6 text-center text-text-dim text-sm">
                Select a country to see available businesses.
              </div>
            ) : loadingBiz ? (
              <div className="bg-bg border border-border rounded-sm px-4 py-6 text-center text-text-dim text-sm">
                Loading\u2026
              </div>
            ) : businesses.length === 0 ? (
              <div className="bg-bg border border-border rounded-sm px-4 py-6 text-center text-text-dim text-sm">
                No businesses with status "to_contact" and an email address.
              </div>
            ) : (
              <div className="bg-bg border border-border rounded-sm max-h-48 overflow-y-auto">
                {businesses.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-white/[0.02] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      className="accent-gold cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white block truncate">{b.name}</span>
                      <span className="text-[10px] text-text-dim">{b.category} · {b.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !countryId || !emailAccountId || selectedIds.size === 0 || creating}
              className="flex-1 bg-gold text-bg font-heading text-sm uppercase tracking-wider py-3 rounded-sm hover:bg-gold/90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {creating ? 'Creating...' : `Create & Preview (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border text-text-dim text-sm uppercase tracking-wider py-3 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
