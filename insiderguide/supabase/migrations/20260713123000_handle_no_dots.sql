-- Final-review fix: dots in handles collide with nginx's static-extension
-- 404 rule (a handle like "guide.txt" matches `location ~* \.(json|xml|txt|map)$`
-- and the SPA never loads). Disallow dots going forward; no dotted handles exist.
alter table public.creators drop constraint creators_handle_check;
alter table public.creators add constraint creators_handle_check
  check (handle ~ '^[a-z0-9_]{3,30}$');
