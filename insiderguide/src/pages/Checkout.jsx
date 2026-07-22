import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckoutForm } from '../components/checkout/CheckoutForm'
import { supabase } from '../lib/supabase'
import Seo from '../components/Seo'

// IG tier pricing — these MUST stay in sync with the BCAX Stripe Prices
// (insiderguide_featured = $200, insiderguide_partner = $500). bcax-charge in
// elements/one-time mode reads amount_cents from the request body, not from
// the Stripe Price's lookup_key. If/when bcax-charge supports
// price_lookup_key resolution in elements mode, swap to that.
const TIERS = {
  complete: {
    key: 'complete',
    name: 'Complete',
    amount_cents: 5000,
    label: 'InsiderGuide Complete – $50',
    description: 'Full profile: photos, description, website + Instagram links, verified-owner badge.',
  },
  featured: {
    key: 'featured',
    name: 'Featured',
    amount_cents: 20000,
    label: 'InsiderGuide Featured – $200',
    description: 'Pinned in your category, endorsed by a creator, IG story from the country creator.',
  },
  partner: {
    key: 'partner',
    name: 'Partner',
    amount_cents: 50000,
    label: 'InsiderGuide Partner – $500',
    description: 'Hero placement, newsletter logo, priority creator access.',
  },
}

