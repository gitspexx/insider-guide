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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-bg-card border border-border rounded-sm max-w-md w-full p-8 overflow-hidden overscroll-contain"
        >
          {/* Ambient glow */}
          <div className="absolute -top-16 -left-16 w-[200px] h-[200px] bg-gold/8 rounded-full blur-[80px] pointer-events-none" />

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-text-dim hover:text-white text-lg cursor-pointer transition-colors z-10 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            ×
          </button>

          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="text-4xl block mb-4 relative"
          >
            {country?.flag_emoji}
          </motion.span>
          <h2 className="font-heading text-3xl tracking-wide text-white mb-2 relative">
            {country?.name}
          </h2>
          <p className="font-serif italic text-text-secondary text-sm mb-6 relative">
            This guide is coming soon.
          </p>

          <div className="relative border border-gold/20 rounded-sm p-4 bg-gold-faint mb-4">
            <p className="text-xs text-gold uppercase tracking-wider mb-2 font-bold">
              Get early access
            </p>
            <p className="text-xs text-text-secondary leading-relaxed">
              DM <a href="https://www.instagram.com/alexspexx" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">@alexspexx</a> on Instagram with the country name to unlock this guide when it drops.
            </p>
          </div>

          <p className="relative text-[10px] text-text-dim uppercase tracking-wider text-center">
            Limited spots · Honest placement
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
