// Dátové zdroje:
// - Nominatim (geocoding): © OpenStreetMap contributors, licencia ODbL
//   Podmienky: https://operations.osmfoundation.org/policies/nominatim/
// - OSRM demo server (smerovanie): https://project-osrm.org
//   ⚠ Demo server nie je určený pre produkčné nasadenie — môže byť odstavený
//   bez upozornenia. Pre produkciu zvážte self-host OSRM.
// - BigDataCloud (reverse geocoding krajín): https://www.bigdatacloud.com

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OSRM = 'https://router.project-osrm.org/route/v1/driving'
const BDC = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

const APP_UA = 'e-companies/1.0 (internal; https://github.com/your-org/e-companies)'

export type GeoPoint = { lat: number; lon: number }

const geocode = async (query: string): Promise<GeoPoint | null> => {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`
    try {
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA } })
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || !data.length) return null
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    } catch {
        return null
    }
}

// Ak už máme presné súradnice (vybrané z OSM návrhu), použi ich - inak geokóduj text.
const resolvePoint = (input: string | GeoPoint): Promise<GeoPoint | null> =>
    typeof input === 'string' ? geocode(input) : Promise.resolve(input)

export type OsmPlaceSuggestion = { label: string; shortLabel: string; countryCode: string | null; lat: number; lon: number }

// Vyhľadá miesta zodpovedajúce zadanému textu (pre autocomplete pri písaní).
// `label` je plný názov (na rozlíšenie v zozname), `shortLabel` len obec/mesto
// (na vyplnenie poľa po výbere), `countryCode` na automatické predvyplnenie krajiny,
// `lat`/`lon` na uloženie presnej polohy (presnejší prepočet km/trasy neskôr).
export const searchOsmPlaces = async (query: string): Promise<OsmPlaceSuggestion[]> => {
    const q = query.trim()
    if (q.length < 3) return []
    try {
        const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1&accept-language=sk`
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA } })
        if (!r.ok) return []
        const data = await r.json()
        if (!Array.isArray(data)) return []
        type NominatimResult = {
            display_name: string
            lat: string
            lon: string
            address?: {
                country_code?: string
                city?: string
                town?: string
                village?: string
                municipality?: string
                hamlet?: string
                county?: string
            }
        }
        return data
            .map((d: NominatimResult) => {
                const addr = d.address ?? {}
                const shortLabel = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.hamlet
                    ?? addr.county ?? d.display_name.split(',')[0].trim()
                return {
                    label: d.display_name,
                    shortLabel,
                    countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
                    lat: parseFloat(d.lat),
                    lon: parseFloat(d.lon),
                }
            })
            .filter((s: OsmPlaceSuggestion) => Boolean(s.label) && !Number.isNaN(s.lat) && !Number.isNaN(s.lon))
    } catch {
        return []
    }
}

export const calcOsmDistance = async (from: string, to: string): Promise<number | null> => {
    const [a, b] = await Promise.all([geocode(from), geocode(to)])
    if (!a || !b) return null
    try {
        const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA, 'Referer': 'https://github.com/your-org/e-companies' } })
        if (!r.ok) return null
        const data = await r.json()
        if (data.code !== 'Ok' || !data.routes?.length) return null
        return Math.round(data.routes[0].distance / 1000)
    } catch {
        return null
    }
}