// No-tier landing: pick a tier, then find your listing by name + country so
// payment lands on YOUR row (not a fresh placeholder). Owners arrive here from
// outreach emails that don't carry a ?biz= reference.
function FindYourBusiness({ creatorRef }) {
  const navigate = useNavigate()
  const [countries, setCountries] = useState([])
  const [tierPick, setTierPick] = useState('complete')
  const [countryId, setCountryId] = useState('')
  const [name, setName] = useState('')
  const [results, setResults] = useState(null) // null = not searched yet
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('countries')
      .select('id, name, flag_emoji')
      .eq('published', true)
      .order('name')
      .then(({ data }) => { if (!cancelled) setCountries(data || []) })
    return () => { cancelled = true }
  }, [])

  async function search(e) {
    e.preventDefault()
    const q = name.trim().replace(/[%_]/g, ' ').trim()
    if (q.length < 2 || !countryId || searching) return
    setSearching(true)
    // claimable_businesses: all real (published) rows incl. scraped listings
    // hidden from the curated guides — owners can still find + upgrade them.
    const { data } = await supabase
      .from('claimable_businesses')
      .select('id, name, city, category, tier_paid')
      .eq('country_id', countryId)
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(6)
    setResults(data || [])
    setSearching(false)
  }

  const refQ = creatorRef ? `&ref=${creatorRef}` : ''
  const goPay = (bizId) =>
    navigate(`/checkout?tier=${tierPick}&biz=${bizId}${refQ}`)

  // No-match path: carry the typed name + country into checkout so the
  // pending row is pre-labeled and the team can match it by hand.
  const goUnmatched = () => {
    const qp = new URLSearchParams({ tier: tierPick })
    if (name.trim()) qp.set('bizname', name.trim())
    if (countryId) qp.set('bizcountry', countryId)
    if (creatorRef) qp.set('ref', creatorRef)
    navigate(`/checkout?${qp.toString()}`)
  }

  const inputClass = 'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-[14px] text-text placeholder:text-text-dim/60 focus:border-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all'

  return (
    <div className="min-h-screen text-text">
      <Seo title="Upgrade your listing" path="/checkout" noindex />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 md:py-20">
        <Link to="/" className="text-[11px] text-text-dim tracking-[0.1em] uppercase no-underline hover:text-accent">← Insider Guide</Link>
        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] mt-8 mb-3">
          Upgrade your listing
        </h1>
        <p className="text-text-secondary text-[15px] leading-[1.65] mb-8">
          Pick a placement, then find your business so the upgrade lands on the right listing.
        </p>

        {/* Step 1 — tier */}
        <div className="text-[11px] tracking-[0.12em] uppercase text-text-dim mb-3">1 · Choose your placement</div>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {Object.values(TIERS).map((t) => (
            <button
              key={t.key}
              onClick={() => setTierPick(t.key)}
              className={`text-left border rounded-xl p-4 transition-all cursor-pointer ${
                tierPick === t.key
                  ? 'border-accent/60 bg-accent/8'
                  : 'border-border bg-bg-card hover:border-border-hover'
              }`}
            >
              <div className="font-display text-lg text-text">{t.name}</div>
              <div className="font-display text-2xl text-accent mb-1.5">${(t.amount_cents / 100).toFixed(0)}</div>
              <div className="text-[11px] text-text-dim leading-relaxed">{t.description}</div>
            </button>
          ))}
        </div>

        {/* Step 2 — find the listing */}
        <div className="text-[11px] tracking-[0.12em] uppercase text-text-dim mb-3">2 · Find your business</div>
        <form onSubmit={search} className="border border-border rounded-xl p-5 bg-bg-card flex flex-col gap-3 mb-4">
          <select
            value={countryId}
            onChange={(e) => { setCountryId(e.target.value); setResults(null) }}
            required
            className={inputClass}
          >
            <option value="">Country *</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setResults(null) }}
            required
            minLength={2}
            placeholder="Business name *"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={searching || !countryId || name.trim().length < 2}
            className="bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? 'Searching…' : 'Find my business'}
          </button>
        </form>

        {results !== null && results.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[12px] text-text-secondary">Is this your business?</p>
            {results.map((b) => (
              <div key={b.id} className="border border-border rounded-xl p-4 bg-bg-card flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-text">{b.name}</div>
                  <div className="text-[11px] text-text-dim">{b.city || '—'} · {b.category}</div>
                </div>
                {b.tier_paid ? (
                  <span className="text-[10px] uppercase tracking-wider text-text-dim whitespace-nowrap">Already upgraded</span>
                ) : (
                  <button
                    onClick={() => goPay(b.id)}
                    className="text-[11px] tracking-[0.08em] uppercase font-medium bg-accent text-bg px-4 py-2 rounded-lg hover:bg-accent/85 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Yes — upgrade this
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={goUnmatched}
              className="text-[12px] text-text-dim hover:text-accent transition-colors cursor-pointer self-start mt-1 underline-offset-2 hover:underline"
            >
              None of these? Continue anyway — we&rsquo;ll match it for you.
            </button>
          </div>
        )}
        {results !== null && results.length === 0 && (
          <div className="border border-accent/25 rounded-xl p-5 bg-bg-card mb-4">
            <p className="text-sm text-text mb-1.5">Your business isn&rsquo;t there? Don&rsquo;t worry.</p>
            <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
              Continue to payment and our team will match the upgrade to your business —
              or add it fresh — within one business day. You&rsquo;ll get a confirmation by email.
            </p>
            <button
              onClick={goUnmatched}
              className="bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer"
            >
              Continue — we&rsquo;ll match it for you
            </button>
            <p className="text-[11px] text-text-dim mt-3">
              Or try a shorter name, or <Link to="/partner" className="text-accent">apply on the partner page</Link>.
            </p>
          </div>
        )}

        <p className="text-[11px] text-text-dim leading-relaxed">
          Not listed yet? <Link to="/partner" className="text-accent">Apply on the partner page</Link> —
          or <button onClick={goUnmatched} className="text-accent cursor-pointer underline-offset-2 hover:underline">continue without a listing</button> and we&rsquo;ll match your payment by email.
        </p>
      </div>
    </div>
  )
}

export default function Checkout() {
  const [params] = useSearchParams()

  const tierKey = params.get('tier')
  const tier = TIERS[tierKey]

  const refParam = params.get('ref') || ''
  const creatorRef = /^creator_[a-z0-9_]{3,30}$/.test(refParam) ? refParam : null

  // Invoice emails and payment retries link back with ?biz=<businesses.id>.
  // When present we pay against THAT row instead of creating a fresh
  // placeholder — otherwise the approved application never gets promoted and
  // a junk row goes live instead.
  const bizParam = params.get('biz') || ''
  const invoiceBizId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bizParam)
      ? bizParam
      : null

  // "We'll match it for you" path (finder found no listing): the typed
  // business name + country ride along so the pending row is pre-labeled
  // and admin can match/create the listing after payment.
  const unmatchedName = (params.get('bizname') || '').trim().slice(0, 120)
  const unmatchedCountryParam = params.get('bizcountry') || ''
  const unmatchedCountryId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unmatchedCountryParam)
      ? unmatchedCountryParam
      : null

  const [email, setEmail] = useState('')
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const [emailError, setEmailError] = useState(null)
  // The `businesses.id` we pre-create as a paid-pending row before charging.
  // Passed to init-checkout as `customer_external_id` so the BCAX callback can
  // flip the right row to the right tier when payment lands. Without this,
  // paid Featured/Partner customers leave NO IG-side ledger of what they paid for.
  const [pendingBusinessId, setPendingBusinessId] = useState(null)
  const [creatingPending, setCreatingPending] = useState(false)

  // pendingBusinessId is appended as `?ref=` so the success page can show the
  // applicant a stable reference id without any backend round-trip. It's set
  // AFTER email submit (handleEmailSubmit), so the memo recomputes once known.
  const returnUrl = useMemo(
    () => {
      const base = `${window.location.origin}/checkout/success?tier=${tierKey}`
      return pendingBusinessId ? `${base}&ref=${pendingBusinessId}` : base
    },
    [tierKey, pendingBusinessId]
  )

  // Missing tier param — outreach emails link straight here, so instead of a
  // dead-end we let the owner pick a tier and find their existing listing.
  if (!tier) {
    return <FindYourBusiness creatorRef={creatorRef} />
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email')
      return
    }
    setEmailError(null)
    setEmail(trimmed)

    // Invoice / retry flow: the target row already exists — pay against it.
    if (invoiceBizId) {
      setPendingBusinessId(invoiceBizId)
      setEmailConfirmed(true)
      return
    }

    // Pre-create the pending businesses row. We need its id BEFORE Stripe
    // confirms — the bcax-callback needs a stable handle to flip on success.
    // If this fails (RLS/network), surface to user — DO NOT proceed to payment.
    setCreatingPending(true)
    try {
      // Placeholder name: prefer the business name typed in the finder (the
      // "we'll match it for you" path), else derive from the email's local
      // part so admin can recognize the row at-a-glance.
      const emailLocal = trimmed.split('@')[0]
      const emailDomain = trimmed.split('@')[1] ?? ''
      const placeholderName = unmatchedName
        ? `${unmatchedName} (pending ${tier.name})`
        : emailLocal
          ? `${emailLocal} (pending ${tier.name})`
          : `Pending ${tier.name} application`

      // country_id is NOT NULL on businesses. The finder path passes the real
      // country; otherwise seed the first published one (admin re-assigns on
      // review — schema requires something).
      let seedCountryId = unmatchedCountryId
      if (!seedCountryId) {
        const { data: anyCountry, error: cErr } = await supabase
          .from('countries')
          .select('id')
          .eq('published', true)
          .order('name')
          .limit(1)
          .maybeSingle()
        if (cErr || !anyCountry?.id) {
          throw new Error('No countries available to seed pending row')
        }
        seedCountryId = anyCountry.id
      }

      // Client-generated id: the applicant role can INSERT but cannot SELECT
      // the unpublished row back, so `.select('id')` would fail RLS on the
      // RETURNING step. Supplying the uuid avoids reading back.
      const newId = crypto.randomUUID()
      const payload = {
        id: newId,
        name: placeholderName,
        country_id: seedCountryId,
        email: trimmed,
        tier: 'listed',
        published: false,
        outreach_status: 'to_contact',
        paid_pending_tier: tier.key,
        notes: `[partner-signup-paid] Tier intent: ${tier.key}. Email: ${trimmed}. Domain: ${emailDomain}.${unmatchedName ? ` Business: ${unmatchedName}. Needs manual match.` : ''} Awaiting Stripe confirmation.${creatorRef ? ` [ref ${creatorRef}]` : ''}`,
      }

      const { error: insertError } = await supabase
        .from('businesses')
        .insert(payload)

      if (insertError) {
        throw new Error(insertError.message ?? 'Failed to create pending row')
      }
      setPendingBusinessId(newId)
      setEmailConfirmed(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setEmailError(`Could not start application: ${msg}`)
    } finally {
      setCreatingPending(false)
    }
  }

  return (
    <div className="min-h-screen text-text">
      <Seo title="Checkout" path="/checkout" noindex />
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border" style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/partner"
            className="inline-flex items-center gap-2 text-[12px] tracking-[0.05em] text-text-secondary hover:text-text transition-colors no-underline"
          >
            ← Back to tiers
          </Link>
          <Link to="/" className="flex items-center gap-2 no-underline" aria-label="Insider Guide home">
            <img src="/favicon.png" alt="" width="20" height="20" className="rounded-md" />
            <span className="font-display text-[18px] text-text leading-none">Insider Guide</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid lg:grid-cols-[1fr_320px] gap-8 items-start"
        >
          {/* Payment column */}
          <section>
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-3">
              Checkout
            </span>
            <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] text-text mb-3">
              Confirm your {tier.name} placement
            </h1>
            <p className="text-text-secondary text-[15px] leading-[1.65] mb-8">
              {tier.description} A creator covering your country reviews every application within 48 hours of payment.
            </p>

            {!emailConfirmed ? (
              <form onSubmit={handleEmailSubmit} className="border border-border rounded-xl p-5 md:p-6 bg-bg-card space-y-4">
                <div>
                  <label className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-1.5" htmlFor="checkout-email">
                    Your email *
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@business.com"
                    className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-[14px] text-text placeholder:text-text-dim/60 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all"
                  />
                  <p className="text-[11px] text-text-dim mt-1.5">
                    Used for the receipt and your application reply.
                  </p>
                </div>

                {emailError && (
                  <p className="text-red-400/80 text-[12px] font-light">{emailError}</p>
                )}

                <button
                  type="submit"
                  disabled={creatingPending}
                  className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingPending ? 'Preparing…' : 'Continue to payment'}
                </button>
              </form>
            ) : (
              <div className="border border-border rounded-xl p-5 md:p-6 bg-bg-card">
                <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
                  <div className="text-[12px] text-text-secondary">
                    Receipt to <span className="text-text">{email}</span>
                  </div>
                  <button
                    onClick={() => setEmailConfirmed(false)}
                    className="text-[11px] tracking-[0.05em] uppercase text-accent/70 hover:text-accent transition-colors"
                  >
                    Change
                  </button>
                </div>

                <CheckoutForm
                  amount_cents={tier.amount_cents}
                  currency="usd"
                  customer_email={email}
                  customer_external_id={pendingBusinessId}
                  price_lookup_key={`insiderguide_${tier.key}`}
                  return_url={returnUrl}
                  theme={{ primary_color: '#c8a55a', label: tier.label }}
                />
              </div>
            )}
          </section>

          {/* Order summary */}
          <aside className="lg:sticky lg:top-20">
            <div className="border border-border rounded-xl p-5 md:p-6 bg-bg-card">
              <div className="text-[11px] tracking-[0.12em] uppercase text-text-dim mb-3">
                Order summary
              </div>
              <div className="font-display text-text text-[1.15rem] mb-1">
                InsiderGuide {tier.name}
              </div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-display text-3xl text-text">
                  ${(tier.amount_cents / 100).toFixed(0)}
                </span>
                <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
                  one-time
                </span>
              </div>
              <p className="text-text-secondary text-[13px] leading-[1.55] mb-4">
                Reviewed by a country creator within 48 hours of payment. You{'’'}ll hear back either way with next steps.
              </p>
              <div className="border-t border-border pt-3 text-[11px] text-text-dim space-y-1.5 leading-relaxed">
                <div>One-time charge — no subscription.</div>
                <div>Receipt emailed by Stripe.</div>
              </div>
            </div>
          </aside>
        </motion.div>
      </main>
    </div>
  )
}
