#!/usr/bin/env node
// build-seo.mjs — generate public/sitemap.xml from published countries.
//
// Runs at prebuild (after build:legal). Fetches published country slugs from
// Supabase via the REST API using the anon key (covered by the
// anon_read_published_countries RLS policy — no service role needed). On any
// failure it warns and leaves the existing sitemap untouched, so a flaky
// network never breaks the build.
//
// Canonical host: VITE_SITE_URL (default https://insiderguide.co).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT = resolve(REPO_ROOT, 'public/sitemap.xml')

// Pull env from process first, then fall back to parsing .env (the vite build
// reads .env via import.meta.env, but this plain-node prebuild step does not).
function loadEnv() {
  const env = { ...process.env }
  const envPath = resolve(REPO_ROOT, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = loadEnv()
const SITE_URL = (env.VITE_SITE_URL || 'https://insiderguide.co').replace(/\/$/, '')
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

const STATIC_ROUTES = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  { path: '/partner', priority: '0.7', changefreq: 'monthly' },
]

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

function urlEntry({ path, priority, changefreq, lastmod }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(SITE_URL + path)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n')
}

async function main() {
  let countries = []
  if (SUPABASE_URL && ANON_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/countries?select=slug,created_at&published=eq.true&order=name.asc`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
      )
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
      countries = await res.json()
    } catch (err) {
      console.warn(`⚠ build-seo: could not fetch countries (${err.message}). Leaving existing sitemap.xml.`)
      return
    }
  } else {
    console.warn('⚠ build-seo: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. Leaving existing sitemap.xml.')
    return
  }

  const entries = [
    ...STATIC_ROUTES.map(urlEntry),
    ...countries
      .filter((c) => c.slug)
      .map((c) =>
        urlEntry({
          path: `/${c.slug}`,
          priority: '0.8',
          changefreq: 'weekly',
          lastmod: c.created_at ? String(c.created_at).slice(0, 10) : null,
        }),
      ),
  ]

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    '\n</urlset>\n'

  writeFileSync(OUT, xml)
  console.log(`✓ build-seo: wrote sitemap.xml with ${entries.length} URLs (${countries.length} countries) → public/sitemap.xml`)
}

main()
