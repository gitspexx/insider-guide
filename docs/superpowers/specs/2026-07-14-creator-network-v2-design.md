# InsiderGuide Creator Network V2 — Earnings, Outreach, Newsletter (Subsystems C+D+E)

**Date:** 2026-07-14
**Status:** Approved by Alex (decisions locked via Q&A)
**Builds on:** V1 spec `2026-07-13-creator-platform-v1-design.md` (shipped)

## Vision (Alex's words, decoded)

Creators register, upload their Google Maps CSV (V1 wizard, shipped). InsiderGuide
then outreaches those businesses: "@filoquita added your business to his Insider
Guide — want to be featured?" When a deal closes, the creator takes a revenue
share — that's their motivation to import and promote their page to their
audience. Their audience subscribes via the page popup; the creator sees those
leads in their studio, and can buy a newsletter license (we operate Sendy) to
mail them. The studio also shows DM-automation options and reel requests from
businesses. InsiderGuide is the network operating all of it.

## Decisions locked

1. **Rev share = 30%** of closed featured/partner deal value.
2. **Outreach = auto-enroll + VA review.** Imports feed the existing campaign
   engine with a "creator added you" template; VA reviews/sends from the
   existing admin OutreachDashboard. No fully-automated sending this cycle.
3. **Newsletter = paid license, we operate Sendy.** Leads visible free in
   studio; license activation is a manual ops step this cycle (admin flips a
   flag after payment; Sendy list created by hand at sendy.spexx.cloud).
4. **Build order: earnings dashboard first**, then outreach auto-enroll, then
   newsletter licensing UI. All three ship in this cycle; Sendy API automation
   and Stripe-checkout for the license are NOT in this cycle.

## Existing infra to reuse (verified)

- Outreach engine: `campaigns`, `campaign_enrollments`, `campaign_templates`,
  `campaign_messages`, `email_accounts` (SMTP/Gmail senders with daily limits),
  admin OutreachDashboard + CampaignDetail UIs.
- Payments: BCAX Stripe checkout → `bcax-callback` edge fn flips
  `businesses.tier_paid` / `paid_at` / `paid_pending_tier`.
- Leads: `newsletter_subscribers` rows tagged `source = 'creator_<handle>'`
  (shipped in V1) + CRM mirror trigger.
- Sendy at sendy.spexx.cloud (manual list ops this cycle).
- Studio shell + tabs (V1), admin creators page (V1).

## 1. Data model

### `creator_deals`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK → creators | |
| business_id | uuid FK → businesses | |
| tier | text check in ('featured','partner') | |
| amount_cents | int | gross deal value |
| currency | text default 'usd' | |
| rev_share_pct | int default 30 | frozen per-deal at creation |
| creator_share_cents | int generated always as (amount_cents * rev_share_pct / 100) stored | |
| status | text check in ('pending_attribution','confirmed','paid_out') default 'confirmed' | |
| source | text check in ('outreach','inbound','manual') default 'manual' | |
| notes | text | |
| closed_at | timestamptz default now() | |
| created_at | timestamptz default now() | |

RLS: creator SELECT own; admin ALL; no creator writes.

**Auto-attribution trigger:** when `businesses.tier_paid` flips to true (or
`paid_at` set), a trigger checks `creator_saves` for that business:
- exactly one saving creator → insert `creator_deals` row `status='confirmed'`,
  `source='outreach'`, amount from the paid tier's price (featured/partner price
  read from a small `deal_prices` config table so admin can adjust).
- multiple saving creators → one row per creator with `status='pending_attribution'`
  and amount 0; admin resolves (confirms one, deletes others, sets amount).
- zero saving creators → no deal (normal non-creator sale).

### `creator_requests` (reel collabs etc.)
| column | type |
|---|---|
| id uuid PK, creator_id FK, business_id FK, type text check in ('reel') , status text check in ('open','accepted','declined','done') default 'open', notes text, created_at timestamptz |

RLS: creator SELECT own + UPDATE own `status` only (column grant); admin ALL.
Populated by admin when a business asks for a reel.

### `creators` additions
- `newsletter_license` text check in ('none','requested','active') default 'none'
- `dm_automations_enabled` boolean default false (informational this cycle —
  wiring to the creator-app IG automations is a later cycle)

