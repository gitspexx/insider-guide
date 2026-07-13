# InsiderGuide Creator Platform — V1 Design (Subsystems A+B)

**Date:** 2026-07-13
**Status:** Approved by Alex
**Scope:** Creator accounts + multi-tenant public pages + Google Maps import wizard

## Vision context

InsiderGuide.co becomes a hub for travel creators: each creator gets a public page
(`insiderguide.co/@handle`) showing their saved spots, imported from Google Maps.
Later cycles add business auto-outreach, partner-tier revenue share with creators,
and reel-collab tiers. Full roadmap decomposition:

| # | Subsystem | Cycle |
|---|-----------|-------|
| A | Creator accounts + `/@handle` public pages + theming | **this spec** |
| B | Google Maps import wizard (Takeout → places) | **this spec** |
| C | Auto-verify + enrich imported businesses | next |
| D | Auto-outreach → partner offers per creator | next |
| E | Rev-share ledger + payouts + per-creator slot checkout | later |
| F | Reel collab tier + advanced creator analytics | later |

**V1 goal:** prove creators want this and audiences browse it. 2–3 real creators
live (Alex, Filippo, possibly one more). Outreach and rev-share remain manual
behind the scenes.

## Decisions made

1. **V1 scope = A+B only** — creator pages live, money loop deferred.
2. **Canonical places model** — one `businesses` row per real-world place,
   `creator_saves` join table for per-creator notes. Chosen over isolated
   per-creator copies to avoid duplicate outreach and messy country aggregation,
   and because partner deals later price per creator slot.
3. **Invite-only creators** — admin seeds accounts; public "apply" form collects
   waitlist. No open signup, no moderation queue in V1.
4. **List + map page format** — MapLibre GL + free OSM raster tiles (zero API
   billing). Travel audiences expect a map.
5. **Extend existing app** — same repo (`insider-guide/insiderguide`), same
   Supabase project (`qbzmsvfphpfgnlztskma`, shared with spexx-crm). Reuses the
   existing businesses catalog, country pages, Stripe checkout, CI deploy.

## 1. Data model

All in Supabase project `qbzmsvfphpfgnlztskma`. This project is shared with
spexx-crm — the `is_admin()` gate on CRM tables must never be loosened.

### New tables

**`creators`**
| column | type | notes |
|---|---|---|
| id | uuid PK | equals `auth.users.id` (FK allowed — same project) |
| handle | text unique | lowercase, `^[a-z0-9_\.]{3,30}$`, reserved list (admin, partner, checkout, etc.) |
| display_name | text | |
| bio | text | |
| avatar_url | text | Supabase storage |
| ig_handle | text | |
| theme | jsonb | `{ palette: <preset-key>, fonts: <preset-key> }` |
| email_capture_enabled | boolean default false | |
| status | text | `invited` / `active` / `paused` |
| created_at | timestamptz | |

**`creator_saves`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK → creators | |
| business_id | uuid FK → businesses | |
| note | text | creator's personal note (from Takeout or edited) |
| tags | text[] | optional |
| sort | int | manual ordering within page |
| hidden | boolean default false | creator can hide without deleting |
| source | text | `takeout_csv` for V1 |
| created_at | timestamptz | |

Unique constraint on `(creator_id, business_id)`.

**`creator_imports`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK | |
| filename | text | |
| list_name | text | Takeout list title |
| raw_count | int | rows in CSV |
| matched_count | int | matched to existing businesses |
| created_count | int | new stub businesses created |
| failed_count | int | unparseable rows |
| status | text | `processing` / `done` / `failed` |
| created_at | timestamptz | |

### `businesses` table additions

