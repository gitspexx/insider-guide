-- Task 1 review fix-ups: Supabase default-grants DML on new tables/views to
-- authenticated; RLS already blocks these paths, but revoke at the grant
-- layer too (defence-in-depth — same pattern as creator_requests).
revoke insert, update, delete, truncate on public.creator_deals from authenticated;
revoke insert, update, delete, truncate on public.my_leads from authenticated;
