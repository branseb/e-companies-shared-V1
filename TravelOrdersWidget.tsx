import { useMemo, useState } from 'react'
import {
    Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Paper,
    Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { Add, ArrowDownward, ArrowUpward, Delete, Edit, PictureAsPdf, Receipt } from '@mui/icons-material'

// ── Typy ─────────────────────────────────────────────────────────────────────

export type TripSegment = {
    date: string
    fromPlace: string
    fromTime: string
    toPlace: string
    toTime: string
    transport: string
    km: number | null
    stravne: number | null
    currency: string        // 'EUR' alebo iná (CZK, HUF...)
    country?: string | null // krajina pre výpočet stravného ('SK', 'CZ'...)
    nbsDate?: string | null
    expenses?: Array<{ type: string; amount: number; currency: string }> | null
}

export type Trip = {
    destination: string
    country?: string | null      // Kód krajiny: 'SK', 'CZ', 'HU'... (default 'SK')
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    segments: TripSegment[]
}

export type TravelOrder = {
    id: number | string
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
    stravneAmount?: number | null
    actualExpenses?: number | null
    currency: string
    status: string
    notes?: string | null
    freeRanajky?: boolean | null
    freeObed?: boolean | null
    freeVecera?: boolean | null
    includeAccounting?: boolean | null
    includeAdminFields?: boolean | null
    applyAmortization?: boolean | null
    applyFuelCost?: boolean | null
    advances?: Array<{ amount: number; currency: string }> | null
    useExchangeRates?: boolean | null
    exchangeRateDate?: string | null        // dátum kurzu NBS (deň pred nástupom)
    exchangeRates?: Record<string, number> | null  // { CZK: 25.50, HUF: 390 }
    trips?: Trip[] | null
    createdAt: string
}

export type TravelOrderInput = Omit<TravelOrder, 'id' | 'createdAt'>

export type EmployeeRecord = {
    id: number
    name: string
    address?: string | null
}

export type TravelOrdersWidgetProps = {
    orders: TravelOrder[]
    loading: boolean
    onAdd: (data: TravelOrderInput) => Promise<void>
    onUpdate: (id: TravelOrder['id'], data: Partial<TravelOrderInput>) => Promise<void>
    onDelete: (id: TravelOrder['id']) => Promise<void>
    onGeneratePdf?: (order: TravelOrder) => void
    readOnly?: boolean
    ratesHistory?: StravneRates | null
    onRatesChange?: (history: StravneRates) => void
    employees?: EmployeeRecord[]
    onEmployeeCreate?: (data: { name: string; address?: string }) => Promise<void>
    onEmployeeUpdate?: (id: number, data: { name: string; address?: string }) => Promise<void>
    onEmployeeDelete?: (id: number) => Promise<void>
}

// ── Konštanty ─────────────────────────────────────────────────────────────────

export const TRANSPORT_OPTIONS = [
    { value: 'car',         label: 'Vlastné auto (AUV)', short: 'AUV' },
    { value: 'company_car', label: 'Firemné auto (AUS)',  short: 'AUS' },
    { value: 'train',       label: 'Vlak',                short: 'R/O' },
    { value: 'bus',         label: 'Autobus',             short: 'A'   },
    { value: 'plane',       label: 'Lietadlo',            short: 'L'   },
    { value: 'other',       label: 'Iné',                 short: '—'   },
]

export const COUNTRY_OPTIONS = [
    { code: 'SK', label: 'Slovensko',        currency: 'EUR', borderPrefix: ''     },
    { code: 'CZ', label: 'Česká republika',  currency: 'CZK', borderPrefix: 'CZ'  },
    { code: 'HU', label: 'Maďarsko',         currency: 'HUF', borderPrefix: 'HU'  },
    { code: 'AT', label: 'Rakúsko',          currency: 'EUR', borderPrefix: 'AT'  },
    { code: 'PL', label: 'Poľsko',           currency: 'PLN', borderPrefix: 'PL'  },
    { code: 'DE', label: 'Nemecko',          currency: 'EUR', borderPrefix: 'DE'  },
    { code: 'UA', label: 'Ukrajina',         currency: 'UAH', borderPrefix: 'UA'  },
    { code: 'OTHER', label: 'Iná krajina',   currency: 'EUR', borderPrefix: 'XX'  },
]

const STATUS_OPTIONS = [
    { value: 'draft',    label: 'Návrh' },
    { value: 'approved', label: 'Schválený' },
    { value: 'settled',  label: 'Vyúčtovaný' },
]

const STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'success' }> = {
    draft:    { label: 'Návrh',       color: 'default' },
    approved: { label: 'Schválený',   color: 'info' },
    settled:  { label: 'Vyúčtovaný', color: 'success' },
}

export const EXPENSE_TYPES = [
    { value: 'cestovne', label: 'Cestovné' },
    { value: 'noclazne', label: 'Nocľažné' },
    { value: 'nutne',    label: 'Nutné náhrady' },
    { value: 'ine',      label: 'Iné náhrady' },
]

export const AMORTIZATION_RATE = 0.313   // EUR/km — zákon č. 283/2002 Z.z.

// ── Sadzby stravného ─────────────────────────────────────────────────────────

export type ForeignStravneRate = {
    rate_12: number   // plná denná sadzba (12+ hod.); 6–12h = 50%, 0–6h = 25%
    currency: string  // ISO kód meny krajiny
    label?: string          // názov krajiny (len pre vlastné krajiny)
    borderPrefix?: string   // prípona hranice, napr. 'FR' pre hr. SK-FR
}

export type StravneMeals = {
    ranajky: number   // krátenie za raňajky (0–1, napr. 0.25)
    obed: number      // krátenie za obed (0–1, napr. 0.40)
    vecera: number    // krátenie za večeru (0–1, napr. 0.35)
}

// Jeden záznam sadzieb platný od dátumu validFrom
export type StravneRatesEntry = {
    validFrom: string  // 'YYYY-MM-DD'
    sk_5: number       // 5–12 hod. tuzemsko
    sk_12: number      // 12–18 hod. tuzemsko
    sk_18: number      // 18+ hod. tuzemsko
    meals: StravneMeals
    foreign: Record<string, ForeignStravneRate>
}

// História sadzieb (pole záznakov)
export type StravneRates = StravneRatesEntry[]

const DEFAULT_ENTRY: StravneRatesEntry = {
    validFrom: '2025-01-01',
    sk_5: 9.30,
    sk_12: 13.80,
    sk_18: 20.90,
    meals: { ranajky: 0.25, obed: 0.40, vecera: 0.35 },
    foreign: Object.fromEntries(
        COUNTRY_OPTIONS.filter(c => c.code !== 'SK').map(c => [
            c.code,
            { rate_12: 0, currency: c.currency },
        ])
    ),
}

export const DEFAULT_STRAVNE_RATES: StravneRates = [DEFAULT_ENTRY]

// Vráti sadzby platné v daný dátum (najnovší záznam kde validFrom <= date)
export const getRatesForDate = (history: StravneRates, date: string): StravneRatesEntry => {
    if (!history.length) return DEFAULT_ENTRY
    const sorted = [...history].sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    return sorted.find(e => e.validFrom <= date) ?? sorted[sorted.length - 1]
}

type CountryOption = { code: string; label: string; currency: string; borderPrefix: string }

// Zlúčenie statických krajín s vlastnými z histórie sadzieb
export const getAllCountries = (history: StravneRates): CountryOption[] => {
    const base = COUNTRY_OPTIONS as CountryOption[]
    const baseCodes = new Set(base.map(c => c.code))
    const customCodes = new Set(history.flatMap(e => Object.keys(e.foreign)).filter(c => !baseCodes.has(c)))
    const customs: CountryOption[] = [...customCodes].map(code => {
        const fr = history.map(e => e.foreign[code]).find(Boolean)!
        return { code, label: fr.label ?? code, currency: fr.currency, borderPrefix: fr.borderPrefix ?? code }
    })
    return [...base, ...customs]
}

