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
