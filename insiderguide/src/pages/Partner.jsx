import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORY_OPTIONS = [
  { value: 'eat', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'drink', label: 'Bar / Drinks' },
  { value: 'stay', label: 'Hotel / Stay' },
  { value: 'do', label: 'Tour / Activity' },
  { value: 'explore', label: 'Landmark / Explore' },
  { value: 'wellness', label: 'Wellness / Spa' },
  { value: 'misc', label: 'Other' },
]

const TIERS = [
  {
    key: 'listed',
    name: 'Listed',
    price: 'Free',
    period: 'waitlist',
    description: 'Basic directory entry while you wait for review.',
    features: [
      'Business name + Google Maps link',
      'Category + city listing',
      'Visible to travelers browsing your country',
      'Admin review before going live',
    ],
    cta: 'Join the waitlist',
  },
  {
    key: 'featured',
    name: 'Featured',
    price: '$200',
    period: 'per guide',
    description: 'Stand out in Alex\u2019s curated picks.',
    highlight: true,
    badge: 'Recommended',
    features: [
      'Everything in Listed',
      'Pinned to top of your category',
      'Written profile in Alex\u2019s voice',
      '\u201cRecommended by Alex\u201d badge',
      'Mentioned in the traveler newsletter',
    ],
    cta: 'Apply for Featured',
  },
  {
    key: 'partner',
    name: 'Partner',
    price: '$500',
    period: 'guide + content',
    description: 'Hero placement, dedicated story, ongoing collaboration.',
    features: [
      'Everything in Featured',
      'Hero placement in your country guide',
      'Dedicated Instagram story by Alex',
      'Logo in newsletter header',
      'Content collaboration opportunity',
    ],
    cta: 'Apply to Partner',
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Apply',
    desc: 'Tell us about your business, country, and which tier you\u2019re interested in. Takes two minutes.',
  },
  {
    step: '02',
    title: 'We review',
    desc: 'Alex personally reviews every application. We curate \u2014 not everything makes it in.',
  },
  {
    step: '03',
    title: 'Get discovered',
    desc: 'Once accepted, travelers planning trips to your country find you in the guide.',
  },
]

const FAQS = [
  {
    q: 'How do I get accepted?',
    a: 'Apply through the form below. Alex personally reviews every submission. We prioritise independent, traveler-loved places \u2014 not chains.',
  },
  {
    q: 'What countries are open?',
    a: 'The guide covers 90+ countries across South America, Central America, the Caribbean, Europe, Asia, the Middle East, and Africa. Pick yours in the form \u2014 if it\u2019s missing we\u2019ll add it.',
  },
  {
    q: 'How are travelers finding me?',
    a: 'Our country guides rank on Google, get shared through Alex\u2019s newsletter and Instagram (500K+ combined reach), and are the first place our community goes before a trip.',
  },
  {
    q: 'What\u2019s the difference between Featured and Partner?',
    a: 'Featured gets you written placement at the top of your category. Partner adds hero placement, a dedicated Instagram story, and an ongoing content collab \u2014 ideal for hotels and flagship experiences.',
  },
  {
    q: 'Is this a review site?',
    a: 'No. Insider Guide is a personal recommendation from Alex Spexx. Listings are curated, not paid reviews. Featured and Partner tiers cover placement and content \u2014 never the opinion.',
  },
]

