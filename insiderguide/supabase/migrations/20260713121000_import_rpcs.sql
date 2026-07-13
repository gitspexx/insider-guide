-- Import pipeline RPCs. SECURITY DEFINER because creators cannot (and must
-- not) SELECT/INSERT the whole businesses catalog directly.

-- Row shape (jsonb array elements) coming from the client parser:
-- { "title": text, "note": text, "url": text,
--   "cid": text|null, "place_id": text|null, "lat": num|null, "lng": num|null }

create or replace function public.preview_import(p_country_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
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
          and similarity(lower(name), lower(r->>'title')) > 0.55
        order by similarity(lower(name), lower(r->>'title')) desc
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

-- Commit: creates the import record, stub businesses for unmatched rows,
-- and creator_saves for everything. Idempotent per (creator, business).
create or replace function public.commit_import(
  p_country_id uuid,
  p_filename text,
  p_list_name text,
  p_rows jsonb   -- preview rows, each with match_business_id possibly null,
                 -- fuzzy matches the creator rejected arrive with
                 -- match_business_id stripped by the client
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_creator uuid;
  v_import uuid;
  r jsonb;
  v_bid uuid;
  v_matched int := 0;
  v_created int := 0;
  v_failed int := 0;
begin
  select id into v_creator from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
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

      if v_bid is null then
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
        v_created := v_created + 1;
      else
        v_matched := v_matched + 1;
      end if;

      insert into creator_saves (creator_id, business_id, note, source)
      values (v_creator, v_bid, coalesce(left(r->>'note', 2000), ''), 'takeout_csv')
      on conflict (creator_id, business_id)
      do update set note = excluded.note;
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

revoke all on function public.preview_import(uuid, jsonb) from public, anon;
revoke all on function public.commit_import(uuid, text, text, jsonb) from public, anon;
grant execute on function public.preview_import(uuid, jsonb) to authenticated;
grant execute on function public.commit_import(uuid, text, text, jsonb) to authenticated;
