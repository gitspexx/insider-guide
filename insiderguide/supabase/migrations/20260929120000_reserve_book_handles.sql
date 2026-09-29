-- /book and /call are static routes that outrank the /:slug creator catch-all,
-- so a creator who took either handle would have an unreachable page. Reserve
-- them the way the other static routes are (creator_platform migration).
insert into public.reserved_handles (handle) values ('book'), ('call')
on conflict (handle) do nothing;
