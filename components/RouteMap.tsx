import { useEffect, useRef } from 'react'
import { Typography, useTheme } from '@mui/material'
import type * as Leaflet from 'leaflet'

type Props = {
    coordinates: [number, number][] // GeoJSON [lon, lat][]
    height?: number
}

// Malá needitovateľná mapa s vykreslenou trasou. Dlaždice © OpenStreetMap contributors.
//
// `leaflet` sa importuje dynamicky (až vo vnútri useEffect), nie staticky na vrchu
// súboru. Tento súbor sa tranzitívne re-exportuje aj cez balíkový barrel, ktorý
// importuje aj Electron main proces (kvôli iným veciam ako `today`/PDF generátor).
// Leaflet pri statickom importe pristupuje k `window` hneď pri načítaní modulu -
// v Node/main procese `window` neexistuje a appka by na tom spadla.
const RouteMap = ({ coordinates, height = 140 }: Props) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'

    useEffect(() => {
        if (!containerRef.current || coordinates.length === 0) return
        let cancelled = false
        let map: Leaflet.Map | null = null
        let resizeObserver: ResizeObserver | null = null
        let timer: ReturnType<typeof setTimeout> | null = null

        Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
            if (cancelled || !containerRef.current) return
            const L = mod.default ?? (mod as unknown as typeof Leaflet)

            const latlngs: Leaflet.LatLngExpression[] = coordinates.map(([lon, lat]) => [lat, lon])

            map = L.map(containerRef.current, {
                zoomControl: false,
                attributionControl: false,
                dragging: true,
                scrollWheelZoom: true,
                doubleClickZoom: true,
                boxZoom: true,
                keyboard: true,
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
            }).addTo(map)

            // Tmavý režim: len dlaždice sa invertujú (trasa/značky si držia vlastné farby).
            if (isDark) {
                const tilePane = map.getPane('tilePane')
                if (tilePane) tilePane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)'
            }

            const line = L.polyline(latlngs, { color: '#1976d2', weight: 3 }).addTo(map)
            L.circleMarker(latlngs[0], { radius: 5, color: '#fff', weight: 2, fillColor: '#22C55E', fillOpacity: 1 }).addTo(map)
            L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, color: '#fff', weight: 2, fillColor: '#EF4444', fillOpacity: 1 }).addTo(map)

            map.fitBounds(line.getBounds(), { padding: [10, 10] })

            // Kontajner môže mať pri inicializácii nulovú veľkosť (napr. počas prechodu
            // Dialógu alebo kým sa ustáli okolitý layout) - po ustálení mapu prerátaj.
            resizeObserver = new ResizeObserver(() => {
                map?.invalidateSize()
                map?.fitBounds(line.getBounds(), { padding: [10, 10] })
            })
            resizeObserver.observe(containerRef.current)
            timer = setTimeout(() => {
                map?.invalidateSize()
                map?.fitBounds(line.getBounds(), { padding: [10, 10] })
            }, 150)
        })

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
            resizeObserver?.disconnect()
            map?.remove()
        }
    }, [coordinates, isDark])

    return (
        <div>
            <div
                ref={containerRef}
                // Mapa je vnorená aj v klikateľnej karte (výber trasy) - pohyb/klik po mape
                // nesmie zároveň spustiť výber tej karty.
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', cursor: 'grab', backgroundColor: theme.palette.background.paper }}
            />
            <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontSize: 10, color: 'text.disabled', textAlign: 'right' }}>
                © OpenStreetMap contributors
            </Typography>
        </div>
    )
}

export default RouteMap
