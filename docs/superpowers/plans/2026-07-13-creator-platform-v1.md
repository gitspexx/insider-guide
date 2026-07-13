# InsiderGuide Creator Platform V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creators live at `insiderguide.co/@handle` with Google-Maps-imported spots, a `/studio` dashboard, an import wizard, preset theming, and async enrichment.

**Architecture:** Extend the existing `insiderguide` SPA (React 19 + Vite JSX + Tailwind 4) and shared Supabase project `qbzmsvfphpfgnlztskma`. Canonical `businesses` catalog + `creator_saves` join table. Creators are `authenticated` Supabase users gated by a `creators` row (invite-only, admin-created via edge function). All creator writes to the shared catalog go through SECURITY DEFINER RPCs — never blanket RLS INSERT. Enrichment is an edge function drained by pg_cron.

**Tech Stack:** React 19, react-router-dom 7, Tailwind 4 (`@theme` CSS vars), framer-motion, maplibre-gl + OSM raster tiles, papaparse, vitest, Supabase (auth/postgres/storage/edge functions/pg_cron + pg_net), Outscraper API.

**Spec:** `docs/superpowers/specs/2026-07-13-creator-platform-v1-design.md`

## Ground rules for the executor

- Work on branch `feat/creator-platform-v1`. **Pushing `main` deploys to production** (`.github/workflows/deploy.yml`). Merge to main only in the final task.
- Supabase project id: `qbzmsvfphpfgnlztskma`. It is **shared with spexx-crm**. Never modify the `is_admin()` function, never loosen policies on `contacts`, `pipelines`, `pipeline_cards`, `email_accounts`, or any CRM table.
- Migrations: save SQL under `insiderguide/supabase/migrations/` AND apply with the Supabase MCP `apply_migration` tool (there is no local supabase stack).
- App lives in `insiderguide/` subdir. All npm commands: `cd insiderguide && npm run ...`.
- Existing design tokens in `insiderguide/src/index.css` (`--color-accent`, `--color-bg-card`, `--font-display`, etc.). Reuse utility classes you see in `BusinessCard.jsx` / `Login.jsx` — do not invent a new visual language. Dark, warm, editorial.
- Secrets (Outscraper key, service keys) come from the Obsidian vault `koding/.secrets/api-keys.md` — check there before claiming missing.

### Existing schema facts (verified 2026-07-13)

- `businesses` columns include: `id`, `country_id uuid NOT NULL → countries`, `name`, `category`, `description`, `location`, `city`, `google_maps_url`, `instagram_handle`, `email`, `whatsapp`, `website`, `tier` (`listed`/`featured`/`partner`), `tier_paid`, `photo_url`, `recommended_badge`, `published`, `outreach_status`, `notes`, `top_pick_rank`, `created_at`. **No** `lat`/`lng`/`google_place_id` yet.
- `countries`: `id`, `name`, `slug`, `flag_emoji`, `tagline`, `region`, `published`, `keywords`. Anon can read ALL countries (policy `Public can read all countries`).
- `businesses` RLS: anon SELECT only `published = true`; `authenticated_full_access` requires `is_admin()`. Plus three narrow anon INSERT policies for partner signup — leave untouched.
- `newsletter_subscribers` RLS: anon INSERT `true`; `authenticated_full_access` with `qual: true` — **hole: any authenticated user (incl. anonymous-session checkout users) can read all subscriber emails**. Task 1 tightens this to `is_admin()`.
- `is_admin()` RPC exists (allowlist + not-anonymous). `AdminRoute.jsx` pattern: session check + `supabase.rpc('is_admin')` — never call a detached `supabase.rpc` reference.
- Existing edge functions: `init-checkout`, `bcax-callback` (Deno). No `config.toml` in repo yet.
- Fonts loaded in `index.html`: Instrument Serif, Inter, Cormorant Garamond (verify in Task 4; add Fraunces + Space Grotesk there).

---

### Task 1: Database migration — tables, columns, RLS, grants

**Files:**
- Create: `insiderguide/supabase/migrations/20260713120000_creator_platform.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Creator Platform V1: creators, creator_saves, creator_imports,
-- businesses enrichment columns, RLS. Additive only — no existing
-- policy is dropped except the newsletter_subscribers tightening at the end.

create extension if not exists pg_trgm;

-- ── creators ─────────────────────────────────────────────────────
create table public.creators (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9_\.]{3,30}$'),
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  ig_handle text,
  theme jsonb not null default '{"palette":"gold","fonts":"editorial"}',
  email_capture_enabled boolean not null default false,
  status text not null default 'invited'
    check (status in ('invited','active','paused')),
  created_at timestamptz not null default now()
);

-- Reserved handles: existing top-level routes must never be shadowed.
create table public.reserved_handles (handle text primary key);
insert into public.reserved_handles (handle) values
  ('admin'),('studio'),('partner'),('partners'),('for-business'),
  ('checkout'),('apply'),('login'),('api'),('about'),('legal'),
  ('privacy'),('terms'),('sitemap'),('assets');

create or replace function public.enforce_handle_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.handle := lower(new.handle);
  if exists (select 1 from public.reserved_handles r where r.handle = new.handle) then
    raise exception 'handle % is reserved', new.handle;
  end if;
  if exists (select 1 from public.countries c where c.slug = new.handle) then
    raise exception 'handle % collides with a country slug', new.handle;
  end if;
  return new;
end $$;

create trigger trg_creators_handle
  before insert or update of handle on public.creators
  for each row execute function public.enforce_handle_rules();

-- ── creator_saves ────────────────────────────────────────────────
create table public.creator_saves (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  note text not null default '',
  tags text[] not null default '{}',
  sort int not null default 0,
  hidden boolean not null default false,
  source text not null default 'takeout_csv',
  created_at timestamptz not null default now(),
  unique (creator_id, business_id)
);
create index idx_creator_saves_creator on public.creator_saves (creator_id);
create index idx_creator_saves_business on public.creator_saves (business_id);

-- ── creator_imports ──────────────────────────────────────────────
create table public.creator_imports (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  filename text not null,
  list_name text,
  country_id uuid references public.countries (id),
  raw_count int not null default 0,
  matched_count int not null default 0,
  created_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'done' check (status in ('processing','done','failed')),
  created_at timestamptz not null default now()
);
create index idx_creator_imports_creator on public.creator_imports (creator_id);

-- ── businesses: enrichment columns ───────────────────────────────
alter table public.businesses
  add column if not exists google_place_id text,
  add column if not exists google_cid text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists enrich_status text
    check (enrich_status in ('pending_enrich','enriched','enrich_failed')),
  add column if not exists enrich_attempts int not null default 0,
  add column if not exists source text;

create index if not exists idx_businesses_place_id on public.businesses (google_place_id)
  where google_place_id is not null;
create index if not exists idx_businesses_cid on public.businesses (google_cid)
  where google_cid is not null;
create index if not exists idx_businesses_enrich on public.businesses (enrich_status)
  where enrich_status = 'pending_enrich';
create index if not exists idx_businesses_name_trgm on public.businesses
  using gin (lower(name) gin_trgm_ops);

-- ── RLS: creators ────────────────────────────────────────────────
alter table public.creators enable row level security;

create policy anon_read_active_creators on public.creators
  for select to anon using (status = 'active');
create policy authed_read_creators on public.creators
  for select to authenticated using (status = 'active' or id = auth.uid() or is_admin());
create policy creator_update_own on public.creators
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy admin_all_creators on public.creators
  for all to authenticated using (is_admin()) with check (is_admin());

-- Column-level: creators may only edit profile fields, never handle/status.
revoke update on public.creators from authenticated;
grant update (display_name, bio, avatar_url, ig_handle, theme, email_capture_enabled)
  on public.creators to authenticated;
-- (admin edits handle/status via service role or the admin_all policy + a
--  SECURITY DEFINER path; the column grant applies to the authenticated role,
--  so admin UI handle edits go through the edge function in Task 10.)

-- ── RLS: creator_saves ───────────────────────────────────────────
alter table public.creator_saves enable row level security;

create policy anon_read_visible_saves on public.creator_saves
  for select to anon using (
    hidden = false and exists (
      select 1 from public.creators c
      where c.id = creator_saves.creator_id and c.status = 'active')
  );
create policy authed_read_saves on public.creator_saves
  for select to authenticated using (
    creator_id = auth.uid() or is_admin() or (
      hidden = false and exists (
        select 1 from public.creators c
        where c.id = creator_saves.creator_id and c.status = 'active'))
  );
create policy creator_write_own_saves on public.creator_saves
  for all to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());
create policy admin_all_saves on public.creator_saves
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── RLS: creator_imports ─────────────────────────────────────────
alter table public.creator_imports enable row level security;
create policy creator_own_imports on public.creator_imports
  for all to authenticated
  using (creator_id = auth.uid() or is_admin())
  with check (creator_id = auth.uid() or is_admin());

-- ── RLS: businesses — additive read paths for creator-saved places ──
-- Anon must see creator-saved businesses on public creator pages even when
-- published=false (published gates COUNTRY pages, not creator pages).
create policy anon_read_creator_saved on public.businesses
  for select to anon using (
    exists (
      select 1 from public.creator_saves cs
      join public.creators c on c.id = cs.creator_id
      where cs.business_id = businesses.id
        and cs.hidden = false and c.status = 'active')
  );
create policy creator_read_own_saved on public.businesses
  for select to authenticated using (
    exists (
      select 1 from public.creator_saves cs
      where cs.business_id = businesses.id and cs.creator_id = auth.uid())
  );

-- ── reserved_handles: readable, admin-writable ───────────────────
alter table public.reserved_handles enable row level security;
create policy read_reserved on public.reserved_handles for select using (true);
create policy admin_write_reserved on public.reserved_handles
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── SECURITY FIX: newsletter_subscribers was readable by ANY
--    authenticated user (incl. anonymous checkout sessions). ──────
drop policy if exists authenticated_full_access on public.newsletter_subscribers;
create policy admin_full_access on public.newsletter_subscribers
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── Storage bucket for avatars ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('creator-assets', 'creator-assets', true)
on conflict (id) do nothing;

create policy creator_upload_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'creator-assets'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy creator_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'creator-assets'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy public_read_creator_assets on storage.objects
  for select using (bucket_id = 'creator-assets');
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: qbzmsvfphpfgnlztskma`, name `creator_platform`, and the SQL above.
Expected: success, no errors.

