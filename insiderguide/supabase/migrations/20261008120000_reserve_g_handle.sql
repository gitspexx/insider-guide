-- /g/<slug> (DM-only CTA pages) is a static-prefixed route that outranks the
-- /:slug creator catch-all, so a creator holding the handle `g` would have an
-- unreachable page. Reserve it the way /book, /call and /creators are.
-- (creators_handle_check already requires 3-30 chars, so this is belt and
-- braces — it keeps the guarantee if that constraint is ever relaxed.)
insert into public.reserved_handles (handle) values ('g')
on conflict (handle) do nothing;
