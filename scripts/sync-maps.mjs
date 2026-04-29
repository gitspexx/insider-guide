#!/usr/bin/env node
// Sync Google Takeout CSVs from maps/ into the businesses table.
// Inserts new rows only. Optionally un-publishes DB rows not in CSV (curation invariant).
//
// Usage:
//   SERVICE_KEY=... node scripts/sync-maps.mjs --dry-run
//   SERVICE_KEY=... node scripts/sync-maps.mjs --apply
//   SERVICE_KEY=... node scripts/sync-maps.mjs --apply --cleanup    (also un-publish non-CSV)
//   SERVICE_KEY=... node scripts/sync-maps.mjs --apply --only=argentina,italy

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SUPABASE_URL = 'https://qbzmsvfphpfgnlztskma.supabase.co'
const KEY = process.env.SERVICE_KEY
if (!KEY) { console.error('SERVICE_KEY env required'); process.exit(1) }
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const CLEANUP = args.includes('--cleanup')
const ONLY = (args.find(a=>a.startsWith('--only='))||'').replace('--only=','').split(',').filter(Boolean).map(s=>s.toLowerCase())

const __filename = fileURLToPath(import.meta.url)
const MAPS_DIR = path.resolve(path.dirname(__filename), '../maps')

// Non-country lists to skip
const SKIP = new Set([
  'atlas obscura','cedula','dark tourism','default list','favorite places',
  'images','land','want to go','outreach','napoli','roma','bali','wales'
])

// Filename → country name aliases (when filename doesn't match countries.name)
const ALIAS = {
  'dr':'Dominican Republic',
  'png':'Papua New Guinea',
  'czech':'Czechia',
  'macedonia':'North Macedonia',
  'uae':'United Arab Emirates',
  'uk':'United Kingdom',
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim())
  if (lines.length<2) return []
  return lines.slice(1).map(line=>{
    const v=[]; let cur=''; let q=false
    for (const c of line) {
      if (c==='"') { q=!q; continue }
      if (c===',' && !q) { v.push(cur.trim()); cur=''; continue }
      cur+=c
    }
    v.push(cur.trim())
    return { title: v[0], url: v[2] }
  }).filter(r=>r.title && r.url)
}

const nameKey = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const urlKey  = s => (s||'').toLowerCase().trim()

async function api(method, pathOnly, body) {
  const res = await fetch(`${SUPABASE_URL}${pathOnly}`, { method, headers: h, body: body?JSON.stringify(body):undefined })
  if (!res.ok) { const t = await res.text(); throw new Error(`${method} ${pathOnly}: ${res.status} ${t.slice(0,200)}`) }
  return res.status === 204 ? null : res.json().catch(()=>null)
}

async function fetchAllBusinesses(country_id) {
  let all = []; let off = 0
  while (true) {
    const b = await api('GET', `/rest/v1/businesses?select=id,name,google_maps_url,published,email,instagram_handle,whatsapp,outreach_status&country_id=eq.${country_id}&limit=1000&offset=${off}`)
    all.push(...b)
    if (b.length<1000) break
    off += 1000
  }
  return all
}

const countries = await api('GET','/rest/v1/countries?select=id,name,slug,region&order=name')
const byName = Object.fromEntries(countries.map(c=>[c.name.toLowerCase(), c]))

const files = fs.readdirSync(MAPS_DIR).filter(f=>f.endsWith('.csv')).sort()

const summary = []
let totalInserts = 0
let totalUnpub = 0

