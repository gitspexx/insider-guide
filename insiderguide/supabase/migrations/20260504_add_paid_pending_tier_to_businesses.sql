-- =============================================================================
-- Closes the paid-listing ledger gap: when a partner pays for Featured or
-- Partner tier on the IG Partner page, we now create a pending `businesses`
-- row UP-FRONT (carrying the intent in `paid_pending_tier`), then flip it to
-- the real `tier` after BCAX dispatches a `one_time.succeeded` callback to
-- the IG bcax-callback edge fn. Without this row there's no IG-side record
-- of who paid for what.
-- =============================================================================

alter table public.businesses
  add column if not exists paid_pending_tier text,
  add column if not exists paid_at timestamptz;

-- Constrain paid_pending_tier to known values when present.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_paid_pending_tier_check'
  ) then
    alter table public.businesses
      add constraint businesses_paid_pending_tier_check
      check (paid_pending_tier is null or paid_pending_tier in ('featured','partner'));
  end if;
end $$;

-- Allow anonymous applicants to seed a paid-pending row from the public
-- Checkout page. Mirrors the existing `anon_insert_partner_signup_insiderguide`
-- policy but for paid intents — `tier` stays 'listed' until the bcax-callback
-- promotes it; the marker prefix '[partner-signup-paid]' makes the row easy
-- to triage/audit in admin.
drop policy if exists "anon_insert_paid_pending_insiderguide" on public.businesses;
create policy "anon_insert_paid_pending_insiderguide"
  on public.businesses
  for insert
  to anon
  with check (
    tier = 'listed'
    and published = false
    and paid_pending_tier in ('featured','partner')
    and notes like '[partner-signup-paid]%'
  );

create index if not exists businesses_paid_pending_tier_idx
  on public.businesses (paid_pending_tier)
  where paid_pending_tier is not null;
