#!/usr/bin/env node
// Insert missing country rows so sync-maps can import their CSVs.
// Idempotent — skips countries that already exist.

const SUPABASE_URL = 'https://qbzmsvfphpfgnlztskma.supabase.co'
const KEY = process.env.SERVICE_KEY
if (!KEY) { console.error('SERVICE_KEY required'); process.exit(1) }
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const APPLY = process.argv.includes('--apply')

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

const seed = [
  { name:'Croatia',          flag_emoji:'🇭🇷', region:'Europe' },
  { name:'Czechia',           flag_emoji:'🇨🇿', region:'Europe' },
  { name:'France',           flag_emoji:'🇫🇷', region:'Europe' },
  { name:'Greece',           flag_emoji:'🇬🇷', region:'Europe' },
  { name:'Guyana',           flag_emoji:'🇬🇾', region:'South America' },
  { name:'Haiti',            flag_emoji:'🇭🇹', region:'Caribbean' },
  { name:'Hong Kong',        flag_emoji:'🇭🇰', region:'Asia' },
  { name:'Hungary',          flag_emoji:'🇭🇺', region:'Europe' },
  { name:'Israel',           flag_emoji:'🇮🇱', region:'Middle East' },
  { name:'Laos',             flag_emoji:'🇱🇦', region:'Asia' },
  { name:'Latvia',           flag_emoji:'🇱🇻', region:'Europe' },
  { name:'Lithuania',        flag_emoji:'🇱🇹', region:'Europe' },
  { name:'Moldova',          flag_emoji:'🇲🇩', region:'Europe' },
  { name:'Montenegro',       flag_emoji:'🇲🇪', region:'Europe' },
  { name:'Papua New Guinea', flag_emoji:'🇵🇬', region:'Asia' },
  { name:'Poland',           flag_emoji:'🇵🇱', region:'Europe' },
  { name:'Slovakia',         flag_emoji:'🇸🇰', region:'Europe' },
  { name:'Sri Lanka',        flag_emoji:'🇱🇰', region:'Asia' },
  { name:'Suriname',         flag_emoji:'🇸🇷', region:'South America' },
  { name:'United Arab Emirates', flag_emoji:'🇦🇪', region:'Middle East' },
  { name:'United Kingdom',   flag_emoji:'🇬🇧', region:'Europe' },
  { name:'Ukraine',          flag_emoji:'🇺🇦', region:'Europe' },
  { name:'Uruguay',          flag_emoji:'🇺🇾', region:'South America' },
  { name:'Venezuela',        flag_emoji:'🇻🇪', region:'South America' },
]

const existing = await fetch(`${SUPABASE_URL}/rest/v1/countries?select=name,slug`, {headers:h}).then(r=>r.json())
const existingNames = new Set(existing.map(c=>c.name.toLowerCase()))
const existingSlugs = new Set(existing.map(c=>c.slug))

const toInsert = seed
  .filter(c => !existingNames.has(c.name.toLowerCase()) && !existingSlugs.has(slug(c.name)))
  .map(c => ({
    name: c.name,
    slug: slug(c.name),
    flag_emoji: c.flag_emoji,
    region: c.region,
    tagline: '',
    coordinates: '',
    published: false,
  }))

console.log(`Seed candidates: ${seed.length}`)
console.log(`Already exist: ${seed.length - toInsert.length}`)
console.log(`To insert: ${toInsert.length}`)
for (const c of toInsert) console.log(`  + ${c.name} (${c.slug}, ${c.region})`)

if (!APPLY) { console.log('\n(dry-run — pass --apply to commit)'); process.exit(0) }
if (toInsert.length === 0) { console.log('\nNothing to insert.'); process.exit(0) }

const r = await fetch(`${SUPABASE_URL}/rest/v1/countries`, {
  method: 'POST',
  headers: { ...h, Prefer: 'return=representation' },
  body: JSON.stringify(toInsert),
})
if (!r.ok) { console.error(`Insert failed: ${r.status} ${await r.text()}`); process.exit(1) }
const inserted = await r.json()
console.log(`\nInserted ${inserted.length} countries.`)
