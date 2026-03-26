# Maps Spexx — Travel Business Directory

## Project
Public-facing directory of travel-related businesses (restaurants, hotels, tours, etc.) organized by country. Admin panel for managing listings, CSV imports, email campaigns, and subscriber outreach.
**Supabase project:** `qbzmsvfphpfgnlztskma` | **Port:** 3013

## Commands
```bash
cd maps-spexx && npm run dev      # Vite dev server
cd maps-spexx && npm run build    # vite build (no tsc — JSX project)
cd maps-spexx && npm run lint     # ESLint
```

## Stack
- **Frontend**: React 19, Vite 7, Tailwind 4, JavaScript (JSX, not TypeScript)
- **Animations**: Framer Motion
- **Backend**: Supabase (auth + postgres)
- **Deploy**: Docker (nginx:alpine) on VPS, port 3013, Traefik reverse proxy

## Architecture
```
maps-spexx/src/
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
