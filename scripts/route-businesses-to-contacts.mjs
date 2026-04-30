#!/usr/bin/env node
// Promote enriched businesses into CRM contacts so the auto-campaign engine
// can enroll them. Calls the existing `ingest-leads` edge function (which
// upserts into contacts, tags by category/source, and triggers auto-enroll).
//
// Idempotency: appends [crm:1] to businesses.notes after a successful
// ingest-leads call so the next run skips them.
//
// Usage:
//   SERVICE_KEY=... node scripts/route-businesses-to-contacts.mjs --dry-run
//   SERVICE_KEY=... node scripts/route-businesses-to-contacts.mjs --apply [--limit=500]

const SUPABASE_URL = 'https://qbzmsvfphpfgnlztskma.supabase.co'
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-leads`

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

const ROUTED_TAG = '[crm:1]'

function buildLead(b) {
  // Map businesses row → ingest-leads schema. Use the actual category (eat/
  // cafe/drink/stay/do/explore/wellness/essentials/misc) so segmented
  // "Insider Feature — <Category>" auto-campaigns enroll on the matching
  // category filter.
  const tags = []
  if (b.countries?.name) tags.push(`country:${b.countries.name}`)
  if (b.city) tags.push(`city:${b.city}`)
  if (b.category) tags.push(`type:${b.category}`)
  tags.push('source:csv')
  tags.push('channel:insider-guide')

  return {
    name: b.name || 'Unknown',
    email: b.email || undefined,
    whatsapp: b.whatsapp || undefined,
    instagram_handle: b.instagram_handle || undefined,
    website: b.website || undefined,
    company_name: b.name,
    category: b.category || 'misc',  // drives segmented campaign enrollment
    tags,
    notes: b.description || '',
    metadata: {
      business_id: b.id,
      google_maps_url: b.google_maps_url,
      gbp_status: b.gbp_status,
    },
  }
}

async function fetchPage(offset) {
  const select = 'id,name,email,instagram_handle,whatsapp,website,category,location,city,description,google_maps_url,gbp_status,notes,countries(name)'
  const filter = '(and(email.not.is.null,email.neq.),and(instagram_handle.not.is.null,instagram_handle.neq.),and(whatsapp.not.is.null,whatsapp.neq.))'
  const tagPattern = '*' + encodeURIComponent(ROUTED_TAG).replace(/'/g,"%27") + '*'
  const url = `${SUPABASE_URL}/rest/v1/businesses?select=${select}&or=${filter}&notes=not.ilike.${tagPattern}&limit=1000&offset=${offset}&order=created_at.desc`
  const r = await fetch(url, { headers: dbHeaders })
  if (!r.ok) throw new Error(`fetch businesses: ${r.status} ${await r.text()}`)
  return r.json()
}

async function pushBatch(leads) {
  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      source: 'insiderguide',         // matches Feature Business sources filter
      project_slug: 'insider-guide',
      leads,
      auto_enroll: true,
    }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`ingest-leads: ${r.status} ${text.slice(0,300)}`)
  return JSON.parse(text)
}

async function markRouted(rows) {
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

let totalSeen = 0
let totalSent = 0
let totalImported = 0
let totalDuplicates = 0
let totalEnrolled = 0
let totalMarked = 0
let totalErrors = 0

while (totalSent < LIMIT) {
  const page = await fetchPage(0)
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
      const sample = batch[0]
      console.log(`[dry-run] Would push ${batch.length} leads. Sample: ${sample.name} | ${sample.email||'-'} | ${sample.category}`)
      totalSent += batch.length
      continue
    }

    try {
      const res = await pushBatch(leads)
      const marked = await markRouted(batch)
      totalSent += batch.length
      totalImported += res.imported || 0
      totalDuplicates += res.duplicates || 0
      totalEnrolled += res.enrolled || 0
      totalMarked += marked
      process.stdout.write(`  pushed ${totalSent}/${Math.min(LIMIT, totalSeen)} | imported:${totalImported} dup:${totalDuplicates} enrolled:${totalEnrolled} marked:${totalMarked}\r`)
    } catch (e) {
      totalErrors += batch.length
      console.error(`\nbatch error: ${e.message}`)
    }
  }
  console.log()
  if (!APPLY) break
}

console.log(`\nDone. seen=${totalSeen} sent=${totalSent} imported=${totalImported} duplicates=${totalDuplicates} enrolled=${totalEnrolled} marked=${totalMarked} errors=${totalErrors}`)
console.log(APPLY ? '(applied)' : '(dry-run — pass --apply to push for real)')
