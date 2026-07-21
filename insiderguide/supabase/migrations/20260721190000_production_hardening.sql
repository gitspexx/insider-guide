-- Production hardening (ultracode audit 2026-07-21). Four parts:
--   1. Close the anon UPDATE hole on businesses (critical).
--   2. public_businesses view — safe-column public reads (leak fix + makes
--      country pages work for authenticated non-admins, who previously got
--      zero rows because anon_read_published_businesses was anon-only).
--   3. country_business_counts() RPC — replaces multi-MB pagination scans on
--      /partner and the founding-creator catalog.
--   4. Invoice sequence + creator ?ref= attribution fallback.

-- ── 1. anon UPDATE hole ─────────────────────────────────────────────
-- Policy anon_update_gbp_status (published=true USING/CHECK) + blanket column
-- grants let ANY visitor with the public key update tier/tier_paid/name/...
-- of every published row. The gbp updater scripts use the service key, so the
-- policy is vestigial. Kill it entirely.
drop policy if exists anon_update_gbp_status on public.businesses;
revoke update on public.businesses from anon;

-- ── 2. Safe public projection ───────────────────────────────────────
-- Definer-style view (same documented pattern as creator_saved_businesses):
-- owner bypasses base RLS, the column list IS the security boundary. Excludes
-- email, whatsapp, notes (internal lead scores), outreach_status, enrich_*,
-- gateway_routed_at, paid_pending_tier.
create or replace view public.public_businesses as
  select id, country_id, name, category, description, city, location,
         google_maps_url, website, instagram_handle, tier, tier_paid,
         photo_url, recommended_badge, top_pick_rank, lat, lng, created_at
  from public.businesses
  where published = true;

revoke all on public.public_businesses from public;
grant select on public.public_businesses to anon, authenticated;

-- Frontend now reads the view; drop the whole-row anon read on the base table.
-- (authenticated keeps its grant — the is_admin() policy gates rows.)
drop policy if exists anon_read_published_businesses on public.businesses;
revoke select on public.businesses from anon;

-- ── 3. Counts RPC ───────────────────────────────────────────────────
-- One request instead of paginating tens of thousands of rows client-side.
create or replace function public.country_business_counts()
returns table (country_id uuid, total bigint, paid bigint)
language sql stable security definer set search_path = public as $$
  select country_id,
         count(*) as total,
         count(*) filter (where tier_paid) as paid
  from businesses
  where published = true or tier_paid = true
  group by country_id
$$;
grant execute on function public.country_business_counts() to anon, authenticated;

-- ── 4a. Invoice numbering ───────────────────────────────────────────
-- Replaces the race-prone "count notes markers" scheme in approve-application.
create sequence if not exists public.ig_invoice_seq start 2;  -- IG-2026-001 already used
revoke all on sequence public.ig_invoice_seq from public, anon, authenticated;

-- ── 4b. Creator ?ref= attribution fallback ──────────────────────────
-- Minimal diff to the live attribute_creator_deal: identical logic, but the
-- "no creator saved it" branch now honors the checkout referral marker
-- '[ref creator_<handle>]' before giving up, so ?ref= deals from creators'
-- own promotion aren't silently dropped.
create or replace function public.attribute_creator_deal()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_became_paid boolean;
  v_price int;
  v_savers uuid[];
  v_ref_handle text;
  v_ref_creator uuid;
begin
  v_became_paid :=
    (coalesce(new.tier_paid,false) = true and coalesce(old.tier_paid,false) = false)
    or (new.paid_at is not null and old.paid_at is null);

  if not v_became_paid then return new; end if;
  if new.tier not in ('featured','partner') then return new; end if;
  if exists (select 1 from creator_deals d where d.business_id = new.id) then
    return new;                                -- already attributed
  end if;

  select amount_cents into v_price from deal_prices where tier = new.tier;
  v_price := coalesce(v_price, 0);

  select array_agg(cs.creator_id)
    into v_savers
  from creator_saves cs
  join creators c on c.id = cs.creator_id
  where cs.business_id = new.id and c.status <> 'paused';

  if v_savers is null or array_length(v_savers,1) is null then
    -- No saver: fall back to the checkout referral marker before giving up.
    v_ref_handle := substring(coalesce(new.notes, '') from '\[ref creator_([a-z0-9_]{3,30})\]');
    if v_ref_handle is not null then
      select id into v_ref_creator from creators
       where handle = v_ref_handle and status <> 'paused';
      if v_ref_creator is not null then
        insert into creator_deals (creator_id, business_id, tier, amount_cents,
                                   status, source, notes)
        values (v_ref_creator, new.id, new.tier, v_price, 'confirmed', 'inbound',
                '[auto] ?ref= referral attribution');
      end if;
    end if;
    return new;
  end if;

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
end $function$;

-- ── 4c. Invoice-number RPC (applied as ig_invoice_no_rpc) ───────────
create or replace function public.next_ig_invoice_no()
returns text language sql volatile security definer set search_path = public as $$
  select 'IG-' || extract(year from now())::int || '-' ||
         lpad(nextval('public.ig_invoice_seq')::text, 3, '0')
$$;
revoke all on function public.next_ig_invoice_no() from public, anon, authenticated;
grant execute on function public.next_ig_invoice_no() to service_role;
grant usage on sequence public.ig_invoice_seq to service_role;
