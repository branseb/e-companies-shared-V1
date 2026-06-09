import { jsPDF } from 'jspdf'
import { robotoBase64 } from './robotoFont'
import { roboto700Base64 } from './robotoBoldFont'
import { calcDailyStravne, DEFAULT_STRAVNE_RATES, getRatesForDate } from './TravelOrdersWidget'
import type { StravneRates, TripSegment } from './TravelOrdersWidget'

const DEFAULT_AMORTIZATION_RATE = 0.313

const TRANSPORT_OPTIONS = [
    { value: 'car',         label: 'Vlastné auto (AUV)', short: 'AUV' },
    { value: 'company_car', label: 'Firemné auto (AUS)',  short: 'AUS' },
    { value: 'train',       label: 'Vlak',                short: 'R/O' },
    { value: 'bus',         label: 'Autobus',             short: 'A'   },
    { value: 'plane',       label: 'Lietadlo',            short: 'L'   },
]

// ── Typy ──────────────────────────────────────────────────────────────────────

export type TripPdf = {
    destination: string
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    segments: TripSegment[]
}

export interface TravelOrderPdfInput {
    companyName: string
    companyAddress: string
    employee: string
    employeeAddress?: string | null
    collaborators?: string | null
    destination: string
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    returnTime?: string | null
    arrivalTime?: string | null
    returnDepartureTime?: string | null
    transportType?: string | null
    distanceKm?: number | null
    fuelConsumption?: number | null
    fuelPricePerLiter?: number | null
    advanceAmount?: number | null
    advances?: Array<{ amount: number; currency: string }> | null
    stravneAmount?: number | null
    actualExpenses?: number | null
    currency: string
    freeRanajky?: boolean | null
    freeObed?: boolean | null
    freeVecera?: boolean | null
    useExchangeRates?: boolean | null
    exchangeRateDate?: string | null
    exchangeRates?: Record<string, number> | null
    trips?: TripPdf[] | null
    ratesHistory?: StravneRates | null
    includeAccounting?: boolean
    includeAdminFields?: boolean
    applyAmortization?: boolean | null
    applyFuelCost?: boolean | null
}

// ── Pomocné funkcie ───────────────────────────────────────────────────────────

const calcTripHours = (depDate: string, depTime: string, retDate: string, retTime: string): number => {
    try {
        const dep = new Date(`${depDate}T${depTime}:00`)
        const ret = new Date(`${retDate}T${retTime}:00`)
        return Math.max(0, (ret.getTime() - dep.getTime()) / 3_600_000)
    } catch { return 0 }
}

const calcStravneFallback = (hours: number): number => {
    if (hours < 5)   return 0
    if (hours <= 12) return 9.30
    if (hours <= 18) return 13.80
    return 20.90
}

const calcFuelCost = (km: number, consumption: number, pricePerLiter: number): number =>
    (km / 100) * consumption * pricePerLiter

const calcAmortization = (km: number, transportType: string | null | undefined, amortizationRate?: number): number =>
    transportType === 'car' ? km * (amortizationRate ?? DEFAULT_AMORTIZATION_RATE) : 0

const fmtD = (iso: string | null | undefined) => {
    if (!iso) return ''
    try {
        return new Date(iso)
            .toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' })
            .replace(/ /g, '')
    } catch { return iso }
}

const fmtSk  = (n: number, dec = 2) => n.toFixed(dec).replace('.', ',')
const fmtEur = (n: number) => fmtSk(n) + ' €'
const fmtN   = (n: number | null | undefined, dec = 2) => n != null ? fmtSk(n, dec) : ''

const transportShort = (t: string | null | undefined) =>
    TRANSPORT_OPTIONS.find(o => o.value === t)?.short ?? t ?? ''

// ── Kreslenie ─────────────────────────────────────────────────────────────────

const setupFonts = (doc: jsPDF) => {
    doc.addFileToVFS('Roboto-Regular.ttf', robotoBase64)
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
    doc.addFileToVFS('Roboto-Bold.ttf', roboto700Base64)
    doc.addFont('Roboto-Bold.ttf', 'Roboto', '700')
    doc.setFont('Roboto', 'normal')
}

const normal  = (doc: jsPDF, size = 8)  => { doc.setFont('Roboto', 'normal'); doc.setFontSize(size) }
const bold    = (doc: jsPDF, size = 8)  => { doc.setFont('Roboto', '700');    doc.setFontSize(size) }
const hLine   = (doc: jsPDF, y: number, x1 = 10, x2 = 200) => { doc.setLineWidth(0.2); doc.line(x1, y, x2, y) }
const vLine   = (doc: jsPDF, x: number, y1: number, y2: number) => { doc.setLineWidth(0.2); doc.line(x, y1, x, y2) }
const rect    = (doc: jsPDF, x: number, y: number, w: number, h: number) => { doc.setLineWidth(0.2); doc.rect(x, y, w, h) }
const label   = (doc: jsPDF, text: string, x: number, y: number) => { normal(doc, 6.5); doc.text(text, x, y) }
const value   = (doc: jsPDF, text: string, x: number, y: number) => { normal(doc, 8);   doc.text(text, x, y) }
const boldVal = (doc: jsPDF, text: string, x: number, y: number) => { bold(doc, 8);     doc.text(text, x, y) }

