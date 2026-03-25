import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

export default function EmailCapture({ countrySlug }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return

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
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
      className="relative border border-border rounded-sm p-6 bg-bg-card overflow-hidden gradient-border"
    >
      {/* Ambient glow */}
      <div className="absolute -top-10 -right-10 w-[150px] h-[150px] bg-gold/5 rounded-full blur-[60px] pointer-events-none" />

      <p className="relative font-serif italic text-text-secondary text-sm mb-1">
        Get the full map.
      </p>
      <p className="relative text-[10px] text-text-dim uppercase tracking-wider mb-4">
        DM '{countrySlug?.toUpperCase()}' on Instagram or drop your email
      </p>

      {status === 'success' ? (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-gold text-xs"
        >
          You're in. Check your DMs soon.
        </motion.p>
      ) : (
        <form onSubmit={handleSubmit} className="relative flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            aria-label="Email address"
            name="email"
            autoComplete="email"
            className="flex-1 bg-bg border border-border rounded-sm px-3 py-2 text-xs text-white placeholder:text-text-dim focus:border-gold/30 focus:shadow-[0_0_12px_rgba(200,155,60,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors font-body"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="bg-gold text-bg text-[10px] uppercase tracking-wider font-bold px-4 py-2 rounded-sm hover:bg-gold/90 hover:shadow-[0_0_16px_rgba(200,155,60,0.2)] transition-colors cursor-pointer font-heading focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Subscribe
          </motion.button>
        </form>
      )}
      {status === 'already' && <p className="text-text-dim text-xs mt-2">You're already subscribed.</p>}
      {status === 'error' && <p className="text-red-400 text-xs mt-2">Something went wrong. Try again.</p>}
    </motion.div>
  )
}
