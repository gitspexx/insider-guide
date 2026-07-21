-- The /checkout page mints an anonymous auth session (signInAnonymously) whose
-- JWT role is 'authenticated', and it persists in localStorage. Any visitor who
-- ever opened checkout — or a logged-in creator — then hits the /partner form
-- with role=authenticated, where only the is_admin() policy existed → "new row
-- violates row-level security policy". Reported live by an applicant 07-21.
--
-- Extend the three application-insert policies to authenticated. Their CHECK
-- expressions stay unchanged (unpublished, tier='listed', marker-prefixed
-- notes), so a non-admin authenticated user still can't create anything else.
alter policy anon_insert_partner_signup_insiderguide on public.businesses to anon, authenticated;
alter policy anon_insert_paid_pending_insiderguide on public.businesses to anon, authenticated;
alter policy anon_insert_partner_signup_kollably on public.businesses to anon, authenticated;
