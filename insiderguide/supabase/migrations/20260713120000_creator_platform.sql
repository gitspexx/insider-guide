-- Creator Platform V1: creators, creator_saves, creator_imports,
-- businesses enrichment columns, RLS. Additive only — no existing
-- policy is dropped except the newsletter_subscribers tightening at the end.

create extension if not exists pg_trgm;

-- ── creators ─────────────────────────────────────────────────────
create table public.creators (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9_\.]{3,30}$'),
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  ig_handle text,
  theme jsonb not null default '{"palette":"gold","fonts":"editorial"}',
  email_capture_enabled boolean not null default false,
  status text not null default 'invited'
    check (status in ('invited','active','paused')),
  created_at timestamptz not null default now()
);

-- Reserved handles: existing top-level routes must never be shadowed.
create table public.reserved_handles (handle text primary key);
insert into public.reserved_handles (handle) values
  ('admin'),('studio'),('partner'),('partners'),('for-business'),
  ('checkout'),('apply'),('login'),('api'),('about'),('legal'),
  ('privacy'),('terms'),('sitemap'),('assets');

create or replace function public.enforce_handle_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.handle := lower(new.handle);
  if exists (select 1 from public.reserved_handles r where r.handle = new.handle) then
    raise exception 'handle % is reserved', new.handle;
  end if;
  if exists (select 1 from public.countries c where c.slug = new.handle) then
    raise exception 'handle % collides with a country slug', new.handle;
  end if;
  return new;
end $$;

create trigger trg_creators_handle
  before insert or update of handle on public.creators
  for each row execute function public.enforce_handle_rules();

-- ── creator_saves ────────────────────────────────────────────────
create table public.creator_saves (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  note text not null default '',
  tags text[] not null default '{}',
  sort int not null default 0,
  hidden boolean not null default false,
  source text not null default 'takeout_csv',
  created_at timestamptz not null default now(),
  unique (creator_id, business_id)
);
create index idx_creator_saves_creator on public.creator_saves (creator_id);
create index idx_creator_saves_business on public.creator_saves (business_id);

-- ── creator_imports ──────────────────────────────────────────────
create table public.creator_imports (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  filename text not null,
  list_name text,
  country_id uuid references public.countries (id),
  raw_count int not null default 0,
  matched_count int not null default 0,
  created_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'done' check (status in ('processing','done','failed')),
  created_at timestamptz not null default now()
);
create index idx_creator_imports_creator on public.creator_imports (creator_id);

-- ── businesses: enrichment columns ───────────────────────────────
alter table public.businesses
  add column if not exists google_place_id text,
  add column if not exists google_cid text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists enrich_status text
    check (enrich_status in ('pending_enrich','enriched','enrich_failed')),
  add column if not exists enrich_attempts int not null default 0,
  add column if not exists source text;

create index if not exists idx_businesses_place_id on public.businesses (google_place_id)
  where google_place_id is not null;
create index if not exists idx_businesses_cid on public.businesses (google_cid)
  where google_cid is not null;
create index if not exists idx_businesses_enrich on public.businesses (enrich_status)
  where enrich_status = 'pending_enrich';
create index if not exists idx_businesses_name_trgm on public.businesses
  using gin (lower(name) gin_trgm_ops);

-- ── RLS: creators ────────────────────────────────────────────────
alter table public.creators enable row level security;

create policy anon_read_active_creators on public.creators
  for select to anon using (status = 'active');
create policy authed_read_creators on public.creators
  for select to authenticated using (status = 'active' or id = auth.uid() or is_admin());
create policy creator_update_own on public.creators
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy admin_all_creators on public.creators
  for all to authenticated using (is_admin()) with check (is_admin());

-- Column-level: creators may only edit profile fields, never handle/status.
revoke update on public.creators from authenticated;
grant update (display_name, bio, avatar_url, ig_handle, theme, email_capture_enabled)
  on public.creators to authenticated;
-- (admin edits handle/status via service role or the admin_all policy + a
--  SECURITY DEFINER path; the column grant applies to the authenticated role,
--  so admin UI handle edits go through the edge function in Task 10.)

-- ── RLS: creator_saves ───────────────────────────────────────────
alter table public.creator_saves enable row level security;

create policy anon_read_visible_saves on public.creator_saves
  for select to anon using (
    hidden = false and exists (
      select 1 from public.creators c
      where c.id = creator_saves.creator_id and c.status = 'active')
  );
create policy authed_read_saves on public.creator_saves
  for select to authenticated using (
    creator_id = auth.uid() or is_admin() or (
      hidden = false and exists (
        select 1 from public.creators c
        where c.id = creator_saves.creator_id and c.status = 'active'))
  );
create policy creator_write_own_saves on public.creator_saves
  for all to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());
create policy admin_all_saves on public.creator_saves
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── RLS: creator_imports ─────────────────────────────────────────
alter table public.creator_imports enable row level security;
create policy creator_own_imports on public.creator_imports
  for all to authenticated
  using (creator_id = auth.uid() or is_admin())
  with check (creator_id = auth.uid() or is_admin());

-- ── RLS: businesses — additive read paths for creator-saved places ──
-- Anon must see creator-saved businesses on public creator pages even when
-- published=false (published gates COUNTRY pages, not creator pages).
create policy anon_read_creator_saved on public.businesses
  for select to anon using (
    exists (
      select 1 from public.creator_saves cs
      join public.creators c on c.id = cs.creator_id
      where cs.business_id = businesses.id
        and cs.hidden = false and c.status = 'active')
  );
create policy creator_read_own_saved on public.businesses
  for select to authenticated using (
    exists (
      select 1 from public.creator_saves cs
      where cs.business_id = businesses.id and cs.creator_id = auth.uid())
  );

-- ── reserved_handles: readable, admin-writable ───────────────────
alter table public.reserved_handles enable row level security;
create policy read_reserved on public.reserved_handles for select using (true);
create policy admin_write_reserved on public.reserved_handles
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── SECURITY FIX: newsletter_subscribers was readable by ANY
--    authenticated user (incl. anonymous checkout sessions). ──────
drop policy if exists authenticated_full_access on public.newsletter_subscribers;
create policy admin_full_access on public.newsletter_subscribers
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── Storage bucket for avatars ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('creator-assets', 'creator-assets', true)
on conflict (id) do nothing;

create policy creator_upload_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'creator-assets'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy creator_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'creator-assets'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy public_read_creator_assets on storage.objects
  for select using (bucket_id = 'creator-assets');
