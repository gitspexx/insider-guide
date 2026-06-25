// Seo — per-route document metadata + JSON-LD, using React 19's native
// hoisting of <title>/<meta>/<link> into <head> (no react-helmet needed).
//
// IMPORTANT: this only helps crawlers that execute JS (Googlebot does). Social
// card scrapers (Facebook/WhatsApp/LinkedIn/X) do NOT run JS — they read the
// static index.html only. Per-page social cards require prerender/SSR.
//
// JSON-LD is emitted as an inline <script type="application/ld+json"> in the
// page body (React doesn't hoist arbitrary scripts) — valid: Google reads
// ld+json from anywhere in the document.

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://insiderguide.co').replace(/\/$/, '')
export const SITE_NAME = 'Insider Guide'
const DEFAULT_OG_IMAGE = `${SITE_URL}/hero-reel.jpg`
const DEFAULT_TITLE = "Insider Guide — Curated travel guides by creators who've been there"

function absUrl(v, fallback) {
  if (!v) return fallback
  return v.startsWith('http') ? v : `${SITE_URL}${v.startsWith('/') ? '' : '/'}${v}`
}

export default function Seo({
  title,             // page-specific title; brand suffix appended automatically
  description,
  path = '',         // route path for canonical/og:url, e.g. '/japan'
  image,             // absolute URL or site-relative path
  type = 'website',
  noindex = false,
  jsonLd,            // object or array of schema.org objects
}) {
  const url = `${SITE_URL}${path}`
  const fullTitle = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE
  const ogImage = absUrl(image, DEFAULT_OG_IMAGE)
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />

      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Escape `<` so a stray "</script>" in data can't break out.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  )
}
