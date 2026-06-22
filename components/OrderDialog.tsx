import { Fragment, useMemo, useRef, useState } from 'react'
import {
    AppBar, Autocomplete, Box, Button, Card, CardContent, Checkbox, CircularProgress,
    Chip, Dialog, Divider, FormControlLabel, IconButton, MenuItem,
    Paper, Stack, Step, StepLabel, Stepper, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material'
import { Add, ArrowBack, CheckCircle, Delete, DirectionsCar, Edit, Explore, FlagOutlined, Person, Restaurant } from '@mui/icons-material'
import type { TravelOrderInput, Trip, TripSegment, StravneRates, EmployeeRecord, TravelPreferences } from '../types'
import { DEFAULT_TRAVEL_PREFERENCES } from '../types'
import { TRANSPORT_OPTIONS, STATUS_OPTIONS, CITY_SUGGESTIONS, PURPOSE_SUGGESTIONS, COUNTRY_OPTIONS_EXTENDED } from '../constants'
import {
    calcFuelCost, calcAmortization, calcDailyStravne,
    getRatesForDate, getAllCountries,
    emptyTrip, fmtDate, calcSegStravne,
} from '../helpers'
import { calcOsmDistanceByCountry } from '../utils/osmDistance'
import SegmentEditor from './SegmentEditor'
import TimePickerField from './TimePickerField'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type DialogProps = {
    initial: TravelOrderInput
    isNew: boolean
    ratesHistory: StravneRates
    employees: EmployeeRecord[]
    preferences?: TravelPreferences
    onSave: (data: TravelOrderInput) => Promise<void>
    onClose: () => void
}

const STEPS = ['Zamestnanec', 'Cesta', 'Doprava', 'Náhrady', 'Súhrn']

const sxCard = {
    borderRadius: '20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    mb: 2,
} as const

type SummaryCardProps = {
    icon: React.ReactNode
    iconColor: string
    iconBg: string
    label: string
    children: React.ReactNode
    onEdit?: () => void
}

const SummaryCard = ({ icon, iconColor, iconBg, label, children, onEdit }: SummaryCardProps) => (
    <Card sx={{ ...sxCard, mb: 1.5 }}>
        <CardContent sx={{ pb: '12px !important', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{
                width: 44, height: 44, borderRadius: '14px', flexShrink: 0, mt: 0.25,
                bgcolor: iconBg, color: iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>{label}</Typography>
                {children}
            </Box>
            {onEdit && (
                <IconButton size="small" onClick={onEdit} sx={{ color: 'text.secondary', mt: -0.5, flexShrink: 0 }}>
                    <Edit fontSize="small" />
                </IconButton>
            )}
        </CardContent>
    </Card>
)


// ── Live preview panel ───────────────────────────────────────────────────────

type PreviewProps = {
    form: TravelOrderInput
    fuelCost: number | null
    amortization: number | null
    totalsByCurrency: Record<string, number>
    advanceByCurrency: Record<string, number>
    balanceByCurrency: Record<string, number>
    ratesHistory: StravneRates
    mult: number
}

const PreviewPanel = ({ form, fuelCost, amortization, totalsByCurrency, advanceByCurrency, balanceByCurrency, ratesHistory, mult }: PreviewProps) => {
    const trips = form.trips ?? []
    const transportLabel = TRANSPORT_OPTIONS.find(o => o.value === form.transportType)?.label ?? '—'
    const totalCar = (fuelCost ?? 0) + (amortization ?? 0)

    return (
        <Box sx={{ p: 2.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 2 }}>
                Náhľad príkazu
            </Typography>

            {form.employee && (
                <SummaryCard icon={<Person />} iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.12)" label="Zamestnanec">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{form.employee}</Typography>
                    {form.employeeAddress && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{form.employeeAddress}</Typography>
                    )}
                </SummaryCard>
            )}

            {trips.map((trip, ti) => {
                const depLoc = trip.departureLocation ?? null
                const dest   = trip.destination || null
                const route  = depLoc && dest ? `${depLoc} → ${dest}` : dest ?? '—'
                const km     = trip.segments.reduce((sum, s) => sum + (s.km ?? 0), 0)
                const daily  = calcDailyStravne(trip.segments, ratesHistory)
                const stravneByCur: Record<string, number> = {}
                for (const ds of daily)
                    stravneByCur[ds.currency] = +((stravneByCur[ds.currency] ?? 0) + ds.stravne * mult).toFixed(2)
                const d0 = trip.departureDate ? new Date(trip.departureDate) : null
                const d1 = trip.returnDate    ? new Date(trip.returnDate)    : null
                const days = d0 && d1 ? Math.round((d1.getTime() - d0.getTime()) / 86_400_000) + 1 : null
                return (
                    <SummaryCard key={ti} icon={<Explore />} iconColor="#22C55E" iconBg="rgba(34,197,94,0.12)"
                        label={trips.length > 1 ? `Cesta ${ti + 1}` : 'Cesta'}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{route}</Typography>
                        {trip.departureDate && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                {fmtDate(trip.departureDate)}
                                {trip.returnDate && trip.returnDate !== trip.departureDate ? ` – ${fmtDate(trip.returnDate)}` : ''}
                                {days && days > 1 ? ` · ${days} dni` : ''}
                            </Typography>
                        )}
                        {km > 0 && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{km} km</Typography>}
                        {Object.entries(stravneByCur).map(([c, amt]) => (
                            <Typography key={c} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                Stravné: {amt.toFixed(2)} {c}
                            </Typography>
                        ))}
                    </SummaryCard>
                )
            })}

            <SummaryCard icon={<DirectionsCar />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.12)" label="Doprava">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {transportLabel}{form.ecv ? ` · ${form.ecv}` : ''}
                </Typography>
                {totalCar > 0 && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Náhrada: {totalCar.toFixed(2)} EUR</Typography>
                )}
            </SummaryCard>

            {Object.keys(totalsByCurrency).length > 0 && (
                <SummaryCard icon={<Restaurant />} iconColor="#06B6D4" iconBg="rgba(6,182,212,0.12)" label="Predpoklad náhrad">
                    {Object.entries(totalsByCurrency).map(([c, amt]) => (
                        <Typography key={c} variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>{amt.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(advanceByCurrency).map(([c, amt]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Záloha: {amt.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(balanceByCurrency).filter(([, v]) => v > 0).map(([c, v]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'warning.main', display: 'block' }}>Doplatok: {v.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(balanceByCurrency).filter(([, v]) => v < 0).map(([c, v]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'success.main', display: 'block' }}>Preplatok: {Math.abs(v).toFixed(2)} {c}</Typography>
                    ))}
                </SummaryCard>
            )}
        </Box>
    )
}

// ── Main dialog ──────────────────────────────────────────────────────────────

const OrderDialog = ({ initial, isNew, ratesHistory, employees, preferences, onSave, onClose }: DialogProps) => {
    const prefs = preferences ?? DEFAULT_TRAVEL_PREFERENCES
    const [form, setForm] = useState<TravelOrderInput>(initial)
    const [saving, setSaving] = useState(false)
    const [loadingKmTi, setLoadingKmTi] = useState<number | null>(null)
    const [loadingGenTi, setLoadingGenTi] = useState<number | null>(null)
    const [activeStep, setActiveStep] = useState(0)
    const scrollRef = useRef<HTMLDivElement>(null)

    const set = <K extends keyof TravelOrderInput>(field: K, value: TravelOrderInput[K]) =>
        setForm(f => ({ ...f, [field]: value }))

    // ── Computed values ──────────────────────────────────────────────────────

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
        const aRate = getRatesForDate(ratesHistory, form.departureDate).amortizationRate
        return calcAmortization(effectiveCarKm, 'car', aRate)
    }, [effectiveCarKm, form.applyAmortization, form.departureDate, ratesHistory])

    const allCountries = useMemo(() => getAllCountries(ratesHistory), [ratesHistory])
    const allExtendedCountries = useMemo(() => {
        const codes = new Set(allCountries.map(c => c.code))
        return [...allCountries, ...COUNTRY_OPTIONS_EXTENDED.filter(c => !codes.has(c.code))]
    }, [allCountries])

    const foreignCurrencies = useMemo(() => {
        const countries = [...new Set(
            (form.trips ?? []).flatMap(t => t.segments)
                .map(s => s.country ?? 'SK')
                .filter(c => c !== 'SK')
        )]
        const curs = countries
            .map(c => allCountries.find(o => o.code === c)?.currency ?? 'EUR')
            .filter(c => c !== 'EUR')
        return [...new Set(curs)]
    }, [form.trips, allCountries])

    const mult = form.stravneMultiplier ?? 1

    const segStravneByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        for (const t of form.trips ?? [])
            for (const ds of calcDailyStravne(t.segments, ratesHistory))
                map[ds.currency] = (map[ds.currency] ?? 0) + ds.stravne
        for (const c of Object.keys(map)) map[c] = +(map[c] * mult).toFixed(2)
        return map
    }, [form.trips, ratesHistory, mult])

    const mealDeductionPct = useMemo(() => {
        const firstDate = form.trips?.[0]?.departureDate ?? new Date().toISOString().split('T')[0]
        const entry = getRatesForDate(ratesHistory, firstDate)
        return (form.freeRanajky ? entry.meals.ranajky : 0)
             + (form.freeObed    ? entry.meals.obed    : 0)
             + (form.freeVecera  ? entry.meals.vecera  : 0)
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
            + (fuelCost ?? 0) + (amortization ?? 0)
            + (form.actualExpenses ?? 0)
        for (const [c, amt] of Object.entries(netStravneByCurrency))
            if (c !== 'EUR') map[c] = (map[c] ?? 0) + amt
        for (const seg of (form.trips ?? []).flatMap(t => t.segments))
            for (const exp of seg.expenses ?? []) {
                const c = exp.currency || 'EUR'
                map[c] = (map[c] ?? 0) + (exp.amount ?? 0)
            }
        return Object.fromEntries(Object.entries(map).filter(([, v]) => v > 0))
    }, [netStravneByCurrency, form.stravneAmount, fuelCost, amortization, form.actualExpenses, form.trips])

    const advanceByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        if (form.advances?.length)
            for (const adv of form.advances) { const c = adv.currency || 'EUR'; map[c] = (map[c] ?? 0) + adv.amount }
        else if (form.advanceAmount)
            map['EUR'] = form.advanceAmount
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

    // ── Trip handlers ────────────────────────────────────────────────────────

    const updateTrip = (ti: number, field: keyof Trip, value: Trip[typeof field]) => {
        const trips = [...(form.trips ?? [])]
        const old = trips[ti]
        const updated: Trip = { ...old, [field]: value }
        if (field === 'departureLocation' && (!old.returnLocation || old.returnLocation === old.departureLocation))
            updated.returnLocation = value as string
        if (field === 'departureDate' && old.returnDate === old.departureDate)
            updated.returnDate = value as string
        trips[ti] = updated
        set('trips', trips)
    }

    const fetchKmByCountry = async (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip?.departureLocation?.trim() || !trip?.destination?.trim()) return
        setLoadingKmTi(ti)
        try {
            const result = await calcOsmDistanceByCountry(trip.departureLocation.trim(), trip.destination.trim())
            if (!result) return
            const kmByCountry: Record<string, number> = {}
            for (const { country, km } of result) kmByCountry[country.toUpperCase()] = km
            const updated = trip.segments.map(seg => {
                const c = (seg.country ?? trip.country ?? 'SK').toUpperCase()
                const km = kmByCountry[c]
                return km != null ? { ...seg, km } : seg
            })
            updateTrip(ti, 'segments', updated)
        } finally {
            setLoadingKmTi(null)
        }
    }

    const generateTripSegments = async (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const trans     = form.transportType ?? 'car'
        const depLoc    = trip.departureLocation ?? ''
        const retLoc    = trip.returnLocation ?? depLoc
        const depDate   = trip.departureDate
        const retDate   = trip.returnDate ?? depDate
        const depTime   = trip.departureTime ?? ''
        const dest      = trip.destination
        const tripCountryCode = trip.country ?? 'SK'
        const destCtry  = allExtendedCountries.find(c => c.code === tripCountryCode) ?? { code: tripCountryCode, label: tripCountryCode, currency: 'EUR', borderPrefix: tripCountryCode }
        const foreign   = destCtry.code !== 'SK'

        const mkSeg = (date: string, from: string, fromTime: string, to: string, toTime = '', segCountry = 'SK', km: number | null = null): TripSegment =>
            ({ date, fromPlace: from, fromTime, toPlace: to, toTime, transport: trans, km, stravne: null, country: segCountry, nbsDate: null })

        const d0 = new Date(depDate), d1 = new Date(retDate)
        const dayDiff = Math.round((d1.getTime() - d0.getTime()) / 86_400_000)
        const midDays: string[] = []
        for (let d = 1; d < dayDiff; d++) {
            const nd = new Date(d0)
            nd.setDate(nd.getDate() + d)
            midDays.push(nd.toISOString().split('T')[0])
        }
        const overnight   = dayDiff >= 1
        const arrToTime   = overnight ? '00:00' : ''
        const retFromTime = overnight ? '00:00' : ''
        const midSegs     = (ctry: string) => midDays.map(date => mkSeg(date, dest, '00:00', dest, '00:00', ctry))

        let segs: TripSegment[]

        if (foreign) {
            // Zisti skutočné tranzitné krajiny cez OSM
            let route: Array<{ country: string; km: number }> | null = null
            if (depLoc.trim() && dest.trim()) {
                setLoadingGenTi(ti)
                try { route = await calcOsmDistanceByCountry(depLoc.trim(), dest.trim()) } catch { /* fallback */ }
            }

            if (route && route.length > 1) {
                // Multi-krajinová trasa — vygeneruj správne hraničné úseky
                const codes = route.map(r => r.country)
                const hr = (a: string, b: string) => `hr. ${a}-${b}`

                const outSegs = route.map(({ country, km }, i) =>
                    mkSeg(depDate,
                        i === 0 ? depLoc : hr(codes[i - 1], codes[i]),
                        i === 0 ? depTime : '',
                        i === codes.length - 1 ? dest : hr(codes[i], codes[i + 1]),
                        i === codes.length - 1 ? arrToTime : '',
                        country, km))

                const retSegs = [...route].reverse().map(({ country, km }, i) => {
                    const rev = [...codes].reverse()
                    return mkSeg(retDate,
                        i === 0 ? dest : hr(rev[i - 1], rev[i]),
                        i === 0 ? retFromTime : '',
                        i === rev.length - 1 ? retLoc : hr(rev[i], rev[i + 1]),
                        '',
                        country, km)
                })

                segs = [...outSegs, ...midSegs(destCtry.code), ...retSegs]
            } else {
                // Fallback: jedna zahraničná krajina alebo OSM zlyhalo
                const bp = destCtry.borderPrefix
                const kmSK  = route?.find(r => r.country === 'SK')?.km ?? null
                const kmDst = route?.find(r => r.country === destCtry.code)?.km ?? null
                segs = [
                    mkSeg(depDate, depLoc,         depTime,      `hr. SK-${bp}`, '',        'SK',          kmSK),
                    mkSeg(depDate, `hr. SK-${bp}`, '',            dest,          arrToTime, destCtry.code, kmDst),
                    ...midSegs(destCtry.code),
                    mkSeg(retDate, dest,           retFromTime,  `hr. ${bp}-SK`, '',        destCtry.code, kmDst),
                    mkSeg(retDate, `hr. ${bp}-SK`, '',            retLoc,        '',        'SK',          kmSK),
                ]
            }
        } else {
            segs = [
                mkSeg(depDate, depLoc, depTime,     dest,   arrToTime, 'SK'),
                ...midSegs('SK'),
                mkSeg(retDate, dest,   retFromTime, retLoc, '',        'SK'),
            ]
        }

        const trips = [...(form.trips ?? [])]
        trips[ti] = {
            ...trip,
            segments: segs.map(s => ({
                ...s,
                stravne: calcSegStravne(s.fromTime, s.toTime, s.country ?? 'SK', getRatesForDate(ratesHistory, s.date)),
            })),
        }
        set('trips', trips)
        setLoadingGenTi(null)
    }

    const removeTrip = (ti: number) => {
        const trips = [...(form.trips ?? [])]
        trips.splice(ti, 1)
        set('trips', trips.length ? trips : null)
    }

    const addTrip = () => {
        const loc = employees.find(e => e.name === form.employee)?.defaultLocation ?? ''
        const trips0 = form.trips ?? []
        const lastTrip = trips0[trips0.length - 1]
        const date = lastTrip?.returnDate || form.departureDate || new Date().toISOString().split('T')[0]
        const trip = emptyTrip(date, form.transportType ?? 'car')
        if (loc) { trip.departureLocation = loc; trip.returnLocation = loc }
        set('trips', [...(form.trips ?? []), trip])
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    const handleSave = async (statusOverride?: string) => {
        if (!form.employee.trim() || !form.trips?.length || !form.trips[0].destination.trim()) return
        setSaving(true)
        const advanceAmount = form.advances?.length
            ? (form.advances.find(a => (a.currency || 'EUR') === 'EUR')?.amount ?? form.advances[0]?.amount ?? 0)
            : form.advanceAmount
        const saved = {
            ...form,
            advanceAmount,
            status: statusOverride ?? form.status,
            departureDate: form.trips[0].departureDate || form.departureDate,
            destination:   form.trips.map(t => t.destination).join(' / '),
        }
        try { await onSave(saved) } finally { setSaving(false) }
    }

    const goTo = (step: number) => {
        setActiveStep(step)
        setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 0)
    }

    const canNext = (() => {
        if (activeStep === 0) return form.employee.trim().length > 0
        if (activeStep === 1) return (form.trips?.length ?? 0) > 0 && (form.trips?.[0]?.destination?.trim().length ?? 0) > 0
        return true
    })()

    const canSave = form.employee.trim().length > 0 && (form.trips?.[0]?.destination?.trim().length ?? 0) > 0

    // ── Step 0: Zamestnanec ──────────────────────────────────────────────────

    const renderStep0 = () => (
        <Card sx={sxCard}>
            <CardContent>
                <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                    Zamestnanec
                </Typography>
                <Stack sx={{ gap: 2.5, mt: 1.5 }}>
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
                                if (val.defaultLocation) {
                                    const loc = val.defaultLocation
                                    set('departureLocation', loc)
                                    set('trips', (form.trips ?? []).map(t => ({
                                        ...t,
                                        departureLocation: t.departureLocation || loc,
                                        returnLocation:    t.returnLocation    || loc,
                                    })))
                                }
                                if (val.defaultFuelConsumption != null) {
                                    set('fuelConsumption', val.defaultFuelConsumption)
                                    set('transportType', 'car')
                                    set('isElectric', val.defaultIsElectric ?? null)
                                } else {
                                    set('transportType', 'company_car')
                                    set('isElectric', null)
                                }
                                set('ecv', val.defaultEcv ?? '')
                            }
                        }}
                        renderInput={params => (
                            <TextField {...params} label="Meno a priezvisko" required
                                slotProps={{
                                    ...params.slotProps,
                                    inputLabel: { ...(params.slotProps?.inputLabel as object), shrink: true },
                                }} />
                        )}
                    />
                    <TextField label="Bydlisko" fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                        value={form.employeeAddress ?? ''}
                        onChange={e => set('employeeAddress', e.target.value)} />
                </Stack>
            </CardContent>
        </Card>
    )

    // ── Step 1: Cesta ────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <>
            {(form.trips ?? []).map((trip, ti) => {
                const daily = calcDailyStravne(trip.segments, ratesHistory)
                const foreignDaily = daily.filter(ds => ds.country !== 'SK')
                const firstForeignCur = foreignDaily[0]?.currency ?? 'EUR'
                const vreckoveLimitCur = (firstForeignCur === 'EUR' ||
                    (form.exchangeRates?.[firstForeignCur] != null && form.exchangeRates[firstForeignCur]! > 0))
                    ? 'EUR' : firstForeignCur
                const foreignInLimitCur = foreignDaily.reduce((sum, ds) => {
                    if (vreckoveLimitCur === 'EUR' && ds.currency !== 'EUR') {
                        const r = form.exchangeRates?.[ds.currency]
                        return sum + (r && r > 0 ? ds.stravne / r : ds.stravne)
                    }
                    return sum + ds.stravne
                }, 0)
                const vreckoveLimit = foreignInLimitCur > 0 ? +(foreignInLimitCur * 0.40).toFixed(2) : 0
                const vreckoveSum = trip.segments.flatMap(s => s.expenses ?? [])
                    .filter(e => e.type === 'vreckove')
                    .reduce((sum, e) => {
                        const eCur = e.currency || 'EUR'
                        if (eCur === vreckoveLimitCur) return sum + e.amount
                        if (vreckoveLimitCur === 'EUR' && eCur !== 'EUR') {
                            const r = form.exchangeRates?.[eCur]
                            return sum + (r && r > 0 ? e.amount / r : e.amount)
                        }
                        if (vreckoveLimitCur !== 'EUR' && eCur === 'EUR') {
                            const r = form.exchangeRates?.[vreckoveLimitCur]
                            return sum + (r && r > 0 ? e.amount * r : e.amount)
                        }
                        return sum + e.amount
                    }, 0)
                const fmtV = (n: number) => vreckoveLimitCur === 'EUR'
                    ? `${n.toFixed(2)} €` : `${n.toFixed(2)} ${vreckoveLimitCur}`
                const depLabel = trip.departureLocation || 'Odchod'
                const destLabel = trip.destination || 'Cieľ'

                return (
                    <Card key={ti} sx={sxCard}>
                        <CardContent>
                            {/* Route chip */}
                            <Box sx={{ bgcolor: 'primary.main', borderRadius: '12px', p: 1.75, mb: 2.5 }}>
                                <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.25, color: 'primary.contrastText' }}>
                                    Trasa {(form.trips ?? []).length > 1 ? ti + 1 : ''}
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.2, color: 'primary.contrastText' }}>
                                    {depLabel} → {destLabel}
                                </Typography>
                                {trip.departureDate && (
                                    <Typography variant="caption" sx={{ opacity: 0.75, mt: 0.5, display: 'block', color: 'primary.contrastText' }}>
                                        {fmtDate(trip.departureDate)}
                                        {trip.returnDate && trip.returnDate !== trip.departureDate
                                            ? ` — ${fmtDate(trip.returnDate)}` : ''}
                                    </Typography>
                                )}
                            </Box>

                            <Stack sx={{ gap: 2 }}>
                                {(form.trips ?? []).length > 1 && (
                                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Cesta {ti + 1}</Typography>
                                        <IconButton size="small" color="error" onClick={() => removeTrip(ti)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                )}

                                <Autocomplete
                                    freeSolo
                                    fullWidth
                                    options={[
                                        ...prefs.customPlaces,
                                        ...(CITY_SUGGESTIONS[trip.country ?? 'SK'] ?? []).filter(c => !prefs.customPlaces.includes(c)),
                                    ]}
                                    inputValue={trip.destination}
                                    onInputChange={(_e, val, reason) => {
                                        if (reason === 'reset') return
                                        updateTrip(ti, 'destination', val)
                                    }}
                                    onChange={(_e, val) => {
                                        if (typeof val === 'string') updateTrip(ti, 'destination', val)
                                    }}
                                    filterOptions={(options, { inputValue }) => {
                                        const q = norm(inputValue)
                                        return options.filter(o =>
                                            o !== trip.departureLocation &&
                                            (q === '' || norm(o).includes(q))
                                        )
                                    }}
                                    renderInput={params => (
                                        <TextField {...params} label="Cieľ cesty / miesto rokovania" required fullWidth
                                            slotProps={{
                                                ...params.slotProps,
                                                inputLabel: { ...(params.slotProps?.inputLabel as object), shrink: true },
                                            }} />
                                    )}
                                />

                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                    <Autocomplete
                                        fullWidth
                                        freeSolo
                                        options={allExtendedCountries}
                                        getOptionLabel={o => typeof o === 'string' ? o : (o.currency !== 'EUR' ? `${o.label} (${o.currency})` : o.label)}
                                        value={allExtendedCountries.find(c => c.code === (trip.country ?? 'SK')) ?? (trip.country ?? 'SK')}
                                        onChange={(_e, val) => {
                                            if (!val) return
                                            updateTrip(ti, 'country', typeof val === 'string' ? val.toUpperCase().slice(0, 10) : val.code)
                                        }}
                                        onInputChange={(_e, _val, reason) => {
                                            if (reason === 'clear') updateTrip(ti, 'country', 'SK')
                                        }}
                                        isOptionEqualToValue={(o, v) => typeof v === 'string' ? o.code === v : o.code === v.code}
                                        noOptionsText="Krajina nie je v zozname — zadajte kód ručne (napr. JP)"
                                        renderInput={params => (
                                            <TextField {...params} label="Krajina" fullWidth
                                                slotProps={{ ...params.slotProps, inputLabel: { ...(params.slotProps?.inputLabel as object), shrink: true } }} />
                                        )}
                                    />
                                    <Autocomplete
                                        freeSolo
                                        fullWidth
                                        options={[
                                            ...prefs.customPurposes,
                                            ...PURPOSE_SUGGESTIONS.filter(p => !prefs.customPurposes.includes(p)),
                                        ]}
                                        inputValue={trip.purpose ?? ''}
                                        onInputChange={(_e, val, reason) => {
                                            if (reason === 'reset') return
                                            updateTrip(ti, 'purpose', val)
                                        }}
                                        onChange={(_e, val) => {
                                            if (typeof val === 'string') updateTrip(ti, 'purpose', val)
                                        }}
                                        filterOptions={(options, { inputValue }) => {
                                            const q = norm(inputValue)
                                            return options.filter(o => q === '' || norm(o).includes(q))
                                        }}
                                        renderInput={params => (
                                            <TextField {...params} label="Účel cesty" fullWidth
                                                slotProps={{
                                                    ...params.slotProps,
                                                    inputLabel: { ...(params.slotProps?.inputLabel as object), shrink: true },
                                                }} />
                                        )}
                                    />
                                </Stack>

                                <Autocomplete
                                    freeSolo
                                    fullWidth
                                    options={CITY_SUGGESTIONS['SK']}
                                    inputValue={trip.departureLocation ?? ''}
                                    onInputChange={(_e, val, reason) => {
                                        if (reason === 'reset') return
                                        updateTrip(ti, 'departureLocation', val)
                                    }}
                                    onChange={(_e, val) => {
                                        if (typeof val === 'string') updateTrip(ti, 'departureLocation', val)
                                    }}
                                    filterOptions={(options, { inputValue }) => {
                                        const q = norm(inputValue)
                                        return options.filter(o => q === '' || norm(o).includes(q))
                                    }}
                                    renderInput={params => (
                                        <TextField {...params} label="Miesto odchodu" fullWidth
                                            slotProps={{
                                                ...params.slotProps,
                                                inputLabel: { ...(params.slotProps?.inputLabel as object), shrink: true },
                                            }} />
                                    )}
                                />

                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                    <TextField label="Dátum odchodu" type="date" fullWidth
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.departureDate}
                                        onChange={e => updateTrip(ti, 'departureDate', e.target.value)} />
                                    <TimePickerField label="Čas odchodu"
                                        sx={{ width: { xs: '100%', sm: 140 }, flexShrink: 0 }}
                                        value={trip.departureTime ?? ''}
                                        onChange={v => updateTrip(ti, 'departureTime', v)} />
                                </Stack>

                                <TextField label="Miesto návratu" fullWidth
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    value={trip.returnLocation ?? ''}
                                    onChange={e => updateTrip(ti, 'returnLocation', e.target.value)} />

                                <TextField label="Dátum návratu" type="date" fullWidth
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    value={trip.returnDate ?? ''}
                                    error={!!trip.returnDate && trip.returnDate < trip.departureDate}
                                    helperText={!!trip.returnDate && trip.returnDate < trip.departureDate ? 'Dátum návratu je pred dátumom odchodu' : undefined}
                                    onChange={e => updateTrip(ti, 'returnDate', e.target.value)} />

                                {trip.destination && trip.departureDate && trip.returnDate && (
                                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                                        <Button variant="outlined" size="small" sx={{ borderRadius: '10px' }}
                                            disabled={loadingGenTi === ti}
                                            startIcon={loadingGenTi === ti ? <CircularProgress size={14} /> : undefined}
                                            onClick={async () => {
                                                if (trip.segments.length > 0 && !window.confirm('Prepočítať úseky? Existujúce úseky budú nahradené.')) return
                                                await generateTripSegments(ti)
                                            }}>
                                            {loadingGenTi === ti ? 'Generujem…' : trip.segments.length === 0 ? 'Vygenerovať úseky (tam + pobyt + späť)' : 'Prepočítať úseky'}
                                        </Button>
                                        {trip.segments.length > 0 && trip.departureLocation && (
                                            <Tooltip title="Vzdialenosti vypočítané cez OpenStreetMap / OSRM. © OpenStreetMap contributors (ODbL)">
                                                <span>
                                                    <Button variant="outlined" size="small" sx={{ borderRadius: '10px' }}
                                                        disabled={loadingKmTi === ti}
                                                        startIcon={loadingKmTi === ti ? <CircularProgress size={14} /> : <FlagOutlined />}
                                                        onClick={() => fetchKmByCountry(ti)}>
                                                        {loadingKmTi === ti ? 'Počítam…' : 'Navrhnúť km'}
                                                    </Button>
                                                </span>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                )}

                                <SegmentEditor
                                    segments={trip.segments}
                                    tripDate={trip.departureDate}
                                    transport={form.transportType ?? 'car'}
                                    defaultCountry={trip.country ?? 'SK'}
                                    ratesHistory={ratesHistory}
                                    allCountries={allCountries}
                                    exchangeRates={form.exchangeRates}
                                    onChange={segs => updateTrip(ti, 'segments', segs)}
                                    vreckoveLimit={vreckoveLimit > 0 ? vreckoveLimit : undefined}
                                    vreckoveLimitCur={vreckoveLimitCur}
                                />

                                {daily.length > 0 && (
                                    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stravné:</Typography>
                                        {daily.map((ds, di) => (
                                            <Chip key={di} size="small" variant="outlined" color="info"
                                                label={`${fmtDate(ds.date)} ${ds.country !== 'SK' ? `(${ds.country}) ` : ''}${ds.hours}h → ${(ds.stravne * mult).toFixed(2)} ${ds.currency}`}
                                            />
                                        ))}
                                        {vreckoveLimit > 0 && (
                                            <Chip size="small"
                                                color={vreckoveSum === 0 ? 'default' : vreckoveSum > vreckoveLimit ? 'warning' : 'success'}
                                                label={
                                                    vreckoveSum === 0
                                                        ? `Vreckové: max. ${fmtV(vreckoveLimit)} (§14)`
                                                        : vreckoveSum > vreckoveLimit
                                                            ? `Vreckové ${fmtV(vreckoveSum)} — nadlimit ${fmtV(+(vreckoveSum - vreckoveLimit).toFixed(2))}`
                                                            : `Vreckové: ${fmtV(vreckoveSum)} z max. ${fmtV(vreckoveLimit)}`
                                                }
                                            />
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                )
            })}

            <Button startIcon={<Add />} variant="outlined" fullWidth
                sx={{ borderRadius: '14px', py: 1.5, borderStyle: 'dashed' }}
                onClick={addTrip}>
                Pridať cestu
            </Button>
        </>
    )

    // ── Step 2: Doprava ──────────────────────────────────────────────────────

    const renderStep2 = () => (
        <>
            <Card sx={sxCard}>
                <CardContent>
                    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                        Typ dopravy
                    </Typography>
                    <Stack sx={{ gap: 2.5, mt: 1.5 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' } }}>
                            <TextField select label="Spôsob dopravy" fullWidth
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.transportType ?? 'car'}
                                onChange={e => set('transportType', e.target.value)}>
                                {TRANSPORT_OPTIONS.map(o => (
                                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                ))}
                            </TextField>
                            {autoCarKm != null && (
                                <Chip size="small" label={`${autoCarKm} km`} variant="outlined" sx={{ flexShrink: 0 }} />
                            )}
                        </Stack>

                        {form.transportType === 'car' && (
                            <TextField label="EČV (evidenčné číslo vozidla)" sx={{ maxWidth: 220 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.ecv ?? ''}
                                onChange={e => set('ecv', e.target.value.toUpperCase())} />
                        )}
                    </Stack>
                </CardContent>
            </Card>

            {form.transportType === 'car' && (
                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Náhrada za vozidlo
                        </Typography>
                        <Stack sx={{ gap: 2, mt: 1.5 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, flexWrap: 'wrap' }}>
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
                                <FormControlLabel
                                    control={<Checkbox size="small"
                                        checked={!!form.isElectric}
                                        onChange={e => set('isElectric', e.target.checked ? true : null)} />}
                                    label="Elektromobil (kWh)" />
                            </Stack>

                            {form.applyFuelCost !== false && (
                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                    <TextField
                                        label={form.isElectric ? 'Spotreba (kWh/100km)' : 'Spotreba (l/100km)'}
                                        type="number" fullWidth
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={form.fuelConsumption ?? ''}
                                        onChange={e => set('fuelConsumption', e.target.value ? Number(e.target.value) : undefined)} />
                                    <TextField
                                        label={form.isElectric ? 'Cena el. energie (€/kWh)' : 'Cena PHM (€/l)'}
                                        type="number" fullWidth
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={form.fuelPricePerLiter ?? ''}
                                        onChange={e => set('fuelPricePerLiter', e.target.value ? Number(e.target.value) : undefined)} />
                                </Stack>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {(fuelCost !== null || amortization !== null) && (
                <Card sx={{ ...sxCard, bgcolor: 'action.hover' }}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Prepočet km
                        </Typography>
                        <Stack sx={{ gap: 1, mt: 1 }}>
                            {effectiveCarKm != null && (
                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Celkom km</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{effectiveCarKm} km</Typography>
                                </Stack>
                            )}
                            {amortization != null && amortization > 0 && (
                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Amortizácia</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{amortization.toFixed(2)} EUR</Typography>
                                </Stack>
                            )}
                            {fuelCost != null && (
                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{form.isElectric ? 'Spotreba el. energie' : 'Spotreba PHM'}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{fuelCost.toFixed(2)} EUR</Typography>
                                </Stack>
                            )}
                            <Divider />
                            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>Celkom doprava</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                    {((fuelCost ?? 0) + (amortization ?? 0)).toFixed(2)} EUR
                                </Typography>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </>
    )

    // ── Step 3: Náhrady ──────────────────────────────────────────────────────

    const renderStep3 = () => (
        <>
            <Card sx={sxCard}>
                <CardContent>
                    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                        Stravné
                    </Typography>
                    <Stack sx={{ gap: 2.5, mt: 1.5 }}>
                        <TextField label="Násobok stravného" type="number" sx={{ maxWidth: 180 }}
                            value={form.stravneMultiplier ?? 1}
                            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 0.05, min: 1 } }}
                            helperText="1 = zákonné minimum, napr. 1.5 = 150 %"
                            onChange={e => {
                                const v = Number(e.target.value)
                                set('stravneMultiplier', v && v !== 1 ? v : null)
                            }}
                        />
                        <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                Poskytnuté bezplatne:
                            </Typography>
                            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                                {(['freeRanajky', 'freeObed', 'freeVecera'] as const).map(field => (
                                    <FormControlLabel key={field}
                                        control={<Checkbox size="small" checked={!!form[field]} onChange={e => set(field, e.target.checked)} />}
                                        label={field === 'freeRanajky' ? 'Raňajky' : field === 'freeObed' ? 'Obed' : 'Večera'}
                                        sx={{ mr: 0 }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                        {Object.keys(netStravneByCurrency).length > 0 && (
                            <Chip size="small" variant="outlined" color="info" sx={{ alignSelf: 'flex-start' }}
                                label={`Stravné po krátení: ${Object.entries(netStravneByCurrency).map(([c, amt]) => `${amt.toFixed(2)} ${c}`).join(' + ')}`}
                            />
                        )}
                    </Stack>
                </CardContent>
            </Card>

            <Card sx={sxCard}>
                <CardContent>
                    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                        Zálohy a výdavky
                    </Typography>
                    <Stack sx={{ gap: 2, mt: 1.5 }}>
                        <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            {(form.advances ?? []).map((adv, i) => (
                                <Stack key={i} direction="row" sx={{ gap: 0.5, alignItems: 'flex-end' }}>
                                    <TextField type="number" sx={{ width: 120 }}
                                        label={i === 0 ? 'Záloha' : ' '}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={adv.amount || ''}
                                        onChange={e => set('advances', (form.advances ?? []).map((a, j) => j === i ? { ...a, amount: Number(e.target.value) } : a))} />
                                    <TextField sx={{ width: 68 }}
                                        label={i === 0 ? 'Mena' : ' '}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={adv.currency}
                                        onChange={e => set('advances', (form.advances ?? []).map((a, j) => j === i ? { ...a, currency: e.target.value.toUpperCase() } : a))} />
                                    <IconButton size="small" color="error" sx={{ mb: 0.5 }}
                                        onClick={() => set('advances', (form.advances ?? []).filter((_, j) => j !== i))}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Button size="small" startIcon={<Add />} sx={{ mb: 0.5 }}
                                onClick={() => set('advances', [...(form.advances ?? []), {
                                    amount: 0,
                                    currency: form.advances?.length
                                        ? (Object.keys(netStravneByCurrency).find(c => c !== 'EUR') ?? 'CZK')
                                        : (form.currency || 'EUR'),
                                }])}>
                                {!form.advances?.length ? 'Pridať zálohu' : '+ mena'}
                            </Button>
                        </Stack>

                        <TextField label="Iné výdavky (celkom)" type="number" sx={{ maxWidth: 200 }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={form.actualExpenses ?? ''}
                            onChange={e => set('actualExpenses', e.target.value ? Number(e.target.value) : undefined)} />
                    </Stack>
                </CardContent>
            </Card>

            {foreignCurrencies.length > 0 && (
                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Kurz NBS
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, mb: 1.5 }}>
                            Vyplň pre meny, ktoré chceš prepočítať na EUR
                        </Typography>
                        <Stack sx={{ gap: 1.5 }}>
                            <TextField label="Dátum kurzu NBS" type="date" sx={{ maxWidth: 175 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.exchangeRateDate ?? ''}
                                onChange={e => set('exchangeRateDate', e.target.value || null)} />
                            <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                                {foreignCurrencies.map(currency => (
                                    <TextField key={currency} label={`1 EUR = ? ${currency}`}
                                        type="number" sx={{ maxWidth: 155 }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={form.exchangeRates?.[currency] ?? ''}
                                        onChange={e => set('exchangeRates', {
                                            ...form.exchangeRates,
                                            [currency]: e.target.value ? Number(e.target.value) : undefined,
                                        } as Record<string, number>)} />
                                ))}
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            <Card sx={{ ...sxCard, border: '2px solid', borderColor: 'primary.main' }}>
                <CardContent>
                    <Typography variant="overline" sx={{ color: 'primary.main', letterSpacing: 1.5 }}>
                        Predpoklad náhrad
                    </Typography>
                    <Stack sx={{ gap: 1, mt: 1.5 }}>
                        {Object.entries(netStravneByCurrency).map(([c, amt]) => (
                            <Stack key={c} direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Stravné ({c})</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{amt.toFixed(2)} {c}</Typography>
                            </Stack>
                        ))}
                        {(fuelCost != null || amortization != null) && (
                            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Doprava</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{((fuelCost ?? 0) + (amortization ?? 0)).toFixed(2)} EUR</Typography>
                            </Stack>
                        )}
                        {(form.actualExpenses ?? 0) > 0 && (
                            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Iné výdavky</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{form.actualExpenses!.toFixed(2)} EUR</Typography>
                            </Stack>
                        )}
                        {Object.entries(totalsByCurrency).map(([c, amt]) => (
                            <Stack key={c} direction="row" sx={{ justifyContent: 'space-between', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>Celkom ({c})</Typography>
                                <Typography variant="body1" sx={{ fontWeight: 800, color: 'primary.main' }}>{amt.toFixed(2)} {c}</Typography>
                            </Stack>
                        ))}
                        {Object.entries(balanceByCurrency).filter(([, v]) => v > 0).map(([c, v]) => (
                            <Stack key={c} direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'warning.main' }}>Doplatok</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.main' }}>{v.toFixed(2)} {c}</Typography>
                            </Stack>
                        ))}
                        {Object.entries(balanceByCurrency).filter(([, v]) => v < 0).map(([c, v]) => (
                            <Stack key={c} direction="row" sx={{ justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'success.main' }}>Preplatok</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>{Math.abs(v).toFixed(2)} {c}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                </CardContent>
            </Card>
        </>
    )

    // ── Step 4: Súhrn ────────────────────────────────────────────────────────

    const renderStep4 = () => {
        const firstTrip    = form.trips?.[0]
        const lastTrip     = form.trips?.[form.trips.length - 1]
        const destinations = form.trips?.map(t => t.destination).filter(Boolean).join(' / ') || '—'

        return (
            <>
                {/* Success header */}
                <Box sx={{ textAlign: 'center', pt: 3, pb: 2.5 }}>
                    <Box sx={{
                        width: 80, height: 80, borderRadius: '50%',
                        bgcolor: 'rgba(34,197,94,0.12)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        mb: 2,
                    }}>
                        <CheckCircle sx={{ fontSize: 48, color: '#22C55E' }} />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
                        Príkaz je pripravený na odoslanie
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 300, mx: 'auto' }}>
                        Skontrolujte údaje a odošlite príkaz na schválenie.
                    </Typography>
                </Box>

                <SummaryCard icon={<Person />} iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.12)"
                    label="Zamestnanec" onEdit={() => goTo(0)}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{form.employee || '—'}</Typography>
                    {form.employeeAddress && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{form.employeeAddress}</Typography>}
                </SummaryCard>

                <SummaryCard icon={<Explore />} iconColor="#22C55E" iconBg="rgba(34,197,94,0.12)"
                    label="Cesta" onEdit={() => goTo(1)}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{destinations}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {firstTrip ? fmtDate(firstTrip.departureDate) : '—'}
                        {lastTrip?.returnDate && lastTrip.returnDate !== firstTrip?.departureDate
                            ? ` — ${fmtDate(lastTrip.returnDate)}` : ''}
                    </Typography>
                    {firstTrip?.purpose && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Účel: {firstTrip.purpose}</Typography>
                    )}
                </SummaryCard>

                <SummaryCard icon={<DirectionsCar />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.12)"
                    label="Doprava" onEdit={() => goTo(2)}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {TRANSPORT_OPTIONS.find(o => o.value === form.transportType)?.label ?? '—'}
                        {form.ecv ? ` · ${form.ecv}` : ''}
                    </Typography>
                    {effectiveCarKm != null && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{effectiveCarKm} km</Typography>
                    )}
                </SummaryCard>

                <SummaryCard icon={<Restaurant />} iconColor="#06B6D4" iconBg="rgba(6,182,212,0.12)"
                    label="Predpoklad náhrad" onEdit={() => goTo(3)}>
                    {Object.entries(totalsByCurrency).map(([c, amt]) => (
                        <Typography key={c} variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>{amt.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(advanceByCurrency).map(([c, amt]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Záloha: {amt.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(balanceByCurrency).filter(([, v]) => v > 0).map(([c, v]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'warning.main', display: 'block' }}>Doplatok: {v.toFixed(2)} {c}</Typography>
                    ))}
                    {Object.entries(balanceByCurrency).filter(([, v]) => v < 0).map(([c, v]) => (
                        <Typography key={c} variant="caption" sx={{ color: 'success.main', display: 'block' }}>Preplatok: {Math.abs(v).toFixed(2)} {c}</Typography>
                    ))}
                </SummaryCard>

                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>Nastavenia</Typography>
                        <Stack sx={{ gap: 2, mt: 1.5 }}>
                            <TextField select label="Stav" sx={{ maxWidth: 180 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.status}
                                onChange={e => set('status', e.target.value)}>
                                {STATUS_OPTIONS.map(o => (
                                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                ))}
                            </TextField>
                            <TextField label="Poznámky" fullWidth multiline rows={2}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.notes ?? ''}
                                onChange={e => set('notes', e.target.value)} />
                            <Stack>
                                <FormControlLabel
                                    control={<Checkbox size="small" checked={!!form.includeAccounting}
                                        onChange={e => set('includeAccounting', e.target.checked)} />}
                                    label="Zahrnúť vyúčtovanie do PDF" />
                                <FormControlLabel
                                    control={<Checkbox size="small" checked={!!form.includeAdminFields}
                                        onChange={e => set('includeAdminFields', e.target.checked)} />}
                                    label="Zobraziť administratívne polia" />
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            </>
        )
    }

    const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

    // ── Step dots (mobile / tablet) ──────────────────────────────────────────

    const StepDots = () => (
        <Box sx={{ px: 2, pb: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 0.75 }}>
                {STEPS.map((_, i) => (
                    <Fragment key={i}>
                        <Box
                            onClick={() => { if (i < activeStep) goTo(i) }}
                            sx={{
                                width: 26, height: 26, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: i <= activeStep ? 'primary.main' : 'action.disabledBackground',
                                color: i <= activeStep ? 'primary.contrastText' : 'text.disabled',
                                fontSize: 12, fontWeight: 700, flexShrink: 0,
                                opacity: i > activeStep ? 0.4 : 1,
                                cursor: i < activeStep ? 'pointer' : 'default',
                                transition: 'all .2s',
                            }}
                        >
                            {i + 1}
                        </Box>
                        {i < STEPS.length - 1 && (
                            <Box sx={{
                                flex: 1, height: 2, mx: 0.5,
                                bgcolor: i < activeStep ? 'primary.main' : 'action.disabledBackground',
                                transition: 'background-color .3s',
                            }} />
                        )}
                    </Fragment>
                ))}
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Krok {activeStep + 1} z {STEPS.length} — {STEPS[activeStep]}
            </Typography>
        </Box>
    )

    // ── Footer ───────────────────────────────────────────────────────────────

    const FooterButtons = () => (
        <Paper elevation={4} square
            sx={theme => ({
                px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0,
                bgcolor: 'background.paper',
                backgroundImage: theme.palette.mode === 'dark'
                    ? 'linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09))'
                    : 'none',
            })}>
            <Stack direction="row" sx={{ gap: 1.5 }}>
                <Button variant="outlined"
                    onClick={() => goTo(activeStep - 1)}
                    disabled={activeStep === 0 || saving}
                    sx={{ flex: 1, borderRadius: '12px', py: 1.2 }}>
                    Späť
                </Button>
                {activeStep < STEPS.length - 1 ? (
                    <Button variant="contained"
                        onClick={() => goTo(activeStep + 1)}
                        disabled={!canNext}
                        sx={{ flex: 2, borderRadius: '12px', py: 1.2, fontWeight: 700 }}>
                        Pokračovať
                    </Button>
                ) : (
                    <>
                        <Button variant="outlined"
                            onClick={() => handleSave('draft')}
                            disabled={saving || !canSave}
                            sx={{ flex: 1, borderRadius: '12px', py: 1.2 }}>
                            Koncept
                        </Button>
                        <Button variant="contained"
                            onClick={() => handleSave('navrh')}
                            disabled={saving || !canSave}
                            sx={{ flex: 1.5, borderRadius: '12px', py: 1.2, fontWeight: 700 }}>
                            {saving ? 'Ukladám…' : 'Odoslať'}
                        </Button>
                    </>
                )}
            </Stack>
        </Paper>
    )

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <Dialog
            open
            onClose={onClose}
            maxWidth={false}
            slotProps={{
                paper: {
                    sx: {
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        height: '100dvh',
                        maxHeight: '100dvh',
                        m: 0,
                        borderRadius: 0,
                        '@media (min-width: 600px)': {
                            width: '92vw',
                            maxWidth: 900,
                            height: '90vh',
                            maxHeight: '90vh',
                            borderRadius: '20px',
                            m: 'auto',
                        },
                        '@media (min-width: 1024px)': {
                            width: '85vw',
                            maxWidth: 1180,
                            height: '88vh',
                            maxHeight: '88vh',
                        },
                    },
                },
            }}
            sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-start', sm: 'center' } } }}
        >
            {/* ── AppBar ── */}
            <AppBar position="sticky" color="default" elevation={0}
                sx={theme => ({
                    borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
                    bgcolor: 'background.paper',
                    backgroundImage: theme.palette.mode === 'dark'
                        ? 'linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09))'
                        : 'none',
                })}>
                <Toolbar sx={{ gap: 1 }}>
                    <IconButton edge="start" onClick={onClose} disabled={saving}>
                        <ArrowBack />
                    </IconButton>
                    <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, fontSize: 17 }}>
                        {isNew ? 'Nový cestovný príkaz' : 'Upraviť príkaz'}
                    </Typography>
                </Toolbar>

                {/* Compact dots — mobile and tablet */}
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                    <StepDots />
                </Box>

                {/* Full MUI stepper — desktop only */}
                <Box sx={{ display: { xs: 'none', md: 'block' }, px: 3, pb: 2 }}>
                    <Stepper activeStep={activeStep} sx={{ '& .MuiStepLabel-label': { fontSize: 13 } }}>
                        {STEPS.map((label, i) => (
                            <Step key={label}
                                sx={{ cursor: i < activeStep ? 'pointer' : 'default' }}
                                onClick={() => { if (i < activeStep) goTo(i) }}>
                                <StepLabel>{label}</StepLabel>
                            </Step>
                        ))}
                    </Stepper>
                </Box>
            </AppBar>

            {/* ── Content area ── */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                {/* Form — full width on mobile, 70% on tablet, 66% on desktop */}
                <Box
                    ref={scrollRef}
                    sx={{
                        flex: 1,
                        overflowY: 'auto',
                        p: { xs: 2, sm: 3 },
                        maxWidth: { xs: '100%', sm: '70%', md: '66.67%' },
                    }}
                >
                    {stepContent[activeStep]()}
                </Box>

                {/* Preview panel — hidden on mobile, 30% tablet, 34% desktop */}
                <Box sx={theme => ({
                    display: { xs: 'none', sm: 'flex' },
                    flexDirection: 'column',
                    flexShrink: 0,
                    width: { sm: '30%', md: '33.33%' },
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
                    overflowY: 'auto',
                })}>
                    <PreviewPanel
                        form={form}
                        fuelCost={fuelCost}
                        amortization={amortization}
                        totalsByCurrency={totalsByCurrency}
                        advanceByCurrency={advanceByCurrency}
                        balanceByCurrency={balanceByCurrency}
                        ratesHistory={ratesHistory}
                        mult={mult}
                    />
                </Box>
            </Box>

            {/* ── Footer ── */}
            <FooterButtons />
        </Dialog>
    )
}

export default OrderDialog
