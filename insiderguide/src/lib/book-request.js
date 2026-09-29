// Pure helpers behind /book — the call request a business lands on after
// replying to cold outreach and asking to talk.
//
// Alex travels, so there are no calendar slots to publish: the visitor tells us
// which weekdays and time buckets work in THEIR timezone and we come back with
// two or three concrete times. Same model as bettercallaxel.com/book, in this
// site's stack. Everything here is pure so it is testable without a DOM; the
// Supabase write lives in the page.

export const BOOK_DAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
]

export const BOOK_TIMES = [
  { id: 'morning', label: 'Morning', hint: '9am – 12pm' },
  { id: 'afternoon', label: 'Afternoon', hint: '12pm – 5pm' },
  { id: 'evening', label: 'Evening', hint: '5pm – 9pm' },
]

export const EMPTY_BOOK_FORM = {
  name: '',
  business: '',
  countryId: '',
  need: '',
  days: [],
  times: [],
  timezone: '',
  email: '',
  whatsapp: '',
  instagram: '',
}

export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value ?? '').trim())
}

/** One user-facing message per step, or null when the step is complete. */
export function validateBookStep(step, form) {
  if (step === 0) {
    if (!form.name.trim()) return 'Please tell us your name.'
    if (!form.business.trim()) return 'Please tell us the name of your business.'
    if (!form.countryId) return 'Please pick the country your business is in.'
    if (!form.need.trim()) return 'Please tell us what you want to talk about.'
    return null
  }
  if (step === 1) {
    if (form.days.length === 0) return 'Please pick at least one day.'
    if (form.times.length === 0) return 'Please pick at least one time of day.'
    if (!form.timezone.trim()) return 'Please enter your timezone.'
    return null
  }
  if (step === 2) {
    if (!isValidEmail(form.email)) return 'Please enter a valid email address.'
    return null
  }
  return null
}

function sortBy(order, items) {
  return [...items].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function formatDays(days) {
  const byId = new Map(BOOK_DAYS.map((d) => [d.id, d.label]))
  return sortBy(BOOK_DAYS.map((d) => d.id), days).map((id) => byId.get(id) ?? id).join(', ')
}

export function formatTimes(times) {
  const byId = new Map(BOOK_TIMES.map((t) => [t.id, t]))
  return sortBy(BOOK_TIMES.map((t) => t.id), times)
    .map((id) => {
      const slot = byId.get(id)
      return slot ? `${slot.label} (${slot.hint})` : id
    })
    .join(', ')
}

/**
 * The notes string the CRM anon-insert policy expects — it must START with
 * `[partner-signup]` (policy: notes LIKE '[partner-signup]%'). The
 * `Prefers a quick call.` segment is the one notify-partner-application already
 * parses; `[kind=book-a-call]` is what tells it this is a call request and not
 * an application. The availability lines are lifted into their own block by
 * the notifier.
 */
export function buildBookNotes(form) {
  const lines = [
    `[partner-signup] Tier interest: call. Prefers a quick call. [kind=book-a-call] ${form.need.trim()}`,
    `Business: ${form.business.trim()}`,
    `Available days: ${formatDays(form.days)}`,
    `Available times: ${formatTimes(form.times)}`,
    `Timezone: ${form.timezone.trim()}`,
  ]
  if (form.whatsapp.trim()) lines.push(`WhatsApp: ${form.whatsapp.trim()}`)
  if (form.instagram.trim()) lines.push(`Instagram: ${form.instagram.trim()}`)
  return lines.join('\n')
}

/**
 * The `businesses` row. Same shape /partner writes, which is proven to pass
 * `anon_insert_partner_signup_insiderguide` (tier listed, unpublished,
 * outreach_status to_contact, notes prefix). `name` is the business — the
 * CRM lists businesses, and the person's name is in the notes. `id` is minted
 * by the caller because anon may INSERT but not SELECT the row back.
 */
export function buildBookPayload(form, id) {
  return {
    id,
    name: form.business.trim(),
    country_id: form.countryId,
    city: '',
    category: 'other',
    website: '',
    instagram_handle: form.instagram.trim().replace(/^@/, ''),
    whatsapp: form.whatsapp.trim(),
    email: form.email.trim(),
    tier: 'listed',
    published: false,
    outreach_status: 'to_contact',
    notes: `${buildBookNotes(form)}\nContact name: ${form.name.trim()}`,
  }
}
