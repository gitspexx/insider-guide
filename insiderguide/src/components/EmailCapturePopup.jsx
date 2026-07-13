import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

/**
 * Soft email-capture popup for country guides.
 * Shows once per session (per country) after a short delay OR on exit-intent,
 * whichever fires first. Fully dismissible (X / Esc / backdrop). On submit it
 * writes to `newsletter_subscribers` (source: 'web_popup') — a DB trigger then
 * mirrors the email into the CRM `contacts` table (GrowthOps).
 */
export default function EmailCapturePopup({ countrySlug, source = 'web_popup', heading }) {
  const seenKey = `ig_popup_seen_${countrySlug || 'all'}`
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  const alreadySeen = useCallback(() => {
    try { return localStorage.getItem(seenKey) === '1' } catch { return false }
  }, [seenKey])

  const markSeen = useCallback(() => {
    try { localStorage.setItem(seenKey, '1') } catch { /* private mode */ }
  }, [seenKey])

  const dismiss = useCallback(() => {
    setOpen(false)
    markSeen()
  }, [markSeen])

  // Trigger: 12s delay OR exit-intent (mouse leaves viewport top), once per session.
  useEffect(() => {
    if (alreadySeen()) return
    let fired = false
    const fire = () => {
      if (fired || alreadySeen()) return
      fired = true
      setOpen(true)
    }
    const timer = setTimeout(fire, 12000)
    const onMouseOut = (e) => { if (e.clientY <= 0) fire() }
    document.addEventListener('mouseout', onMouseOut)
    return () => { clearTimeout(timer); document.removeEventListener('mouseout', onMouseOut) }
  }, [alreadySeen])

  // Esc to close + focus the input on open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, dismiss])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)
    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({ email, country_slug: countrySlug, source })

    if (error) {
      setStatus(error.code === '23505' ? 'already' : 'error')
    } else {
      setStatus('success')
      setEmail('')
    }
    setSubmitting(false)
    markSeen()
    if (!error || error.code === '23505') setTimeout(() => setOpen(false), 2200)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Subscribe for free travel maps"
        >
          {/* Scrim */}
          <button
            aria-label="Close"
            onClick={dismiss}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="relative w-full max-w-md border border-border rounded-2xl overflow-hidden bg-bg-card shadow-2xl"
          >
            {/* Ambient glow */}
            <div className="absolute -top-20 -right-20 w-[240px] h-[240px] bg-accent/5 rounded-full blur-[90px] pointer-events-none" />

            {/* Close */}
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3.5 right-3.5 z-10 w-8 h-8 flex items-center justify-center rounded-full text-text-dim hover:text-text hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="relative p-7 sm:p-8">
              <div className="text-[11px] tracking-[0.18em] uppercase text-accent font-medium mb-3">
                Insider Guide · Free
              </div>
              <h3 className="font-display text-[26px] leading-tight text-text mb-2">
                {heading || 'Never miss the next drop 🗺️'}
              </h3>
              <p className="text-[13.5px] text-text-dim font-light leading-relaxed mb-5">
                A new country guide every week — hand-picked maps of where to eat, stay &amp; explore. Free, straight to your inbox, zero spam.
              </p>

              {status === 'success' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  aria-live="polite"
                  className="flex items-center gap-2.5 py-3"
                >
                  <span className="w-2 h-2 bg-accent rounded-full" />
                  <span className="text-accent text-[13.5px] font-light">You're on the list. Next drop lands soon.</span>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                  <input
                    ref={inputRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    aria-label="Email address"
                    name="email"
                    autoComplete="email"
                    required
                    className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-[14px] text-text placeholder:text-text-dim/50 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all font-light"
                  />
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-5 py-3 rounded-lg hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {submitting ? 'Sending…' : 'Get free guides'}
                  </motion.button>
                  {status === 'already' && (
                    <p className="text-text-dim text-[12px] font-light">You're already subscribed 🤝</p>
                  )}
                  {status === 'error' && (
                    <p className="text-red-400/80 text-[12px] font-light">Something went wrong. Try again.</p>
                  )}
                  <p className="text-text-dim/70 text-[11px] font-light text-center mt-0.5">
                    Or DM <span className="text-accent">‘{countrySlug?.toUpperCase()}’</span> to @alexspexx on Instagram
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
