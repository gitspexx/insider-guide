-- Creator "pins": a free cosmetic highlight the creator controls, distinct
-- from the paid featured/partner business tier. Pinned spots render first on
-- the public creator page with a pick badge.
alter table public.creator_saves
  add column pinned boolean not null default false;

-- Re-issue the column-restricted UPDATE grant with pinned included
-- (business_id/creator_id stay immutable to the authenticated role).
grant update (note, tags, sort, hidden, pinned) on public.creator_saves to authenticated;