- [ ] **Step 3: Verify RLS with SQL probes**

Run via `execute_sql` (each must return the stated result):

```sql
-- as anon: no invited creators visible
set local role anon;
select count(*) from public.creators;                     -- 0 rows visible (none active yet)
select count(*) from public.newsletter_subscribers;       -- ERROR or 0 rows? anon has no SELECT policy → 0 rows
reset role;
```

```sql
-- authenticated non-admin cannot read subscribers anymore
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select count(*) from public.newsletter_subscribers;       -- expected: 0 rows
reset role;
```

- [ ] **Step 4: Commit**

```bash
cd ~/koding/insider-guide
git checkout -b feat/creator-platform-v1
git add insiderguide/supabase/migrations/20260713120000_creator_platform.sql
git commit -m "feat(db): creator platform tables, RLS, storage bucket + tighten newsletter_subscribers"
```

---

### Task 2: Import RPCs — `preview_import` + `commit_import`

**Files:**
- Create: `insiderguide/supabase/migrations/20260713121000_import_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Import pipeline RPCs. SECURITY DEFINER because creators cannot (and must
-- not) SELECT/INSERT the whole businesses catalog directly.

-- Row shape (jsonb array elements) coming from the client parser:
-- { "title": text, "note": text, "url": text,
--   "cid": text|null, "place_id": text|null, "lat": num|null, "lng": num|null }

create or replace function public.preview_import(p_country_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_creator uuid;
  r jsonb;
  v_match uuid;
  v_match_name text;
  v_match_kind text;
  v_out jsonb := '[]'::jsonb;
begin
  select id into v_creator from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_match := null; v_match_kind := null; v_match_name := null;

    if coalesce(r->>'place_id','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where google_place_id = r->>'place_id' limit 1;
      if v_match is not null then v_match_kind := 'place_id'; end if;
    end if;

    if v_match is null and coalesce(r->>'cid','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where google_cid = r->>'cid' limit 1;
      if v_match is not null then v_match_kind := 'cid'; end if;
    end if;

    if v_match is null and coalesce(r->>'title','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where country_id = p_country_id
          and similarity(lower(name), lower(r->>'title')) > 0.55
        order by similarity(lower(name), lower(r->>'title')) desc
        limit 1;
      if v_match is not null then v_match_kind := 'fuzzy'; end if;
    end if;

    v_out := v_out || jsonb_build_array(
      r || jsonb_build_object(
        'match_business_id', v_match,
        'match_name', v_match_name,
        'match_kind', v_match_kind));
  end loop;

  return v_out;
end $$;

-- Commit: creates the import record, stub businesses for unmatched rows,
-- and creator_saves for everything. Idempotent per (creator, business).
create or replace function public.commit_import(
  p_country_id uuid,
  p_filename text,
  p_list_name text,
  p_rows jsonb   -- preview rows, each with match_business_id possibly null,
                 -- and "accepted" boolean (fuzzy matches the creator rejected
                 -- arrive with match_business_id stripped by the client)
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_creator uuid;
  v_import uuid;
  r jsonb;
  v_bid uuid;
  v_matched int := 0;
  v_created int := 0;
  v_failed int := 0;
begin
  select id into v_creator from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;
  if not exists (select 1 from countries where id = p_country_id) then
    raise exception 'unknown country';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too many rows in one import';
  end if;

  insert into creator_imports (creator_id, filename, list_name, country_id,
                               raw_count, status)
  values (v_creator, p_filename, p_list_name, p_country_id,
          jsonb_array_length(p_rows), 'processing')
  returning id into v_import;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if coalesce(r->>'title','') = '' then
        v_failed := v_failed + 1; continue;
      end if;
      v_bid := nullif(r->>'match_business_id','')::uuid;

      if v_bid is null then
        insert into businesses (country_id, name, google_maps_url,
                                google_place_id, google_cid, lat, lng,
                                tier, published, enrich_status, source)
        values (p_country_id,
                left(r->>'title', 200),
                r->>'url',
                nullif(r->>'place_id',''),
                nullif(r->>'cid',''),
                nullif(r->>'lat','')::double precision,
                nullif(r->>'lng','')::double precision,
                'listed', false, 'pending_enrich', 'creator_import')
        returning id into v_bid;
        v_created := v_created + 1;
      else
        v_matched := v_matched + 1;
      end if;

      insert into creator_saves (creator_id, business_id, note, source)
      values (v_creator, v_bid, coalesce(left(r->>'note', 2000), ''), 'takeout_csv')
      on conflict (creator_id, business_id)
      do update set note = excluded.note;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  update creator_imports
     set matched_count = v_matched, created_count = v_created,
         failed_count = v_failed, status = 'done'
   where id = v_import;

  return jsonb_build_object('import_id', v_import, 'matched', v_matched,
                            'created', v_created, 'failed', v_failed);
end $$;

revoke all on function public.preview_import(uuid, jsonb) from public, anon;
revoke all on function public.commit_import(uuid, text, text, jsonb) from public, anon;
grant execute on function public.preview_import(uuid, jsonb) to authenticated;
grant execute on function public.commit_import(uuid, text, text, jsonb) to authenticated;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `import_rpcs`). Expected: success.

- [ ] **Step 3: Negative test — non-creator caller rejected**

Via `execute_sql`:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.preview_import(null, '[]'::jsonb);   -- expected: ERROR "not an active creator"
reset role;
```

- [ ] **Step 4: Commit**

```bash
git add insiderguide/supabase/migrations/20260713121000_import_rpcs.sql
git commit -m "feat(db): preview_import + commit_import SECURITY DEFINER RPCs"
```

---

### Task 3: Takeout parser (TDD)

**Files:**
- Create: `insiderguide/src/lib/takeoutParser.js`
- Create: `insiderguide/src/lib/takeoutParser.test.js`
- Modify: `insiderguide/package.json` (add papaparse, vitest, test script)

- [ ] **Step 1: Install deps**

```bash
cd ~/koding/insider-guide/insiderguide
npm install papaparse
npm install -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing tests**

```js
// insiderguide/src/lib/takeoutParser.test.js
import { describe, it, expect } from 'vitest'
import { extractPlaceRef, parseTakeoutCsv } from './takeoutParser'

describe('extractPlaceRef', () => {
  it('extracts CID from ?cid= URLs', () => {
    expect(extractPlaceRef('https://maps.google.com/?cid=12345678901234567890'))
      .toEqual({ cid: '12345678901234567890', placeId: null, lat: null, lng: null })
  })

  it('extracts CID from ftid hex pair in /maps/place URLs', () => {
    const url = 'https://www.google.com/maps/place/Caf%C3%A9+Test/data=!4m2!3m1!1s0x89c259af336b3341:0xa4969e07ce3108de'
    const ref = extractPlaceRef(url)
    // 0xa4969e07ce3108de → decimal
    expect(ref.cid).toBe(BigInt('0xa4969e07ce3108de').toString())
  })

  it('extracts ftid from ftid= query param', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=x&ftid=0x89c259af336b3341:0xa4969e07ce3108de'
    expect(extractPlaceRef(url).cid).toBe(BigInt('0xa4969e07ce3108de').toString())
  })

  it('extracts place_id when present', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4'
    expect(extractPlaceRef(url).placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
  })

  it('extracts coordinates from /@lat,lng URLs as fallback', () => {
    const ref = extractPlaceRef('https://www.google.com/maps/place/Somewhere/@4.60971,-74.08175,17z')
    expect(ref.lat).toBeCloseTo(4.60971)
    expect(ref.lng).toBeCloseTo(-74.08175)
  })

  it('returns nulls for unparseable URLs', () => {
    expect(extractPlaceRef('not a url'))
      .toEqual({ cid: null, placeId: null, lat: null, lng: null })
  })
})

