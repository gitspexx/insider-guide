import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { finderCountries } from './checkoutCountries'

// Production shape, read read-only off qbzmsvfphpfgnlztskma on 2026-10-08:
// 78 countries, 4 published, 77 with claimable inventory, 81,680 claimable
// rows. Vietnam is the reported case — unpublished, 2,436 of its 2,437 rows
// claimable, and completely unselectable in the finder. Liechtenstein is the
// only country with nothing to claim.
const COUNTRIES = [
  { id: 'c-ar', name: 'Argentina', flag_emoji: '🇦🇷' },
  { id: 'c-li', name: 'Liechtenstein', flag_emoji: '🇱🇮' },
  { id: 'c-vn', name: 'Vietnam', flag_emoji: '🇻🇳' },
]

// country_business_counts() hands bigints back as strings, as PostgREST does.
const COUNTS = [
  { country_id: 'c-ar', total: '1201', paid: '0', curated: '38' },
  { country_id: 'c-li', total: '0', paid: '0', curated: '0' },
  { country_id: 'c-vn', total: '2436', paid: '0', curated: '0' },
]

const names = (rows) => rows.map((c) => c.name)

describe('finderCountries', () => {
  // The regression that motivated the change: the owner of a Vietnamese
  // business could not pick Vietnam, so "Find my business" never enabled.
  it('offers an unpublished country that has claimable inventory', () => {
    expect(names(finderCountries(COUNTRIES, COUNTS))).toContain('Vietnam')
  })

  it('drops a country with no claimable inventory', () => {
    expect(names(finderCountries(COUNTRIES, COUNTS))).not.toContain('Liechtenstein')
  })

  it('compares counts numerically, not as the strings PostgREST sends', () => {
    // '0' is truthy as a string — a naive filter would keep Liechtenstein and
    // drop nothing at all.
    expect(names(finderCountries(COUNTRIES, COUNTS))).toEqual(['Argentina', 'Vietnam'])
  })

  it('keeps the order the query asked for', () => {
    expect(names(finderCountries(COUNTRIES, COUNTS))).toEqual(['Argentina', 'Vietnam'])
  })

  for (const [label, counts] of [['an error', null], ['no rows', []], ['a non-array', {}]]) {
    it(`falls back to every country when the RPC returns ${label}`, () => {
      expect(names(finderCountries(COUNTRIES, counts))).toEqual(
        ['Argentina', 'Liechtenstein', 'Vietnam']
      )
    })
  }

  it('falls back to every country when no id matches, rather than emptying the list', () => {
    const stale = [{ country_id: 'c-gone', total: '5' }]
    expect(names(finderCountries(COUNTRIES, stale))).toHaveLength(3)
  })

  it('survives a failed countries query', () => {
    expect(finderCountries(null, COUNTS)).toEqual([])
  })
})

// The helper above can only fail open if the page stops filtering in the query
// itself, so assert that against the real source the way routes.test.js asserts
// App.jsx — a copy would just drift.
const CHECKOUT_SRC = readFileSync(new URL('../pages/Checkout.jsx', import.meta.url), 'utf8')

describe('the checkout page', () => {
  it('never gates a country on countries.published', () => {
    // Both halves of the reported bug were this one filter: the finder's list
    // (4 of 78 countries selectable) and the pending row's seed country, which
    // resolved to the first published country by name — Argentina.
    expect(CHECKOUT_SRC).not.toMatch(/eq\('published', true\)/)
  })

  it('narrows the finder list by claimable inventory instead', () => {
    expect(CHECKOUT_SRC).toContain("rpc('country_business_counts')")
    expect(CHECKOUT_SRC).toContain('finderCountries(')
  })

  it('seeds the pending row only from a country the buyer gave us', () => {
    expect(CHECKOUT_SRC).toMatch(/seedCountryId = unmatchedCountryId \|\| countryId/)
  })
})