### `my_leads` view (definer-style, like V1 views)
`newsletter_subscribers` filtered `source = 'creator_' || <caller's handle>`,
columns: email, country_slug, created_at. Grant SELECT to authenticated.
(Creators cannot read the base table — admin-gated in V1.)

### `deal_prices` config table
tier PK ('featured','partner'), amount_cents. Seeded from the live Stripe
checkout prices. Admin-editable, public-readable (prices are public anyway).

## 2. Studio — new "Earnings" tab

Route `/studio/earnings`, tab in StudioLayout. Sections:

1. **Totals strip:** lifetime earned (sum confirmed+paid_out creator_share),
   pending payout (confirmed), deals count.
2. **Deals list:** business name (via `my_saved_businesses` view join client-side),
   tier badge, gross amount, "your 30%" share, status chip, date. Empty state:
   "When a business you added becomes a partner, your share appears here."
3. **Leads:** count + table (email, country, date) from `my_leads`. CSV export
   button (client-side blob).
4. **Newsletter license card:**
   - `none` → pitch + "Request the license" button → sets `newsletter_license='requested'`
     (creator UPDATE own via column grant) + shows "We'll be in touch".
   - `requested` → "Request received" state.
   - `active` → "Your Sendy access" block linking sendy.spexx.cloud with note
     that credentials were sent by us.
5. **Reel requests:** list from `creator_requests` with Accept / Decline buttons
   (status update). Empty state hidden.

## 3. Studio — Settings additions

- DM automations toggle (`dm_automations_enabled`) with copy "We reply to your
  IG DMs with your map link + capture emails. We'll contact you to set it up."
  (informational this cycle).
- Rev share display: static "You earn 30% of every deal closed on your spots."

## 4. Outreach auto-enroll (D, VA-reviewed)

- On `commit_import` (RPC): after creating stubs/saves, tag every business in
  the import that is NOT already tier-paid with
  `outreach_status = 'to_contact'` (only when currently null/none) and append
  a marker to `notes`: `[creator-import @<handle>]` (only if not present).
- New campaign template seeded in `campaign_templates`: **"Creator added you"**
  — subject/body with variables (business name, creator handle, creator IG,
  page URL insiderguide.co/<handle>), body pitch: creator X added your business
  to their Insider Guide map; travelers browsing their page see you; want to be
  featured? CTA link to /partner with ?ref=creator_<handle>.
- Admin OutreachDashboard: a "Creator imports" filter/segment (businesses with
  the marker + to_contact) so the VA can bulk-enroll them into a campaign using
  the new template. NO auto-sending — VA reviews and sends (existing engine).
- Attribution: /partner?ref=creator_<handle> → checkout metadata → bcax-callback
  already writes paid flags; the tier_paid trigger (section 1) creates the deal.
  The ref param additionally stored in `businesses.notes` marker for manual
  disambiguation when multiple creators saved the business.

## 5. Admin — deals + license ops

Extend `/admin/creators`:
- Per-creator expandable row or sub-page: deals list with add/edit
  (business picker from creator's saves, tier, amount, status), resolve
  pending_attribution rows, mark paid_out.
- Newsletter license control: none/requested/active dropdown (flip after
  payment; Sendy list created manually).
- Add reel request (business picker + note).
Admin writes go through the service-role edge fn (extend `invite-creator` with
new actions: `record_deal`, `update_deal`, `set_license`, `add_request`) OR a
new `creator-ops` edge fn — implementation's choice, but writes must NOT rely
on the authenticated role (column grants block it by design).

## 6. Out of scope this cycle

- Sendy API automation (list creation, credential provisioning) — manual ops.
- Stripe checkout for the newsletter license — payment collected manually.
- Actual payout rails (Wise/manual) — `paid_out` is a status flip.
- DM automation wiring to the creator app — toggle is informational.
- Follower-count enrichment for outreach templates.

## 7. Testing

- RLS probes: creator A cannot read B's deals/leads/requests; creator cannot
  INSERT/UPDATE deals (except requests.status + own license request); admin path
  via edge fn only.
- Trigger test: flip tier_paid on a single-creator-saved business → confirmed
  deal with 30% share; multi-creator business → pending_attribution rows.
- Headed studio check per role (house rule): earnings tab renders for creator
  with deals, empty states for filoquita.
- E2E: admin records deal → appears in Alex's earnings with correct share;
  license request round-trip; reel request accept.
