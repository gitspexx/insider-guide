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
--
-- SHIP ORDER: this migration must be applied BEFORE feat/creator-apply-page
-- reaches main. Merging to main auto-deploys the frontend (../.github/workflows/
-- deploy.yml, push → git pull → docker compose build/up) and that workflow has
-- no migration step, so a merge ahead of this file publishes /creators — which
-- is in sitemap.xml — against a table PostgREST cannot see. scripts/
-- preflight-schema.mjs fails the build when that is the case; see
-- docs/deploy-runbook.md.

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

-- Length caps rather than bare text: the caps bound a single ROW. They do NOT
-- bound a single POST — PostgREST turns a JSON array body into one multi-row
-- INSERT, so with caps alone one unauthenticated request could store thousands
-- of rows. creator_applications_one_per_statement below is what bounds the
-- request; the caps bound the row inside it.
--
-- Still no unique constraint on email. A duplicate-key error would turn the
-- insert into an existence oracle ("this address already applied"), which anon
-- has no other way to ask. creator_applications_dedupe below gets replay
-- idempotence without that leak by returning NULL instead of raising.

create index if not exists idx_creator_applications_status
  on public.creator_applications (status, created_at desc);

-- Serves the dedupe trigger and the notify-creator-application lookup, both of
-- which key on (email, status='pending').
create index if not exists idx_creator_applications_pending_email
  on public.creator_applications (email) where status = 'pending';

-- One application per INSERT statement. A FOR EACH ROW trigger cannot tell a
-- one-row POST from row 1 of 5000; the statement's transition table can.
-- No exemption for admins or service_role: nothing bulk-loads this table, and
-- an unconditional rule needs no reasoning about who the caller is.
create or replace function public.creator_applications_one_per_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from inserted) > 1 then
    raise exception 'creator_applications accepts one application per request'
      using errcode = '22023';
  end if;
  return null;
end $$;

revoke all on function public.creator_applications_one_per_statement()
  from public, anon, authenticated;

drop trigger if exists creator_applications_one_per_statement
  on public.creator_applications;
create trigger creator_applications_one_per_statement
  after insert on public.creator_applications
  referencing new table as inserted
  for each statement
  execute function public.creator_applications_one_per_statement();

-- Normalise the address, then swallow a resubmission that duplicates an
-- application still awaiting review. Returning NULL makes the duplicate a
-- silent no-op, and PostgREST answers 201 with an empty body either way, so a
-- replayed POST is idempotent without telling the caller whether the address
-- was already on file. Only pending rows dedupe — someone rejected in March is
-- free to apply again in June.
--
-- SECURITY DEFINER because the lookup needs SELECT on a table anon is
-- deliberately not granted SELECT on.
create or replace function public.creator_applications_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));
  if exists (
    select 1 from public.creator_applications
     where email = new.email and status = 'pending'
  ) then
    return null;
  end if;
  return new;
end $$;

revoke all on function public.creator_applications_dedupe()
  from public, anon, authenticated;

drop trigger if exists creator_applications_dedupe
  on public.creator_applications;
create trigger creator_applications_dedupe
  before insert on public.creator_applications
  for each row
  execute function public.creator_applications_dedupe();

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

-- Spam that gets past the guards has to be removable from the admin list.
-- Without DELETE the only cleanup path is a SQL console, so the queue would
-- stay dirty forever. admin_all_creator_applications gates the rows; anon is
-- granted nothing.
grant delete on public.creator_applications to authenticated;

-- /creators is a real route now, and RR7 ranks a static segment above the
-- /:slug catch-all — a creator holding that handle would be unreachable.
-- ('apply' was already seeded by creator_platform.sql.)
insert into public.reserved_handles (handle) values ('creators')
on conflict (handle) do nothing;
