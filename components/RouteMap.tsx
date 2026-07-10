import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
    coordinates: [number, number][] // GeoJSON [lon, lat][]
    height?: number
}

// Malá needitovateľná mapa s vykreslenou trasou. Dlaždice © OpenStreetMap contributors.
const RouteMap = ({ coordinates, height = 140 }: Props) => {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current || coordinates.length === 0) return

        const latlngs: L.LatLngExpression[] = coordinates.map(([lon, lat]) => [lat, lon])

        const map = L.map(containerRef.current, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
        }).addTo(map)

        const line = L.polyline(latlngs, { color: '#1976d2', weight: 3 }).addTo(map)
        L.circleMarker(latlngs[0], { radius: 5, color: '#fff', weight: 2, fillColor: '#22C55E', fillOpacity: 1 }).addTo(map)
        L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, color: '#fff', weight: 2, fillColor: '#EF4444', fillOpacity: 1 }).addTo(map)

        map.fitBounds(line.getBounds(), { padding: [10, 10] })

        return () => { map.remove() }
    }, [coordinates])

    return <div ref={containerRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} />
}

export default RouteMap
