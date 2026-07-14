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

export type ChainPoint = { date: string; time: string }

const toAbsoluteMinutes = (date: string, time: string): number => {
    const [h, m] = time.split(':').map(Number)
    const dayStartMs = new Date(`${date}T00:00:00Z`).getTime()
    return Math.round(dayStartMs / 60_000) + h * 60 + m
}

const fromAbsoluteMinutes = (totalMin: number): ChainPoint => {
    // Vstup môže byť zlomkový (napr. proporčne škálované trvanie úseku pri
    // zastávkach s ručným časom príchodu) - zaokrúhliť na celé minúty skôr,
    // než sa z toho vyrobí HH:MM, inak vyjde napr. "12:52.94...".
    const rounded = Math.round(totalMin)
    const dayIndex = Math.floor(rounded / 1440)
    const timeMin = rounded - dayIndex * 1440
    const date = new Date(dayIndex * 1440 * 60_000).toISOString().slice(0, 10)
    const hh = String(Math.floor(timeMin / 60)).padStart(2, '0')
    const mm = String(timeMin % 60).padStart(2, '0')
    return { date, time: `${hh}:${mm}` }
}

// Zreťaz dátum+čas jednotlivých úsekov trasy z ich trvania (napr. z OSM/OSRM),
// počnúc známym dátumom a časom odchodu. Vráti pole dĺžky durations.length + 1 -
// dátum+čas vo všetkých medziľahlých bodoch trasy vrátane štartu a cieľa.
// Na rozdiel od jednoduchého sčítania minút v rámci dňa tu čas prirodzene
// "pretečie" do ďalšieho kalendárneho dňa pri dlhších trasách (napr. SK -> južné
// Španielsko môže trvať cez 24 hodín) - bez toho by neskoré úseky trasy dostali
// naspäť skorší čas v ten istý deň a vyzerali by, že sa prekrývajú s inými.
export const chainForward = (startDate: string, startTime: string, durations: number[]): ChainPoint[] => {
    let clock = toAbsoluteMinutes(startDate, startTime)
    const points = [fromAbsoluteMinutes(clock)]
    for (const d of durations) { clock += d; points.push(fromAbsoluteMinutes(clock)) }
    return points
}

// To isté, ale odzadu - od známeho dátumu a času príchodu/návratu.
export const chainBackward = (endDate: string, endTime: string, durations: number[]): ChainPoint[] => {
    let clock = toAbsoluteMinutes(endDate, endTime)
    const points = [fromAbsoluteMinutes(clock)]
    for (let i = durations.length - 1; i >= 0; i--) { clock -= durations[i]; points.unshift(fromAbsoluteMinutes(clock)) }
    return points
}

// Počet minút medzi dvomi ľubovoľnými bodmi dátum+čas (môžu byť aj rôzne dni) -
// napr. na zistenie skutočnej dĺžky úseku medzi dvoma ručne zadanými zastávkami.
export const minutesBetween = (dateA: string, timeA: string, dateB: string, timeB: string): number =>
    toAbsoluteMinutes(dateB, timeB) - toAbsoluteMinutes(dateA, timeA)

// Počet minút medzi časom odchodu a návratu, len ak ide o ten istý deň (inak sa
// časy tam/späť nemôžu prekrývať a škálovanie nemá zmysel).
export const sameDayWindowMinutes = (depDate: string, depTime: string, retDate: string, retTime: string): number | null => {
    if (!depTime || !retTime || depDate !== retDate) return null
    const [dh, dm] = depTime.split(':').map(Number)
    const [rh, rm] = retTime.split(':').map(Number)
    const w = (rh * 60 + rm) - (dh * 60 + dm)
    return w > 0 ? w : null
}

// Ak reálne trvanie cesty tam + späť presahuje zadané okno odchod-návrat, úmerne
// zmenší všetky trvania (na úkor času na mieste), aby sa cesta tam a späť
// zmestila bez časového prekryvu.
export const scaleDurationsToFit = (durations: number[], windowMin: number | null): { durations: number[]; scaled: boolean } => {
    const total = durations.reduce((s, d) => s + d, 0)
    if (windowMin == null || total <= 0 || total * 2 <= windowMin) return { durations, scaled: false }
    const scale = windowMin / (total * 2)
    return { durations: durations.map(d => d * scale), scaled: true }
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

export const emptyTrip = (date: string, transport: string): Trip => ({
    destination: '',
    country: 'SK',
    purpose: '',
    defaultTransport: transport,
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
