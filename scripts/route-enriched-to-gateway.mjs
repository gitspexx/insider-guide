#!/usr/bin/env node
// Push enriched businesses through the SpexxIngest gateway so they go through
// score → classify → CRM contact creation → auto-campaign enrollment.
//
// Idempotency: appends [gw:1] to businesses.notes after a successful gateway
// call so the next run skips them. Switch to a dedicated `gateway_routed_at`
// column once that migration lands.
//
// Usage:
//   SERVICE_KEY=... node scripts/route-enriched-to-gateway.mjs --dry-run
//   SERVICE_KEY=... node scripts/route-enriched-to-gateway.mjs --apply [--limit=500]

const SUPABASE_URL = 'https://qbzmsvfphpfgnlztskma.supabase.co'
const GATEWAY_URL = 'https://scraper.spexx.cloud/api/gateway/ingest'
const GATEWAY_KEY = 'spexx-scraper-2026'

const SERVICE_KEY = process.env.SERVICE_KEY
if (!SERVICE_KEY) { console.error('SERVICE_KEY env required'); process.exit(1) }

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = parseInt((args.find(a=>a.startsWith('--limit='))||'--limit=500').replace('--limit=',''), 10)
const BATCH_SIZE = 50

const dbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const ROUTED_TAG = '[gw:1]'

function buildLead(b) {
  // Map businesses row → gateway lead schema.
  // Gateway normalizer fields: name, email, phone, whatsapp, website, instagram,
  // facebook, twitter, address, city, country, category, rating, reviews, pricing,
  // google_maps_url, place_id, description, services, located_in, gbp_status, source_id
  return {
    name: b.name || '',
    email: b.email || '',
    phone: '',
    whatsapp: b.whatsapp || '',
    website: b.website || '',
    instagram: b.instagram_handle || '',
    address: b.location || '',
    city: b.city || '',
    country: b.countries?.name || '',
    category: b.category || '',
    google_maps_url: b.google_maps_url || '',
    description: b.description || '',
    gbp_status: b.gbp_status || 'unknown',
    source_id: b.id,  // canonical id so the gateway can dedup back to this row
  }
}

async function fetchPage(offset) {
  // Pull businesses that have any contact info AND haven't been routed yet.
  const select = 'id,name,email,instagram_handle,whatsapp,website,category,location,city,description,google_maps_url,gbp_status,notes,countries(name)'
  // (email IS NOT NULL AND email != '') OR (ig same) OR (wa same)
  const filter = '(and(email.not.is.null,email.neq.),and(instagram_handle.not.is.null,instagram_handle.neq.),and(whatsapp.not.is.null,whatsapp.neq.))'
  const tagPattern = '*' + encodeURIComponent(ROUTED_TAG).replace(/'/g,"%27") + '*'
  const url = `${SUPABASE_URL}/rest/v1/businesses?select=${select}&or=${filter}&notes=not.ilike.${tagPattern}&limit=1000&offset=${offset}&order=created_at.desc`
  const r = await fetch(url, { headers: dbHeaders })
  if (!r.ok) throw new Error(`fetch businesses: ${r.status} ${await r.text()}`)
  return r.json()
}

async function pushBatch(leads) {
  const r = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': GATEWAY_KEY },
    body: JSON.stringify({ source: 'insider_guide_enrichment', source_batch_id: `ig-${Date.now()}`, leads }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`gateway: ${r.status} ${text.slice(0,300)}`)
  return JSON.parse(text)
}

async function markRouted(rows) {
  // Append [gw:1] to existing notes for each row, individually so we don't
  // clobber other notes that might differ per-row.
  const results = await Promise.all(rows.map(async (b) => {
    const newNotes = `${b.notes || ''} ${ROUTED_TAG}`.trim()
    const r = await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${b.id}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ notes: newNotes }),
    })
    return r.ok
  }))
  return results.filter(Boolean).length
}

// Main loop
let totalSeen = 0
let totalSent = 0
let totalMarked = 0
let totalErrors = 0

while (totalSent < LIMIT) {
  const page = await fetchPage(0)  // always offset 0 since we mark rows so they drop out next pull
  if (page.length === 0) break
  totalSeen += page.length
  console.log(`Fetched ${page.length} unrouted enriched businesses (total seen: ${totalSeen})`)

  for (let i = 0; i < page.length; i += BATCH_SIZE) {
    if (totalSent >= LIMIT) break
    const slice = page.slice(i, i + BATCH_SIZE)
    const remaining = LIMIT - totalSent
    const batch = slice.slice(0, remaining)
    const leads = batch.map(buildLead)

    if (!APPLY) {
      console.log(`[dry-run] Would push ${batch.length} leads to gateway. Sample:`)
      console.log(`  ${batch[0].name} | ${batch[0].email || '-'} | ${batch[0].instagram_handle || '-'}`)
      totalSent += batch.length
      continue
    }

    try {
      const res = await pushBatch(leads)
      const marked = await markRouted(batch)
      totalSent += batch.length
      totalMarked += marked
      const stats = res.stats || res
      process.stdout.write(`  pushed ${totalSent}/${Math.min(LIMIT, totalSeen)} | marked ${totalMarked} | gw: ${JSON.stringify(stats).slice(0,120)}\r`)
    } catch (e) {
      totalErrors += batch.length
      console.error(`\nbatch error: ${e.message}`)
      // Don't mark as routed so we retry next run
    }
  }
  console.log()

  // If page was less than 1000 and APPLY, the rest are now marked → next fetch returns the next slice
  if (!APPLY) break  // dry-run: only sample one page
}

console.log(`\nDone. seen=${totalSeen} sent=${totalSent} marked_routed=${totalMarked} errors=${totalErrors}`)
console.log(APPLY ? '(applied)' : '(dry-run — pass --apply to push for real)')
