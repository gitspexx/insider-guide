import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Seo from '../components/Seo'

// creator_deals.rev_share_pct default (creator_network_v2.sql) — the share is
// frozen per deal at close, so quoting the default here is accurate for any
// deal a new creator will close.
const REV_SHARE_PCT = 30

// Prices come from deal_prices (public-readable by policy); these are the
// current live values, used only if that read fails so the payout section
// never renders blank.
const PAYOUT_TIERS = [
  { key: 'complete', name: 'Complete', fallbackCents: 5000, what: 'A listing already in the guide pays to fill out its profile — photos, description, links.' },
  { key: 'featured', name: 'Featured', fallbackCents: 20000, what: 'A place buys the pinned spot in its category, a written profile and a story from the creator covering it.' },
  { key: 'partner', name: 'Partner', fallbackCents: 50000, what: 'A hotel or flagship experience takes hero placement across the whole country guide.' },
]

const HOW_IMPORT_WORKS = [
  {
    step: '01',
    title: 'Export from Takeout',
    desc: 'takeout.google.com, deselect all, tick only "Saved", export once as a .zip. Google emails the download. Inside Takeout/Saved/ there is one CSV per list you ever made.',
  },
  {
    step: '02',
    title: 'Upload one list',
    desc: 'Pick the country, upload a single list CSV. We read three columns — the place Title, your Note, and the Maps URL — and pull the place ID, CID or coordinates out of the URL to pin the exact place.',
  },
  {
    step: '03',
    title: 'Confirm the near-matches',
    desc: 'Places already on Insider Guide match automatically. Anything that only looks like a match is shown next to the existing name and you decide: same place, or new one. Rows with no title or no link are skipped and counted for you.',
  },
  {
    step: '04',
    title: 'It goes live, then fills in',
    desc: 'New places publish as basic entries and upgrade on their own as we enrich them — photos, categories, map pins. The note you wrote in Maps becomes the note on your page.',
  },
]

// Every line here is checked against what the import actually does. Overstating
// it costs a creator their first hour and their trust.
const IMPORT_LIMITS = [
  'Google Takeout exports Google Maps lists only. Instagram saves and collections are not in it — Instagram does not hand them over, so we cannot import them.',
  'There is no manual add. Every spot enters through a Takeout CSV. After that you can rewrite the note, pin it, hide it or remove it — but you cannot type a new place in by hand.',
  'One list and one country per upload, up to 2,000 rows at a time. Multiple lists means multiple uploads.',
]