// ── Strana 1 ─────────────────────────────────────────────────────────────────

const drawPage1 = (doc: jsPDF, d: TravelOrderPdfInput) => {
    const L = 10, R = 200, W = R - L
    const adm = d.includeAdminFields !== false
    let y = 12

    y += 4
    bold(doc, 11)
    doc.text('CESTOVNÝ PRÍKAZ', (L + R) / 2, y, { align: 'center' })

    y += 4
    hLine(doc, y)

    y += 3
    const sectionH = adm ? 13 : 10
    const companyFull = [d.companyName, d.companyAddress].filter(Boolean).join(', ')
    label(doc, 'Zamestnávateľ :', L + 2, y)
    boldVal(doc, companyFull, L + 2, y + 5)

    if (adm) {
        label(doc, 'Osobné číslo', 145, y)
        hLine(doc, y + 4, 145, R - 2)
        label(doc, 'Útvar', 145, y + 7)
        hLine(doc, y + 11, 145, R - 2)
    }

    y += sectionH
    hLine(doc, y)

    y += 2
    const midX = adm ? L + 62 : L + 95
    label(doc, 'Priezvisko, meno, titul', L + 2, y + 1)
    boldVal(doc, d.employee, L + 2, y + 5.5)
    vLine(doc, midX, y, y + 9)
    label(doc, 'Bydlisko', midX + 2, y + 1)
    boldVal(doc, d.employeeAddress ?? '', midX + 2, y + 5.5)
    if (adm) {
        vLine(doc, 135, y, y + 9)
        label(doc, 'Telefón, klapka', 137, y + 1)
    }
    y += 9
    hLine(doc, y)

    const colW = W / 4
    const c1 = L, c2 = L + colW, c3 = L + colW * 2, c4 = L + colW * 3

    y += 1
    const headerY = y
    bold(doc, 7)
    doc.text('Začiatok cesty', c1 + 2, headerY + 3)
    label(doc, '(miesto, dátum, hod.)', c1 + 2, headerY + 6)
    vLine(doc, c2, headerY, headerY + 8)
    bold(doc, 7)
    doc.text('Miesto rokovania', c2 + 2, headerY + 4)
    vLine(doc, c3, headerY, headerY + 8)
    bold(doc, 7)
    doc.text('Účel cesty', c3 + 2, headerY + 4)
    vLine(doc, c4, headerY, headerY + 8)
    bold(doc, 7)
    doc.text('Koniec cesty', c4 + 2, headerY + 3)
    label(doc, '(miesto, dátum)', c4 + 2, headerY + 6)
    y += 8
    hLine(doc, y)

    if (d.trips && d.trips.length > 0) {
        for (const trip of d.trips) {
            const depStr = [trip.departureLocation, fmtD(trip.departureDate), trip.departureTime].filter(Boolean).join(' ')
            const retStr = [trip.returnLocation || trip.departureLocation, fmtD(trip.returnDate)].filter(Boolean).join(' ')
            const dataY = y + 1
            boldVal(doc, depStr, c1 + 2, dataY + 4)
            vLine(doc, c2, y, y + 8)
            boldVal(doc, trip.destination, c2 + 2, dataY + 4)
            vLine(doc, c3, y, y + 8)
            boldVal(doc, trip.purpose ?? '', c3 + 2, dataY + 4)
            vLine(doc, c4, y, y + 8)
            boldVal(doc, retStr, c4 + 2, dataY + 4)
            y += 8
            hLine(doc, y)
        }
    } else {
        const depStr = [d.departureLocation, fmtD(d.departureDate), d.departureTime].filter(Boolean).join(' ')
        const retStr = [d.returnLocation || d.departureLocation, fmtD(d.returnDate)].filter(Boolean).join(' ')
        const dataY = y + 1
        boldVal(doc, depStr, c1 + 2, dataY + 4)
        vLine(doc, c2, y, y + 8)
        boldVal(doc, d.destination, c2 + 2, dataY + 4)
        vLine(doc, c3, y, y + 8)
        boldVal(doc, d.purpose ?? '', c3 + 2, dataY + 4)
        vLine(doc, c4, y, y + 8)
        boldVal(doc, retStr, c4 + 2, dataY + 4)
        y += 8
        hLine(doc, y)
    }

    if (adm) {
        y += 1
        label(doc, 'Spolucestujúci', L + 2, y + 1)
        value(doc, d.collaborators ?? '', L + 2, y + 6)
        y += 9
        hLine(doc, y)
    }

    y += 1
    normal(doc, 5.5); doc.text('Určený dopravný prostriedok (pri vlastnom vozidle druh, priemerná spotreba PH podľa tech. preukazu)', L + 2, y + 1.5)
    value(doc, transportShort(d.transportType), L + 2, y + 6)
    vLine(doc, 165, y - 1, y + 9)
    if (d.fuelConsumption) {
        label(doc, 'spotr.', 167, y + 1)
        bold(doc, 8); doc.text(`${String(d.fuelConsumption).replace('.', ',')} l/100km`, 167, y + 6)
    }
    y += 9
    hLine(doc, y)

    if (d.includeAccounting !== false) {
        y += 1
        label(doc, 'Predpokladaná čiastka výdavkov EUR', L + 2, y + 1)
        y += 9
        hLine(doc, y)

        y += 1
        label(doc, 'Povolený preddavok EUR', L + 2, y + 1)
        if (d.advanceAmount) boldVal(doc, fmtN(d.advanceAmount), L + 2, y + 6)
        vLine(doc, 100, y - 1, y + 9)
        label(doc, 'vyplatený dňa', 102, y + 1); hLine(doc, y + 7, 115, 155)
        vLine(doc, 155, y - 1, y + 9)
        label(doc, 'pokl.doklad číslo', 157, y + 1); hLine(doc, y + 7, 175, R)
        y += 9
        hLine(doc, y)

        y += 1
        vLine(doc, 100, y, y + 12)
        label(doc, 'Podpis pokladníka', L + 2, y + 2)
        hLine(doc, y + 10, L + 2, 98)
        label(doc, 'Dátum a podpis štatutárneho zástupcu', 102, y + 2)
        hLine(doc, y + 10, 102, R - 2)
        y += 12
        hLine(doc, y)

        y += 3
        bold(doc, 9)
        doc.text('Vyúčtovanie pracovnej cesty', L + 2, y)
        y += 6
        hLine(doc, y)

        y += 1
        label(doc, 'Správa o výsledku pracovnej cesty bola podaná dňa', L + 2, y + 1)
        hLine(doc, y + 5, L + 80, 170)
        label(doc, 'So spôsobom vykonania súhlasí', L + 2, y + 8)
        hLine(doc, y + 12, L + 55, 170)
        vLine(doc, 170, y, y + 14)
        label(doc, 'Dátum a podpis', 172, y + 3)
        label(doc, 'štatutárneho zástupcu', 172, y + 6.5)
        hLine(doc, y + 13, 172, R - 2)
        y += 14
        hLine(doc, y)

        y += 1
        label(doc, 'Výdavkový - príjmový pokladničný doklad', L + 2, y + 1)
        vLine(doc, 100, y, y + 8)
        bold(doc, 7.5); doc.text('Účtovací predpis', 130, y + 3)
        y += 8
        hLine(doc, y)

        const accCols = [L, 55, 78, 98, 122, 152, R]
        const accLabels = ['č.', 'Má dať', 'Dal', 'Čiastka', 'Stredisko', 'Zákazka']
        accLabels.forEach((lbl, i) => {
            vLine(doc, accCols[i], y, y + 5)
            label(doc, lbl, accCols[i] + 1, y + 3.5)
        })
        vLine(doc, R, y, y + 5)
        y += 5
        hLine(doc, y)
        accCols.forEach(x => vLine(doc, x, y, y + 7))
        vLine(doc, R, y, y + 7)
        y += 7
        hLine(doc, y)

        const sumRows = [
            { lbl: 'Účtovaná náhrada bola preskúmaná a upravená na', val: '', unit: 'EUR' },
            { lbl: 'Vyplatený preddavok',  val: fmtN(d.advanceAmount), unit: 'EUR' },
            { lbl: 'Doplatok- Preplatok',  val: '', unit: 'EUR' },
            { lbl: 'Slovom', val: '', unit: '' },
        ]
        sumRows.forEach((row, idx) => {
            y += 1
            label(doc, row.lbl, L + 2, y + 1)
            if (row.val) boldVal(doc, row.val, 95, y + 1)
            if (row.unit) label(doc, row.unit, 105, y + 1)
            if (idx === 3) label(doc, 'Poznámka o zaúčtovaní', 130, y + 1)
            y += 6
            hLine(doc, y)
        })

        const sigY = y + 2
        const sigCols = [L, 60, 118, 162, R]
        const sigLabels = ['Dátum a podpis zamestnanca,\nktorý upravil vyúčtovanie', 'Dátum a podpis príjemcu\n(preukaz totožnosti)', 'Dátum a podpis\npokladníka', 'Schválil (dátum a podpis)']
        sigLabels.forEach((lbl, i) => {
            vLine(doc, sigCols[i], y, 289)
            const lines = lbl.split('\n')
            lines.forEach((l, li) => label(doc, l, sigCols[i] + 1, sigY + li * 3.5))
            hLine(doc, sigY + 11, sigCols[i] + 1, sigCols[i + 1] - 1)
        })
        vLine(doc, R, y, 289)
        hLine(doc, 289, L, R)
        rect(doc, L, 8, W, 281)
    } else {
        rect(doc, L, 8, W, y - 8)
    }
    return y
}

