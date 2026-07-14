-- Fix from Task 8 e2e: setting the app.license_admin GUC and the UPDATE in two
-- separate PostgREST calls lands on different pooled sessions, so the guard
-- trigger never sees the bypass. Do both in ONE transaction-scoped function.
create or replace function public.admin_set_license(p_creator_id uuid, p_status text)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if p_status not in ('none','requested','active') then
    raise exception 'invalid license status %', p_status;
  end if;
  perform set_config('app.license_admin', 'on', true); -- txn-local, same session as the UPDATE
  update creators set newsletter_license = p_status where id = p_creator_id;
  if not found then
    raise exception 'creator not found';
  end if;
  return p_status;
end $$;

revoke all on function public.admin_set_license(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_license(uuid, text) to service_role;
