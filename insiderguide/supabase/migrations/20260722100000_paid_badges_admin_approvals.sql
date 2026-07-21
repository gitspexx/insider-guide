-- V3 polish: paid-only badges in the public view; admins see all pending approvals.
-- (Applied to prod 2026-07-22 via MCP apply_migration as paid_badges_admin_approvals.)

-- 1) public_businesses: tier/recommended_badge are DISPLAY fields — only rows
--    with tier_paid may show a tier or recommendation badge. Scraped imports
--    carry tier='featured' + recommended_badge=true wholesale (2,922 rows in
--    colombia alone), which rendered unpaid listings as Featured/Recommended.
create or replace view public.public_businesses as
select id,
    country_id,
    name,
    category,
    description,
    city,
    location,
    google_maps_url,
    website,
    instagram_handle,
    case when tier_paid then tier else 'listed' end as tier,
    tier_paid,
    photo_url,
    (recommended_badge and tier_paid) as recommended_badge,
    top_pick_rank,
    lat,
    lng,
    created_at
from businesses
where published = true;

-- 2) creator_pending_approvals: admins see every creator's queue (tagged with
--    the covering creator's handle); creators still see only their countries.
drop function if exists public.creator_pending_approvals();
create function public.creator_pending_approvals()
returns table(kind text, ref_id uuid, business_id uuid, business_name text,
              country_name text, city text, category text, email text,
              tier_interest text, pitch text, created_at timestamptz,
              creator_handle text)
language sql stable security definer set search_path to 'public'
as $$
  select 'application'::text, b.id, b.id, b.name, co.name, b.city, b.category, b.email,
         coalesce(substring(b.notes from 'Tier inte(?:rest|nt): (\w+)'), 'listed'),
         trim(regexp_replace(regexp_replace(coalesce(b.notes,''),
              '\[[^\]]*\]', '', 'g'), 'Tier inte(?:rest|nt): \w+\.', '', 'g')),
         b.created_at,
         cw.handle
  from businesses b
  join countries co on co.id = b.country_id
  left join creators cw on cw.id = co.creator_id
  where (co.creator_id = auth.uid() or public.is_admin())
    and b.notes like '%[partner-signup%'
    and b.notes not like '%[application-approved%'
    and b.notes not like '%[application-rejected]%'
    and b.published = false
  union all
  select 'claim'::text, cr.id, b.id, b.name, co.name, b.city, b.category, cr.email,
         'claim', cr.message, cr.created_at, cw.handle
  from claim_requests cr
  join businesses b on b.id = cr.business_id
  join countries co on co.id = b.country_id
  left join creators cw on cw.id = co.creator_id
  where (co.creator_id = auth.uid() or public.is_admin()) and cr.status = 'pending'
$$;
revoke all on function public.creator_pending_approvals() from public;
grant execute on function public.creator_pending_approvals() to authenticated;