// ── Financials ────────────────────────────────────────────────────────────────

interface Financials {
    tripHours: number | null
    stravne: number
    stravneByCurrency: Record<string, number>
    fuelCost: number
    amortization: number
    amortizationRate: number
    totalExpenses: number
    balance: number
    balanceByCurrency: Record<string, number>
    advanceByCurrency: Record<string, number>
    km: number
    kmOut: number
    kmRet: number
}

const computeFinancials = (d: TravelOrderPdfInput): Financials => {
    const tripHours =
        d.departureDate && d.departureTime && d.returnDate && d.returnTime
            ? calcTripHours(d.departureDate, d.departureTime, d.returnDate, d.returnTime)
            : null

    const rates = d.ratesHistory ?? DEFAULT_STRAVNE_RATES
    const stravneByCurrency: Record<string, number> = {}

    if (d.trips?.length) {
        for (const trip of d.trips) {
            for (const ds of calcDailyStravne((trip.segments ?? []) as TripSegment[], rates)) {
                const cur = ds.currency || 'EUR'
                const rate = cur !== 'EUR' ? d.exchangeRates?.[cur] : undefined
                if (rate && rate > 0) {
                    stravneByCurrency['EUR'] = (stravneByCurrency['EUR'] ?? 0) + +(ds.stravne / rate).toFixed(2)
                } else {
                    stravneByCurrency[cur] = (stravneByCurrency[cur] ?? 0) + ds.stravne
                }
            }
        }
    }

    // Ak segmenty neobsahujú časy (alebo trips je prázdne), fallback na manuálnu sumu / jednoduchý výpočet
    if (Object.keys(stravneByCurrency).length === 0) {
        const fallback = d.stravneAmount ?? (tripHours !== null ? calcStravneFallback(tripHours) : 0)
        if (fallback > 0) stravneByCurrency['EUR'] = fallback
    }

    const stravne = stravneByCurrency['EUR'] ?? 0

    const carKmFromSegs = d.trips?.length
        ? d.trips.flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
        : 0
    const km = carKmFromSegs > 0 ? carKmFromSegs : (d.distanceKm ?? 0)

    const amortizationRate = getRatesForDate(rates, d.departureDate).amortizationRate ?? DEFAULT_AMORTIZATION_RATE
    const fuelCost     = (d.applyFuelCost !== false) && km && d.fuelConsumption && d.fuelPricePerLiter
        ? calcFuelCost(km, d.fuelConsumption, d.fuelPricePerLiter) : 0
    const amortization = (d.applyAmortization !== false) ? calcAmortization(km, 'car', amortizationRate) : 0
    const totalExpenses = stravne + fuelCost + amortization + (d.actualExpenses ?? 0)

    const advanceByCurrency: Record<string, number> = {}
    if (d.advances?.length) {
        for (const adv of d.advances) {
            const c = adv.currency || 'EUR'
            advanceByCurrency[c] = (advanceByCurrency[c] ?? 0) + adv.amount
        }
    } else {
        advanceByCurrency['EUR'] = d.advanceAmount ?? 0
    }

    const totalByCur: Record<string, number> = { EUR: totalExpenses }
    for (const [c, amt] of Object.entries(stravneByCurrency)) {
        if (c !== 'EUR') totalByCur[c] = (totalByCur[c] ?? 0) + amt
    }

    const balanceByCurrency: Record<string, number> = {}
    const allCurs = new Set([...Object.keys(totalByCur), ...Object.keys(advanceByCurrency)])
    for (const c of allCurs) {
        balanceByCurrency[c] = +((totalByCur[c] ?? 0) - (advanceByCurrency[c] ?? 0)).toFixed(2)
    }
    const balance = balanceByCurrency['EUR'] ?? totalExpenses - (d.advanceAmount ?? 0)

    const kmOut = Math.round(km / 2)
    const kmRet = km - kmOut

    return { tripHours, stravne, stravneByCurrency, fuelCost, amortization, amortizationRate, totalExpenses, balance, balanceByCurrency, advanceByCurrency, km, kmOut, kmRet }
}