- `google_place_id` text (indexed; dedup key #1)
- `lat` / `lng` double precision (needed for map pins) — add only if not already present
- `enrich_status` text: `enriched` / `pending_enrich` / `enrich_failed` (stub rows created by imports start as `pending_enrich`)
- `source` text tag (e.g. `creator_import`) if not already present

Dedup matching order at import time:
1. `google_place_id` exact
2. CID extracted from Google Maps URL
3. Name + country fuzzy match (trigram similarity, high threshold, preview-confirmed by creator)

### RLS

- `creators`: public SELECT where `status = 'active'`; owner UPDATE own row
  (except `status`, `handle` — admin-only changes); admin full.
- `creator_saves`: public SELECT where creator active AND `hidden = false`;
  owner INSERT/UPDATE/DELETE own rows; admin full.
- `creator_imports`: owner SELECT/INSERT own; admin full.
- `businesses`: public SELECT already exists; creators get INSERT restricted to
  stub shape (via SECURITY DEFINER function or edge function — NOT blanket
  INSERT policy) so junk writes to the shared catalog are controlled.
- CRM tables (`contacts`, `pipelines`, etc.): untouched, remain admin-gated.

## 2. Routes + UI

### Public

- **`/@:handle`** → `CreatorPage`:
  - Hero: avatar, display name, bio, IG link, spot count.
  - Country tabs (creator's countries, ordered by save count).
  - Category filter chips within country.
  - Business cards (reuse/adapt `BusinessCard`) showing creator's personal note.
  - **Map view**: MapLibre GL + OSM raster tiles, pins for current filter,
    pin click → card scroll/highlight. Toggle list/map on mobile, side-by-side
    on desktop.
  - Per-creator `EmailCapturePopup` when `email_capture_enabled`
    (source `creator_<handle>`).
  - Theme applied via CSS custom properties from preset.
- **`/:slug` fallback**: resolve country first (existing behavior); if no
  country match, look up creator handle → redirect to `/@handle`; else 404.
- SEO: per-creator meta title/description + JSON-LD (Person + ItemList),
  added to dynamic sitemap.

### Creator studio (`/studio`)

Same Supabase auth (magic link from invite). New `CreatorRoute` guard
(session + active creators row). Pages:

- **My Spots** — table/grid of saves: edit note, hide/unhide, delete, reorder.
- **Import** — the wizard (section 3).
- **Page settings** — display name, bio, avatar upload, IG handle, theme preset
  picker (live preview), email capture toggle.
- **Overview** — spot counts per country, import history. (Page-view analytics
  deferred to cycle F.)

### Admin

- **`/admin/creators`** — list creators, invite new (creates auth user +
  `creators` row status `invited`, sends magic link), pause/reactivate,
  edit handle.
- Public **`/apply`** page (or section on `/partner`): waitlist form for
  interested creators → stored + mirrored to CRM contacts with tag
  `creator_waitlist`.

## 3. Import wizard (creator studio)

Step-by-step, mirrors what was promised: "show how to do it in a simple wizard".

1. **Instructions** — illustrated guide to exporting Google saved lists via
   Google Takeout (Maps "Saved" → CSV per list). Static screenshots, no API.
2. **Upload** — drop one or more Takeout CSVs (columns: Title, Note, URL).
   Multiple lists per import OK.
3. **Parse (client-side)** — extract place reference from each URL:
   `place_id`, CID (`?cid=` / `ftid`), coordinates, or `q=` name fallback.
   Unparseable rows collected, shown, skipped (partial import always allowed).
4. **Match preview** — resolve against canonical `businesses` (dedup order
   above). Creator sees: N matched to existing places / M new / K failed,
   with fuzzy matches individually confirmable.
5. **Confirm** — `creator_saves` rows created immediately for everything;
   new places created as stub `businesses` rows (`name`, `google_maps_url`,
   parsed ref, country guess, `enrich_status = 'pending_enrich'`) via the
   controlled insert path (SECURITY DEFINER fn / edge fn).
6. **Async enrichment** — edge function processes `pending_enrich` stubs via
   the existing scraping stack (Outscraper place details as primary): category,
   address, lat/lng, photo, IG handle when available. Failures → retry queue
   (`enrich_failed` after N attempts); spot stays visible in basic form
   (name + note + maps link). Creator page is live immediately; cards upgrade
   as enrichment lands.

Import is idempotent: re-uploading the same list updates notes, never
duplicates saves (unique constraint).

## 4. Theming

Preset system only — no free-form colors/fonts in V1:

- ~6 accent palettes × 4 font pairings, curated via ui-ux-pro-max.
- Stored as preset keys in `creators.theme` jsonb.
- Applied as CSS custom properties on the CreatorPage root.
- Rationale: every page stays presentable, brand coherent, zero
  contrast/accessibility landmines from arbitrary user colors.

## 5. Error handling

- **Import**: per-row error reporting; partial success is normal path;
  import record keeps counts. Same-file re-upload safe (idempotent).
- **Enrichment**: retry with backoff; terminal failures flagged
  `enrich_failed`, visible in studio with "retry" button; card degrades
  gracefully (no photo/category).
- **Handles**: uniqueness + reserved-word validation at creation (admin invite
  flow); lowercase enforced.
- **Auth edge cases**: paused creator → studio shows "account paused" screen;
  public page 404s (or "on a break" placeholder).

## 6. Testing

- **Unit**: Takeout URL parser against real URL variants (place_id, cid, ftid,
  coords-only, q= fallback, international domains); dedup matcher.
- **RLS**: per-role checks — anonymous, creator A, creator B, admin — assert
  creator A cannot write B's rows and CRM tables stay closed.
- **Headed auth smoke** (lesson from useRole blank-screen incident): real
  browser login per role after auth changes; never trust RLS-only verification.
- **E2E (Playwright)**: admin invites creator → magic-link login → import
  fixture CSV → spots appear in studio → public `/@handle` renders cards +
  map pins → email popup fires when enabled.
- **CI**: existing pipeline; no deploy changes needed.

## Out of scope (later cycles)

- Auto-verify/outreach of imported businesses (C/D)
- Rev-share ledger, payouts, per-creator partner checkout (E)
- Reel collab tier workflow, page-view analytics, custom domains (F)
- Non-Takeout import sources (paste-a-list URL, IG saved, Notion)
- Creator-set pricing / paid guide unlocks
