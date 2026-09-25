-- Creator pages showed unpaid listings as Featured + Recommended.
--
-- 20260722100000_paid_badges_admin_approvals.sql fixed exactly this for
-- public_businesses (country guides): tier and recommended_badge are DISPLAY
-- fields, so only rows with tier_paid may show a paid tier or a recommendation.
-- creator_saved_businesses was created one day earlier, in
-- 20260721190000_production_hardening.sql, and never got the same guard — it
-- passed `tier` straight through and did not expose tier_paid at all.
--
-- Effect of that gap in prod today: 30,471 businesses carry tier='featured'
-- from the scraper imports with tier_paid = false. On /alexspexx, 127 of the
-- 200 saved places rendered as "Featured" AND "Recommended by Alex" without
-- anyone having paid. Because tier_paid was absent from the view it read as
-- undefined in BusinessCard, which also put "Own this place? Claim this
-- listing" on every card, paid ones included.
--
-- Column order is preserved and tier_paid appended last, so `create or replace`
-- is accepted. Still a definer-style view: the owner bypasses base RLS and the
-- column list IS the security boundary, so no new column may leak email,
-- whatsapp, notes, outreach_status or paid_pending_tier.
create or replace view public.creator_saved_businesses as
  select
    b.id,
    b.country_id,
    b.name,
    b.category,
    b.description,
    b.location,
    b.city,
    b.google_maps_url,
    b.instagram_handle,
    b.website,
    -- Paid tiers are the only ones that may name themselves. Everything else
    -- is still listed on the page, just without the paid styling.
    case when b.tier_paid then b.tier else 'listed' end as tier,
    b.photo_url,
    -- The creator's own editorial signal is creator_saves.pinned + .note, which
    -- is unaffected. This badge is a paid one, and the scraper set it wholesale.
    (b.recommended_badge and b.tier_paid) as recommended_badge,
    b.lat,
    b.lng,
    b.enrich_status,
    b.tier_paid
  from public.businesses b
  where exists (
    select 1
    from public.creator_saves cs
    join public.creators c on c.id = cs.creator_id
    where cs.business_id = b.id
      and cs.hidden = false
      and c.status = 'active'
  );

revoke all on public.creator_saved_businesses from public;
grant select on public.creator_saved_businesses to anon, authenticated;
