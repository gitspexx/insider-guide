export default function PaywallModal({ country, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-bg-card border border-border rounded-sm max-w-md w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-dim hover:text-white text-lg cursor-pointer"
        >
          ×
        </button>

        <span className="text-4xl block mb-4">{country?.flag_emoji}</span>
        <h2 className="font-heading text-3xl tracking-wide text-white mb-2">
          {country?.name}
        </h2>
        <p className="font-serif italic text-text-secondary text-sm mb-6">
          This guide is coming soon.
        </p>

        <div className="border border-gold/20 rounded-sm p-4 bg-gold-faint mb-4">
          <p className="text-xs text-gold uppercase tracking-wider mb-2 font-bold">
            Get early access
          </p>
          <p className="text-xs text-text-secondary leading-relaxed">
            DM <span className="text-gold">@alexspexx</span> on Instagram with the country name to unlock this guide when it drops.
          </p>
        </div>

        <p className="text-[10px] text-text-dim uppercase tracking-wider text-center">
          Limited spots · Honest placement
        </p>
      </div>
    </div>
  )
}
