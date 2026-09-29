import { describe, it, expect } from 'vitest'
import { buildAdminEmail, buildAutoReply, buildSlackText, debracket, formatWindows } from './message.ts'

// Copied verbatim from the deployed send-email fn (spexx-crm, same Supabase
// project qbzmsvfphpfgnlztskma) — supabase/functions/send-email/index.ts, the
// `PLACEHOLDER_PATTERN` const in its pre-send validator. Anything it matches in
// EITHER the subject or the body is answered with HTTP 422 and never sent. The
// inline-compose path we use passes no message_id/campaign_id/contact_id, so
// send-email's auto-regen recovery is skipped and the 422 is final.
const PLACEHOLDER_PATTERN = /\[[A-Za-z][^\]\n]{0,60}\]/

// The row as PostgREST hands it back, with every prospect-supplied field
// carrying text that trips the validator. A topic reading "about [my hotel]" is
// ordinary prose, not an attack, which is why this is the default case.
const HOSTILE = {
  id: '8c1d2e3f-0000-4000-8000-0000000000ff',
  name: 'Ana [Your Name] Ruiz',
  topic: 'We run [two hotels] in [city].\nAsk about [the featured spot].',
  days: ['fri', 'mon'],
  times: ['evening', 'morning'],
  timezone: 'America/Bogota',
  email: 'ana+[link]@example.com',
  whatsapp: '+57 300 123 4567',
  instagram: 'ana.ruiz',
  created_at: '2026-09-29T12:00:00Z',
}

const BENIGN = {
  id: '8c1d2e3f-0000-4000-8000-0000000000aa',
  name: 'Ana Ruiz',
  topic: 'Two hotels in Medellín, weighing up Featured against Partner.',
  days: ['tue', 'thu'],
  times: ['afternoon'],
  timezone: 'America/Bogota',
  email: 'ana@example.com',
  whatsapp: '',
  instagram: '',
  created_at: '2026-09-29T12:00:00Z',
}

const EMPTY = {
  id: '8c1d2e3f-0000-4000-8000-0000000000bb',
  name: null,
  topic: null,
  days: null,
  times: null,
  timezone: null,
  email: null,
  whatsapp: null,
  instagram: null,
  created_at: null,
}

describe("send-email's pre-send placeholder validator", () => {
  // Guards the test itself: if this stops matching, the regex above has drifted
  // from the deployed one and the assertions below prove nothing.
  it('rejects the bracketed subject notify-partner-application builds for claims', () => {
    expect(PLACEHOLDER_PATTERN.test('[CLAIM] Hotel Salento - claim request from a@b.co')).toBe(true)
  })
})

describe('notify-call-request messages', () => {
  for (const [label, request] of [['hostile', HOSTILE], ['benign', BENIGN], ['all-null', EMPTY]]) {
    it(`builds an admin email no validator rejects (${label})`, () => {
      const { subject, body } = buildAdminEmail(request)
      expect(subject).not.toMatch(PLACEHOLDER_PATTERN)
      expect(body).not.toMatch(PLACEHOLDER_PATTERN)
    })

    it(`builds an auto-reply no validator rejects (${label})`, () => {
      const { subject, body } = buildAutoReply(request)
      expect(subject).not.toMatch(PLACEHOLDER_PATTERN)
      expect(body).not.toMatch(PLACEHOLDER_PATTERN)
    })
  }

  it('keeps the prospect text, only swapping the brackets', () => {
    const { body } = buildAdminEmail(HOSTILE)
    expect(body).toContain('We run (two hotels) in (city).')
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

  it('names the timezone in the admin subject and survives a missing one', () => {
    expect(buildAdminEmail(BENIGN).subject).toBe('New call request - Ana Ruiz (America/Bogota)')
    expect(buildAdminEmail(EMPTY).subject).toBe('New call request - Unnamed (no timezone on the row)')
  })

  // The windows are the entire payload of a /book request. An admin email that
  // loses them is an email nobody can act on, so it is asserted literally.
  it('puts the windows in the admin body and in the auto-reply', () => {
    expect(buildAdminEmail(HOSTILE).body).toContain(
      'Windows:    Mon, Fri - mornings (09:00-12:00) and evenings (17:00-21:00)',
    )
    expect(buildAutoReply(HOSTILE).body).toContain('Mon, Fri - mornings (09:00-12:00) and evenings (17:00-21:00)')
  })

  it('prefixes a stored Instagram handle with the @ the column does not hold', () => {
    expect(buildAdminEmail(HOSTILE).body).toContain('Instagram:  @ana.ruiz')
    expect(buildAdminEmail(BENIGN).body).toContain('Instagram:  -')
  })

  it('caps the topic quoted into Slack so one prospect cannot flood the channel', () => {
    const long = { ...BENIGN, topic: 'x'.repeat(5000) }
    expect(buildSlackText(long).length).toBeLessThan(700)
  })
})

describe('formatWindows', () => {
  it('reads label order, not stored order', () => {
    expect(formatWindows({ days: ['sun', 'mon'], times: ['evening', 'morning'] })).toBe(
      'Mon, Sun - mornings (09:00-12:00) and evenings (17:00-21:00)',
    )
  })

  it('does not say "and" for a single bucket', () => {
    expect(formatWindows({ days: ['wed'], times: ['afternoon'] })).toBe('Wed - afternoons (12:00-17:00)')
  })

  it('says so rather than printing an empty line when the row has nothing', () => {
    expect(formatWindows({ days: null, times: null })).toBe('no windows on the row')
    expect(formatWindows({ days: [], times: [] })).toBe('no windows on the row')
  })

  it('skips an id that is not in the label map instead of printing it raw', () => {
    expect(formatWindows({ days: ['mon', 'someday'], times: ['midnight'] })).toBe('Mon')
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
