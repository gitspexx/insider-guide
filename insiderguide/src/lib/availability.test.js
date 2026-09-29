import { describe, it, expect } from 'vitest'
import {
  BLANK_FORM,
  DAY_IDS,
  TIME_IDS,
  describeInsertError,
  detectTimezone,
  formatAvailability,
  isValidTimezone,
  normalizeInstagram,
  togglePill,
  validateStep,
} from './availability'

// A form that clears every step, so each test can knock out exactly one field
// and prove the message it expects comes from that field and not a neighbour.
const VALID = {
  ...BLANK_FORM,
  name: 'Ana Ruiz',
  topic: 'We run two hotels in Medellín and want to understand what Partner covers.',
  days: ['tue', 'thu'],
  times: ['morning'],
  timezone: 'America/Bogota',
  email: 'ana@example.com',
}

describe('togglePill', () => {
  it('adds an unselected id and removes a selected one', () => {
    const once = togglePill(BLANK_FORM, 'days', 'mon')
    expect(once.days).toEqual(['mon'])
    expect(togglePill(once, 'days', 'mon').days).toEqual([])
  })

  it('never mutates the form it was given', () => {
    const before = { ...BLANK_FORM, days: [] }
    togglePill(before, 'days', 'mon')
    expect(before.days).toEqual([])
  })

  it('leaves the other pill group alone', () => {
    const next = togglePill({ ...BLANK_FORM, times: ['evening'] }, 'days', 'sat')
    expect(next.times).toEqual(['evening'])
    expect(next.days).toEqual(['sat'])
  })

  // The two tests below are the whole reason this function is pure. React
  // batches two clicks in one tick; whether both survive depends entirely on
  // what the second update reads.
  it('keeps both selections when each update reads the previous result', () => {
    // What `setForm(prev => togglePill(prev, ...))` does.
    const first = togglePill(BLANK_FORM, 'days', 'mon')
    const second = togglePill(first, 'days', 'wed')
    expect(second.days).toEqual(['mon', 'wed'])
  })

  it('loses the first selection when both updates read the same stale form', () => {
    // What `setForm(togglePill(form, ...))` does — the shipped bug. Kept as a
    // test so the functional-update requirement is documented by a failure
    // anyone can run, not only by the comment above togglePill.
    const first = togglePill(BLANK_FORM, 'days', 'mon')
    const stale = togglePill(BLANK_FORM, 'days', 'wed')
    expect(first.days).toEqual(['mon'])
    expect(stale.days).toEqual(['wed'])
  })
})

