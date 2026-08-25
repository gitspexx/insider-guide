# Deploy runbook

## The hazard this exists for

`../.github/workflows/deploy.yml` (repo root, **not** `insiderguide/`) fires on
every push to `main`:

```
git pull origin main → cd insiderguide → docker compose build --no-cache → docker compose up -d
```

That is the whole workflow. It **does not apply migrations and does not deploy
edge functions.** Merging a branch to `main` therefore publishes frontend code
within minutes, against whatever backend happens to already be live.

A page that writes to a table the migration has not created does not fail
loudly. It fails at the moment a real person presses submit: PostgREST answers
`404 PGRST205`, no row is stored, and the visitor is gone. `/creators` is in
`public/sitemap.xml`, so this is reachable from search the same day.

## Rule

**Backend first, always. Migrations and edge functions go live before the branch
that needs them reaches `main`.**

## Order of operations

```bash
cd insiderguide

# 1. Schema (from a machine with the Supabase CLI linked to the project)
supabase db push --project-ref qbzmsvfphpfgnlztskma

# 2. Edge functions touched by the branch
supabase functions deploy notify-creator-application --project-ref qbzmsvfphpfgnlztskma

# 3. Confirm both landed — this is what the build gate runs
npm run preflight

# 4. Only now merge to main; the push auto-deploys the frontend
```

`supabase/config.toml` carries the `verify_jwt` setting per function, so step 2
needs no flags.

## The gate

`scripts/preflight-schema.mjs` runs first in `prebuild`, which means it runs
inside the `docker compose build` the deploy depends on. If a required table is
absent from PostgREST's schema cache, or a required edge function 404s at the
gateway, the build exits 1 — the image is never produced, `docker compose up`
never runs, and the previous container keeps serving. Nothing half-deployed
reaches a visitor.

It is deliberately not a reminder. Forgetting step 1 breaks the deploy loudly on
GitHub Actions instead of breaking the form quietly in production.

What it fails on, and what it does not:

| Probe result | Meaning | Build |
| --- | --- | --- |
| `404` + `PGRST205` | table genuinely absent | **fail** |
| `404` from `/functions/v1/<slug>` | function never deployed | **fail** |
| `401` / `403` (`42501`) | table exists, anon just cannot read it | pass |
| `200` | table exists and is readable | pass |
| timeout, DNS error, `5xx` | indeterminate | warn, pass |

The indeterminate row matters: a flaky network must not block an unrelated
deploy. Same posture as `build-seo.mjs`.

**Known hole:** the gate skips itself when `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` are unset, so a local `npm run build` still works
offline. Those are passed as Docker build args in `docker-compose.yml` and the
app is non-functional without them, so on the deploy path they are always set —
but stripping them would silently disarm the check.

## Adding to the gate

When a branch adds a public write path, add the table or function slug to
`REQUIRED_TABLES` / `REQUIRED_FUNCTIONS` at the top of
`scripts/preflight-schema.mjs`, **in the same commit as the migration**. Remove
the entry once the schema is long since live and the check is only costing a
round trip.

## Currently gated

| Requirement | Shipped by |
| --- | --- |
| `public.creator_applications` | `supabase/migrations/20260825120000_creator_applications.sql` |
| `notify-creator-application` | `supabase/functions/notify-creator-application/` |

Both are **unapplied as of this commit.** `npm run preflight` fails today, by
design, and will keep failing until step 1 and step 2 above are done.
