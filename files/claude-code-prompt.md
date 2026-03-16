# Claude Code Prompt — alexspexx Travel Guide
# Copy everything below this line and paste directly into Claude Code

---

Build a full-stack travel guide web app for @alexspexx called **"The Insider Guide"**.

## Stack
- React (Vite) frontend
- Supabase (PostgreSQL) backend — database, auth, realtime
- Tailwind CSS for styling
- React Router for navigation
- No external UI component libraries — build everything custom

## Brand
- Dark background: #0a0805
- Gold accent: #C89B3C
- Typography: Anton (headings), Space Mono (labels/UI), Playfair Display italic (callouts)
- Load all three from Google Fonts
- Grain overlay texture on all dark surfaces
- Moody, editorial, cinematic aesthetic — not a generic travel blog

---

## Database Schema (Supabase)

### Table: `countries`
- id (uuid, primary key)
- name (text) — e.g. "Colombia"
- slug (text, unique) — e.g. "colombia"
- region (text) — e.g. "South America"
- flag_emoji (text)
- coordinates (text) — e.g. "4.71° N · 74.07° W"
- tagline (text)
- published (boolean, default false)
- created_at (timestamp)

### Table: `businesses`
- id (uuid, primary key)
- country_id (uuid, FK → countries.id)
- name (text)
- category (text) — one of: eat, cafe, drink, stay, do, explore
- description (text) — short, written in Alex's voice
- google_maps_url (text)
- instagram_handle (text)
- email (text)
- whatsapp (text)
- tier (text) — one of: listed, featured, partner
- tier_paid (boolean, default false)
- photo_url (text, nullable)
- recommended_badge (boolean, default false)
- published (boolean, default false)
- notes (text) — internal CRM notes
- outreach_status (text) — one of: to_contact, email_sent, replied, wa_sent, ig_engaged, closed_won, closed_lost
- last_touch_date (date)
- last_touch_type (text) — E1, E2, E3, W1, W2, IG-engage, IG-DM
- created_at (timestamp)

### Table: `newsletter_subscribers`
- id (uuid, primary key)
- email (text, unique)
- country_slug (text)
- source (text) — dm, web, direct
- created_at (timestamp)

---

## App Structure

### PUBLIC ROUTES (what travelers see)

#### `/` — Homepage
- Full-screen hero with the tagline "The world, curated."
- Grid of published country cards — each showing flag, country name, tagline, stat count
- Each card links to `/[country-slug]`
- Clean, editorial feel — dark background, gold accents

#### `/[country-slug]` — Country Guide Page
- Header: country name (large Anton font), tagline, coordinates
- Category filter tabs: All · Eat · Café · Drink · Stay · Do · Explore
- Business cards grid — each showing:
  - Name, category badge, one-line description
  - Google Maps button (opens in new tab)
  - "Recommended by Alex" badge if `recommended_badge = true`
  - Visual highlight/gold border if tier = featured or partner
  - Partner tier gets a dedicated callout card (larger, gold-bordered, "Where Alex stayed/ate")
- Email capture at bottom: "Get the full map. DM 'COLOMBIA' on Instagram or drop your email."
  - Email saves to `newsletter_subscribers` with country_slug

#### `/[country-slug]/[business-id]` — Business detail page (optional, simple)
- Full description, photo, Google Maps embed, Instagram link

---

### ADMIN ROUTES (what Alex sees — password protected)

Use Supabase Auth with email/password. Admin routes are behind a `/admin` prefix.

#### `/admin` — Dashboard
- Stats row: total businesses, total by tier (listed/featured/partner), total paid, total countries
- Recent activity: last 10 businesses added or status changed
- Quick country switcher

#### `/admin/[country-slug]` — Country CRM view
- Table of all businesses for that country
- Columns: Name · Category · Tier · Paid · Outreach Status · Last Touch · Actions
- Inline status updates (click to change outreach_status, tier, tier_paid)
- Add new business button → modal form
- Filter by: category, tier, outreach status
- Export to CSV button

#### `/admin/businesses/new` and `/admin/businesses/[id]/edit` — Business form
All fields from the schema above. Category dropdown. Tier dropdown. Outreach status dropdown.

#### `/admin/subscribers` — Newsletter list
- Table: email, country, source, date
- Export to CSV

---

## Key UX Details

1. **Category filter** on country pages uses URL params (?category=eat) so links are shareable
2. **Featured and Partner businesses** always appear before Listed ones in the same category
3. **Partner tier** gets a visually distinct "callout card" — wider, gold border, larger photo, written in first person ("Where I stayed")
4. **Admin table** shows outreach_status as a colored badge: to_contact (grey) / email_sent (blue) / replied (yellow) / wa_sent (green) / ig_engaged (pink) / closed_won (gold) / closed_lost (red)
5. **Mobile-first** on the public side. Admin can be desktop-only.
6. **Supabase Row Level Security**: public can only read published businesses and published countries. Admin (authenticated) can read/write everything.

---

## Environment Variables needed
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Deliverables
1. Full Vite + React project structure
2. Supabase SQL migration file (create all tables, RLS policies)
3. All React components and pages
4. Tailwind config with the brand colors and fonts
5. README with setup instructions (run migration, add env vars, npm install, npm run dev)

Start with the Supabase migration SQL and the project scaffold, then build page by page starting with the public country guide page, then the admin CRM table.