describe('parseTakeoutCsv', () => {
  const CSV = `Title,Note,URL,Comment
"Café Test","great flat white","https://maps.google.com/?cid=111",
"Museo del Oro","","https://www.google.com/maps/place/Museo/data=!4m2!3m1!1s0x0:0x2b",
"Broken row","",""
`
  it('parses rows and attaches refs', () => {
    const { rows, failed } = parseTakeoutCsv(CSV)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ title: 'Café Test', note: 'great flat white', cid: '111' })
    expect(rows[1].cid).toBe(BigInt('0x2b').toString())
    expect(failed).toHaveLength(1)   // no URL → failed row
  })

  it('handles quoted commas and newlines in notes', () => {
    const tricky = 'Title,Note,URL\n"A place","note, with comma\nand newline","https://maps.google.com/?cid=9"\n'
    const { rows } = parseTakeoutCsv(tricky)
    expect(rows[0].note).toBe('note, with comma\nand newline')
  })
})
```

- [ ] **Step 3: Run tests, verify failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./takeoutParser`.

- [ ] **Step 4: Implement the parser**

```js
// insiderguide/src/lib/takeoutParser.js
import Papa from 'papaparse'

/**
 * Extract a canonical place reference from a Google Maps URL.
 * Priority: explicit place_id → CID (?cid= | ftid hex pair) → coordinates.
 * The ftid second hex component IS the CID in decimal.
 */
export function extractPlaceRef(url) {
  const out = { cid: null, placeId: null, lat: null, lng: null }
  if (!url || typeof url !== 'string') return out
  try {
    const placeId = url.match(/[?&](?:query_place_id|place_id)=([A-Za-z0-9_-]+)/)
    if (placeId) out.placeId = placeId[1]

    const cid = url.match(/[?&]cid=(\d+)/)
    if (cid) out.cid = cid[1]

    if (!out.cid) {
      // ftid appears as "!1s0x...:0x..." in data= blobs or as ftid=0x...:0x...
      const ftid = url.match(/(?:!1s|[?&]ftid=)0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/)
      if (ftid) out.cid = BigInt('0x' + ftid[1]).toString()
    }

    const coords = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (coords) {
      out.lat = parseFloat(coords[1])
      out.lng = parseFloat(coords[2])
    }
  } catch {
    /* malformed URL → nulls */
  }
  return out
}

/**
 * Parse one Google Takeout saved-list CSV (columns: Title, Note, URL[, Comment]).
 * Returns { rows, failed } — rows ready for preview_import, failed rows for display.
 */
export function parseTakeoutCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const failed = []
  for (const raw of parsed.data) {
    const title = (raw.Title || raw.title || '').trim()
    const note = (raw.Note || raw.note || '').trim()
    const url = (raw.URL || raw.url || '').trim()
    if (!title || !url) {
      failed.push({ title, note, url, reason: !title ? 'missing title' : 'missing URL' })
      continue
    }
    const ref = extractPlaceRef(url)
    rows.push({ title, note, url, cid: ref.cid, place_id: ref.placeId, lat: ref.lat, lng: ref.lng })
  }
  return { rows, failed }
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add insiderguide/src/lib/takeoutParser.js insiderguide/src/lib/takeoutParser.test.js insiderguide/package.json insiderguide/package-lock.json
git commit -m "feat(import): Takeout CSV parser with place-ref extraction (TDD)"
```

---

### Task 4: Theme presets + fonts

**Files:**
- Create: `insiderguide/src/lib/themes.js`
- Modify: `insiderguide/index.html` (font links)

- [ ] **Step 1: Verify current font links**

Run: `grep -n "fonts.googleapis\|@font-face" insiderguide/index.html`
Expected: links for Instrument Serif, Inter, Cormorant Garamond. Add Fraunces + Space Grotesk to the SAME `<link>` families URL (keep one request), e.g. append `&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Space+Grotesk:wght@400;500`.

- [ ] **Step 2: Write the preset module**

```js
// insiderguide/src/lib/themes.js
// Preset-only theming. Values override the Tailwind 4 @theme CSS variables
// (--color-accent etc.) on the CreatorPage subtree root — utilities like
// text-accent resolve to var(--color-accent) at runtime, so a subtree
// override restyles everything inside without any component changes.

export const PALETTES = {
  gold:     { label: 'Gold',     accent: '#C8A55A', dim: 'rgba(200,165,90,0.45)',  faint: 'rgba(200,165,90,0.08)',  border: 'rgba(200,165,90,0.25)' },
  emerald:  { label: 'Emerald',  accent: '#5AB88A', dim: 'rgba(90,184,138,0.45)',  faint: 'rgba(90,184,138,0.08)',  border: 'rgba(90,184,138,0.25)' },
  azure:    { label: 'Azure',    accent: '#6FA8DC', dim: 'rgba(111,168,220,0.45)', faint: 'rgba(111,168,220,0.08)', border: 'rgba(111,168,220,0.25)' },
  coral:    { label: 'Coral',    accent: '#E08A6D', dim: 'rgba(224,138,109,0.45)', faint: 'rgba(224,138,109,0.08)', border: 'rgba(224,138,109,0.25)' },
  lavender: { label: 'Lavender', accent: '#A98FCB', dim: 'rgba(169,143,203,0.45)', faint: 'rgba(169,143,203,0.08)', border: 'rgba(169,143,203,0.25)' },
  sand:     { label: 'Sand',     accent: '#C9B79A', dim: 'rgba(201,183,154,0.45)', faint: 'rgba(201,183,154,0.08)', border: 'rgba(201,183,154,0.25)' },
}

export const FONT_PAIRS = {
  editorial: { label: 'Editorial', display: "'Instrument Serif', serif",     body: "'Inter', sans-serif" },
  classic:   { label: 'Classic',   display: "'Cormorant Garamond', serif",  body: "'Inter', sans-serif" },
  soft:      { label: 'Soft',      display: "'Fraunces', serif",            body: "'Inter', sans-serif" },
  modern:    { label: 'Modern',    display: "'Space Grotesk', sans-serif",  body: "'Inter', sans-serif" },
}

export function themeToCssVars(theme) {
  const p = PALETTES[theme?.palette] || PALETTES.gold
  const f = FONT_PAIRS[theme?.fonts] || FONT_PAIRS.editorial
  return {
    '--color-accent': p.accent,
    '--color-accent-dim': p.dim,
    '--color-accent-faint': p.faint,
    '--color-accent-glow': p.faint,
    '--color-border-accent': p.border,
    '--font-display': f.display,
    '--font-body': f.body,
  }
}
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add insiderguide/src/lib/themes.js insiderguide/index.html
git commit -m "feat(theme): creator palette + font-pair presets via CSS var override"
```

---

### Task 5: Creator auth — `CreatorRoute` + `/studio/login`

**Files:**
- Create: `insiderguide/src/components/CreatorRoute.jsx`
- Create: `insiderguide/src/pages/studio/Login.jsx`
- Modify: `insiderguide/src/App.jsx` (routes added in Task 9 together — here only files)

- [ ] **Step 1: Write CreatorRoute**

Mirror `AdminRoute.jsx` exactly in shape (session check first, then DB truth check). The DB truth for creators = own `creators` row with `status='active'`. Keep `supabase.rpc`/`supabase.from` attached to the client — never destructure (blank-screen incident).

```jsx
// insiderguide/src/components/CreatorRoute.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Session alone is NOT enough (anon checkout sessions hold authenticated JWTs).
// Source of truth: own row in creators with status='active' (RLS lets a user
// read only their own row when not active-public).
export default function CreatorRoute({ children }) {
  const [state, setState] = useState('checking') // checking | allowed | paused | denied
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) { setState('denied'); navigate('/studio/login') }
        return
      }
      const { data, error } = await supabase
        .from('creators').select('id,status').eq('id', session.user.id).maybeSingle()
      if (cancelled) return
      if (error || !data) { setState('denied'); navigate('/studio/login'); return }
      setState(data.status === 'active' ? 'allowed' : 'paused')
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check())
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [navigate])

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-sm font-body">Loading...</span>
      </div>
    )
  }
  if (state === 'paused') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl mb-2">Account paused</h1>
          <p className="text-text-dim text-sm">Contact us to reactivate your creator page.</p>
        </div>
      </div>
    )
  }
  return state === 'allowed' ? children : null
}
```

