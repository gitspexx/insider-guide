import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

const TIER_LABELS = {
  featured: 'Featured',
  partner: 'Partner',
}

export default function CheckoutSuccess() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const status = params.get('redirect_status') ?? ''
  const tier = params.get('tier') ?? ''
  const tierLabel = TIER_LABELS[tier] ?? tier

  const succeeded = status === 'succeeded'
  const processing = status === 'processing'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="border border-border rounded-xl bg-bg-card max-w-md w-full p-8 text-center"
      >
        <div className="flex justify-center mb-5">
          {succeeded || processing ? (
            <div className="h-14 w-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : (
            <div className="h-14 w-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
          )}
        </div>

        {succeeded && (
          <>
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-3">
              Payment received
            </span>
            <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.05] text-text mb-3">
              Welcome to InsiderGuide{tierLabel ? ` ${tierLabel}` : ''}
            </h1>
            <p className="text-text-secondary text-[14px] leading-[1.65] mb-6">
              We{'’'}ll review your application within 48 hours. The creator covering your country reads every submission personally — expect a reply with next steps and what to send (photos, copy, IG handle) at the email on your receipt.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Back to guides
            </button>
          </>
        )}

        {processing && (
          <>
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-3">
              Payment processing
            </span>
            <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.05] text-text mb-3">
              Almost there
            </h1>
            <p className="text-text-secondary text-[14px] leading-[1.65] mb-6">
              Your bank is finalizing the charge. We{'’'}ll email you when it clears, and your application enters the creator review queue automatically.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Back to guides
            </button>
          </>
        )}

        {!succeeded && !processing && (
          <>
            <span className="text-[11px] tracking-[0.18em] uppercase text-amber-400/80 font-light block mb-3">
              Payment didn{'’'}t complete
            </span>
            <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.05] text-text mb-3">
              Let{'’'}s try that again
            </h1>
            <p className="text-text-secondary text-[14px] leading-[1.65] mb-6">
              {status
                ? `Status: ${status}. No charge was made — try again or use a different payment method.`
                : 'No payment status was returned. Try again or contact us if you were charged.'}
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => navigate(tier ? `/checkout?tier=${tier}` : '/partner')}
                className="w-full bg-accent text-bg text-[12px] tracking-[0.1em] uppercase font-medium px-6 py-3 rounded-xl hover:bg-accent/85 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Try again
              </button>
              <Link
                to="/partner"
                className="block text-[12px] tracking-[0.05em] text-text-secondary hover:text-text transition-colors no-underline pt-1"
              >
                Back to tiers
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
