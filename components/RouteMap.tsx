import { useEffect, useRef } from 'react'
import { Typography, useTheme } from '@mui/material'
import type * as Leaflet from 'leaflet'

type Props = {
    coordinates: Array<{ lat: number; lon: number }>
    stops?: Array<{ lat: number; lon: number; label: string }>
    height?: number
}

// Malá needitovateľná mapa s vykreslenou trasou. Dlaždice © OpenStreetMap contributors.
//
// `leaflet` sa importuje dynamicky (až vo vnútri useEffect), nie staticky na vrchu
// súboru. Tento súbor sa tranzitívne re-exportuje aj cez balíkový barrel, ktorý
// importuje aj Electron main proces (kvôli iným veciam ako `today`/PDF generátor).
// Leaflet pri statickom importe pristupuje k `window` hneď pri načítaní modulu -
// v Node/main procese `window` neexistuje a appka by na tom spadla.
const RouteMap = ({ coordinates, stops, height = 140 }: Props) => {
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

            const latlngs: Leaflet.LatLngExpression[] = coordinates.map(({ lat, lon }) => [lat, lon])

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

            // Číslované ciele cesty (destination + zastávky) medzi zeleným a červeným
            // markerom - odchod/návrat.
            for (const stop of stops ?? []) {
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="width:20px;height:20px;border-radius:50%;background:#1976d2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${stop.label}</div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                })
                L.marker([stop.lat, stop.lon], { icon }).addTo(map)
            }

            // Kontajner môže mať pri inicializácii nulovú veľkosť (napr. počas prechodu
            // Dialógu alebo kým sa ustáli okolitý layout). `fitBounds` sa preto zavolá
            // len RAZ, hneď ako kontajner reálne dostane nenulovú veľkosť - opakované
            // volanie pri každom ďalšom resize by zakaždým zrušilo používateľovo
            // ručné posunutie/priblíženie mapy.
            let fitted = false
            const stabilize = () => {
                if (!map) return
                map.invalidateSize()
                if (!fitted) {
                    const size = map.getSize()
                    if (size.x > 0 && size.y > 0) {
                        map.fitBounds(line.getBounds(), { padding: [10, 10] })
                        fitted = true
                    }
                }
            }
            stabilize()

            resizeObserver = new ResizeObserver(stabilize)
            resizeObserver.observe(containerRef.current)
            timer = setTimeout(stabilize, 150)
        })

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
            resizeObserver?.disconnect()
            map?.remove()
        }
    }, [coordinates, stops, isDark])

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