- [ ] **Step 2: Write studio Login (magic link, invite-only)**

```jsx
// insiderguide/src/pages/studio/Login.jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Seo from '../../components/Seo'

export default function StudioLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSend(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    // shouldCreateUser:false = invite-only. Unknown emails get a generic error.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/studio` },
    })
    if (error) setError('This email is not registered as a creator yet.')
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Seo title="Creator Studio" path="/studio/login" noindex />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-[9px] uppercase tracking-[0.3em] text-accent-dim block mb-1">Creator Studio</span>
          <h1 className="font-display text-3xl text-text">INSIDER GUIDE</h1>
        </div>
        {sent ? (
          <p className="text-center text-sm text-text-secondary">
            Check your inbox — we sent you a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-4">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your creator email"
              className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text placeholder:text-text-dim focus:border-accent/30 focus:outline-none font-body"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="bg-accent text-bg font-body text-sm uppercase tracking-wider py-3 rounded-sm hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50">
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add insiderguide/src/components/CreatorRoute.jsx insiderguide/src/pages/studio/Login.jsx
git commit -m "feat(studio): CreatorRoute guard + magic-link login (invite-only)"
```

---

### Task 6: Studio shell + My Spots

**Files:**
- Create: `insiderguide/src/pages/studio/StudioLayout.jsx`
- Create: `insiderguide/src/pages/studio/MySpots.jsx`

- [ ] **Step 1: Studio layout (nav + outlet)**

```jsx
// insiderguide/src/pages/studio/StudioLayout.jsx
import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TABS = [
  { to: '/studio', label: 'My Spots', end: true },
  { to: '/studio/import', label: 'Import' },
  { to: '/studio/settings', label: 'Page Settings' },
]

export default function StudioLayout() {
  const [creator, setCreator] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('creators').select('*').eq('id', session.user.id).maybeSingle()
      if (!cancelled) setCreator(data)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-display text-lg text-text">Studio</span>
          <nav className="flex gap-4">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) =>
                  `text-xs uppercase tracking-[0.12em] ${isActive ? 'text-accent' : 'text-text-dim hover:text-text-secondary'}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {creator && (
            <a href={`/@${creator.handle}`} target="_blank" rel="noreferrer"
               className="text-xs text-accent hover:underline">
              insiderguide.co/@{creator.handle} ↗
            </a>
          )}
          <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = '/'))}
                  className="text-xs text-text-dim hover:text-text-secondary cursor-pointer">
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Outlet context={{ creator, setCreator }} />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: My Spots page**

```jsx
// insiderguide/src/pages/studio/MySpots.jsx
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function MySpots() {
  const [saves, setSaves] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase
      .from('creator_saves')
      .select('id, note, hidden, created_at, businesses(id, name, category, city, location, enrich_status, photo_url, countries(name, flag_emoji))')
      .eq('creator_id', session.user.id)
      .order('created_at', { ascending: false })
    if (!error) setSaves(data)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateSave(id, patch) {
    setSavingId(id)
    await supabase.from('creator_saves').update(patch).eq('id', id)
    setSavingId(null)
    load()
  }

  async function removeSave(id) {
    if (!confirm('Remove this spot from your page?')) return
    await supabase.from('creator_saves').delete().eq('id', id)
    load()
  }

  if (saves === null) return <p className="text-text-dim text-sm">Loading…</p>

  if (saves.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="font-display text-2xl mb-2">No spots yet</h2>
        <p className="text-text-dim text-sm mb-6">Import your Google Maps saved places to build your page.</p>
        <Link to="/studio/import"
              className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm">
          Start import
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">My Spots <span className="text-text-dim text-base">({saves.length})</span></h1>
        <Link to="/studio/import" className="text-xs text-accent uppercase tracking-wider">+ Import more</Link>
      </div>
      <div className="flex flex-col gap-3">
        {saves.map((s) => (
          <div key={s.id}
               className={`bg-bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 ${s.hidden ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-text truncate">{s.businesses?.name}</span>
                <span className="text-xs text-text-dim">
                  {s.businesses?.countries?.flag_emoji} {s.businesses?.city || s.businesses?.location || ''}
                </span>
                {s.businesses?.enrich_status === 'pending_enrich' && (
                  <span className="text-[10px] uppercase tracking-wider text-accent-dim border border-border px-2 py-0.5 rounded-full">enriching…</span>
                )}
              </div>
              <input
                defaultValue={s.note}
                placeholder="Your personal note (shown on your page)"
                onBlur={(e) => e.target.value !== s.note && updateSave(s.id, { note: e.target.value })}
                className="mt-2 w-full bg-transparent border border-border rounded-sm px-3 py-2 text-sm text-text-secondary placeholder:text-text-dim focus:border-accent/30 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => updateSave(s.id, { hidden: !s.hidden })}
                      disabled={savingId === s.id}
                      className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-2 rounded-lg hover:text-text-secondary cursor-pointer">
                {s.hidden ? 'Show' : 'Hide'}
              </button>
              <button onClick={() => removeSave(s.id)}
                      className="text-xs uppercase tracking-wider text-red-400/70 border border-border px-3 py-2 rounded-lg hover:text-red-400 cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add insiderguide/src/pages/studio/StudioLayout.jsx insiderguide/src/pages/studio/MySpots.jsx
git commit -m "feat(studio): layout shell + My Spots (edit note, hide, remove)"
```

---

### Task 7: Import wizard

**Files:**
- Create: `insiderguide/src/pages/studio/Import.jsx`

- [ ] **Step 1: Write the wizard**

Four steps in one component: (1) how-to instructions, (2) upload + country select, (3) preview matches, (4) result. Uses `parseTakeoutCsv` + the two RPCs.

```jsx
// insiderguide/src/pages/studio/Import.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseTakeoutCsv } from '../../lib/takeoutParser'

const HOWTO = [
  'Open takeout.google.com and sign in with the Google account that has your saved places.',
  'Click “Deselect all”, then scroll down and tick only “Saved” (your Maps lists).',
  'Click “Next step”, choose “Export once” + “.zip”, then “Create export”.',
  'Google emails you a download link (usually within minutes). Download and unzip.',
  'Inside Takeout/Saved/ you\'ll find one CSV per list (e.g. “Want to go.csv”, “Colombia.csv”). Upload them below.',
]

export default function StudioImport() {
  const [step, setStep] = useState(1)
  const [countries, setCountries] = useState([])
  const [countryId, setCountryId] = useState('')
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)     // { rows, failed }
  const [preview, setPreview] = useState(null)   // rows with match_* fields
  const [rejected, setRejected] = useState({})   // row index → true (fuzzy match rejected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    supabase.from('countries').select('id,name,flag_emoji').order('name')
      .then(({ data }) => setCountries(data || []))
  }, [])

  async function handlePreview() {
    setBusy(true); setError(null)
    try {
      const text = await file.text()
      const p = parseTakeoutCsv(text)
      if (p.rows.length === 0) throw new Error('No importable rows found in this CSV.')
      setParsed(p)
      const { data, error } = await supabase.rpc('preview_import', {
        p_country_id: countryId, p_rows: p.rows,
      })
      if (error) throw error
      setPreview(data)
      setStep(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    setBusy(true); setError(null)
    try {
      // Strip match ids from fuzzy matches the creator rejected → they become new stubs.
      const rows = preview.map((r, i) =>
        r.match_kind === 'fuzzy' && rejected[i]
          ? { ...r, match_business_id: null, match_name: null, match_kind: null }
          : r)
      const { data, error } = await supabase.rpc('commit_import', {
        p_country_id: countryId,
        p_filename: file.name,
        p_list_name: file.name.replace(/\.csv$/i, ''),
        p_rows: rows,
      })
      if (error) throw error
      setResult(data)
      setStep(4)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-6">Import from Google Maps</h1>

      {step === 1 && (
        <div>
          <p className="text-text-secondary text-sm mb-4">
            Your saved places live in Google Maps lists. Google Takeout exports them as CSV files — here's how:
          </p>
          <ol className="flex flex-col gap-3 mb-8">
            {HOWTO.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm text-text-secondary">
                <span className="text-accent font-display shrink-0">{i + 1}.</span>{t}
              </li>
            ))}
          </ol>
          <button onClick={() => setStep(2)}
                  className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer">
            I have my CSV files
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <label className="text-sm text-text-secondary">
            Which country are these spots in?
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)}
                    className="mt-2 w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none">
              <option value="">Select a country…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-text-secondary">
            Takeout CSV file (one list at a time)
            <input type="file" accept=".csv,text/csv"
                   onChange={(e) => setFile(e.target.files?.[0] || null)}
                   className="mt-2 block w-full text-sm text-text-dim file:bg-bg-elevated file:border file:border-border file:rounded-sm file:px-4 file:py-2 file:text-text-secondary file:cursor-pointer" />
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="text-xs text-text-dim uppercase tracking-wider cursor-pointer">← Back</button>
            <button onClick={handlePreview} disabled={!file || !countryId || busy}
                    className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40">
              {busy ? 'Analyzing…' : 'Preview import'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div>
          <div className="flex gap-6 mb-4 text-sm">
            <span className="text-text-secondary">
              <strong className="text-accent">{preview.filter((r) => r.match_business_id).length}</strong> matched
            </span>
            <span className="text-text-secondary">
              <strong className="text-text">{preview.filter((r) => !r.match_business_id).length}</strong> new
            </span>
            {parsed.failed.length > 0 && (
              <span className="text-red-400/80">{parsed.failed.length} skipped (bad rows)</span>
            )}
          </div>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto mb-6 pr-1">
            {preview.map((r, i) => (
              <div key={i} className="bg-bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="text-text truncate block">{r.title}</span>
                  {r.match_kind === 'fuzzy' && (
                    <span className="text-[11px] text-accent-dim">
                      Looks like “{r.match_name}” already on Insider Guide — same place?
                    </span>
                  )}
                </div>
                {r.match_kind === 'fuzzy' ? (
                  <button onClick={() => setRejected((x) => ({ ...x, [i]: !x[i] }))}
                          className={`text-[11px] uppercase tracking-wider border px-2.5 py-1 rounded-full cursor-pointer ${
                            rejected[i] ? 'border-border text-text-dim' : 'border-accent/30 text-accent'}`}>
                    {rejected[i] ? 'No, new place' : 'Yes, same'}
                  </button>
                ) : (
                  <span className={`text-[11px] uppercase tracking-wider ${r.match_business_id ? 'text-accent' : 'text-text-dim'}`}>
                    {r.match_business_id ? 'matched' : 'new'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="text-xs text-text-dim uppercase tracking-wider cursor-pointer">← Back</button>
            <button onClick={handleCommit} disabled={busy}
                    className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40">
              {busy ? 'Importing…' : `Import ${preview.length} spots`}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="text-center py-10">
          <h2 className="font-display text-2xl mb-3">Import complete</h2>
          <p className="text-text-secondary text-sm mb-1">
            {result.matched} matched · {result.created} new places created · {result.failed} failed
          </p>
          <p className="text-text-dim text-xs mb-8">
            New places show basic info now and upgrade automatically as we enrich them (photos, categories, map pins).
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/studio" className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm">View my spots</Link>
            <button onClick={() => { setStep(2); setFile(null); setPreview(null); setResult(null); setRejected({}) }}
                    className="text-sm text-text-dim uppercase tracking-wider cursor-pointer">Import another list</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add insiderguide/src/pages/studio/Import.jsx
git commit -m "feat(studio): 4-step Takeout import wizard (howto, upload, preview, commit)"
```

---

### Task 8: Settings page (profile, theme picker, email capture toggle, avatar)

**Files:**
- Create: `insiderguide/src/pages/studio/Settings.jsx`

- [ ] **Step 1: Write Settings**

```jsx
// insiderguide/src/pages/studio/Settings.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PALETTES, FONT_PAIRS, themeToCssVars } from '../../lib/themes'

export default function StudioSettings() {
  const [creator, setCreator] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('creators').select('*').eq('id', session.user.id).maybeSingle()
      if (!cancelled && data) { setCreator(data); setForm(data) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleAvatar(e) {
    const f = e.target.files?.[0]
    if (!f || !creator) return
    const path = `${creator.id}/avatar-${Date.now()}.${f.name.split('.').pop()}`
    const { error } = await supabase.storage.from('creator-assets').upload(path, f, { upsert: true })
    if (error) { setError(error.message); return }
    const { data } = supabase.storage.from('creator-assets').getPublicUrl(path)
    setForm((x) => ({ ...x, avatar_url: data.publicUrl }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await supabase.from('creators').update({
      display_name: form.display_name,
      bio: form.bio,
      avatar_url: form.avatar_url,
      ig_handle: form.ig_handle,
      theme: form.theme,
      email_capture_enabled: form.email_capture_enabled,
    }).eq('id', creator.id)
    if (error) setError(error.message)
    else setSaved(true)
    setSaving(false)
  }

  if (!form) return <p className="text-text-dim text-sm">Loading…</p>

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <h1 className="font-display text-2xl">Page Settings</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Profile</h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-bg-elevated border border-border overflow-hidden shrink-0">
            {form.avatar_url && <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <input type="file" accept="image/*" onChange={handleAvatar}
                 className="text-sm text-text-dim file:bg-bg-elevated file:border file:border-border file:rounded-sm file:px-4 file:py-2 file:text-text-secondary file:cursor-pointer" />
        </div>
        <input value={form.display_name} placeholder="Display name"
               onChange={(e) => setForm({ ...form, display_name: e.target.value })}
               className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none" />
        <textarea value={form.bio} placeholder="Short bio shown on your page" rows={3}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none resize-none" />
        <input value={form.ig_handle || ''} placeholder="Instagram handle (without @)"
               onChange={(e) => setForm({ ...form, ig_handle: e.target.value })}
               className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none" />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-4">Accent color</h2>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(PALETTES).map(([key, p]) => (
            <button key={key} onClick={() => setForm({ ...form, theme: { ...form.theme, palette: key } })}
                    title={p.label}
                    className={`w-10 h-10 rounded-full cursor-pointer border-2 transition-transform hover:scale-110 ${
                      form.theme?.palette === key ? 'border-text' : 'border-transparent'}`}
                    style={{ backgroundColor: p.accent }} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-4">Typography</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(FONT_PAIRS).map(([key, f]) => (
            <button key={key} onClick={() => setForm({ ...form, theme: { ...form.theme, fonts: key } })}
                    className={`bg-bg-card border rounded-xl p-4 text-left cursor-pointer ${
                      form.theme?.fonts === key ? 'border-accent/50' : 'border-border hover:border-border-hover'}`}>
              <span className="block text-lg text-text" style={{ fontFamily: f.display }}>{f.label}</span>
              <span className="block text-xs text-text-dim" style={{ fontFamily: f.body }}>Body text preview</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-bg-card border border-border rounded-xl p-5" style={themeToCssVars(form.theme)}>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-2">Live preview</h2>
        <h3 className="font-display text-2xl text-accent mb-1" style={{ fontFamily: (FONT_PAIRS[form.theme?.fonts] || FONT_PAIRS.editorial).display }}>
          {form.display_name || 'Your name'}
        </h3>
        <p className="text-sm text-text-secondary">{form.bio || 'Your bio appears here.'}</p>
      </section>

      <section className="flex items-center justify-between bg-bg-card border border-border rounded-xl p-5">
        <div>
          <h2 className="text-sm text-text mb-1">Collect visitor emails</h2>
          <p className="text-xs text-text-dim">Show a soft email popup on your page. You get the list.</p>
        </div>
        <button onClick={() => setForm({ ...form, email_capture_enabled: !form.email_capture_enabled })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                  form.email_capture_enabled ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-text transition-all ${
            form.email_capture_enabled ? 'left-6' : 'left-0.5'}`} />
        </button>
      </section>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
                className="bg-accent text-bg text-sm uppercase tracking-wider px-8 py-3 rounded-sm cursor-pointer disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-xs text-accent">Saved ✓</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add insiderguide/src/pages/studio/Settings.jsx
git commit -m "feat(studio): settings — profile, palette/font presets, email toggle, avatar upload"
```

---

### Task 9: Public creator page + map + routing + email capture

**Files:**
- Create: `insiderguide/src/pages/CreatorPage.jsx`
- Create: `insiderguide/src/components/creator/CreatorMap.jsx`
- Modify: `insiderguide/src/components/EmailCapturePopup.jsx` (add `source` + `heading` props)
- Modify: `insiderguide/src/components/BusinessCard.jsx` (optional `creatorNote` + `creatorName` props)
- Modify: `insiderguide/src/App.jsx` (all new routes)
- Modify: `insiderguide/src/pages/CountryGuide.jsx` (slug fallback → creator redirect)

- [ ] **Step 1: Install maplibre**

```bash
npm install maplibre-gl
```

- [ ] **Step 2: CreatorMap component**

```jsx
// insiderguide/src/components/creator/CreatorMap.jsx
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

/**
 * spots: [{ id, name, lat, lng }] — only pass rows with coordinates.
 * onPinClick(id) highlights the matching card in the list.
 */
export default function CreatorMap({ spots, accent = '#C8A55A', onPinClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: { compact: true },
    })
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const withCoords = spots.filter((s) => s.lat != null && s.lng != null)
    if (withCoords.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    withCoords.forEach((s) => {
      const el = document.createElement('button')
      el.setAttribute('aria-label', s.name)
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${accent};border:2px solid rgba(11,10,8,0.9);cursor:pointer;box-shadow:0 0 8px ${accent}55;`
      el.addEventListener('click', () => onPinClick?.(s.id))
      const marker = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map)
      markersRef.current.push(marker)
      bounds.extend([s.lng, s.lat])
    })
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 400 })
  }, [spots, accent, onPinClick])

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden border border-border" />
}
```

- [ ] **Step 3: Extend EmailCapturePopup**

In `EmailCapturePopup.jsx`: change the signature to
`export default function EmailCapturePopup({ countrySlug, source = 'web_popup', heading })`
— use `source` in the `newsletter_subscribers` insert payload (find the existing insert with `source: 'web_popup'` and replace with `source`), and render `heading` instead of the hardcoded headline when provided. Do not change trigger/dismiss behavior.

- [ ] **Step 4: Extend BusinessCard**

In `BusinessCard.jsx`: add props `creatorNote` and `creatorName`. When `creatorNote` is non-empty, render it INSTEAD of `business.description`, styled as the personal voice:

```jsx
{creatorNote ? (
  <p className="font-editorial italic text-text-secondary text-[14px] leading-relaxed mb-3">
    “{creatorNote}”
  </p>
) : business.description && ( /* existing description block unchanged */ )}
```

And when `creatorName` is set, replace the hardcoded "Recommended by Alex" badge text with `Recommended by {creatorName}` (keep default 'Alex' so country pages are untouched: `creatorName = 'Alex'` default param).

- [ ] **Step 5: CreatorPage**

```jsx
// insiderguide/src/pages/CreatorPage.jsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { themeToCssVars } from '../lib/themes'
import BusinessCard from '../components/BusinessCard'
import CreatorMap from '../components/creator/CreatorMap'
import EmailCapturePopup from '../components/EmailCapturePopup'
import Seo from '../components/Seo'
import { PALETTES } from '../lib/themes'

export default function CreatorPage() {
  const { handle } = useParams()
  const [creator, setCreator] = useState(undefined) // undefined=loading, null=404
  const [saves, setSaves] = useState([])
  const [activeCountry, setActiveCountry] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: c } = await supabase.from('creators')
        .select('*').eq('handle', handle.toLowerCase()).eq('status', 'active').maybeSingle()
      if (cancelled) return
      setCreator(c || null)
      if (!c) return
      const { data: s } = await supabase.from('creator_saves')
        .select('id, note, sort, businesses(id, name, category, description, city, location, photo_url, google_maps_url, instagram_handle, lat, lng, tier, countries(id, name, slug, flag_emoji))')
        .eq('creator_id', c.id).eq('hidden', false)
        .order('sort').order('created_at', { ascending: false })
      if (!cancelled) setSaves((s || []).filter((x) => x.businesses))
    }
    load()
    return () => { cancelled = true }
  }, [handle])

  const countries = useMemo(() => {
    const map = new Map()
    for (const s of saves) {
      const c = s.businesses.countries
      if (!c) continue
      map.set(c.id, { ...c, count: (map.get(c.id)?.count || 0) + 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [saves])

  useEffect(() => {
    if (!activeCountry && countries.length > 0) setActiveCountry(countries[0].id)
  }, [countries, activeCountry])

  const visible = useMemo(() => saves.filter((s) =>
    (!activeCountry || s.businesses.countries?.id === activeCountry) &&
    (!activeCategory || s.businesses.category === activeCategory)), [saves, activeCountry, activeCategory])

  const categories = useMemo(() =>
    [...new Set(saves
      .filter((s) => !activeCountry || s.businesses.countries?.id === activeCountry)
      .map((s) => s.businesses.category).filter(Boolean))], [saves, activeCountry])

  const mapSpots = useMemo(() => visible
    .filter((s) => s.businesses.lat != null)
    .map((s) => ({ id: s.id, name: s.businesses.name, lat: s.businesses.lat, lng: s.businesses.lng })), [visible])

  const onPinClick = useCallback((id) => {
    document.getElementById(`spot-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  if (creator === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><span className="text-text-dim text-sm">Loading…</span></div>
  }
  if (creator === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <h1 className="font-display text-3xl mb-2">Creator not found</h1>
          <a href="/" className="text-accent text-sm">← Back to Insider Guide</a>
        </div>
      </div>
    )
  }

  const accent = (PALETTES[creator.theme?.palette] || PALETTES.gold).accent

  return (
    <div style={themeToCssVars(creator.theme)} className="min-h-screen">
      <Seo title={`${creator.display_name} — Insider Guide`}
           description={creator.bio?.slice(0, 155)} path={`/@${creator.handle}`} />

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-4 pt-14 pb-8 text-center">
        {creator.avatar_url && (
          <img src={creator.avatar_url} alt={creator.display_name}
               className="w-24 h-24 rounded-full object-cover border-2 mx-auto mb-4"
               style={{ borderColor: accent }} />
        )}
        <h1 className="font-display text-4xl md:text-5xl text-text mb-2">{creator.display_name}</h1>
        {creator.bio && <p className="text-text-secondary text-sm max-w-xl mx-auto mb-3">{creator.bio}</p>}
        <div className="flex items-center justify-center gap-4 text-xs text-text-dim uppercase tracking-[0.12em]">
          <span>{saves.length} spots</span>
          <span>·</span>
          <span>{countries.length} countries</span>
          {creator.ig_handle && (
            <>
              <span>·</span>
              <a href={`https://instagram.com/${creator.ig_handle.replace('@', '')}`}
                 target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                @{creator.ig_handle.replace('@', '')}
              </a>
            </>
          )}
        </div>
      </header>

      {/* Country tabs */}
      <nav className="max-w-6xl mx-auto px-4 flex gap-2 overflow-x-auto pb-2 mb-4">
        {countries.map((c) => (
          <button key={c.id}
                  onClick={() => { setActiveCountry(c.id); setActiveCategory(null) }}
                  className={`shrink-0 text-xs uppercase tracking-[0.12em] px-4 py-2 rounded-full border cursor-pointer transition-colors ${
                    activeCountry === c.id
                      ? 'border-accent/40 text-accent bg-accent/8'
                      : 'border-border text-text-dim hover:text-text-secondary'}`}>
            {c.flag_emoji} {c.name} <span className="opacity-60">({c.count})</span>
          </button>
        ))}
      </nav>

      {/* Category chips + map toggle */}
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-2 flex-wrap mb-6">
        <button onClick={() => setActiveCategory(null)}
                className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer ${
                  !activeCategory ? 'border-accent/40 text-accent' : 'border-border text-text-dim'}`}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                  className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer ${
                    activeCategory === cat ? 'border-accent/40 text-accent' : 'border-border text-text-dim'}`}>
            {cat}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowMap((v) => !v)}
                className="md:hidden text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-accent/30 text-accent cursor-pointer">
          {showMap ? 'List' : 'Map'}
        </button>
      </div>

      {/* Content: list + map */}
      <div className="max-w-6xl mx-auto px-4 pb-20 grid md:grid-cols-[1fr_420px] gap-6">
        <div className={`grid sm:grid-cols-2 gap-4 auto-rows-min ${showMap ? 'hidden md:grid' : ''}`}>
          {visible.map((s, i) => (
            <div key={s.id} id={`spot-${s.id}`}>
              <BusinessCard business={s.businesses} index={i}
                            creatorNote={s.note} creatorName={creator.display_name} />
            </div>
          ))}
          {visible.length === 0 && <p className="text-text-dim text-sm col-span-full">No spots here yet.</p>}
        </div>
        <div className={`h-[420px] md:h-[calc(100vh-140px)] md:sticky md:top-6 ${showMap ? '' : 'hidden md:block'}`}>
          <CreatorMap spots={mapSpots} accent={accent} onPinClick={onPinClick} />
        </div>
      </div>

      {creator.email_capture_enabled && (
        <EmailCapturePopup
          countrySlug={null}
          source={`creator_${creator.handle}`}
          heading={`Get ${creator.display_name}'s new spots first`} />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Routes in App.jsx**

Add lazy imports following the file's existing pattern, then routes ABOVE the `/:slug` catch-all:

> **AMENDED (routing fix):** RR7 cannot param-match a fused @ prefix (`/@:handle`
> compiles to a literal — `matchPath('/@:handle','/@alex')` is `null`); creator
> pages dispatch through `/:slug` (CountryGuide country-miss → CreatorPage inline
> render; @ stripped so both `/handle` and `/@handle` resolve). There is NO
> dedicated creator route — only the studio routes below are added:

```jsx
<Route path="/studio/login" element={<StudioLogin />} />
<Route path="/studio" element={<CreatorRoute><StudioLayout /></CreatorRoute>}>
  <Route index element={<MySpots />} />
  <Route path="import" element={<StudioImport />} />
  <Route path="settings" element={<StudioSettings />} />
</Route>
```

- [ ] **Step 7: CountryGuide slug fallback**

In `CountryGuide.jsx`, locate the branch where the country lookup returns no row (the current 404/not-found path). Before rendering not-found, check creators (strip any leading `@`, lowercase) and on a hit set a `creatorHandle` state var; in render, before the not-found UI, `if (creatorHandle) return <CreatorPage handle={creatorHandle} />` (eager import — both pages are eager). Published-country paths are untouched: the creator query only fires after a country miss.

- [ ] **Step 8: Build + lint + commit**

```bash
npm run lint && npm run build
git add -A
git commit -m "feat(public): /@handle creator page with themed cards, MapLibre map, email capture"
```

---

### Task 10: Admin creators page + invite-creator edge function

**Files:**
- Create: `insiderguide/supabase/functions/invite-creator/index.ts`
- Create: `insiderguide/supabase/config.toml`
- Create: `insiderguide/src/pages/admin/Creators.jsx`
- Modify: `insiderguide/src/App.jsx` (admin route)

- [ ] **Step 1: Edge function**

```ts
// insiderguide/supabase/functions/invite-creator/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Caller must be an admin — check with the CALLER's JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: isAdmin } = await asCaller.rpc('is_admin')
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors })

    const { action, email, handle, display_name, creator_id, status } = await req.json()
    const admin = createClient(url, service)

    if (action === 'invite') {
      if (!email || !handle) throw new Error('email and handle required')
      const { data: user, error: uerr } = await admin.auth.admin.createUser({
        email, email_confirm: true,
      })
      if (uerr && !uerr.message.includes('already been registered')) throw uerr
      let uid = user?.user?.id
      if (!uid) {
        // user existed — look them up
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        uid = list?.users.find((u) => u.email === email)?.id
      }
      if (!uid) throw new Error('could not resolve user id')
      const { error: cerr } = await admin.from('creators').insert({
        id: uid, handle: handle.toLowerCase(), display_name: display_name || handle, status: 'active',
      })
      if (cerr) throw cerr
      return new Response(JSON.stringify({ ok: true, creator_id: uid }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (action === 'set_status') {
      if (!creator_id || !['active', 'paused'].includes(status)) throw new Error('bad args')
      const { error } = await admin.from('creators').update({ status }).eq('id', creator_id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    throw new Error('unknown action')
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
```

- [ ] **Step 2: config.toml (verify_jwt map — new file)**

```toml
# insiderguide/supabase/config.toml
project_id = "qbzmsvfphpfgnlztskma"

[functions.invite-creator]
verify_jwt = true

[functions.enrich-places]
verify_jwt = false   # called by pg_cron with x-enrich-secret header
```

- [ ] **Step 3: Deploy** via `mcp__claude_ai_Supabase__deploy_edge_function` (name `invite-creator`). Expected: deployed.

- [ ] **Step 4: Admin Creators page**

```jsx
// insiderguide/src/pages/admin/Creators.jsx
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminCreators() {
  const [creators, setCreators] = useState([])
  const [form, setForm] = useState({ email: '', handle: '', display_name: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('creators').select('*').order('created_at', { ascending: false })
    setCreators(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function call(body) {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('invite-creator', { body })
    setBusy(false)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return false }
    load()
    return true
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (await call({ action: 'invite', ...form })) {
      setMsg(`Invited ${form.email} as @${form.handle}. They sign in at /studio/login.`)
      setForm({ email: '', handle: '', display_name: '' })
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="font-heading text-xl text-white mb-6">Creators</h1>

      <form onSubmit={handleInvite} className="bg-bg-card border border-border rounded-xl p-5 mb-8 grid md:grid-cols-4 gap-3">
        <input required type="email" placeholder="Email" value={form.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input required placeholder="handle" value={form.handle} pattern="[a-z0-9_.]{3,30}"
               onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input placeholder="Display name" value={form.display_name}
               onChange={(e) => setForm({ ...form, display_name: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <button disabled={busy} className="bg-gold text-bg text-sm uppercase tracking-wider rounded-sm cursor-pointer disabled:opacity-50">
          {busy ? '…' : 'Invite'}
        </button>
      </form>
      {msg && <p className="text-xs text-gold mb-4">{msg}</p>}

      <div className="flex flex-col gap-2">
        {creators.map((c) => (
          <div key={c.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <a href={`/@${c.handle}`} target="_blank" rel="noreferrer" className="text-sm text-white hover:text-gold">@{c.handle}</a>
              <span className="text-xs text-text-dim ml-3">{c.display_name}</span>
              <span className={`text-[10px] uppercase tracking-wider ml-3 ${c.status === 'active' ? 'text-gold' : 'text-red-400/70'}`}>{c.status}</span>
            </div>
            <button onClick={() => call({ action: 'set_status', creator_id: c.id, status: c.status === 'active' ? 'paused' : 'active' })}
                    className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-white cursor-pointer">
              {c.status === 'active' ? 'Pause' : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Route** — in `App.jsx` add
`<Route path="/admin/creators" element={<AdminRoute><AdminCreators /></AdminRoute>} />`
(place with the other admin routes, above `/admin/:slug`).

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add -A
git commit -m "feat(admin): creators management + invite-creator edge function"
```

---

### Task 11: Enrichment — edge function + pg_cron

**Files:**
- Create: `insiderguide/supabase/functions/enrich-places/index.ts`
- Create: `insiderguide/supabase/migrations/20260713122000_enrich_cron.sql`

- [ ] **Step 1: Edge function**

```ts
// insiderguide/supabase/functions/enrich-places/index.ts
// Drains businesses.enrich_status='pending_enrich' via Outscraper.
// Called by pg_cron every 5 min with x-enrich-secret. Batch of 8 keeps each
// invocation well under the edge-function time limit.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CATEGORY_MAP: Record<string, string> = {
  restaurant: 'eat', food: 'eat', meal: 'eat',
  cafe: 'cafe', coffee: 'cafe', bakery: 'cafe',
  bar: 'drink', night_club: 'drink', pub: 'drink',
  hotel: 'stay', lodging: 'stay', hostel: 'stay', resort: 'stay',
  museum: 'do', tourist_attraction: 'do', amusement: 'do', tour: 'do',
  park: 'explore', natural_feature: 'explore', beach: 'explore', hiking: 'explore',
  spa: 'wellness', gym: 'wellness', yoga: 'wellness',
  store: 'essentials', supermarket: 'essentials', pharmacy: 'essentials',
}

function mapCategory(type: string | undefined): string | null {
  if (!type) return null
  const t = type.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_MAP)) if (t.includes(k)) return v
  return 'explore'
}

Deno.serve(async (req) => {
  if (req.headers.get('x-enrich-secret') !== Deno.env.get('ENRICH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('OUTSCRAPER_API_KEY')!

  const { data: pending } = await admin
    .from('businesses')
    .select('id, name, google_maps_url, google_cid, google_place_id, countries(name)')
    .eq('enrich_status', 'pending_enrich')
    .lt('enrich_attempts', 3)
    .order('created_at')
    .limit(8)

  let done = 0, failed = 0
  for (const b of pending ?? []) {
    try {
      const query = b.google_maps_url || `${b.name}, ${(b as any).countries?.name ?? ''}`
      const res = await fetch(
        `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=1&async=false`,
        { headers: { 'X-API-KEY': apiKey } },
      )
      if (!res.ok) throw new Error(`outscraper ${res.status}`)
      const json = await res.json()
      const place = json?.data?.[0]?.[0]
      if (!place?.name) throw new Error('no result')

      await admin.from('businesses').update({
        google_place_id: place.place_id ?? b.google_place_id,
        google_cid: place.google_id?.split(':')[1]
          ? BigInt(place.google_id.split(':')[1]).toString()
          : b.google_cid,
        lat: place.latitude ?? null,
        lng: place.longitude ?? null,
        location: place.full_address ?? null,
        city: place.city ?? null,
        website: place.site ?? null,
        photo_url: place.photo ?? null,
        category: mapCategory(place.type ?? place.category),
        enrich_status: 'enriched',
      }).eq('id', b.id)
      done++
    } catch (_e) {
      const { data: cur } = await admin.from('businesses').select('enrich_attempts').eq('id', b.id).single()
      const attempts = (cur?.enrich_attempts ?? 0) + 1
      await admin.from('businesses').update({
        enrich_attempts: attempts,
        enrich_status: attempts >= 3 ? 'enrich_failed' : 'pending_enrich',
      }).eq('id', b.id)
      failed++
    }
  }
  return new Response(JSON.stringify({ processed: done, failed, remaining_batch: (pending?.length ?? 0) }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Set secrets**

Get `OUTSCRAPER_API_KEY` from the vault (`koding/.secrets/api-keys.md`). Generate `ENRICH_SECRET`: `openssl rand -hex 24`. Set both:

```bash
# via supabase CLI if linked, otherwise the dashboard / MCP:
supabase secrets set OUTSCRAPER_API_KEY=... ENRICH_SECRET=... --project-ref qbzmsvfphpfgnlztskma
```

- [ ] **Step 3: Deploy** via MCP `deploy_edge_function` (name `enrich-places`). Then confirm `verify_jwt=false` took effect: `curl -s -X POST https://qbzmsvfphpfgnlztskma.supabase.co/functions/v1/enrich-places -H "x-enrich-secret: wrong"` → expected `403 forbidden` (NOT a 401 JWT error).

- [ ] **Step 4: pg_cron migration**

Follows the existing `private.sync_country_automation()` pattern — secret lives in a `private` schema function, never PostgREST-exposed.

```sql
-- insiderguide/supabase/migrations/20260713122000_enrich_cron.sql
create schema if not exists private;

create or replace function private.enrich_places_ping()
returns void language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://qbzmsvfphpfgnlztskma.supabase.co/functions/v1/enrich-places',
    headers := jsonb_build_object('x-enrich-secret', '<ENRICH_SECRET — paste the generated value>'),
    body := '{}'::jsonb);
end $$;

revoke all on function private.enrich_places_ping() from public, anon, authenticated;

select cron.schedule('enrich-places-drain', '*/5 * * * *', 'select private.enrich_places_ping()');
```

Apply via MCP `apply_migration` (name `enrich_cron`). **Commit the file with the secret placeholder, not the real value.**

- [ ] **Step 5: End-to-end enrichment test**

Insert a pending stub via `execute_sql` (any real place, e.g. name `Museo del Oro` with Colombia's country_id), wait ≤5 min or call the fn directly with the right secret, then:

```sql
select name, enrich_status, lat, lng, category, photo_url is not null as has_photo
from businesses where source = 'creator_import' order by created_at desc limit 5;
```

Expected: `enrich_status='enriched'`, coordinates + category populated. Delete the test row afterwards.

- [ ] **Step 6: Commit**

```bash
git add insiderguide/supabase/functions/enrich-places/index.ts insiderguide/supabase/migrations/20260713122000_enrich_cron.sql insiderguide/supabase/config.toml
git commit -m "feat(enrich): Outscraper enrichment edge fn drained by pg_cron"
```

---

### Task 12: E2E verification (real browser) + RLS audit

**Files:** none created (verification task) — fixture: `insiderguide/src/lib/__fixtures__/takeout-sample.csv`

- [ ] **Step 1: Create fixture CSV**

```csv
Title,Note,URL,Comment
"El Chato","tasting menu worth every peso","https://maps.google.com/?cid=4581839485683318141",
"Salvo Patria","cozy brunch in Chapinero","https://www.google.com/maps/place/Salvo+Patria/@4.6486,-74.0602,17z",
"Made-Up Test Spot XYZ","this will be a new stub","https://maps.google.com/?cid=999999999999999999",
```

- [ ] **Step 2: Full loop with browser automation** (Playwright MCP or chrome-devtools MCP, headed):

1. Log in at `/admin/login` (admin creds from vault) → `/admin/creators` → invite a test creator with an email you control (e.g. `work+igtest@specchio.xyz`, handle `testcreator`).
2. Open `/studio/login` → request link for that email → complete magic-link login (fetch link from inbox, or use `admin.auth.admin.generateLink` via a one-off script if inbox access is awkward).
3. Run the wizard with the fixture CSV (country: Colombia). Expected: preview shows a mix of matched/new (El Chato likely matches the existing catalog; Test Spot XYZ is new), commit succeeds, My Spots lists 3 rows.
4. Open `/@testcreator` in an **incognito/anon** context. Expected: hero, country tab `🇨🇴 Colombia (3)`, 3 cards with personal notes in italics, map renders with pins for enriched spots.
5. Edit a note in My Spots → reload public page → note updated.
6. Hide a spot → public page shows 2.
7. Settings: switch palette to `emerald`, font pair to `modern`, save → public page accent + display font change.
8. Enable email capture → public page popup fires after 12s → submit test email → verify row in `newsletter_subscribers` with `source='creator_testcreator'`.

- [ ] **Step 3: RLS audit via `execute_sql`**

```sql
-- Creator A cannot touch creator B's saves (simulate with two seeded creators):
-- as creator A jwt: update creator_saves set note='hacked' where creator_id = '<B-id>';
-- expected: 0 rows updated.
-- Anon cannot see paused creators:
-- set status='paused' on testcreator → /@testcreator returns 404 view; select as anon returns 0 rows.
-- Authenticated non-admin, non-creator cannot read newsletter_subscribers (expected 0 rows).
-- CRM spot-check: as testcreator jwt, select count(*) from contacts → expected: permission error or 0 rows.
```

All four must hold. Reactivate testcreator after the paused check.

- [ ] **Step 4: Clean up test data** — remove the fixture-created "Made-Up Test Spot XYZ" stub, the test email subscriber row. Keep testcreator (useful for future smoke tests).

- [ ] **Step 5: Commit fixture**

```bash
git add insiderguide/src/lib/__fixtures__/takeout-sample.csv
git commit -m "test: takeout fixture CSV for e2e import smoke"
```

---

### Task 13: Seed real creators + apply page + ship

**Files:**
- Modify: `insiderguide/scripts/build-seo.mjs` (creator routes in sitemap, graceful skip)
- Modify: `insiderguide/src/pages/Home.jsx` (creators strip — optional, small)

- [ ] **Step 1: Sitemap** — in `build-seo.mjs`, after existing route generation, fetch active creators IF env vars are present and append `/@<handle>` URLs; wrap in try/catch so a build without env still succeeds:

```js
try {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    const res = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/creators?status=eq.active&select=handle`,
      { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY } })
    const creators = await res.json()
    for (const c of creators) urls.push(`/@${c.handle}`)   // adapt to the file's actual accumulator
  }
} catch { /* sitemap degrades gracefully */ }
```

(Adapt variable names to the file's actual structure — read it first.)

- [ ] **Step 2: Home strip** — add a small "Browse by creator" section on `Home.jsx` listing active creators (avatar + handle, links to `/@handle`). Query: `supabase.from('creators').select('handle,display_name,avatar_url').eq('status','active')`. Match the country-cards visual style. Skip if it fights the existing hero layout — judgment call, note the decision in the PR.

- [ ] **Step 3: Seed Alex** — via admin UI: invite with Alex's creator email + handle `alexspexx`, then run one real Takeout import (Alex's actual saved lists) for at least one country. This is the dogfood test.

- [ ] **Step 4: Final build + lint + tests**

```bash
cd ~/koding/insider-guide/insiderguide
npm run lint && npm test && npm run build
```
Expected: all green.

- [ ] **Step 5: Merge + deploy**

```bash
cd ~/koding/insider-guide
git checkout main && git merge --no-ff feat/creator-platform-v1 -m "feat: creator platform V1 — /@handle pages, studio, Takeout import, enrichment"
git push origin main   # triggers .github/workflows/deploy.yml → VPS docker rebuild
```

Watch the Actions run. After deploy: hit `https://insiderguide.co/@alexspexx` and `/studio/login` in production. Known infra caveat: CI deploy previously broke because the GitHub runner IP got banned by fail2ban on the VPS — if the SSH step times out, check fail2ban before assuming code issues.

- [ ] **Step 6: Update memory** — write session state to auto-memory (`project_insiderguide_creator_platform_v1.md`): what shipped, testcreator creds, ENRICH_SECRET location, next cycle = subsystems C/D (auto-outreach) per spec.

---

## Self-review notes (already fixed inline)

- Spec's "fuzzy matches individually confirmable" → implemented as the Yes/No toggle in wizard step 3; rejected fuzzies become new stubs (client strips `match_business_id`).
- Spec's paused-creator behavior → CreatorRoute paused screen + anon RLS hides page (404 view).
- Spec's `enrich_failed` retry button → deferred detail: My Spots shows "enriching…" chip only; a retry button requires an RPC — YAGNI for V1, failures visible to admin via SQL. Deviation from spec noted deliberately.
- `newsletter_subscribers` tightening is beyond spec scope but required before adding non-admin authenticated users; without it creators could read the whole subscriber list.
- Types consistent: `preview_import(p_country_id uuid, p_rows jsonb)` / `commit_import(p_country_id, p_filename, p_list_name, p_rows)` match wizard calls; `themeToCssVars` used by both Settings preview and CreatorPage.
