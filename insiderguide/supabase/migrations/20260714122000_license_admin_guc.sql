-- Sets app.license_admin='on' for the current transaction/session so the
-- guard_newsletter_license trigger permits an 'active' transition. Callable
-- only by service_role (the edge fn); never granted to authenticated/anon.
create or replace function public.set_license_admin_guc()
returns void language sql security definer set search_path = public as $$
  select set_config('app.license_admin', 'on', false);
$$;

revoke all on function public.set_license_admin_guc() from public, anon, authenticated;
grant execute on function public.set_license_admin_guc() to service_role;
