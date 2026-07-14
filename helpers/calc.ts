import type { TripSegment, StravneRates, StravneRatesEntry, TravelOrder } from '../types'
import { COUNTRY_OPTIONS, AMORTIZATION_RATE } from '../constants'
import { getRatesForDate } from './rates'

export const segHours = (fromTime: string, toTime: string): number => {
    if (!fromTime || !toTime) return 0
    if (fromTime === '00:00' && toTime === '00:00') return 24
    const [fh, fm] = fromTime.split(':').map(Number)
    const [th, tm] = toTime.split(':').map(Number)
    let diff = (th * 60 + tm) - (fh * 60 + fm)
    if (diff <= 0) diff += 1440
    return diff / 60
}

export type SegmentOverlap = { date: string; a: TripSegment; b: TripSegment }

// Dva úseky sa prekrývajú, ak zdieľajú dátum a ich časové rozsahy [fromTime, toTime) sa pretínajú.
// Nadväzujúce úseky (koniec jedného = začiatok druhého) prekryv nie sú - to je normálna reťaz cesty.
export const findSegmentOverlaps = (segments: TripSegment[]): SegmentOverlap[] => {
    const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
    }
    const range = (s: TripSegment) => {
        const start = toMinutes(s.fromTime)
        let end = toMinutes(s.toTime)
        if (end <= start) end += 1440 // úsek cez polnoc
        return [start, end] as const
    }

    const byDate = new Map<string, TripSegment[]>()
    for (const s of segments) {
        if (!s.date || !s.fromTime || !s.toTime) continue
        if (!byDate.has(s.date)) byDate.set(s.date, [])
        byDate.get(s.date)!.push(s)
    }

    const overlaps: SegmentOverlap[] = []
    for (const segs of byDate.values()) {
        for (let i = 0; i < segs.length; i++) {
            const [aStart, aEnd] = range(segs[i])
            for (let j = i + 1; j < segs.length; j++) {
                const [bStart, bEnd] = range(segs[j])
                if (aStart < bEnd && bStart < aEnd)
                    overlaps.push({ date: segs[i].date, a: segs[i], b: segs[j] })
            }
        }
    }
    return overlaps
}

export const calcSegStravne = (fromTime: string, toTime: string, country: string, entry: StravneRatesEntry): number | null => {
    const h = segHours(fromTime, toTime)
    if (country === 'SK') {
        if (h < 5)   return null
        if (h <= 12) return entry.sk_5
        if (h <= 18) return entry.sk_12
        return entry.sk_18
    } else {
        const fr = entry.foreign[country] ?? entry.foreign['OTHER']
        if (!fr || !fr.rate_12) return null
        if (h < 6)   return +(fr.rate_12 * 0.25).toFixed(2)
        if (h <= 12) return +(fr.rate_12 * 0.50).toFixed(2)
        return fr.rate_12
    }
}

type DayStravneEntry = { date: string; country: string; currency: string; hours: number; stravne: number }

