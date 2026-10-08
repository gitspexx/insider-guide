import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PARTNER_PROMO, SITE, TIER_OFFER, checkoutUrl, offerAmountUsd } from './offer.ts'

const BIZ = '3f7c1b2a-0000-4000-8000-0000000000ff'

// Read against the real checkout page rather than a copy, the way
// src/routes.test.js reads App.jsx: the promo code only does anything if
// Checkout.jsx's PROMOS table knows it, and the invoice may only print a
// discount the `_10off` Stripe Prices actually give. Either side drifting
// means an owner is quoted one figure and billed another.
const CHECKOUT_SRC = readFileSync(
  new URL('../../../src/pages/Checkout.jsx', import.meta.url), 'utf8'
)
const checkoutPromo = CHECKOUT_SRC.match(
  /(\w+): \{ suffix: '([^']+)', off: ([\d.]+)/
)
const checkoutTiers = Object.fromEntries(
  [...CHECKOUT_SRC.matchAll(/key: '(\w+)',[\s\S]{0,160}?amount_cents: (\d+)/g)]
    .map((m) => [m[1], Number(m[2])])
)

describe('admin-sent checkout links', () => {
  // The bug: "Approve + send invoice" and the claim upsell linked without any
  // promo, so an approved partner paid $500 while a cold-mail stranger paid
  // $450 for the identical placement.
  it('carries the promo on the invoice link', () => {
    expect(checkoutUrl('partner', BIZ)).toBe(
      `${SITE}/checkout?tier=partner&biz=${BIZ}&promo=partner10`
    )
  })

  it('carries it on every upsell tier, not just the first', () => {
    for (const tier of Object.keys(TIER_OFFER)) {
      expect(checkoutUrl(tier, BIZ)).toContain(`&promo=${PARTNER_PROMO.code}`)
    }
  })

  it('still pins the payment to the business row', () => {
    expect(checkoutUrl('featured', BIZ)).toContain(`&biz=${BIZ}`)
  })

  it('uses a promo code the checkout page recognises', () => {
    // An unknown ?promo= is ignored by Checkout.jsx, so a typo here would
    // silently charge list price again — the exact bug, back.
    expect(checkoutPromo?.[1]).toBe(PARTNER_PROMO.code)
  })
})

describe('the amount the invoice prints', () => {
  it('matches the discount the checkout page applies', () => {
    expect(Number(checkoutPromo?.[3])).toBe(PARTNER_PROMO.off)
  })

  it('quotes the same list price the checkout page does', () => {
    for (const [tier, offer] of Object.entries(TIER_OFFER)) {
      expect(checkoutTiers[tier]).toBe(offer.amountUsd * 100)
    }
  })

  // The `_10off` Stripe Prices on the IG products, in cents. bcax-charge
  // resolves the Price from price_lookup_key and that is what gets charged —
  // the bank-transfer total on the invoice has nothing to correct it, so these
  // have to agree to the cent.
  it('matches the _10off Stripe Price for every tier', () => {
    const stripeCents = { complete: 4500, featured: 18000, partner: 45000 }
    for (const [tier, cents] of Object.entries(stripeCents)) {
      expect(offerAmountUsd(tier) * 100).toBe(cents)
    }
  })

  it('is below the list price it is struck through against', () => {
    for (const [tier, offer] of Object.entries(TIER_OFFER)) {
      expect(offerAmountUsd(tier)).toBeLessThan(offer.amountUsd)
    }
  })

  it('throws on an unknown tier instead of invoicing $0', () => {
    expect(() => offerAmountUsd('listed')).toThrow(/unknown tier/)
  })
})

// checkoutUrl only helps if the function uses it, so pin that to the source
// too — both emails used to interpolate their own `/checkout?...`.
const FN_SRC = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

describe('approve-application', () => {
  it('builds no checkout link of its own', () => {
    expect(FN_SRC).not.toMatch(/\/checkout\?/)
    expect(FN_SRC).toContain('checkoutUrl(')
  })

  it('invoices the discounted amount, not the list price', () => {
    expect(FN_SRC).toContain('amountUsd: offerAmountUsd(effectiveTier)')
  })
})
