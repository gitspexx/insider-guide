import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  to_contact: 'bg-gray-600 text-gray-100',
  email_sent: 'bg-blue-600 text-blue-100',
  replied: 'bg-yellow-600 text-yellow-100',
  wa_sent: 'bg-green-600 text-green-100',
  ig_engaged: 'bg-pink-600 text-pink-100',
  closed_won: 'bg-gold text-bg',
  closed_lost: 'bg-red-600 text-red-100',
}

const STATUS_OPTIONS = ['to_contact', 'email_sent', 'replied', 'wa_sent', 'ig_engaged', 'closed_won', 'closed_lost']
const TIER_OPTIONS = ['listed', 'featured', 'partner']
const CATEGORY_OPTIONS = ['eat', 'cafe', 'drink', 'stay', 'do', 'explore', 'wellness', 'misc']
const TOUCH_OPTIONS = ['E1', 'E2', 'E3', 'W1', 'W2', 'IG-engage', 'IG-DM']

export default function AdminCountry() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [country, setCountry] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterTier, setFilterTier] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newBiz, setNewBiz] = useState({ name: '', category: 'eat' })
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    load()
  }, [slug])

  async function load() {
    const { data: c } = await supabase.from('countries').select('*').eq('slug', slug).single()
    setCountry(c)

    if (c) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('country_id', c.id)
        .order('name')
      setBusinesses(biz || [])
    }
    setLoading(false)
  }

  async function notionSync(businessId, fields) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
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
      )
    } catch (_) { /* fire-and-forget */ }
  }

  async function updateField(id, field, value) {
    await supabase.from('businesses').update({ [field]: value }).eq('id', id)
    setBusinesses((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
    // Reverse sync outreach-relevant fields to Notion
    if (['outreach_status', 'last_touch_type', 'last_touch_date'].includes(field)) {
      notionSync(id, { [field]: value })
    }
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    if (!newBiz.name.trim() || !country) return

    const { data } = await supabase
      .from('businesses')
      .insert({
        name: newBiz.name.trim(),
        category: newBiz.category,
        country_id: country.id,
        tier: 'listed',
        outreach_status: 'to_contact',
        published: false,
      })
      .select()
      .single()

    if (data) {
      setBusinesses((prev) => [...prev, data])
      setNewBiz({ name: '', category: 'eat' })
      setShowAddModal(false)
    }
  }

  function exportCSV() {
    const headers = ['Name', 'Category', 'Tier', 'Paid', 'Status', 'Last Touch', 'Email', 'Instagram', 'WhatsApp', 'Google Maps']
    const rows = filtered.map((b) => [
      b.name, b.category, b.tier, b.tier_paid ? 'Yes' : 'No',
      b.outreach_status, b.last_touch_type || '',
      b.email || '', b.instagram_handle || '', b.whatsapp || '', b.google_maps_url || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(slug || 'export').replace(/[^a-z0-9_-]/gi, '_')}-businesses.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllFiltered() {
    const filteredIds = filtered.map((b) => b.id)
    const allSelected = filteredIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const filtered = businesses.filter((b) => {
    if (filterCategory !== 'all' && b.category !== filterCategory) return false
    if (filterTier !== 'all' && b.tier !== filterTier) return false
    if (filterStatus !== 'all' && b.outreach_status !== filterStatus) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-xs uppercase tracking-widest">Loading...</span>
      </div>
    )
  }

  if (!country) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-text-dim text-sm">Country not found.</span>
        <Link to="/admin" className="text-gold text-xs uppercase tracking-wider">← Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gold text-xs uppercase tracking-wider no-underline hover:text-gold/80">
              ← Dashboard
            </Link>
            <div>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gold-dim block">Admin</span>
              <span className="text-gold text-sm tracking-wider">
                {country.flag_emoji} {country.name}
              </span>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setShowAddModal(true)}
              className="text-[10px] uppercase tracking-wider bg-gold text-bg px-3 py-1.5 rounded-sm hover:bg-gold/90 cursor-pointer font-heading"
            >
              + Add Business
            </button>
            <button
              onClick={exportCSV}
              className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap gap-3 border-b border-border">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-bg-card border border-border rounded-sm px-3 py-1.5 text-xs text-white focus:border-gold/30 focus:outline-none"
        >
          <option value="all">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="bg-bg-card border border-border rounded-sm px-3 py-1.5 text-xs text-white focus:border-gold/30 focus:outline-none"
        >
          <option value="all">All Tiers</option>
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-bg-card border border-border rounded-sm px-3 py-1.5 text-xs text-white focus:border-gold/30 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-[10px] text-text-dim uppercase tracking-wider self-center ml-auto">
          {filtered.length} of {businesses.length} businesses
        </span>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-gold/10 border border-gold/30 rounded-sm px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gold">
              {selectedIds.size} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/admin/outreach', {
                  state: { preSelectedBusinessIds: [...selectedIds], preSelectedCountryId: country.id },
                })}
                className="text-[10px] uppercase tracking-wider bg-gold text-bg px-3 py-1.5 rounded-sm hover:bg-gold/90 cursor-pointer font-heading"
              >
                Add to Campaign →
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-sm hover:text-text-secondary cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-bg-card border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-dim">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id))}
                    onChange={toggleAllFiltered}
                    className="accent-gold cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-3 py-3">Category</th>
                <th className="text-left px-3 py-3">Tier</th>
                <th className="text-center px-3 py-3">Paid</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-left px-3 py-3">Last Touch</th>
                <th className="text-center px-3 py-3">Pub</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((biz) => (
                <tr key={biz.id} className={`border-b border-border last:border-b-0 hover:bg-white/[0.02] ${selectedIds.has(biz.id) ? 'bg-gold/[0.03]' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(biz.id)}
                      onChange={() => toggleSelect(biz.id)}
                      className="accent-gold cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{biz.name}</span>
                    {biz.location && (
                      <span className="text-[10px] text-text-dim block">{biz.location}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[10px] uppercase tracking-wider text-text-dim">{biz.category}</span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={biz.tier || 'listed'}
                      onChange={(e) => updateField(biz.id, 'tier', e.target.value)}
                      className="bg-transparent border border-border rounded-sm px-2 py-1 text-xs text-white focus:border-gold/30 focus:outline-none cursor-pointer"
                    >
                      {TIER_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={biz.tier_paid || false}
                      onChange={(e) => updateField(biz.id, 'tier_paid', e.target.checked)}
                      className="accent-gold cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={biz.outreach_status || 'to_contact'}
                      onChange={(e) => updateField(biz.id, 'outreach_status', e.target.value)}
                      className={`text-[10px] uppercase tracking-wider rounded-sm px-2 py-1 border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[biz.outreach_status] || STATUS_COLORS.to_contact}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={biz.last_touch_type || ''}
                      onChange={(e) => {
                        updateField(biz.id, 'last_touch_type', e.target.value || null)
                        if (e.target.value) {
                          updateField(biz.id, 'last_touch_date', new Date().toISOString().split('T')[0])
                        }
                      }}
                      className="bg-transparent border border-border rounded-sm px-2 py-1 text-xs text-white focus:border-gold/30 focus:outline-none cursor-pointer"
                    >
                      <option value="">—</option>
                      {TOUCH_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {biz.last_touch_date && (
                      <span className="text-[9px] text-text-dim block mt-0.5">
                        {new Date(biz.last_touch_date).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={biz.published || false}
                      onChange={(e) => updateField(biz.id, 'published', e.target.checked)}
                      className="accent-gold cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/businesses/${biz.id}/edit`}
                      className="text-[10px] text-gold uppercase tracking-wider hover:text-gold/80"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-text-dim text-sm">
                    No businesses match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-bg-card border border-border rounded-sm p-6 w-full max-w-md">
            <h2 className="font-heading text-xl tracking-wider text-white mb-4">Quick Add Business</h2>
            <form onSubmit={handleQuickAdd} className="flex flex-col gap-4">
              <input
                type="text"
                value={newBiz.name}
                onChange={(e) => setNewBiz((p) => ({ ...p, name: e.target.value }))}
                placeholder="Business name"
                className="bg-bg border border-border rounded-sm px-4 py-3 text-sm text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none"
                autoFocus
              />
              <select
                value={newBiz.category}
                onChange={(e) => setNewBiz((p) => ({ ...p, category: e.target.value }))}
                className="bg-bg border border-border rounded-sm px-4 py-3 text-sm text-white focus:border-gold/30 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-gold text-bg font-heading text-sm uppercase tracking-wider py-3 rounded-sm hover:bg-gold/90 cursor-pointer"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-border text-text-dim text-sm uppercase tracking-wider py-3 rounded-sm hover:text-text-secondary hover:border-white/15 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
            <p className="text-[10px] text-text-dim mt-3">
              For full details, use Edit after adding.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