export default function Partner() {
  const [countries, setCountries] = useState([])
  const [form, setForm] = useState({
    name: '',
    country_id: '',
    city: '',
    category: 'eat',
    website: '',
    instagram_handle: '',
    email: '',
    tier_interest: 'listed',
    notes: '',
    prefers_call: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadCountries() {
      const { data } = await supabase.from('countries').select('id, name, flag_emoji').order('name')
      if (data) setCountries(data)
    }
    loadCountries()
  }, [])

  const canSubmit = useMemo(() => {
    return form.name.trim() && form.country_id && form.email.trim() && !submitting
  }, [form, submitting])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const tierInterest = form.tier_interest
    const callFlag = form.prefers_call ? ' Prefers a quick call.' : ''
    const notesPrefix = `[partner-signup] Tier interest: ${tierInterest}.${callFlag}`
    const extraNotes = form.notes.trim() ? ` ${form.notes.trim()}` : ''

    const payload = {
      name: form.name.trim(),
      country_id: form.country_id,
      city: form.city.trim(),
      category: form.category,
      website: form.website.trim(),
      instagram_handle: form.instagram_handle.trim(),
      email: form.email.trim(),
      tier: 'listed',
      published: false,
      outreach_status: 'to_contact',
      notes: `${notesPrefix}${extraNotes}`,
    }

    const { error: insertError } = await supabase.from('businesses').insert(payload)
    setSubmitting(false)

    if (insertError) {
      setError(insertError.message || 'Something went wrong. Please try again.')
      return
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen">
      {/* ─── Nav ─── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="font-display text-[22px] text-text leading-none">Insider Guide</span>
            <span className="hidden sm:inline-block w-[1px] h-4 bg-border" />
            <span className="hidden sm:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">by @alexspexx</span>
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
              Partner Program
            </span>

            <h1 className="font-display text-[clamp(2.6rem,5.5vw,5rem)] leading-[0.95] tracking-[-0.02em] text-text mb-6">
              Be found by travelers<br />
              planning trips to<br />
              <span className="text-accent-gradient italic">your country.</span>
            </h1>

            <p className="font-editorial text-[clamp(1.05rem,2vw,1.3rem)] text-text-secondary leading-relaxed max-w-xl italic mb-8">
              100 countries. Handpicked listings. Featured placement for partners who deserve the spotlight.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#apply"
                className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Apply to the directory
              </a>
              <a
                href="#tiers"
                className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                See tiers
              </a>
            </div>
          </motion.div>
        </div>

        <div className="shimmer-line max-w-[1120px] mx-auto" />
      </section>

      {/* ─── How It Works ─── */}
      <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            How It Works
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
              className="relative flex flex-col min-h-[200px] bg-bg-card border border-border rounded-xl p-6 overflow-hidden transition-all duration-400 hover:border-border-accent hover:bg-bg-elevated hover:shadow-[0_8px_40px_rgba(200,165,90,0.05)]"
            >
              <span className="text-[11px] tracking-[0.12em] uppercase text-accent/60 font-light mb-4">{step.step}</span>
              <h3 className="font-display text-[1.75rem] leading-[1.1] text-text mb-2">{step.title}</h3>
              <p className="font-editorial italic text-text-secondary text-[15px] leading-snug">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Tiers ─── */}
      <section id="tiers" className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
        <div className="gradient-divider mb-10" />
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent/50" />
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
            Partnership Tiers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier, index) => (
            <motion.div
              key={tier.key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
              className={`relative flex flex-col bg-bg-card border rounded-xl p-6 overflow-hidden transition-all duration-400 hover:bg-bg-elevated ${
                tier.highlight
                  ? 'border-border-accent shadow-[0_8px_40px_rgba(200,165,90,0.08)]'
                  : 'border-border hover:border-border-hover'
              }`}
            >
              {tier.badge && (
                <span className="absolute top-5 right-5 text-[10px] tracking-[0.15em] uppercase border border-accent/25 bg-accent/10 text-accent px-2.5 py-1 rounded-full font-light">
                  {tier.badge}
                </span>
              )}

              <h3 className="font-display text-[1.75rem] leading-[1.1] text-text mb-2">{tier.name}</h3>

              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-display text-3xl text-text">{tier.price}</span>
                <span className="text-[11px] text-text-dim tracking-[0.1em] uppercase font-light">{tier.period}</span>
              </div>

              <p className="font-editorial italic text-text-secondary text-[14px] leading-snug mb-6">
                {tier.description}
              </p>

              <ul className="space-y-2.5 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-text-secondary leading-relaxed">
                    <span className="w-1 h-1 mt-2 bg-accent/60 rounded-full shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#apply"
                onClick={() => update('tier_interest', tier.key)}
                className={`mt-auto text-center text-[11px] tracking-[0.1em] uppercase font-medium px-5 py-3 rounded-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  tier.highlight
                    ? 'bg-accent text-bg hover:bg-accent/85'
                    : 'border border-border text-text-secondary hover:border-border-hover hover:text-text hover:bg-bg-elevated'
                }`}
              >
                {tier.cta}
              </a>
            </motion.div>
          ))}
        </div>
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
              <p className="mt-3 font-editorial italic text-text-secondary text-[14px] leading-relaxed">{faq.a}</p>
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
                  We{'\u2019'}ll be in touch.
                </h2>
                <p className="font-editorial italic text-text-secondary text-[16px] leading-relaxed mb-8">
                  Alex personally reviews every application. Expect a reply within 5 business days at the email you provided.
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
                    Tell us about your business.
                  </h2>
                  <p className="font-editorial italic text-text-secondary text-[15px] leading-relaxed">
                    Two minutes. Alex reads every application.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Business name" required>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      required
                      autoComplete="organization"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Email" required>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      required
                      autoComplete="email"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Country" required>
                    <select
                      value={form.country_id}
                      onChange={(e) => update('country_id', e.target.value)}
                      required
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

                  <Field label="City">
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                      autoComplete="address-level2"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Category">
                    <select
                      value={form.category}
                      onChange={(e) => update('category', e.target.value)}
                      className={inputClass}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Tier interest">
                    <select
                      value={form.tier_interest}
                      onChange={(e) => update('tier_interest', e.target.value)}
                      className={inputClass}
                    >
                      {TIERS.map((t) => (
                        <option key={t.key} value={t.key}>{t.name} {'\u2014'} {t.price}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Website">
                    <input
                      type="url"
                      value={form.website}
                      onChange={(e) => update('website', e.target.value)}
                      placeholder="https://"
                      autoComplete="url"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Instagram handle">
                    <input
                      type="text"
                      value={form.instagram_handle}
                      onChange={(e) => update('instagram_handle', e.target.value)}
                      placeholder="@your_business"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Anything else?" className="md:col-span-2">
                    <textarea
                      value={form.notes}
                      onChange={(e) => update('notes', e.target.value)}
                      rows={3}
                      placeholder="Optional \u2014 tell us what makes your place special."
                      className={`${inputClass} resize-none`}
                    />
                  </Field>

                  <label className="md:col-span-2 flex items-center gap-3 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={form.prefers_call}
                      onChange={(e) => update('prefers_call', e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-bg accent-accent cursor-pointer"
                    />
                    <span className="text-[12px] text-text-secondary tracking-[0.02em] group-hover:text-text transition-colors">
                      I{'\u2019'}d prefer a quick call before deciding.
                    </span>
                  </label>

                  <div className="md:col-span-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-2">
                    <p className="text-[11px] text-text-dim tracking-[0.05em] leading-relaxed max-w-sm">
                      By applying, you agree to receive one reply from the Insider Guide team. No spam {'\u2014'} ever.
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="submit"
                      disabled={!canSubmit}
                      className="bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting\u2026' : 'Submit application'}
                    </motion.button>
                  </div>

                  {error && (
                    <p className="md:col-span-2 text-red-400/80 text-[12px] font-light">
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
            <Link to="/privacy" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">
              Privacy
            </Link>
            <span className="w-[1px] h-3 bg-border" />
            <Link to="/terms" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">
              Terms
            </Link>
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
