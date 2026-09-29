-- =============================================================================
-- The $50 Complete tier could not be bought.
--
-- Checkout.jsx writes `paid_pending_tier: 'complete'` for the cheapest tier,
-- but the CHECK constraint from 20260504 only ever allowed 'featured' and
-- 'partner' — Complete was added to the UI later and the constraint was
-- missed. The pre-payment insert therefore failed and the buyer saw
-- "Could not start application". No money was ever at risk (it fails BEFORE
-- payment) but every $50 conversion was lost.
--
-- Verified against production on 2026-09-29: the RLS policy
-- `anon_insert_paid_pending_insiderguide` ALREADY allows 'complete' — only the
-- CHECK was left behind. That asymmetry is the signature of a hand-applied
-- change, so this migration brings the constraint back under version control
-- rather than fixing it in the dashboard again.
-- =============================================================================

alter table public.businesses
  drop constraint if exists businesses_paid_pending_tier_check;

alter table public.businesses
  add constraint businesses_paid_pending_tier_check
  check (paid_pending_tier is null or paid_pending_tier in ('complete','featured','partner'));
