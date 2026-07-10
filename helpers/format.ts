import type { TripSegment, Trip, TravelOrderInput } from '../types'
import { TRANSPORT_OPTIONS } from '../constants'

export const fmtDate = (iso: string | null | undefined): string => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return iso }
}

export const fmtAmt = (amt: number | null | undefined, cur: string): string =>
    amt != null ? `${Number(amt).toFixed(2)} ${cur}` : '—'

export const transportShort = (t: string | null | undefined): string =>
    TRANSPORT_OPTIONS.find(o => o.value === t)?.short ?? t ?? '—'

export const transportLabel = (t: string | null | undefined): string =>
    TRANSPORT_OPTIONS.find(o => o.value === t)?.label ?? t ?? '—'

export const countryFlag = (code: string | null | undefined): string => {
    if (!code) return ''
    const cc = code.toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) return ''
    const codePoints = [...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    return String.fromCodePoint(...codePoints)
}

export const addMinutesToTime = (time: string, minutes: number): string => {
    const [h, m] = time.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return time
    let total = (h * 60 + m + Math.round(minutes)) % 1440
    if (total < 0) total += 1440
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    return `${hh}:${mm}`
}

export const emptySegment = (date: string, transport: string, country = 'SK'): TripSegment => ({
    date,
    fromPlace: '',
    fromTime: '',
    toPlace: '',
    toTime: '',
    transport,
    km: null,
    stravne: null,
    country,
    nbsDate: null,
})

export const emptyTrip = (date: string, _transport: string): Trip => ({
    destination: '',
    country: 'SK',
    purpose: '',
    departureLocation: '',
    departureDate: date,
    departureTime: '',
    returnLocation: '',
    returnDate: date,
    returnTime: '',
    segments: [],
})

export const emptyForm = (): TravelOrderInput => ({
    employee:          '',
    employeeAddress:   '',
    collaborators:     '',
    destination:       '',
    purpose:           '',
    departureLocation: '',
    departureDate:     new Date().toISOString().split('T')[0],
    departureTime:     '',
    returnLocation:      '',
    returnDate:          '',
    returnTime:          '',
    arrivalTime:         '',
    returnDepartureTime: '',
    transportType:       'car',
    distanceKm:        undefined,
    fuelConsumption:   3.8,
    fuelPricePerLiter: undefined,
    advanceAmount:     undefined,
    stravneAmount:     undefined,
    actualExpenses:    undefined,
    currency:          'EUR',
    status:            'draft',
    notes:             '',
    freeRanajky:       false,
    freeObed:          false,
    freeVecera:        false,
    includeAccounting:  false,
    includeAdminFields: false,
    applyAmortization:  null,
    applyFuelCost:      null,
    advances:           null,
    useExchangeRates:   null,
    exchangeRateDate:  null,
    exchangeRates:     null,
    trips:             [emptyTrip(new Date().toISOString().split('T')[0], 'car')],
})
