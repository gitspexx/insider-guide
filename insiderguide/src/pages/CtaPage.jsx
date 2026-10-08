import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import Seo from '../components/Seo'
import { CtaFetchError, fetchCtaPage, recordCtaHit } from '../lib/ctaPages'

/**
 * /g/<slug> — a DM-only CTA page (guide, tips or a single link).
 *
 * Reels and DMs point here instead of at a generic landing page: the visitor
 * gets the thing they were promised and one clear next step. Content comes
 * from the content library at render time as structured sections, so the page
 * renders plain elements and never injects remote HTML. These pages are
 * `noindex` (robots.txt also disallows /g/) — they exist for the person who
 * tapped the link, not for search.
 *
 * Three honest states: the page, "not available" (no published page at that
 * slug), and "couldn't load" (library unreachable) with a retry. The hit
 * counter is fire-and-forget and only runs once a real page resolved.
 */

const KIND_LABEL = { guide: 'Guide', tips: 'Quick tips', link: 'Recommended' }

export default function CtaPage() {
  const { slug } = useParams()
  const [attempt, setAttempt] = useState(0)
  // The result is tagged with the request it answers; a slug change or a
  // retry mints a new key, so "loading" is derived rather than set in the
  // effect (no synchronous setState → no cascading render).
  const key = `${slug ?? ''}#${attempt}`
  const [result, setResult] = useState(null)
  const hitFor = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchCtaPage(slug, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return
        setResult({ key, status: page ? 'ready' : 'missing', page })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (!(err instanceof CtaFetchError)) console.warn('cta page failed:', err)
        setResult({ key, status: 'error', page: null })
      })
    return () => controller.abort()
  }, [key, slug])

  const status = result?.key === key ? result.status : 'loading'

  useEffect(() => {
    if (status !== 'ready' || hitFor.current === slug) return
    hitFor.current = slug
    recordCtaHit(slug)
  }, [status, slug])

  const path = slug ? `/g/${slug}` : '/g'

  if (status === 'missing') {
    return (
      <Shell>
        <Seo title="Page not available" description="This page is not available." path={path} noindex />
        <EmptyState
          eyebrow="Not available"
          title="This page is not available."
          body="The link may have expired or been typed wrong. Our country guides are still right here."
        />
      </Shell>
    )
  }

  if (status === 'error') {
    return (
      <Shell>
        <Seo title="Page not available" description="This page could not be loaded." path={path} noindex />
        <EmptyState
          eyebrow="Connection"
          title="We couldn’t load this page."
          body="Something is slow on our side. Give it another try in a moment."
          action={
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="inline-flex items-center gap-2 bg-accent text-bg text-[12px] tracking-[0.12em] uppercase font-medium px-7 py-3.5 rounded-xl hover:bg-accent/90 transition-all"
            >
              Try again
            </button>
          }
        />
      </Shell>
    )
  }

  if (status === 'loading') {
    return (
      <Shell>
        <Seo path={path} noindex />
        <Skeleton />
      </Shell>
    )
  }

  const { page } = result
  const ctaHref = page.ctaUrl
  const ctaLabel = page.ctaLabel || 'Continue'
  const isInternal = !!ctaHref && ctaHref.startsWith('/')
  const dateLabel = page.publishedAt
    ? new Intl.DateTimeFormat(page.lang, { month: 'long', year: 'numeric' }).format(page.publishedAt)
    : null

  return (
    <Shell>
      <Seo title={page.title} description={page.hero || undefined} path={path} type="article" noindex />

      <article lang={page.lang} className="px-6 pb-24">
        {/* ─── Hero ─── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-[720px] mx-auto pt-32 pb-10"
        >
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light">{KIND_LABEL[page.kind]}</span>
            {dateLabel && (
              <>
                <span className="w-[1px] h-3 bg-border" />
                <time dateTime={page.publishedAt.toISOString()} className="text-[11px] tracking-[0.12em] uppercase text-text-dim font-light">
                  {dateLabel}
                </time>
              </>
            )}
          </div>
          <h1 className="font-display text-[clamp(2.3rem,5vw,3.6rem)] leading-[1.02] text-text text-balance mb-5">
            {page.title}
          </h1>
          {page.hero && (
            <p className="font-editorial text-[clamp(1.25rem,2.4vw,1.55rem)] leading-[1.45] text-text-secondary max-w-[65ch]">
              {page.hero}
            </p>
          )}
        </motion.header>

        {page.sections.length > 0 && (
          <>
            <div className="max-w-[720px] mx-auto gradient-divider" />
            <div className="max-w-[720px] mx-auto pt-10 space-y-12">
              {page.sections.map((section, i) => (
                <Section key={i} index={i} section={section} numbered={page.kind === 'guide' && page.sections.length > 1} />
              ))}
            </div>
          </>
        )}

        {/* ─── CTA ─── */}
        {ctaHref && (
          // `animate`, not `whileInView`: the CTA is the point of the page and
          // must never wait on an IntersectionObserver to become visible.
          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
            className="max-w-[720px] mx-auto mt-14"
          >
            <div className="relative rounded-2xl border border-border bg-bg-card overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
              <div className="p-8 md:p-10 flex flex-col items-center text-center gap-5">
                <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light">Your next step</span>
                {isInternal ? (
                  <Link to={ctaHref} className={primaryButton}>
                    {ctaLabel} <span aria-hidden="true">&rarr;</span>
                  </Link>
                ) : (
                  <a href={ctaHref} className={primaryButton}>
                    {ctaLabel} <span aria-hidden="true">&rarr;</span>
                  </a>
                )}
              </div>
            </div>
          </motion.aside>
        )}

        <p className="max-w-[720px] mx-auto text-center text-[12px] text-text-dim mt-10">
          <Link to="/" className="text-accent hover:text-accent/80 transition-colors">&larr; Explore the country guides</Link>
        </p>
      </article>
    </Shell>
  )
}

