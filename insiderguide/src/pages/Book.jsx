import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { nucleoTrack } from '../lib/nucleo'
import Seo from '../components/Seo'
import {
  BOOK_DAYS,
  BOOK_TIMES,
  EMPTY_BOOK_FORM,
  buildBookPayload,
  detectTimezone,
  toggleValue,
  validateBookStep,
} from '../lib/book-request'

/**
 * /book — "ask for a call" for businesses replying to outreach.
 *
 * Outreach replies used to send people here with the words "pick a time" and a
 * link to /partner, which is an application form. Alex travels, so we never
 * publish calendar slots: the visitor tells us which weekdays and time buckets
 * suit them, in their timezone, and we come back with two or three concrete
 * times. Three short steps, then a confirmation.
 *
 * The request is a `businesses` row written the same way /partner writes one
 * (that combination is what the anon-insert policy accepts), then the shared
 * notifier is told which row to read. The id is minted here because anon may
 * INSERT but cannot SELECT the row back.
 */

const STEPS = ['Who', 'When', 'How to reach you']

export default function Book() {
  const [countries, setCountries] = useState([])
  const [form, setForm] = useState(EMPTY_BOOK_FORM)
  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('countries')
      .select('id, name, flag_emoji')
      .order('name')
      .then(({ data }) => setCountries(data || []))
    setForm((prev) => (prev.timezone ? prev : { ...prev, timezone: detectTimezone() }))
  }, [])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const toggleDay = (id) => setForm((prev) => ({ ...prev, days: toggleValue(prev.days, id) }))
  const toggleTime = (id) => setForm((prev) => ({ ...prev, times: toggleValue(prev.times, id) }))

  const next = () => {
    const message = validateBookStep(step, form)
    if (message) return setError(message)
    setError(null)
    setStep((s) => s + 1)
  }
  const back = () => { setError(null); setStep((s) => Math.max(0, s - 1)) }

  const submit = async (e) => {
    e.preventDefault()
    const message = validateBookStep(2, form)
    if (message) return setError(message)
    setError(null)
    setSubmitting(true)

    const id = crypto.randomUUID()
    const { error: insertError } = await supabase.from('businesses').insert(buildBookPayload(form, id))
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message || 'Something went wrong. Please try again, or email lead@insiderguide.co.')
      return
    }
    setStep(3)
    nucleoTrack('meeting_booked', { form: 'book', days: form.days.length, times: form.times.length })

    // Same notifier /partner uses; it reads the row and posts "Call request" to
    // Slack + emails the team and the visitor. Fire-and-forget — the request is
    // saved either way.
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-partner-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ business_id: id }),
    }).catch((err) => console.warn('notify-partner-application failed:', err))
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Seo
        title="Book a call — Insider Guide"
        description="Tell us when you're free and we'll come back with two or three times that work in your timezone."
        path="/book"
      />

      {/* ─── Nav (same as /partner) ─── */}
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
          <Link to="/partner" className="text-[11px] text-accent tracking-[0.12em] uppercase font-light hover:text-accent/80 transition-colors no-underline">
            Partner program
          </Link>
        </div>
      </motion.nav>

      {/* ─── Hero ─── */}
      <section className="pt-36 pb-10 px-6">
        <div className="max-w-[720px] mx-auto text-center">
          <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-5">Book a call</span>
          <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-[1] text-text mb-5">
            Tell us when you{'’'}re free.<br />
            <em className="text-accent-gradient not-italic">We{'’'}ll find the time.</em>
          </h1>
          <p className="text-text-secondary text-[15px] leading-[1.65] max-w-[52ch] mx-auto">
            Alex is usually in a different timezone every week, so there is no calendar to pick from. Give us a few days and times that suit you and we{'’'}ll reply with two or three concrete slots.
          </p>
        </div>
      </section>

      {/* ─── Form card ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-[640px] mx-auto">
          <div className="relative rounded-2xl border border-border bg-bg-card overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
            <div className="p-6 md:p-10">
              {step < 3 && (
                <ol className="flex items-center gap-2 mb-8" aria-label="Progress">
                  {STEPS.map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-light ${
                          i <= step ? 'bg-accent text-bg' : 'border border-border text-text-dim'
                        }`}
                        aria-current={i === step ? 'step' : undefined}
                      >
                        {i + 1}
                      </span>
                      <span className={`text-[11px] tracking-[0.12em] uppercase ${i === step ? 'text-text' : 'text-text-dim'}`}>{label}</span>
                      {i < STEPS.length - 1 && <span className="w-6 h-px bg-border ml-1" />}
                    </li>
                  ))}
                </ol>
              )}

              {step === 3 ? (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="text-center max-w-lg mx-auto py-8">
                  <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-5">Request received</span>
                  <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1] text-text mb-4">
                    Thanks, {form.name.trim().split(' ')[0] || 'there'}.
                  </h2>
                  <p className="text-text-secondary text-[15px] leading-[1.65] mb-8">
                    We{'’'}ll reply at <span className="text-text">{form.email}</span> within one business day with two or three times in your timezone ({form.timezone}).
                  </p>
                  <Link to="/" className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all no-underline">
                    &larr; Back to guides
                  </Link>
                </motion.div>
              ) : (
                <form onSubmit={step === 2 ? submit : (e) => { e.preventDefault(); next() }} noValidate>
                  {step === 0 && (
                    <div className="space-y-5">
                      <Field label="Your name" required>
                        <input id="book-name" className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} autoComplete="name" placeholder="Ana Ruiz" />
                      </Field>
                      <Field label="Business" required>
                        <input id="book-business" className={inputClass} value={form.business} onChange={(e) => update('business', e.target.value)} autoComplete="organization" placeholder="Hotel Casa Verde" />
                      </Field>
                      <Field label="Country" required>
                        <select id="book-country" className={inputClass} value={form.countryId} onChange={(e) => update('countryId', e.target.value)}>
                          <option value="">Pick a country…</option>
                          {countries.map((c) => (
                            <option key={c.id} value={c.id}>{c.flag_emoji ? `${c.flag_emoji} ` : ''}{c.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="What do you want to talk about?" required>
                        <textarea id="book-need" className={`${inputClass} min-h-[110px] resize-y`} value={form.need} onChange={(e) => update('need', e.target.value)} placeholder="Getting listed, a content partnership, pricing — a couple of lines is plenty." />
                      </Field>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-7">
                      <div>
                        <span className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-2.5">Which days work? *</span>
                        <div className="flex flex-wrap gap-2">
                          {BOOK_DAYS.map((d) => (
                            <Pill key={d.id} on={form.days.includes(d.id)} onClick={() => toggleDay(d.id)}>{d.label}</Pill>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-2.5">Which time of day? *</span>
                        <div className="grid sm:grid-cols-3 gap-2">
                          {BOOK_TIMES.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTime(t.id)}
                              aria-pressed={form.times.includes(t.id)}
                              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                                form.times.includes(t.id) ? 'border-accent/60 bg-accent-faint' : 'border-border hover:border-border-hover'
                              }`}
                            >
                              <span className="block text-[14px] text-text">{t.label}</span>
                              <span className="block text-[12px] text-text-dim">{t.hint}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <Field label="Your timezone" required>
                        <input id="book-timezone" className={inputClass} value={form.timezone} onChange={(e) => update('timezone', e.target.value)} placeholder="Europe/Rome" />
                        <span className="block text-[12px] text-text-dim mt-1.5">Detected from your device — change it if you{'’'}re travelling.</span>
                      </Field>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-5">
                      <Field label="Email" required>
                        <input id="book-email" type="email" inputMode="email" autoComplete="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@yourbusiness.com" />
                        <span className="block text-[12px] text-text-dim mt-1.5">This is where the proposed times arrive.</span>
                      </Field>
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Field label="WhatsApp (optional)">
                          <input id="book-whatsapp" type="tel" inputMode="tel" className={inputClass} value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="+39 333 000 0000" />
                        </Field>
                        <Field label="Instagram (optional)">
                          <input id="book-instagram" className={inputClass} value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@yourbusiness" />
                        </Field>
                      </div>
                    </div>
                  )}

                  {error && (
                    <p role="alert" className="mt-5 text-[13px] text-[#E08A7A]">{error}</p>
                  )}

                  <div className="mt-8 flex items-center justify-between gap-3">
                    {step > 0 ? (
                      <button type="button" onClick={back} className="text-[12px] tracking-[0.1em] uppercase font-light text-text-secondary hover:text-text transition-colors">
                        &larr; Back
                      </button>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.12em] uppercase font-medium px-7 py-3.5 rounded-xl hover:bg-accent/90 disabled:opacity-60 transition-all"
                    >
                      {step === 2 ? (submitting ? 'Sending…' : 'Send request') : 'Continue'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-[12px] text-text-dim mt-6">
            Prefer to apply straight away? <Link to="/partner" className="text-accent hover:text-accent/80">Partner program &rarr;</Link>
          </p>
        </div>
      </section>

      {/* ─── Footer (same as /partner) ─── */}
      <footer className="border-t border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display text-lg text-text/40 hover:text-text/70 transition-colors no-underline">Insider Guide</Link>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <a href="https://instagram.com/alexspexx" target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">Instagram</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/privacy.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">Privacy</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/terms.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">Terms</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="mailto:lead@insiderguide.co" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

const inputClass =
  'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-[14px] text-text placeholder:text-text-dim/60 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all'

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-1.5">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

function Pill({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-4 py-2 text-[13px] transition-all ${
        on ? 'border-accent bg-accent text-bg' : 'border-border text-text-secondary hover:border-border-hover hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
