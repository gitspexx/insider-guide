import { useEffect, useRef, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { nucleoTrack } from '../lib/nucleo'
import Seo from '../components/Seo'
import Field, { inputClass } from '../components/FormField'
import {
  BLANK_FORM,
  DAY_OPTIONS,
  TIME_OPTIONS,
  describeInsertError,
  detectTimezone,
  formatAvailability,
  normalizeInstagram,
  togglePill,
  validateStep,
} from '../lib/availability'

// Deliberately not a calendar. Publishing slots would mean publishing a
// timezone, and there isn't one — the reply to a cold email arrives while the
// person answering it is somewhere between Bali and Bogotá. The visitor states
// their week, we do the arithmetic, and nobody books 03:00.
//
// Ported from bca-front's AvailabilityForm (BCA runs the same pattern), rebuilt
// on Insider Guide's own surface: warm dark, gold accent, font-display serif.
// The state machine is the part worth copying; none of the styling is.

const LAST_INPUT_STEP = 2
const STEP_COUNT = LAST_INPUT_STEP + 1

const STEPS = [
  {
    eyebrow: 'Step one',
    heading: 'What do you want to talk about?',
    sub: 'A sentence is enough. It decides who takes the call and what we have open in front of us.',
  },
  {
    eyebrow: 'Step two',
    heading: 'When is good for you?',
    sub: 'Pick every day and every window that would work. The more you tick, the sooner this lands.',
  },
  {
    eyebrow: 'Step three',
    heading: 'Where do we reach you?',
    sub: 'Email is where the invite goes. Add WhatsApp or Instagram if you would rather we started there.',
  },
]

const WHAT_HAPPENS = [
  {
    k: '01',
    h: 'You send a window, not a booking',
    p: 'No calendar to fight with and no slot to hold. Tick the days and the parts of the day that suit you and we find the overlap.',
  },
  {
    k: '02',
    h: 'A person replies with one time',
    p: 'Usually within a business day, by email, with an invite already attached. If none of your windows work we say so and propose the nearest one that does.',
  },
  {
    k: '03',
    h: 'Twenty minutes, no deck',
    p: 'What you want out of the guide, which country, which placement, what it costs. If Insider Guide is the wrong fit we will tell you on the call rather than after it.',
  },
]

export default function Book() {
  const [step, setStep] = useState(0)
  // Timezone is detected in the initialiser rather than in an effect: the app is
  // a client-rendered SPA, so Intl is available on the first render, and seeding
  // it here avoids both a second render and the setState-in-effect the hooks
  // lint rightly rejects. Auto-detect is wrong often enough — a VPN, a laptop
  // that never left the last country — that the field stays editable.
  const [form, setForm] = useState(() => ({ ...BLANK_FORM, timezone: detectTimezone() }))
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const headingRef = useRef(null)
  // First render must not steal focus from the top of the page; every step
  // change after it must move focus, or a keyboard user who pressed Next lands
  // back at the nav. Keyed on the step rather than on a "have I run" flag:
  // StrictMode double-invokes effects in dev, and a bare flag focuses the
  // heading on mount on the second pass.
  const focusedFor = useRef(null)

  useEffect(() => {
    const key = submitted ? 'done' : `step-${step}`
    const first = focusedFor.current === null
    if (focusedFor.current === key) return
    focusedFor.current = key
    if (!first) headingRef.current?.focus()
  }, [step, submitted])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Functional update, always. Two pills toggled inside one React batch both
  // read the same rendered `form`, so `setForm(togglePill(form, …))` drops the
  // first one — see the comment on togglePill and the pair of tests pinning it.
  function toggle(key, id) {
    setForm((prev) => togglePill(prev, key, id))
  }

  function goBack() {
    setError('')
    setStep((prev) => Math.max(0, prev - 1))
  }

  // One <form>, one submit button: Enter advances the same way the button does,
  // and the last step sends. Nothing here is a <div onClick>.
  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    const problem = validateStep(step, form)
    if (problem) { setError(problem); return }
    if (step < LAST_INPUT_STEP) { setError(''); setStep(step + 1); return }

    setSubmitting(true)
    setError('')

    // No status field: it isn't in the INSERT column grant, so the row can only
    // ever land as 'pending'.
    const { error: insertError } = await supabase.from('call_requests').insert({
      name: form.name.trim(),
      topic: form.topic.trim(),
      days: form.days,
      times: form.times,
      timezone: form.timezone.trim(),
      email: form.email.trim(),
      whatsapp: form.whatsapp.trim(),
      instagram: normalizeInstagram(form.instagram),
    })
    setSubmitting(false)

    if (insertError) {
      console.error('Book: insert failed', insertError)
      setError(describeInsertError(insertError))
      return
    }
    setSubmitted(true)
    nucleoTrack('form_submitted', { form: 'book' })
    notifyCallRequest(form.email.trim().toLowerCase())
  }

  const summary = formatAvailability(form.days, form.times, form.timezone)

  return (
    // reducedMotion="user" makes framer-motion drop transform and layout
    // animation for anyone who asked their OS for less of it, keeping opacity.
    // The CSS-driven pill scale opts out separately, via motion-safe:.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        <Seo
          title="Book a call — talk to someone before you buy anything"
          description="Tell us what you want to cover and which days work for you. No calendar to fight with: a person reads the request and comes back with one time and an invite."
          path="/book"
        />

        {/* ─── Nav ─── */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="fixed top-0 left-0 right-0 z-40 border-b border-border"
          style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
        >
          <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 no-underline group" aria-label="Insider Guide home">
              <img src="/favicon.png" alt="" width="22" height="22" className="rounded-md" />
              <span className="font-display text-[22px] text-text leading-none group-hover:text-accent transition-colors">Insider Guide</span>
              <span className="hidden md:inline-block w-[1px] h-4 bg-border" />
              <span className="hidden md:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">talk to a person first</span>
            </Link>
            <Link
              to="/partner"
              className="shrink-0 text-[11px] text-accent tracking-[0.12em] uppercase font-light hover:text-accent/80 transition-colors no-underline"
            >
              The placements
            </Link>
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
                Book a call
              </span>

              <h1 className="font-display text-[clamp(2.6rem,5.5vw,5rem)] leading-[0.95] tracking-[-0.02em] text-text mb-6">
                We&rsquo;re rarely in<br />
                the same timezone.<br />
                <span className="text-accent-gradient italic">So pick the week, not the hour.</span>
              </h1>

              <p className="text-[clamp(1.05rem,2vw,1.25rem)] text-text-secondary leading-relaxed max-w-xl mb-8">
                There is no calendar to book here on purpose. Tell us what you want to cover and which days and windows suit you, and a person comes back with one time and an invite.
              </p>

              <a
                href="#request"
                className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Send a request
              </a>
            </motion.div>
          </div>

          <div className="shimmer-line max-w-[1120px] mx-auto" />
        </section>

        {/* ─── What happens next ─── */}
        <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-6">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-2 h-2 rounded-full bg-accent/50" />
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-secondary font-light">
              What happens next
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {WHAT_HAPPENS.map((b, i) => (
              <motion.div
                key={b.k}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                className="relative flex flex-col bg-bg-card border border-border rounded-xl p-6 transition-all duration-400 hover:border-border-accent hover:bg-bg-elevated"
              >
                <span className="text-[11px] tracking-[0.12em] uppercase text-accent/60 font-light mb-4">{b.k}</span>
                <h2 className="font-display text-[1.5rem] leading-[1.1] text-text mb-3">{b.h}</h2>
                <p className="text-text-secondary text-[14px] leading-relaxed">{b.p}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── Request form ─── */}
        <section id="request" className="max-w-[1120px] mx-auto px-6 pt-16 pb-24">
          <div className="gradient-divider mb-10" />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5 }}
            className="relative border border-border rounded-xl overflow-hidden bg-bg-card max-w-2xl"
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
                    Request received
                  </span>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1] text-text mb-4 focus-visible:outline-none"
                  >
                    Thanks, {form.name.trim() || 'talk soon'}.
                  </h2>
                  <p className="text-text-secondary text-[15px] leading-[1.65] mb-3">
                    We have you down for <span className="text-text">{summary}</span>. A person reads every one of these — expect one time and an invite at <span className="text-text">{form.email.trim()}</span>, usually within a business day.
                  </p>
                  <p className="text-text-dim text-[13px] leading-relaxed mb-8">
                    Nothing is booked yet, so there is nothing to cancel. If your week changes, reply to that email.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link
                      to="/partner"
                      className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      Read the placements
                    </Link>
                    <Link
                      to="/"
                      className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                    >
                      &larr; Back to the guides
                    </Link>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Progress. The dots are decoration; the sentence is what a
                      screen reader and a hurried reader both get. */}
                  <div className="flex items-center gap-3 mb-8">
                    <span className="text-[11px] tracking-[0.12em] uppercase text-text-dim font-light">
                      Step {step + 1} of {STEP_COUNT}
                    </span>
                    <span className="flex items-center gap-1.5" aria-hidden="true">
                      {STEPS.map((s, i) => (
                        <span
                          key={s.eyebrow}
                          className={`h-[3px] rounded-full transition-all duration-300 ${
                            i <= step ? 'w-7 bg-accent/70' : 'w-4 bg-border-hover'
                          }`}
                        />
                      ))}
                    </span>
                  </div>

                  <div className="mb-8 max-w-xl">
                    <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-3">
                      {STEPS[step].eyebrow}
                    </span>
                    <h2
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.05] text-text mb-3 focus-visible:outline-none"
                    >
                      {STEPS[step].heading}
                    </h2>
                    <p className="text-text-secondary text-[15px] leading-[1.65]">{STEPS[step].sub}</p>
                  </div>

                  <form onSubmit={handleSubmit} noValidate>
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-1 gap-4"
                    >
                      {step === 0 && (
                        <>
                          <Field label="Your name" required>
                            <input
                              type="text"
                              value={form.name}
                              onChange={(e) => update('name', e.target.value)}
                              autoComplete="name"
                              className={inputClass}
                            />
                          </Field>

                          <Field
                            label="What do you want to talk about?"
                            required
                            hint="Anything you would have put in the reply to our email."
                            hintId="topic-hint"
                          >
                            <textarea
                              value={form.topic}
                              onChange={(e) => update('topic', e.target.value)}
                              rows={4}
                              aria-describedby="topic-hint"
                              placeholder="Which country you're in, what you run, and what you're weighing up — a listing, the featured spot, the whole country guide."
                              className={`${inputClass} resize-none`}
                            />
                          </Field>
                        </>
                      )}

                      {step === 1 && (
                        <>
                          {/* Two pill groups, each a real fieldset so the legend
                              is announced before the buttons inside it. The
                              buttons carry aria-pressed rather than pretending
                              to be checkboxes. */}
                          <PillGroup
                            legend="Days that work"
                            options={DAY_OPTIONS}
                            selected={form.days}
                            onToggle={(id) => toggle('days', id)}
                            labelOf={(o) => o.label}
                            ariaLabelOf={(o) => o.long}
                          />

                          <PillGroup
                            legend="Time of day"
                            options={TIME_OPTIONS}
                            selected={form.times}
                            onToggle={(id) => toggle('times', id)}
                            labelOf={(o) => o.label}
                            subOf={(o) => o.hours}
                            ariaLabelOf={(o) => `${o.label}, ${o.hours}`}
                          />

                          <Field
                            label="Your timezone"
                            required
                            hint="Auto-detected. Change it if that isn’t where you are — an IANA name like Europe/Rome or America/Bogota."
                            hintId="tz-hint"
                            className="max-w-sm"
                          >
                            <input
                              type="text"
                              value={form.timezone}
                              onChange={(e) => update('timezone', e.target.value)}
                              aria-describedby="tz-hint"
                              placeholder="Europe/Rome"
                              className={inputClass}
                            />
                          </Field>
                        </>
                      )}

                      {step === 2 && (
                        <>
                          <Field
                            label="Email"
                            required
                            hint="The invite goes here. One reply about this call — nothing else, ever."
                            hintId="email-hint"
                          >
                            <input
                              type="email"
                              value={form.email}
                              onChange={(e) => update('email', e.target.value)}
                              autoComplete="email"
                              aria-describedby="email-hint"
                              className={inputClass}
                            />
                          </Field>

                          <fieldset className="border-0 p-0 m-0 min-w-0">
                            <legend className="text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-3">
                              Other ways to reach you (optional)
                            </legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <Field label="WhatsApp" hint="With the country code." hintId="wa-hint">
                                <input
                                  type="tel"
                                  value={form.whatsapp}
                                  onChange={(e) => update('whatsapp', e.target.value)}
                                  autoComplete="tel"
                                  inputMode="tel"
                                  aria-describedby="wa-hint"
                                  placeholder="+57 300 123 4567"
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Instagram" hint="Handle or the link, either is fine." hintId="ig-hint">
                                <input
                                  type="text"
                                  value={form.instagram}
                                  onChange={(e) => update('instagram', e.target.value)}
                                  aria-describedby="ig-hint"
                                  placeholder="@yourhandle"
                                  className={inputClass}
                                />
                              </Field>
                            </div>
                          </fieldset>

                          {/* A request whose entire content is "when" earns one
                              last look at the when. */}
                          <div className="border border-border rounded-lg bg-bg/60 px-4 py-3">
                            <span className="block text-[11px] tracking-[0.12em] uppercase text-text-dim font-light mb-1">
                              Sending
                            </span>
                            <p className="text-[13px] text-text-secondary leading-relaxed">
                              {summary || 'No days picked yet.'}
                            </p>
                          </div>
                        </>
                      )}
                    </motion.div>

                    {/* Always mounted: a live region added to the DOM at the same
                        moment as its text is not reliably announced. */}
                    <p
                      role="alert"
                      aria-live="polite"
                      className="min-h-[1.25rem] mt-4 text-red-400/80 text-[12px] font-light leading-relaxed"
                    >
                      {error}
                    </p>

                    {/* flex-col, not flex-col-reverse: the visual order on a
                        phone has to be the tab order, and reversing it puts Back
                        under Next for a mouse and over it for a keyboard. */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                      {step > 0 && (
                        <button
                          type="button"
                          onClick={goBack}
                          className="border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        >
                          &larr; Back
                        </button>
                      )}
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="submit"
                        disabled={submitting}
                        className="bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {step < LAST_INPUT_STEP ? 'Next' : submitting ? 'Sending…' : 'Send request'}
                      </motion.button>
                      {step === LAST_INPUT_STEP && (
                        <p className="text-[11px] text-text-dim tracking-[0.05em] leading-relaxed sm:max-w-xs">
                          Nothing is booked and nothing is charged. You are asking for a time, not taking one.
                        </p>
                      )}
                    </div>
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
    </MotionConfig>
  )
}

