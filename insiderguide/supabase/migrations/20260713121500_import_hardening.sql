-- Task 2 hardening (from security review): column-allowlisted views replace
-- whole-row businesses exposure; commit_import validates claimed matches;
-- preview_import fuzzy match uses the trigram index; input guards.

-- ── C-1 fix A: column-allowlisted projections ────────────────────
-- These views are intentionally definer-style (owner=postgres bypasses the
-- base table's RLS): they exist precisely to project a SAFE column subset
-- of rows the base-table RLS would otherwise hide or over-expose.
-- Supabase's security_definer_view lint flagging them is expected.

create view public.creator_saved_businesses as
  select b.id, b.country_id, b.name, b.category, b.description, b.location,
         b.city, b.google_maps_url, b.instagram_handle, b.website, b.tier,
         b.photo_url, b.recommended_badge, b.lat, b.lng, b.enrich_status
  from public.businesses b
  where exists (
    select 1 from public.creator_saves cs
    join public.creators c on c.id = cs.creator_id
    where cs.business_id = b.id and cs.hidden = false and c.status = 'active');

revoke all on public.creator_saved_businesses from public;
grant select on public.creator_saved_businesses to anon, authenticated;

-- Studio view: the owner's own saves incl. hidden ones.
create view public.my_saved_businesses as
  select b.id, b.country_id, b.name, b.category, b.description, b.location,
         b.city, b.google_maps_url, b.instagram_handle, b.website, b.tier,
         b.photo_url, b.recommended_badge, b.lat, b.lng, b.enrich_status
  from public.businesses b
  where exists (
    select 1 from public.creator_saves cs
    where cs.business_id = b.id and cs.creator_id = auth.uid());

revoke all on public.my_saved_businesses from public;
grant select on public.my_saved_businesses to authenticated;

-- Drop the whole-row exposure policies the views replace.
drop policy anon_read_creator_saved on public.businesses;
drop policy creator_read_own_saved on public.businesses;

-- ── preview_import: guards + index-accelerated fuzzy ─────────────
create or replace function public.preview_import(p_country_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
-- NOTE: `set pg_trgm.similarity_threshold = 0.55` was planned here but the
-- Supabase postgres role gets "permission denied to set parameter" for it.
-- The default threshold (0.3) makes `%` a looser index prefilter; the
-- explicit `similarity(...) > 0.55` recheck below enforces the real cutoff.
as $$
declare
  v_creator uuid;
  r jsonb;
  v_match uuid;
  v_match_name text;
  v_match_kind text;
  v_out jsonb := '[]'::jsonb;
begin
  select id into v_creator from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too many rows in one import';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_match := null; v_match_kind := null; v_match_name := null;

    if coalesce(r->>'place_id','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where google_place_id = r->>'place_id' limit 1;
      if v_match is not null then v_match_kind := 'place_id'; end if;
    end if;

    if v_match is null and coalesce(r->>'cid','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where google_cid = r->>'cid' limit 1;
      if v_match is not null then v_match_kind := 'cid'; end if;
    end if;

    if v_match is null and coalesce(r->>'title','') <> '' then
      select id, name into v_match, v_match_name from businesses
        where country_id = p_country_id
          and lower(name) % lower(r->>'title')
          and similarity(lower(name), lower(r->>'title')) > 0.55
        order by lower(name) <-> lower(r->>'title')
        limit 1;
      if v_match is not null then v_match_kind := 'fuzzy'; end if;
    end if;

    v_out := v_out || jsonb_build_array(
      r || jsonb_build_object(
        'match_business_id', v_match,
        'match_name', v_match_name,
        'match_kind', v_match_kind));
  end loop;

  return v_out;
end $$;

-- ── commit_import: match validation, dup reuse, accurate counts ──
create or replace function public.commit_import(
  p_country_id uuid,
  p_filename text,
  p_list_name text,
  p_rows jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_creator uuid;
  v_import uuid;
  r jsonb;
  v_bid uuid;
  v_is_new boolean;
  v_matched int := 0;
  v_created int := 0;
  v_failed int := 0;
begin
  select id into v_creator from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;
  if not exists (select 1 from countries where id = p_country_id) then
    raise exception 'unknown country';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too many rows in one import';
  end if;

  insert into creator_imports (creator_id, filename, list_name, country_id,
                               raw_count, status)
  values (v_creator, p_filename, p_list_name, p_country_id,
          jsonb_array_length(p_rows), 'processing')
  returning id into v_import;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if coalesce(r->>'title','') = '' then
        v_failed := v_failed + 1; continue;
      end if;
      v_bid := nullif(r->>'match_business_id','')::uuid;
      v_is_new := false;

      if v_bid is not null then
        -- Re-verify the claimed match server-side; reject spoofed ids.
        perform 1 from businesses b
         where b.id = v_bid
           and b.country_id = p_country_id
           and (
                (nullif(r->>'place_id','') is not null and b.google_place_id = r->>'place_id')
             or (nullif(r->>'cid','')      is not null and b.google_cid      = r->>'cid')
             or similarity(lower(b.name), lower(r->>'title')) > 0.55
           );
        if not found then
          v_failed := v_failed + 1; continue;
        end if;
      else
        begin
          insert into businesses (country_id, name, google_maps_url,
                                  google_place_id, google_cid, lat, lng,
                                  tier, published, enrich_status, source)
          values (p_country_id,
                  left(r->>'title', 200),
                  r->>'url',
                  nullif(r->>'place_id',''),
                  nullif(r->>'cid',''),
                  nullif(r->>'lat','')::double precision,
                  nullif(r->>'lng','')::double precision,
                  'listed', false, 'pending_enrich', 'creator_import')
          returning id into v_bid;
          v_is_new := true;
        exception when unique_violation then
          -- Duplicate URL within country: reuse the existing row.
          select id into v_bid from businesses
           where google_maps_url = r->>'url' and country_id = p_country_id
           limit 1;
          if v_bid is null then
            v_failed := v_failed + 1; continue;
          end if;
        end;
      end if;

      insert into creator_saves (creator_id, business_id, note, source)
      values (v_creator, v_bid, coalesce(left(r->>'note', 2000), ''), 'takeout_csv')
      on conflict (creator_id, business_id)
      do update set note = excluded.note;

      if v_is_new then v_created := v_created + 1;
      else v_matched := v_matched + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  update creator_imports
     set matched_count = v_matched, created_count = v_created,
         failed_count = v_failed, status = 'done'
   where id = v_import;

  return jsonb_build_object('import_id', v_import, 'matched', v_matched,
                            'created', v_created, 'failed', v_failed);
end $$;
