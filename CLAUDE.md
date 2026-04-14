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
                  # EmailCapture, CampaignCreateModal, AdminRoute
  lib/            # supabase.js
  pages/          # Home, CountryGuide
  pages/admin/    # Dashboard, Login, BusinessForm, CSVImport, CampaignDetail,
                  # Country, OutreachDashboard, Subscribers
```

## Non-negotiable rules
1. **Env vars passed as Docker build args.** Never hardcode Supabase keys.
2. **Admin routes protected** by AdminRoute component.
3. **Public pages must be fast.** No unnecessary client-side fetches on initial load.
4. **Check Obsidian vault** for Supabase keys and VPS credentials.

## Brand Voice — Insider Guide
Professional, warm, travel-industry savvy. Position as a curated platform, not a review site. Outreach to hotels/restaurants/tours: brief intro of platform, what's in it for them (exposure to travelers), clear CTA to join. Personalization mandatory — reference something specific about recipient.
