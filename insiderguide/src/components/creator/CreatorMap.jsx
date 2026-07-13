// insiderguide/src/components/creator/CreatorMap.jsx
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

/**
 * spots: [{ id, name, lat, lng }] — only pass rows with coordinates.
 * onPinClick(id) highlights the matching card in the list.
 */
export default function CreatorMap({ spots, accent = '#C8A55A', onPinClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: { compact: true },
    })
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const withCoords = spots.filter((s) => s.lat != null && s.lng != null)
    if (withCoords.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    withCoords.forEach((s) => {
      const el = document.createElement('button')
      el.setAttribute('aria-label', s.name)
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${accent};border:2px solid rgba(11,10,8,0.9);cursor:pointer;box-shadow:0 0 8px ${accent}55;`
      el.addEventListener('click', () => onPinClick?.(s.id))
      const marker = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map)
      markersRef.current.push(marker)
      bounds.extend([s.lng, s.lat])
    })
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 400 })
  }, [spots, accent, onPinClick])

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden border border-border" />
}
