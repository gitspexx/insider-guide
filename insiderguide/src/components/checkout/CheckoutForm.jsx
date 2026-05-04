import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { supabase } from '../../lib/supabase'

// Calls IG's own init-checkout edge fn (proxy fronting BCAX bcax-charge).
// init-checkout requires a valid IG Supabase user JWT — for public partner
// applicants we mint an anonymous session via supabase.auth.signInAnonymously()
// before calling. The browser never sees BCAX_CALLER_KEY (server-side only).
const INIT_CHECKOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/init-checkout`

// Cache loadStripe(publishable_key) per key so re-renders don't re-fetch Stripe.js.
const stripePromiseCache = new Map()
function getStripePromise(publishableKey) {
  let promise = stripePromiseCache.get(publishableKey)
  if (!promise) {
    promise = loadStripe(publishableKey)
    stripePromiseCache.set(publishableKey, promise)
  }
  return promise
}

/**
 * Ensure we have a Supabase session before calling init-checkout. If the user
 * is unauthenticated (the common case for public partner applicants), sign
 * them in anonymously so init-checkout's auth.getUser() returns a valid user.
 */
async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) return session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw new Error(
      `Anonymous sign-in failed: ${error.message}. ` +
      `Enable "Allow anonymous sign-ins" in Supabase Auth settings.`
    )
  }
  return data.session
}

export function CheckoutForm({
  amount_cents,
  currency = 'usd',
  customer_email,
  return_url,
  theme,
  onError,
}) {
  const [intent, setIntent] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Avoid double-creating intents under React strict mode.
  const requestedRef = useRef(false)

  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const session = await ensureSession()
        const res = await fetch(INIT_CHECKOUT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            mode: 'elements',
            amount_cents,
            currency,
            project_tag: 'insiderguide',
            customer_email,
            // customer_external_id is overridden server-side to user.id —
            // for anonymous sessions that's the synthetic anon user id.
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`init-checkout ${res.status}: ${text}`)
        }
        const data = await res.json()
        if (cancelled) return
        if (!data.client_secret || !data.publishable_key) {
          throw new Error('init-checkout response missing client_secret or publishable_key')
        }
        setIntent(data)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setLoadError(message)
        onError?.(err instanceof Error ? err : new Error(message))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [amount_cents, currency, customer_email, onError])

  const appearance = useMemo(() => ({
    theme: 'night',
    variables: {
      colorPrimary: theme?.primary_color ?? '#c8a55a',
      colorBackground: '#0b0a08',
      colorText: '#ece8df',
      colorTextSecondary: '#9b958a',
      colorTextPlaceholder: '#5a564f',
      colorDanger: '#ef4444',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      borderRadius: '12px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': { border: '1px solid #2a2722', backgroundColor: '#0b0a08' },
      '.Input:focus': { border: '1px solid #c8a55a', boxShadow: '0 0 0 1px #c8a55a' },
      '.Label': { color: '#9b958a', fontWeight: '500' },
      '.Tab': { border: '1px solid #2a2722', backgroundColor: '#0b0a08' },
      '.Tab--selected': { borderColor: '#c8a55a' },
    },
  }), [theme?.primary_color])

  if (loadError) {
    return (
      <div className="border border-red-400/30 rounded-xl p-5 bg-red-500/5">
        <div className="text-red-400 text-sm font-medium mb-1">Couldn{'’'}t start checkout</div>
        <div className="text-text-dim text-xs break-words">{loadError}</div>
      </div>
    )
  }

  if (!intent) {
    return (
      <div className="border border-border rounded-xl p-5 bg-bg-card flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        <span className="text-text-dim text-sm">Preparing secure checkout{'…'}</span>
      </div>
    )
  }

  const stripePromise = getStripePromise(intent.publishable_key)

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: intent.client_secret, appearance }}>
      <CheckoutInner return_url={return_url} theme={theme} onError={onError} />
    </Elements>
  )
}

function CheckoutInner({ return_url, theme, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setSubmitError(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url },
    })

    // If we got here, redirect failed — Stripe stays on this page on validation/network errors.
    setSubmitting(false)
    if (error) {
      const message = error.message ?? 'Payment failed. Please try again.'
      setSubmitError(message)
      onError?.(new Error(message))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {(theme?.logo_url || theme?.label) && (
        <div className="flex items-center gap-3 pb-2">
          {theme?.logo_url && <img src={theme.logo_url} alt="" className="h-8 w-8 rounded" />}
          {theme?.label && <div className="text-sm font-medium text-text">{theme.label}</div>}
        </div>
      )}

      <PaymentElement options={{ layout: 'tabs' }} />

      {submitError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Processing…' : 'Pay now'}
      </button>

      <p className="text-xs text-text-dim text-center">
        Secured by Stripe. Your payment details are never stored on our servers.
      </p>
    </form>
  )
}
