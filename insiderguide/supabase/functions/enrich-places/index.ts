// insiderguide/supabase/functions/enrich-places/index.ts
// Drains businesses.enrich_status='pending_enrich' via Outscraper.
// Called by pg_cron every 5 min with x-enrich-secret. Batch of 8 keeps each
// invocation well under the edge-function time limit.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CATEGORY_MAP: Record<string, string> = {
  restaurant: 'eat', food: 'eat', meal: 'eat',
  cafe: 'cafe', coffee: 'cafe', bakery: 'cafe',
  bar: 'drink', night_club: 'drink', pub: 'drink',
  hotel: 'stay', lodging: 'stay', hostel: 'stay', resort: 'stay',
  museum: 'do', tourist_attraction: 'do', amusement: 'do', tour: 'do',
  park: 'explore', natural_feature: 'explore', beach: 'explore', hiking: 'explore',
  spa: 'wellness', gym: 'wellness', yoga: 'wellness',
  store: 'essentials', supermarket: 'essentials', pharmacy: 'essentials',
}

function mapCategory(type: string | undefined): string | null {
  if (!type) return null
  const t = type.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_MAP)) if (t.includes(k)) return v
  return 'explore'
}

Deno.serve(async (req) => {
  if (req.headers.get('x-enrich-secret') !== Deno.env.get('ENRICH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('OUTSCRAPER_API_KEY')!

  const { data: pending } = await admin
    .from('businesses')
    .select('id, name, google_maps_url, google_cid, google_place_id, countries(name)')
    .eq('enrich_status', 'pending_enrich')
    .lt('enrich_attempts', 3)
    .order('created_at')
    .limit(8)

  let done = 0, failed = 0
  for (const b of pending ?? []) {
    try {
      const query = b.google_maps_url || `${b.name}, ${(b as any).countries?.name ?? ''}`
      const res = await fetch(
        `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=1&async=false`,
        { headers: { 'X-API-KEY': apiKey } },
      )
      if (!res.ok) throw new Error(`outscraper ${res.status}`)
      const json = await res.json()
      const place = json?.data?.[0]?.[0]
      if (!place?.name) throw new Error('no result')

      await admin.from('businesses').update({
        google_place_id: place.place_id ?? b.google_place_id,
        google_cid: place.google_id?.split(':')[1]
          ? BigInt(place.google_id.split(':')[1]).toString()
          : b.google_cid,
        lat: place.latitude ?? null,
        lng: place.longitude ?? null,
        location: place.full_address ?? null,
        city: place.city ?? null,
        website: place.site ?? null,
        photo_url: place.photo ?? null,
        category: mapCategory(place.type ?? place.category),
        enrich_status: 'enriched',
      }).eq('id', b.id)
      done++
    } catch (_e) {
      const { data: cur } = await admin.from('businesses').select('enrich_attempts').eq('id', b.id).single()
      const attempts = (cur?.enrich_attempts ?? 0) + 1
      await admin.from('businesses').update({
        enrich_attempts: attempts,
        enrich_status: attempts >= 3 ? 'enrich_failed' : 'pending_enrich',
      }).eq('id', b.id)
      failed++
    }
  }
  return new Response(JSON.stringify({ processed: done, failed, remaining_batch: (pending?.length ?? 0) }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