// ── Strana 2 ─────────────────────────────────────────────────────────────────

const drawPage2 = (doc: jsPDF, d: TravelOrderPdfInput, f: Financials, startY?: number) => {
    const L = 10, R = 200, W = R - L
    const page2Top = startY ?? 8
    let y = startY !== undefined ? startY + 2 : 10

    bold(doc, 11)
    doc.text('Vyúčtovanie pracovnej cesty', (L + R) / 2, y + 5, { align: 'center' })
    y += 10
    hLine(doc, y)

    const cols = {
        datum:    L,
        odchod:   L + 14,
        hodTime:  L + 52,
        doprava:  L + 62,
        km:       L + 70,
        hod:      L + 78,
        pracHod:  L + 90,
        cestovne: L + 99,
        stravne:  L + 110,
        noclazne: L + 126,
        nutne:    L + 139,
        ine:      L + 151,
        spolu:    L + 162,
        uprav:    R,
    }

    const drawColLines = (yFrom: number, yTo: number) => {
        Object.values(cols).forEach(x => vLine(doc, x, yFrom, yTo))
    }

    const drawSumColLines = (yFrom: number, yTo: number) => {
        [L, cols.cestovne, cols.stravne, cols.noclazne, cols.nutne, cols.ine, cols.spolu, R]
            .forEach(x => vLine(doc, x, yFrom, yTo))
    }

    const h1 = y + 3
    normal(doc, 5.5)
    const hdrs1 = [
        [cols.datum,    'Dátum'],
        [cols.odchod,   'ODCHOD-PRÍCHOD'],
        [cols.doprava,  'Použ.\ndopr.\nprostr.'],
        [cols.km,       'Vzdiale\nnosť'],
        [cols.hod,      'Počet\nhodín'],
        [cols.pracHod,  'Plnenie\npracov.\nprekáž.'],
        [cols.cestovne, 'Cestovné'],
        [cols.stravne,  'Stravné'],
        [cols.noclazne, 'Nocľažné'],
        [cols.nutne,    'Nutné\nnáhrady'],
        [cols.ine,      'Iné\nnáhrady'],
        [cols.spolu,    'Spolu'],
    ] as [number, string][]

    hdrs1.forEach(([x, text]) => {
        text.split('\n').forEach((line, i) => doc.text(line, x + 1, h1 + i * 3.2))
    })

    y += 18
    hLine(doc, y)
    hLine(doc, y - 5, cols.odchod, R)

    normal(doc, 4.5)
    ;[cols.cestovne, cols.stravne, cols.noclazne, cols.nutne, cols.ine, cols.spolu].forEach(x => {
        doc.text('EUR', x + 1, y - 1)
    })
    doc.text('hod.',  cols.hodTime + 1, y - 1)
    doc.text('skr.',  cols.doprava + 1, y - 1)
    doc.text('km',    cols.km      + 1, y - 1)
    doc.text('hod.',  cols.hod     + 1, y - 1)
    doc.text('od-do', cols.pracHod + 1, y - 1)
    drawColLines(h1 - 2, y)

    type TRow = {
        date: string; dir: string; place: string; time: string;
        trans: string; km: string; stravne?: string; spolu?: string; star?: boolean
    }

    const hasTrips = !!(d.trips && d.trips.length > 0)
    const dataPairs: { od: TRow | null; pr: TRow | null }[] = []
    let hasStars = false

    if (hasTrips) {
        const allSegs = d.trips!.flatMap(t => (t.segments ?? []) as TripSegment[])
        const rates = d.ratesHistory ?? DEFAULT_STRAVNE_RATES

        // Stravné per (dátum, krajina) — počítané per trip (nie combined) aby sa zachovala správna overnight logika
        const stravneMap = new Map<string, { stravne: number; currency: string }>()
        for (const trip of d.trips!) {
            const segs = (trip.segments ?? []) as TripSegment[]
            const daily = calcDailyStravne(segs, rates)
            for (const ds of daily) {
                if (ds.stravne > 0) stravneMap.set(`${ds.date}|${ds.country}`, { stravne: ds.stravne, currency: ds.currency })
            }
        }

        // Posledný index segmentu pre každú (dátum, krajina) kombináciu
        const lastIdx = new Map<string, number>()
        allSegs.forEach((s, i) => lastIdx.set(`${s.date}|${s.country ?? 'SK'}`, i))

        let si = 0
        for (const trip of d.trips!) {
            for (const seg of (trip.segments ?? []) as TripSegment[]) {
                const key = `${seg.date}|${seg.country ?? 'SK'}`
                const isLast = lastIdx.get(key) === si
                const ds = isLast ? stravneMap.get(key) : undefined
                const stravneStr = ds
                    ? (ds.currency === 'EUR' ? fmtSk(ds.stravne) : `${fmtSk(ds.stravne)} ${ds.currency}`)
                    : undefined

                // Pobytový deň: rovnaké miesto, časy 00:00–00:00 → skryť časy (nezobrazovať 00:00)
                const isStay = seg.fromPlace !== '' && seg.fromPlace === seg.toPlace
                    && seg.fromTime === '00:00' && seg.toTime === '00:00'

                dataPairs.push({
                    od: {
                        date: fmtD(seg.date), dir: 'Odchod',
                        place: seg.fromPlace, time: isStay ? '' : seg.fromTime,
                        trans: transportShort(seg.transport),
                        km: seg.km != null ? String(seg.km) : '',
                        stravne: stravneStr,
                        spolu:   stravneStr,
                    },
                    pr: { date: '', dir: 'Príchod', place: seg.toPlace, time: isStay ? '' : seg.toTime, trans: '', km: '' },
                })
                si++
            }
        }
    } else {
        const tripRows: TRow[] = []
        if (d.departureDate) {
            const depDate = fmtD(d.departureDate)
            tripRows.push({
                date: depDate, dir: 'Odchod',
                place: d.departureLocation ?? '', time: d.departureTime ?? '',
                trans: transportShort(d.transportType), km: String(f.kmOut || ''),
            })
            tripRows.push({ date: depDate, dir: 'Príchod', place: d.destination, time: d.arrivalTime ?? '', trans: '', km: '' })
        }
        if (d.returnDate) {
            const retDate = fmtD(d.returnDate)
            tripRows.push({
                date: retDate, dir: 'Odchod',
                place: d.destination, time: d.returnDepartureTime ?? '',
                trans: transportShort(d.transportType), km: String(f.kmRet || ''),
                stravne: f.stravne > 0 ? fmtSk(f.stravne) : '',
                spolu:   f.stravne > 0 ? fmtSk(f.stravne) : '',
            })
            tripRows.push({ date: retDate, dir: 'Príchod', place: d.returnLocation || d.departureLocation || '', time: d.returnTime ?? '', trans: '', km: '' })
        }
        for (let i = 0; i < tripRows.length; i += 2) {
            dataPairs.push({ od: tripRows[i] ?? null, pr: tripRows[i + 1] ?? null })
        }
    }

    const rowH = 5
    const tOff = rowH * 0.7

    for (const { od, pr } of dataPairs) {
        const pairH = rowH * 2
        drawColLines(y, y + pairH)

        if (od?.date) { bold(doc, 5.5); doc.text(od.date, cols.datum + 1, y + pairH / 2 + 1) }

        bold(doc, 6); doc.text(od?.dir ?? 'Odchod', cols.odchod + 1, y + tOff)
        if (od?.place) { normal(doc, 6.5); doc.text(od.place, cols.odchod + 11, y + tOff, { maxWidth: 25 }) }
        if (od?.time)  { normal(doc, 6.5); doc.text(od.time,  cols.doprava - 1, y + tOff, { align: 'right' }) }

        hLine(doc, y + rowH, cols.odchod, cols.doprava)

        bold(doc, 6); doc.text(pr?.dir ?? 'Príchod', cols.odchod + 1, y + rowH + tOff)
        if (pr?.place) { normal(doc, 6.5); doc.text(pr.place, cols.odchod + 11, y + rowH + tOff, { maxWidth: 25 }) }
        if (pr?.time)  { normal(doc, 6.5); doc.text(pr.time,  cols.doprava - 1, y + rowH + tOff, { align: 'right' }) }

        const vY = y + pairH / 2 + 1
        if (od?.trans)   { bold(doc, 6);   doc.text(od.trans,    cols.doprava + 1, vY) }
        if (od?.km)      { normal(doc, 6); doc.text(od.km,       cols.hod - 1,     vY, { align: 'right' }) }
        if (od?.stravne) { normal(doc, 6); doc.text(od.stravne,  cols.noclazne - 1, vY, { align: 'right' }) }
        if (od?.spolu)   { normal(doc, 6); doc.text(od.spolu,    R - 1,            vY, { align: 'right' }) }
        else             { normal(doc, 6); doc.text('-',          R - 1,            vY, { align: 'right' }) }

        y += pairH
        hLine(doc, y)
    }

    if (hasStars) {
        const dateStr = d.exchangeRateDate ? ` zo dňa ${fmtD(d.exchangeRateDate)}` : ''
        normal(doc, 5); doc.text(`* stravné prepočítané podľa kurzu NBS${dateStr}`, L + 2, y + 2.5)
        y += 4
        hLine(doc, y)
    }

    const curEntries = Object.entries(f.stravneByCurrency).filter(([, v]) => v > 0)

    const allCurEntries = (entries: [string, number][]): [string, number][] => {
        const hasEur = entries.some(([c]) => c === 'EUR')
        return hasEur ? entries : [['EUR', 0], ...entries]
    }

    const drawCurCol = (rightX: number, entries: [string, number][], yBase: number, rowH2: number, useBold = false) => {
        const set = useBold ? bold : normal
        if (entries.length === 0) {
            set(doc, 7); doc.text('0,00 €', rightX, yBase + rowH2 * 0.6, { align: 'right' })
            return
        }
        const multi = entries.length > 1
        const fs = multi ? 6 : 7
        entries.forEach(([cur, val], i) => {
            const txt = cur === 'EUR' ? fmtEur(val) : `${fmtSk(val)} ${cur}`
            set(doc, fs)
            doc.text(txt, rightX, multi ? yBase + 3.5 + i * 4.2 : yBase + rowH2 * 0.6, { align: 'right' })
        })
    }

    const spolAllEntries = allCurEntries(curEntries)
    const nShow = spolAllEntries.length
    const spolRowH = nShow > 1 ? 3.5 + nShow * 4.2 : 8
    const spol1Y = y
    drawSumColLines(y, y + spolRowH)
    normal(doc, 7); doc.text('...', L + 2, y + spolRowH * 0.6)
    bold(doc, 7.5); doc.text('Spolu', cols.hod + 1, y + spolRowH * 0.6)
    ;[cols.stravne - 1, cols.nutne - 1, cols.ine - 1, cols.spolu - 1].forEach(rightX => {
        normal(doc, 7); doc.text('0,00 €', rightX, y + spolRowH * 0.6, { align: 'right' })
    })
    drawCurCol(cols.noclazne - 1, spolAllEntries, y, spolRowH)
    drawCurCol(R - 1,             spolAllEntries, y, spolRowH)
    y += spolRowH
    hLine(doc, y)
    doc.setLineWidth(0.6); doc.rect(L, spol1Y, W, spolRowH); doc.setLineWidth(0.2)

    const amortY = y
    const aY = y + 6
    bold(doc, 8);   doc.text('AMORTIZÁCIA', L + 2, aY)
    normal(doc, 5.5); doc.text('Spolu km', L + 55, y + 2.5, { align: 'center' })
    bold(doc, 8);   doc.text(String(f.km), L + 60, aY, { align: 'right' })
    normal(doc, 7); doc.text('km  ×', L + 62, aY)
    bold(doc, 8);   doc.text(String(f.amortizationRate).replace('.', ','), L + 83, aY)
    normal(doc, 7); doc.text('EUR/km  =', L + 93, aY)
    bold(doc, 8);   doc.text(fmtSk(f.amortization), R - 2, aY, { align: 'right' })
    y += 10
    hLine(doc, y)
    doc.setLineWidth(0.6); doc.rect(L, amortY, W, 10); doc.setLineWidth(0.2)

    const spotrebaY = y
    const sY = y + 6
    bold(doc, 8);   doc.text('SPOTREBA', L + 2, sY)
    normal(doc, 5.5); doc.text('Spolu km', L + 55, y + 2.5, { align: 'center' })
    bold(doc, 8);   doc.text(String(f.km), L + 60, sY, { align: 'right' })
    normal(doc, 7); doc.text('km  ×', L + 62, sY)
    bold(doc, 8);   doc.text(d.fuelConsumption ? String(d.fuelConsumption).replace('.', ',') : '—', L + 78, sY)
    normal(doc, 7); doc.text('l/100km  ×', L + 88, sY)
    bold(doc, 8);   doc.text(d.fuelPricePerLiter ? fmtSk(d.fuelPricePerLiter, 3) : '—', L + 115, sY, { align: 'right' })
    normal(doc, 7); doc.text('EUR/l  =', L + 117, sY)
    bold(doc, 8);   doc.text(f.fuelCost > 0 ? fmtSk(f.fuelCost) : '—', R - 2, sY, { align: 'right' })
    y += 10
    hLine(doc, y)
    doc.setLineWidth(0.6); doc.rect(L, spotrebaY, W, 10); doc.setLineWidth(0.2)

    const finalStravneEntries = allCurEntries(curEntries)
    const finalSpoluEntries: [string, number][] = [
        ['EUR', f.totalExpenses],
        ...curEntries.filter(([cur]) => cur !== 'EUR'),
    ]
    const finalRowH = nShow > 1 ? 3.5 + nShow * 4.2 : 9
    const spol2Y = y
    drawSumColLines(y, y + finalRowH)
    normal(doc, 7); doc.text('...', L + 2, y + finalRowH * 0.65)
    bold(doc, 7.5); doc.text('Spolu', cols.hod + 1, y + finalRowH * 0.65)
    ;[cols.stravne - 1, cols.nutne - 1, cols.ine - 1, cols.spolu - 1].forEach(rightX => {
        bold(doc, 7); doc.text('0,00 €', rightX, y + finalRowH * 0.65, { align: 'right' })
    })
    drawCurCol(cols.noclazne - 1, finalStravneEntries, y, finalRowH, true)
    drawCurCol(R - 1,             finalSpoluEntries,   y, finalRowH, true)
    y += finalRowH
    hLine(doc, y)
    doc.setLineWidth(0.6); doc.rect(L, spol2Y, W, finalRowH); doc.setLineWidth(0.2)

    const advEntries = Object.entries(f.advanceByCurrency).filter(([, v]) => v > 0)
    const bezRowH = advEntries.length > 1 ? 3.5 + advEntries.length * 4.2 : 8
    const bezY = y
    normal(doc, 5.5); doc.text('Bezplatne boli poskytnuté:', L + 2, y + 4)
    let mx = L + 37
    ;[
        { lbl: 'Raňajky', free: d.freeRanajky },
        { lbl: 'Obed',    free: d.freeObed },
        { lbl: 'Večera',  free: d.freeVecera },
    ].forEach(({ lbl, free }) => {
        normal(doc, 6.5)
        const w = doc.getTextWidth(lbl)
        doc.text(lbl, mx, y + 4)
        if (free !== true) hLine(doc, y + 3, mx, mx + w)
        mx += w + 6
    })
    vLine(doc, cols.hod, bezY, bezY + bezRowH)
    label(doc, 'Preddavok', cols.hod + 2, y + 4.5)
    drawCurCol(R - 2, advEntries, y, bezRowH, true)
    y += bezRowH
    hLine(doc, y)

    const balEntries = Object.entries(f.balanceByCurrency).filter(([, v]) => v !== 0)
    const balRowH = balEntries.length > 1 ? 3.5 + balEntries.length * 4.2 : 7
    vLine(doc, cols.hod, y, y + balRowH)
    const balTxtY = y + 4.5
    const isDoplatok = f.balance > 0
    normal(doc, 6.5)
    let btx = cols.hod + 2
    const dTxt = 'Doplatok', sep = '  /  ', pTxt = 'Preplatok'
    const dW = doc.getTextWidth(dTxt), sW = doc.getTextWidth(sep), pW = doc.getTextWidth(pTxt)
    doc.text(dTxt, btx, balTxtY)
    if (!isDoplatok) { doc.setLineWidth(0.3); doc.line(btx, balTxtY - 1, btx + dW, balTxtY - 1); doc.setLineWidth(0.2) }
    btx += dW
    doc.text(sep, btx, balTxtY)
    btx += sW
    doc.text(pTxt, btx, balTxtY)
    if (isDoplatok) { doc.setLineWidth(0.3); doc.line(btx, balTxtY - 1, btx + pW, balTxtY - 1); doc.setLineWidth(0.2) }
    if (balEntries.length > 0) {
        const absEntries: [string, number][] = balEntries.map(([c, v]) => [c, Math.abs(v)])
        drawCurCol(R - 2, absEntries, y, balRowH, true)
    }
    y += balRowH
    hLine(doc, y)

    const sigDate = d.returnDate ?? d.departureDate
    const sigSecH = 30
    const sigDivX = L + 120
    vLine(doc, sigDivX, y, y + sigSecH)

    normal(doc, 5)
    const pozLines = [
        'Použitý dopr.prostriedok:',
        '   O - osobný vlak    AUS - auto služobné    R - rýchlik        AUV - auto vlastné',
        '   A - autobus        MOS - motocykel služobný    L - lietadlo   MOV - motocykel vlastný',
    ]
    pozLines.forEach((line, i) => { doc.text(line, L + 2, y + 5 + i * 4.5) })

    const sigRightW = R - sigDivX - 4
    normal(doc, 6.5)
    doc.text('Vyhlasujem, že som všetky údaje uviedol úplne a správne.', sigDivX + 2, y + 5, { maxWidth: sigRightW })
    bold(doc, 8); doc.text(fmtD(sigDate), sigDivX + 2, y + 19)
    doc.setLineDashPattern([1, 2], 0)
    hLine(doc, y + 20, sigDivX + 4, R - 4)
    doc.setLineDashPattern([], 0)
    const sigCenterX = (sigDivX + R) / 2
    normal(doc, 6.5); doc.text('Dátum a podpis účtovateľa', sigCenterX, y + 24, { align: 'center' })

    y += sigSecH
    hLine(doc, y)
    rect(doc, L, page2Top, W, y - page2Top)
}

// ── Hlavná funkcia ────────────────────────────────────────────────────────────

export const generateTravelOrderPdf = (data: TravelOrderPdfInput): string => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    setupFonts(doc)

    const f = computeFinancials(data)
    const page1EndY = drawPage1(doc, data)

    if (data.includeAccounting === false) {
        drawPage2(doc, data, f, page1EndY + 4)
    } else {
        doc.addPage()
        setupFonts(doc)
        drawPage2(doc, data, f)
    }

    return doc.output('datauristring').split(',')[1]
}
