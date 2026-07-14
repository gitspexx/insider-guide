# InsiderGuide Creator Network V2 Implementation Plan — Earnings, Outreach, Newsletter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creators earn a frozen 30% revenue share on featured/partner deals closed on their imported spots; their imports get flagged for VA-reviewed outreach; their captured leads are visible in a new Studio "Earnings" tab; and a paid newsletter license (Sendy, manual ops this cycle) is requested from the Studio and granted by admin.

**Architecture:** Extends the shipped `insiderguide` SPA (React 19 + Vite JSX + Tailwind 4) and shared Supabase project `qbzmsvfphpfgnlztskma`. New tables `creator_deals`, `deal_prices`, `creator_requests`; new `creators` columns `newsletter_license`, `dm_automations_enabled`; a definer-style `my_leads` view over `newsletter_subscribers`; two DB triggers (license-transition guard + tier_paid deal attribution); `commit_import` gains outreach tagging (v3); admin writes go through the `invite-creator` edge fn (extended with creator-ops actions) using the caller-JWT admin gate + service-role write pattern it already uses. Creator self-writes stay confined to what column grants + one RPC (`request_newsletter_license`) allow.

**Tech Stack:** React 19, react-router-dom 7, Tailwind 4 (`@theme` CSS vars), Supabase (auth/postgres/edge functions), Deno edge functions, existing BCAX Stripe checkout proxy (`init-checkout` → `bcax-charge`), `bcax-callback`.

**Spec:** `docs/superpowers/specs/2026-07-14-creator-network-v2-design.md`
**Builds on:** `docs/superpowers/plans/2026-07-13-creator-platform-v1.md` (shipped).

---

## Ground rules for the executor

- Work on branch `feat/creator-network-v2`. **Pushing `main` deploys to production** (`.github/workflows/deploy.yml`). Merge to main only in the final task (Task 9).
- Supabase project id: `qbzmsvfphpfgnlztskma`. It is **shared with spexx-crm**. NEVER modify `is_admin()`; NEVER loosen policies on `contacts`, `campaigns`, `campaign_enrollments`, `campaign_messages`, `email_accounts`, `newsletter_subscribers`, or any CRM table. `newsletter_subscribers` stays admin-only at the base-table level — creators reach leads ONLY through the definer-style `my_leads` view.
- Migrations: save SQL under `insiderguide/supabase/migrations/` AND apply with the Supabase MCP `apply_migration` tool (there is no local supabase stack). Read-only probes use `execute_sql`.
- App lives in `insiderguide/` subdir. All npm commands: `cd insiderguide && npm run ...`.
- Design tokens: reuse existing utility classes seen in `MySpots.jsx` / `Settings.jsx` / `Creators.jsx` (`bg-bg-card`, `border-border`, `text-accent`, `text-text-dim`, `font-display`, `text-gold`/`bg-gold` on admin pages). Dark, warm, editorial. **No emoji icons** — inline SVG only.
- House lint invariant: the `react-hooks/set-state-in-effect` rule rejects a `useCallback` loader that `setState`s synchronously when called from an effect. Follow the shipped pattern (see `MySpots.jsx`, `Creators.jsx`): a module-level `async function fetchX()` that RETURNS data, an effect with a `cancelled` flag that calls it and setStates only when not cancelled, and a separate `reload()` for event handlers. Do NOT introduce a `useCallback` loader used by an effect.
- Creators get NO base-table `businesses` reads — details come only through `my_saved_businesses` (studio) / `creator_saved_businesses` (public) definer-style views. Do NOT add `security_invoker=on` to any of these views (it would re-hide unpublished stubs).
- `creators.handle`/`status`/`newsletter_license='active'`, and all `creator_deals` writes, mutate ONLY via the service-role edge fn. Column grants for the `authenticated` role deliberately EXCLUDE `handle`/`status`/`show_country_catalog`; V2 adds `dm_automations_enabled` to the grant (safe self-toggle) but NOT `newsletter_license`.
- Secrets (service keys, BCAX keys) are already set on the project. No new secrets are required this cycle.

---

## Verified schema + code facts (recon 2026-07-14)

**Prices (source of truth = `insiderguide/src/pages/Checkout.jsx` `TIERS`):**
- `featured` → `amount_cents = 20000` ($200), `price_lookup_key = insiderguide_featured`.
- `partner` → `amount_cents = 50000` ($500), `price_lookup_key = insiderguide_partner`.
These seed `deal_prices`. `bcax-callback` maps lookup key → tier via `LOOKUP_TO_TIER`.

**`businesses` (relevant columns):** `id uuid`, `country_id uuid NOT NULL`, `name`, `tier text default 'listed'`, `tier_paid boolean default false`, `paid_at timestamptz`, `paid_pending_tier text`, `published boolean default false`, `outreach_status text default 'to_contact'` (**NOT nullable-defaulted to null — default is `'to_contact'`**), `notes text default ''`, `source text`, `enrich_status`, `created_at`. Partner/Checkout signup rows are inserted with `outreach_status='to_contact'` already; `commit_import` stubs insert WITHOUT setting `outreach_status`, so stubs also get the `'to_contact'` default.

**`creators` (current columns):** `id uuid PK`, `handle`, `display_name`, `bio`, `avatar_url`, `ig_handle`, `theme jsonb`, `email_capture_enabled bool`, `status text default 'invited'`, `show_country_catalog bool default false`, `created_at`. V2 adds `newsletter_license`, `dm_automations_enabled`.
- **`authenticated` UPDATE column grants (verified):** `avatar_url, bio, display_name, email_capture_enabled, ig_handle, theme`. NOT granted: `handle, status, show_country_catalog, created_at, id`. V2 will `grant update (dm_automations_enabled)` and will NOT grant `newsletter_license`.
- RLS on `creators`: `anon_read_active_creators` (status='active'), `authed_read_creators` (status='active' OR id=auth.uid() OR is_admin()), `creator_update_own` (id=auth.uid()), `admin_all_creators` (is_admin()).

**`creator_saves`:** `id, creator_id, business_id, note, tags text[], sort int, hidden bool, source, created_at`, unique(creator_id,business_id). RLS: creator read/update/delete own (with active-status check), anon/authed read visible, admin all.

**`newsletter_subscribers`:** `id, email, country_slug, source text default 'web', created_at`. RLS: `anon_insert_newsletter` (INSERT true), `admin_full_access` (is_admin() ALL). No non-admin SELECT path exists — `my_leads` view (definer) is the ONLY creator read path. V1 tags rows `source = 'creator_<handle>'`.

**Views (definer-style, verified — no security_invoker):** `my_saved_businesses` (`WHERE creator_saves.creator_id = auth.uid()`), `creator_saved_businesses` (public/active). Both select a fixed column allowlist off `businesses`.

**`commit_import` (current def, v2 — hardened):** `SECURITY DEFINER SET search_path=public,extensions`. Signature `commit_import(p_country_id uuid, p_filename text, p_list_name text, p_rows jsonb)`. Checks active creator; `perform set_limit(0.55)`; validates array; caps 2000 rows; inserts a `creator_imports` row; per row: re-verifies claimed `match_business_id` server-side (rejects spoofed), else inserts a stub `businesses` row (`tier='listed', published=false, enrich_status='pending_enrich', source='creator_import'`) with unique_violation→reuse; upserts `creator_saves`; returns counts. **V2 recreates this with create-or-replace, keeping ALL of the above, adding outreach tagging.**

**Outreach engine — CRITICAL FINDING (deviation, see below):**
- The tables the IG admin UI (`OutreachDashboard.jsx`, `CampaignDetail.jsx`, `CampaignCreateModal.jsx`) query — `outreach_campaigns`, `outreach_enrollments`, `outreach_messages` — **DO NOT EXIST in this database.** That IG admin Outreach UI is currently non-functional against this project (pre-existing, not introduced by V2).
- The only real campaign engine present is the spexx-crm one: `campaigns`, `campaign_enrollments`, `campaign_messages`, `campaign_templates`. These are keyed by **`contact_id` (FK → `contacts`)** and **`project_id` (FK → `projects`)** — CRM tables. `campaign_enrollments`/`campaign_messages` have NO `business_id`. `campaign_templates` present is the **ads** template table (columns `project, objective, targeting, placements, budget_suggestion, copy_template, cta`) — it is NOT an outreach email-template table, and its policy `Authenticated users can manage templates` is `auth.role()='authenticated'` (do not touch).
- **Consequence:** there is no working, business-keyed outreach engine to "enroll into," and wiring IG businesses into the CRM contact-based engine would require a businesses→contacts bridge and CRM writes — out of scope and a policy risk. The realistic, invariant-safe surface that reuses what actually works is `businesses.outreach_status='to_contact'` + a `notes` marker, which is exactly the column `CampaignCreateModal` already filters on. V2 tags there and adds a small read-only admin "Creator Imports" segment; no CRM tables touched. (See "Spec deviations" below.)

