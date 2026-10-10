// What we offer, what we charge for it, and the checkout link we email.
// Extracted from index.ts so offer.test.js can hold the printed amount and the
// Stripe Price to each other — a Deno edge function is otherwise untestable
// from the Vite project's vitest run.

export const SITE = 'https://insiderguide.co'

export const TIER_OFFER: Record<string, { label: string; amountUsd: number; desc: string }> = {
  complete: {
    label: 'Complete',
    amountUsd: 50,
    desc: 'Full profile: photos, description, website + Instagram links, “Verified owner” badge — the listing travelers actually stop on.',
  },
  featured: {
    label: 'Featured',
    amountUsd: 200,
    desc: 'Pinned at the top of your category · written profile in the creator’s voice · “Traveler-approved” badge · newsletter mention · one Instagram story from the creator covering your country.',
  },
  partner: {
    label: 'Partner',
    amountUsd: 500,
    desc: 'Everything in Featured · hero placement at the top of your country guide · logo in the next newsletter header · priority access when creators look for sponsors in your country.',
  },
}

/**
 * The discount every outreach link carries (`/checkout?promo=partner10`). It
 * selects the `_10off` Stripe Prices on the same products — 4500 / 18000 /
 * 45000 cents, i.e. exactly 10% off each tier.
 *
 * The invoice and claim-upsell links used to go out WITHOUT it, so an owner who
 * replied, applied and was approved paid $500 while a stranger clicking the
 * cold email paid $450 for the same placement. Everything we send now carries
 * the same promo — and the printed figure has to move with it, because the
 * bank-transfer amount on the invoice has no Stripe Price to correct it.
 */
export const PARTNER_PROMO = { code: 'partner10', off: 0.1, label: '10% partner discount' }

/** Whole USD actually charged for a tier, i.e. the `_10off` Price. */
export function offerAmountUsd(tier: string): number {
  const offer = TIER_OFFER[tier]
  if (!offer) throw new Error(`unknown tier: ${tier}`)
  return Math.round(offer.amountUsd * (1 - PARTNER_PROMO.off))
}

/** Card-payment link for one tier aimed at one business row. */
export function checkoutUrl(tier: string, businessId: string): string {
  return `${SITE}/checkout?tier=${tier}&biz=${businessId}&promo=${PARTNER_PROMO.code}`
}
