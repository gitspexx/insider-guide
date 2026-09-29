// availability.js — the pure logic behind /book.
//
// /book is an availability REQUEST, not a slot picker: nobody publishes a
// calendar, the visitor says which days and which parts of the day suit them,
// and a human picks from that. Everything here is deliberately free of React so
// availability.test.js can pin the rules without a DOM.
//
// The option ids are the values stored in call_requests.days / .times, and the
// migration's check constraints name exactly these strings. Changing an id is a
// migration, not a rename.

export const DAY_OPTIONS = [
  { id: 'mon', label: 'Mon', long: 'Monday' },
  { id: 'tue', label: 'Tue', long: 'Tuesday' },
  { id: 'wed', label: 'Wed', long: 'Wednesday' },
  { id: 'thu', label: 'Thu', long: 'Thursday' },
  { id: 'fri', label: 'Fri', long: 'Friday' },
  { id: 'sat', label: 'Sat', long: 'Saturday' },
  { id: 'sun', label: 'Sun', long: 'Sunday' },
]

// Buckets, not times. A traveller in Bali and a hotel in Medellín never share a
// clock, so the request carries a coarse window plus the visitor's zone and the
// arithmetic happens once, on our side, when the invite goes out.
export const TIME_OPTIONS = [
  { id: 'morning', label: 'Morning', hours: '09:00 – 12:00' },
  { id: 'afternoon', label: 'Afternoon', hours: '12:00 – 17:00' },
  { id: 'evening', label: 'Evening', hours: '17:00 – 21:00' },
]

export const DAY_IDS = DAY_OPTIONS.map((d) => d.id)
export const TIME_IDS = TIME_OPTIONS.map((t) => t.id)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// A stored WhatsApp number has to be dialable from anywhere, which means the
// country code is not optional — "300 123 4567" is four different people. The
// shape is checked, the number is not: there is no offline way to know whether
// +57 300 123 4567 exists, and rejecting a real number is worse than storing a
// wrong one someone can eyeball.
const WHATSAPP_RE = /^\+[0-9][0-9\s().-]{6,24}$/
const MIN_TOPIC = 20

export const BLANK_FORM = {
  name: '',
  topic: '',
  days: [],
  times: [],
  timezone: '',
  email: '',
  whatsapp: '',
  instagram: '',
}

/**
 * Add or remove one pill id, returning a NEW form.
 *
 * Call it as `setForm(prev => togglePill(prev, key, id))` and never as
 * `setForm(togglePill(form, key, id))`. Two pills toggled inside one React
 * batch both read the same rendered `form`, so the second update overwrites the
 * first and the earlier pill silently un-selects — which is a real bug that got
 * shipped once in the page this was ported from. availability.test.js pins both
 * halves of that so the distinction cannot be refactored away by accident.
 */
export function togglePill(form, key, id) {
  const current = form[key] || []
  return {
    ...form,
    [key]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
  }
}

/**
 * The visitor's IANA zone, or '' when the platform will not say. Never throws:
 * an unusable Intl is a blank field the visitor can type into, not a blank page.
 */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/**
 * Whether a string is a zone this runtime can actually resolve. The field is
 * editable — auto-detect is wrong often enough (VPN, a borrowed laptop) that
 * locking it would be worse — so "Rome" and "GMT+2" both have to be caught
 * before they reach a column that later does date maths.
 */
