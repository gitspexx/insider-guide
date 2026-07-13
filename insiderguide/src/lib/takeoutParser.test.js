import { describe, it, expect } from 'vitest'
import { extractPlaceRef, parseTakeoutCsv } from './takeoutParser'

describe('extractPlaceRef', () => {
  it('extracts CID from ?cid= URLs', () => {
    expect(extractPlaceRef('https://maps.google.com/?cid=12345678901234567890'))
      .toEqual({ cid: '12345678901234567890', placeId: null, lat: null, lng: null })
  })

  it('extracts CID from ftid hex pair in /maps/place URLs', () => {
    const url = 'https://www.google.com/maps/place/Caf%C3%A9+Test/data=!4m2!3m1!1s0x89c259af336b3341:0xa4969e07ce3108de'
    const ref = extractPlaceRef(url)
    expect(ref.cid).toBe(BigInt('0xa4969e07ce3108de').toString())
  })

  it('extracts ftid from ftid= query param', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=x&ftid=0x89c259af336b3341:0xa4969e07ce3108de'
    expect(extractPlaceRef(url).cid).toBe(BigInt('0xa4969e07ce3108de').toString())
  })

  it('extracts place_id when present', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4'
    expect(extractPlaceRef(url).placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
  })

  it('extracts coordinates from /@lat,lng URLs as fallback', () => {
    const ref = extractPlaceRef('https://www.google.com/maps/place/Somewhere/@4.60971,-74.08175,17z')
    expect(ref.lat).toBeCloseTo(4.60971)
    expect(ref.lng).toBeCloseTo(-74.08175)
  })

  it('returns nulls for unparseable URLs', () => {
    expect(extractPlaceRef('not a url'))
      .toEqual({ cid: null, placeId: null, lat: null, lng: null })
  })
})

describe('parseTakeoutCsv', () => {
  const CSV = `Title,Note,URL,Comment
"Café Test","great flat white","https://maps.google.com/?cid=111",
"Museo del Oro","","https://www.google.com/maps/place/Museo/data=!4m2!3m1!1s0x0:0x2b",
"Broken row","",""
`
  it('parses rows and attaches refs', () => {
    const { rows, failed } = parseTakeoutCsv(CSV)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ title: 'Café Test', note: 'great flat white', cid: '111' })
    expect(rows[1].cid).toBe(BigInt('0x2b').toString())
    expect(failed).toHaveLength(1)
  })

  it('handles quoted commas and newlines in notes', () => {
    const tricky = 'Title,Note,URL\n"A place","note, with comma\nand newline","https://maps.google.com/?cid=9"\n'
    const { rows } = parseTakeoutCsv(tricky)
    expect(rows[0].note).toBe('note, with comma\nand newline')
  })
})