**Payment / ref flow:**
- `/partner` Tiers → `navigate('/checkout?tier=featured|partner')`. `Checkout.jsx` collects email, PRE-CREATES a `businesses` row (`paid_pending_tier=tier.key`, `outreach_status='to_contact'`, notes `[partner-signup-paid] ...`), then calls `CheckoutForm` with `customer_external_id = pendingBusinessId`, `price_lookup_key = insiderguide_<tier>`. On success, `bcax-callback` flips that row: `tier`, `tier_paid=true`, `published=true`, `paid_pending_tier=null`, `paid_at=now()`.
- There is NO existing `?ref=creator_<handle>` mechanism. The clean insertion point (Task 7) is `Partner.jsx` / `Checkout.jsx`: read `?ref=` from the URL and stamp it into the pre-created `businesses.notes` (`[ref creator_<handle>]`). `bcax-callback` needs NO change — attribution is resolved by the tier_paid trigger reading `creator_saves` + the notes marker. This is feasible with a small frontend-only change.

**Generated column arithmetic (verified):** `select (20000 * 30 / 100)::int` → `6000`; `(50000*30/100)::int` → `15000`. Postgres integer division truncates toward zero (fine for whole-cent shares here). `generated always as (amount_cents * rev_share_pct / 100) stored` is valid for `int` columns and used directly (no rounding workaround needed). Documented in Task 1.

**`invite-creator` edge fn (current):** admin-JWT gate (`asCaller.rpc('is_admin')`), then service-role `admin` client. Actions `invite`, `set_status`. V2 extends this same file with `record_deal`, `update_deal`, `set_license`, `add_request`, `resolve_attribution` (chosen over a new fn: same admin gate, same service client, one deploy — see Task 3 rationale).

**App routes (`App.jsx`):** studio routes nested under `/studio` (index=MySpots, `import`, `settings`); admin `/admin/creators` exists; admin outreach routes exist but point at the dead UI. All studio/admin pages are `lazy()`.

---

### Task 1: Migration — deals, prices, requests, creators columns, my_leads view, RLS, guard + attribution triggers

**Files:**
- Create: `insiderguide/supabase/migrations/20260714120000_creator_network_v2.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Creator Network V2: earnings (creator_deals + deal_prices), reel requests
-- (creator_requests), creators.newsletter_license + dm_automations_enabled,
-- my_leads definer view, RLS, license-transition guard trigger, and tier_paid
-- deal-attribution trigger. Additive only — no existing policy is dropped.

-- ── deal_prices (config, seeded from live Checkout.jsx TIERS) ──────
create table if not exists public.deal_prices (
  tier text primary key check (tier in ('featured','partner')),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  updated_at timestamptz not null default now()
);
insert into public.deal_prices (tier, amount_cents) values
  ('featured', 20000),   -- $200, matches Checkout.jsx TIERS.featured.amount_cents
  ('partner',  50000)    -- $500, matches Checkout.jsx TIERS.partner.amount_cents
on conflict (tier) do nothing;

alter table public.deal_prices enable row level security;
-- Prices are public (they appear on /partner). Public read, admin write.
create policy deal_prices_public_read on public.deal_prices
  for select using (true);
create policy deal_prices_admin_write on public.deal_prices
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── creator_deals ─────────────────────────────────────────────────
create table if not exists public.creator_deals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  tier text not null check (tier in ('featured','partner')),
  amount_cents int not null default 0 check (amount_cents >= 0),
  currency text not null default 'usd',
  rev_share_pct int not null default 30 check (rev_share_pct between 0 and 100),
  -- Frozen per-deal share. Postgres int division truncates toward zero;
  -- for whole-cent amounts (20000/50000 * 30/100) this is exact (6000/15000).
  creator_share_cents int generated always as (amount_cents * rev_share_pct / 100) stored,
  status text not null default 'confirmed'
    check (status in ('pending_attribution','confirmed','paid_out')),
  source text not null default 'manual'
    check (source in ('outreach','inbound','manual')),
  notes text not null default '',
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_creator_deals_creator on public.creator_deals (creator_id);
create index if not exists idx_creator_deals_business on public.creator_deals (business_id);
create index if not exists idx_creator_deals_status on public.creator_deals (status);

alter table public.creator_deals enable row level security;
-- Creator SELECT own; admin ALL; NO creator writes (writes go via edge fn/service role,
-- which bypasses RLS). No INSERT/UPDATE/DELETE policy for authenticated by design.
create policy creator_deals_select_own on public.creator_deals
  for select to authenticated
  using (creator_id = auth.uid() or is_admin());

-- ── creator_requests (reel collabs etc.) ──────────────────────────
create table if not exists public.creator_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null default 'reel' check (type in ('reel')),
  status text not null default 'open' check (status in ('open','accepted','declined','done')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_creator_requests_creator on public.creator_requests (creator_id);

alter table public.creator_requests enable row level security;
create policy creator_requests_select_own on public.creator_requests
  for select to authenticated
  using (creator_id = auth.uid() or is_admin());
-- Creator may UPDATE own row's status only (column grant restricts to `status`).
create policy creator_requests_update_own on public.creator_requests
  for update to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());
create policy creator_requests_admin_all on public.creator_requests
  for all to authenticated using (is_admin()) with check (is_admin());

-- Column-level: creator's UPDATE is limited to `status`. Revoke the table-wide
-- UPDATE the authenticated role would otherwise get, then grant only `status`.
revoke update on public.creator_requests from authenticated;
grant update (status) on public.creator_requests to authenticated;

-- ── creators: new columns ─────────────────────────────────────────
alter table public.creators
  add column if not exists newsletter_license text not null default 'none'
    check (newsletter_license in ('none','requested','active')),
  add column if not exists dm_automations_enabled boolean not null default false;

-- Creator may self-toggle dm_automations_enabled (informational). newsletter_license
-- is INTENTIONALLY not granted — self-activation is blocked (guard trigger below +
-- absence of column grant). 'none'->'requested' happens via the RPC in Step 2b.
grant update (dm_automations_enabled) on public.creators to authenticated;

-- ── my_leads view (definer-style, like V1 views) ──────────────────
-- Creators cannot read newsletter_subscribers (admin-only base table). This view
-- runs with the view owner's rights (postgres/definer) and filters to the caller's
-- own creator handle, so a creator sees ONLY their own captured leads.
create or replace view public.my_leads as
  select ns.email, ns.country_slug, ns.created_at
  from public.newsletter_subscribers ns
  join public.creators c on c.id = auth.uid()
  where ns.source = 'creator_' || c.handle;

revoke all on public.my_leads from anon;
grant select on public.my_leads to authenticated;

-- ── License-transition guard trigger ──────────────────────────────
-- Belt-and-suspenders: even though authenticated lacks a column grant on
-- newsletter_license, this trigger blocks ANY non-service-role attempt to set
-- 'active'. Service role (edge fn) sets a GUC to bypass. Allowed authenticated
-- transitions: none->requested only (used by the RPC below). Any other change
-- to newsletter_license by a non-service caller raises.
create or replace function public.guard_newsletter_license()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bypass text := current_setting('app.license_admin', true);
begin
  if new.newsletter_license is distinct from old.newsletter_license then
    if coalesce(v_bypass,'') = 'on' then
      return new;                              -- service-role edge fn path
    end if;
    if old.newsletter_license = 'none' and new.newsletter_license = 'requested' then
      return new;                              -- creator self-request path (RPC)
    end if;
    raise exception 'newsletter_license transition % -> % not permitted for this role',
      old.newsletter_license, new.newsletter_license;
  end if;
  return new;
end $$;

create trigger trg_guard_newsletter_license
  before update of newsletter_license on public.creators
  for each row execute function public.guard_newsletter_license();

-- ── Deal attribution trigger on businesses ────────────────────────
-- Fires when a business becomes tier-paid (tier_paid flips true, or paid_at newly
-- set) with tier in (featured,partner). Looks at creator_saves for that business:
--   0 saving creators  -> no deal (normal non-creator sale)
--   1 saving creator   -> one confirmed 'outreach' deal, amount from deal_prices
--   >1 saving creators  -> one pending_attribution row per creator, amount 0
-- Idempotent: skips if any creator_deals row already exists for the business.
create or replace function public.attribute_creator_deal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_became_paid boolean;
  v_price int;
  v_savers uuid[];
begin
  v_became_paid :=
    (coalesce(new.tier_paid,false) = true and coalesce(old.tier_paid,false) = false)
    or (new.paid_at is not null and old.paid_at is null);

  if not v_became_paid then return new; end if;
  if new.tier not in ('featured','partner') then return new; end if;
  if exists (select 1 from creator_deals d where d.business_id = new.id) then
    return new;                                -- already attributed
  end if;

  select array_agg(cs.creator_id)
    into v_savers
  from creator_saves cs
  join creators c on c.id = cs.creator_id
  where cs.business_id = new.id and c.status <> 'paused';

  if v_savers is null or array_length(v_savers,1) is null then
    return new;                                -- no creator saved it → normal sale
  end if;

  select amount_cents into v_price from deal_prices where tier = new.tier;
  v_price := coalesce(v_price, 0);

  if array_length(v_savers,1) = 1 then
    insert into creator_deals (creator_id, business_id, tier, amount_cents,
                               status, source, notes)
    values (v_savers[1], new.id, new.tier, v_price, 'confirmed', 'outreach',
            '[auto] single-saver attribution');
  else
    insert into creator_deals (creator_id, business_id, tier, amount_cents,
                               status, source, notes)
    select s, new.id, new.tier, 0, 'pending_attribution', 'outreach',
           '[auto] multi-saver — admin must resolve'
    from unnest(v_savers) as s;
  end if;

  return new;
end $$;

create trigger trg_attribute_creator_deal
  after update of tier_paid, paid_at on public.businesses
  for each row execute function public.attribute_creator_deal();
```