for (const file of files) {
  const baseName = file.replace(/\s*by\s*Alexspexx.*\.csv$/i,'').replace(/\.csv$/i,'').replace(/\s*\(\d+\)/,'').trim()
  if (SKIP.has(baseName.toLowerCase())) continue
  if (ONLY.length && !ONLY.includes(baseName.toLowerCase())) continue

  const lookup = (ALIAS[baseName.toLowerCase()] || baseName).toLowerCase()
  const country = byName[lookup]
  if (!country) {
    summary.push({ file, country: '(missing)', status: 'NO COUNTRY ROW' })
    continue
  }

  const rows = parseCSV(fs.readFileSync(path.join(MAPS_DIR, file),'utf8'))
  const db = await fetchAllBusinesses(country.id)
  const dbByName = new Map(db.map(b=>[nameKey(b.name), b]))
  const dbByUrl  = new Map(db.map(b=>[urlKey(b.google_maps_url), b]))

  // Inserts: rows in CSV not in DB
  const inserts = []
  const seenInBatch = new Set()
  for (const r of rows) {
    const nk = nameKey(r.title), uk = urlKey(r.url)
    if (dbByName.has(nk) || dbByUrl.has(uk)) continue
    if (seenInBatch.has(nk) || seenInBatch.has(uk)) continue
    seenInBatch.add(nk); seenInBatch.add(uk)
    inserts.push({
      name: r.title,
      country_id: country.id,
      category: 'misc',
      google_maps_url: r.url,
      tier: 'listed',
      published: true,
    })
  }

  // Un-publish: DB rows currently published but NOT in this CSV
  // Only touches rows with outreach_status != 'new' (those are Kollably outreach leads).
  let unpub = []
  if (CLEANUP) {
    const csvNames = new Set(rows.map(r=>nameKey(r.title)))
    const csvUrls  = new Set(rows.map(r=>urlKey(r.url)))
    unpub = db.filter(b =>
      b.published &&
      b.outreach_status !== 'new' &&
      !csvNames.has(nameKey(b.name)) &&
      !csvUrls.has(urlKey(b.google_maps_url))
    )
  }

  summary.push({ file, country: country.name, csvRows: rows.length, dbTotal: db.length, inserts: inserts.length, unpub: unpub.length })
  totalInserts += inserts.length
  totalUnpub += unpub.length

  if (APPLY) {
    // Insert in batches of 100
    for (let i=0; i<inserts.length; i+=100) {
      const batch = inserts.slice(i, i+100)
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/businesses`, { method:'POST', headers:{...h, Prefer:'return=minimal'}, body: JSON.stringify(batch) }).then(r=>{
          if (!r.ok) throw new Error(`insert ${r.status}`)
        })
      } catch (e) { console.error(`  ${country.name} insert batch ${i/100}: ${e.message}`) }
    }
    if (CLEANUP && unpub.length) {
      // PATCH each id to published=false (single bulk via in.() filter)
      const ids = unpub.map(b=>b.id)
      for (let i=0; i<ids.length; i+=100) {
        const batch = ids.slice(i, i+100)
        const filter = `id=in.(${batch.join(',')})`
        await fetch(`${SUPABASE_URL}/rest/v1/businesses?${filter}`, { method:'PATCH', headers:h, body: JSON.stringify({ published: false }) }).then(r=>{
          if (!r.ok) console.error(`  ${country.name} unpub batch ${i/100}: ${r.status}`)
        })
      }
    }
  }
}

console.log(`\nFile                              | Country               | CSV  | DB   | Insert | Unpub`)
console.log('-'.repeat(105))
for (const s of summary.sort((a,b)=>(b.inserts||0)+(b.unpub||0)-((a.inserts||0)+(a.unpub||0)))) {
  if (s.status) { console.log(`${s.file.padEnd(34)} | ${s.status}`); continue }
  console.log(`${s.file.padEnd(34)} | ${s.country.padEnd(21)} | ${String(s.csvRows).padStart(4)} | ${String(s.dbTotal).padStart(4)} | ${String(s.inserts).padStart(6)} | ${String(s.unpub).padStart(5)}`)
}
console.log('-'.repeat(105))
console.log(`TOTAL: insert=${totalInserts}, unpublish=${totalUnpub}`)
console.log(APPLY ? '(applied)' : '(dry-run — pass --apply to commit)')