const reverseCountry = async (lat: number, lon: number): Promise<string> => {
    try {
        const url = `${BDC}?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA } })
        if (!r.ok) return 'XX'
        const d = await r.json()
        return (d.countryCode ?? 'XX').toUpperCase()
    } catch {
        return 'XX'
    }
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Rekurzívne nájde všetky prechody hraníc pomocou binary search na súradniciach trasy.
// coords: GeoJSON [lon, lat][], cumKm/cumSec: kumulatívna vzdialenosť/trvanie po úsekoch,
// scale/durScale: korekčné faktory na skutočnú vzdialenosť/trvanie z OSRM
const splitByCountry = async (
    coords: [number, number][],
    cumKm: number[],
    scale: number,
    cumSec: number[],
    durScale: number,
    lo: number,
    hi: number,
    fromCountry: string,
    toCountry: string
): Promise<Array<{ country: string; km: number; durationMin: number }>> => {
    if (fromCountry === toCountry || hi - lo <= 1) {
        const km = Math.round((cumKm[hi] - cumKm[lo]) * scale)
        const durationMin = Math.round((cumSec[hi] - cumSec[lo]) * durScale / 60)
        return [{ country: fromCountry, km, durationMin }]
    }

    let left = lo, right = hi
    while (right - left > 1) {
        const mid = Math.floor((left + right) / 2)
        const c = await reverseCountry(coords[mid][1], coords[mid][0])
        if (c === fromCountry) left = mid
        else right = mid
    }

    const nextCountry = await reverseCountry(coords[right][1], coords[right][0])
    const firstKm = Math.round((cumKm[right] - cumKm[lo]) * scale)
    const firstDurationMin = Math.round((cumSec[right] - cumSec[lo]) * durScale / 60)

    const rest = await splitByCountry(coords, cumKm, scale, cumSec, durScale, right, hi, nextCountry, toCountry)
    return [{ country: fromCountry, km: firstKm, durationMin: firstDurationMin }, ...rest]
}

export type OsmCountryLeg = { country: string; km: number; durationMin: number }
export type OsmRouteOption = {
    km: number
    durationMin: number
    countries: OsmCountryLeg[]
    // Pole objektov (nie [number, number][]) - Firestore odmieta priamo vnorené polia,
    // takže tento tvar ide priamo uložiť na Trip.routeCoordinates bez ďalšej konverzie.
    coordinates: Array<{ lat: number; lon: number }>
}

// Spracuje jednu OSRM trasu (geometria + trvanie) na rozpad po krajinách.
const breakdownRoute = async (route: {
    geometry: { coordinates: [number, number][] }
    distance: number
    duration: number
    legs?: Array<{ annotation?: { duration?: number[] } }>
}): Promise<OsmRouteOption | null> => {
    const coords = route.geometry.coordinates
    const totalDistanceM = route.distance
    const totalDurationS = route.duration
    if (!coords.length) return null

    const cumKm: number[] = [0]
    for (let i = 1; i < coords.length; i++) {
        const [lon0, lat0] = coords[i - 1]
        const [lon1, lat1] = coords[i]
        cumKm.push(cumKm[i - 1] + haversineKm(lat0, lon0, lat1, lon1))
    }
    const totalHavKm = cumKm[cumKm.length - 1]
    const scale = totalHavKm > 0 ? (totalDistanceM / 1000) / totalHavKm : 1

    const annDuration: number[] = route.legs?.[0]?.annotation?.duration ?? []
    const cumSec: number[] = [0]
    if (annDuration.length > 0) {
        for (let i = 0; i < coords.length - 1; i++) {
            cumSec.push(cumSec[i] + (annDuration[i] ?? 0))
        }
    } else {
        // OSRM niekedy nevráti anotácie trvania (napr. pre alternatívne trasy) -
        // bez tejto vetvy by durationMin vyšlo 0 pre každý úsek. Odhadni trvanie
        // proporcionálne podľa prejdenej vzdialenosti.
        for (let i = 1; i < coords.length; i++) {
            cumSec.push(totalHavKm > 0 ? (cumKm[i] / totalHavKm) * totalDurationS : 0)
        }
    }
    const totalAnnSec = cumSec[cumSec.length - 1]
    const durScale = totalAnnSec > 0 ? totalDurationS / totalAnnSec : 1

    const [startCountry, endCountry] = await Promise.all([
        reverseCountry(coords[0][1], coords[0][0]),
        reverseCountry(coords[coords.length - 1][1], coords[coords.length - 1][0]),
    ])

    const countries = startCountry === endCountry
        ? [{ country: startCountry, km: Math.round(totalDistanceM / 1000), durationMin: Math.round(totalDurationS / 60) }]
        : await splitByCountry(coords, cumKm, scale, cumSec, durScale, 0, coords.length - 1, startCountry, endCountry)

    return {
        km: Math.round(totalDistanceM / 1000),
        durationMin: Math.round(totalDurationS / 60),
        countries,
        coordinates: coords.map(([lon, lat]) => ({ lat, lon })),
    }
}

// Vráti trasu/trasy medzi dvomi bodmi, každú s km, trvaním a rozpadom po krajinách.
// `from`/`to` môžu byť text (geokóduje sa) alebo už známe súradnice (presnejšie, bez geokódovania).
// `alternatives: false` (predvolené) - jedna najlepšia trasa, bez zbytočných extra
// reverse-geocode volaní na alternatívy, ktoré by sa aj tak zahodili (napr. "Navrhnúť km").
// `alternatives: true` - viac možností na výber (dialóg "Vyberte trasu").
export const calcOsmRouteOptions = async (
    from: string | GeoPoint,
    to: string | GeoPoint,
    { alternatives = false }: { alternatives?: boolean } = {}
): Promise<OsmRouteOption[] | null> => {
    const [a, b] = await Promise.all([resolvePoint(from), resolvePoint(to)])
    if (!a || !b) return null
    try {
        const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?geometries=geojson&overview=full&annotations=duration&alternatives=${alternatives}`
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA, 'Referer': 'https://github.com/your-org/e-companies' } })
        if (!r.ok) return null
        const data = await r.json()
        if (data.code !== 'Ok' || !data.routes?.length) return null

        const options = await Promise.all(data.routes.map((rt: Parameters<typeof breakdownRoute>[0]) => breakdownRoute(rt)))
        const valid = options.filter((o): o is OsmRouteOption => o !== null)
        return valid.length > 0 ? valid : null
    } catch {
        return null
    }
}
