import Papa from 'papaparse'

/**
 * Extract a canonical place reference from a Google Maps URL.
 * Priority: explicit place_id → CID (?cid= | ftid hex pair) → coordinates.
 * The ftid second hex component IS the CID in decimal.
 */
export function extractPlaceRef(url) {
  const out = { cid: null, placeId: null, lat: null, lng: null }
  if (!url || typeof url !== 'string') return out
  try {
    const placeId = url.match(/[?&](?:query_place_id|place_id)=([A-Za-z0-9_-]+)/)
    if (placeId) out.placeId = placeId[1]

    const cid = url.match(/[?&]cid=(\d+)/)
    if (cid) out.cid = cid[1]

    if (!out.cid) {
      // ftid appears as "!1s0x...:0x..." in data= blobs or as ftid=0x...:0x...
      const ftid = url.match(/(?:!1s|[?&]ftid=)0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/)
      if (ftid) out.cid = BigInt('0x' + ftid[1]).toString()
    }

    const coords = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (coords) {
      out.lat = parseFloat(coords[1])
      out.lng = parseFloat(coords[2])
    }
  } catch {
    /* malformed URL → nulls */
  }
  return out
}

/**
 * Parse one Google Takeout saved-list CSV (columns: Title, Note, URL[, Comment]).
 * Returns { rows, failed } — rows ready for preview_import, failed rows for display.
 */
export function parseTakeoutCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  const rows = []
  const failed = []
  for (const raw of parsed.data) {
    const title = (raw.Title || raw.title || '').trim()
    const note = (raw.Note || raw.note || '').trim()
    const url = (raw.URL || raw.url || '').trim()
    if (!title || !url) {
      failed.push({ title, note, url, reason: !title ? 'missing title' : 'missing URL' })
      continue
    }
    const ref = extractPlaceRef(url)
    rows.push({ title, note, url, cid: ref.cid, place_id: ref.placeId, lat: ref.lat, lng: ref.lng })
  }
  return { rows, failed }
}