/**
 * A multi-select rendered as toggle buttons.
 *
 * <button aria-pressed> rather than checkboxes: these are one control each,
 * operable with Enter and Space for free, and the pressed state is what a
 * screen reader reads out. flex-wrap is what keeps seven days inside 400px.
 */
function PillGroup({ legend, options, selected, onToggle, labelOf, subOf, ariaLabelOf }) {
  return (
    <fieldset className="border-0 p-0 m-0 min-w-0">
      <legend className="text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-2.5">
        {legend} *
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              aria-label={ariaLabelOf ? ariaLabelOf(option) : undefined}
              onClick={() => onToggle(option.id)}
              // Full class names on both branches, never a `motion-safe:${…}`
              // interpolation: Tailwind scans this file as text and cannot see a
              // candidate that is assembled at runtime.
              className={`text-left px-4 py-2.5 rounded-xl text-[13px] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                on
                  ? 'bg-accent text-bg font-medium border border-accent motion-safe:scale-[1.02]'
                  : 'bg-bg border border-border text-text-secondary hover:border-border-accent hover:text-text hover:bg-bg-elevated'
              }`}
            >
              <span className="block leading-tight">{labelOf(option)}</span>
              {subOf && (
                <span className={`block text-[11px] mt-0.5 font-light ${on ? 'text-bg/70' : 'text-text-dim'}`}>
                  {subOf(option)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Fire-and-forget, matching CreatorApply.jsx, Partner.jsx and Claim.jsx. The
 * address is the only handle the page has on the row: anon holds INSERT on eight
 * columns and no SELECT, so it cannot read back what it just wrote, and the fn
 * resolves the row server-side from the address. Never awaited — a notification
 * outage must not turn a stored request into a visible failure.
 */
function notifyCallRequest(email) {
  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-call-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email }),
  }).catch((e) => console.warn('notify-call-request failed:', e))
}
