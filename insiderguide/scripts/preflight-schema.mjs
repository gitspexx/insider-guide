#!/usr/bin/env node
// preflight-schema.mjs — refuse to build a bundle whose backend isn't there yet.
//
// Runs first at prebuild. ../.github/workflows/deploy.yml fires on push to main
// and does `git pull && docker compose build && up` — it applies no migrations
// and deploys no edge functions. So a merge that lands frontend code ahead of
// its schema publishes a form that 404s on every submit and silently drops the
// applicant. A runbook step would work only for as long as someone remembers
// it; this fails the build instead, inside the same `docker compose build` the
// deploy depends on, so the old container keeps serving.
//
// Fails ONLY on a definitive "not there" answer (PostgREST PGRST205 / a 404
// from the functions gateway). A timeout, a 5xx or a DNS failure is
// indeterminate and only warns — same posture as build-seo.mjs, so a flaky
// network never blocks a deploy.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const RUNBOOK = 'insiderguide/docs/deploy-runbook.md'

// Every table a public page writes to, and every edge function it calls, that
// is newer than the last deploy. Add a row here in the same commit that adds
// the migration; delete it once the schema is old news.
const REQUIRED_TABLES = ['creator_applications']
const REQUIRED_FUNCTIONS = ['notify-creator-application']

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
const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

const authHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }

// 'present' | 'missing' | 'unknown'. anon holds no SELECT on these tables, so
// an existing table answers 401/403 (42501) and a missing one answers 404
// PGRST205 — the two are distinguishable without reading a single row.
async function probeTable(table) {
  let res
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers: authHeaders })
  } catch (err) {
    return { state: 'unknown', detail: err.message }
  }
  if (res.ok) return { state: 'present', detail: `HTTP ${res.status}` }
  const body = await res.json().catch(() => ({}))
  if (body?.code === 'PGRST205' || res.status === 404) {
    return { state: 'missing', detail: body?.message || `HTTP ${res.status}` }
  }
  if (res.status === 401 || res.status === 403) {
    return { state: 'present', detail: `HTTP ${res.status} ${body?.code || ''}`.trim() }
  }
  return { state: 'unknown', detail: `HTTP ${res.status} ${body?.code || ''}`.trim() }
}

// OPTIONS carries the anon key so a verify_jwt=true function answers from its
// own CORS handler rather than from the gateway's auth check. Only a 404 means
// "never deployed"; a 401 still proves the slug resolves.
async function probeFunction(slug) {
  let res
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, { method: 'OPTIONS', headers: authHeaders })
  } catch (err) {
    return { state: 'unknown', detail: err.message }
  }
  if (res.status === 404) return { state: 'missing', detail: 'HTTP 404 from the functions gateway' }
  if (res.status >= 500) return { state: 'unknown', detail: `HTTP ${res.status}` }
  return { state: 'present', detail: `HTTP ${res.status}` }
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.warn('⚠ preflight: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping schema check.')
    return
  }

  const missing = []
  for (const table of REQUIRED_TABLES) {
    const { state, detail } = await probeTable(table)
    if (state === 'missing') missing.push(`table public.${table} — ${detail}`)
    else if (state === 'unknown') console.warn(`⚠ preflight: could not determine whether ${table} exists (${detail}). Continuing.`)
  }
  for (const slug of REQUIRED_FUNCTIONS) {
    const { state, detail } = await probeFunction(slug)
    if (state === 'missing') missing.push(`edge function ${slug} — ${detail}`)
    else if (state === 'unknown') console.warn(`⚠ preflight: could not determine whether ${slug} is deployed (${detail}). Continuing.`)
  }

  if (missing.length) {
    console.error('\n✖ preflight: this build needs backend that is not deployed yet.\n')
    for (const m of missing) console.error(`   • ${m}`)
    console.error(
      `\n   Apply the migrations and deploy the edge functions first — ${RUNBOOK}.` +
      '\n   Shipping the bundle without them publishes a form that drops every' +
      '\n   applicant on the floor.\n',
    )
    process.exit(1)
  }

  console.log(
    `✓ preflight: ${REQUIRED_TABLES.length} table(s) and ${REQUIRED_FUNCTIONS.length} edge function(s) present.`,
  )
}

main()