const FAQS = [
  {
    q: 'Can you import my Instagram saves?',
    a: 'No. Google Takeout only exports Google Maps lists — saved posts and collections are not part of any export we can read. If your recommendations live in Instagram, they need to be in a Maps list first.',
  },
  {
    q: 'Can I add a place by hand?',
    a: 'Not today. Every spot arrives through a Takeout CSV import. Once it is in, you control it — your own note, pin it to the top, hide it, remove it — but there is no "add a place" button in the studio.',
  },
  {
    q: 'What does covering a country mean?',
    a: 'Each country in the network is assigned to one creator. If you cover one, business applications and listing claims for it land in your studio for you to approve or reject, and deals in that country with no other attribution credit you.',
  },
  {
    q: 'What if another creator saved the same place?',
    a: 'The deal is held for review rather than split automatically, and we resolve who it belongs to. When you are the only creator who saved a place, it is attributed to you the moment it converts.',
  },
  {
    q: 'How do payouts work?',
    a: `Every confirmed deal and its ${REV_SHARE_PCT}% share appear in your studio as they close. Settlement is arranged with you directly — the studio reports the balance, it does not move the money itself.`,
  },
  {
    q: 'Do I own the emails I capture?',
    a: 'Yes, and capture is off until you switch it on in your studio settings. Anything collected on your page is listed in your studio and exports to CSV whenever you want it. If you want to actually send to that list, we run the sending platform and issue you a license.',
  },
  {
    q: 'What will my page be?',
    a: 'insiderguide.co/yourhandle, plus one guide per country you cover at insiderguide.co/yourhandle/country. Handles are lowercase letters, numbers and underscores, 3 to 30 characters.',
  },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^https?:\/\/\S+$/i
const MIN_PITCH = 40

function usd(cents) { return `$${(Number(cents || 0) / 100).toFixed(0)}` }

// Returns the first fixable problem, phrased as an instruction. The submit
// button deliberately stays live (Partner disables it) — a dead button tells an
// applicant nothing about which field is wrong.
function validate(form) {
  if (!form.full_name.trim()) return 'Add your name so we know who we’re replying to.'
  if (!EMAIL_RE.test(form.email.trim())) return 'That email address doesn’t look complete — check it for a typo. It’s where our reply goes.'
  if (!form.social_handle.trim()) return 'Add the handle where we can see your work — Instagram, TikTok, YouTube, a blog. Anything public.'
  if (!form.country_id) return 'Pick the one country you know best. Depth in a single country beats a thin list across ten.'
  if (!form.list_url.trim()) return 'Add a link — a shared Google Maps list, or your profile if the list isn’t public yet.'
  if (!URL_RE.test(form.list_url.trim())) return 'That link needs to be a full URL starting with https:// so we can open it.'
  const short = MIN_PITCH - form.pitch.trim().length
  if (short > 0) return `Tell us what you actually cover — about ${short} more characters. Two sentences is plenty.`
  return null
}

// PostgREST passes the Postgres SQLSTATE through. Translate the codes this form
// can realistically trip; anything else keeps the server's own wording rather
// than hiding it behind "something went wrong".
function describeInsertError(err) {
  switch (err?.code) {
    case '23514':
      return 'One of your answers is longer than we can store. Trim the note about what you cover and submit again.'
    case '23503':
      return 'That country isn’t selectable any more. Choose another one and submit again.'
    case '42501':
      return 'The server refused the submission. That’s on our side, not yours — email lead@insiderguide.co and we’ll enter it by hand.'
    default:
      return `Your application didn’t save: ${err?.message || 'the server didn’t respond'}. Nothing was lost — press submit again, or send it to lead@insiderguide.co.`
  }
}

export default function CreatorApply() {
  const [countries, setCountries] = useState([])
  const [prices, setPrices] = useState({})
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    social_handle: '',
    country_id: '',
    city: '',
    list_url: '',
    pitch: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [countryRes, priceRes] = await Promise.all([
        supabase.from('countries').select('id, name, flag_emoji').order('name'),
        supabase.from('deal_prices').select('tier, amount_cents'),
      ])
      if (cancelled) return
      setCountries(countryRes.data || [])
      const map = {}
      for (const row of priceRes.data || []) map[row.tier] = Number(row.amount_cents) || 0
      setPrices(map)
    }
    load()
    return () => { cancelled = true }
  }, [])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    const problem = validate(form)
    if (problem) { setError(problem); return }

    setSubmitting(true)
    setError(null)

    // No status field: it isn't in the INSERT column grant, so the row can only
    // ever land as 'pending'. Nothing here confers standing.
    const { error: insertError } = await supabase.from('creator_applications').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      social_handle: form.social_handle.trim(),
      country_id: form.country_id,
      city: form.city.trim(),
      list_url: form.list_url.trim(),
      pitch: form.pitch.trim(),
    })
    setSubmitting(false)

    if (insertError) {
      setError(describeInsertError(insertError))
      return
    }
    setSubmitted(true)
    // No notify-* call: notify-partner-application is deployed but has no
    // source in this repo, so its behaviour on a non-business payload is
    // unknown. Reviewers pick these up from /admin/creators.
  }

  return (
    <div className="min-h-screen">
      {/* Canonical is pinned to /creators so the /apply alias doesn't compete
          with it as duplicate content. */}
      <Seo
        title="Apply to the creator network — turn your Maps lists into a guide"
        description="You already curated the list. Insider Guide imports your Google Maps saved places, publishes them as a country guide under your name, and pays you a share of every placement sold in your country."
        path="/creators"
      />
      {/* ─── Nav ─── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline group" aria-label="Insider Guide home">
            <img src="/favicon.png" alt="" width="22" height="22" className="rounded-md" />
            <span className="font-display text-[22px] text-text leading-none group-hover:text-accent transition-colors">Insider Guide</span>
            <span className="hidden md:inline-block w-[1px] h-4 bg-border" />
            <span className="hidden md:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">a network of travel creators</span>
          </Link>
          <a
            href="#apply"
            className="text-[11px] text-accent tracking-[0.12em] uppercase font-light hover:text-accent/80 transition-colors"
          >
            Apply
          </a>
        </div>
      </motion.nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-14 overflow-hidden">
        <div className="ambient-orb w-[400px] h-[400px] bg-accent/6 -top-20 left-1/3" />

        <div className="max-w-[1120px] mx-auto px-6 py-16 md:py-24 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-3xl"
          >
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-5">
              Creator Network
            </span>

            <h1 className="font-display text-[clamp(2.6rem,5.5vw,5rem)] leading-[0.95] tracking-[-0.02em] text-text mb-6">
              You already made<br />
              the list. It&rsquo;s sitting<br />
              <span className="text-accent-gradient italic">in an app, earning nothing.</span>
            </h1>

            <p className="text-[clamp(1.05rem,2vw,1.25rem)] text-text-secondary leading-relaxed max-w-xl mb-8">
              Insider Guide imports your Google Maps saved lists and publishes them as a country guide under your name — the spots, your notes, your handle on the URL.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#apply"
                className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Apply to the network
              </a>
              <a
                href="#import"
                className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                See how the import works
              </a>
            </div>
          </motion.div>
        </div>

        <div className="shimmer-line max-w-[1120px] mx-auto" />
      </section>

      {/* ─── Why creators join ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            Why creators join
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              k: '01',
              h: 'The work is already done',
              p: 'The coffee place worth the walk. The hotel that was actually worth it. The bar you send everyone to. You saved all of it in Google Maps and it has never been seen by anyone but you — that private list is the guide people keep asking you for.',
            },
            {
              k: '02',
              h: 'A page you keep, not a feed you rent',
              p: 'Your spots publish at insiderguide.co/yourhandle, with a separate guide for each country you cover. It ranks, it gets shared, and it stays visible whether or not you posted this week.',
            },
            {
              k: '03',
              h: 'Paid on the places, not the posting',
              p: `Businesses buy placement inside the guides. When a place you added converts, that deal is attributed to you and ${REV_SHARE_PCT}% of it is yours — no rate card to negotiate, no invoice to chase per brand.`,
            },
          ].map((b, i) => (
            <motion.div
              key={b.k}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
              className="relative flex flex-col bg-bg-card border border-border rounded-xl p-6 transition-all duration-400 hover:border-border-accent hover:bg-bg-elevated"
            >
              <span className="text-[11px] tracking-[0.12em] uppercase text-accent/60 font-light mb-4">{b.k}</span>
              <h3 className="font-display text-[1.5rem] leading-[1.1] text-text mb-3">{b.h}</h3>
              <p className="text-text-secondary text-[14px] leading-relaxed">{b.p}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── The import ─── */}
      <section id="import" className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="gradient-divider mb-10" />
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            How the import works
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IMPORT_WORKS.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
              className="relative flex flex-col min-h-[200px] bg-bg-card border border-border rounded-xl p-6 overflow-hidden transition-all duration-400 hover:border-border-accent hover:bg-bg-elevated hover:shadow-[0_8px_40px_rgba(200,165,90,0.05)]"
            >
              <span className="text-[11px] tracking-[0.12em] uppercase text-accent/60 font-light mb-4">{step.step}</span>
              <h3 className="font-display text-[1.5rem] leading-[1.1] text-text mb-2">{step.title}</h3>
              <p className="text-text-secondary text-[14px] leading-[1.65]">{step.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 border border-border rounded-xl p-6 bg-bg-card/60">
          <span className="text-[11px] tracking-[0.18em] uppercase text-accent/80 font-light block mb-4">
            What it doesn&rsquo;t do
          </span>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            {IMPORT_LIMITS.map((limit) => (
              <li key={limit} className="flex items-start gap-2.5 text-[13px] text-text-secondary leading-relaxed">
                <span className="w-1 h-1 mt-2 bg-accent/60 rounded-full shrink-0" />
                <span>{limit}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Earnings ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="gradient-divider mb-10" />
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            What you earn
          </span>
        </div>

        <p className="text-text-secondary text-[15px] leading-[1.65] max-w-2xl mb-8">
          Businesses buy one of three placements inside the guides. Every sale carries a fixed {REV_SHARE_PCT}% creator share, frozen at the price on the day it closes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAYOUT_TIERS.map((tier, index) => {
            const cents = prices[tier.key] ?? tier.fallbackCents
            return (
              <motion.div
                key={tier.key}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
                className="relative flex flex-col bg-bg-card border border-border rounded-xl p-6 overflow-hidden transition-all duration-400 hover:border-border-hover hover:bg-bg-elevated"
              >
                <h3 className="font-display text-[1.75rem] leading-[1.1] text-text mb-2">{tier.name}</h3>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="font-display text-3xl text-accent">{usd(cents * REV_SHARE_PCT / 100)}</span>
                  <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">
                    to you, of {usd(cents)}
                  </span>
                </div>
                <p className="text-text-secondary text-[14px] leading-[1.6]">{tier.what}</p>
              </motion.div>
            )
          })}
        </div>

        <p className="mt-6 text-[13px] text-text-dim leading-relaxed max-w-2xl">
          That is the entire model. No monthly fee, no payment per click or per post, no retainer. Deals appear in your studio as they are confirmed; settlement is arranged with you directly.
        </p>
      </section>

      {/* ─── FAQ ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="gradient-divider mb-10" />
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            Frequently Asked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map((faq, index) => (
            <motion.details
              key={faq.q}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.06 }}
              className="group bg-bg-card border border-border rounded-xl p-5 transition-all duration-400 hover:border-border-hover hover:bg-bg-elevated open:border-border-accent"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-display text-[1.15rem] text-text leading-tight">
                {faq.q}
                <span className="text-accent/50 text-sm shrink-0 group-open:rotate-45 transition-transform duration-300">+</span>
              </summary>
              <p className="mt-3 text-text-secondary text-[15px] leading-[1.65]">{faq.a}</p>
            </motion.details>
          ))}
        </div>
      </section>

      {/* ─── Apply Form ─── */}
      <section id="apply" className="max-w-[1120px] mx-auto px-6 pt-16 pb-24">
        <div className="gradient-divider mb-10" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="relative border border-border rounded-xl overflow-hidden bg-bg-card"
        >
          <div className="absolute -top-16 -right-16 w-[220px] h-[220px] bg-accent/4 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative p-6 md:p-10">
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center max-w-lg mx-auto py-10"
              >
                <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-5">
                  Application received
                </span>
                <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1] text-text mb-4">
                  We{'’'}ll read it properly.
                </h2>
                <p className="text-text-secondary text-[15px] leading-[1.65] mb-8">
                  Every application is read by a person, and we open one country at a time. Expect a reply at <span className="text-text">{form.email}</span> within 5 business days.
                </p>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all"
                >
                  &larr; Back to guides
                </Link>
              </motion.div>
            ) : (
              <>
                <div className="mb-8 max-w-xl">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-3">
                    Apply to join
                  </span>
                  <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1] text-text mb-3">
                    Tell us where you know.
                  </h2>
                  <p className="text-text-secondary text-[15px] leading-[1.65]">
                    The network is invite-only, and each country is assigned to one creator to cover. Applying takes two minutes — the list you already have does the rest of the arguing.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Your name" required>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(e) => update('full_name', e.target.value)}
                      autoComplete="name"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Email" required>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      autoComplete="email"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Where we can see your work" required>
                    <input
                      type="text"
                      value={form.social_handle}
                      onChange={(e) => update('social_handle', e.target.value)}
                      placeholder="@yourhandle — Instagram, TikTok, YouTube, a blog"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Country you know best" required>
                    <select
                      value={form.country_id}
                      onChange={(e) => update('country_id', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select a country</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.flag_emoji ? `${c.flag_emoji} ` : ''}{c.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="City or region">
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                      placeholder="Where your list is densest"
                      autoComplete="address-level2"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Link to your list or profile" required>
                    <input
                      type="url"
                      value={form.list_url}
                      onChange={(e) => update('list_url', e.target.value)}
                      placeholder="https://"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="What do you actually cover?" required className="md:col-span-2">
                    <textarea
                      value={form.pitch}
                      onChange={(e) => update('pitch', e.target.value)}
                      rows={4}
                      placeholder="Which country, roughly how many places you have saved, and what kind of traveler your list is for. Two or three sentences is plenty — we are reading for taste, not length."
                      className={`${inputClass} resize-none`}
                    />
                  </Field>

                  <div className="md:col-span-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-2">
                    <p className="text-[11px] text-text-dim tracking-[0.05em] leading-relaxed max-w-sm">
                      By applying, you agree to receive one reply from the Insider Guide team. No spam {'—'} ever.
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="submit"
                      disabled={submitting}
                      className="bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting…' : 'Submit application'}
                    </motion.button>
                  </div>

                  {error && (
                    <p role="alert" className="md:col-span-2 text-red-400/80 text-[12px] font-light">
                      {error}
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display text-lg text-text/40 hover:text-text/70 transition-colors no-underline">
            Insider Guide
          </Link>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <a
              href="https://instagram.com/alexspexx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light"
            >
              Instagram
            </a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/privacy.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">
              Privacy
            </a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/terms.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">
              Terms
            </a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="mailto:lead@insiderguide.co" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

const inputClass =
  'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-[14px] text-text placeholder:text-text-dim/60 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all'

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-1.5">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}
