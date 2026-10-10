/**
 * Which countries the /checkout "Find your business" step offers.
 *
 * The finder used to read `countries?published=eq.true`, and in production only
 * 4 of 78 countries are published (Argentina, Brazil, Colombia, Guatemala) —
 * so every ASIA/EU owner we cold-mail hit a dead end: Vietnam holds 2,436
 * claimable rows and could not be picked at all, and "Find my business" stays
 * disabled until a country is chosen. `countries.published` gates what the
 * PUBLIC guides show; what can be CLAIMED is `claimable_businesses`
 * (businesses.published), and 77 of the 78 countries have inventory there —
 * only Liechtenstein has none. So `published` was the wrong gate on this list.
 *
 * Inventory comes from `country_business_counts()`, the anon-callable RPC over
 * the refreshed counts matview that /partner already uses, so no new DB object
 * is needed. Its `total` counts `published or tier_paid` rows while the finder
 * searches `published` ones; the only divergence is a paid-but-unpublished row,
 * and a country listed with no search hits is far cheaper than a hidden one.
 */
export function finderCountries(countries, counts) {
  const list = Array.isArray(countries) ? countries : []
  const rows = Array.isArray(counts) ? counts : []
  // Fail OPEN. The bug being fixed here IS an over-filtered list, so a failed
  // or empty RPC must widen the choice back to every country, never shrink it.
  if (rows.length === 0) return list
  // PostgREST returns the matview's bigints as strings — compare numerically.
  const withInventory = new Set(
    rows.filter((r) => Number(r.total) > 0).map((r) => r.country_id)
  )
  const offered = list.filter((c) => withInventory.has(c.id))
  return offered.length > 0 ? offered : list
}
