#!/usr/bin/env node
// Enrich newly-inserted businesses (created since SINCE timestamp).
// Skips anything already enriched (existing email/IG/WhatsApp).
//
// Usage:
//   SERVICE_KEY=... ANON_KEY=... node scripts/enrich-new.mjs --since=2026-04-29T13:30:00 [--cap=15]

const SUPABASE_URL = 'https://qbzmsvfphpfgnlztskma.supabase.co'
const SERVICE_KEY = process.env.SERVICE_KEY
const ANON_KEY = process.env.ANON_KEY
if (!SERVICE_KEY || !ANON_KEY) { console.error('SERVICE_KEY and ANON_KEY required'); process.exit(1) }

const args = process.argv.slice(2)
const since = (args.find(a=>a.startsWith('--since='))||'').replace('--since=','')
const cap = parseFloat((args.find(a=>a.startsWith('--cap='))||'--cap=15').replace('--cap=','')) // estimated $ cost soft cap
if (!since) { console.error('--since=ISO required'); process.exit(1) }

const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

let all = []; let off = 0
while (true) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/businesses?select=id,name,email,instagram_handle,whatsapp,google_maps_url,country_id,created_at&created_at=gte.${since}&limit=1000&offset=${off}`,
    { headers: dbHeaders }
  )
  const b = await r.json()
  all = all.concat(b)
  if (b.length<1000) break
  off += 1000
}

const targets = all.filter(b =>
  b.google_maps_url && b.google_maps_url.trim() !== '' &&
  !b.email && !b.instagram_handle && !b.whatsapp
)

console.log(`Total since ${since}: ${all.length}`)
console.log(`Already enriched (skipped): ${all.length - targets.length}`)
console.log(`To enrich: ${targets.length}`)
console.log(`Estimated cost @ $0.01/place: $${(targets.length * 0.01).toFixed(2)}`)
console.log(`Cap: $${cap.toFixed(2)} → max ${Math.floor(cap/0.01)} places`)
if (targets.length === 0) process.exit(0)
if (targets.length * 0.01 > cap) {
  console.error(`Estimated cost $${(targets.length*0.01).toFixed(2)} exceeds cap $${cap}. Aborting. Use --cap=N to override.`)
  process.exit(2)
}

const ids = targets.map(b=>b.id)
const BATCH = 5
let done = 0
let found = { email: 0, whatsapp: 0, instagram: 0, website: 0 }
let timeouts = 0

for (let i=0; i<ids.length; i+=BATCH) {
  const batch = ids.slice(i, i+BATCH)
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/scrape-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ business_ids: batch }),
    })
    const json = await r.json()
    if (json.results) {
      for (const x of json.results) {
        done++
        if (x.email) found.email++
        if (x.whatsapp) found.whatsapp++
        if (x.instagram) found.instagram++
        if (x.website) found.website++
      }
    } else {
      done += batch.length
      if (json.code === 'IDLE_TIMEOUT') timeouts++
    }
  } catch (e) {
    console.error(`Batch ${i/BATCH}: ${e.message}`)
    done += batch.length
  }
  process.stdout.write(`  ${done}/${ids.length} | email:${found.email} ig:${found.instagram} wa:${found.whatsapp} site:${found.website} | timeouts:${timeouts}\r`)
}
console.log(`\nDone. ${done} processed. ${found.email} emails, ${found.instagram} IG, ${found.whatsapp} WA, ${found.website} sites. ${timeouts} timeouts.`)

// Trigger CRM routing for the rows we just enriched (event-driven, not cron).
// Fire-and-forget — failure here doesn't break enrichment.
if (found.email + found.instagram + found.whatsapp + found.website > 0) {
  console.log(`Triggering CRM routing for newly-enriched rows...`)
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/route-businesses-to-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({}),
    })
    const res = await r.json()
    console.log(`  routed: imported=${res.imported||0} dup=${res.duplicates||0} enrolled=${res.enrolled||0} errors=${res.errors||0}`)
  } catch (e) {
    console.warn(`  routing call failed (non-fatal): ${e.message}`)
  }
}
