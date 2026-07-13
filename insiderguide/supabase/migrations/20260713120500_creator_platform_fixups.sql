-- Fix-ups from Task 1 security review (original migration already live).

-- I-1/I-2: replace blanket FOR ALL write policy. INSERTs go only through
-- the SECURITY DEFINER commit_import RPC; direct writes are UPDATE/DELETE
-- for active creators, and UPDATE is column-restricted so business_id and
-- creator_id are immutable to the authenticated role.
drop policy creator_write_own_saves on public.creator_saves;

create policy creator_update_own_saves on public.creator_saves
  for update to authenticated
  using (creator_id = auth.uid()
         and exists (select 1 from public.creators c
                     where c.id = auth.uid() and c.status = 'active'))
  with check (creator_id = auth.uid());

create policy creator_delete_own_saves on public.creator_saves
  for delete to authenticated
  using (creator_id = auth.uid()
         and exists (select 1 from public.creators c
                     where c.id = auth.uid() and c.status = 'active'));

revoke update on public.creator_saves from authenticated;
grant update (note, tags, sort, hidden) on public.creator_saves to authenticated;

-- M-1: trigger function must not be RPC-callable.
revoke execute on function public.enforce_handle_rules() from public, anon, authenticated;

-- M-2: public buckets serve object URLs without a SELECT policy; the broad
-- SELECT policy only enabled bucket LISTING. Drop it, add owner DELETE.
drop policy public_read_creator_assets on storage.objects;

create policy creator_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'creator-assets'
         and (storage.foldername(name))[1] = auth.uid()::text);
