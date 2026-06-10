import type { TripSegment, StravneRates, StravneRatesEntry } from '../types'
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

export const calcSegStravne = (fromTime: string, toTime: string, country: string, entry: StravneRatesEntry): number | null => {
    const h = segHours(fromTime, toTime)
    if (country === 'SK') {
        if (h < 5)   return null
        if (h <= 12) return entry.sk_5
        if (h <= 18) return entry.sk_12
        return entry.sk_18
    } else {
        const fr = entry.foreign[country]
        if (!fr || !fr.rate_12) return null
        if (h < 6)   return +(fr.rate_12 * 0.25).toFixed(2)
        if (h <= 12) return +(fr.rate_12 * 0.50).toFixed(2)
        return fr.rate_12
    }
}

type DayStravneEntry = { date: string; country: string; currency: string; hours: number; stravne: number }

export const calcDailyStravne = (segments: TripSegment[], ratesHistory: StravneRates): DayStravneEntry[] => {
    const dates = [...new Set(segments.map(s => s.date))].sort()
    const result: DayStravneEntry[] = []

    const addHours = (
        byCountry: Record<string, { hours: number; currency: string }>,
        country: string, hours: number, entry: StravneRatesEntry,
    ) => {
        if (hours <= 0) return
        const countryOpt = COUNTRY_OPTIONS.find(c => c.code === country)
        const currency = countryOpt?.currency ?? entry.foreign[country]?.currency ?? 'EUR'
        if (!byCountry[country]) byCountry[country] = { hours: 0, currency }
        byCountry[country].hours += hours
    }

    for (let di = 0; di < dates.length; di++) {
        const date = dates[di]
        const daySegs = segments.filter(s => s.date === date)
        const entry = getRatesForDate(ratesHistory, date)

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
            if (lastTo && lastTo !== '00:00') {
                const nextDaySegs = segments.filter(s => s.date === dates[di + 1])
                const destCtry = nextDaySegs[0]?.country ?? lastSeg?.country ?? 'SK'
                addHours(byCountry, destCtry, segHours(lastTo, '00:00'), entry)
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

export const calcStravne = (hours: number): number => {
    if (hours < 5)  return 0
    if (hours <= 12) return 9.30
    if (hours <= 18) return 13.80
    return 20.90
}

export const calcFuelCost = (km: number, consumption: number, pricePerLiter: number): number =>
    (km / 100) * consumption * pricePerLiter

export const calcAmortization = (km: number, transportType: string | null | undefined, amortizationRate?: number): number =>
    transportType === 'car' ? km * (amortizationRate ?? AMORTIZATION_RATE) : 0
