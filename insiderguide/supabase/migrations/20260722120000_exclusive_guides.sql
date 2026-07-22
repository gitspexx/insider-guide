-- Exclusive guides: scraped inventory is claimable + payable but NOT shown on
-- public guides. Guide visibility = paid, application-approved, or saved by a
-- creator (personal Takeout picks — including unpublished canonical stubs).
-- `businesses.published` now means "real business, contactable/claimable",
-- not "on the guide" — csv_processor keeps inserting published=true.

create index if not exists idx_creator_saves_business
  on creator_saves(business_id) where not hidden;

create or replace view public.public_businesses as
select b.id, b.country_id, b.name, b.category, b.description, b.city, b.location,
       b.google_maps_url, b.website, b.instagram_handle,
       case when b.tier_paid then b.tier else 'listed' end as tier,
       b.tier_paid, b.photo_url,
       (b.recommended_badge and b.tier_paid) as recommended_badge,
       b.top_pick_rank, b.lat, b.lng, b.created_at
from businesses b
where (b.published and (b.tier_paid or b.notes like '%[application-approved%'))
   or exists (select 1 from creator_saves cs
              where cs.business_id = b.id and not cs.hidden);

-- Claim page + checkout find-your-business search over the FULL inventory.
-- Minimal column projection by design — no contact data exposed.
create or replace view public.claimable_businesses as
select id, country_id, name, city, category, tier_paid
from businesses
where published = true;

grant select on public.claimable_businesses to anon, authenticated;

-- Counts matview: keep `total` (full inventory — powers the locked-country
-- "DM to unlock" catalog + Google-Maps-list funnel) and add `curated` (what
-- the public guide actually shows) for open-guide labels.
drop materialized view if exists private.country_counts_mv;
create materialized view private.country_counts_mv as
select c.id as country_id,
       (select count(*) from businesses b
         where b.country_id = c.id and (b.published or b.tier_paid)) as total,
       (select count(*) from businesses b
         where b.country_id = c.id and b.tier_paid) as paid,
       (select count(*) from public.public_businesses pb
         where pb.country_id = c.id) as curated
from countries c;
create unique index country_counts_mv_country_id
  on private.country_counts_mv (country_id);

drop function if exists public.country_business_counts();
create function public.country_business_counts()
returns table(country_id uuid, total bigint, paid bigint, curated bigint)
language sql stable security definer
set search_path to 'public', 'private'
as $$
  select country_id, total, paid, curated from private.country_counts_mv
$$;
revoke all on function public.country_business_counts() from public;
grant execute on function public.country_business_counts() to anon, authenticated;

