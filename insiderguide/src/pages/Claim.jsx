import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Seo from '../components/Seo'

// Claim flow: an owner finds their (scraped/creator-imported) listing on a
// guide and claims it. The claim lands in the covering creator's studio
// approvals + admin + Slack; approval sends the Complete ($50) upsell email.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function Claim() {
  const [params] = useSearchParams()
  const bizId = UUID_RE.test(params.get('biz') || '') ? params.get('biz') : null
  const [biz, setBiz] = useState(undefined) // undefined=loading, null=not found
  const [form, setForm] = useState({ email: '', contact_name: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!bizId) { setBiz(null); return }
      const { data } = await supabase
        .from('public_businesses')
        .select('id, name, city, category, website')
        .eq('id', bizId)
        .maybeSingle()
      if (!cancelled) setBiz(data || null)
    }
    load()
    return () => { cancelled = true }
  }, [bizId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: insErr } = await supabase.from('claim_requests').insert({
      business_id: bizId,
      email: form.email.trim(),
      contact_name: form.contact_name.trim(),
      message: form.message.trim(),
    })
    setSubmitting(false)
    if (insErr) { setError(insErr.message); return }
    setSubmitted(true)
    // Best-effort notification (Slack + hello@ + auto-reply)
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-partner-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        business_id: bizId,
        claim_email: form.email.trim(),
        claim_name: form.contact_name.trim(),
        claim_message: form.message.trim(),
      }),
    }).catch(() => {})
  }

  const inputClass = 'w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none'

  return (
    <div className="min-h-screen">
      <Seo title="Claim your listing" path="/claim" noindex />
      <div className="max-w-xl mx-auto px-6 pt-20 pb-24">
        <Link to="/" className="text-[11px] text-text-dim tracking-[0.1em] uppercase no-underline hover:text-accent">← Insider Guide</Link>

        {biz === undefined && <p className="text-text-dim text-sm mt-10">Loading…</p>}

        {biz === null && (
          <div className="mt-10">
            <h1 className="font-display text-3xl mb-3">Listing not found</h1>
            <p className="text-text-secondary text-sm">
              This claim link doesn&rsquo;t match a live listing. Want to be added?{' '}
              <Link to="/partner" className="text-accent">Apply here</Link>.
            </p>
          </div>
        )}

        {biz && !submitted && (
          <>
            <h1 className="font-display text-3xl mt-10 mb-2">Claim {biz.name}</h1>
            <p className="text-text-secondary text-sm mb-8 leading-relaxed">
              {biz.name}{biz.city ? ` (${biz.city})` : ''} is listed on Insider Guide.
              If it&rsquo;s yours, claim it — you&rsquo;ll be able to complete the profile
              so travelers stop on your listing instead of scrolling past it.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input required type="email" placeholder="Business email *" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
              <input placeholder="Your name" value={form.contact_name}
                     onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className={inputClass} />
              <textarea rows={3} placeholder="Anything that helps us verify it's you (role, website, socials)" value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })} className={`${inputClass} resize-none`} />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button type="submit" disabled={submitting || !form.email.trim()}
                      className="bg-accent text-bg text-sm uppercase tracking-wider px-8 py-3 rounded-sm cursor-pointer disabled:opacity-50">
                {submitting ? 'Sending…' : 'Claim this listing'}
              </button>
              <p className="text-[11px] text-text-dim">
                The creator covering your country reviews each claim. You&rsquo;ll hear from us by email.
              </p>
            </form>
          </>
        )}

        {submitted && (
          <div className="mt-10">
            <h1 className="font-display text-3xl mb-3">Claim received</h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              We&rsquo;ll verify it and get back to you at <span className="text-accent">{form.email}</span> —
              usually within a day. Meanwhile, see what a complete listing unlocks on the{' '}
              <Link to="/partner" className="text-accent">partner page</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
