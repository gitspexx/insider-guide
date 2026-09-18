/**
 * First-party Nucleo beacon. `window.nucleo` is defined by the inline snippet in
 * index.html (source: nucleo/docs/tracking-snippet.md). Page views fire on load;
 * call this on real conversions only (a successful submit, not a click).
 * No-op when the snippet is absent (tests, blocked script).
 */
export function nucleoTrack(event, props) {
  try {
    window.nucleo?.track(event, props)
  } catch {
    /* analytics must never break a form */
  }
}