- [ ] **Step 2: Add the license-request RPC** — append to the same migration file:

```sql
-- ── request_newsletter_license RPC ────────────────────────────────
-- The ONLY authenticated path that changes newsletter_license, and only
-- 'none'->'requested' for the caller's own row. SECURITY DEFINER so it runs
-- regardless of the (absent) column grant; the guard trigger also permits this
-- exact transition. Cannot be used to self-activate.
create or replace function public.request_newsletter_license()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  select newsletter_license into v_current
  from creators where id = auth.uid() and status = 'active';
  if not found then
    raise exception 'not an active creator';
  end if;
  if v_current = 'none' then
    update creators set newsletter_license = 'requested' where id = auth.uid();
    return 'requested';
  end if;
  return v_current;                            -- already requested/active → no-op
end $$;

revoke all on function public.request_newsletter_license() from public, anon;
grant execute on function public.request_newsletter_license() to authenticated;
```

- [ ] **Step 3: Apply via MCP** — `mcp__claude_ai_Supabase__apply_migration`, `project_id: qbzmsvfphpfgnlztskma`, name `creator_network_v2`, SQL = the full file. Expected: success, no errors.

- [ ] **Step 4: Verify tables/columns/view/triggers exist** (via `execute_sql`):

```sql
select
  (select count(*) from public.deal_prices) as prices,          -- expect 2
  (select amount_cents from public.deal_prices where tier='featured') as featured_cents, -- 20000
  (select amount_cents from public.deal_prices where tier='partner')  as partner_cents,  -- 50000
  (select count(*) from information_schema.columns
     where table_name='creators' and column_name in ('newsletter_license','dm_automations_enabled')) as new_cols, -- 2
  (select count(*) from pg_views where schemaname='public' and viewname='my_leads') as leads_view, -- 1
  (select count(*) from pg_trigger where tgname in ('trg_guard_newsletter_license','trg_attribute_creator_deal')) as triggers; -- 2
```

Expected: `prices=2, featured_cents=20000, partner_cents=50000, new_cols=2, leads_view=1, triggers=2`.

- [ ] **Step 5: Verify the generated column + guard trigger with a seeded round-trip:**

```sql
-- generated share is correct
insert into public.creator_deals (creator_id, business_id, tier, amount_cents)
select c.id, b.id, 'featured', 20000
from public.creators c, public.businesses b
where c.status='active' order by c.created_at, b.created_at limit 1
returning creator_share_cents;                 -- expect 6000
-- clean up the probe row
delete from public.creator_deals where notes='' and amount_cents=20000 and tier='featured'
  and created_at > now() - interval '2 minutes';
```

(If there is no active creator yet, skip the insert and note it — Task 8 seeds testcreator.)

- [ ] **Step 6: Commit**

```bash
cd ~/koding/insider-guide
git checkout -b feat/creator-network-v2
git add insiderguide/supabase/migrations/20260714120000_creator_network_v2.sql
git commit -m "feat(db): creator network v2 — deals, prices, requests, leads view, license guard + attribution triggers"
```

---

### Task 2: Migration — `commit_import` v3 (outreach tagging)

**Files:**
- Create: `insiderguide/supabase/migrations/20260714121000_commit_import_v3.sql`

Because `businesses.outreach_status` DEFAULTs to `'to_contact'` (not null), stubs are already `to_contact`. The spec's "set to_contact when currently null/none" is preserved (idempotent) AND we additionally ensure the marker is present on every non-tier-paid business in the import (matched or new) so the VA segment (Task 6) can find them. We do NOT re-contact tier-paid businesses.

> **NOTE (spec deviation, minor):** The spec's Task 2 also asks to seed a "Creator added you" row into `campaign_templates`. Recon shows `campaign_templates` is the **ads** template table (project/objective/targeting/placements), NOT an outreach email-template table, and the real outreach engine (`campaigns`/`campaign_messages`) is contact/project-keyed CRM infra we must not touch. There is no outreach-email template table to seed. The template copy therefore lives as a constant in the admin "Creator Imports" segment (Task 6) for the VA to copy, not as a DB row. This keeps CRM tables untouched (invariant) and still gives the VA the exact pitch. See "Spec deviations."

- [ ] **Step 1: Write the migration** (full create-or-replace, preserving ALL v2 hardening — active-creator check, `set_limit(0.55)`, array validation, 2000 cap, server-side match re-verification, unique_violation reuse, counts):

```sql
-- commit_import v3: same as v2 (all hardening kept) + outreach tagging.
-- After saving each business (matched or newly created), if the business is NOT
-- tier-paid, ensure outreach_status='to_contact' (only bumped when currently
-- null/'none'/'') and append an idempotent notes marker '[creator-import @handle]'.

create or replace function public.commit_import(
  p_country_id uuid,
  p_filename text,
  p_list_name text,
  p_rows jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
  v_creator uuid;
  v_handle  text;
  v_import  uuid;
  r jsonb;
  v_bid uuid;
  v_is_new boolean;
  v_matched int := 0;
  v_created int := 0;
  v_failed  int := 0;
  v_marker  text;
begin
  select id, handle into v_creator, v_handle from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;
  v_marker := '[creator-import @' || v_handle || ']';

  perform set_limit(0.55);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
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
      v_is_new := false;

      if v_bid is not null then
        -- Re-verify the claimed match server-side; reject spoofed ids.
        perform 1 from businesses b
         where b.id = v_bid
           and b.country_id = p_country_id
           and (
                (nullif(r->>'place_id','') is not null and b.google_place_id = r->>'place_id')
             or (nullif(r->>'cid','')      is not null and b.google_cid      = r->>'cid')
             or similarity(lower(b.name), lower(r->>'title')) > 0.55
           );
        if not found then
          v_failed := v_failed + 1; continue;
        end if;
      else
        begin
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
          v_is_new := true;
        exception when unique_violation then
          select id into v_bid from businesses
           where google_maps_url = r->>'url' and country_id = p_country_id
           limit 1;
          if v_bid is null then
            v_failed := v_failed + 1; continue;
          end if;
        end;
      end if;

      insert into creator_saves (creator_id, business_id, note, source)
      values (v_creator, v_bid, coalesce(left(r->>'note', 2000), ''), 'takeout_csv')
      on conflict (creator_id, business_id)
      do update set note = excluded.note;

      -- ── Outreach tagging (V2) ──────────────────────────────────
      -- Only for businesses that have NOT paid for a tier. Bump status to
      -- 'to_contact' only when it's currently null/'none'/'' (never override
      -- 'replied'/'won'/etc). Append the handle marker once (idempotent).
      update businesses b
         set outreach_status = case
               when coalesce(b.outreach_status,'') in ('','none') then 'to_contact'
               else b.outreach_status end,
             notes = case
               when coalesce(b.notes,'') like '%' || v_marker || '%' then b.notes
               else nullif(trim(coalesce(b.notes,'') || ' ' || v_marker), '') end
       where b.id = v_bid
         and coalesce(b.tier_paid,false) = false;

      if v_is_new then v_created := v_created + 1;
      else v_matched := v_matched + 1;
      end if;
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
end $function$;

revoke all on function public.commit_import(uuid, text, text, jsonb) from public, anon;
grant execute on function public.commit_import(uuid, text, text, jsonb) to authenticated;
```

- [ ] **Step 2: Apply via MCP** (`apply_migration`, name `commit_import_v3`). Expected: success.

- [ ] **Step 3: Verify the function still grants correctly + marker logic** (via `execute_sql`):

