import { describe, it, expect } from 'vitest'
import { buildAdminEmail, buildAutoReply, buildSlackText, debracket } from './message.ts'

// Copied verbatim from the deployed send-email fn (spexx-crm, same Supabase
// project qbzmsvfphpfgnlztskma) — supabase/functions/send-email/index.ts, the
// `PLACEHOLDER_PATTERN` const in its pre-send validator. Anything it matches in
// EITHER the subject or the body is answered with HTTP 422 and never sent. The
// inline-compose path we use passes no message_id/campaign_id/contact_id, so
// send-email's auto-regen recovery is skipped and the 422 is final.
const PLACEHOLDER_PATTERN = /\[[A-Za-z][^\]\n]{0,60}\]/

// The application row as PostgREST hands it back, with every applicant-supplied
// field carrying text that trips the validator. A pitch reading "see [my list]"
// is ordinary prose, not an attack, which is why this is the default case
// rather than an edge case.
const HOSTILE = {
  id: '3f7c1b2a-0000-4000-8000-0000000000ff',
  full_name: 'Ana [Your Name] Ruiz',
  email: 'ana+[link]@example.com',
  social_handle: '@ana [portfolio link]',
  city: '[specific city]',
  list_url: 'https://maps.app.goo.gl/[REAL LINK NEEDED]',
  pitch: 'I cover [country] properly.\nAsk me about [my list] and [CTA].',
  created_at: '2026-08-25T12:00:00Z',
  countries: { name: '[country]', flag_emoji: '🇨🇴' },
}

const BENIGN = {
  id: '3f7c1b2a-0000-4000-8000-0000000000aa',
  full_name: 'Ana Ruiz',
  email: 'ana@example.com',
  social_handle: '@anaruiz',
  city: 'Medellín',
  list_url: 'https://maps.app.goo.gl/abc123',
  pitch: 'Roughly 300 saved places across Colombia, mostly coffee and food.',
  created_at: '2026-08-25T12:00:00Z',
  countries: { name: 'Colombia', flag_emoji: '🇨🇴' },
}

const EMPTY = {
  id: '3f7c1b2a-0000-4000-8000-0000000000bb',
  full_name: null,
  email: null,
  social_handle: null,
  city: null,
  list_url: null,
  pitch: null,
  created_at: null,
  countries: null,
}

describe("send-email's pre-send placeholder validator", () => {
  // Guards the test itself: if this stops matching, the regex above has drifted
  // from the deployed one and the assertions below prove nothing.
  it('rejects the bracketed subject notify-partner-application builds for claims', () => {
    expect(PLACEHOLDER_PATTERN.test('[CLAIM] Hotel Salento - claim request from a@b.co')).toBe(true)
  })

  it('rejects a bracketed token anywhere in a body', () => {
    expect(PLACEHOLDER_PATTERN.test('Hi there,\n\nSee [portfolio link] for more.')).toBe(true)
  })
})

describe('notify-creator-application messages', () => {
  for (const [label, app] of [['hostile', HOSTILE], ['benign', BENIGN], ['all-null', EMPTY]]) {
    it(`builds an admin email no validator rejects (${label})`, () => {
      const { subject, body } = buildAdminEmail(app)
      expect(subject).not.toMatch(PLACEHOLDER_PATTERN)
      expect(body).not.toMatch(PLACEHOLDER_PATTERN)
    })

    it(`builds an auto-reply no validator rejects (${label})`, () => {
      const { subject, body } = buildAutoReply(app)
      expect(subject).not.toMatch(PLACEHOLDER_PATTERN)
      expect(body).not.toMatch(PLACEHOLDER_PATTERN)
    })
  }

  it('keeps the applicant text, only swapping the brackets', () => {
    const { body } = buildAdminEmail(HOSTILE)
    expect(body).toContain('I cover (country) properly.')
    expect(body).toContain('Ana (Your Name) Ruiz')
  })

  it('never emits a bracket at all, so no pairing can survive', () => {
    const all = [
      ...Object.values(buildAdminEmail(HOSTILE)),
      ...Object.values(buildAutoReply(HOSTILE)),
      buildSlackText(HOSTILE),
    ].join('\n')
    expect(all).not.toMatch(/[[\]]/)
  })

  it('names the country in the admin subject and survives a missing one', () => {
    expect(buildAdminEmail(BENIGN).subject).toBe('New creator application - Ana Ruiz (🇨🇴 Colombia)')
    expect(buildAdminEmail(EMPTY).subject).toBe('New creator application - Unnamed (no country on the row)')
  })
})

describe('debracket', () => {
  it('coerces null and undefined to an empty string', () => {
    expect(debracket(null)).toBe('')
    expect(debracket(undefined)).toBe('')
  })

  it('replaces every bracket, not just the first', () => {
    expect(debracket('[a] and [b]')).toBe('(a) and (b)')
  })
})
