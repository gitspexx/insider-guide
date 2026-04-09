import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const TIERS = [
  {
    name: 'Listed',
    price: '$50',
    period: 'one-time',
    description: 'Get on the map. Literally.',
    highlight: false,
    features: [
      'Business name + Google Maps link in directory',
      'Visible to travelers browsing your city',
      'Basic category listing (eat, stay, explore, etc.)',
      'Shared with our traveler community',
    ],
    cta: 'Get Listed — $50',
    ctaColor: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  {
    name: 'Featured',
    price: '$200',
    period: 'per guide',
    description: 'Stand out in Alex\'s curated picks.',
    highlight: true,
    badge: 'Recommended',
    features: [
      'Everything in Listed',
      'Pinned to top of your category',
      'Written profile in Alex\'s voice',
      '"Recommended by Alex" badge',
      'Mention in our traveler newsletter',
      'Priority placement in city guide',
    ],
    cta: 'Get Featured — $200',
    ctaColor: 'bg-amber-500 hover:bg-amber-400 text-black',
  },
  {
    name: 'Partner',
    price: '$500',
    period: 'guide + content',
    description: 'The full partnership experience.',
    highlight: false,
    badge: 'Best Value',
    features: [
      'Everything in Featured',
      'Dedicated callout card in the guide',
      'Instagram story feature by Alex',
      'Logo in newsletter header',
      'Content collaboration opportunity',
      'Renewal option for next guide edition',
    ],
    cta: 'Become a Partner',
    ctaColor: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
]

const STATS = [
  { number: '90+', label: 'Countries explored' },
  { number: '50K+', label: 'Monthly travelers' },
  { number: '2,500+', label: 'Businesses listed' },
  { number: '15+', label: 'City guides live' },
]

const FAQS = [
  { q: 'What is Insider Guide?', a: 'A curated travel directory by Alex Spexx — real recommendations from a content creator who has visited 90+ countries. Not a review site. Places Alex actually knows and trusts.' },
  { q: 'Who sees my listing?', a: 'Travelers planning trips to your city. Our guides are shared through our newsletter, social channels, and appear in Google search results.' },
  { q: 'What makes "Featured" worth it?', a: 'Featured businesses get a written recommendation in Alex\'s voice, a badge, and top placement. Instead of being one of 200 listings, you\'re one of 10 picks.' },
  { q: 'What does the Partner content collaboration include?', a: 'Alex or a creator from our network creates content about your business — Instagram stories, reels, or a dedicated feature. This is real content, not an ad.' },
  { q: 'Can I upgrade from Listed to Featured?', a: 'Yes. Upgrade anytime and we\'ll credit what you already paid toward the new tier.' },
]

export default function Partner() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#FAFAF9]/80 backdrop-blur-lg border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Insider Guide
          </Link>
          <a href="#pricing" className="px-4 py-2 bg-stone-900 text-white text-sm font-semibold rounded-lg hover:bg-stone-800 transition-colors cursor-pointer">
            Get Listed
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-stone-900 via-stone-800 to-[#FAFAF9]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4"
          >
            For Businesses
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl lg:text-6xl font-bold text-white mb-6"
            style={{ fontFamily: "'Playfair Display', serif", lineHeight: 1.05 }}
          >
            Join the world's most<br />
            <span className="text-amber-400">curated travel directory.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/50 max-w-2xl mx-auto mb-8"
          >
            Insider Guide is not a review site. It is a personal recommendation from Alex Spexx — a content creator who has visited 90+ countries. When a traveler sees your name here, they trust it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <a href="#pricing" className="px-8 py-4 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-105 cursor-pointer">
              See Plans
            </a>
            <a href="https://wa.me/message" target="_blank" rel="noopener" className="px-8 py-4 bg-white/10 text-white font-semibold rounded-lg border border-white/20 hover:bg-white/20 transition-all cursor-pointer">
              Ask a Question
            </a>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl lg:text-3xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', serif" }}>{stat.number}</p>
                <p className="text-sm text-stone-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">How It Works</p>
            <h2 className="text-3xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', serif" }}>
              From listing to loyal customers
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Choose your tier', desc: 'Pick Listed, Featured, or Partner based on how much visibility you want.' },
              { step: '02', title: 'We build your profile', desc: 'Our team creates your listing with photos, descriptions, and all the details travelers need.' },
              { step: '03', title: 'Travelers discover you', desc: 'When people plan trips to your city, they find you in our curated guide — trusted and recommended.' },
            ].map((s) => (
              <div key={s.step} className="p-8 rounded-2xl border border-stone-200 hover:border-amber-400/30 hover:shadow-lg transition-all">
                <span className="text-xs font-mono text-stone-400">{s.step}</span>
                <h3 className="text-xl font-semibold text-stone-900 mt-2 mb-3">{s.title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-stone-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">Business Tiers</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-stone-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Your spot in the guide
            </h2>
            <p className="text-stone-500 max-w-lg mx-auto">
              One-time payment. No subscriptions. Real exposure to real travelers.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative p-8 rounded-2xl transition-all hover:-translate-y-1 hover:shadow-lg ${
                  tier.highlight
                    ? 'border-2 border-amber-500 bg-white shadow-lg shadow-amber-500/10'
                    : 'border border-stone-200 bg-white'
                }`}
              >
                {tier.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                    tier.badge === 'Recommended' ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-white'
                  }`}>
                    {tier.badge}
                  </div>
                )}

                <h3 className="text-lg font-semibold text-stone-900 mb-1">{tier.name}</h3>
                <div className="mb-2">
                  <span className="text-3xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', serif" }}>{tier.price}</span>
                  <span className="text-sm text-stone-500 ml-1">{tier.period}</span>
                </div>
                <p className="text-sm text-stone-500 mb-6">{tier.description}</p>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-stone-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5 text-emerald-500">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <button className={`w-full py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${tier.ctaColor}`}>
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">FAQ</p>
            <h2 className="text-3xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', serif" }}>Questions answered</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group p-5 rounded-xl border border-stone-200 hover:border-amber-400/30 transition-all cursor-pointer">
                <summary className="flex items-center justify-between font-semibold text-stone-900 cursor-pointer list-none text-sm">
                  {faq.q}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-4 text-stone-400 group-open:rotate-180 transition-transform">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm text-stone-500 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-stone-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            Your business. Alex's recommendation.<br />
            <span className="text-amber-400">Thousands of travelers.</span>
          </h2>
          <p className="text-white/50 mb-8 max-w-lg mx-auto">
            Get listed in the guide that travelers trust. One-time payment, lasting visibility.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#pricing" className="px-8 py-4 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-105 cursor-pointer">
              Choose Your Plan
            </a>
            <a href="https://wa.me/message" target="_blank" rel="noopener" className="px-8 py-4 bg-white/10 text-white font-semibold rounded-lg border border-white/20 hover:bg-white/20 transition-all cursor-pointer">
              Message Alex
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-stone-200 bg-[#FAFAF9]">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-stone-500">
          <p>&copy; {new Date().getFullYear()} Insider Guide. All rights reserved.</p>
          <Link to="/" className="hover:text-stone-900 transition-colors">Browse Guides</Link>
        </div>
      </footer>
    </div>
  )
}