const primaryButton =
  'inline-flex shrink-0 items-center justify-center gap-2 bg-accent text-bg text-[12px] tracking-[0.12em] uppercase font-medium px-7 py-3.5 rounded-xl hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-all no-underline'

function Section({ index, section, numbered }) {
  const paragraphs = section.body ? section.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : []
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {section.heading && (
        <div className="flex items-start gap-4 mb-4">
          {numbered && (
            <span className="text-[11px] text-accent/40 font-light tabular-nums mt-2">{String(index + 1).padStart(2, '0')}</span>
          )}
          <h2 className="font-display text-2xl md:text-3xl text-text leading-tight">{section.heading}</h2>
        </div>
      )}
      <div className={numbered && section.heading ? 'md:pl-8' : ''}>
        {paragraphs.map((text, i) => (
          <p key={i} className="text-text-secondary text-[16px] md:text-[17px] leading-[1.7] max-w-[65ch] mb-4 last:mb-0">
            {text.split('\n').map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        ))}
        {section.bullets.length > 0 && (
          <ul className={`space-y-3 max-w-[65ch] ${paragraphs.length ? 'mt-5' : ''}`}>
            {section.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-3 text-text-secondary text-[16px] md:text-[17px] leading-[1.65]">
                <span aria-hidden="true" className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  )
}

function EmptyState({ eyebrow, title, body, action }) {
  return (
    <div className="px-6 pb-24">
      <div className="max-w-[640px] mx-auto pt-36 text-center">
        <span className="text-[11px] tracking-[0.18em] uppercase text-accent/70 font-light block mb-5">{eyebrow}</span>
        <h1 className="font-display text-[clamp(2.2rem,4.6vw,3.2rem)] leading-[1.02] text-text text-balance mb-5">{title}</h1>
        <p className="text-text-secondary text-[15px] leading-[1.65] max-w-[48ch] mx-auto mb-9">{body}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {action}
          <Link to="/" className="inline-flex items-center gap-2 border border-border text-text-secondary text-[12px] tracking-[0.1em] uppercase font-light px-6 py-3 rounded-xl hover:border-border-hover hover:text-text hover:bg-bg-elevated transition-all no-underline">
            &larr; Back to guides
          </Link>
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="px-6 pb-24" aria-busy="true" aria-label="Loading">
      <div className="max-w-[720px] mx-auto pt-32 animate-pulse">
        <div className="h-3 w-24 rounded bg-bg-elevated mb-6" />
        <div className="h-12 w-11/12 rounded bg-bg-elevated mb-3" />
        <div className="h-12 w-3/4 rounded bg-bg-elevated mb-7" />
        <div className="h-5 w-full rounded bg-bg-elevated mb-2.5" />
        <div className="h-5 w-10/12 rounded bg-bg-elevated mb-12" />
        <div className="gradient-divider mb-10" />
        <div className="h-7 w-1/2 rounded bg-bg-elevated mb-4" />
        <div className="h-4 w-full rounded bg-bg-elevated mb-2" />
        <div className="h-4 w-full rounded bg-bg-elevated mb-2" />
        <div className="h-4 w-9/12 rounded bg-bg-elevated" />
      </div>
    </div>
  )
}

/** Site chrome — same nav/footer as /book and /partner. */
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-40 border-b border-border"
        style={{ background: 'rgba(11, 10, 8, 0.72)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)' }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline group" aria-label="Insider Guide home">
            <img src="/favicon.png" alt="" width="22" height="22" className="rounded-md" />
            <span className="font-display text-[22px] text-text leading-none group-hover:text-accent transition-colors">Insider Guide</span>
            <span className="hidden md:inline-block w-[1px] h-4 bg-border" />
            <span className="hidden md:inline-block text-[11px] text-accent tracking-[0.15em] uppercase font-light">a network of travel creators</span>
          </Link>
          <Link to="/partner" className="text-[11px] text-accent tracking-[0.12em] uppercase font-light hover:text-accent/80 transition-colors no-underline">
            Partner program
          </Link>
        </div>
      </motion.nav>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="max-w-[1120px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display text-lg text-text/40 hover:text-text/70 transition-colors no-underline">Insider Guide</Link>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <a href="https://instagram.com/alexspexx" target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">Instagram</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/privacy.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">Privacy</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="/legal/terms.html" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light no-underline">Terms</a>
            <span className="w-[1px] h-3 bg-border" />
            <a href="mailto:lead@insiderguide.co" className="text-[11px] text-text-dim tracking-[0.1em] uppercase hover:text-accent transition-colors font-light">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
