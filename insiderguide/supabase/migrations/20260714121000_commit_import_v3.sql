-- commit_import v3: same as v2 (all hardening kept) + outreach tagging.
-- After saving each business (matched or newly created), if the business is NOT
-- tier-paid, ensure outreach_status='to_contact' (only bumped when currently
-- null/'none'/'') and append an idempotent notes marker '[creator-import @handle]'.

create or replace function public.commit_import(
  p_country_id uuid,
  p_filename text,
  p_list_name text,
  p_rows jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
  v_creator uuid;
  v_handle  text;
  v_import  uuid;
  r jsonb;
  v_bid uuid;
  v_is_new boolean;
  v_matched int := 0;
  v_created int := 0;
  v_failed  int := 0;
  v_marker  text;
begin
  select id, handle into v_creator, v_handle from creators
   where id = auth.uid() and status = 'active';
  if v_creator is null then
    raise exception 'not an active creator';
  end if;
  v_marker := '[creator-import @' || v_handle || ']';

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

      -- ── Outreach tagging (V2) ──────────────────────────────────
      -- Only for businesses that have NOT paid for a tier. Bump status to
      -- 'to_contact' only when it's currently null/'none'/'' (never override
      -- 'replied'/'won'/etc). Append the handle marker once (idempotent).
      update businesses b
         set outreach_status = case
               when coalesce(b.outreach_status,'') in ('','none') then 'to_contact'
               else b.outreach_status end,
             notes = case
               when coalesce(b.notes,'') like '%' || v_marker || '%' then b.notes
               else nullif(trim(coalesce(b.notes,'') || ' ' || v_marker), '') end
       where b.id = v_bid
         and coalesce(b.tier_paid,false) = false;

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

revoke all on function public.commit_import(uuid, text, text, jsonb) from public, anon;
grant execute on function public.commit_import(uuid, text, text, jsonb) to authenticated;