const segHours = (fromTime: string, toTime: string): number => {
    if (!fromTime || !toTime) return 0
    if (fromTime === '00:00' && toTime === '00:00') return 24
    const [fh, fm] = fromTime.split(':').map(Number)
    const [th, tm] = toTime.split(':').map(Number)
    let diff = (th * 60 + tm) - (fh * 60 + fm)
    if (diff <= 0) diff += 1440
    return diff / 60
}

const calcSegStravne = (fromTime: string, toTime: string, country: string, entry: StravneRatesEntry): number | null => {
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

// Stravné sa počíta za celý deň v danej krajine
type DayStravneEntry = { date: string; country: string; currency: string; hours: number; stravne: number }

export const calcDailyStravne = (segments: TripSegment[], ratesHistory: StravneRates): DayStravneEntry[] => {
    const dates = [...new Set(segments.map(s => s.date))]
    const result: DayStravneEntry[] = []

    for (const date of dates) {
        const daySegs = segments.filter(s => s.date === date)
        const entry = getRatesForDate(ratesHistory, date)

        // Rozdelíme segmenty na súvislé bloky rovnakej krajiny (SK→CZ→SK = 3 bloky)
        const blocks: { country: string; segs: TripSegment[] }[] = []
        for (const seg of daySegs) {
            const c = seg.country ?? 'SK'
            const last = blocks[blocks.length - 1]
            if (!last || last.country !== c) blocks.push({ country: c, segs: [seg] })
            else last.segs.push(seg)
        }

        // Pre každý blok: min→max časov (zahŕňa pobyt na mieste) → stravné
        // Stravné z viacerých blokov tej istej krajiny sa sčítava
        const byCountry: Record<string, { stravne: number; currency: string; hours: number }> = {}
        for (const block of blocks) {
            const froms = block.segs.map(s => s.fromTime).filter(Boolean)
            const tos   = block.segs.map(s => s.toTime).filter(Boolean)
            if (!froms.length || !tos.length) continue
            const totalHours = segHours(
                froms.reduce((a, b) => a < b ? a : b),
                tos.reduce((a, b) => a > b ? a : b),
            )
            const stravne = calcSegStravne(
                '00:00',
                `${String(Math.floor(totalHours)).padStart(2, '0')}:${String(Math.round((totalHours % 1) * 60)).padStart(2, '0')}`,
                block.country,
                entry,
            )
            if (!stravne) continue
            const currency = block.segs.find(s => s.currency)?.currency ?? 'EUR'
            if (!byCountry[block.country]) byCountry[block.country] = { stravne: 0, currency, hours: 0 }
            byCountry[block.country].stravne += stravne
            byCountry[block.country].hours   += totalHours
        }

        for (const [country, data] of Object.entries(byCountry)) {
            result.push({ date, country, currency: data.currency, hours: +data.hours.toFixed(1), stravne: data.stravne })
        }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Auto-výpočty ──────────────────────────────────────────────────────────────

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

export const calcAmortization = (km: number, transportType: string | null | undefined): number =>
    transportType === 'car' ? km * AMORTIZATION_RATE : 0

// ── Pomocné funkcie ───────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return iso }
}

const fmtAmt = (amt: number | null | undefined, cur: string) =>
    amt != null ? `${Number(amt).toFixed(2)} ${cur}` : '—'

export const transportShort = (t: string | null | undefined) =>
    TRANSPORT_OPTIONS.find(o => o.value === t)?.short ?? t ?? '—'

export const transportLabel = (t: string | null | undefined) =>
    TRANSPORT_OPTIONS.find(o => o.value === t)?.label ?? t ?? '—'


const emptySegment = (date: string, transport: string, country = 'SK'): TripSegment => ({
    date,
    fromPlace: '',
    fromTime: '',
    toPlace: '',
    toTime: '',
    transport,
    km: null,
    stravne: null,
    currency: 'EUR',
    country,
    nbsDate: null,
})

const emptyTrip = (date: string, _transport: string): Trip => ({
    destination: '',
    country: 'SK',
    purpose: '',
    departureLocation: '',
    departureDate: date,
    departureTime: '',
    returnLocation: '',
    returnDate: date,
    segments: [],
})

const emptyForm = (): TravelOrderInput => ({
    employee:          '',
    employeeAddress:   '',
    collaborators:     '',
    destination:       '',
    purpose:           '',
    departureLocation: '',
    departureDate:     new Date().toISOString().split('T')[0],
    departureTime:     '08:00',
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
    freeRanajky:       null,
    freeObed:          null,
    freeVecera:        null,
    includeAccounting:  null,
    includeAdminFields: null,
    applyAmortization:  null,
    applyFuelCost:      null,
    advances:           null,
    useExchangeRates:   null,
    exchangeRateDate:  null,
    exchangeRates:     null,
    trips:             [emptyTrip(new Date().toISOString().split('T')[0], 'car')],
})

// ── Sekcia formulára ──────────────────────────────────────────────────────────

const FormSection = ({ title }: { title: string }) => (
    <Box>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {title}
        </Typography>
    </Box>
)

// ── Editor segmentov jednej cesty ─────────────────────────────────────────────

type SegEditorProps = {
    segments: TripSegment[]
    tripDate: string
    transport: string
    defaultCountry: string
    ratesHistory: StravneRates
    allCountries: CountryOption[]
    onChange: (segs: TripSegment[]) => void
}

const SegmentEditor = ({ segments, tripDate, transport, defaultCountry, ratesHistory, allCountries, onChange }: SegEditorProps) => {
    const [expandedExp, setExpandedExp] = useState<Set<number>>(new Set())
    const segRates = (date: string) => getRatesForDate(ratesHistory, date || tripDate)
    const segCtry = (seg: TripSegment) => seg.country ?? defaultCountry

    const update = (i: number, field: keyof TripSegment, value: TripSegment[typeof field]) => {
        const s = [...segments]
        s[i] = { ...s[i], [field]: value }
        // Sync čas odchodu nasledujúceho úseku (rovnaké miesto)
        if (field === 'toTime' && s[i + 1] && s[i + 1].fromPlace === s[i].toPlace) {
            s[i + 1] = { ...s[i + 1], fromTime: value as string }
            s[i + 1] = { ...s[i + 1], stravne: calcSegStravne(s[i + 1].fromTime, s[i + 1].toTime, segCtry(s[i + 1]), segRates(s[i + 1].date)) }
        }
        // Auto-počítanie stravného pri zmene časov alebo krajiny
        if (field === 'fromTime' || field === 'toTime' || field === 'country') {
            s[i] = { ...s[i], stravne: calcSegStravne(s[i].fromTime, s[i].toTime, segCtry(s[i]), segRates(s[i].date)) }
        }
        onChange(s)
    }
    const remove = (i: number) => {
        const s = [...segments]
        s.splice(i, 1)
        onChange(s)
    }
    const insertAfter = (i: number) => {
        const s = [...segments]
        s.splice(i + 1, 0, emptySegment(segments[i]?.date ?? tripDate, transport, defaultCountry))
        onChange(s)
    }
    const move = (i: number, dir: -1 | 1) => {
        const s = [...segments]
        const tmp = s[i]; s[i] = s[i + dir]; s[i + dir] = tmp
        onChange(s)
    }
    const add = () => onChange([...segments, emptySegment(tripDate, transport, defaultCountry)])

    const toggleExp = (i: number) => setExpandedExp(prev => {
        const s = new Set(prev)
        if (s.has(i)) s.delete(i); else s.add(i)
        return s
    })

    const updateExpenses = (i: number, expenses: Array<{ type: string; amount: number; currency: string }>) => {
        const s = [...segments]
        s[i] = { ...s[i], expenses }
        onChange(s)
    }

    if (segments.length === 0) {
        return (
            <Button size="small" startIcon={<Add />} onClick={add} sx={{ mt: 0.5 }}>
                Pridať úsek
            </Button>
        )
    }

    // Spoločný blok výdavkov segmentu
    const ExpensesBlock = ({ i, seg }: { i: number; seg: TripSegment }) => (
        <Box sx={{ pl: { xs: 1, sm: 5 }, pr: 1, py: 0.5, bgcolor: 'action.hover' }}>
            <Stack sx={{ gap: 0.5 }}>
                {(seg.expenses ?? []).map((exp, ei) => (
                    <Stack key={ei} direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField select size="small" sx={{ width: 160 }} label="Typ"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.type || 'cestovne'}
                            onChange={e => updateExpenses(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, type: e.target.value } : x))}>
                            {EXPENSE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </TextField>
                        <TextField type="number" size="small" sx={{ width: 100 }} label="Suma"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.amount || ''}
                            onChange={e => updateExpenses(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, amount: Number(e.target.value) } : x))} />
                        <TextField size="small" sx={{ width: 68 }} label="Mena"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.currency}
                            onChange={e => updateExpenses(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, currency: e.target.value.toUpperCase() } : x))} />
                        <IconButton size="small" color="error"
                            onClick={() => updateExpenses(i, (seg.expenses ?? []).filter((_, j) => j !== ei))}>
                            <Delete fontSize="small" />
                        </IconButton>
                    </Stack>
                ))}
                <Button size="small" startIcon={<Add />} sx={{ alignSelf: 'flex-start' }}
                    onClick={() => updateExpenses(i, [...(seg.expenses ?? []), { type: 'cestovne', amount: 0, currency: seg.currency || 'EUR' }])}>
                    Pridať výdavok
                </Button>
            </Stack>
        </Box>
    )

    return (
        <Stack sx={{ gap: 1 }}>
            {segments.map((seg, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1, bgcolor: i % 2 === 1 ? 'action.hover' : undefined }}>
                    <Stack sx={{ gap: 0.75 }}>
                        <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
                            <TextField type="date" size="small" sx={{ flex: 1 }} label="Dátum"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.date}
                                onChange={e => update(i, 'date', e.target.value)} />
                            <TextField select size="small" sx={{ width: 80 }} label="Doprava"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.transport}
                                onChange={e => update(i, 'transport', e.target.value)}>
                                {TRANSPORT_OPTIONS.map(o => (
                                    <MenuItem key={o.value} value={o.value}>{o.short}</MenuItem>
                                ))}
                            </TextField>
                            <Stack direction="row">
                                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                                    <ArrowUpward sx={{ fontSize: 14 }} />
                                </IconButton>
                                <IconButton size="small" disabled={i === segments.length - 1} onClick={() => move(i, 1)}>
                                    <ArrowDownward sx={{ fontSize: 14 }} />
                                </IconButton>
                                <Tooltip title={`Iné výdavky${seg.expenses?.length ? ` (${seg.expenses.length})` : ''}`}>
                                    <IconButton size="small"
                                        color={seg.expenses?.length ? 'primary' : 'default'}
                                        onClick={() => toggleExp(i)}>
                                        <Receipt sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                                <IconButton size="small" color="error" onClick={() => remove(i)}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                            <TextField size="small" label="Odchod z" sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.fromPlace}
                                onChange={e => update(i, 'fromPlace', e.target.value)} />
                            <TextField type="time" size="small" sx={{ width: 95 }} label="Čas od"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.fromTime}
                                onChange={e => update(i, 'fromTime', e.target.value)} />
                        </Stack>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                            <TextField size="small" label="Príchod do" sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.toPlace}
                                onChange={e => update(i, 'toPlace', e.target.value)} />
                            <TextField type="time" size="small" sx={{ width: 95 }} label="Čas do"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.toTime}
                                onChange={e => update(i, 'toTime', e.target.value)} />
                        </Stack>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                            <TextField type="number" size="small" sx={{ flex: 1 }} label="km"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.km ?? ''}
                                onChange={e => update(i, 'km', e.target.value ? Number(e.target.value) : null)} />
                            <TextField size="small" sx={{ width: 72 }} label="Mena"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.currency}
                                onChange={e => update(i, 'currency', e.target.value.toUpperCase())} />
                            <TextField select size="small" sx={{ width: 90 }} label="Krajina"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.country ?? defaultCountry}
                                onChange={e => update(i, 'country', e.target.value)}>
                                {allCountries.map(c => (
                                    <MenuItem key={c.code} value={c.code}>{c.code}</MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </Stack>
                    {expandedExp.has(i) && <ExpensesBlock i={i} seg={seg} />}
                    <Box sx={{ textAlign: 'center', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => insertAfter(i)}
                            sx={{ opacity: 0.25, '&:hover': { opacity: 1 }, p: 0.2 }}>
                            <Add sx={{ fontSize: 13 }} />
                        </IconButton>
                    </Box>
                </Paper>
            ))}
            <Button size="small" startIcon={<Add />} onClick={add} sx={{ mt: 0.5 }}>
                Pridať úsek
            </Button>
        </Stack>
    )
}