describe('timezones', () => {
  it('detects a zone this runtime can resolve', () => {
    const tz = detectTimezone()
    expect(typeof tz).toBe('string')
    if (tz) expect(isValidTimezone(tz)).toBe(true)
  })

  it('accepts real IANA names', () => {
    expect(isValidTimezone('Europe/Rome')).toBe(true)
    expect(isValidTimezone('America/Bogota')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('rejects the plausible-looking things people type instead', () => {
    expect(isValidTimezone('Rome')).toBe(false)
    expect(isValidTimezone('GMT+2')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isValidTimezone('  Europe/Rome  ')).toBe(true)
  })
})

describe('formatAvailability', () => {
  it('reads canonical order, not click order', () => {
    expect(formatAvailability(['fri', 'mon'], ['evening', 'morning'], 'Europe/Rome')).toBe(
      'Mon, Fri · mornings and evenings · Europe/Rome',
    )
  })

  it('does not say "and" for a single bucket', () => {
    expect(formatAvailability(['wed'], ['afternoon'], 'UTC')).toBe('Wed · afternoons · UTC')
  })

  it('drops the parts that are empty instead of leaving separators', () => {
    expect(formatAvailability([], [], '')).toBe('')
    expect(formatAvailability(['mon'], [], '')).toBe('Mon')
    expect(formatAvailability([], ['morning'], 'UTC')).toBe('mornings · UTC')
  })

  it('ignores ids that are not options', () => {
    expect(formatAvailability(['mon', 'someday'], ['morning', 'midnight'], '')).toBe('Mon · mornings')
  })
})

describe('validateStep', () => {
  it('passes every step on a complete form', () => {
    expect(validateStep(0, VALID)).toBeNull()
    expect(validateStep(1, VALID)).toBeNull()
    expect(validateStep(2, VALID)).toBeNull()
  })

  it('asks for a name before anything else on step 0', () => {
    expect(validateStep(0, { ...VALID, name: '   ' })).toMatch(/name/i)
  })

  it('counts the characters still missing from a too-short topic', () => {
    expect(validateStep(0, { ...VALID, topic: 'hi' })).toMatch(/18 more characters/)
  })

  it('does not check availability or email on step 0', () => {
    expect(validateStep(0, { ...VALID, days: [], times: [], email: 'nope' })).toBeNull()
  })

  it('requires a day, then a bucket, then a resolvable zone on step 1', () => {
    expect(validateStep(1, { ...VALID, days: [] })).toMatch(/day/i)
    expect(validateStep(1, { ...VALID, times: [] })).toMatch(/morning, afternoon or evening/)
    expect(validateStep(1, { ...VALID, timezone: 'Rome' })).toMatch(/timezone/i)
  })

  it('requires a complete email on step 2 and leaves the channels optional', () => {
    expect(validateStep(2, { ...VALID, email: 'ana@example' })).toMatch(/email/i)
    expect(validateStep(2, { ...VALID, whatsapp: '', instagram: '' })).toBeNull()
  })

  it('accepts a WhatsApp number only with its country code', () => {
    expect(validateStep(2, { ...VALID, whatsapp: '+57 300 123 4567' })).toBeNull()
    expect(validateStep(2, { ...VALID, whatsapp: '+39 (333) 123-4567' })).toBeNull()
    expect(validateStep(2, { ...VALID, whatsapp: '300 123 4567' })).toMatch(/country code/)
    expect(validateStep(2, { ...VALID, whatsapp: '+57' })).toMatch(/country code/)
  })

  it('returns null for a step that does not exist, so the success step is reachable', () => {
    expect(validateStep(3, BLANK_FORM)).toBeNull()
  })
})

describe('normalizeInstagram', () => {
  it('reduces every shape of the same handle to the handle', () => {
    for (const input of [
      'ana.ruiz',
      '@ana.ruiz',
      '@@ana.ruiz',
      '  @ana.ruiz  ',
      'instagram.com/ana.ruiz',
      'www.instagram.com/ana.ruiz/',
      'https://www.instagram.com/ana.ruiz?hl=en',
      'https://instagram.com/ana.ruiz/#reels',
    ]) {
      expect(normalizeInstagram(input)).toBe('ana.ruiz')
    }
  })

  it('returns an empty string for nothing usable', () => {
    expect(normalizeInstagram('')).toBe('')
    expect(normalizeInstagram(null)).toBe('')
    expect(normalizeInstagram('@')).toBe('')
    expect(normalizeInstagram('ana ruiz')).toBe('')
    expect(normalizeInstagram('instagram.com')).toBe('')
  })

  it('refuses another site’s link rather than reading its host as a handle', () => {
    expect(normalizeInstagram('https://tiktok.com/@ana')).toBe('')
    expect(normalizeInstagram('tiktok.com/@ana')).toBe('')
    expect(normalizeInstagram('https://example.com/ana')).toBe('')
  })

  it('keeps underscores and digits, which are legal in a handle', () => {
    expect(normalizeInstagram('@ana_ruiz_23')).toBe('ana_ruiz_23')
  })
})

describe('describeInsertError', () => {
  it('tells the visitor to stop retrying when the table is not deployed', () => {
    for (const code of ['PGRST205', '42P01']) {
      expect(describeInsertError({ code })).toMatch(/lead@insiderguide\.co/)
      expect(describeInsertError({ code })).not.toMatch(/again/)
    }
  })

  it('asks for one more attempt on an unknown failure', () => {
    expect(describeInsertError({ code: 'nope' })).toMatch(/send it again|again/i)
    expect(describeInsertError(undefined)).toMatch(/again/i)
  })

  it('never leaks the Postgres message to the page', () => {
    const leaky = { code: '42501', message: 'permission denied for table public.call_requests' }
    expect(describeInsertError(leaky)).not.toMatch(/permission denied|public\./)
  })
})

describe('option ids', () => {
  // The migration's check constraints hardcode these. A rename here without one
  // there turns every submit into a 23514 nobody can debug from the page.
  it('are the seven day ids and three bucket ids the migration allows', () => {
    expect(DAY_IDS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
    expect(TIME_IDS).toEqual(['morning', 'afternoon', 'evening'])
  })
})
