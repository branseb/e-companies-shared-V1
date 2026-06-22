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

const geocode = async (query: string): Promise<{ lat: number; lon: number } | null> => {
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
// coords: GeoJSON [lon, lat][], cumKm: kumulatívne vzdialenosti po Haversine, scale: korekčný faktor OSRM
const splitByCountry = async (
    coords: [number, number][],
    cumKm: number[],
    scale: number,
    lo: number,
    hi: number,
    fromCountry: string,
    toCountry: string
): Promise<Array<{ country: string; km: number }>> => {
    if (fromCountry === toCountry || hi - lo <= 1) {
        const km = Math.round((cumKm[hi] - cumKm[lo]) * scale)
        return [{ country: fromCountry, km }]
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

    const rest = await splitByCountry(coords, cumKm, scale, right, hi, nextCountry, toCountry)
    return [{ country: fromCountry, km: firstKm }, ...rest]
}

export const calcOsmDistanceByCountry = async (
    from: string,
    to: string
): Promise<Array<{ country: string; km: number }> | null> => {
    const [a, b] = await Promise.all([geocode(from), geocode(to)])
    if (!a || !b) return null
    try {
        const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?geometries=geojson&overview=full`
        const r = await fetch(url, { headers: { 'User-Agent': APP_UA, 'Referer': 'https://github.com/your-org/e-companies' } })
        if (!r.ok) return null
        const data = await r.json()
        if (data.code !== 'Ok' || !data.routes?.length) return null

        const coords: [number, number][] = data.routes[0].geometry.coordinates
        const totalDistanceM: number = data.routes[0].distance

        if (!coords.length) return null

        const cumKm: number[] = [0]
        for (let i = 1; i < coords.length; i++) {
            const [lon0, lat0] = coords[i - 1]
            const [lon1, lat1] = coords[i]
            cumKm.push(cumKm[i - 1] + haversineKm(lat0, lon0, lat1, lon1))
        }
        const totalHavKm = cumKm[cumKm.length - 1]
        const scale = totalHavKm > 0 ? (totalDistanceM / 1000) / totalHavKm : 1

        const [startCountry, endCountry] = await Promise.all([
            reverseCountry(coords[0][1], coords[0][0]),
            reverseCountry(coords[coords.length - 1][1], coords[coords.length - 1][0]),
        ])

        if (startCountry === endCountry) {
            return [{ country: startCountry, km: Math.round(totalDistanceM / 1000) }]
        }

        return splitByCountry(coords, cumKm, scale, 0, coords.length - 1, startCountry, endCountry)
    } catch {
        return null
    }
}
