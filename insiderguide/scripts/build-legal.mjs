#!/usr/bin/env node
// build-legal.mjs — Pattern B legal-pages builder for Kollably (Vite SPA).
//
// Reads markdown from `~/obsidian/the vault/koding/.legal/kollably/` and
// the shared blocks, expands {{TOKENS}} and {{INCLUDE:...}}, renders to
// styled standalone HTML, writes to public/legal/<page>.html.
//
// React Router will not see public/legal/ — files are served directly by
// Vite (dev) and nginx (prod) as static assets. Existing /privacy and /terms
// React routes redirect to these.
//
// Usage:
//   npm run build:legal
//   (auto-runs as `prebuild` before `npm run build`)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BRAND = 'insiderguide'
const VAULT_LEGAL = process.env.LEGAL_VAULT_PATH ||
  resolve(process.env.HOME, 'obsidian/the vault/koding/.legal')

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(REPO_ROOT, 'public/legal')

const metaPath = join(VAULT_LEGAL, BRAND, 'meta.json')
if (!existsSync(metaPath)) {
  console.warn(`⚠ Skipping legal-pages regeneration: vault not found at ${metaPath}`)
  console.warn(`  Existing public/legal/*.html (committed) will be used.`)
  process.exit(0)
}
const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))

const tokens = {
  BRAND_NAME:           meta.brand_name,
  BRAND_SHORT:          meta.brand_short,
  DOMAIN:               meta.domain,
  LEGAL_EMAIL:          meta.legal_email,
  SUPPORT_EMAIL:        meta.support_email,
  VERSION:              meta.version,
  LAST_UPDATED:         meta.last_updated,
  SERVICE_DESCRIPTION:  meta.service_description,
}

function substituteTokens(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (tokens[k] !== undefined ? tokens[k] : m))
}

function resolveIncludes(text, depth = 0) {
  if (depth > 5) throw new Error('Include depth exceeded')
  return text.replace(/\{\{INCLUDE:([^\}]+)\}\}/g, (_, path) => {
    const includePath = join(VAULT_LEGAL, path.trim())
    if (!existsSync(includePath)) {
      console.warn(`⚠ Include not found: ${path}`)
      return `<!-- include not found: ${path} -->`
    }
    return resolveIncludes(readFileSync(includePath, 'utf-8'), depth + 1)
  })
}

function expand(md) {
  return substituteTokens(resolveIncludes(md)).replace(/<!--[\s\S]*?-->/g, '').trim()
}

// ── Tiny markdown → HTML converter ───────────────────────────────────────────
function markdownToHtml(md) {
  const lines = md.split('\n')
  const out = []
  let inList = false
  let inTable = false
  let tableHeaderRow = false
  let inBlockquote = false
  let inParagraph = false
  let inTbody = false

  const closeP = () => { if (inParagraph) { out.push('</p>'); inParagraph = false } }
  const closeUl = () => { if (inList) { out.push('</ul>'); inList = false } }
  const closeTable = () => {
    if (inTable) {
      if (inTbody) { out.push('</tbody>'); inTbody = false }
      out.push('</table>'); inTable = false; tableHeaderRow = false
    }
  }
  const closeBq = () => { if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false } }
  const closeAll = () => { closeP(); closeUl(); closeTable(); closeBq() }

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      closeAll()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      continue
    }

    if (line.startsWith('> ')) {
      closeP(); closeUl(); closeTable()
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true }
      out.push(`<p>${inline(line.slice(2))}</p>`)
      continue
    }

    if (/^\|.*\|$/.test(line)) {
      closeP(); closeUl(); closeBq()
      if (/^[\s\-:|]+$/.test(line)) { tableHeaderRow = true; continue }
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (!inTable) { out.push('<table>'); inTable = true }
      if (tableHeaderRow) {
        out.push('<thead><tr>' + cells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>')
        tableHeaderRow = false
      } else {
        if (!inTbody) { out.push('<tbody>'); inTbody = true }
        out.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>')
      }
      continue
    }
    if (inTable) closeTable()

    if (/^\s*[-*]\s+/.test(line)) {
      closeP(); closeBq()
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }

    if (line.trim() === '') { closeAll(); continue }

    closeUl(); closeTable(); closeBq()
    if (!inParagraph) { out.push('<p>'); inParagraph = true }
    else out.push('<br/>')
    out.push(inline(line))
  }
  closeAll()
  return out.join('\n')
}

