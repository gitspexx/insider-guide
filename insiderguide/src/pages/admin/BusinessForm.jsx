import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const CATEGORY_OPTIONS = ['eat', 'cafe', 'drink', 'stay', 'do', 'explore', 'wellness', 'misc']
const TIER_OPTIONS = ['listed', 'featured', 'partner']
const STATUS_OPTIONS = ['to_contact', 'email_sent', 'replied', 'wa_sent', 'ig_engaged', 'closed_won', 'closed_lost']
const TOUCH_OPTIONS = ['E1', 'E2', 'E3', 'W1', 'W2', 'IG-engage', 'IG-DM']

export default function AdminBusinessForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [countries, setCountries] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    country_id: '',
    name: '',
    category: 'eat',
    description: '',
    location: '',
    google_maps_url: '',
    instagram_handle: '',
    email: '',
    whatsapp: '',
    website: '',
    tier: 'listed',
    tier_paid: false,
    photo_url: '',
    recommended_badge: false,
    published: false,
    outreach_status: 'to_contact',
    last_touch_date: '',
    last_touch_type: '',
    notes: '',
  })

  useEffect(() => {
    async function load() {
      const { data: allCountries } = await supabase.from('countries').select('*').order('name')
      setCountries(allCountries || [])

      if (isEditing) {
        const { data: biz } = await supabase.from('businesses').select('*').eq('id', id).single()
        if (biz) {
          setForm({
            country_id: biz.country_id || '',
            name: biz.name || '',
            category: biz.category || 'eat',
            description: biz.description || '',
            location: biz.location || '',
            google_maps_url: biz.google_maps_url || '',
            instagram_handle: biz.instagram_handle || '',
            email: biz.email || '',
            whatsapp: biz.whatsapp || '',
            website: biz.website || '',
            tier: biz.tier || 'listed',
            tier_paid: biz.tier_paid || false,
            photo_url: biz.photo_url || '',
            recommended_badge: biz.recommended_badge || false,
            published: biz.published || false,
            outreach_status: biz.outreach_status || 'to_contact',
            last_touch_date: biz.last_touch_date || '',
            last_touch_type: biz.last_touch_type || '',
            notes: biz.notes || '',
          })
        }
      } else if (allCountries?.length > 0) {
        setForm((prev) => ({ ...prev, country_id: allCountries[0].id }))
      }
      setLoading(false)
    }
    load()
  }, [id, isEditing])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      ...form,
      last_touch_date: form.last_touch_date || null,
      last_touch_type: form.last_touch_type || null,
    }

    const { error } = isEditing
      ? await supabase.from('businesses').update(payload).eq('id', id)
      : await supabase.from('businesses').insert(payload)

    setSaving(false)

    if (error) {
      alert(`Save failed: ${error.message}`)
      return
    }

    // Navigate back to country CRM
    const country = countries.find((c) => c.id === form.country_id)
    if (country) {
      navigate(`/admin/${country.slug}`)
    } else {
      navigate('/admin')
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this business? This cannot be undone.')) return
    await supabase.from('businesses').delete().eq('id', id)
    navigate('/admin')
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
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Back
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
              <span className="text-gold text-sm tracking-wider">
                {isEditing ? 'Edit Business' : 'New Business'}
              </span>
            </div>
          </div>
          {isEditing && (
            <button
              onClick={handleDelete}
              className="text-[10px] uppercase tracking-wider text-red-400 border border-red-400/30 px-3 py-1.5 rounded-sm hover:bg-red-400/10 cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-8">
        {/* Basic Info */}
        <fieldset className="mb-8">
          <legend className="text-[10px] text-text-dim uppercase tracking-wider mb-4">Basic Info</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                required
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Country *</label>
              <select
                value={form.country_id}
                onChange={(e) => update('country_id', e.target.value)}
                required
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                required
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={3}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                placeholder="City or area"
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Photo URL</label>
              <input
                type="url"
                value={form.photo_url}
                onChange={(e) => update('photo_url', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
          </div>
        </fieldset>

        {/* Contact */}
        <fieldset className="mb-8">
          <legend className="text-[10px] text-text-dim uppercase tracking-wider mb-4">Contact & Links</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Google Maps URL</label>
              <input
                type="url"
                value={form.google_maps_url}
                onChange={(e) => update('google_maps_url', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Instagram</label>
              <input
                type="text"
                value={form.instagram_handle}
                onChange={(e) => update('instagram_handle', e.target.value)}
                placeholder="@handle"
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">WhatsApp</label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => update('whatsapp', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
              />
            </div>
          </div>
        </fieldset>

        {/* Tier & Outreach */}
        <fieldset className="mb-8">
          <legend className="text-[10px] text-text-dim uppercase tracking-wider mb-4">Tier & Outreach</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Tier</label>
              <select
                value={form.tier}
                onChange={(e) => update('tier', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Outreach Status</label>
              <select
                value={form.outreach_status}
                onChange={(e) => update('outreach_status', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Last Touch Type</label>
              <select
                value={form.last_touch_type}
                onChange={(e) => update('last_touch_type', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                <option value="">—</option>
                {TOUCH_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-dim uppercase tracking-wider block mb-1">Last Touch Date</label>
              <input
                type="date"
                value={form.last_touch_date}
                onChange={(e) => update('last_touch_date', e.target.value)}
                className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.tier_paid}
                  onChange={(e) => update('tier_paid', e.target.checked)}
                  className="accent-gold"
                />
                <span className="text-xs text-text-secondary">Tier Paid</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.recommended_badge}
                  onChange={(e) => update('recommended_badge', e.target.checked)}
                  className="accent-gold"
                />
                <span className="text-xs text-text-secondary">Recommended</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => update('published', e.target.checked)}
                  className="accent-gold"
                />
                <span className="text-xs text-text-secondary">Published</span>
              </label>
            </div>
          </div>
        </fieldset>

        {/* Notes */}
        <fieldset className="mb-8">
          <legend className="text-[10px] text-text-dim uppercase tracking-wider mb-4">Internal Notes</legend>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={4}
            placeholder="CRM notes, follow-up reminders..."
            className="w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none resize-none"
          />
        </fieldset>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-gold text-bg font-heading text-sm uppercase tracking-wider px-8 py-3 rounded-sm hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Business' : 'Create Business'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="border border-border text-text-dim text-sm uppercase tracking-wider px-6 py-3 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
