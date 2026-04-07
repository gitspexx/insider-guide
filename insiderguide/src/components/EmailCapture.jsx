import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

export default function EmailCapture({ countrySlug }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)

    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({ email, country_slug: countrySlug, source: 'web' })

    if (error) {
      if (error.code === '23505') {
        setStatus('already')
      } else {
        setStatus('error')
      }
    } else {
      setStatus('success')
      setEmail('')
    }
    setSubmitting(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
      className="relative border border-border rounded-xl overflow-hidden bg-bg-card"
    >
      {/* Ambient glow */}
      <div className="absolute -top-16 -right-16 w-[200px] h-[200px] bg-accent/4 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Left: copy */}
          <div className="flex-1">
            <h3 className="font-display text-2xl text-text mb-1.5">
              Get the full map
            </h3>
            <p className="text-[13px] text-text-dim font-light leading-relaxed">
              DM <span className="text-accent">&lsquo;{countrySlug?.toUpperCase()}&rsquo;</span> on Instagram or subscribe below
            </p>
          </div>

          {/* Right: form */}
          <div className="flex-1 max-w-sm">
            {status === 'success' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2.5 py-3"
              >
                <span className="w-2 h-2 bg-accent rounded-full" />
                <span className="text-accent text-[13px] font-light">You're in. Check your DMs soon.</span>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  aria-label="Email address"
                  name="email"
                  autoComplete="email"
                  className="flex-1 bg-bg border border-border rounded-lg px-4 py-2.5 text-[13px] text-text placeholder:text-text-dim/50 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all font-light"
                />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={submitting}
                  className="bg-accent text-bg text-[11px] tracking-[0.1em] uppercase font-medium px-5 py-2.5 rounded-lg hover:bg-accent/85 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-wait"
                >
                  {submitting ? 'Sending...' : 'Subscribe'}
                </motion.button>
              </form>
            )}
            {status === 'already' && (
              <p className="text-text-dim text-[12px] mt-2 font-light">Already subscribed.</p>
            )}
            {status === 'error' && (
              <p className="text-red-400/80 text-[12px] mt-2 font-light">Something went wrong. Try again.</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
