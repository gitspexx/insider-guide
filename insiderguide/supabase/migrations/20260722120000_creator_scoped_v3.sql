-- V3: creator-scoped guides + Complete ($50) tier + claim flow + creator approvals.

-- ── 1. Country coverage: every country belongs to a creator ─────────
alter table public.countries
  add column if not exists creator_id uuid references public.creators(id);
update public.countries
   set creator_id = '4c680996-4960-4ee6-9ec2-7871ea28cc8c'  -- alexspexx (founding creator)
 where creator_id is null;

-- ── 2. Complete tier ($50 profile completion) ───────────────────────
insert into public.deal_prices (tier, amount_cents)
values ('complete', 5000)
on conflict (tier) do update set amount_cents = excluded.amount_cents;

-- Attribution trigger accepts the new tier (single-line change: tier check).
-- Recreate with the same body as production_hardening 4b, widened check.
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
  if new.tier not in ('featured','partner','complete') then return new; end if;
  if exists (select 1 from creator_deals d where d.business_id = new.id) then
    return new;
  end if;

  select amount_cents into v_price from deal_prices where tier = new.tier;
  v_price := coalesce(v_price, 0);

  select array_agg(cs.creator_id)
    into v_savers
  from creator_saves cs
  join creators c on c.id = cs.creator_id
  where cs.business_id = new.id and c.status <> 'paused';

  if v_savers is null or array_length(v_savers,1) is null then
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
    -- No saver and no ref: credit the creator covering the country — every
    -- guide is creator-owned in the V3 model.
    if v_ref_creator is null then
      select c.id into v_ref_creator
        from countries co join creators c on c.id = co.creator_id and c.status <> 'paused'
       where co.id = new.country_id;
      if v_ref_creator is not null then
        insert into creator_deals (creator_id, business_id, tier, amount_cents,
                                   status, source, notes)
        values (v_ref_creator, new.id, new.tier, v_price, 'confirmed', 'inbound',
                '[auto] country-coverage attribution');
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

-- ── 3. Claim requests ───────────────────────────────────────────────
create table if not exists public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  contact_name text not null default '',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists idx_claim_requests_business on public.claim_requests (business_id);

alter table public.claim_requests enable row level security;
create policy anon_insert_claim on public.claim_requests
  for insert to anon, authenticated
  with check (status = 'pending');
create policy admin_all_claims on public.claim_requests
  for all to authenticated using (is_admin()) with check (is_admin());
revoke all on public.claim_requests from anon, authenticated;
grant insert (business_id, email, contact_name, message) on public.claim_requests to anon, authenticated;
grant select on public.claim_requests to authenticated;  -- rows still gated by RLS

-- ── 4. Creator approvals queue (definer RPC, caller-scoped) ─────────
-- Creators cannot read businesses/claims directly; this projects exactly the
-- pending items for countries the caller covers.
create or replace function public.creator_pending_approvals()
returns table (
  kind text, ref_id uuid, business_id uuid, business_name text,
  country_name text, city text, category text, email text,
  tier_interest text, pitch text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  -- applications
  select 'application'::text, b.id, b.id, b.name, co.name, b.city, b.category, b.email,
         coalesce(substring(b.notes from 'Tier inte(?:rest|nt): (\w+)'), 'listed'),
         trim(regexp_replace(regexp_replace(coalesce(b.notes,''),
              '\[[^\]]*\]', '', 'g'), 'Tier inte(?:rest|nt): \w+\.', '', 'g')),
         b.created_at
  from businesses b
  join countries co on co.id = b.country_id
  where co.creator_id = auth.uid()
    and b.notes like '%[partner-signup%'
    and b.notes not like '%[application-approved%'
    and b.notes not like '%[application-rejected]%'
    and b.published = false
  union all
  -- claims
  select 'claim'::text, cr.id, b.id, b.name, co.name, b.city, b.category, cr.email,
         'claim', cr.message, cr.created_at
  from claim_requests cr
  join businesses b on b.id = cr.business_id
  join countries co on co.id = b.country_id
  where co.creator_id = auth.uid() and cr.status = 'pending'
$$;
grant execute on function public.creator_pending_approvals() to authenticated;
revoke execute on function public.creator_pending_approvals() from anon;

-- ── 5. Data cleanup: leading dash artifacts from imports ────────────
update public.businesses
   set name = regexp_replace(name, '^\s*[-–—]\s*', '')
 where name ~ '^\s*[-–—]\s*';

-- ── 0 (applied first as creator_scoped_v3_constraints): tier checks ──
-- alter table deal_prices  drop/add constraint ... in ('featured','partner','complete')
-- alter table creator_deals drop/add constraint ... in ('featured','partner','complete')
