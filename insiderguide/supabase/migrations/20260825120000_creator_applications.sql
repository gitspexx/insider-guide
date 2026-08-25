-- Creator applications: storage for the public /creators (+ /apply) form.
--
-- Deliberately NOT the businesses + '[partner-signup]' notes-marker pattern
-- used by /partner. That pattern works there because the application row IS
-- the eventual listing — approval just flips published. A creator application
-- has no such target row: approval creates an auth user + a creators row via
-- the invite-creator edge fn. Filing creator applicants as businesses would
-- put non-businesses in the directory and surface them as business
-- applications in both admin/Applications.jsx and creator_pending_approvals(),
-- which select on that marker. A creators row can't hold them either — the
-- status check allows only invited/active/paused, and every creators row
-- burns a globally unique handle.
--
-- Shape follows claim_requests (creator_scoped_v3.sql): anon INSERT only,
-- column-scoped grants, no anon SELECT.

create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  social_handle text not null default '' check (char_length(social_handle) <= 200),
  country_id uuid references public.countries (id),
  city text not null default '' check (char_length(city) <= 120),
  -- Scheme pinned in the column, not just the form: a reviewer clicks this
  -- link out of the admin list, and the client-side check is bypassable by
  -- POSTing straight at PostgREST. Blocks javascript:/data: payloads at rest.
  list_url text not null default ''
    check (list_url = '' or (char_length(list_url) <= 500 and list_url ~* '^https?://')),
  pitch text not null default '' check (char_length(pitch) <= 4000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_notes text not null default '',
  created_at timestamptz not null default now()
);

-- Length caps rather than bare text: the table is writable by anon, so the
-- caps bound what a single unauthenticated POST can store.
--
-- No unique constraint on email on purpose. Anon cannot read this table, and a
-- duplicate-key error would turn the insert into an existence oracle ("this
-- address already applied"). Re-applications are deduped by the reviewer.

create index if not exists idx_creator_applications_status
  on public.creator_applications (status, created_at desc);

alter table public.creator_applications enable row level security;

-- anon AND authenticated: /checkout mints an anonymous session whose JWT role
-- is `authenticated` and persists in localStorage, so a visitor who ever
-- opened checkout arrives here as authenticated. Omitting that role is the
-- exact bug fix_application_rls_authenticated.sql had to ship for /partner.
create policy anon_insert_creator_application on public.creator_applications
  for insert to anon, authenticated
  with check (status = 'pending');

create policy admin_all_creator_applications on public.creator_applications
  for all to authenticated using (is_admin()) with check (is_admin());

revoke all on public.creator_applications from anon, authenticated;

-- status and reviewer_notes are withheld from the INSERT grant, so a crafted
-- submission naming either one fails on column permissions before RLS is even
-- consulted. The WITH CHECK above is the second lock on the same door.
grant insert (full_name, email, social_handle, country_id, city, list_url, pitch)
  on public.creator_applications to anon, authenticated;

-- No SELECT for anon — the table is a list of applicant email addresses.
-- Reviewer reads and triage run as authenticated with rows gated by
-- admin_all_creator_applications.
grant select on public.creator_applications to authenticated;
grant update (status, reviewer_notes) on public.creator_applications to authenticated;

-- /creators is a real route now, and RR7 ranks a static segment above the
-- /:slug catch-all — a creator holding that handle would be unreachable.
-- ('apply' was already seeded by creator_platform.sql.)
insert into public.reserved_handles (handle) values ('creators')
on conflict (handle) do nothing;