export const calcDailyStravne = (segments: TripSegment[], ratesHistory: StravneRates, effectiveEntry?: StravneRatesEntry): DayStravneEntry[] => {
    const dates = [...new Set(segments.map(s => s.date))].sort()
    const result: DayStravneEntry[] = []

    const addHours = (
        byCountry: Record<string, { hours: number; currency: string }>,
        country: string, hours: number, entry: StravneRatesEntry,
    ) => {
        if (hours <= 0) return
        const countryOpt = COUNTRY_OPTIONS.find(c => c.code === country)
        const currency = countryOpt?.currency ?? entry.foreign[country]?.currency ?? entry.foreign['OTHER']?.currency ?? 'EUR'
        if (!byCountry[country]) byCountry[country] = { hours: 0, currency }
        byCountry[country].hours += hours
    }

    for (let di = 0; di < dates.length; di++) {
        const date = dates[di]
        const daySegs = segments.filter(s => s.date === date)
        const entry = effectiveEntry ?? getRatesForDate(ratesHistory, date)

        const hasOvernightFrom = di > 0
        const hasOvernightTo   = di < dates.length - 1

        const blocks: { country: string; segs: TripSegment[] }[] = []
        for (const seg of daySegs) {
            const c = seg.country ?? 'SK'
            const last = blocks[blocks.length - 1]
            if (!last || last.country !== c) blocks.push({ country: c, segs: [seg] })
            else last.segs.push(seg)
        }

        const byCountry: Record<string, { hours: number; currency: string }> = {}

        if (hasOvernightFrom) {
            const prevSegs = segments.filter(s => s.date === dates[di - 1])
            const overnightCtry = prevSegs[prevSegs.length - 1]?.country ?? 'SK'
            const firstFrom = daySegs[0]?.fromTime ?? ''
            if (firstFrom && firstFrom !== '00:00')
                addHours(byCountry, overnightCtry, segHours('00:00', firstFrom), entry)
        }

        for (const block of blocks) {
            const isStayBlock = block.segs.every(s => s.fromPlace === s.toPlace)
            const froms = block.segs.map(s => s.fromTime || (isStayBlock ? '00:00' : '')).filter(Boolean)
            const tos   = block.segs.map(s => s.toTime   || (isStayBlock ? '00:00' : '')).filter(Boolean)
            if (!froms.length || !tos.length) continue
            const blockFrom = froms.reduce((a, b) => a < b ? a : b)
            const blockTo   = tos.reduce((a, b) => a > b ? a : b)
            addHours(byCountry, block.country, segHours(blockFrom, blockTo), entry)
        }

        if (hasOvernightTo) {
            const lastSeg = daySegs[daySegs.length - 1]
            const lastTo  = lastSeg?.toTime ?? ''
            const nextDaySegs = segments.filter(s => s.date === dates[di + 1])
            const destCtry = nextDaySegs[0]?.country ?? lastSeg?.country ?? 'SK'
            if (lastTo && lastTo !== '00:00') {
                addHours(byCountry, destCtry, segHours(lastTo, '00:00'), entry)
            } else if (lastTo === '00:00' && destCtry !== 'SK') {
                // Arrived overnight into foreign country. No explicit arrival time on the
                // final border segment. Attribute only from ITS departure (not the whole
                // day) to midnight - earlier segments were already counted for their own
                // countries in the blocks loop above; using the day's first departure here
                // would double-count those hours under destCtry.
                const lastFrom = lastSeg?.fromTime
                if (lastFrom && lastFrom !== '00:00') addHours(byCountry, destCtry, segHours(lastFrom, '00:00'), entry)
            }
        }

        for (const [country, data] of Object.entries(byCountry)) {
            const hh = Math.floor(data.hours)
            const mm = Math.round((data.hours % 1) * 60)
            const stravne = calcSegStravne(
                '00:00',
                `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
                country, entry,
            )
            if (!stravne) continue
            result.push({ date, country, currency: data.currency, hours: +data.hours.toFixed(1), stravne })
        }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date))
}

export const calcTripHours = (depDate: string, depTime: string, retDate: string, retTime: string): number => {
    try {
        const dep = new Date(`${depDate}T${depTime}:00`)
        const ret = new Date(`${retDate}T${retTime}:00`)
        return Math.max(0, (ret.getTime() - dep.getTime()) / 3_600_000)
    } catch { return 0 }
}

export const calcFuelCost = (km: number, consumption: number, pricePerLiter: number): number =>
    (km / 100) * consumption * pricePerLiter

export const calcAmortization = (km: number, transportType: string | null | undefined, amortizationRate?: number): number =>
    transportType === 'car' ? km * (amortizationRate ?? AMORTIZATION_RATE) : 0

export const computeOrderFinancials = (order: TravelOrder, ratesHistory: StravneRates) => {
    const carKm = (order.trips ?? []).flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
    const rowCarKm = carKm > 0 ? carKm : (order.distanceKm ?? 0)
    const fuelCost = rowCarKm && order.fuelConsumption && order.fuelPricePerLiter
        ? calcFuelCost(rowCarKm, order.fuelConsumption, order.fuelPricePerLiter) : 0
    const amort = rowCarKm
        ? calcAmortization(rowCarKm, 'car', getRatesForDate(ratesHistory, order.departureDate).amortizationRate) : 0

    const stravneMap: Record<string, number> = {}
    for (const t of order.trips ?? [])
        for (const ds of calcDailyStravne(t.segments, ratesHistory))
            stravneMap[ds.currency] = (stravneMap[ds.currency] ?? 0) + ds.stravne

    const hasSegs = Object.keys(stravneMap).length > 0
    const totalsMap: Record<string, number> = { ...stravneMap }
    totalsMap['EUR'] = (totalsMap['EUR'] ?? 0) + fuelCost + amort
    const mainCur = order.currency || 'EUR'
    totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (order.actualExpenses ?? 0)
    if (!hasSegs) totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (order.stravneAmount ?? 0)
    for (const t of order.trips ?? [])
        for (const seg of t.segments)
            for (const exp of seg.expenses ?? []) {
                const c = exp.currency || 'EUR'
                totalsMap[c] = (totalsMap[c] ?? 0) + (exp.amount ?? 0)
            }

    return { rowCarKm, fuelCost, amort, stravneMap, totalsMap, hasSegs }
}
