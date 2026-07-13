# Insider Guide — Travel Business Directory

## Project
Public-facing directory of travel-related businesses (restaurants, hotels, tours, etc.) organized by country. Admin panel for managing listings, CSV imports, email campaigns, and subscriber outreach.
**URL:** https://insider-guide.spexx.cloud (maps.spexx.cloud redirects here)
**Supabase project:** `qbzmsvfphpfgnlztskma` (shared with spexx-crm) | **Port:** 3013 (back), 3019 (front)

## Commands
```bash
cd insiderguide && npm run dev      # Vite dev server
cd insiderguide && npm run build    # vite build (no tsc — JSX project)
cd insiderguide && npm run lint     # ESLint
```

## Stack
- **Frontend**: React 19, Vite 7, Tailwind 4, JavaScript (JSX, not TypeScript)
- **Animations**: Framer Motion
- **Backend**: Supabase (auth + postgres)
- **Deploy**: Docker (nginx:alpine) on VPS, port 3013, Traefik reverse proxy

## Architecture
```
insiderguide/src/
  components/     # BusinessCard, CategoryFilter, LocationFilter, PaywallModal,
                  # EmailCapture(Popup), CampaignCreateModal, AdminRoute,
                  # CreatorRoute, creator/CreatorMap (maplibre, lazy chunk)
  lib/            # supabase.js, themes.js (creator presets), takeoutParser.js
  pages/          # Home, CountryGuide, CreatorPage
  pages/studio/   # Login (magic link), StudioLayout, MySpots, Import, Settings
  pages/admin/    # Dashboard, Login, BusinessForm, CSVImport, CampaignDetail,
                  # Country, OutreachDashboard, Subscribers, Creators
```

## Creator platform (V1, shipped 2026-07-13)
- Creator pages resolve at bare `/<handle>` AND `/@<handle>` — dispatched through
  the `/:slug` catch-all (CountryGuide country-miss → CreatorPage inline).
  React-router v7 CANNOT param-match `/@:handle` — do not re-add that route.
- Creators (invite-only) may NOT read `businesses` directly. Public reads go
  through `creator_saved_businesses`; studio reads through `my_saved_businesses`
  (definer-style column-allowlist views — do NOT add `security_invoker=on`,
  that would re-hide unpublished stubs). Imports go only through the
  `preview_import`/`commit_import` SECURITY DEFINER RPCs.
- Enrichment: `enrich-places` edge fn drained by pg_cron `enrich-places-drain`
  (*/5 min, secret in `private.enrich_places_ping()`). Requires funded
  Outscraper account. Failed stubs: reset `enrich_status='pending_enrich',
  enrich_attempts=0`.
- Admin edits to creators.handle/status only via `invite-creator` edge fn
  (column grants block them for the authenticated role by design).

## Non-negotiable rules
1. **Env vars passed as Docker build args.** Never hardcode Supabase keys.
2. **Admin routes protected** by AdminRoute component.
3. **Public pages must be fast.** No unnecessary client-side fetches on initial load.
4. **Check Obsidian vault** for Supabase keys and VPS credentials.

## Brand Voice — Insider Guide
Professional, warm, travel-industry savvy. Position as a curated platform, not a review site. Outreach to hotels/restaurants/tours: brief intro of platform, what's in it for them (exposure to travelers), clear CTA to join. Personalization mandatory — reference something specific about recipient.
