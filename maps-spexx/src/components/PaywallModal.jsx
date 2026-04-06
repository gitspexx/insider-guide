import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function PaywallModal({ country, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(11, 10, 8, 0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-bg-card border border-border rounded-2xl max-w-md w-full overflow-hidden"
        >
          {/* Ambient glow */}
          <div className="absolute -top-20 -left-20 w-[250px] h-[250px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative p-8">
            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center text-text-dim hover:text-text rounded-full hover:bg-bg-hover transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Flag */}
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="text-5xl block mb-5"
            >
              {country?.flag_emoji}
            </motion.span>

            {/* Title */}
            <h2 className="font-display text-3xl text-text mb-2 leading-tight">
              {country?.name}
            </h2>
            <p className="font-editorial italic text-text-secondary text-[15px] mb-8">
              This guide is coming soon.
            </p>

            {/* Info Card */}
            <div className="border border-accent/15 rounded-xl p-5 bg-accent/[0.03] mb-5">
              <p className="text-[11px] text-accent tracking-[0.12em] uppercase font-medium mb-3">
                Coming Soon
              </p>
              <p className="text-[13px] text-text-secondary leading-relaxed font-light">
                We're curating the best places in {country?.name}. Follow{' '}
                <a
                  href="https://www.instagram.com/alexspexx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent/80 transition-colors underline underline-offset-2 decoration-accent/30"
                >
                  @alexspexx
                </a>{' '}
                on Instagram to get notified when it drops.
              </p>
            </div>

            <p className="text-[11px] text-text-dim tracking-[0.1em] uppercase text-center font-light">
              Curated &middot; Honest placement &middot; Free
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