// ── Dialog zamestnancov ───────────────────────────────────────────────────────

type EmpDialogProps = {
    employees: EmployeeRecord[]
    onCreate: (data: { name: string; address?: string }) => Promise<void>
    onUpdate: (id: number, data: { name: string; address?: string }) => Promise<void>
    onDelete: (id: number) => Promise<void>
    onClose: () => void
}

const EmployeesDialog = ({ employees, onCreate, onUpdate, onDelete, onClose }: EmpDialogProps) => {
    const [editing, setEditing] = useState<EmployeeRecord | null>(null)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState({ name: '', address: '' })
    const [saving, setSaving] = useState(false)

    const openAdd = () => { setEditing(null); setForm({ name: '', address: '' }); setAdding(true) }
    const openEdit = (e: EmployeeRecord) => { setEditing(e); setForm({ name: e.name, address: e.address ?? '' }); setAdding(true) }
    const cancel = () => { setAdding(false); setEditing(null) }

    const handleSave = async () => {
        if (!form.name.trim()) return
        setSaving(true)
        try {
            if (editing) await onUpdate(editing.id, { name: form.name.trim(), address: form.address.trim() || undefined })
            else         await onCreate({ name: form.name.trim(), address: form.address.trim() || undefined })
            cancel()
        } finally { setSaving(false) }
    }

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Zamestnanci</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 1.5, mt: 1 }}>
                    {employees.length === 0 && !adding && (
                        <Typography sx={{ color: 'text.secondary' }}>Zatiaľ žiadni zamestnanci.</Typography>
                    )}
                    {employees.map(emp => (
                        <Stack key={emp.id} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{emp.name}</Typography>
                                {emp.address && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{emp.address}</Typography>
                                )}
                            </Box>
                            <IconButton size="small" onClick={() => openEdit(emp)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" color="error" onClick={() => onDelete(emp.id)}><Delete fontSize="small" /></IconButton>
                        </Stack>
                    ))}

                    {adding && (
                        <Stack sx={{ gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                            <Typography variant="subtitle2">{editing ? 'Upraviť zamestnanca' : 'Nový zamestnanec'}</Typography>
                            <TextField label="Meno a priezvisko" size="small" fullWidth required
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            <TextField label="Bydlisko" size="small" fullWidth
                                value={form.address}
                                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                            <Stack direction="row" sx={{ gap: 1 }}>
                                <Button size="small" onClick={cancel} disabled={saving}>Zrušiť</Button>
                                <Button size="small" variant="contained" onClick={handleSave}
                                    disabled={saving || !form.name.trim()}>
                                    {saving ? 'Ukladám…' : 'Uložiť'}
                                </Button>
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {!adding && (
                    <Button startIcon={<Add />} size="small" onClick={openAdd}>Pridať zamestnanca</Button>
                )}
                <Button onClick={onClose}>Zavrieť</Button>
            </DialogActions>
        </Dialog>
    )
}

// ── Dialog sadzby stravného (história) ───────────────────────────────────────

type RatesDialogProps = {
    history: StravneRates
    onSave: (history: StravneRates) => void
    onClose: () => void
}

const newEntry = (): StravneRatesEntry => ({
    ...DEFAULT_ENTRY,
    validFrom: new Date().toISOString().split('T')[0],
})

const RatesDialog = ({ history, onSave, onClose }: RatesDialogProps) => {
    const [entries, setEntries] = useState<StravneRatesEntry[]>(
        history.length ? [...history].sort((a, b) => b.validFrom.localeCompare(a.validFrom)) : [newEntry()]
    )
    const [activeIdx, setActiveIdx] = useState(0)

    const active = entries[activeIdx] ?? entries[0]

    const updateActive = (patch: Partial<StravneRatesEntry>) =>
        setEntries(es => es.map((e, i) => i === activeIdx ? { ...e, ...patch } : e))

    const setSk = (field: 'sk_5' | 'sk_12' | 'sk_18', v: string) =>
        updateActive({ [field]: v ? Number(v) : 0 })

    const setMeal = (field: 'ranajky' | 'obed' | 'vecera', v: string) =>
        updateActive({ meals: { ...active.meals, [field]: v ? Number(v) : 0 } })

    const setForeign = (code: string, v: string) =>
        updateActive({
            foreign: {
                ...active.foreign,
                [code]: { ...active.foreign[code], rate_12: v ? Number(v) : 0 },
            },
        })

    const builtInCodes = new Set(COUNTRY_OPTIONS.map(c => c.code))

    const [newCtry, setNewCtry] = useState({ code: '', label: '', currency: '', borderPrefix: '' })

    const addCountry = () => {
        const code = newCtry.code.trim().toUpperCase()
        if (!code || !newCtry.label.trim() || !newCtry.currency.trim()) return
        updateActive({
            foreign: {
                ...active.foreign,
                [code]: {
                    rate_12: 0,
                    currency: newCtry.currency.trim().toUpperCase(),
                    label: newCtry.label.trim(),
                    borderPrefix: (newCtry.borderPrefix.trim() || code).toUpperCase(),
                },
            },
        })
        setNewCtry({ code: '', label: '', currency: '', borderPrefix: '' })
    }

    const removeCountry = (code: string) => {
        const { [code]: _, ...rest } = active.foreign
        updateActive({ foreign: rest })
    }

    const addEntry = () => {
        const e = newEntry()
        setEntries(es => [e, ...es])
        setActiveIdx(0)
    }

    const removeActive = () => {
        if (entries.length <= 1) return
        setEntries(es => es.filter((_, i) => i !== activeIdx))
        setActiveIdx(0)
    }

    const sorted = [...entries].sort((a, b) => b.validFrom.localeCompare(a.validFrom))

    return (
        <Dialog open onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Sadzby stravného — história</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 2, mt: 1 }}>
                    {/* Výber záznamu */}
                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        {sorted.map((e) => (
                            <Chip key={e.validFrom} size="small"
                                label={`od ${fmtDate(e.validFrom)}`}
                                color={entries.indexOf(e) === activeIdx ? 'primary' : 'default'}
                                onClick={() => setActiveIdx(entries.indexOf(e))}
                            />
                        ))}
                        <Button size="small" startIcon={<Add />} onClick={addEntry}>Pridať obdobie</Button>
                        {entries.length > 1 && (
                            <Button size="small" color="error" onClick={removeActive}>Odstrániť</Button>
                        )}
                    </Stack>

                    {active && (
                        <>
                            <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                                <TextField label="Platné od" type="date" size="small" sx={{ width: 160 }}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    value={active.validFrom}
                                    onChange={e => updateActive({ validFrom: e.target.value })} />
                            </Stack>

                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Tuzemsko (SR) — EUR</Typography>
                                <Stack direction="row" sx={{ gap: 1.5 }}>
                                    <TextField label="5–12 hod." type="number" size="small" fullWidth
                                        value={active.sk_5}
                                        onChange={e => setSk('sk_5', e.target.value)} />
                                    <TextField label="12–18 hod." type="number" size="small" fullWidth
                                        value={active.sk_12}
                                        onChange={e => setSk('sk_12', e.target.value)} />
                                    <TextField label="18+ hod." type="number" size="small" fullWidth
                                        value={active.sk_18}
                                        onChange={e => setSk('sk_18', e.target.value)} />
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Krátenie za bezplatné stravovanie</Typography>
                                <Stack direction="row" sx={{ gap: 1.5 }}>
                                    <TextField label="Raňajky %" type="number" size="small" fullWidth
                                        value={+(active.meals.ranajky * 100).toFixed(1)}
                                        onChange={e => setMeal('ranajky', e.target.value ? String(Number(e.target.value) / 100) : '0')} />
                                    <TextField label="Obed %" type="number" size="small" fullWidth
                                        value={+(active.meals.obed * 100).toFixed(1)}
                                        onChange={e => setMeal('obed', e.target.value ? String(Number(e.target.value) / 100) : '0')} />
                                    <TextField label="Večera %" type="number" size="small" fullWidth
                                        value={+(active.meals.vecera * 100).toFixed(1)}
                                        onChange={e => setMeal('vecera', e.target.value ? String(Number(e.target.value) / 100) : '0')} />
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Zahraničie</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Krajina</TableCell>
                                            <TableCell sx={{ width: 60 }}>Mena</TableCell>
                                            <TableCell sx={{ width: 90, color: 'text.secondary' }}>0–6 hod. (25%)</TableCell>
                                            <TableCell sx={{ width: 90, color: 'text.secondary' }}>6–12 hod. (50%)</TableCell>
                                            <TableCell sx={{ width: 130 }}>Plná sadzba (12+ hod.)</TableCell>
                                            <TableCell sx={{ width: 36 }} />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {Object.entries(active.foreign).map(([code, fr]) => {
                                            const base = COUNTRY_OPTIONS.find(c => c.code === code)
                                            const label = base?.label ?? fr.label ?? code
                                            const isCustom = !builtInCodes.has(code)
                                            return (
                                                <TableRow key={code}>
                                                    <TableCell>
                                                        {label}
                                                        {isCustom && (
                                                            <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                                                                ({code})
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ color: 'text.secondary' }}>{fr.currency}</TableCell>
                                                    <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                        {fr.rate_12 ? (fr.rate_12 * 0.25).toFixed(2) : '—'}
                                                    </TableCell>
                                                    <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                        {fr.rate_12 ? (fr.rate_12 * 0.5).toFixed(2) : '—'}
                                                    </TableCell>
                                                    <TableCell sx={{ p: 0.5 }}>
                                                        <TextField type="number" size="small" fullWidth
                                                            value={fr.rate_12}
                                                            onChange={e => setForeign(code, e.target.value)} />
                                                    </TableCell>
                                                    <TableCell sx={{ p: 0.5 }}>
                                                        {isCustom && (
                                                            <IconButton size="small" color="error" onClick={() => removeCountry(code)}>
                                                                <Delete fontSize="small" />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                                {/* Pridať vlastnú krajinu */}
                                <Stack direction="row" sx={{ gap: 1, mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <TextField label="Kód" size="small" sx={{ width: 72 }}
                                        placeholder="FR"
                                        value={newCtry.code}
                                        onChange={e => setNewCtry(n => ({ ...n, code: e.target.value.toUpperCase().slice(0, 5) }))} />
                                    <TextField label="Názov" size="small" sx={{ width: 160 }}
                                        placeholder="Francúzsko"
                                        value={newCtry.label}
                                        onChange={e => setNewCtry(n => ({ ...n, label: e.target.value }))} />
                                    <TextField label="Mena" size="small" sx={{ width: 80 }}
                                        placeholder="EUR"
                                        value={newCtry.currency}
                                        onChange={e => setNewCtry(n => ({ ...n, currency: e.target.value.toUpperCase().slice(0, 4) }))} />
                                    <TextField label="Prípona hranice" size="small" sx={{ width: 130 }}
                                        placeholder="FR (pre hr. SK-FR)"
                                        value={newCtry.borderPrefix}
                                        onChange={e => setNewCtry(n => ({ ...n, borderPrefix: e.target.value.toUpperCase().slice(0, 5) }))} />
                                    <Button size="small" variant="outlined" startIcon={<Add />}
                                        disabled={!newCtry.code.trim() || !newCtry.label.trim() || !newCtry.currency.trim()}
                                        onClick={addCountry}>
                                        Pridať krajinu
                                    </Button>
                                </Stack>
                            </Box>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Zrušiť</Button>
                <Button variant="contained" onClick={() => { onSave(entries); onClose() }}>Uložiť</Button>
            </DialogActions>
        </Dialog>
    )
}

// ── Dialóg ────────────────────────────────────────────────────────────────────

type DialogProps = {
    initial: TravelOrderInput
    isNew: boolean
    ratesHistory: StravneRates
    employees: EmployeeRecord[]
    onSave: (data: TravelOrderInput) => Promise<void>
    onClose: () => void
}

const OrderDialog = ({ initial, isNew, ratesHistory, employees, onSave, onClose }: DialogProps) => {
    const [form, setForm] = useState<TravelOrderInput>(initial)
    const [saving, setSaving] = useState(false)

    const set = <K extends keyof TravelOrderInput>(field: K, value: TravelOrderInput[K]) =>
        setForm(f => ({ ...f, [field]: value }))

    // Informačné výpočty
    const autoCarKm = useMemo(() => {
        const total = (form.trips ?? []).flatMap(t => t.segments)
            .filter(s => s.transport === 'car')
            .reduce((sum, s) => sum + (s.km ?? 0), 0)
        return total > 0 ? total : null
    }, [form.trips])

    const effectiveCarKm = autoCarKm ?? form.distanceKm ?? null

    const fuelCost = useMemo(() => {
        if (form.applyFuelCost === false) return null
        const { fuelConsumption: cons, fuelPricePerLiter: price } = form
        if (!effectiveCarKm || !cons || !price) return null
        return calcFuelCost(effectiveCarKm, cons, price)
    }, [effectiveCarKm, form.fuelConsumption, form.fuelPricePerLiter, form.applyFuelCost])

    const amortization = useMemo(() => {
        if (form.applyAmortization === false || !effectiveCarKm) return null
        return calcAmortization(effectiveCarKm, 'car')
    }, [effectiveCarKm, form.applyAmortization])

    const allCountries = useMemo(() => getAllCountries(ratesHistory), [ratesHistory])

    const foreignCurrencies = useMemo(() => {
        const all = (form.trips ?? []).flatMap(t => t.segments).map(s => s.currency).filter(c => c && c !== 'EUR')
        return [...new Set(all)]
    }, [form.trips])

    // Stravné počítané za celý deň v krajine (nie per-segment)
    const segStravneByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        for (const t of form.trips ?? []) {
            for (const ds of calcDailyStravne(t.segments, ratesHistory)) {
                map[ds.currency] = (map[ds.currency] ?? 0) + ds.stravne
            }
        }
        return map
    }, [form.trips, ratesHistory])

    const mealDeductionPct = useMemo(() => {
        const firstDate = form.trips?.[0]?.departureDate ?? new Date().toISOString().split('T')[0]
        const entry = getRatesForDate(ratesHistory, firstDate)
        return (form.freeRanajky !== false ? entry.meals.ranajky : 0)
             + (form.freeObed    !== false ? entry.meals.obed    : 0)
             + (form.freeVecera  !== false ? entry.meals.vecera  : 0)
    }, [form.trips, form.freeRanajky, form.freeObed, form.freeVecera, ratesHistory])

    const netStravneByCurrency = useMemo(() => {
        const result: Record<string, number> = {}
        for (const [c, amt] of Object.entries(segStravneByCurrency)) {
            const net = +(amt * (1 - mealDeductionPct)).toFixed(2)
            if (net > 0) result[c] = net
        }
        return result
    }, [segStravneByCurrency, mealDeductionPct])

    const totalsByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        map['EUR'] = (netStravneByCurrency['EUR'] ?? form.stravneAmount ?? 0)
            + (fuelCost ?? 0) + (amortization ?? 0) + (form.actualExpenses ?? 0)
        for (const [c, amt] of Object.entries(netStravneByCurrency)) {
            if (c !== 'EUR') map[c] = (map[c] ?? 0) + amt
        }
        for (const seg of (form.trips ?? []).flatMap(t => t.segments)) {
            for (const exp of seg.expenses ?? []) {
                const c = exp.currency || 'EUR'
                map[c] = (map[c] ?? 0) + (exp.amount ?? 0)
            }
        }
        return Object.fromEntries(Object.entries(map).filter(([, v]) => v > 0))
    }, [netStravneByCurrency, form.stravneAmount, fuelCost, amortization, form.actualExpenses, form.trips])

    const advanceByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        if (form.advances?.length) {
            for (const adv of form.advances) {
                const c = adv.currency || 'EUR'
                map[c] = (map[c] ?? 0) + adv.amount
            }
        } else if (form.advanceAmount) {
            map['EUR'] = form.advanceAmount
        }
        return map
    }, [form.advances, form.advanceAmount])

    const balanceByCurrency = useMemo(() => {
        const allCurs = new Set([...Object.keys(totalsByCurrency), ...Object.keys(advanceByCurrency)])
        const result: Record<string, number> = {}
        for (const c of allCurs) {
            const bal = +((totalsByCurrency[c] ?? 0) - (advanceByCurrency[c] ?? 0)).toFixed(2)
            if (bal !== 0) result[c] = bal
        }
        return result
    }, [totalsByCurrency, advanceByCurrency])

    // ── Trip managment ──
    const updateTrip = (ti: number, field: keyof Trip, value: Trip[typeof field]) => {
        const trips = [...(form.trips ?? [])]
        const old = trips[ti]
        const updated: Trip = { ...old, [field]: value }

        // Auto-sync: návratové miesto sleduje odchodové keď nebolo manuálne zmenené
        if (field === 'departureLocation' && (!old.returnLocation || old.returnLocation === old.departureLocation))
            updated.returnLocation = value as string

        // Auto-sync: dátum návratu sleduje dátum odchodu keď sú rovnaké
        if (field === 'departureDate' && old.returnDate === old.departureDate)
            updated.returnDate = value as string

        trips[ti] = updated
        set('trips', trips)
    }

    const generateTripSegments = (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const trans   = form.transportType ?? 'car'
        const depLoc  = trip.departureLocation ?? ''
        const retLoc  = trip.returnLocation ?? depLoc
        const depDate = trip.departureDate
        const retDate = trip.returnDate ?? depDate
        const depTime = trip.departureTime ?? ''
        const dest    = trip.destination
        const ctry    = allCountries.find(c => c.code === (trip.country ?? 'SK')) ?? allCountries[0]
        const foreign = ctry.code !== 'SK'
        const foreignCur = ctry.currency
        const bp      = ctry.borderPrefix

        const mkSeg = (date: string, from: string, fromTime: string, to: string, cur: string, toTime = '', segCountry = 'SK'): TripSegment =>
            ({ date, fromPlace: from, fromTime, toPlace: to, toTime, transport: trans, km: null, stravne: null, currency: cur, country: segCountry, nbsDate: null })

        // Medzidni — celý deň (pobyt na mieste rokovania)
        const midDays: string[] = []
        const d0 = new Date(depDate), d1 = new Date(retDate)
        const dayDiff = Math.round((d1.getTime() - d0.getTime()) / 86_400_000)
        for (let d = 1; d < dayDiff; d++) {
            const nd = new Date(d0)
            nd.setDate(nd.getDate() + d)
            midDays.push(nd.toISOString().split('T')[0])
        }
        const midCur = foreign ? foreignCur : 'EUR'
        const midCtry = foreign ? ctry.code : 'SK'
        const midSegs: TripSegment[] = midDays.map(date => mkSeg(date, dest, '00:00', dest, midCur, '00:00', midCtry))

        // Ak ostávam cez noc, príchod k destináci = 0:00, odchod z destinácie = 0:00
        const overnight = dayDiff >= 1
        const arrToTime  = overnight ? '00:00' : ''
        const retFromTime = overnight ? '00:00' : ''

        const segs: TripSegment[] = foreign ? [
            mkSeg(depDate, depLoc,         depTime,      `hr. SK-${bp}`, 'EUR',       '',          'SK'),
            mkSeg(depDate, `hr. SK-${bp}`, '',            dest,          foreignCur,  arrToTime,   ctry.code),
            ...midSegs,
            mkSeg(retDate, dest,           retFromTime,  `hr. ${bp}-SK`, foreignCur,  '',          ctry.code),
            mkSeg(retDate, `hr. ${bp}-SK`, '',            retLoc,        'EUR',       '',          'SK'),
        ] : [
            mkSeg(depDate, depLoc, depTime,    dest,   'EUR', arrToTime, 'SK'),
            ...midSegs,
            mkSeg(retDate, dest,   retFromTime, retLoc, 'EUR', '', 'SK'),
        ]

        const trips = [...(form.trips ?? [])]
        trips[ti] = {
            ...trip,
            segments: segs.map(s => ({
                ...s,
                stravne: calcSegStravne(s.fromTime, s.toTime, s.country ?? 'SK', getRatesForDate(ratesHistory, s.date)),
            })),
        }
        set('trips', trips)
    }

    const removeTrip = (ti: number) => {
        const trips = [...(form.trips ?? [])]
        trips.splice(ti, 1)
        set('trips', trips.length ? trips : null)
    }

    const addTrip = () => set('trips', [
        ...(form.trips ?? []),
        emptyTrip(form.departureDate || new Date().toISOString().split('T')[0], form.transportType ?? 'car'),
    ])

    const handleSave = async () => {
        if (!form.employee.trim()) return
        if (!form.trips?.length || !form.trips[0].destination.trim()) return
        setSaving(true)
        const advanceAmount = form.advances?.length
            ? (form.advances.find(a => (a.currency || 'EUR') === 'EUR')?.amount ?? form.advances[0]?.amount ?? 0)
            : form.advanceAmount
        const saved = {
            ...form,
            advanceAmount,
            departureDate: form.trips[0].departureDate || form.departureDate,
            destination:   form.trips.map(t => t.destination).join(' / '),
        }
        try { await onSave(saved) } finally { setSaving(false) }
    }

    return (
        <Dialog open onClose={onClose} maxWidth="xl" fullWidth
            sx={{
                '& .MuiDialog-paper': {
                    margin: { xs: 0, sm: 2 },
                    width: { xs: '100%', sm: 'calc(100% - 32px)' },
                    maxHeight: { xs: '100%', sm: 'calc(100% - 64px)' },
                    height: { xs: '100dvh', sm: 'auto' },
                    borderRadius: { xs: 0, sm: 1 },
                },
            }}>
            <DialogTitle>{isNew ? 'Nový cestovný príkaz' : 'Upraviť cestovný príkaz'}</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 1.5, mt: 1 }}>

                    {/* Zamestnanec */}
                    <FormSection title="Zamestnanec" />
                    <Autocomplete
                        freeSolo
                        options={employees}
                        getOptionLabel={o => typeof o === 'string' ? o : o.name}
                        inputValue={form.employee}
                        onInputChange={(_e, val) => set('employee', val)}
                        onChange={(_e, val) => {
                            if (val && typeof val !== 'string') {
                                set('employee', val.name)
                                set('employeeAddress', val.address ?? '')
                            }
                        }}
                        renderInput={params => (
                            <TextField {...params} label="Meno a priezvisko" required size="small" fullWidth />
                        )}
                    />
                    <TextField label="Bydlisko" fullWidth size="small"
                        value={form.employeeAddress ?? ''}
                        onChange={e => set('employeeAddress', e.target.value)} />

                    {/* Cesty */}
                    <FormSection title="Cesty" />

                    {(form.trips ?? []).map((trip, ti) => (
                        <Paper key={ti} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack sx={{ gap: 1 }}>
                                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                        Cesta {ti + 1}
                                    </Typography>
                                    <IconButton size="small" color="error" onClick={() => removeTrip(ti)}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Stack>

                                <TextField label="Miesto rokovania" required size="small" fullWidth
                                    value={trip.destination}
                                    onChange={e => updateTrip(ti, 'destination', e.target.value)} />
                                <Stack direction="row" sx={{ gap: 1.5 }}>
                                    <TextField select label="Krajina" size="small" sx={{ minWidth: 150, flex: '0 0 auto' }}
                                        value={trip.country ?? 'SK'}
                                        onChange={e => updateTrip(ti, 'country', e.target.value)}>
                                        {allCountries.map(c => (
                                            <MenuItem key={c.code} value={c.code}>
                                                {c.code !== 'SK' && c.currency !== 'EUR'
                                                    ? `${c.label} (${c.currency})`
                                                    : c.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField label="Účel cesty" size="small" sx={{ flex: 1, minWidth: 0 }}
                                        value={trip.purpose ?? ''}
                                        onChange={e => updateTrip(ti, 'purpose', e.target.value)} />
                                </Stack>
                                <Stack direction="row" sx={{ gap: 1.5 }}>
                                    <TextField label="Miesto odchodu" size="small" sx={{ flex: 1, minWidth: 0 }}
                                        value={trip.departureLocation ?? ''}
                                        onChange={e => updateTrip(ti, 'departureLocation', e.target.value)} />
                                    <TextField label="Dátum odchodu" type="date" size="small" sx={{ width: 145, flex: '0 0 auto' }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.departureDate}
                                        onChange={e => updateTrip(ti, 'departureDate', e.target.value)} />
                                    <TextField label="Čas" type="time" size="small" sx={{ width: 100, flex: '0 0 auto' }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.departureTime ?? ''}
                                        onChange={e => updateTrip(ti, 'departureTime', e.target.value)} />
                                </Stack>
                                <Stack direction="row" sx={{ gap: 1.5 }}>
                                    <TextField label="Miesto návratu" size="small" sx={{ flex: 1, minWidth: 0 }}
                                        value={trip.returnLocation ?? ''}
                                        onChange={e => updateTrip(ti, 'returnLocation', e.target.value)} />
                                    <TextField label="Dátum návratu" type="date" size="small" sx={{ width: 145, flex: '0 0 auto' }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.returnDate ?? ''}
                                        onChange={e => updateTrip(ti, 'returnDate', e.target.value)} />
                                </Stack>

                                {trip.segments.length === 0 && trip.destination && (
                                    <Button size="small" variant="outlined" onClick={() => generateTripSegments(ti)}
                                        sx={{ alignSelf: 'flex-start' }}>
                                        Vygenerovať základné úseky (tam + späť)
                                    </Button>
                                )}
                                <SegmentEditor
                                    segments={trip.segments}
                                    tripDate={trip.departureDate}
                                    transport={form.transportType ?? 'car'}
                                    defaultCountry={trip.country ?? 'SK'}
                                    ratesHistory={ratesHistory}
                                    allCountries={allCountries}
                                    onChange={segs => updateTrip(ti, 'segments', segs)}
                                />
                                {/* Denné stravné — počítané za celý deň, nie per-segment */}
                                {(() => {
                                    const daily = calcDailyStravne(trip.segments, ratesHistory)
                                    if (!daily.length) return null
                                    return (
                                        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stravné:</Typography>
                                            {daily.map((ds, di) => (
                                                <Chip key={di} size="small" variant="outlined" color="info"
                                                    label={`${fmtDate(ds.date)} ${ds.country !== 'SK' ? `(${ds.country}) ` : ''}${ds.hours}h → ${ds.stravne.toFixed(2)} ${ds.currency}`}
                                                />
                                            ))}
                                        </Stack>
                                    )
                                })()}
                            </Stack>
                        </Paper>
                    ))}

                    <Button size="small" startIcon={<Add />} onClick={addTrip} sx={{ alignSelf: 'flex-start' }}>
                        Pridať cestu
                    </Button>

                    {/* Doprava */}
                    <FormSection title="Doprava" />
                    <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                        <TextField select label="Spôsob dopravy" size="small" fullWidth
                            value={form.transportType ?? 'car'}
                            onChange={e => set('transportType', e.target.value)}>
                            {TRANSPORT_OPTIONS.map(o => (
                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                        </TextField>
                        {autoCarKm != null && (
                            <Chip size="small" label={`Celkom: ${autoCarKm} km`} variant="outlined" />
                        )}
                    </Stack>
                    {form.transportType === 'car' && (
                        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                            <FormControlLabel
                                control={<Checkbox size="small"
                                    checked={form.applyAmortization !== false}
                                    onChange={e => set('applyAmortization', e.target.checked ? null : false)} />}
                                label="Uplatniť amortizáciu" />
                            <FormControlLabel
                                control={<Checkbox size="small"
                                    checked={form.applyFuelCost !== false}
                                    onChange={e => set('applyFuelCost', e.target.checked ? null : false)} />}
                                label="Uplatniť náhradu za spotrebu PHM" />
                        </Stack>
                    )}
                    {form.transportType === 'car' && form.applyFuelCost !== false && (
                        <Stack direction="row" sx={{ gap: 1.5 }}>
                            <TextField label="Spotreba (l/100km)" type="number" size="small" fullWidth
                                value={form.fuelConsumption ?? ''}
                                onChange={e => set('fuelConsumption', e.target.value ? Number(e.target.value) : undefined)} />
                            <TextField label="Cena PHM (€/l)" type="number" size="small" fullWidth
                                value={form.fuelPricePerLiter ?? ''}
                                onChange={e => set('fuelPricePerLiter', e.target.value ? Number(e.target.value) : undefined)} />
                        </Stack>
                    )}
                    {(fuelCost !== null || amortization !== null) && (
                        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                            {amortization !== null && amortization > 0 && (
                                <Chip size="small" label={`Amortizácia: ${amortization.toFixed(2)} EUR`} variant="outlined" />
                            )}
                            {fuelCost !== null && (
                                <Chip size="small" label={`Spotreba PHM: ${fuelCost.toFixed(2)} EUR`} variant="outlined" />
                            )}
                        </Stack>
                    )}

                    {/* Financie */}
                    <FormSection title="Financie" />
                    <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        {(form.advances ?? []).map((adv, i) => (
                            <Stack key={i} direction="row" sx={{ gap: 0.5, alignItems: 'flex-end' }}>
                                <TextField type="number" size="small" sx={{ width: 120 }}
                                    label={i === 0 ? 'Záloha' : ' '}
                                    value={adv.amount || ''}
                                    onChange={e => set('advances', (form.advances ?? []).map((a, j) => j === i ? { ...a, amount: Number(e.target.value) } : a))} />
                                <TextField size="small" sx={{ width: 68 }}
                                    label={i === 0 ? 'Mena' : ' '}
                                    value={adv.currency}
                                    onChange={e => set('advances', (form.advances ?? []).map((a, j) => j === i ? { ...a, currency: e.target.value.toUpperCase() } : a))} />
                                <IconButton size="small" color="error" sx={{ mb: 0.5 }}
                                    onClick={() => set('advances', (form.advances ?? []).filter((_, j) => j !== i))}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </Stack>
                        ))}
                        <Button size="small" startIcon={<Add />} sx={{ mb: 0.5 }}
                            onClick={() => set('advances', [...(form.advances ?? []), { amount: 0, currency: form.advances?.length ? (Object.keys(netStravneByCurrency).find(c => c !== 'EUR') ?? 'CZK') : (form.currency || 'EUR') }])}>
                            {!form.advances?.length ? 'Pridať zálohu' : '+ mena'}
                        </Button>
                        <TextField label="Iné výdavky (celkom)" type="number" size="small" sx={{ width: 160 }}
                            value={form.actualExpenses ?? ''}
                            onChange={e => set('actualExpenses', e.target.value ? Number(e.target.value) : undefined)} />
                    </Stack>
                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                        {Object.entries(totalsByCurrency).map(([c, amt]) => (
                            <Chip key={c} size="small"
                                label={`Celkové náklady: ${amt.toFixed(2)} ${c}`}
                                color="primary" variant="outlined" />
                        ))}
                        {Object.entries(balanceByCurrency).filter(([, v]) => v > 0).length > 0 && (
                            <Chip size="small"
                                label={`Doplatok: ${Object.entries(balanceByCurrency).filter(([, v]) => v > 0).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(' + ')}`}
                                color="warning" variant="outlined" />
                        )}
                        {Object.entries(balanceByCurrency).filter(([, v]) => v < 0).length > 0 && (
                            <Chip size="small"
                                label={`Preplatok: ${Object.entries(balanceByCurrency).filter(([, v]) => v < 0).map(([c, v]) => `${Math.abs(v).toFixed(2)} ${c}`).join(' + ')}`}
                                color="success" variant="outlined" />
                        )}
                    </Stack>

                    {/* Bezplatne poskytnuté jedlá + auto-stravné */}
                    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
                            Poskytnuté bezplatne:
                        </Typography>
                        {(['freeRanajky', 'freeObed', 'freeVecera'] as const).map(field => (
                            <FormControlLabel key={field}
                                control={
                                    <Checkbox size="small"
                                        checked={form[field] !== false}
                                        onChange={e => set(field, e.target.checked ? null : false)} />
                                }
                                label={field === 'freeRanajky' ? 'Raňajky' : field === 'freeObed' ? 'Obed' : 'Večera'}
                                sx={{ mr: 0 }}
                            />
                        ))}
                        {Object.keys(netStravneByCurrency).length > 0 && (
                            <Chip size="small" variant="outlined" color="info"
                                label={`Stravné po krátení: ${Object.entries(netStravneByCurrency).map(([c, amt]) => `${amt.toFixed(2)} ${c}`).join(' + ')}`}
                                sx={{ ml: 1 }}
                            />
                        )}
                    </Stack>

                    {/* Prepočet cudzích mien na EUR */}
                    {foreignCurrencies.length > 0 && (
                        <Stack sx={{ gap: 1 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox size="small"
                                        checked={!!form.useExchangeRates}
                                        onChange={e => {
                                            const on = e.target.checked
                                            set('useExchangeRates', on || null)
                                            if (on && !form.exchangeRateDate) {
                                                const dep = form.trips?.[0]?.departureDate
                                                if (dep) {
                                                    const d = new Date(dep)
                                                    d.setDate(d.getDate() - 1)
                                                    set('exchangeRateDate', d.toISOString().split('T')[0])
                                                }
                                            }
                                        }} />
                                }
                                label="Prepočítať cudzie meny na EUR (kurz NBS)"
                            />
                            {form.useExchangeRates && (
                                <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center', pl: 3.5 }}>
                                    <TextField label="Dátum kurzu NBS" type="date" size="small" sx={{ width: 175 }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={form.exchangeRateDate ?? ''}
                                        onChange={e => set('exchangeRateDate', e.target.value || null)} />
                                    {foreignCurrencies.map(currency => (
                                        <TextField key={currency}
                                            label={`1 EUR = ? ${currency}`}
                                            type="number" size="small" sx={{ width: 155 }}
                                            value={form.exchangeRates?.[currency] ?? ''}
                                            onChange={e => set('exchangeRates', {
                                                ...form.exchangeRates,
                                                [currency]: e.target.value ? Number(e.target.value) : undefined,
                                            } as Record<string, number>)} />
                                    ))}
                                </Stack>
                            )}
                        </Stack>
                    )}
                    <Stack direction="row" sx={{ gap: 1.5 }}>
                        <TextField select label="Stav" size="small" sx={{ width: 160 }}
                            value={form.status}
                            onChange={e => set('status', e.target.value)}>
                            {STATUS_OPTIONS.map(o => (
                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                            ))}
                        </TextField>
                        <TextField label="Poznámky" fullWidth size="small"
                            value={form.notes ?? ''}
                            onChange={e => set('notes', e.target.value)} />
                    </Stack>
                    <FormControlLabel
                        control={
                            <Checkbox size="small"
                                checked={form.includeAccounting !== false}
                                onChange={e => set('includeAccounting', e.target.checked ? null : false)} />
                        }
                        label="Zahrnúť vyúčtovanie do PDF"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox size="small"
                                checked={form.includeAdminFields !== false}
                                onChange={e => set('includeAdminFields', e.target.checked ? null : false)} />
                        }
                        label="Zobraziť administratívne polia (os. číslo, útvar, tel., prac. čas, spolucestujúci)"
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Zrušiť</Button>
                <Button variant="contained" onClick={handleSave}
                    disabled={saving || !form.employee.trim() ||
                              !form.trips?.length || !form.trips[0]?.destination.trim()}>
                    {saving ? 'Ukladám…' : 'Uložiť'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

// ── TravelOrdersWidget ────────────────────────────────────────────────────────

export const TravelOrdersWidget = ({
    orders, loading, onAdd, onUpdate, onDelete, onGeneratePdf, readOnly = false,
    ratesHistory: ratesProp, onRatesChange,
    employees = [], onEmployeeCreate, onEmployeeUpdate, onEmployeeDelete,
}: TravelOrdersWidgetProps) => {
    const [dialog, setDialog] = useState<{ isNew: boolean; form: TravelOrderInput; id?: TravelOrder['id'] } | null>(null)
    const [ratesOpen, setRatesOpen] = useState(false)
    const [empOpen, setEmpOpen] = useState(false)
    const effectiveRates = ratesProp ?? DEFAULT_STRAVNE_RATES

    const openNew  = () => setDialog({ isNew: true, form: emptyForm() })
    const openEdit = (row: TravelOrder) => {
        const { id: _id, createdAt: _c, ...rest } = row
        const form: TravelOrderInput = {
            ...rest as TravelOrderInput,
            advances: rest.advances ?? (rest.advanceAmount ? [{ amount: rest.advanceAmount, currency: rest.currency || 'EUR' }] : null),
        }
        setDialog({ isNew: false, form, id: row.id })
    }

    const handleSave = async (data: TravelOrderInput) => {
        if (dialog!.isNew) await onAdd(data)
        else               await onUpdate(dialog!.id!, data)
        setDialog(null)
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <CircularProgress />
            </Box>
        )
    }

    const count = orders.length
    const countLabel = count === 1 ? 'príkaz' : count < 5 ? 'príkazy' : 'príkazov'

    return (
        <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Cestovné príkazy</Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {count} {countLabel}
                    </Typography>
                    {onEmployeeCreate && (
                        <Button size="small" variant="outlined" onClick={() => setEmpOpen(true)}>
                            Zamestnanci
                        </Button>
                    )}
                    {onRatesChange && (
                        <Button size="small" variant="outlined" onClick={() => setRatesOpen(true)}>
                            Sadzby stravného
                        </Button>
                    )}
                    {!readOnly && (
                        <Button variant="contained" startIcon={<Add />} size="small" onClick={openNew}>
                            Nový príkaz
                        </Button>
                    )}
                </Stack>
            </Stack>

            {orders.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                    <Typography sx={{ color: 'text.secondary' }}>Zatiaľ žiadne cestovné príkazy.</Typography>
                </Paper>
            ) : (
                <Paper sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Zamestnanec</TableCell>
                                <TableCell>Destinácia</TableCell>
                                <TableCell>Odchod</TableCell>
                                <TableCell>Návrat</TableCell>
                                <TableCell>Doprava</TableCell>
                                <TableCell align="right">Záloha</TableCell>
                                <TableCell align="right">Spolu</TableCell>
                                <TableCell>Stav</TableCell>
                                <TableCell align="right">Akcie</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {orders.map(r => {
                                const s = STATUS_MAP[r.status] ?? { label: r.status, color: 'default' as const }
                                const rowCarKm = (() => {
                                    const t = (r.trips ?? []).flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
                                    return t > 0 ? t : (r.distanceKm ?? 0)
                                })()
                                const fuelCost    = rowCarKm && r.fuelConsumption && r.fuelPricePerLiter
                                    ? calcFuelCost(rowCarKm, r.fuelConsumption, r.fuelPricePerLiter) : 0
                                const amort       = rowCarKm ? calcAmortization(rowCarKm, 'car') : 0
                                const depStr      = [r.departureDate ? fmtDate(r.departureDate) : null, r.departureTime].filter(Boolean).join(' ')
                                const retDate     = r.trips?.length ? r.trips[r.trips.length - 1].returnDate : r.returnDate
                                const retStr      = retDate ? fmtDate(retDate) : '—'
                                const destination = r.trips?.length
                                    ? r.trips.map(t => t.destination).join(' / ')
                                    : r.destination
                                const stravneMap: Record<string, number> = {}
                                for (const t of r.trips ?? []) {
                                    for (const ds of calcDailyStravne(t.segments, effectiveRates)) {
                                        stravneMap[ds.currency] = (stravneMap[ds.currency] ?? 0) + ds.stravne
                                    }
                                }
                                const hasSegs = Object.keys(stravneMap).length > 0
                                const totalsMap: Record<string, number> = { ...stravneMap }
                                // palivo + amortizácia vždy EUR
                                totalsMap['EUR'] = (totalsMap['EUR'] ?? 0) + fuelCost + amort
                                // iné výdavky + ručné stravné (iba ak nie sú segmenty) v hlavnej mene
                                const mainCur = r.currency || 'EUR'
                                totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.actualExpenses ?? 0)
                                if (!hasSegs) totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.stravneAmount ?? 0)
                                // výdavky zo segmentov per currency
                                for (const t of r.trips ?? []) {
                                    for (const seg of t.segments) {
                                        for (const exp of seg.expenses ?? []) {
                                            const c = exp.currency || 'EUR'
                                            totalsMap[c] = (totalsMap[c] ?? 0) + (exp.amount ?? 0)
                                        }
                                    }
                                }
                                const totalParts = Object.entries(totalsMap)
                                    .filter(([, amt]) => amt > 0)
                                    .map(([c, amt]) => `${amt.toFixed(2)} ${c}`)
                                return (
                                    <TableRow key={r.id} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{r.employee}</TableCell>
                                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {destination}
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{depStr || '—'}</TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{retStr}</TableCell>
                                        <TableCell>
                                            {transportShort(r.transportType)}
                                            {r.distanceKm != null && ` ${r.distanceKm} km`}
                                        </TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                            {r.advances?.length
                                                ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
                                                : fmtAmt(r.advanceAmount, r.currency)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                                            {totalParts.length ? totalParts.join(' + ') : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={s.label} color={s.color} size="small" />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 0.5 }}>
                                                {onGeneratePdf && (
                                                    <Tooltip title="Generovať PDF">
                                                        <IconButton size="small" color="primary" onClick={() => onGeneratePdf(r)}>
                                                            <PictureAsPdf fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {!readOnly && (
                                                    <>
                                                        <Tooltip title="Upraviť">
                                                            <IconButton size="small" onClick={() => openEdit(r)}>
                                                                <Edit fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Vymazať">
                                                            <IconButton size="small" color="error" onClick={() => onDelete(r.id)}>
                                                                <Delete fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {dialog && (
                <OrderDialog
                    initial={dialog.form}
                    isNew={dialog.isNew}
                    ratesHistory={effectiveRates}
                    employees={employees}
                    onSave={handleSave}
                    onClose={() => setDialog(null)}
                />
            )}
            {empOpen && onEmployeeCreate && onEmployeeUpdate && onEmployeeDelete && (
                <EmployeesDialog
                    employees={employees}
                    onCreate={onEmployeeCreate}
                    onUpdate={onEmployeeUpdate}
                    onDelete={onEmployeeDelete}
                    onClose={() => setEmpOpen(false)}
                />
            )}
            {ratesOpen && (
                <RatesDialog
                    history={effectiveRates}
                    onSave={r => { onRatesChange?.(r); setRatesOpen(false) }}
                    onClose={() => setRatesOpen(false)}
                />
            )}
        </Box>
    )
}
