-- Call requests: storage for the public /book form.
--
-- /book is an availability REQUEST, not a booked slot. Nothing here reserves
-- anything, so the table holds no start time and no duration — it holds the
-- windows a prospect offered plus the zone they are in, and a person picks from
-- that. Reintroducing a timestamp column would invite a calendar UI, which is
-- the thing /book exists to avoid.
--
-- Shape follows creator_applications.sql, which followed claim_requests
-- (creator_scoped_v3.sql): anon INSERT only, column-scoped grants, no anon
-- SELECT, one row per statement, pending-duplicate dedupe. Every comment there
-- about why each lock exists applies here; the notes below cover only what is
-- different because of the arrays.
--
-- SHIP ORDER: this migration must be applied BEFORE feat/ig-book-a-call reaches
-- main. Merging to main auto-deploys the frontend (../.github/workflows/
-- deploy.yml, push → git pull → docker compose build/up) and that workflow has
-- no migration step, so a merge ahead of this file publishes /book against a
-- table PostgREST cannot see. scripts/preflight-schema.mjs fails the build when
-- that is the case; see docs/deploy-runbook.md.

create table if not exists public.call_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 4000),

  -- cardinality(), not array_length(): array_length('{}', 1) is NULL, and a NULL
  -- CHECK passes, so `array_length(days,1) between 1 and 7` would happily store
  -- a request with no days in it — which is the one thing this row must carry.
  -- `<@` then pins the vocabulary to the ids in src/lib/availability.js. A
  -- request naming a day nobody can read is worse than a rejected insert.
  days text[] not null check (
    cardinality(days) between 1 and 7
    and days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
  ),
  times text[] not null check (
    cardinality(times) between 1 and 3
    and times <@ array['morning','afternoon','evening']::text[]
  ),

  -- An IANA zone name. Only the shape is checked here: the definitive test is
  -- `new Intl.DateTimeFormat(…, { timeZone })` on the client (isValidTimezone in
  -- src/lib/availability.js), and Postgres has no cheap equivalent that is safe
  -- inside a CHECK. The cap and the character class stop the column being a
  -- free-text field in disguise.
  timezone text not null check (
    char_length(timezone) between 1 and 64 and timezone ~ '^[A-Za-z0-9_+/-]+$'
  ),

  email text not null check (char_length(email) between 3 and 254),

  -- Optional channels. Both patterns are the same ones the form enforces, pinned
  -- in the column because the client-side check is bypassable by POSTing
  -- straight at PostgREST. A WhatsApp number without its country code is not
  -- dialable from wherever the call is being made from, so the leading + is
  -- required rather than encouraged.
  whatsapp text not null default ''
    check (whatsapp = '' or whatsapp ~ '^\+[0-9][0-9 ().-]{6,24}$'),
  instagram text not null default ''
    check (instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),

  status text not null default 'pending'
    check (status in ('pending','scheduled','done','dropped')),
  reviewer_notes text not null default '',
  created_at timestamptz not null default now()
);

-- Length caps bound a single ROW, not a single POST — PostgREST turns a JSON
-- array body into one multi-row INSERT. call_requests_one_per_statement below is
-- what bounds the request.
--
-- No unique constraint on email: a duplicate-key error would turn the insert
-- into an existence oracle ("this address already asked for a call"), which anon
-- has no other way to ask. call_requests_dedupe gets replay idempotence without
-- that leak by returning NULL instead of raising.

create index if not exists idx_call_requests_status
  on public.call_requests (status, created_at desc);

-- Serves the dedupe trigger and the notify-call-request lookup, both of which
-- key on (email, status='pending').
create index if not exists idx_call_requests_pending_email
  on public.call_requests (email) where status = 'pending';

-- One request per INSERT statement. A FOR EACH ROW trigger cannot tell a one-row
-- POST from row 1 of 5000; the statement's transition table can. No exemption
-- for admins or service_role: nothing bulk-loads this table.
create or replace function public.call_requests_one_per_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from inserted) > 1 then
    raise exception 'call_requests accepts one request per submission'
      using errcode = '22023';
  end if;
  return null;
end $$;

revoke all on function public.call_requests_one_per_statement()
  from public, anon, authenticated;

drop trigger if exists call_requests_one_per_statement
  on public.call_requests;
create trigger call_requests_one_per_statement
  after insert on public.call_requests
  referencing new table as inserted
  for each statement
  execute function public.call_requests_one_per_statement();

-- Normalise, then swallow a resubmission that duplicates a request still
-- awaiting a reply. Returning NULL makes the duplicate a silent no-op, and
-- PostgREST answers 201 with an empty body either way, so a double-tapped submit
-- is idempotent without telling the caller whether the address is already on
-- file. Only pending rows dedupe — someone we spoke to in March is free to ask
-- for another call in June.
--
-- The array normalisation lives here because a CHECK constraint cannot express
-- "no duplicates" (no subqueries allowed in one) and cannot reorder anything at
-- all. Canonical week order is not cosmetic: the admin list and the notification
-- email both read these verbatim, and "Fri, Mon" invites a misread.
--
-- SECURITY DEFINER because the lookup needs SELECT on a table anon is
-- deliberately not granted SELECT on.
create or replace function public.call_requests_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));
  new.timezone := btrim(new.timezone);

  new.days := array(
    select d from unnest(new.days) as d
    group by d
    order by array_position(array['mon','tue','wed','thu','fri','sat','sun']::text[], d)
  );
  new.times := array(
    select t from unnest(new.times) as t
    group by t
    order by array_position(array['morning','afternoon','evening']::text[], t)
  );

  if exists (
    select 1 from public.call_requests
     where email = new.email and status = 'pending'
  ) then
    return null;
  end if;
  return new;
end $$;

revoke all on function public.call_requests_dedupe()
  from public, anon, authenticated;

drop trigger if exists call_requests_dedupe
  on public.call_requests;
create trigger call_requests_dedupe
  before insert on public.call_requests
  for each row
  execute function public.call_requests_dedupe();

alter table public.call_requests enable row level security;

-- anon AND authenticated: /checkout mints an anonymous session whose JWT role is
-- `authenticated` and persists in localStorage, so a visitor who ever opened
-- checkout arrives here as authenticated. Omitting that role is the exact bug
-- fix_application_rls_authenticated.sql had to ship for /partner — and a
-- prospect who priced a placement before asking to talk is the likeliest
-- visitor this page has.
create policy anon_insert_call_request on public.call_requests
  for insert to anon, authenticated
  with check (status = 'pending');

create policy admin_all_call_requests on public.call_requests
  for all to authenticated using (is_admin()) with check (is_admin());

revoke all on public.call_requests from anon, authenticated;

-- status and reviewer_notes are withheld from the INSERT grant, so a crafted
-- submission naming either one fails on column permissions before RLS is even
-- consulted. The WITH CHECK above is the second lock on the same door.
grant insert (name, topic, days, times, timezone, email, whatsapp, instagram)
  on public.call_requests to anon, authenticated;

-- No SELECT for anon — the table is a list of prospect contact details. Reads
-- run as authenticated with rows gated by admin_all_call_requests.
grant select on public.call_requests to authenticated;
grant update (status, reviewer_notes) on public.call_requests to authenticated;

-- Spam that gets past the guards has to be removable without a SQL console.
grant delete on public.call_requests to authenticated;

-- /book is a real route now, and RR7 ranks a static segment above the /:slug
-- catch-all — a creator holding that handle would be unreachable.
insert into public.reserved_handles (handle) values ('book')
on conflict (handle) do nothing;