export function isValidTimezone(tz) {
  const value = String(tz || '').trim()
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function joinWithAnd(parts) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * One human line summarising a selection, e.g.
 * "Mon, Fri · mornings and evenings · Europe/Rome".
 *
 * Reads the canonical option order rather than click order, so a visitor who
 * picks Friday before Monday still sees a week that runs forwards. Shown back
 * on the contact step — a request whose whole value is "when" deserves a
 * last look before it is sent.
 */
export function formatAvailability(days = [], times = [], timezone = '') {
  const dayLabels = DAY_OPTIONS.filter((d) => days.includes(d.id)).map((d) => d.label)
  const timeLabels = TIME_OPTIONS.filter((t) => times.includes(t.id)).map((t) => `${t.label.toLowerCase()}s`)
  const parts = []
  if (dayLabels.length) parts.push(dayLabels.join(', '))
  if (timeLabels.length) parts.push(joinWithAnd(timeLabels))
  const tz = String(timezone || '').trim()
  if (tz) parts.push(tz)
  return parts.join(' · ')
}

/**
 * First fixable problem on `step`, phrased as an instruction, or null.
 *
 * Same posture as CreatorApply's validate(): the button stays live and says
 * what is wrong, because a disabled Next tells nobody which pill they missed.
 */
export function validateStep(step, form) {
  if (step === 0) {
    if (!form.name.trim()) return 'Add your name — a call needs someone to ask for.'
    const short = MIN_TOPIC - form.topic.trim().length
    if (short > 0) return `Say a little more about what you want to cover — about ${short} more characters. One sentence is enough.`
    return null
  }
  if (step === 1) {
    if (form.days.length === 0) return 'Pick at least one day that works for you.'
    if (form.times.length === 0) return 'Pick at least one part of the day — morning, afternoon or evening.'
    if (!isValidTimezone(form.timezone)) return 'That timezone isn’t one we can resolve. Use a zone name like Europe/Rome or America/Bogota.'
    return null
  }
  if (step === 2) {
    if (!EMAIL_RE.test(form.email.trim())) return 'That email address doesn’t look complete — check it for a typo. The invite goes there.'
    const whatsapp = form.whatsapp.trim()
    if (whatsapp && !WHATSAPP_RE.test(whatsapp)) {
      return 'Write the WhatsApp number with its country code, like +57 300 123 4567 — a local number doesn’t say which country it’s in.'
    }
    return null
  }
  return null
}

/**
 * Reduce whatever someone pastes into an Instagram handle to the handle.
 * "@ana", "instagram.com/ana/", "https://www.instagram.com/ana?hl=en" all
 * become "ana", so the person opening the DM does not have to.
 *
 * Returns '' for anything with no handle left in it, which is what an empty
 * optional field stores.
 */
export function normalizeInstagram(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const igMatch = raw.replace(/^https?:\/\//i, '').match(/^(?:www\.)?instagram\.com\/?(.*)$/i)
  let handle
  if (igMatch) {
    handle = igMatch[1]
  } else if (/^https?:\/\//i.test(raw) || /^[\w.-]+\.[a-z]{2,}\//i.test(raw)) {
    // Some other site's link. Periods are legal in a handle, so without this a
    // pasted tiktok.com/@ana would quietly normalise to the handle "tiktok.com".
    return ''
  } else {
    handle = raw
  }

  handle = handle.split(/[?#/]/)[0].replace(/^@+/, '')
  // Instagram allows letters, digits, periods and underscores; anything else
  // came from the URL or from a typo, and keeping it would break the link.
  return /^[A-Za-z0-9._]+$/.test(handle) ? handle : ''
}

/**
 * PostgREST passes the Postgres SQLSTATE through. Translate the codes this form
 * can realistically trip, and never interpolate err.message — that string is
 * written for us and carries schema names straight to an anonymous page. The raw
 * error goes to the console instead.
 *
 * Mirrors CreatorApply.jsx's describeInsertError; it lives here rather than
 * there because /book is the first page whose copy is shared with a test.
 */
export function describeInsertError(err) {
  switch (err?.code) {
    case '23514':
      return 'One of your answers is longer than we can store. Trim what you wrote about the call and send it again.'
    case '22023':
      return 'That looked like more than one request in a single submission. Reload the page and send it once.'
    case '42501':
      return 'The server refused the request. That’s on our side, not yours — email lead@insiderguide.co and we’ll set the call up by hand.'
    // Table absent from PostgREST's schema cache: the migration behind this
    // form has not been applied. Retrying cannot fix it, so don't ask.
    case 'PGRST205':
    case '42P01':
      return 'Requests aren’t reachable right now — this one is on us. Email lead@insiderguide.co with the days that suit you and we’ll pick it up there.'
    default:
      return 'Your request didn’t save. Press send again — if it fails twice, email lead@insiderguide.co and we’ll set the call up by hand.'
  }
}
