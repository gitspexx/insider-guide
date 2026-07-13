-- insiderguide/supabase/migrations/20260713122000_enrich_cron.sql
-- Cron drain for pending_enrich stubs. The real secret is applied out-of-band;
-- this committed file intentionally holds a placeholder.
create schema if not exists private;

create or replace function private.enrich_places_ping()
returns void language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://qbzmsvfphpfgnlztskma.supabase.co/functions/v1/enrich-places',
    headers := jsonb_build_object('x-enrich-secret', '<ENRICH_SECRET>'),
    body := '{}'::jsonb);
end $$;

revoke all on function private.enrich_places_ping() from public, anon, authenticated;

select cron.schedule('enrich-places-drain', '*/5 * * * *', 'select private.enrich_places_ping()');

-- Follow-up from Task 2 review: tighten the pg_trgm % prefilter to match the
-- 0.55 recheck. A function-level `SET pg_trgm.similarity_threshold` was denied by
-- Supabase, so instead call set_limit(0.55) at the top of each import function
-- (right after the active-creator check). Below are preview_import and
-- commit_import re-created UNCHANGED except that one added line. These contain no
-- secrets and are committed as-is.

CREATE OR REPLACE FUNCTION public.preview_import(p_country_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  perform set_limit(0.55);
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
end $function$;

CREATE OR REPLACE FUNCTION public.commit_import(p_country_id uuid, p_filename text, p_list_name text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  perform set_limit(0.55);
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
end $function$;