function inline(s) {
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return s
}

// ── HTML wrapper (Kollably brand) ────────────────────────────────────────────
function html(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${tokens.BRAND_NAME}</title>
<meta name="description" content="${title} for ${tokens.BRAND_NAME}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://${tokens.DOMAIN}/legal/${title.toLowerCase().replace(/\s+/g,'-')}.html">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  :root { --fg:#0f172a; --bg:#fff; --muted:#475569; --accent:#7c3aed; --border:#e2e8f0; --hero:#0f172a; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:var(--fg); background:var(--bg); margin:0; line-height: 1.6; }
  .nav { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); background:#fff; }
  .nav a { color: var(--accent); text-decoration: none; font-weight: 600; }
  .hero { background: linear-gradient(135deg, #0f172a 0%, #312e81 100%); color: #fff; padding: 4rem 1.5rem 3rem; }
  .hero-inner { max-width: 760px; margin: 0 auto; }
  .hero h1 { font-size: 2.25rem; margin: 0 0 0.5rem; line-height: 1.15; }
  .hero p { color: rgba(255,255,255,0.7); margin: 0; font-size: 0.95rem; }
  main { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
  h2 { font-size: 1.4rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
  h3 { font-size: 1.1rem; margin-top: 1.5rem; }
  a { color: var(--accent); }
  blockquote { border-left: 3px solid var(--accent); padding: 0.6rem 1rem; background: #f5f3ff; margin: 1.2rem 0; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
  th { background: #f8fafc; }
  code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.9em; }
  ul { padding-left: 1.4rem; }
  .legal-footer { background: #0f172a; color: rgba(255,255,255,0.7); padding: 1.5rem; font-size: 0.85rem; }
  .legal-footer-inner { max-width: 760px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
  .legal-footer a { color: rgba(255,255,255,0.8); text-decoration: none; }
  .legal-footer a:hover { color: #fff; }
</style>
</head>
<body>
<nav class="nav"><a href="https://${tokens.DOMAIN}/">← ${tokens.BRAND_NAME}</a></nav>
<div class="hero"><div class="hero-inner">
  <h1>${title}</h1>
  <p>Last updated: ${tokens.LAST_UPDATED} · Version: ${tokens.VERSION}</p>
</div></div>
<main>${body}</main>
<footer class="legal-footer"><div class="legal-footer-inner">
  <span>© ${new Date().getFullYear()} BCAX Group LLC. All rights reserved.</span>
  <a href="/legal/privacy.html">Privacy</a>
  <a href="/legal/terms.html">Terms</a>
  <a href="/legal/cookies.html">Cookies</a>
  <a href="/legal/data-retention.html">Data Retention</a>
  <a href="/legal/acceptable-use.html">Acceptable Use</a>
  <a href="/legal/refund-policy.html">Refund</a>
  <a href="/legal/creator-agreement.html">Creator Agreement</a>
  <a href="/legal/brand-partner-terms.html">Brand Partners</a>
  <a href="/legal/listing-removal-policy.html">Listing Removal</a>
  <a href="/legal/dmca.html">DMCA</a>
</div></footer>
</body>
</html>`
}

mkdirSync(OUT_DIR, { recursive: true })
const brandDir = join(VAULT_LEGAL, BRAND)
const files = readdirSync(brandDir).filter(f => f.endsWith('.md'))

for (const file of files) {
  const md = readFileSync(join(brandDir, file), 'utf-8')
  const expanded = expand(md)
  const titleMatch = /^#\s+(.+)$/m.exec(expanded)
  const title = titleMatch ? titleMatch[1].split(' — ')[0].trim() : file.replace('.md', '')
  const body = markdownToHtml(expanded.replace(/^#\s+.+$/m, '').trim())
  const outName = file.replace('.md', '.html')
  writeFileSync(join(OUT_DIR, outName), html(title, body))
  console.log(`✓ ${outName}`)
}

console.log(`\nWrote ${files.length} legal pages for ${tokens.BRAND_NAME} → ${OUT_DIR}`)
