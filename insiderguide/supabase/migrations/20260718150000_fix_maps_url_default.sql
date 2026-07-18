-- The google_maps_url column defaulted to '' (empty string). The dedup index
-- idx_businesses_url_country is partial on IS NOT NULL, so '' rows ARE indexed
-- — meaning only ONE row without a maps URL could exist per country. This
-- broke the /partner application form and the /checkout pending row for every
-- applicant after the first ("duplicate key ... idx_businesses_url_country").
alter table public.businesses alter column google_maps_url set default null;
update public.businesses set google_maps_url = null where google_maps_url = '';
