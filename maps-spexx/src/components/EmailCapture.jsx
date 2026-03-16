import { useState } from 'react'
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
    <div className="border border-border rounded-sm p-6 bg-bg-card">
      <p className="font-serif italic text-text-secondary text-sm mb-1">
        Get the full map.
      </p>
      <p className="text-[10px] text-text-dim uppercase tracking-wider mb-4">
        DM '{countrySlug?.toUpperCase()}' on Instagram or drop your email
      </p>

      {status === 'success' ? (
        <p className="text-gold text-xs">You're in. Check your DMs soon.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 bg-bg border border-border rounded-sm px-3 py-2 text-xs text-white placeholder:text-text-dim focus:border-gold/30 focus:outline-none font-body"
          />
          <button
            type="submit"
            className="bg-gold text-bg text-[10px] uppercase tracking-wider font-bold px-4 py-2 rounded-sm hover:bg-gold/90 transition-colors cursor-pointer font-heading"
          >
            Subscribe
          </button>
        </form>
      )}
      {status === 'already' && <p className="text-text-dim text-xs mt-2">You're already subscribed.</p>}
      {status === 'error' && <p className="text-red-400 text-xs mt-2">Something went wrong. Try again.</p>}
    </div>
  )
}