```sql
-- signature unchanged, still SECURITY DEFINER, executable by authenticated
select p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can_exec
from pg_proc p
where p.proname='commit_import' and p.pronamespace='public'::regnamespace;  -- t, t

-- idempotent-marker unit check (pure SQL, no side effects)
select
  ('[creator-import @filoquita]' || ' present twice?') as _label,
  ( 'note [creator-import @filoquita]' like '%[creator-import @filoquita]%' ) as already_present; -- t
```

Expected: `security_definer=t`, `authed_can_exec=t`, `already_present=t`.

- [ ] **Step 4: Commit**

```bash
git add insiderguide/supabase/migrations/20260714121000_commit_import_v3.sql
git commit -m "feat(db): commit_import v3 — tag imports for VA outreach (to_contact + [creator-import @handle] marker)"
```

---

### Task 3: Edge fn — extend `invite-creator` with creator-ops actions

**Rationale (spec allows a new fn OR extending `invite-creator`):** extend `invite-creator`. It already has the exact primitives V2 needs — the caller-JWT `is_admin()` gate and a service-role `admin` client — so the new deal/license/request writes ride the same auth, avoid a second deploy + config entry, and keep all admin-only creator mutations in one auditable place. A new fn would duplicate the gate for no benefit.

**Files:**
- Modify: `insiderguide/supabase/functions/invite-creator/index.ts`

