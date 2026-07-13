import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Seo from '../../components/Seo'

export default function StudioLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSend(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    // shouldCreateUser:false = invite-only. Unknown emails get a generic error.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/studio` },
    })
    if (error) setError('This email is not registered as a creator yet.')
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Seo title="Creator Studio" path="/studio/login" noindex />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-[9px] uppercase tracking-[0.3em] text-accent-dim block mb-1">Creator Studio</span>
          <h1 className="font-display text-3xl text-text">INSIDER GUIDE</h1>
        </div>
        {sent ? (
          <p className="text-center text-sm text-text-secondary">
            Check your inbox — we sent you a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-4">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your creator email"
              className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text placeholder:text-text-dim focus:border-accent/30 focus:outline-none font-body"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="bg-accent text-bg font-body text-sm uppercase tracking-wider py-3 rounded-sm hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50">
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