- [ ] **Step 1: Replace the file with the extended version** (keeps `invite` + `set_status` verbatim, adds `record_deal`, `update_deal`, `set_license`, `add_request`, `resolve_attribution`). The `set_license` action sets the `app.license_admin` GUC so the guard trigger allows an `active` transition.

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
    if (!isAdmin) return json({ error: 'forbidden' }, 403)

    const body = await req.json()
    const { action } = body
    const admin = createClient(url, service)

    // ── existing: invite ──────────────────────────────────────────
    if (action === 'invite') {
      const { email, handle, display_name } = body
      if (!email || !handle) throw new Error('email and handle required')
      const { data: user, error: uerr } = await admin.auth.admin.createUser({ email, email_confirm: true })
      if (uerr && !uerr.message.includes('already been registered')) throw uerr
      let uid = user?.user?.id
      if (!uid) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        uid = list?.users.find((u) => u.email === email)?.id
      }
      if (!uid) throw new Error('could not resolve user id')
      const { error: cerr } = await admin.from('creators').insert({
        id: uid, handle: handle.toLowerCase(), display_name: display_name || handle, status: 'active',
      })
      if (cerr) throw cerr
      return json({ ok: true, creator_id: uid })
    }

    // ── existing: set_status ──────────────────────────────────────
    if (action === 'set_status') {
      const { creator_id, status } = body
      if (!creator_id || !['active', 'paused'].includes(status)) throw new Error('bad args')
      const { error } = await admin.from('creators').update({ status }).eq('id', creator_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: record_deal ───────────────────────────────────────────
    if (action === 'record_deal') {
      const { creator_id, business_id, tier, amount_cents, status, source, notes } = body
      if (!creator_id || !business_id) throw new Error('creator_id and business_id required')
      if (!['featured', 'partner'].includes(tier)) throw new Error('bad tier')
      const { data, error } = await admin.from('creator_deals').insert({
        creator_id,
        business_id,
        tier,
        amount_cents: Number.isFinite(amount_cents) ? amount_cents : 0,
        status: ['pending_attribution', 'confirmed', 'paid_out'].includes(status) ? status : 'confirmed',
        source: ['outreach', 'inbound', 'manual'].includes(source) ? source : 'manual',
        notes: typeof notes === 'string' ? notes : '',
      }).select('id, creator_share_cents').single()
      if (error) throw error
      return json({ ok: true, deal: data })
    }

    // ── V2: update_deal (amount/status; used to resolve/mark paid_out) ──
    if (action === 'update_deal') {
      const { deal_id, amount_cents, status, notes } = body
      if (!deal_id) throw new Error('deal_id required')
      const patch: Record<string, unknown> = {}
      if (Number.isFinite(amount_cents)) patch.amount_cents = amount_cents
      if (['pending_attribution', 'confirmed', 'paid_out'].includes(status)) patch.status = status
      if (typeof notes === 'string') patch.notes = notes
      if (Object.keys(patch).length === 0) throw new Error('nothing to update')
      const { error } = await admin.from('creator_deals').update(patch).eq('id', deal_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: resolve_attribution (confirm one, delete the losing rows) ──
    // Confirms the winning pending_attribution deal (sets amount from deal_prices
    // for its tier + status='confirmed'), deletes the other pending rows for the
    // same business.
    if (action === 'resolve_attribution') {
      const { deal_id } = body
      if (!deal_id) throw new Error('deal_id required')
      const { data: win, error: rerr } = await admin
        .from('creator_deals').select('id, business_id, tier').eq('id', deal_id).single()
      if (rerr || !win) throw new Error('deal not found')
      const { data: price } = await admin
        .from('deal_prices').select('amount_cents').eq('tier', win.tier).single()
      const { error: uerr } = await admin.from('creator_deals')
        .update({ amount_cents: price?.amount_cents ?? 0, status: 'confirmed',
                  notes: '[resolved] confirmed by admin' })
        .eq('id', deal_id)
      if (uerr) throw uerr
      const { error: derr } = await admin.from('creator_deals')
        .delete().eq('business_id', win.business_id).eq('status', 'pending_attribution').neq('id', deal_id)
      if (derr) throw derr
      return json({ ok: true })
    }

    // ── V2: set_license (none|requested|active) ───────────────────
    // Sets the app.license_admin GUC so the guard trigger permits an 'active'
    // transition, then updates. GUC is set on the same session/connection.
    if (action === 'set_license') {
      const { creator_id, newsletter_license } = body
      if (!creator_id || !['none', 'requested', 'active'].includes(newsletter_license)) throw new Error('bad args')
      const { error: gerr } = await admin.rpc('set_license_admin_guc')
      if (gerr) throw gerr
      const { error } = await admin.from('creators').update({ newsletter_license }).eq('id', creator_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: add_request (admin creates a reel request for a creator) ──
    if (action === 'add_request') {
      const { creator_id, business_id, notes } = body
      if (!creator_id || !business_id) throw new Error('creator_id and business_id required')
      const { error } = await admin.from('creator_requests').insert({
        creator_id, business_id, type: 'reel', status: 'open',
        notes: typeof notes === 'string' ? notes : '',
      })
      if (error) throw error
      return json({ ok: true })
    }

    throw new Error('unknown action')
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400)
  }
})
```

- [ ] **Step 2: Add the GUC helper RPC** — the PostgREST client can't run `set_config` directly, so `set_license` calls an RPC. Add to a tiny migration `insiderguide/supabase/migrations/20260714122000_license_admin_guc.sql`:

```sql
-- Sets app.license_admin='on' for the current transaction/session so the
-- guard_newsletter_license trigger permits an 'active' transition. Callable
-- only by service_role (the edge fn); never granted to authenticated/anon.
create or replace function public.set_license_admin_guc()
returns void language sql security definer set search_path = public as $$
  select set_config('app.license_admin', 'on', false);
$$;

revoke all on function public.set_license_admin_guc() from public, anon, authenticated;
grant execute on function public.set_license_admin_guc() to service_role;
```

Apply via MCP (`apply_migration`, name `license_admin_guc`). Expected: success.

> Note: `set_config(..., is_local=false)` makes it session-scoped. Because `set_license` and the subsequent `update` run over the same supabase-js service-role client (same PostgREST session pool), the GUC is visible to the UPDATE. If a future refactor splits them across requests, switch to a single RPC that does both under one transaction.

- [ ] **Step 3: Deploy** via `mcp__claude_ai_Supabase__deploy_edge_function` (name `invite-creator`, project `qbzmsvfphpfgnlztskma`). Expected: deployed. The existing `config.toml` entry (`verify_jwt=true`) is unchanged.

- [ ] **Step 4: Auth-gate curl checks** (unauthenticated + bad action):

```bash
# No JWT → gateway 401 (verify_jwt=true) OR handler 403. Either is a pass (rejected).
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://qbzmsvfphpfgnlztskma.supabase.co/functions/v1/invite-creator \
  -H "Content-Type: application/json" -d '{"action":"record_deal"}'
# Expected: 401
```

For an authenticated non-admin, the handler returns 403 `forbidden` (covered by the E2E task 8 with a real creator JWT). Do NOT put a service key in a shell curl.

- [ ] **Step 5: Commit**

```bash
git add insiderguide/supabase/functions/invite-creator/index.ts \
        insiderguide/supabase/migrations/20260714122000_license_admin_guc.sql
git commit -m "feat(edge): invite-creator gains record_deal/update_deal/resolve_attribution/set_license/add_request + license GUC helper"
```

---

### Task 4: Studio — Earnings tab (route + StudioLayout tab + page)

**Files:**
- Create: `insiderguide/src/pages/studio/Earnings.jsx`
- Modify: `insiderguide/src/pages/studio/StudioLayout.jsx` (add tab)
- Modify: `insiderguide/src/App.jsx` (add `earnings` child route + lazy import)

- [ ] **Step 1: Add the tab in StudioLayout** — insert an Earnings tab between Import and Page Settings:

```jsx
const TABS = [
  { to: '/studio', label: 'My Spots', end: true },
  { to: '/studio/import', label: 'Import' },
  { to: '/studio/earnings', label: 'Earnings' },
  { to: '/studio/settings', label: 'Page Settings' },
]
```

- [ ] **Step 2: Write the Earnings page.** Follows the MySpots data pattern exactly: module-level `fetchEarnings()` returns all data (deals joined to `my_saved_businesses` client-side, leads from `my_leads`, license state, reel requests), effect sets state only when not cancelled, `reload()` for handlers. Inline SVG icons (no emoji). House tokens.

```jsx
// insiderguide/src/pages/studio/Earnings.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Deals write only via edge fn (admin) or the tier_paid trigger — the studio is
// read-only for deals. License request goes through the request_newsletter_license
// RPC. Reel requests toggle their own `status` (column-granted).
async function fetchEarnings() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const uid = session.user.id
  const [creatorRes, dealsRes, bizRes, leadsRes, reqRes] = await Promise.all([
    supabase.from('creators').select('newsletter_license, handle').eq('id', uid).maybeSingle(),
    supabase.from('creator_deals')
      .select('id, business_id, tier, amount_cents, creator_share_cents, status, closed_at')
      .order('closed_at', { ascending: false }),
    supabase.from('my_saved_businesses').select('id, name, city, location'),
    supabase.from('my_leads').select('email, country_slug, created_at').order('created_at', { ascending: false }),
    supabase.from('creator_requests')
      .select('id, business_id, status, notes, created_at')
      .order('created_at', { ascending: false }),
  ])
  if (creatorRes.error || dealsRes.error) return null
  const bizMap = new Map((bizRes.data || []).map((b) => [b.id, b]))
  const deals = (dealsRes.data || []).map((d) => ({ ...d, business: bizMap.get(d.business_id) || null }))
  const requests = (reqRes.data || []).map((r) => ({ ...r, business: bizMap.get(r.business_id) || null }))
  return {
    license: creatorRes.data?.newsletter_license || 'none',
    deals,
    leads: leadsRes.data || [],
    requests,
  }
}

function usd(cents) { return `$${(Number(cents || 0) / 100).toFixed(0)}` }

const STATUS_CHIP = {
  confirmed: 'text-accent border-accent/30',
  paid_out: 'text-green-400 border-green-400/30',
  pending_attribution: 'text-yellow-400 border-yellow-400/30',
}

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default function StudioEarnings() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await fetchEarnings()
      if (!cancelled && result !== null) setData(result)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function reload() {
    const result = await fetchEarnings()
    if (result !== null) setData(result)
  }

  async function requestLicense() {
    setBusy(true)
    await supabase.rpc('request_newsletter_license')
    setBusy(false)
    reload()
  }

  async function setRequestStatus(id, status) {
    setBusy(true)
    await supabase.from('creator_requests').update({ status }).eq('id', id)
    setBusy(false)
    reload()
  }

  function exportLeadsCsv() {
    const rows = data.leads
    const header = 'email,country,date\n'
    const body = rows.map((l) =>
      `${l.email},${l.country_slug || ''},${new Date(l.created_at).toISOString().slice(0, 10)}`).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'insiderguide-leads.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (data === null) return <p className="text-text-dim text-sm">Loading…</p>

  const confirmedShare = data.deals
    .filter((d) => d.status === 'confirmed' || d.status === 'paid_out')
    .reduce((s, d) => s + Number(d.creator_share_cents || 0), 0)
  const pendingShare = data.deals
    .filter((d) => d.status === 'confirmed')
    .reduce((s, d) => s + Number(d.creator_share_cents || 0), 0)
  const openRequests = data.requests.filter((r) => r.status === 'open')

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-2xl">Earnings</h1>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Lifetime earned', value: usd(confirmedShare) },
          { label: 'Pending payout', value: usd(pendingShare) },
          { label: 'Deals', value: String(data.deals.length) },
        ].map((s) => (
          <div key={s.label} className="bg-bg-card border border-border rounded-xl p-5 text-center">
            <span className="font-display text-3xl text-accent block">{s.value}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-dim">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Deals list */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Deals</h2>
        {data.deals.length === 0 ? (
          <p className="text-text-dim text-sm">
            When a business you added becomes a partner, your share appears here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.deals.map((d) => (
              <div key={d.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-text truncate block">{d.business?.name || 'Business'}</span>
                  <span className="text-[11px] text-text-dim">
                    {new Date(d.closed_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-text-dim border border-border px-2 py-0.5 rounded-full">
                  {d.tier}
                </span>
                <span className="text-sm text-text-secondary">{usd(d.amount_cents)}</span>
                <span className="text-sm text-accent">your {usd(d.creator_share_cents)}</span>
                <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${STATUS_CHIP[d.status] || 'text-text-dim border-border'}`}>
                  {d.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Leads */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">
            Leads <span className="text-text-dim">({data.leads.length})</span>
          </h2>
          {data.leads.length > 0 && (
            <button onClick={exportLeadsCsv}
                    className="inline-flex items-center gap-1.5 text-xs text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 cursor-pointer">
              <IconDownload /> Export CSV
            </button>
          )}
        </div>
        {data.leads.length === 0 ? (
          <p className="text-text-dim text-sm">Emails captured on your page will show here.</p>
        ) : (
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {data.leads.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm">
                <span className="text-text flex-1 truncate">{l.email}</span>
                <span className="text-text-dim text-xs">{l.country_slug || '—'}</span>
                <span className="text-text-dim text-xs">{new Date(l.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Newsletter license card */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Newsletter license</h2>
        <div className="bg-bg-card border border-border rounded-xl p-5">
          {data.license === 'none' && (
            <>
              <p className="text-sm text-text-secondary mb-3">
                Turn your captured leads into a newsletter. We operate the sending platform
                (Sendy) — request a license and we'll set you up.
              </p>
              <button onClick={requestLicense} disabled={busy}
                      className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-2.5 rounded-sm cursor-pointer disabled:opacity-50">
                {busy ? '…' : 'Request the license'}
              </button>
            </>
          )}
          {data.license === 'requested' && (
            <p className="text-sm text-text-secondary">
              <span className="text-accent">Request received.</span> We'll be in touch to set up your Sendy access.
            </p>
          )}
          {data.license === 'active' && (
            <>
              <p className="text-sm text-text-secondary mb-2">
                <span className="text-green-400">License active.</span> Your Sendy credentials were sent to you by us.
              </p>
              <a href="https://sendy.spexx.cloud" target="_blank" rel="noreferrer"
                 className="text-sm text-accent hover:underline">Open Sendy →</a>
            </>
          )}
        </div>
      </section>

      {/* Reel requests */}
      {openRequests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Reel requests</h2>
          <div className="flex flex-col gap-2">
            {openRequests.map((r) => (
              <div key={r.id} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-text truncate block">{r.business?.name || 'Business'} wants a reel</span>
                  {r.notes && <span className="text-[11px] text-text-dim truncate block">{r.notes}</span>}
                </div>
                <button onClick={() => setRequestStatus(r.id, 'accepted')} disabled={busy}
                        className="text-xs uppercase tracking-wider text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 cursor-pointer disabled:opacity-50">
                  Accept
                </button>
                <button onClick={() => setRequestStatus(r.id, 'declined')} disabled={busy}
                        className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-text-secondary cursor-pointer disabled:opacity-50">
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Route in App.jsx** — add the lazy import next to the other studio imports and the child route inside the `/studio` element:

```jsx
const StudioEarnings = lazy(() => import('./pages/studio/Earnings'))
```
```jsx
<Route path="earnings" element={<StudioEarnings />} />
```
(place it between the `import` and `settings` child routes).

- [ ] **Step 4: Lint + commit**

```bash
cd ~/koding/insider-guide/insiderguide && npm run lint
cd ~/koding/insider-guide
git add insiderguide/src/pages/studio/Earnings.jsx insiderguide/src/pages/studio/StudioLayout.jsx insiderguide/src/App.jsx
git commit -m "feat(studio): Earnings tab — totals, deals, leads+CSV, license card, reel requests"
```

---

### Task 5: Studio — Settings additions (DM toggle + rev-share display)

**Files:**
- Modify: `insiderguide/src/pages/studio/Settings.jsx`

- [ ] **Step 1: Include the new fields in the save payload.** In `handleSave`, add `dm_automations_enabled` to the `.update({...})` object (it is column-granted for authenticated in Task 1). Do NOT add `newsletter_license` (blocked by design — the Earnings card owns that via RPC).

```jsx
const { error } = await supabase.from('creators').update({
  display_name: form.display_name,
  bio: form.bio,
  avatar_url: form.avatar_url,
  ig_handle: form.ig_handle,
  theme: form.theme,
  email_capture_enabled: form.email_capture_enabled,
  dm_automations_enabled: form.dm_automations_enabled,
}).eq('id', creator.id)
```

- [ ] **Step 2: Add two sections** before the final save button block (after the email-capture section). Reuse the exact toggle markup already in the file for the DM toggle:

```jsx
      <section className="flex items-center justify-between bg-bg-card border border-border rounded-xl p-5">
        <div>
          <h2 className="text-sm text-text mb-1">DM automations</h2>
          <p className="text-xs text-text-dim">
            We reply to your IG DMs with your map link + capture emails. We'll contact you to set it up.
          </p>
        </div>
        <button onClick={() => setForm({ ...form, dm_automations_enabled: !form.dm_automations_enabled })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                  form.dm_automations_enabled ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-text transition-all ${
            form.dm_automations_enabled ? 'left-6' : 'left-0.5'}`} />
        </button>
      </section>

      <section className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm text-text mb-1">Revenue share</h2>
        <p className="text-xs text-text-dim">
          You earn 30% of every deal closed on your spots. Track your earnings in the Earnings tab.
        </p>
      </section>
```

- [ ] **Step 3: Lint + commit**

```bash
cd ~/koding/insider-guide/insiderguide && npm run lint
cd ~/koding/insider-guide
git add insiderguide/src/pages/studio/Settings.jsx
git commit -m "feat(studio): settings — DM automations toggle + rev-share display"
```

---

### Task 6: Admin — creators page extensions + Creator Imports outreach segment

**Files:**
- Modify: `insiderguide/src/pages/admin/Creators.jsx`

Extends the existing admin Creators page (keeps invite + pause/activate). Adds, per-creator (expandable panel): deals list with add/edit/resolve/mark-paid_out (all via the extended edge fn), a newsletter-license dropdown (none/requested/active via `set_license`), and add-reel-request. Below the roster, a read-only **Creator Imports** segment lists businesses tagged `[creator-import @handle]` + `outreach_status='to_contact'` and shows the VA the copy template to send (no CRM tables touched).

- [ ] **Step 1: Rewrite `Creators.jsx`** (full file):

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// VA-facing outreach copy for creator-imported businesses. Not a DB row —
// the real campaign engine is contact/project-based CRM infra we don't touch.
// {business} / {handle} / {ig} / {url} are filled in by the VA when sending.
const CREATOR_OUTREACH_TEMPLATE =
  'Subject: {handle} added {business} to their Insider Guide\n\n' +
  'Hi — {handle} (@{ig}) added {business} to their Insider Guide travel map, so ' +
  'travelers browsing their page already see you. Want the Featured or Partner ' +
  'placement (pinned spot, creator endorsement, a story/reel)? Details + checkout: {url}'

async function fetchCreators() {
  const { data } = await supabase.from('creators')
    .select('id, handle, display_name, status, newsletter_license')
    .order('created_at', { ascending: false })
  return data || []
}

// Businesses this creator imported that still need contacting.
async function fetchCreatorImports(handle) {
  const marker = `[creator-import @${handle}]`
  const { data } = await supabase.from('businesses')
    .select('id, name, email, city, tier_paid, outreach_status, notes')
    .ilike('notes', `%${marker}%`)
    .eq('outreach_status', 'to_contact')
    .eq('tier_paid', false)
    .order('created_at', { ascending: false })
    .limit(200)
  return data || []
}

// Deals + THIS creator's saved businesses (for the business picker). Admin can
// read creator_saves (admin_all_saves policy) and businesses (is_admin full
// access), so we scope the picker to the panel creator via a nested join —
// the public creator_saved_businesses view is NOT creator-scoped and would leak
// every creator's saves into the picker.
async function fetchCreatorPanel(creatorId, handle) {
  const [dealsRes, savedRes, reqRes] = await Promise.all([
    supabase.from('creator_deals')
      .select('id, business_id, tier, amount_cents, creator_share_cents, status, closed_at')
      .eq('creator_id', creatorId).order('closed_at', { ascending: false }),
    supabase.from('creator_saves')
      .select('business_id, businesses(id, name)')
      .eq('creator_id', creatorId),
    supabase.from('creator_requests').select('id, business_id, status, notes').eq('creator_id', creatorId),
  ])
  const imports = await fetchCreatorImports(handle)
  // Flatten to [{ id, name }] for the picker; drop any rows whose business row
  // didn't resolve (should not happen for admin, defensive).
  const saved = (savedRes.data || [])
    .map((s) => s.businesses)
    .filter(Boolean)
  return {
    deals: dealsRes.data || [],
    saved,
    requests: reqRes.data || [],
    imports,
  }
}

function usd(c) { return `$${(Number(c || 0) / 100).toFixed(0)}` }

export default function AdminCreators() {
  const [creators, setCreators] = useState([])
  const [form, setForm] = useState({ email: '', handle: '', display_name: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [panel, setPanel] = useState(null)          // { deals, saved, requests, imports }
  const [dealForm, setDealForm] = useState({ business_id: '', tier: 'featured', amount_cents: 20000 })
  const [reqForm, setReqForm] = useState({ business_id: '', notes: '' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const rows = await fetchCreators()
      if (!cancelled) setCreators(rows)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function reload() { setCreators(await fetchCreators()) }

  async function call(body) {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('invite-creator', { body })
    setBusy(false)
    if (error || data?.error) { setMsg(`Error: ${error?.message || data.error}`); return false }
    return true
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (await call({ action: 'invite', ...form })) {
      setMsg(`Invited ${form.email} as @${form.handle}. They sign in at /studio/login.`)
      setForm({ email: '', handle: '', display_name: '' })
      reload()
    }
  }

  async function openPanel(c) {
    if (openId === c.id) { setOpenId(null); setPanel(null); return }
    setOpenId(c.id)
    setPanel(null)
    setPanel(await fetchCreatorPanel(c.id, c.handle))
  }

  async function refreshPanel(c) { setPanel(await fetchCreatorPanel(c.id, c.handle)) }

  async function addDeal(c) {
    if (!dealForm.business_id) { setMsg('Pick a business'); return }
    if (await call({ action: 'record_deal', creator_id: c.id, ...dealForm })) {
      setDealForm({ business_id: '', tier: 'featured', amount_cents: 20000 })
      refreshPanel(c)
    }
  }

  async function resolveDeal(c, deal_id) {
    if (await call({ action: 'resolve_attribution', deal_id })) refreshPanel(c)
  }

  async function markPaid(c, deal_id) {
    if (await call({ action: 'update_deal', deal_id, status: 'paid_out' })) refreshPanel(c)
  }

  async function setLicense(c, newsletter_license) {
    if (await call({ action: 'set_license', creator_id: c.id, newsletter_license })) reload()
  }

  async function addRequest(c) {
    if (!reqForm.business_id) { setMsg('Pick a business'); return }
    if (await call({ action: 'add_request', creator_id: c.id, ...reqForm })) {
      setReqForm({ business_id: '', notes: '' })
      refreshPanel(c)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="font-heading text-xl text-white mb-6">Creators</h1>

      <form onSubmit={handleInvite} className="bg-bg-card border border-border rounded-xl p-5 mb-8 grid md:grid-cols-4 gap-3">
        <input required type="email" placeholder="Email" value={form.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })}
               className="bg-bg border border-border rounded-sm px-3 py-2 text-sm text-white" />
        <input required placeholder="handle" value={form.handle} pattern="[a-z0-9_]{3,30}"
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
          <div key={c.id} className="bg-bg-card border border-border rounded-xl">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <a href={`/@${c.handle}`} target="_blank" rel="noreferrer" className="text-sm text-white hover:text-gold">@{c.handle}</a>
                <span className="text-xs text-text-dim">{c.display_name}</span>
                <span className={`text-[10px] uppercase tracking-wider ${c.status === 'active' ? 'text-gold' : 'text-red-400/70'}`}>{c.status}</span>
                <select value={c.newsletter_license}
                        onChange={(e) => setLicense(c, e.target.value)}
                        className="bg-bg border border-border rounded-sm px-2 py-1 text-[11px] text-white">
                  <option value="none">license: none</option>
                  <option value="requested">license: requested</option>
                  <option value="active">license: active</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => call({ action: 'set_status', creator_id: c.id, status: c.status === 'active' ? 'paused' : 'active' }).then((ok) => ok && reload())}
                        className="text-xs uppercase tracking-wider text-text-dim border border-border px-3 py-1.5 rounded-lg hover:text-white cursor-pointer">
                  {c.status === 'active' ? 'Pause' : 'Activate'}
                </button>
                <button onClick={() => openPanel(c)}
                        className="text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer">
                  {openId === c.id ? 'Close' : 'Deals'}
                </button>
              </div>
            </div>

            {openId === c.id && (
              <div className="border-t border-border px-4 py-4 flex flex-col gap-5">
                {panel === null ? (
                  <p className="text-text-dim text-sm">Loading…</p>
                ) : (
                  <>
                    {/* Deals */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">Deals</span>
                      {panel.deals.length === 0 && <p className="text-text-dim text-xs mb-2">No deals yet.</p>}
                      <div className="flex flex-col gap-1.5 mb-3">
                        {panel.deals.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 text-xs">
                            <span className="text-white flex-1 truncate">{d.tier} · {usd(d.amount_cents)} → {usd(d.creator_share_cents)}</span>
                            <span className="text-text-dim">{d.status.replace('_', ' ')}</span>
                            {d.status === 'pending_attribution' && (
                              <button onClick={() => resolveDeal(c, d.id)} className="text-gold border border-gold/30 px-2 py-0.5 rounded cursor-pointer">Confirm</button>
                            )}
                            {d.status === 'confirmed' && (
                              <button onClick={() => markPaid(c, d.id)} className="text-green-400 border border-green-400/30 px-2 py-0.5 rounded cursor-pointer">Mark paid</button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                        <select value={dealForm.business_id} onChange={(e) => setDealForm({ ...dealForm, business_id: e.target.value })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="">Pick business…</option>
                          {panel.saved.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <select value={dealForm.tier}
                                onChange={(e) => setDealForm({ ...dealForm, tier: e.target.value, amount_cents: e.target.value === 'partner' ? 50000 : 20000 })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="featured">featured</option>
                          <option value="partner">partner</option>
                        </select>
                        <input type="number" value={dealForm.amount_cents}
                               onChange={(e) => setDealForm({ ...dealForm, amount_cents: parseInt(e.target.value) || 0 })}
                               className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white w-24" />
                        <button onClick={() => addDeal(c)} disabled={busy}
                                className="text-xs bg-gold text-bg px-3 rounded-sm cursor-pointer disabled:opacity-50">Add deal</button>
                      </div>
                    </div>

                    {/* Add reel request */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">Add reel request</span>
                      <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                        <select value={reqForm.business_id} onChange={(e) => setReqForm({ ...reqForm, business_id: e.target.value })}
                                className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white">
                          <option value="">Pick business…</option>
                          {panel.saved.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <input placeholder="Note (optional)" value={reqForm.notes}
                               onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
                               className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-white" />
                        <button onClick={() => addRequest(c)} disabled={busy}
                                className="text-xs bg-gold text-bg px-3 rounded-sm cursor-pointer disabled:opacity-50">Add</button>
                      </div>
                    </div>

                    {/* Creator imports — VA outreach segment */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-text-dim block mb-2">
                        Creator imports to contact ({panel.imports.length})
                      </span>
                      {panel.imports.length === 0 ? (
                        <p className="text-text-dim text-xs">Nothing pending — all imported spots are contacted or already paid.</p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto mb-2">
                            {panel.imports.map((b) => (
                              <div key={b.id} className="flex items-center gap-2 text-xs">
                                <span className="text-white flex-1 truncate">{b.name}</span>
                                <span className="text-text-dim">{b.email || 'no email'}</span>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                CREATOR_OUTREACH_TEMPLATE
                                  .replaceAll('{handle}', '@' + c.handle)
                                  .replaceAll('{ig}', c.handle)
                                  .replaceAll('{url}', `https://insiderguide.co/partner?ref=creator_${c.handle}`))
                              setMsg('Outreach template copied. Fill {business} per recipient.')
                            }}
                            className="text-xs uppercase tracking-wider text-gold border border-gold/30 px-3 py-1.5 rounded-lg hover:bg-gold/10 cursor-pointer">
                            Copy outreach template
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint + commit**

```bash
cd ~/koding/insider-guide/insiderguide && npm run lint
cd ~/koding/insider-guide
git add insiderguide/src/pages/admin/Creators.jsx
git commit -m "feat(admin): creators deals CRUD + license control + reel requests + creator-imports outreach segment"
```

---

### Task 7: Partner/checkout `?ref=creator_<handle>` attribution

**Files:**
- Modify: `insiderguide/src/pages/Partner.jsx` (preserve ref through the tier CTAs)
- Modify: `insiderguide/src/pages/Checkout.jsx` (stamp ref into the pre-created business notes)

Smallest viable wiring: `Partner.jsx` reads `?ref=` and forwards it to `/checkout`; `Checkout.jsx` reads `?ref=` and, if it looks like `creator_<handle>`, appends `[ref creator_<handle>]` to the `notes` of the pre-created `businesses` row. No edge-fn/DB change — the tier_paid trigger already reads `creator_saves`; the notes marker is the manual-disambiguation aid the spec asks for.

- [ ] **Step 1: Partner.jsx — carry the ref through the tier buttons.** Import `useSearchParams` (already imports `useNavigate`), read `ref`, and append it to the checkout navigation:

```jsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
```
Inside `Partner()`:
```jsx
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') || ''
```
Change BOTH featured/partner CTA handlers (the `onClick={() => navigate(...)}` on the non-listed tiers) to:
```jsx
onClick={() => navigate(`/checkout?tier=${tier.key}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`)}
```

- [ ] **Step 2: Checkout.jsx — stamp the ref into the pending row's notes.** At the top of `Checkout()`, `params` already exists (`useSearchParams`). Read the ref and validate it:

```jsx
  const refParam = params.get('ref') || ''
  const creatorRef = /^creator_[a-z0-9_]{3,30}$/.test(refParam) ? refParam : null
```
In `handleEmailSubmit`, extend the `notes` in the insert `payload` to include the marker when present:
```jsx
        notes: `[partner-signup-paid] Tier intent: ${tier.key}. Email: ${trimmed}. Domain: ${emailDomain}. Awaiting Stripe confirmation.${creatorRef ? ` [ref ${creatorRef}]` : ''}`,
```

- [ ] **Step 3: Build + lint + commit**

```bash
cd ~/koding/insider-guide/insiderguide && npm run lint && npm run build
cd ~/koding/insider-guide
git add insiderguide/src/pages/Partner.jsx insiderguide/src/pages/Checkout.jsx
git commit -m "feat(checkout): carry ?ref=creator_<handle> into pending business notes for deal attribution"
```

---

### Task 8: E2E verification (headed studio per role + trigger tests + RLS probes)

**Files:** none created (verification task).

- [ ] **Step 1: Seed / reuse a test creator.** Reuse `testcreator` from V1 if present, else invite one via `/admin/creators` (email you control, handle `testcreator`). Ensure it has at least 2 saved businesses (run the V1 import wizard with the V1 fixture CSV, country Colombia).

- [ ] **Step 2: Trigger test — single-saver → confirmed deal** (via `execute_sql`):

```sql
-- pick a business testcreator saved that is NOT yet tier-paid
with tc as (select id from creators where handle='testcreator'),
     b as (
       select cs.business_id from creator_saves cs, tc
       where cs.creator_id = tc.id
         and not exists (select 1 from creator_saves x where x.business_id=cs.business_id and x.creator_id<>tc.id)
       limit 1)
update businesses set tier='featured', tier_paid=true, paid_at=now(), published=true
where id in (select business_id from b);

-- expect exactly one confirmed 'outreach' deal, share 6000 (30% of 20000)
select tier, amount_cents, creator_share_cents, status, source
from creator_deals d
where d.business_id in (select business_id from creator_saves cs
                        join creators c on c.id=cs.creator_id where c.handle='testcreator')
order by created_at desc limit 1;
-- Expected: featured | 20000 | 6000 | confirmed | outreach
```

- [ ] **Step 3: Trigger test — multi-saver → pending_attribution.** Seed a second creator saving the same (fresh, unpaid) business, flip it paid, and assert two `pending_attribution` rows with amount 0. Then call `resolve_attribution` on one (via the edge fn or `execute_sql` mimicking it) and assert the other is deleted + the winner is `confirmed` with the tier price. Document exact rows. Clean up seeded rows afterward.

- [ ] **Step 4: License guard test** (via `execute_sql`, simulating an authenticated creator JWT):

```sql
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub',(select id::text from creators where handle='testcreator'),'role','authenticated')::text, true);
-- self-activate must FAIL (no column grant + guard trigger)
update creators set newsletter_license='active' where id=auth.uid();  -- expected: ERROR (permission / guard)
-- the RPC path: none->requested succeeds
select public.request_newsletter_license();                            -- expected: 'requested'
reset role;
```

- [ ] **Step 5: RLS probes — cross-creator isolation** (two seeded creators A/B):

```sql
-- as A: cannot read B's deals/leads/requests, cannot insert a deal
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<A-id>','role','authenticated')::text, true);
select count(*) from creator_deals where creator_id='<B-id>';   -- expected: 0
insert into creator_deals(creator_id,business_id,tier,amount_cents)
  values ('<A-id>','<some-biz>','featured',20000);              -- expected: ERROR (no insert policy)
select count(*) from my_leads;                                  -- only A's own source rows
select count(*) from newsletter_subscribers;                   -- expected: 0 (admin-only base table)
-- CRM spot-check: creators must not read contacts/campaigns
select count(*) from contacts;                                 -- expected: 0 / permission
reset role;
```

All must hold. `creator_requests`: as A, `update creator_requests set status='done' where creator_id='<B-id>'` → 0 rows.

- [ ] **Step 6: Headed studio per role** (Playwright MCP or chrome-devtools MCP, headed):
  1. Log in as testcreator at `/studio/login` (magic link). Open `/studio/earnings`:
     - totals strip shows lifetime `$60`+ (the confirmed 6000-cent deal), pending payout, deals count ≥1;
     - the deal row renders with tier badge, gross `$200`, `your $60`, `confirmed` chip;
     - leads section + CSV export button (submit a test email on the public page first if empty);
     - license card in `none` state → click "Request the license" → card flips to "Request received";
     - reel requests: add one via admin, reload → Accept flips it out of the open list.
  2. Empty-state check with a fresh creator (`filoquita` if seeded, else a new invite with no deals): Earnings shows the "When a business you added becomes a partner…" empty state, no deals, empty leads copy.
  3. `/studio/settings`: toggle DM automations on, Save, reload → toggle persists; rev-share copy present.
  4. Admin `/admin/creators`: expand testcreator → deals list shows the confirmed deal; license dropdown → set `active` → reload shows `active` (proves the `set_license` GUC path); Creator Imports segment lists ≥1 unpaid imported business + "Copy outreach template" works.

- [ ] **Step 7: Clean up** — delete seeded probe deals/creators created solely for the multi-saver test and any test lead rows; revert testcreator's license to `none` and any business you flipped paid purely for the test (`update businesses set tier='listed', tier_paid=false, paid_at=null, published=false where id=...` then delete the auto-created deal). Keep testcreator.

- [ ] **Step 8: Commit** (verification notes only — no files; if you added a fixture, commit it):

```bash
git commit --allow-empty -m "test: creator network v2 e2e — triggers, RLS, license guard, headed studio verified"
```

---

### Task 9: Ship — merge, deploy watch, prod smoke, memory update

**Files:**
- (optional) Modify: `insiderguide/scripts/build-seo.mjs` only if creator routes need refresh — otherwise none.

- [ ] **Step 1: Final gate** — from `insiderguide/`: `npm run lint && npm test && npm run build`. Expected: all green. (`npm test` = the V1 takeout parser vitest suite; still passing.)

- [ ] **Step 2: Merge + deploy**

```bash
cd ~/koding/insider-guide
git checkout main
git merge --no-ff feat/creator-network-v2 -m "feat: creator network V2 — earnings, deal attribution, outreach tagging, newsletter license"
git push origin main   # triggers .github/workflows/deploy.yml → VPS docker rebuild
```

Watch the Actions run. Infra caveat (from V1): if the SSH deploy step times out, check fail2ban on the VPS before assuming a code issue.

- [ ] **Step 3: Prod smoke** — after deploy:
  - `/studio/login` → sign in as testcreator → `/studio/earnings` renders with the confirmed deal and totals.
  - `/admin/creators` → expand a creator → deals panel + license dropdown + Creator Imports segment render.
  - `/partner?ref=creator_testcreator` → click Featured → URL becomes `/checkout?tier=featured&ref=creator_testcreator`; enter email → confirm (in Supabase) the pending business row's `notes` contains `[ref creator_testcreator]`. Delete that pending test row afterward.

- [ ] **Step 4: Update memory** — write `project_insiderguide_creator_network_v2.md` to auto-memory: what shipped (earnings tab, deal_prices $200/$500, 30% frozen share via generated column, attribution trigger, license guard + RPC, invite-creator new actions + license GUC, commit_import v3 marker `[creator-import @handle]`, ref attribution), the KEY deviation (no working `outreach_*` engine in this DB — outreach is `businesses.outreach_status`-based + VA copy template, NOT the CRM `campaigns` engine), and next-cycle items (Sendy API automation, Stripe checkout for the license, real payout rails, DM automation wiring). Link `[[project_insiderguide_creator_network]]` and the V1 note.

---

## Self-review notes (spec coverage / placeholder scan / consistency — fixed inline)

- **Spec §1 data model** — `creator_deals` (generated `creator_share_cents` verified: `20000*30/100=6000` exact), `deal_prices` seeded from live prices ($200/$500), `creator_requests` (status-only creator UPDATE via column grant + policy), `creators.newsletter_license`/`dm_automations_enabled`, `my_leads` definer view: all in Task 1. Attribution trigger: 0/1/many-saver branches match spec exactly.
- **Spec §2 Earnings tab** — totals, deals list (joined to `my_saved_businesses` client-side), leads + CSV, license state machine, reel accept/decline: Task 4.
- **Spec §3 Settings** — DM toggle + static rev-share: Task 5. `dm_automations_enabled` added to the column grant AND the Settings save payload (consistent).
- **Spec §4 outreach** — `commit_import` v3 tags `to_contact` + `[creator-import @handle]` marker idempotently (Task 2); VA segment surfaces them in admin (Task 6). **DEVIATION:** the "seed a campaign_templates row" + "enroll in the existing OutreachDashboard engine" steps are re-scoped — see below.
- **Spec §5 admin** — deals CRUD, resolve pending_attribution, mark paid_out, license dropdown, add reel request: Task 6, all via extended `invite-creator` (chosen per spec's "implementation's choice", justified in Task 3).
- **Spec §7 testing** — trigger tests, license guard, cross-creator RLS, CRM spot-check, headed studio per role: Task 8 (modeled on V1 Task 12).
- **Placeholder scan:** no TBD/"similar to"/"…" placeholders in any SQL/JSX/TS block. All migrations, the full edge fn, the full Earnings + admin Creators components, and the Partner/Checkout diffs are complete.
- **Type/name consistency:** `record_deal`/`update_deal`/`resolve_attribution`/`set_license`/`add_request` action names match between the edge fn (Task 3) and the admin caller (Task 6). `request_newsletter_license()` (Task 1) matches the Earnings caller (Task 4). `set_license_admin_guc()` (Task 3 migration) matches the edge fn call. `creator_share_cents`, `amount_cents`, `deal_prices.amount_cents` used consistently. `my_leads` columns (`email, country_slug, created_at`) match the Earnings CSV export + table.

### Spec deviations baked in (with rationale)

1. **No `outreach_*` engine to reuse; no `campaign_templates` seed row.** Recon proved the tables the IG admin OutreachDashboard queries (`outreach_campaigns/enrollments/messages`) do not exist in this DB, and the only real engine (`campaigns`/`campaign_enrollments`/`campaign_messages`) is contact/project-keyed CRM infra that the invariants forbid loosening. `campaign_templates` present is the ads-template table, not an outreach email table. **Resolution:** outreach tagging stays on `businesses.outreach_status`/`notes` (the same column `CampaignCreateModal` filters on), and the VA surface is a read-only "Creator Imports" segment in the admin with a copy-to-clipboard outreach template constant (not a DB row). Zero CRM tables touched. This honors the spec's INTENT (VA-reviewed, human-sent, reuse the proven `to_contact` flow) without inventing a broken engine wiring.
2. **License guard uses a trigger + RPC + GUC, not a column grant alone.** The spec required a mechanism that prevents a creator self-activating `active`; a column grant on `newsletter_license` would allow any value. Chosen mechanism: no column grant at all (blocks direct writes) + `request_newsletter_license()` RPC (only `none→requested`) + `guard_newsletter_license` trigger (belt-and-suspenders, service role bypasses via `app.license_admin` GUC set by `set_license_admin_guc()`).
3. **Ref attribution is frontend-only** (`Partner.jsx`→`Checkout.jsx` notes marker); `bcax-callback` unchanged. The tier_paid trigger already does the real attribution from `creator_saves`; the `[ref creator_<handle>]` marker is only the multi-saver disambiguation aid the spec asked for. Smallest viable wiring, matching the existing `customer_external_id` pre-created-row pattern.
```
