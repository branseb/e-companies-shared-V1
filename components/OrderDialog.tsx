import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
    AppBar, Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, CircularProgress,
    Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem,
    Paper, Stack, Step, StepLabel, Stepper, Switch, TextField, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material'
import { Add, ArrowBack, AttachFile, CheckCircle, Delete, DirectionsCar, Edit, ExpandLess, ExpandMore, Explore, FlagOutlined, InfoOutlined, InsertDriveFile, Person, Restaurant } from '@mui/icons-material'
import type { TravelOrderAttachment, TravelOrderInput, Trip, TripSegment, TripWaypoint, StravneRates, EmployeeRecord, TravelPreferences } from '../types'
import { DEFAULT_TRAVEL_PREFERENCES } from '../types'
import { TRANSPORT_OPTIONS, STATUS_OPTIONS, CITY_SUGGESTIONS, PURPOSE_SUGGESTIONS, EXCHANGE_RATE_CATEGORIES } from '../constants'
import {
    calcFuelCost, calcAmortization, calcDailyStravne,
    getRatesForDate, getAllCountries,
    emptyTrip, fmtDate, calcSegStravne, chainForward, chainBackward, minutesBetween,
    findSegmentOverlaps, sameDayWindowMinutes, scaleDurationsToFit, convertToEurIfEnabled,
} from '../helpers'
import { FUEL_TYPE_OPTIONS, getFuelTypeInfo } from '../constants'
import { calcOsmRouteOptions, searchOsmPlaces, type OsmRouteOption, type OsmCountryLeg, type OsmPlaceSuggestion } from '../utils/osmDistance'
import { addDays } from '../utils/date'
import SegmentEditor from './SegmentEditor'
import TimePickerField from './TimePickerField'
import RouteMap from './RouteMap'
import ConfirmDialog from './ConfirmDialog'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Doprava sa dnes volí per cesta (predvolená) a per úsek (skutočná, môže byť
// kombinovaná) - namiesto jedného order-level poľa preto zobrazujeme zoznam
// reálne použitých spôsobov (zo segmentov, ak už boli vygenerované, inak z
// predvolenej dopravy jednotlivých ciest).
const transportSummaryLabel = (trips: Trip[]): string => {
    const values = [...new Set(
        trips.flatMap(t => t.segments?.length ? t.segments.map(s => s.transport) : [t.defaultTransport ?? 'car']),
    )]
    if (!values.length) return '—'
    return values.map(v => TRANSPORT_OPTIONS.find(o => o.value === v)?.label ?? v).join(', ')
}

// Spôsoby dopravy, pri ktorých sa typicky kupuje lístok/letenka (na rozdiel od
// vlastného/firemného auta) - úseky s týmito hodnotami sa ponúkajú v kroku
// "Doprava" na zadanie ceny lístka.
const TICKET_TRANSPORTS = ['train', 'bus', 'plane']

// OSM/OSRM verejný demo server býva pri diaľniciach v strednej Európe
// konzervatívnejší (nepočíta naplno s reálnym rýchlostným limitom), takže
// skúsený vodič trasu bežne stihne aj o niečo rýchlejšie. Okno medzi dvomi
// ručne zadanými časmi príchodu preto smie byť až o toto % kratšie než OSM
// odhad, bez toho aby sa to bralo ako nezmestiteľné.
const ROUTE_DURATION_TOLERANCE = 0.1

// "Prepočítať úseky" celé pole segments zahodí a vygeneruje nanovo - bez
// tohto by sa tak stratili aj ručne zadané výdavky (lístky, nocľažné, ...),
// uložené práve na segmentoch. Spáruje staré a nové úseky podľa dátumu +
// od/kam a prenesie výdavky tam, kde sa úsek nezmenil; vráti aj počet tých,
// čo sa spárovať nedali (napr. lebo sa zmenil čas/trasa), nech sa dá na to
// používateľa upozorniť namiesto tichej straty dát.
const segKey = (s: { date: string; fromPlace: string; toPlace: string }) => `${s.date}|${s.fromPlace}|${s.toPlace}`

const carryOverExpenses = (oldSegs: TripSegment[], newSegs: TripSegment[]): { segs: TripSegment[]; lost: number } => {
    const byKey = new Map<string, NonNullable<TripSegment['expenses']>>()
    for (const s of oldSegs) if (s.expenses?.length) byKey.set(segKey(s), s.expenses)
    if (byKey.size === 0) return { segs: newSegs, lost: 0 }
    const matched = new Set<string>()
    const segs = newSegs.map(s => {
        const expenses = byKey.get(segKey(s))
        if (!expenses) return s
        matched.add(segKey(s))
        return { ...s, expenses }
    })
    const lost = [...byKey.keys()].filter(k => !matched.has(k)).length
    return { segs, lost }
}

type Night = { si: number; date: string }
type NightGroup = { si: number; place: string; dateFrom: string; dateTo: string; count: number; nights: Night[] }

// Noci cesty odvodené priamo z dátumov v úsekoch - každý dátum okrem
// posledného (deň návratu, za ním už v rámci cesty žiadna noc nenasleduje)
// je jedna noc. Miesto noci = toPlace POSLEDNÉHO úseku daného dňa (rovnaký
// princíp ako `lastIdx` v pdf/travelOrderPdf.ts, ktorý tým istým spôsobom
// priraďuje dennú sumu stravného poslednému úseku dňa).
// Zámerne nepočítame len s explicitným "pobytovým" úsekom (rovnaké miesto,
// 00:00-00:00) - ten sa generuje iba pri 2+ nociach na jednom mieste, takže
// by úplne vynechal najbežnejší prípad, jednu noc medzi dvoma jazdnými úsekmi.
//
// Po sebe idúce noci na ROVNAKOM mieste sa zlúčia do jednej skupiny (jeden
// hotel na viac nocí = jedna cena). Ak je každá noc inde, skupiny sa
// nezlúčia - každá zostane samostatná. `nights` v skupine drží aj jednotlivé
// noci (vlastný segment na noc), takže UI vie skupinu na požiadanie
// "rozbaliť" a zadať cenu osobitne pre každý deň (napr. iný hotel/cena
// napriek rovnakému názvu miesta). Súčet v `computeFinancials`/PDF je vždy
// súčet cez všetky úseky, takže je jedno, či je cena na jednom alebo na
// viacerých segmentoch. `dateTo` je dátum poslednej noci - deň odchodu
// (check-out) je o deň neskôr.
const tripNights = (trip: Trip): NightGroup[] => {
    const dates = [...new Set(trip.segments.map(s => s.date))].filter(Boolean).sort()
    if (dates.length < 2) return []
    const lastDate = dates[dates.length - 1]
    const groups: NightGroup[] = []
    for (const date of dates) {
        if (date === lastDate) continue
        let lastIdx = -1
        trip.segments.forEach((s, si) => { if (s.date === date) lastIdx = si })
        if (lastIdx === -1) continue
        const place = trip.segments[lastIdx].toPlace || trip.segments[lastIdx].fromPlace
        const prev = groups[groups.length - 1]
        if (prev && prev.place === place) {
            prev.dateTo = date
            prev.si = lastIdx
            prev.count += 1
            prev.nights.push({ si: lastIdx, date })
        } else {
            groups.push({ si: lastIdx, place, dateFrom: date, dateTo: date, count: 1, nights: [{ si: lastIdx, date }] })
        }
    }
    return groups
}

type DialogProps = {
    initial: TravelOrderInput
    isNew: boolean
    orderId?: string | number
    ratesHistory: StravneRates
    employees: EmployeeRecord[]
    preferences?: TravelPreferences
    approvalMode?: 'preApproval' | 'direct'
    onSave: (data: TravelOrderInput, attachmentTempId: string) => Promise<void>
    onClose: () => void
    onAddAttachment?: (tempId: string) => Promise<TravelOrderAttachment | null>
    onAddAttachmentFromPath?: (tempId: string, filePath: string) => Promise<TravelOrderAttachment | null>
    onDeleteAttachment?: (tempId: string, id: string) => Promise<void>
    onOpenAttachment?: (tempId: string, id: string) => void
    onReadAttachment?: (tempId: string, id: string) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>
    onFetchExchangeRates?: (isoDate: string) => Promise<{ date: string; rates: Record<string, number> } | null>
    onFetchFuelPrice?: (fuelType: string, isoDate: string) => Promise<{ price: number; weekCode: string; weekLabel: string } | null>
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
    restricted: boolean
}

const PreviewPanel = ({ form, fuelCost, amortization, totalsByCurrency, advanceByCurrency, balanceByCurrency, ratesHistory, mult, restricted }: PreviewProps) => {
    const trips = form.trips ?? []
    const transportLabel = transportSummaryLabel(trips)
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
                const stops  = [dest, ...(trip.waypoints ?? []).map(w => w.place)].filter(Boolean)
                const route  = depLoc && stops.length ? `${depLoc} → ${stops.join(' → ')}` : (stops.join(' → ') || '—')
                const km     = trip.segments.reduce((sum, s) => sum + (s.km ?? 0), 0)
                const daily  = calcDailyStravne(trip.segments, ratesHistory)
                const stravneByCur: Record<string, number> = {}
                for (const ds of daily) {
                    const conv = convertToEurIfEnabled(ds.stravne * mult, ds.currency, 'stravne', form.exchangeRates, form.exchangeRateCategories)
                    stravneByCur[conv.currency] = +((stravneByCur[conv.currency] ?? 0) + conv.amount).toFixed(2)
                }
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
                        {!restricted && km > 0 && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{km} km</Typography>}
                        {!restricted && Object.entries(stravneByCur).map(([c, amt]) => (
                            <Typography key={c} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                Stravné: {amt.toFixed(2)} {c}
                            </Typography>
                        ))}
                        {!restricted && trip.routeCoordinates && trip.routeCoordinates.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                                <RouteMap coordinates={trip.routeCoordinates} stops={trip.routeStops ?? undefined} height={110} />
                            </Box>
                        )}
                    </SummaryCard>
                )
            })}

            {!restricted && (
                <SummaryCard icon={<DirectionsCar />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.12)" label="Doprava">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {transportLabel}{form.ecv ? ` · ${form.ecv}` : ''}
                    </Typography>
                    {totalCar > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Náhrada: {totalCar.toFixed(2)} EUR</Typography>
                    )}
                </SummaryCard>
            )}

            {!restricted && Object.keys(totalsByCurrency).length > 0 && (
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

const OrderDialog = ({ initial, isNew, orderId, ratesHistory, employees, preferences, approvalMode = 'direct', onSave, onClose, onAddAttachment, onAddAttachmentFromPath, onDeleteAttachment, onOpenAttachment, onReadAttachment, onFetchExchangeRates, onFetchFuelPrice }: DialogProps) => {
    const isMobile = useMediaQuery('(max-width:599px)')
    const prefs = preferences ?? DEFAULT_TRAVEL_PREFERENCES
    const [form, setForm] = useState<TravelOrderInput>(initial)
    // Režim "preApproval": kým príkaz nie je schválený, formulár ukáže len
    // základné údaje (Zamestnanec, Cesta) - doprava a náhrady sa dopĺňajú
    // až po schválení a návrate z cesty.
    const restricted = approvalMode === 'preApproval' && (form.status === 'draft' || form.status === 'planned')
    const effectiveSteps = restricted ? STEPS.slice(0, 2) : STEPS
    const [saving, setSaving] = useState(false)
    const [loadingKmTi, setLoadingKmTi] = useState<number | null>(null)
    const [loadingGenTi, setLoadingGenTi] = useState<number | null>(null)
    const [routeOptions, setRouteOptions] = useState<{ ti: number; options: OsmRouteOption[] } | null>(null)
    // Kľúčované podľa indexu cesty (`ti`) - príkaz môže mať viac ciest, každá so
    // svojím vlastným poľom "Cieľ cesty" a vlastnými návrhmi.
    const [osmDestSuggestions, setOsmDestSuggestions] = useState<Record<number, OsmPlaceSuggestion[]>>({})
    const destSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // To isté, ale pre rozrobené pole "Ďalší cieľ" v pridávaní zastávky.
    const [waypointOsmSuggestions, setWaypointOsmSuggestions] = useState<Record<number, OsmPlaceSuggestion[]>>({})
    const waypointSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Rozrobená (ešte nepridaná) zastávka za trasu - kľúčované podľa indexu cesty (`ti`).
    const [newWaypointDraft, setNewWaypointDraft] = useState<Record<number, { place: string; date: string; time: string; lat: number | null; lon: number | null }>>({})
    // Či je pre danú cestu (`ti`) rozbalený formulár na pridanie ďalšieho cieľa.
    const [addingWaypointFor, setAddingWaypointFor] = useState<Record<number, boolean>>({})
    // Chyba pri generovaní úsekov - napr. cieľ mimo intervalu odchod-návrat cesty.
    const [waypointTimeErrors, setWaypointTimeErrors] = useState<Record<number, string[]>>({})
    const [activeStep, setActiveStep] = useState(0)
    const scrollRef = useRef<HTMLDivElement>(null)
    const tempIdRef = useRef<string>(isNew ? crypto.randomUUID() : String(orderId ?? crypto.randomUUID()))
    const [attachments, setAttachments] = useState<TravelOrderAttachment[]>([])
    const [addingAttachment, setAddingAttachment] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [collaboratorInput, setCollaboratorInput] = useState('')
    const [previewState, setPreviewState] = useState<{ url: string; mimeType: string; name: string } | null>(null)
    const [collapsedTrips, setCollapsedTrips] = useState<Set<number>>(new Set())
    const [scaledTrips, setScaledTrips] = useState<Set<number>>(new Set())
    // Počet výdavkov (lístky, nocľažné, ...), ktoré sa pri poslednom prepočte
    // úsekov nepodarilo spárovať so starým úsekom, takže sa stratili.
    const [lostExpenses, setLostExpenses] = useState<Record<number, number>>({})
    // Skupiny nocľažného, ktoré si používateľ ručne "rozbalil" na zadanie ceny
    // osobitne pre každú noc namiesto jednej spoločnej sumy - kľúč `${ti}|${dateFrom}`.
    const [expandedNights, setExpandedNights] = useState<Set<string>>(new Set())
    // Meny, pri ktorých je rozbalený detailný výber kategórií na prepočet (šípka).
    const [expandedRateCur, setExpandedRateCur] = useState<Set<string>>(new Set())
    const [rateFetch, setRateFetch] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
    const [fuelPriceFetch, setFuelPriceFetch] = useState<{ loading: boolean; error: string | null; weekLabel?: string }>({ loading: false, error: null })
    const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)

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

    const ticketSegments = useMemo(() => {
        const rows: { ti: number; si: number; seg: TripSegment }[] = []
        ;(form.trips ?? []).forEach((t, ti) => {
            t.segments.forEach((seg, si) => {
                if (TICKET_TRANSPORTS.includes(seg.transport)) rows.push({ ti, si, seg })
            })
        })
        return rows
    }, [form.trips])

    const staySegments = useMemo(() => {
        const rows: ({ ti: number } & NightGroup)[] = []
        ;(form.trips ?? []).forEach((t, ti) => {
            for (const n of tripNights(t)) rows.push({ ti, ...n })
        })
        return rows
    }, [form.trips])

    // Zapíše/aktualizuje jeden konkrétny typ výdavku na danom úseku - používa sa
    // pre rýchle zadanie ceny lístka ("cestovne") aj nocľažného ("noclazne")
    // priamo z prehľadových kariet, bez nutnosti otvárať editor úsekov.
    const updateSegExpense = (ti: number, si: number, expType: string, amount: number, currency: string) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const segs = trip.segments.map((s, idx) => {
            if (idx !== si) return s
            const expenses = s.expenses ?? []
            const expIdx = expenses.findIndex(e => e.type === expType)
            const newExpenses = expIdx >= 0
                ? expenses.map((e, j) => j === expIdx ? { ...e, amount, currency } : e)
                : [...expenses, { type: expType, amount, currency }]
            return { ...s, expenses: newExpenses }
        })
        updateTrip(ti, 'segments', segs)
    }

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
    const countryLabelByCode = useMemo(() => new Map(allCountries.map(c => [c.code, c.label])), [allCountries])

    // Všetky cudzie meny, ktoré sa v CP reálne vyskytujú - odvodené z tej istej
    // funkcie, ktorá reálne počíta stravné (calcDailyStravne), nie znovu cez
    // allCountries.find() - ten je odvodený len z krajín, ktoré má aktuálna
    // zákonná tabuľka sadzieb explicitne pomenované, takže krajina, čo tam chýba,
    // by potichu spadla na EUR a z výberu úplne zmizla. Pridáva aj meny priamo
    // zadané pri výdavku (tá sa môže líšiť, napr. výdavok v USD na úseku v Poľsku).
    const foreignCurrencies = useMemo(() => {
        const dailyCurs = (form.trips ?? []).flatMap(t => calcDailyStravne(t.segments, ratesHistory).map(ds => ds.currency))
        const expenseCurs = (form.trips ?? []).flatMap(t => t.segments).flatMap(s => s.expenses ?? []).map(e => e.currency || 'EUR')
        return [...new Set([...dailyCurs, ...expenseCurs])].filter(c => c !== 'EUR')
    }, [form.trips, ratesHistory])

    // Ktoré kategórie (stravné/cestovné/...) sa pre danú menu v CP reálne
    // vyskytujú - detailný výber v karte "Výmenné kurzy" ponúka len tie, nech
    // tam nevisia prepínače pre kategórie, ktoré v tej mene vôbec nemáš.
    const categoriesByCurrency = useMemo(() => {
        const map: Record<string, Set<string>> = {}
        const add = (cur: string, cat: string) => {
            if (cur === 'EUR') return
            if (!map[cur]) map[cur] = new Set()
            map[cur].add(cat)
        }
        for (const t of form.trips ?? []) {
            for (const ds of calcDailyStravne(t.segments, ratesHistory)) add(ds.currency, 'stravne')
            for (const seg of t.segments)
                for (const exp of seg.expenses ?? [])
                    add(exp.currency || 'EUR', exp.type === 'vreckove' ? 'ine' : (exp.type || 'ine'))
        }
        return map
    }, [form.trips, ratesHistory])

    const earliestDeparture = useMemo(() => {
        const departures = (form.trips ?? []).map(t => t.departureDate).filter(Boolean) as string[]
        return departures.sort()[0] ?? form.departureDate
    }, [form.trips, form.departureDate])

    // Kurz NBS sa pri zmene zahraničných mien alebo dátumu odchodu automaticky
    // prepíše hodnotou zo dňa PRED odchodom (na rozdiel od PHM, ktorá sa berie
    // v deň začiatku cesty). Manuálna úprava kurzu medzitým efekt znovu nespustí.
    useEffect(() => {
        if (!onFetchExchangeRates || foreignCurrencies.length === 0 || !earliestDeparture) return
        const d = new Date(`${earliestDeparture}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() - 1)
        const refDate = d.toISOString().slice(0, 10)

        let cancelled = false
        setRateFetch({ loading: true, error: null })
        onFetchExchangeRates(refDate).then(result => {
            if (cancelled) return
            if (!result) {
                setRateFetch({ loading: false, error: 'Kurz sa nepodarilo načítať (žiadna odpoveď), zadaj ho ručne.' })
                return
            }
            // Funkcionálny update číta AKTUÁLNY f.exchangeRates namiesto zastaraného
            // `form.exchangeRates` zo závierky efektu - inak by ručná úprava kurzu
            // spravená počas čakania na túto odpoveď mohla byť ticho prepísaná.
            setForm(f => ({
                ...f,
                exchangeRateDate: result.date,
                exchangeRates: {
                    ...f.exchangeRates,
                    ...Object.fromEntries(foreignCurrencies
                        .filter(c => result.rates[c] != null)
                        .map(c => [c, result.rates[c]])),
                } as Record<string, number>,
            }))
            const missing = foreignCurrencies.filter(c => result.rates[c] == null)
            setRateFetch({
                loading: false,
                error: missing.length ? `Kurz sa nenašiel pre: ${missing.join(', ')} - zadaj ručne.` : null,
            })
        }).catch(err => {
            if (!cancelled) {
                setRateFetch({ loading: false, error: `Kurz sa nepodarilo načítať: ${err instanceof Error ? err.message : String(err)}` })
            }
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onFetchExchangeRates, foreignCurrencies, earliestDeparture])

    // Cena PHM sa pri zmene druhu paliva alebo dátumu odchodu automaticky
    // prepíše hodnotou zo Štatistického úradu SR (deň začiatku cesty — na
    // rozdiel od kurzu meny, ktorý sa berie zo dňa PRED odchodom).
    // Manuálna úprava poľa medzitým efekt znovu nespustí.
    useEffect(() => {
        if (!onFetchFuelPrice || form.applyFuelCost === false || !earliestDeparture) return
        const fuelType = form.fuelType ?? (form.isElectric ? 'electric' : 'diesel')
        const refDate = earliestDeparture

        let cancelled = false
        setFuelPriceFetch({ loading: true, error: null })
        onFetchFuelPrice(fuelType, refDate).then(result => {
            if (cancelled) return
            if (!result) {
                setFuelPriceFetch({ loading: false, error: 'Cena PHM sa nenašla, zadaj ju ručne.' })
                return
            }
            set('fuelPricePerLiter', result.price)
            set('fuelPriceWeek', result.weekCode)
            setFuelPriceFetch({ loading: false, error: null, weekLabel: result.weekLabel })
        }).catch(err => {
            if (!cancelled) {
                setFuelPriceFetch({ loading: false, error: `Cenu PHM sa nepodarilo načítať: ${err instanceof Error ? err.message : String(err)}` })
            }
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onFetchFuelPrice, form.fuelType, form.isElectric, earliestDeparture, form.applyFuelCost])

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

    // Ak je pre menu zapnutý prepočet danej kategórie (rovnaký prepínač ako v PDF),
    // sumáre nižšie ukazujú už prepočítanú EUR hodnotu, nie pôvodnú cudziu menu.
    const netStravneByCurrency = useMemo(() => {
        const result: Record<string, number> = {}
        for (const [c, amt] of Object.entries(segStravneByCurrency)) {
            const net = +(amt * (1 - mealDeductionPct)).toFixed(2)
            if (net <= 0) continue
            const conv = convertToEurIfEnabled(net, c, 'stravne', form.exchangeRates, form.exchangeRateCategories)
            result[conv.currency] = +((result[conv.currency] ?? 0) + conv.amount).toFixed(2)
        }
        return result
    }, [segStravneByCurrency, mealDeductionPct, form.exchangeRates, form.exchangeRateCategories])

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
                const category = exp.type === 'vreckove' ? 'ine' : (exp.type || 'ine')
                const conv = convertToEurIfEnabled(exp.amount ?? 0, c, category, form.exchangeRates, form.exchangeRateCategories)
                map[conv.currency] = (map[conv.currency] ?? 0) + conv.amount
            }
        return Object.fromEntries(Object.entries(map).filter(([, v]) => v > 0))
    }, [netStravneByCurrency, form.stravneAmount, fuelCost, amortization, form.actualExpenses, form.trips, form.exchangeRates, form.exchangeRateCategories])

    // Zálohy nie sú viazané na kategóriu (nie sú "stravné" ani výdavok úseku) -
    // prepočítajú sa vždy, keď je pre ich menu zadaný kurz (exchangeRateCategories
    // sa tu zámerne neposiela), nech "Doplatok/Preplatok" porovnáva sumy v tej istej mene.
    const advanceByCurrency = useMemo(() => {
        const map: Record<string, number> = {}
        const add = (amount: number, cur: string) => {
            const conv = convertToEurIfEnabled(amount, cur, 'advance', form.exchangeRates, null)
            map[conv.currency] = (map[conv.currency] ?? 0) + conv.amount
        }
        if (form.advances?.length)
            for (const adv of form.advances) add(adv.amount, adv.currency || 'EUR')
        else if (form.advanceAmount)
            add(form.advanceAmount, 'EUR')
        return map
    }, [form.advances, form.advanceAmount, form.exchangeRates])

    const balanceByCurrency = useMemo(() => {
        const allCurs = new Set([...Object.keys(totalsByCurrency), ...Object.keys(advanceByCurrency)])
        const result: Record<string, number> = {}
        for (const c of allCurs) {
            const bal = +((totalsByCurrency[c] ?? 0) - (advanceByCurrency[c] ?? 0)).toFixed(2)
            if (bal !== 0) result[c] = bal
        }
        return result
    }, [totalsByCurrency, advanceByCurrency])

    // ── Collaborators ────────────────────────────────────────────────────────

    const collaboratorList = useMemo(() =>
        form.collaborators?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
    [form.collaborators])

    const addCollaborator = (name: string) => {
        const trimmed = name.trim()
        if (!trimmed || collaboratorList.includes(trimmed)) { setCollaboratorInput(''); return }
        set('collaborators', [...collaboratorList, trimmed].join(', '))
        setCollaboratorInput('')
    }

    const removeCollaborator = (name: string) => {
        const next = collaboratorList.filter(n => n !== name).join(', ')
        set('collaborators', next || null)
    }

    // ── Validation ───────────────────────────────────────────────────────────

    const validateForm = (minimal = false): string[] => {
        const errors: string[] = []
        if (!form.employee.trim()) errors.push('Chýba meno zamestnanca.')
        if (!form.trips?.length) errors.push('Musí byť zadaná aspoň jedna cesta.')
        if (!(form.trips?.[0]?.destination?.trim())) errors.push('Chýba cieľ cesty.')
        for (const [i, trip] of (form.trips ?? []).entries()) {
            if (trip.returnDate && trip.returnDate < trip.departureDate)
                errors.push(`Cesta ${i + 1}: dátum návratu (${trip.returnDate}) je pred dátumom odchodu (${trip.departureDate}).`)
            for (const { date, a, b } of findSegmentOverlaps(trip.segments))
                errors.push(`Cesta ${i + 1}: prekrývajúce sa časy úsekov ${fmtDate(date)} - ${a.fromPlace || '?'}–${a.toPlace || '?'} (${a.fromTime}–${a.toTime}) a ${b.fromPlace || '?'}–${b.toPlace || '?'} (${b.fromTime}–${b.toTime}).`)
            // Zastávky (waypoints) sa overia znova aj tu - nielen pri "Generovať úseky" -
            // lebo dátumy cesty sa mohli zmeniť už po vygenerovaní úsekov, bez opätovného prepočtu.
            const depTime = trip.departureTime, retTime = trip.returnTime
            if (depTime && retTime) {
                const retDate = trip.returnDate ?? trip.departureDate
                for (const wp of trip.waypoints ?? []) {
                    const afterDeparture = minutesBetween(trip.departureDate, depTime, wp.arrivalDate, wp.arrivalTime) >= 0
                    const beforeReturn = minutesBetween(wp.arrivalDate, wp.arrivalTime, retDate, retTime) >= 0
                    if (!afterDeparture || !beforeReturn)
                        errors.push(`Cesta ${i + 1}: cieľ "${wp.place}" (príchod ${fmtDate(wp.arrivalDate)} ${wp.arrivalTime}) je mimo intervalu odchod (${fmtDate(trip.departureDate)} ${depTime}) - návrat (${fmtDate(retDate)} ${retTime}).`)
                }
            }
        }
        // Naplánovaný príkaz sa vytvára pred cestou - poznáme len základné údaje,
        // detaily dopravy a náhrad sa dopĺňajú až po návrate.
        if (minimal) return errors
        if (autoCarKm != null && !form.ecv?.trim())
            errors.push('Vlastné auto (AUV) vyžaduje vyplnené EČV.')
        if ((form.trips ?? []).flatMap(t => t.segments).some(s => (s.km ?? 0) < 0))
            errors.push('Km nesmú byť záporné.')
        if ((form.advanceAmount ?? 0) < 0 || (form.advances ?? []).some(a => a.amount < 0))
            errors.push('Záloha nesmie byť záporná.')
        return errors
    }

    // ── Attachment preview ───────────────────────────────────────────────────

    const openAttachmentPreview = async (att: TravelOrderAttachment) => {
        if (!onReadAttachment) { onOpenAttachment?.(tempIdRef.current, att.id); return }
        const result = await onReadAttachment(tempIdRef.current, att.id)
        if (!result) { onOpenAttachment?.(tempIdRef.current, att.id); return }
        const isPreviewable = result.mimeType.startsWith('image/') || result.mimeType === 'application/pdf'
        if (!isPreviewable) { onOpenAttachment?.(tempIdRef.current, att.id); return }
        const blob = new Blob([result.buffer], { type: result.mimeType })
        const url = URL.createObjectURL(blob)
        setPreviewState({ url, mimeType: result.mimeType, name: att.filename })
    }

    const closePreview = () => {
        if (previewState) URL.revokeObjectURL(previewState.url)
        setPreviewState(null)
    }

    // ── Trip handlers ────────────────────────────────────────────────────────

    const updateTrip = (ti: number, field: keyof Trip, value: Trip[typeof field], extra?: Partial<Trip>) => {
        const trips = [...(form.trips ?? [])]
        const old = trips[ti]
        const updated: Trip = { ...old, [field]: value, ...extra }
        if (field === 'departureLocation' && (!old.returnLocation || old.returnLocation === old.departureLocation))
            updated.returnLocation = value as string
        if (field === 'departureDate' && old.returnDate === old.departureDate)
            updated.returnDate = value as string
        trips[ti] = updated
        set('trips', trips)
    }

    const emptyWaypointDraft = { place: '', date: '', time: '', lat: null as number | null, lon: null as number | null }

    const updateWaypointDraft = (ti: number, patch: Partial<typeof emptyWaypointDraft>) =>
        setNewWaypointDraft(prev => ({ ...prev, [ti]: { ...emptyWaypointDraft, ...prev[ti], ...patch } }))

    const addWaypoint = (ti: number) => {
        const draft = newWaypointDraft[ti]
        const trip = (form.trips ?? [])[ti]
        if (!trip || !draft?.place?.trim() || !draft.date || !draft.time) return
        const wp: TripWaypoint = {
            place: draft.place.trim(), arrivalDate: draft.date, arrivalTime: draft.time,
            lat: draft.lat, lon: draft.lon,
        }
        // Zoradené podľa príchodu - poradie zastávok v zozname sa berie ako
        // poradie na trase, takže musí zodpovedať skutočnému chronologickému sledu.
        const sorted = [...(trip.waypoints ?? []), wp]
            .sort((x, y) => `${x.arrivalDate}T${x.arrivalTime}`.localeCompare(`${y.arrivalDate}T${y.arrivalTime}`))
        updateTrip(ti, 'waypoints', sorted)
        setNewWaypointDraft(prev => ({ ...prev, [ti]: emptyWaypointDraft }))
    }

    const removeWaypoint = (ti: number, wi: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const next = [...(trip.waypoints ?? [])]
        next.splice(wi, 1)
        updateTrip(ti, 'waypoints', next)
    }

    const searchDestination = (ti: number, query: string) => {
        if (destSearchTimer.current) clearTimeout(destSearchTimer.current)
        if (query.trim().length < 3) { setOsmDestSuggestions(s => ({ ...s, [ti]: [] })); return }
        destSearchTimer.current = setTimeout(async () => {
            const results = await searchOsmPlaces(query)
            setOsmDestSuggestions(s => ({ ...s, [ti]: results }))
        }, 400)
    }

    const searchWaypointPlace = (ti: number, query: string) => {
        if (waypointSearchTimer.current) clearTimeout(waypointSearchTimer.current)
        if (query.trim().length < 3) { setWaypointOsmSuggestions(s => ({ ...s, [ti]: [] })); return }
        waypointSearchTimer.current = setTimeout(async () => {
            const results = await searchOsmPlaces(query)
            setWaypointOsmSuggestions(s => ({ ...s, [ti]: results }))
        }, 400)
    }

    // Rozbehnutý debounce vyhľadávania cieľa nesmie po zatvorení dialógu doletieť
    // s výsledkom (setState na odmontovanej komponente / zbytočná sieťová požiadavka).
    useEffect(() => () => {
        if (destSearchTimer.current) clearTimeout(destSearchTimer.current)
        if (waypointSearchTimer.current) clearTimeout(waypointSearchTimer.current)
    }, [])

    const fetchKmByCountry = async (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip?.departureLocation?.trim() || !trip?.destination?.trim()) return
        setLoadingKmTi(ti)
        try {
            const destPoint = trip.destinationLat != null && trip.destinationLon != null
                ? { lat: trip.destinationLat, lon: trip.destinationLon }
                : trip.destination.trim()
            const options = await calcOsmRouteOptions(trip.departureLocation.trim(), destPoint)
            const route = options?.[0]
            if (!route) return
            const kmByCountry: Record<string, number> = {}
            for (const { country, km } of route.countries) kmByCountry[country.toUpperCase()] = km
            const updated = trip.segments.map(seg => {
                const c = (seg.country ?? trip.country ?? 'SK').toUpperCase()
                const km = kmByCountry[c]
                return km != null ? { ...seg, km } : seg
            })
            updateTrip(ti, 'segments', updated, { routeCoordinates: route.coordinates })
        } finally {
            setLoadingKmTi(null)
        }
    }

    const buildSegmentsFromRoute = (ti: number, routeOption: OsmRouteOption | null) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const route: OsmCountryLeg[] | null = routeOption?.countries ?? null
        const trans     = trip.defaultTransport ?? 'car'
        const depLoc    = trip.departureLocation ?? ''
        const retLoc    = trip.returnLocation ?? depLoc
        const depDate   = trip.departureDate
        const retDate   = trip.returnDate ?? depDate
        const depTime   = trip.departureTime ?? ''
        const retTime   = trip.returnTime ?? ''
        const dest      = trip.destination
        const tripCountryCode = trip.country ?? 'SK'
        const destCtry  = allCountries.find(c => c.code === tripCountryCode) ?? { code: tripCountryCode, label: tripCountryCode, currency: 'EUR', borderPrefix: tripCountryCode }
        const foreign   = destCtry.code !== 'SK'

        type SegOpts = { date: string; from: string; fromTime: string; to: string; toTime?: string; country?: string; km?: number | null }
        const mkSeg = ({ date, from, fromTime, to, toTime = '', country = 'SK', km = null }: SegOpts): TripSegment =>
            ({ date, fromPlace: from, fromTime, toPlace: to, toTime, transport: trans, km, stravne: null, country, nbsDate: null })

        const dayDiff = Math.round((new Date(retDate).getTime() - new Date(depDate).getTime()) / 86_400_000)
        const overnight   = dayDiff >= 1
        const arrToTime   = overnight ? '00:00' : ''
        const retFromTime = overnight ? '00:00' : ''
        // Dni "na mieste" medzi príchodom a odchodom z destinácie - počítané od
        // SKUTOČNÝCH dátumov príchodu/odchodu (môžu sa líšiť od depDate/retDate
        // celej cesty pri viacdňovej jazde, napr. SK -> južné Španielsko), nie
        // od nominálnych dátumov celej cesty - inak by placeholder deň kolidoval
        // so segmentom skutočného príchodu/odchodu, ktorý naň zasahuje.
        const midSegsBetween = (ctry: string, arrivalDate: string, departureDate: string) => {
            const days: string[] = []
            const a = new Date(arrivalDate)
            for (let d = 1; ; d++) {
                const nd = new Date(a)
                nd.setDate(nd.getDate() + d)
                if (nd.toISOString().split('T')[0] >= departureDate) break
                days.push(nd.toISOString().split('T')[0])
            }
            return days.map(date => mkSeg({ date, from: dest, fromTime: '00:00', to: dest, toTime: '00:00', country: ctry }))
        }

        // Súčet km/trvania pre všetky úseky danej krajiny v trase - trasa môže tú
        // istú krajinu obsahovať aj viackrát (napr. keď sa nakrátko vráti cez hranicu).
        const sumCountry = (code: string): { km: number | null; durationMin: number | null } => {
            const legs = (route ?? []).filter(r => r.country === code)
            if (legs.length === 0) return { km: null, durationMin: null }
            return {
                km: legs.reduce((s, r) => s + r.km, 0),
                durationMin: legs.reduce((s, r) => s + r.durationMin, 0),
            }
        }

        let segs: TripSegment[]
        let scaledTimes = false
        const windowMin = sameDayWindowMinutes(depDate, depTime, retDate, retTime)

        if (foreign) {
            if (route && route.length > 1) {
                // Multi-krajinová trasa — vygeneruj správne hraničné úseky
                const codes = route.map(r => r.country)
                const hr = (a: string, b: string) => `hr. ${a}-${b}`
                const { durations, scaled } = scaleDurationsToFit(route.map(r => r.durationMin), windowMin)
                if (scaled) scaledTimes = true
                const outTimes = depTime ? chainForward(depDate, depTime, durations) : null
                const retTimes = retTime ? chainBackward(retDate, retTime, [...durations].reverse()) : null

                const outSegs = route.map(({ country, km }, i) => {
                    const isLast = i === codes.length - 1
                    return mkSeg({
                        date: outTimes ? outTimes[i].date : depDate,
                        from: i === 0 ? depLoc : hr(codes[i - 1], codes[i]),
                        fromTime: i === 0 ? depTime : (outTimes ? outTimes[i].time : ''),
                        to: isLast ? dest : hr(codes[i], codes[i + 1]),
                        // Uprednostni reálne dopočítaný čas príchodu pred sentinelom "00:00" -
                        // ten je len záložná hodnota pre výpočet stravného, keď reálny čas nepoznáme.
                        toTime: isLast ? ((outTimes ? outTimes[i + 1].time : '') || arrToTime) : (outTimes ? outTimes[i + 1].time : ''),
                        country, km,
                    })
                })

                const retSegs = [...route].reverse().map(({ country, km }, i) => {
                    const rev = [...codes].reverse()
                    const isLast = i === rev.length - 1
                    return mkSeg({
                        date: retTimes ? retTimes[i].date : retDate,
                        from: i === 0 ? dest : hr(rev[i - 1], rev[i]),
                        fromTime: i === 0 ? ((retTimes ? retTimes[i].time : '') || retFromTime) : (retTimes ? retTimes[i].time : ''),
                        to: isLast ? retLoc : hr(rev[i], rev[i + 1]),
                        toTime: isLast ? retTime : (retTimes ? retTimes[i + 1].time : ''),
                        country, km,
                    })
                })

                const arrivalDate = outTimes ? outTimes[outTimes.length - 1].date : depDate
                const departureFromDestDate = retTimes ? retTimes[0].date : retDate
                segs = [...outSegs, ...midSegsBetween(destCtry.code, arrivalDate, departureFromDestDate), ...retSegs]
            } else {
                // Fallback: jedna zahraničná krajina alebo OSM zlyhalo - dva úseky (SK, cieľová krajina)
                const bp = destCtry.borderPrefix
                const sk = sumCountry('SK')
                const dst = sumCountry(destCtry.code)
                const durationsRaw = sk.durationMin != null && dst.durationMin != null ? [sk.durationMin, dst.durationMin] : null
                const durScaled = durationsRaw ? scaleDurationsToFit(durationsRaw, windowMin) : null
                if (durScaled?.scaled) scaledTimes = true
                const durations = durScaled?.durations ?? null
                const outTimes = depTime && durations ? chainForward(depDate, depTime, durations) : null
                const retTimes = retTime && durations ? chainBackward(retDate, retTime, [...durations].reverse()) : null

                const arrivalDate = outTimes ? outTimes[2].date : depDate
                const departureFromDestDate = retTimes ? retTimes[0].date : retDate
                segs = [
                    mkSeg({ date: outTimes ? outTimes[0].date : depDate, from: depLoc, fromTime: depTime, to: `hr. SK-${bp}`, toTime: outTimes ? outTimes[1].time : '', country: 'SK', km: sk.km }),
                    mkSeg({ date: outTimes ? outTimes[1].date : depDate, from: `hr. SK-${bp}`, fromTime: outTimes ? outTimes[1].time : '', to: dest, toTime: (outTimes ? outTimes[2].time : '') || arrToTime, country: destCtry.code, km: dst.km }),
                    ...midSegsBetween(destCtry.code, arrivalDate, departureFromDestDate),
                    mkSeg({ date: retTimes ? retTimes[0].date : retDate, from: dest, fromTime: (retTimes ? retTimes[0].time : '') || retFromTime, to: `hr. ${bp}-SK`, toTime: retTimes ? retTimes[1].time : '', country: destCtry.code, km: dst.km }),
                    mkSeg({ date: retTimes ? retTimes[1].date : retDate, from: `hr. ${bp}-SK`, fromTime: retTimes ? retTimes[1].time : '', to: retLoc, toTime: retTime, country: 'SK', km: sk.km }),
                ]
            }
        } else {
            const sk = sumCountry('SK')
            const durScaled = sk.durationMin != null ? scaleDurationsToFit([sk.durationMin], windowMin) : null
            if (durScaled?.scaled) scaledTimes = true
            const skDuration = durScaled?.durations[0] ?? null
            const outTimes = depTime && skDuration != null ? chainForward(depDate, depTime, [skDuration]) : null
            const retTimes = retTime && skDuration != null ? chainBackward(retDate, retTime, [skDuration]) : null
            const arrivalDate = outTimes ? outTimes[1].date : depDate
            const departureFromDestDate = retTimes ? retTimes[0].date : retDate
            segs = [
                mkSeg({ date: outTimes ? outTimes[0].date : depDate, from: depLoc, fromTime: depTime, to: dest, toTime: (outTimes ? outTimes[1].time : '') || arrToTime, country: 'SK', km: sk.km }),
                ...midSegsBetween('SK', arrivalDate, departureFromDestDate),
                mkSeg({ date: retTimes ? retTimes[0].date : retDate, from: dest, fromTime: (retTimes ? retTimes[0].time : '') || retFromTime, to: retLoc, toTime: retTime, country: 'SK', km: sk.km }),
            ]
        }

        const { segs: keptSegs, lost } = carryOverExpenses(trip.segments, segs)
        const destCoord = routeOption?.coordinates?.[routeOption.coordinates.length - 1]
            ?? (trip.destinationLat != null && trip.destinationLon != null ? { lat: trip.destinationLat, lon: trip.destinationLon } : null)
        const trips = [...(form.trips ?? [])]
        trips[ti] = {
            ...trip,
            routeCoordinates: routeOption?.coordinates ?? null,
            routeStops: destCoord ? [{ lat: destCoord.lat, lon: destCoord.lon, label: '1' }] : null,
            segments: keptSegs.map(s => ({
                ...s,
                stravne: calcSegStravne(s.fromTime, s.toTime, s.country ?? 'SK', getRatesForDate(ratesHistory, s.date)),
            })),
        }
        set('trips', trips)
        setScaledTrips(prev => {
            const has = prev.has(ti)
            if (scaledTimes === has) return prev
            const next = new Set(prev)
            if (scaledTimes) next.add(ti); else next.delete(ti)
            return next
        })
        setLostExpenses(prev => lost > 0 ? { ...prev, [ti]: lost } : (ti in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== String(ti))) : prev))
    }

    // Ako buildSegmentsFromRoute, ale s ľubovoľným počtom ďalších cieľov (waypoints)
    // ZA destination - poradie je depLoc -> destination -> waypoint1 -> waypoint2...
    // destination (prvý cieľ) nemá vlastný čas, ten úsek sa odhaduje presne ako
    // doteraz. Každý ďalší cieľ má RUČNE zadaný dátum+čas príchodu - pre úsek
    // medzi dvomi bodmi, kde poznáme oba konce (skutočný čas), sa OSM-odhadnuté
    // trvania jednotlivých hraničných úsekov proporčne roztiahnu/zmenšia presne
    // na skutočne uplynutý čas - teda skutočný čas vždy vyhráva nad odhadom.
    // Cesta späť (posledný cieľ -> returnLocation) je nezmenená - jeden skok, auto-odhad.
    const buildWaypointSegments = async (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const trans     = trip.defaultTransport ?? 'car'
        const depLoc    = trip.departureLocation ?? ''
        const retLoc    = trip.returnLocation ?? depLoc
        const depDate   = trip.departureDate
        const retDate   = trip.returnDate ?? depDate
        const depTime   = trip.departureTime ?? ''
        const retTime   = trip.returnTime ?? ''
        const dest      = trip.destination
        const waypoints = trip.waypoints ?? []
        const fallbackCountry = trip.country ?? 'SK'
        // Ak nepoznáme reálny čas príchodu (napr. chýba depTime), použi ako
        // záložnú hodnotu polnoc - len pri viacdňovej ceste, rovnako ako
        // buildSegmentsFromRoute - inak by stravné za daný deň vyšlo nulové.
        const overnightWhole = Math.round((new Date(retDate).getTime() - new Date(depDate).getTime()) / 86_400_000) >= 1
        const arrToTime = overnightWhole ? '00:00' : ''

        type SegOpts = { date: string; from: string; fromTime: string; to: string; toTime?: string; country?: string; km?: number | null }
        const mkSeg = ({ date, from, fromTime, to, toTime = '', country = 'SK', km = null }: SegOpts): TripSegment =>
            ({ date, fromPlace: from, fromTime, toPlace: to, toTime, transport: trans, km, stravne: null, country, nbsDate: null })
        const hr = (a: string, b: string) => `hr. ${a}-${b}`
        // Dátumy striktne medzi dvomi dňami (bez okrajov) - napr. dni strávené
        // na mieste medzi príchodom a ďalším odchodom.
        const datesBetween = (fromDateExclusive: string, toDateExclusive: string): string[] => {
            const days: string[] = []
            const a0 = new Date(fromDateExclusive)
            for (let d = 1; ; d++) {
                const nd = new Date(a0)
                nd.setDate(nd.getDate() + d)
                const s = nd.toISOString().split('T')[0]
                if (s >= toDateExclusive) break
                days.push(s)
            }
            return days
        }

        // destination (prvý cieľ) nemá vlastný ručný čas - úsek doňho sa odhaduje
        // dopredu presne ako doteraz. Každý ďalší pridaný cieľ (waypoints) je
        // ĎALŠIA zastávka ZA destination, s ručne zadaným časom príchodu -
        // odchod z predchádzajúceho miesta sa počíta ODZADU (príchod mínus
        // trvanie trasy), nie naťahovaním/zmenšovaním úsekov aby "sedeli".
        type RoutePoint = { place: string; lat: number | null; lon: number | null; date: string | null; time: string | null }
        const points: RoutePoint[] = [
            { place: depLoc, lat: null, lon: null, date: depDate, time: depTime || null },
            { place: dest, lat: trip.destinationLat ?? null, lon: trip.destinationLon ?? null, date: null, time: null },
            ...waypoints.map(w => ({ place: w.place, lat: w.lat ?? null, lon: w.lon ?? null, date: w.arrivalDate, time: w.arrivalTime })),
        ]
        const finalPoint = points[points.length - 1]

        // SEKVENČNE, nie Promise.all - Nominatim (geokódovanie textových miest) má
        // fair-use limit cca 1 request/s a pri 2+ zastávkach by súbežné volania za
        // každý úsek (aj OSRM smerovanie) prekročili limit a potichu zlyhali (rovnaký
        // druh problému, aký spôsobovalo predtým BigDataCloud - pozri hlavičku
        // utils/osmDistance.ts) - výsledkom bola prázdna mapa aj chýbajúce km/krajiny
        // na neskorších úsekoch.
        const legRouteOptions: (Awaited<ReturnType<typeof calcOsmRouteOptions>>)[] = []
        for (let i = 0; i < points.length - 1; i++) {
            const p = points[i]
            const next = points[i + 1]
            const fromArg = p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : p.place.trim()
            const toArg = next.lat != null && next.lon != null ? { lat: next.lat, lon: next.lon } : next.place.trim()
            legRouteOptions.push(await calcOsmRouteOptions(fromArg, toArg))
        }

        const outSegs: TripSegment[] = []
        const legWarnings: string[] = []
        let legsScaled = false
        let anchorDate = depDate
        let anchorTime = depTime

        for (let li = 0; li < points.length - 1; li++) {
            const a = points[li]
            const b = points[li + 1]
            const arrivalAtA = { date: anchorDate, time: anchorTime }
            const route = legRouteOptions[li]?.[0] ?? null
            const countries = route?.countries?.length
                ? route.countries
                : [{ country: fallbackCountry, km: route?.km ?? null, durationMin: route?.durationMin ?? 0 }]
            const codes = countries.map(c => c.country)
            const knownEnd = !!(b.date && b.time)

            let legTimes: ReturnType<typeof chainForward> | null = null
            if (knownEnd) {
                const totalDurationMin = countries.reduce((s, c) => s + c.durationMin, 0)
                const windowMin = arrivalAtA.time ? minutesBetween(arrivalAtA.date, arrivalAtA.time, b.date!, b.time!) : null
                // Okno je tesnejšie než odhad OSM trasy - proporčne skráť trvania
                // jednotlivých hraničných úsekov, nech odchod z `a` presne vyjde na
                // arrivalAtA (namiesto toho, aby vyšiel pred príchodom). Ak treba
                // skrátiť o viac než ROUTE_DURATION_TOLERANCE, len upozorni - stále
                // to vygeneruj, nezastavuj celý výpočet.
                let durations = countries.map(c => c.durationMin)
                if (windowMin != null && totalDurationMin > 0 && windowMin < totalDurationMin) {
                    durations = countries.map(c => c.durationMin * (Math.max(windowMin, 0) / totalDurationMin))
                    legsScaled = true
                    if (windowMin < totalDurationMin * (1 - ROUTE_DURATION_TOLERANCE)) {
                        legWarnings.push(`Cesta z "${a.place}" (príchod ${fmtDate(arrivalAtA.date)} ${arrivalAtA.time}) do "${b.place}" (príchod ${fmtDate(b.date!)} ${b.time!}) je podľa OSM na ${totalDurationMin} min, no okno má len ${Math.max(windowMin, 0)} min - časy sme skrátili, over si to.`)
                    }
                }
                // Odzadu: odchod z predchádzajúceho miesta = ručne zadaný príchod mínus trvanie trasy.
                legTimes = chainBackward(b.date!, b.time!, durations)
            } else if (anchorTime) {
                legTimes = chainForward(anchorDate, anchorTime, countries.map(c => c.durationMin))
            }

            // Dni strávené v mieste `a` MEDZI príchodom doňho (arrivalAtA) a odchodom
            // z neho (začiatok tohto úseku) - platí pre KAŽDÝ medziľahlý bod trasy,
            // nie len pre posledný cieľ (predtým sa dni na medzizastávkach strácali).
            if (li >= 1 && legTimes && arrivalAtA.time) {
                const restCountry = codes[0]
                for (const date of datesBetween(arrivalAtA.date, legTimes[0].date)) {
                    outSegs.push(mkSeg({ date, from: a.place, fromTime: '00:00', to: a.place, toTime: '00:00', country: restCountry }))
                }
            }

            countries.forEach((c, i) => {
                const isLastInLeg = i === codes.length - 1
                outSegs.push(mkSeg({
                    date: legTimes ? legTimes[i].date : anchorDate,
                    from: i === 0 ? a.place : hr(codes[i - 1], codes[i]),
                    fromTime: legTimes ? legTimes[i].time : (i === 0 ? (anchorTime || '') : ''),
                    to: isLastInLeg ? b.place : hr(codes[i], codes[i + 1]),
                    // Uprednostni reálne dopočítaný čas príchodu pred sentinelom "00:00" -
                    // ten je len záložná hodnota pre výpočet stravného, keď reálny čas nepoznáme.
                    toTime: legTimes ? legTimes[i + 1].time : (isLastInLeg ? ((knownEnd ? b.time! : '') || arrToTime) : (knownEnd ? b.time! : '')),
                    country: c.country, km: c.km,
                }))
            })

            if (knownEnd) {
                anchorDate = b.date!
                anchorTime = b.time!
            } else if (legTimes) {
                anchorDate = legTimes[legTimes.length - 1].date
                anchorTime = legTimes[legTimes.length - 1].time
            }
        }

        setWaypointTimeErrors(prev => {
            if (legWarnings.length === 0) {
                if (!(ti in prev)) return prev
                const next = { ...prev }
                delete next[ti]
                return next
            }
            return { ...prev, [ti]: legWarnings }
        })

        // Cesta späť - jeden skok POSLEDNÉHO bodu (destination, alebo posledný
        // pridaný cieľ) -> returnLocation. Rovnaké okno-fit škálovanie ako pri
        // ceste bez zastávok (scaleDurationsToFit), aby sa časy nezmestili
        // mimo okna pred návratom bez varovania.
        const finalRoutePoint = finalPoint.lat != null && finalPoint.lon != null
            ? { lat: finalPoint.lat, lon: finalPoint.lon } : finalPoint.place.trim()
        const retRouteOptions = retLoc.trim() ? await calcOsmRouteOptions(finalRoutePoint, retLoc.trim()) : null
        const retRoute = retRouteOptions?.[0]
        const retCountries = retRoute?.countries?.length
            ? retRoute.countries
            : [{ country: fallbackCountry, km: retRoute?.km ?? null, durationMin: retRoute?.durationMin ?? 0 }]
        const retCodes = retCountries.map(c => c.country)
        const retWindowMin = anchorTime && retTime ? minutesBetween(anchorDate, anchorTime, retDate, retTime) : null
        const { durations: retDurations, scaled: retScaled } = scaleDurationsToFit(retCountries.map(c => c.durationMin), retWindowMin)
        const retTimes = retTime ? chainBackward(retDate, retTime, retDurations) : null

        const retSegs = retCountries.map((c, i) => {
            const isLast = i === retCodes.length - 1
            return mkSeg({
                date: retTimes ? retTimes[i].date : retDate,
                from: i === 0 ? finalPoint.place : hr(retCodes[i - 1], retCodes[i]),
                fromTime: i === 0 ? ((retTimes ? retTimes[i].time : '') || arrToTime) : (retTimes ? retTimes[i].time : ''),
                to: isLast ? retLoc : hr(retCodes[i], retCodes[i + 1]),
                toTime: isLast ? retTime : (retTimes ? retTimes[i + 1].time : ''),
                country: c.country, km: c.km,
            })
        })

        // Dni na mieste POSLEDNÉHO cieľa - medzi príchodom doňho (anchorDate/anchorTime
        // po hlavnej slučke) a odchodom naspäť. Značené skutočnou krajinou prvého
        // úseku cesty späť (nie fallbackCountry/trip.country), nech to sedí, aj keď
        // posledný pridaný cieľ leží v inej krajine než pôvodné "Cieľ cesty".
        const departureFromDestDate = retTimes ? retTimes[0].date : retDate
        const finalRestCountry = retCountries[0]?.country ?? fallbackCountry
        const midDaySegs = anchorTime
            ? datesBetween(anchorDate, departureFromDestDate).map(date =>
                mkSeg({ date, from: finalPoint.place, fromTime: '00:00', to: finalPoint.place, toTime: '00:00', country: finalRestCountry }))
            : []

        const segs = [...outSegs, ...midDaySegs, ...retSegs]
        const { segs: keptSegs, lost } = carryOverExpenses(trip.segments, segs)
        // Mapa v náhľade má ukázať CELÚ trasu vrátane ďalších miest rokovania - spoj
        // súradnice zo všetkých úsekov tam (depLoc -> dest -> waypoint1 -> ...) aj z
        // cesty späť do jednej súvislej čiary, nie len prvý skok ako predtým.
        // Ak OSM trasa pre niektorý úsek zlyhá (napr. dočasný výpadok/limit verejnej
        // služby), radšej rovná čiara medzi známymi bodmi než aby kvôli jednému
        // úseku zmizla mapa celá.
        const legCoords = legRouteOptions.flatMap((opts, idx) => {
            const coords = opts?.[0]?.coordinates
            if (coords?.length) return coords
            const a = points[idx], b = points[idx + 1]
            return a.lat != null && a.lon != null && b.lat != null && b.lon != null
                ? [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }]
                : []
        })
        const routeCoordinates = [...legCoords, ...(retRoute?.coordinates ?? [])]
        // Číslované ciele (destination + zastávky, points[1..]) - súradnica každého
        // je koniec trasy úseku, ktorý doň prichádza (presnejšie než point.lat/lon,
        // ktoré pri ručne zadanom mieste bez OSM návrhu môže chýbať).
        const routeStops = points.slice(1).map((p, idx) => {
            const coords = legRouteOptions[idx]?.[0]?.coordinates
            const last = coords?.[coords.length - 1]
            const coord = last ?? (p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : null)
            return coord ? { lat: coord.lat, lon: coord.lon, label: String(idx + 1) } : null
        }).filter((s): s is { lat: number; lon: number; label: string } => s != null)
        const trips = [...(form.trips ?? [])]
        trips[ti] = {
            ...trip,
            routeCoordinates: routeCoordinates.length > 0 ? routeCoordinates : null,
            routeStops: routeStops.length > 0 ? routeStops : null,
            segments: keptSegs.map(s => ({
                ...s,
                stravne: calcSegStravne(s.fromTime, s.toTime, s.country ?? 'SK', getRatesForDate(ratesHistory, s.date)),
            })),
        }
        set('trips', trips)
        setScaledTrips(prev => {
            const scaled = legsScaled || retScaled
            const has = prev.has(ti)
            if (scaled === has) return prev
            const next = new Set(prev)
            if (scaled) next.add(ti); else next.delete(ti)
            return next
        })
        setLostExpenses(prev => lost > 0 ? { ...prev, [ti]: lost } : (ti in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== String(ti))) : prev))
    }

    const generateTripSegments = async (ti: number) => {
        const trip = (form.trips ?? [])[ti]
        if (!trip) return
        const depLoc = trip.departureLocation ?? ''
        const dest = trip.destination

        if (!depLoc.trim() || !dest.trim()) {
            buildSegmentsFromRoute(ti, null)
            return
        }

        const hasWaypointStops = (trip.waypoints?.length ?? 0) > 0
        setWaypointTimeErrors(prev => {
            if (!(ti in prev)) return prev
            const next = { ...prev }
            delete next[ti]
            return next
        })

        if (hasWaypointStops) {
            const depDate = trip.departureDate
            const depTime = trip.departureTime ?? ''
            const retDate = trip.returnDate ?? depDate
            const retTime = trip.returnTime ?? ''
            // Overiť len keď poznáme celý interval odchod-návrat - bez toho sa
            // nedá spoľahlivo zistiť, či je zadaný príchod mimo neho.
            if (depTime && retTime) {
                const errors = (trip.waypoints ?? [])
                    .map((wp, wi) => {
                        const afterDeparture = minutesBetween(depDate, depTime, wp.arrivalDate, wp.arrivalTime) >= 0
                        const beforeReturn = minutesBetween(wp.arrivalDate, wp.arrivalTime, retDate, retTime) >= 0
                        if (afterDeparture && beforeReturn) return null
                        return `${wi + 2}. cieľ (${wp.place}) - príchod ${fmtDate(wp.arrivalDate)} ${wp.arrivalTime} je mimo intervalu odchod (${fmtDate(depDate)} ${depTime}) - návrat (${fmtDate(retDate)} ${retTime}).`
                    })
                    .filter((e): e is string => e !== null)
                if (errors.length > 0) {
                    setWaypointTimeErrors(prev => ({ ...prev, [ti]: errors }))
                    return
                }
            }
        }

        setLoadingGenTi(ti)
        try {
            if (hasWaypointStops) {
                await buildWaypointSegments(ti)
                return
            }
            // Zisti skutočné tranzitné krajiny + alternatívne trasy cez OSM
            // (ak máme uložené presné súradnice cieľa z OSM návrhu, použi ich namiesto opätovného geokódovania)
            const destPoint = trip.destinationLat != null && trip.destinationLon != null
                ? { lat: trip.destinationLat, lon: trip.destinationLon }
                : dest.trim()
            const options = await calcOsmRouteOptions(depLoc.trim(), destPoint, { alternatives: true })
            if (options && options.length > 1) {
                setRouteOptions({ ti, options })
                return
            }
            buildSegmentsFromRoute(ti, options?.[0] ?? null)
        } finally {
            setLoadingGenTi(null)
        }
    }

    const chooseRoute = (option: OsmRouteOption) => {
        if (!routeOptions) return
        buildSegmentsFromRoute(routeOptions.ti, option)
        setRouteOptions(null)
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
        const errors = validateForm(restricted || statusOverride === 'planned')
        if (errors.length > 0) { setValidationErrors(errors); return }
        setValidationErrors([])
        setSaving(true)
        const advanceAmount = form.advances?.length
            ? (form.advances.find(a => (a.currency || 'EUR') === 'EUR')?.amount ?? form.advances[0]?.amount ?? 0)
            : form.advanceAmount
        const saved = {
            ...form,
            advanceAmount,
            status: statusOverride ?? form.status,
            departureDate: form.trips![0].departureDate || form.departureDate,
            destination:   form.trips!.map(t => t.destination).join(' / '),
        }
        try { await onSave(saved, tempIdRef.current) } finally { setSaving(false) }
    }

    const handleAddAttachment = async () => {
        if (!onAddAttachment) return
        setAddingAttachment(true)
        try {
            const att = await onAddAttachment(tempIdRef.current)
            if (att) setAttachments(prev => [...prev, att])
        } finally {
            setAddingAttachment(false)
        }
    }

    const handleDeleteAttachment = async (id: string) => {
        if (!onDeleteAttachment) return
        await onDeleteAttachment(tempIdRef.current, id)
        setAttachments(prev => prev.filter(a => a.id !== id))
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        if (!onAddAttachmentFromPath) return
        const files = Array.from(e.dataTransfer.files)
        for (const file of files) {
            const filePath = (file as File & { path?: string }).path
            if (!filePath) continue
            setAddingAttachment(true)
            try {
                const att = await onAddAttachmentFromPath(tempIdRef.current, filePath)
                if (att) setAttachments(prev => [...prev, att])
            } finally {
                setAddingAttachment(false)
            }
        }
    }

    const goTo = (step: number) => {
        setActiveStep(step)
        setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 0)
    }

    const hasSegmentOverlaps = (form.trips ?? []).some(t => findSegmentOverlaps(t.segments).length > 0)

    const canNext = (() => {
        if (activeStep === 0) return form.employee.trim().length > 0
        if (activeStep === 1) return (form.trips?.length ?? 0) > 0 && (form.trips?.[0]?.destination?.trim().length ?? 0) > 0 && !hasSegmentOverlaps
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
                        onInputChange={(_e, val, reason) => { if (reason !== 'reset') set('employee', val) }}
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
                                    const defaultFuelType = val.defaultFuelType ?? (val.defaultIsElectric ? 'electric' : null)
                                    set('isElectric', defaultFuelType === 'electric' ? true : null)
                                    set('fuelType', defaultFuelType)
                                } else {
                                    set('transportType', 'company_car')
                                    set('isElectric', null)
                                    set('fuelType', null)
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

                    <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                            Spolucestujúci
                        </Typography>
                        {collaboratorList.length > 0 && (
                            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mb: 0.75 }}>
                                {collaboratorList.map(name => (
                                    <Chip key={name} label={name} size="small" onDelete={() => removeCollaborator(name)} />
                                ))}
                            </Stack>
                        )}
                        <Autocomplete
                            freeSolo
                            options={employees
                                .map(e => e.name)
                                .filter(n => n !== form.employee && !collaboratorList.includes(n))}
                            inputValue={collaboratorInput}
                            onInputChange={(_, val, reason) => { if (reason !== 'reset') setCollaboratorInput(val) }}
                            onChange={(_, val) => { if (typeof val === 'string' && val.trim()) addCollaborator(val) }}
                            renderInput={params => (
                                <TextField {...params} size="small" placeholder="Pridať spolucestujúceho…"
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && collaboratorInput.trim()) {
                                            e.preventDefault()
                                            addCollaborator(collaboratorInput)
                                        }
                                    }}
                                />
                            )}
                        />
                    </Box>
                </Stack>
            </CardContent>
        </Card>
    )

    // ── Step 1: Cesta ────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <>
            {(form.trips ?? []).map((trip, ti) => {
                const tripOsmSuggestions = osmDestSuggestions[ti] ?? []
                const segmentOverlaps = findSegmentOverlaps(trip.segments)
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
                const routeLabel = [depLabel, destLabel, ...(trip.waypoints ?? []).map(w => w.place || '?')].join(' → ')

                const isCollapsed = collapsedTrips.has(ti)
                const toggleCollapse = () => setCollapsedTrips(prev => {
                    const next = new Set(prev)
                    if (next.has(ti)) next.delete(ti); else next.add(ti)
                    return next
                })

                return (
                    <Card key={ti} sx={sxCard}>
                        <CardContent>
                            {/* Route header */}
                            <Box sx={{ bgcolor: 'primary.main', borderRadius: '12px', p: 1.75, mb: 2.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                    <Box onClick={toggleCollapse} sx={{ flex: 1, cursor: 'pointer' }}>
                                        <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.25, color: 'primary.contrastText' }}>
                                            Trasa {(form.trips ?? []).length > 1 ? ti + 1 : ''}
                                        </Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.2, color: 'primary.contrastText' }}>
                                            {routeLabel}
                                        </Typography>
                                        {trip.departureDate && (
                                            <Typography variant="caption" sx={{ opacity: 0.75, mt: 0.5, display: 'block', color: 'primary.contrastText' }}>
                                                {fmtDate(trip.departureDate)}
                                                {trip.returnDate && trip.returnDate !== trip.departureDate
                                                    ? ` — ${fmtDate(trip.returnDate)}` : ''}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, ml: 1, flexShrink: 0 }}>
                                        {(form.trips ?? []).length > 1 && (
                                            <Button size="small" startIcon={<Delete fontSize="small" />}
                                                onClick={e => { e.stopPropagation(); removeTrip(ti) }}
                                                sx={{
                                                    textTransform: 'none', lineHeight: 1,
                                                    color: '#ff6b6b',
                                                    '& .MuiButton-startIcon': { marginRight: '4px', display: 'flex', alignItems: 'center' },
                                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', color: '#ff4444' },
                                                }}>
                                                Zmazať
                                            </Button>
                                        )}
                                        <IconButton size="small" onClick={toggleCollapse}
                                            sx={{ color: 'primary.contrastText' }}>
                                            {isCollapsed ? <ExpandMore /> : <ExpandLess />}
                                        </IconButton>
                                    </Stack>
                                </Box>
                            </Box>

                            <Collapse in={!isCollapsed}>
                            <Stack sx={{ gap: 2 }}>

                                {!restricted && segmentOverlaps.length > 0 && (
                                    <Alert severity="error" sx={{ borderRadius: '10px' }}>
                                        <Stack sx={{ gap: 0.25 }}>
                                            {segmentOverlaps.map(({ date, a, b }, oi) => (
                                                <Typography key={oi} variant="body2">
                                                    Prekrývajúce sa časy {fmtDate(date)}: <strong>{a.fromPlace || '?'}–{a.toPlace || '?'}</strong> ({a.fromTime}–{a.toTime})
                                                    {' '}a <strong>{b.fromPlace || '?'}–{b.toPlace || '?'}</strong> ({b.fromTime}–{b.toTime}) — nemôžete byť na dvoch miestach naraz.
                                                </Typography>
                                            ))}
                                        </Stack>
                                    </Alert>
                                )}

                                <Autocomplete
                                    freeSolo
                                    fullWidth
                                    options={[...new Set([
                                        ...prefs.customPlaces,
                                        ...(CITY_SUGGESTIONS[trip.country ?? 'SK'] ?? []),
                                        ...tripOsmSuggestions.map(s => s.label),
                                    ])]}
                                    inputValue={trip.destination}
                                    onInputChange={(_e, val, reason) => {
                                        if (reason === 'reset') return
                                        updateTrip(ti, 'destination', val, { destinationLat: null, destinationLon: null })
                                        searchDestination(ti, val)
                                    }}
                                    onChange={(_e, val) => {
                                        if (typeof val !== 'string') return
                                        const match = tripOsmSuggestions.find(s => s.label === val)
                                        if (match) {
                                            updateTrip(ti, 'destination', match.shortLabel, {
                                                ...(match.countryCode ? { country: match.countryCode } : null),
                                                destinationLat: match.lat,
                                                destinationLon: match.lon,
                                            })
                                        } else {
                                            updateTrip(ti, 'destination', val, { destinationLat: null, destinationLon: null })
                                        }
                                    }}
                                    filterOptions={(options, { inputValue }) => {
                                        const q = norm(inputValue)
                                        const osmLabels = tripOsmSuggestions.map(s => s.label)
                                        return options.filter(o =>
                                            o !== trip.departureLocation &&
                                            (osmLabels.includes(o) || q === '' || norm(o).includes(q))
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

                                <Stack sx={{ gap: 1 }}>
                                    {(trip.waypoints ?? []).map((wp, wi) => (
                                        <Paper key={wi} variant="outlined"
                                            sx={{ p: 1, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                            <Box sx={{
                                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 12, fontWeight: 700,
                                            }}>
                                                {wi + 2}
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{wp.place}</Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    Príchod {fmtDate(wp.arrivalDate)} o {wp.arrivalTime}
                                                </Typography>
                                            </Box>
                                            <IconButton size="small" onClick={() => removeWaypoint(ti, wi)}>
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </Paper>
                                    ))}
                                    {addingWaypointFor[ti] ? (() => {
                                        const draft = newWaypointDraft[ti]
                                        const wpOsmSuggestions = waypointOsmSuggestions[ti] ?? []
                                        const prevPlace = (trip.waypoints ?? [])[(trip.waypoints ?? []).length - 1]?.place ?? trip.destination
                                        return (
                                        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: '10px' }}>
                                            <Stack sx={{ gap: 1 }}>
                                                <Autocomplete
                                                    freeSolo
                                                    fullWidth
                                                    size="small"
                                                    options={[...new Set([
                                                        ...prefs.customPlaces,
                                                        ...(CITY_SUGGESTIONS[trip.country ?? 'SK'] ?? []),
                                                        ...wpOsmSuggestions.map(s => s.label),
                                                    ])]}
                                                    inputValue={draft?.place ?? ''}
                                                    onInputChange={(_e, val, reason) => {
                                                        if (reason === 'reset') return
                                                        updateWaypointDraft(ti, { place: val, lat: null, lon: null })
                                                        searchWaypointPlace(ti, val)
                                                    }}
                                                    onChange={(_e, val) => {
                                                        if (typeof val !== 'string') return
                                                        const match = wpOsmSuggestions.find(s => s.label === val)
                                                        if (match) {
                                                            updateWaypointDraft(ti, {
                                                                place: match.shortLabel,
                                                                lat: match.lat, lon: match.lon,
                                                            })
                                                        } else {
                                                            updateWaypointDraft(ti, { place: val, lat: null, lon: null })
                                                        }
                                                    }}
                                                    filterOptions={(options, { inputValue }) => {
                                                        const q = norm(inputValue)
                                                        const osmLabels = wpOsmSuggestions.map(s => s.label)
                                                        return options.filter(o =>
                                                            o !== prevPlace &&
                                                            (osmLabels.includes(o) || q === '' || norm(o).includes(q))
                                                        )
                                                    }}
                                                    renderInput={params => <TextField {...params} label="Ďalší cieľ" />}
                                                />
                                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                                                    <TextField label="Dátum príchodu" type="date" size="small" sx={{ minWidth: 155, flexShrink: 0 }}
                                                        slotProps={{ inputLabel: { shrink: true } }}
                                                        value={draft?.date ?? ''}
                                                        onChange={e => updateWaypointDraft(ti, { date: e.target.value })} />
                                                    <TimePickerField label="Čas príchodu" size="small"
                                                        sx={{ width: { xs: '100%', sm: 130 }, flexShrink: 0 }}
                                                        value={draft?.time ?? ''}
                                                        onChange={v => updateWaypointDraft(ti, { time: v })} />
                                                    <Stack direction="row" sx={{ gap: 1, flexShrink: 0, ml: { sm: 'auto' } }}>
                                                        <Button size="small" variant="contained"
                                                            disabled={!draft?.place?.trim() || !draft?.date || !draft?.time}
                                                            onClick={() => { addWaypoint(ti); setAddingWaypointFor(prev => ({ ...prev, [ti]: false })) }}>
                                                            Pridať
                                                        </Button>
                                                        <Button size="small" onClick={() => setAddingWaypointFor(prev => ({ ...prev, [ti]: false }))}>
                                                            Zrušiť
                                                        </Button>
                                                    </Stack>
                                                </Stack>
                                            </Stack>
                                        </Paper>
                                        )
                                    })() : (
                                        <Button size="small" startIcon={<Add />} sx={{ alignSelf: 'flex-start' }}
                                            onClick={() => setAddingWaypointFor(prev => ({ ...prev, [ti]: true }))}>
                                            Pridať ďalší cieľ
                                        </Button>
                                    )}
                                </Stack>

                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                    <Autocomplete
                                        fullWidth
                                        freeSolo
                                        options={allCountries}
                                        getOptionLabel={o => typeof o === 'string' ? o : (o.currency !== 'EUR' ? `${o.label} (${o.currency})` : o.label)}
                                        value={allCountries.find(c => c.code === (trip.country ?? 'SK')) ?? (trip.country ?? 'SK')}
                                        onChange={(_e, val) => {
                                            if (!val) return
                                            // Ručná zmena krajiny robí uložené súradnice cieľa (z OSM návrhu)
                                            // nedôveryhodné - mohli patriť inej krajine ako tá novo zvolená.
                                            updateTrip(ti, 'country', typeof val === 'string' ? val.toUpperCase().slice(0, 10) : val.code,
                                                { destinationLat: null, destinationLon: null })
                                        }}
                                        onInputChange={(_e, _val, reason) => {
                                            if (reason === 'clear') updateTrip(ti, 'country', 'SK', { destinationLat: null, destinationLon: null })
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

                                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                    <TextField label="Dátum návratu" type="date" fullWidth
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.returnDate ?? ''}
                                        error={!!trip.returnDate && trip.returnDate < trip.departureDate}
                                        helperText={!!trip.returnDate && trip.returnDate < trip.departureDate ? 'Dátum návratu je pred dátumom odchodu' : undefined}
                                        onChange={e => updateTrip(ti, 'returnDate', e.target.value)} />
                                    <TimePickerField label="Čas návratu"
                                        sx={{ width: { xs: '100%', sm: 140 }, flexShrink: 0 }}
                                        value={trip.returnTime ?? ''}
                                        onChange={v => updateTrip(ti, 'returnTime', v)} />
                                </Stack>

                                <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                                    <TextField select label="Predvolený spôsob dopravy" sx={{ maxWidth: 260 }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={trip.defaultTransport ?? 'car'}
                                        onChange={e => updateTrip(ti, 'defaultTransport', e.target.value)}>
                                        {TRANSPORT_OPTIONS.map(o => (
                                            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    <Tooltip title="Použije sa pri generovaní úsekov tejto cesty. Jednotlivé úseky si vieš prepnúť aj samostatne.">
                                        <InfoOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
                                    </Tooltip>
                                </Stack>

                                {trip.departureDate && trip.returnDate && trip.returnDate >= trip.departureDate && (() => {
                                    const days = Math.round((new Date(trip.returnDate).getTime() - new Date(trip.departureDate).getTime()) / 86_400_000) + 1
                                    return (
                                        <Chip size="small" variant="outlined" color="info" sx={{ alignSelf: 'flex-start' }}
                                            label={`Trvanie: ${days} ${days === 1 ? 'deň' : days < 5 ? 'dni' : 'dní'}`} />
                                    )
                                })()}

                                {!restricted && trip.destination && trip.departureDate && trip.returnDate && (
                                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                                        <Button variant="outlined" size="small" sx={{ borderRadius: '10px' }}
                                            disabled={loadingGenTi === ti}
                                            startIcon={loadingGenTi === ti ? <CircularProgress size={14} /> : undefined}
                                            onClick={() => {
                                                if (trip.segments.length > 0) {
                                                    const hasExpenses = trip.segments.some(s => s.expenses?.length)
                                                    setConfirmState({
                                                        message: hasExpenses
                                                            ? 'Prepočítať úseky? Existujúce úseky budú nahradené — zadané výdavky (lístky, nocľažné, ...) sa prenesú tam, kde sa dátum aj miesto zhodujú, inak sa stratia.'
                                                            : 'Prepočítať úseky? Existujúce úseky budú nahradené.',
                                                        onConfirm: () => { setConfirmState(null); generateTripSegments(ti) },
                                                    })
                                                    return
                                                }
                                                generateTripSegments(ti)
                                            }}>
                                            {loadingGenTi === ti ? 'Generujem…' : trip.segments.length === 0 ? 'Vygenerovať úseky (tam + pobyt + späť)' : 'Prepočítať úseky'}
                                        </Button>
                                        {trip.segments.length > 0 && trip.departureLocation && (
                                            <Tooltip title="Vzdialenosti vypočítané cez OpenStreetMap / OSRM. © OpenStreetMap contributors (ODbL)" disableTouchListener>
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

                                {!restricted && (waypointTimeErrors[ti]?.length ?? 0) > 0 && (
                                    <Alert severity="warning" sx={{ borderRadius: '10px' }}>
                                        <Stack sx={{ gap: 0.25 }}>
                                            {waypointTimeErrors[ti]!.map((err, ei) => (
                                                <Typography key={ei} variant="body2">{err}</Typography>
                                            ))}
                                        </Stack>
                                    </Alert>
                                )}

                                {!restricted && scaledTrips.has(ti) && (
                                    <Alert severity="warning" sx={{ borderRadius: '10px' }}>
                                        Časy sme skrátili, aby sedeli do zadaného okna odchod–návrat.
                                    </Alert>
                                )}

                                {!restricted && (lostExpenses[ti] ?? 0) > 0 && (
                                    <Alert severity="warning" sx={{ borderRadius: '10px' }} onClose={() => setLostExpenses(prev => {
                                        const next = { ...prev }
                                        delete next[ti]
                                        return next
                                    })}>
                                        {lostExpenses[ti]} {lostExpenses[ti] === 1 ? 'zadaný výdavok sa' : 'zadané výdavky sa'} nepodarilo priradiť k novým úsekom (zmenil sa dátum alebo miesto) — skontroluj lístky/nocľažné nižšie.
                                    </Alert>
                                )}

                                {!restricted && (
                                    <SegmentEditor
                                        segments={trip.segments}
                                        tripDate={trip.departureDate}
                                        transport={trip.defaultTransport ?? 'car'}
                                        defaultCountry={trip.country ?? 'SK'}
                                        ratesHistory={ratesHistory}
                                        allCountries={allCountries}
                                        exchangeRates={form.exchangeRates}
                                        onChange={segs => updateTrip(ti, 'segments', segs)}
                                        vreckoveLimit={vreckoveLimit > 0 ? vreckoveLimit : undefined}
                                        vreckoveLimitCur={vreckoveLimitCur}
                                    />
                                )}

                                {!restricted && daily.length > 0 && (
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
                            </Collapse>
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
            {autoCarKm != null && (
            <Card sx={sxCard}>
                <CardContent>
                    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                        Vozidlo
                    </Typography>
                    <Stack sx={{ gap: 2.5, mt: 1.5 }}>
                        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                            <TextField label="EČV (evidenčné číslo vozidla)" sx={{ maxWidth: 220 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.ecv ?? ''}
                                onChange={e => set('ecv', e.target.value.toUpperCase())} />
                            <Chip size="small" label={`${autoCarKm} km AUV`} variant="outlined" sx={{ flexShrink: 0 }} />
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>
            )}

            {autoCarKm != null && (
                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Náhrada za vozidlo
                        </Typography>
                        <Stack sx={{ gap: 2, mt: 1.5 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, flexWrap: 'wrap', alignItems: { sm: 'center' } }}>
                                <FormControlLabel
                                    control={<Checkbox size="small"
                                        checked={form.applyAmortization !== false}
                                        onChange={e => set('applyAmortization', e.target.checked ? null : false)} />}
                                    label="Uplatniť amortizáciu" />
                                <FormControlLabel
                                    control={<Checkbox size="small"
                                        checked={form.applyFuelCost !== false}
                                        onChange={e => set('applyFuelCost', e.target.checked ? null : false)} />}
                                    label="Uplatniť náhradu za spotrebu" />
                            </Stack>

                            <TextField select label="Druh paliva" sx={{ maxWidth: 200 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={form.fuelType ?? (form.isElectric ? 'electric' : 'diesel')}
                                onChange={e => {
                                    const ft = e.target.value
                                    set('fuelType', ft)
                                    set('isElectric', ft === 'electric' ? true : null)
                                }}>
                                {FUEL_TYPE_OPTIONS.map(o => (
                                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                ))}
                            </TextField>

                            {form.applyFuelCost !== false && (() => {
                                const fi = getFuelTypeInfo(form.fuelType, form.isElectric)
                                return (
                                    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
                                        <TextField
                                            label={`Spotreba (${fi.consumptionUnit})`}
                                            type="number" fullWidth
                                            slotProps={{ inputLabel: { shrink: true } }}
                                            value={form.fuelConsumption ?? ''}
                                            onChange={e => set('fuelConsumption', e.target.value ? Number(e.target.value) : undefined)} />
                                        <Tooltip title={onFetchFuelPrice
                                            ? (fuelPriceFetch.weekLabel
                                                ? `Automaticky načítané zo Štatistického úradu SR (${fuelPriceFetch.weekLabel}). Hodnotu môžeš ručne upraviť.`
                                                : 'Cena sa automaticky načíta zo Štatistického úradu SR podľa druhu paliva a dátumu odchodu.')
                                            : ''}>
                                            <TextField
                                                label={`Cena (${fi.priceUnit})`}
                                                type="number" fullWidth
                                                slotProps={{
                                                    inputLabel: { shrink: true },
                                                    formHelperText: { sx: { color: fuelPriceFetch.error ? 'error.main' : 'text.secondary' } },
                                                }}
                                                value={form.fuelPricePerLiter ?? ''}
                                                onChange={e => set('fuelPricePerLiter', e.target.value ? Number(e.target.value) : undefined)}
                                                helperText={fuelPriceFetch.loading ? 'Načítavam cenu zo ŠÚ SR…' : (fuelPriceFetch.error ?? ' ')} />
                                        </Tooltip>
                                    </Stack>
                                )
                            })()}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {ticketSegments.length > 0 && (
                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Lístky / letenky
                        </Typography>
                        <Stack sx={{ gap: 1.5, mt: 1.5 }}>
                            {ticketSegments.map(({ ti, si, seg }) => {
                                const cestovne = seg.expenses?.find(e => e.type === 'cestovne')
                                const defaultCur = allCountries.find(c => c.code === (seg.country ?? 'SK'))?.currency ?? 'EUR'
                                return (
                                    <Stack key={`${ti}-${si}`} direction={{ xs: 'column', sm: 'row' }}
                                        sx={{ gap: 1, alignItems: { sm: 'center' } }}>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                {TRANSPORT_OPTIONS.find(o => o.value === seg.transport)?.label ?? seg.transport}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                {fmtDate(seg.date)} · {seg.fromPlace || '—'} → {seg.toPlace || '—'}
                                            </Typography>
                                        </Box>
                                        <TextField type="number" size="small" label="Cena lístka" sx={{ width: 140 }}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                            value={cestovne?.amount || ''}
                                            onChange={e => updateSegExpense(ti, si, 'cestovne', Number(e.target.value), cestovne?.currency ?? defaultCur)} />
                                        <TextField size="small" label="Mena" sx={{ width: 80 }}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                            value={cestovne?.currency ?? defaultCur}
                                            onChange={e => updateSegExpense(ti, si, 'cestovne', cestovne?.amount ?? 0, e.target.value.toUpperCase())} />
                                    </Stack>
                                )
                            })}
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

            {staySegments.length > 0 && (
                <Card sx={sxCard}>
                    <CardContent>
                        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>
                            Nocľažné
                        </Typography>
                        <Stack sx={{ gap: 1.5, mt: 1.5 }}>
                            {staySegments.map(({ ti, si, place, dateFrom, dateTo, count, nights }) => {
                                const trip = (form.trips ?? [])[ti]
                                if (!trip) return null
                                const groupKey = `${ti}|${dateFrom}`
                                const expanded = count > 1 && expandedNights.has(groupKey)

                                const priceFields = (rowSi: number, fieldLabel: string) => {
                                    const seg = trip.segments[rowSi]
                                    if (!seg) return null
                                    const noclazne = seg.expenses?.find(e => e.type === 'noclazne')
                                    const defaultCur = allCountries.find(c => c.code === (seg.country ?? 'SK'))?.currency ?? 'EUR'
                                    return (
                                        <>
                                            <TextField type="number" size="small" label={fieldLabel} sx={{ width: 140 }}
                                                slotProps={{ inputLabel: { shrink: true } }}
                                                value={noclazne?.amount || ''}
                                                onChange={e => updateSegExpense(ti, rowSi, 'noclazne', Number(e.target.value), noclazne?.currency ?? defaultCur)} />
                                            <TextField size="small" label="Mena" sx={{ width: 80 }}
                                                slotProps={{ inputLabel: { shrink: true } }}
                                                value={noclazne?.currency ?? defaultCur}
                                                onChange={e => updateSegExpense(ti, rowSi, 'noclazne', noclazne?.amount ?? 0, e.target.value.toUpperCase())} />
                                        </>
                                    )
                                }

                                // Zlúčený riadok zobrazuje SÚČET nocí v skupine - ak boli ceny predtým
                                // zadané osobitne (v úsekoch alebo v rozbalenom pohľade) a líšia sa,
                                // vidno tu ich súčet, nie len jednu noc. Úprava zlúčeného poľa zapíše
                                // celú sumu na poslednú noc a ostatné v skupine vynuluje, nech súčet
                                // presne zodpovedá zadanej hodnote.
                                const groupSum = nights.reduce((s, n) => {
                                    const exp = trip.segments[n.si]?.expenses?.find(e => e.type === 'noclazne')
                                    return s + (exp?.amount ?? 0)
                                }, 0)
                                const groupCur = nights.map(n => trip.segments[n.si]?.expenses?.find(e => e.type === 'noclazne')?.currency).find(Boolean)
                                    ?? allCountries.find(c => c.code === (trip.segments[si]?.country ?? 'SK'))?.currency ?? 'EUR'
                                const mergedFields = (
                                    <>
                                        <TextField type="number" size="small" label={count > 1 ? 'Cena spolu' : 'Cena nocľahu'} sx={{ width: 140 }}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                            value={groupSum || ''}
                                            onChange={e => {
                                                const amount = Number(e.target.value)
                                                nights.forEach(n => updateSegExpense(ti, n.si, 'noclazne', n.si === si ? amount : 0, groupCur))
                                            }} />
                                        <TextField size="small" label="Mena" sx={{ width: 80 }}
                                            slotProps={{ inputLabel: { shrink: true } }}
                                            value={groupCur}
                                            onChange={e => {
                                                const cur = e.target.value.toUpperCase()
                                                nights.forEach(n => updateSegExpense(ti, n.si, 'noclazne', n.si === si ? groupSum : 0, cur))
                                            }} />
                                    </>
                                )

                                return (
                                    <Box key={groupKey}>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' } }}>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {place}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    {count > 1
                                                        ? `${count} ${count < 5 ? 'noci' : 'nocí'} · ${fmtDate(dateFrom)} – ${fmtDate(addDays(dateTo, 1))}`
                                                        : `Noc z ${fmtDate(dateFrom)}`}
                                                </Typography>
                                            </Box>
                                            {!expanded && mergedFields}
                                            {count > 1 && (
                                                <Button size="small" sx={{ flexShrink: 0 }}
                                                    onClick={() => setExpandedNights(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey)
                                                        return next
                                                    })}>
                                                    {expanded ? 'Zlúčiť' : 'Zadať osobitne'}
                                                </Button>
                                            )}
                                        </Stack>
                                        {expanded && (
                                            <Stack sx={{ gap: 1, mt: 1, pl: { sm: 3 } }}>
                                                {nights.map(n => (
                                                    <Stack key={n.date} direction={{ xs: 'column', sm: 'row' }}
                                                        sx={{ gap: 1, alignItems: { sm: 'center' } }}>
                                                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }}>
                                                            Noc z {fmtDate(n.date)}
                                                        </Typography>
                                                        {priceFields(n.si, 'Cena nocľahu')}
                                                    </Stack>
                                                ))}
                                            </Stack>
                                        )}
                                    </Box>
                                )
                            })}
                        </Stack>
                    </CardContent>
                </Card>
            )}

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
                            Výmenné kurzy
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, mb: 1.5 }}>
                            Vyplň pre meny, ktoré chceš prepočítať na EUR
                        </Typography>
                        <Stack sx={{ gap: 1.5 }}>
                            <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Tooltip title={onFetchExchangeRates
                                    ? 'Automaticky načítané z NBS (ku dňu pred odchodom). Hodnotu môžeš ručne upraviť.'
                                    : ''}>
                                    <TextField label="Dátum kurzu NBS" type="date" sx={{ maxWidth: 175 }}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        value={form.exchangeRateDate ?? ''}
                                        onChange={e => set('exchangeRateDate', e.target.value || null)} />
                                </Tooltip>
                                {rateFetch.loading && <CircularProgress size={18} />}
                            </Stack>
                            {rateFetch.error && (
                                <Typography variant="caption" color="error">{rateFetch.error}</Typography>
                            )}
                            {foreignCurrencies.map(currency => {
                                // Bez záznamu pre menu = prepočítať všetko (spätná kompatibilita).
                                const allCats = EXCHANGE_RATE_CATEGORIES.map(c => c.value)
                                // V detaile ponúkni len kategórie, ktoré v tejto mene reálne existujú
                                // (napr. len "Stravné", ak máš CZK iba pri stravnom).
                                const availableCats = EXCHANGE_RATE_CATEGORIES.filter(cat => categoriesByCurrency[currency]?.has(cat.value))
                                const selected = form.exchangeRateCategories?.[currency] ?? allCats
                                const allSelected = selected.length === allCats.length
                                const toggleCategory = (cat: string) => {
                                    const current = form.exchangeRateCategories?.[currency] ?? allCats
                                    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat]
                                    set('exchangeRateCategories', { ...form.exchangeRateCategories, [currency]: next })
                                }
                                const detailOpen = expandedRateCur.has(currency)
                                const toggleDetail = () => setExpandedRateCur(prev => {
                                    const next = new Set(prev)
                                    if (next.has(currency)) next.delete(currency); else next.add(currency)
                                    return next
                                })
                                return (
                                    <Stack key={currency} sx={{ gap: 0.25 }}>
                                        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <TextField label={`1 EUR = ? ${currency}`}
                                                type="number" sx={{ maxWidth: 155 }}
                                                slotProps={{ inputLabel: { shrink: true } }}
                                                value={form.exchangeRates?.[currency] ?? ''}
                                                onChange={e => set('exchangeRates', {
                                                    ...form.exchangeRates,
                                                    [currency]: e.target.value ? Number(e.target.value) : undefined,
                                                } as Record<string, number>)} />
                                            <FormControlLabel sx={{ mr: 0 }}
                                                control={<Switch size="small" checked={allSelected}
                                                    onChange={e => set('exchangeRateCategories', {
                                                        ...form.exchangeRateCategories,
                                                        [currency]: e.target.checked ? allCats : [],
                                                    })} />}
                                                label={<Typography variant="body2">Prepočítať všetko</Typography>} />
                                            <IconButton size="small" onClick={toggleDetail}
                                                aria-label="Podrobný výber kategórií">
                                                {detailOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                            </IconButton>
                                        </Stack>
                                        <Collapse in={detailOpen}>
                                            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    Prepočítať na EUR:
                                                </Typography>
                                                {availableCats.map(cat => (
                                                    <Chip key={cat.value} size="small" label={cat.label}
                                                        color={selected.includes(cat.value) ? 'primary' : 'default'}
                                                        variant={selected.includes(cat.value) ? 'filled' : 'outlined'}
                                                        onClick={() => toggleCategory(cat.value)} />
                                                ))}
                                            </Stack>
                                        </Collapse>
                                    </Stack>
                                )
                            })}
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
        const destinations = form.trips
            ?.map(t => [t.destination, ...(t.waypoints ?? []).map(w => w.place)].filter(Boolean).join(' → '))
            .filter(Boolean).join(' / ') || '—'

        return (
            <>
                {/* Validation errors */}
                {validationErrors.length > 0 && (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: '14px' }}
                        onClose={() => setValidationErrors([])}>
                        <Stack sx={{ gap: 0.25 }}>
                            {validationErrors.map((err, i) => (
                                <Typography key={i} variant="body2">{err}</Typography>
                            ))}
                        </Stack>
                    </Alert>
                )}

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
                        {transportSummaryLabel(form.trips ?? [])}
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

                {onAddAttachment && (
                    <Card sx={sxCard}>
                        <CardContent>
                            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.5 }}>Prílohy</Typography>
                                <Tooltip title="Pridať prílohu">
                                    <span>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={addingAttachment ? <CircularProgress size={14} /> : <AttachFile />}
                                            disabled={addingAttachment}
                                            onClick={handleAddAttachment}
                                            sx={{ borderRadius: '10px' }}
                                        >
                                            Pridať
                                        </Button>
                                    </span>
                                </Tooltip>
                            </Stack>

                            {/* Drop zone */}
                            {onAddAttachmentFromPath && (
                                <Box
                                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    sx={{
                                        border: '2px dashed',
                                        borderColor: dragOver ? 'primary.main' : 'divider',
                                        borderRadius: '12px',
                                        p: 1.5,
                                        mb: 1.5,
                                        textAlign: 'center',
                                        bgcolor: dragOver ? 'primary.50' : 'transparent',
                                        transition: 'all 0.2s',
                                        cursor: 'default',
                                    }}
                                >
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Presuňte súbory sem
                                    </Typography>
                                </Box>
                            )}

                            {attachments.length === 0 ? (
                                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, fontStyle: 'italic' }}>
                                    Žiadne prílohy (blok od tankovania, faktúra z hotela, mýto…)
                                </Typography>
                            ) : (
                                <Stack sx={{ gap: 0.75 }}>
                                    {attachments.map(att => (
                                        <Stack key={att.id} direction="row" sx={{ alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderRadius: '10px', border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
                                            <InsertDriveFile sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                                            <Typography
                                                variant="body2"
                                                sx={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                                onClick={() => openAttachmentPreview(att)}
                                            >
                                                {att.filename}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                                                {(att.size / 1024).toFixed(0)} kB
                                            </Typography>
                                            <IconButton size="small" color="error" onClick={() => handleDeleteAttachment(att.id)}>
                                                <Delete sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Stack>
                                    ))}
                                </Stack>
                            )}
                        </CardContent>
                    </Card>
                )}
            </>
        )
    }

    const stepContent = restricted
        ? [renderStep0, renderStep1]
        : [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

    // ── Step dots (mobile / tablet) ──────────────────────────────────────────

    const StepDots = () => (
        <Box sx={{ px: 2, pb: 2 }}>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 0.75 }}>
                {effectiveSteps.map((_, i) => (
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
                        {i < effectiveSteps.length - 1 && (
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
                Krok {activeStep + 1} z {effectiveSteps.length} — {effectiveSteps[activeStep]}
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
            <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                <Button variant="outlined"
                    onClick={() => goTo(activeStep - 1)}
                    disabled={activeStep === 0 || saving}
                    sx={{ flex: '1 1 90px', borderRadius: '12px', py: 1.2 }}>
                    Späť
                </Button>
                {activeStep < effectiveSteps.length - 1 ? (
                    <>
                        {!restricted && activeStep >= 1 && (isNew || form.status === 'planned') && (
                            <Button variant="outlined" color="secondary"
                                onClick={() => handleSave('planned')}
                                disabled={saving || !canSave}
                                sx={{ flex: '1 1 120px', borderRadius: '12px', py: 1.2 }}>
                                Naplánovať
                            </Button>
                        )}
                        <Button variant="contained"
                            onClick={() => goTo(activeStep + 1)}
                            disabled={!canNext}
                            sx={{ flex: '2 1 160px', borderRadius: '12px', py: 1.2, fontWeight: 700 }}>
                            Pokračovať
                        </Button>
                    </>
                ) : restricted ? (
                    <>
                        <Button variant="outlined"
                            onClick={() => handleSave('draft')}
                            disabled={saving || !canSave}
                            sx={{ flex: '1 1 100px', borderRadius: '12px', py: 1.2 }}>
                            Koncept
                        </Button>
                        <Button variant="contained" color="secondary"
                            onClick={() => handleSave('planned')}
                            disabled={saving || !canSave}
                            sx={{ flex: '1.5 1 180px', borderRadius: '12px', py: 1.2, fontWeight: 700 }}>
                            {saving ? 'Ukladám…' : 'Odoslať na schválenie'}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button variant="outlined" color="secondary"
                            onClick={() => handleSave('planned')}
                            disabled={saving || !canSave}
                            sx={{ flex: '1 1 120px', borderRadius: '12px', py: 1.2 }}>
                            Naplánovať
                        </Button>
                        <Button variant="outlined"
                            onClick={() => handleSave('draft')}
                            disabled={saving || !canSave}
                            sx={{ flex: '1 1 100px', borderRadius: '12px', py: 1.2 }}>
                            Koncept
                        </Button>
                        <Button variant="contained"
                            onClick={() => handleSave('navrh')}
                            disabled={saving || !canSave}
                            sx={{ flex: '1.5 1 140px', borderRadius: '12px', py: 1.2, fontWeight: 700 }}>
                            {saving ? 'Ukladám…' : 'Odoslať'}
                        </Button>
                    </>
                )}
            </Stack>
        </Paper>
    )

    // ── Render ───────────────────────────────────────────────────────────────

    const handleDialogClose = (_e: unknown, reason?: 'backdropClick' | 'escapeKeyDown') => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            setConfirmState({
                message: 'Zavrieť bez uloženia? Neuložené zmeny sa stratia.',
                onConfirm: () => { setConfirmState(null); onClose() },
            })
            return
        }
        onClose()
    }

    return (
    <>
        <Dialog
            open
            onClose={handleDialogClose}
            fullScreen={isMobile}
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
                        {restricted
                            ? (isNew ? 'Návrh pracovnej cesty' : 'Upraviť návrh pracovnej cesty')
                            : (isNew ? 'Nový cestovný príkaz' : 'Upraviť príkaz')}
                    </Typography>
                </Toolbar>

                {/* Compact dots — mobile and tablet */}
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                    <StepDots />
                </Box>

                {/* Full MUI stepper — desktop only */}
                <Box sx={{ display: { xs: 'none', md: 'block' }, px: 3, pb: 2 }}>
                    <Stepper activeStep={activeStep} sx={{ '& .MuiStepLabel-label': { fontSize: 13 } }}>
                        {effectiveSteps.map((label, i) => (
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
                        restricted={restricted}
                    />
                </Box>
            </Box>

            {/* ── Footer ── */}
            <FooterButtons />
        </Dialog>

        {/* ── Preview dialog ── */}
        {previewState && (
            <Dialog open onClose={closePreview} maxWidth="lg" fullWidth
                slotProps={{ paper: { sx: { height: '90vh', borderRadius: '16px' } } }}>
                <AppBar position="sticky" color="default" elevation={0}
                    sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Toolbar sx={{ gap: 1 }}>
                        <IconButton edge="start" onClick={closePreview}><ArrowBack /></IconButton>
                        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600, fontSize: 15 }} noWrap>
                            {previewState.name}
                        </Typography>
                    </Toolbar>
                </AppBar>
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 0 }}>
                    {previewState.mimeType === 'application/pdf' ? (
                        <embed src={previewState.url} type="application/pdf" width="100%" height="100%" style={{ flex: 1, minHeight: 0 }} />
                    ) : (
                        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                            <img src={previewState.url} alt={previewState.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </Box>
                    )}
                </Box>
            </Dialog>
        )}

        {/* ── Výber trasy (alternatívy z OSM) ── */}
        {routeOptions && (
            <Dialog open onClose={() => setRouteOptions(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Vyberte trasu</DialogTitle>
                <DialogContent>
                    <Stack sx={{ gap: 1.25, mt: 0.5 }}>
                        {routeOptions.options.map((opt, i) => {
                            const h = Math.floor(opt.durationMin / 60)
                            const m = opt.durationMin % 60
                            return (
                                <Card key={i} variant="outlined"
                                    sx={{ cursor: 'pointer', borderRadius: '14px', overflow: 'hidden', '&:hover': { borderColor: 'primary.main' } }}
                                    onClick={() => chooseRoute(opt)}>
                                    <RouteMap coordinates={opt.coordinates} />
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                            {opt.km} km · {h > 0 ? `${h} h ` : ''}{m} min
                                        </Typography>
                                        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                            {opt.countries.map((c, ci) => (
                                                <Fragment key={ci}>
                                                    {ci > 0 && (
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
                                                    )}
                                                    <Box component="img"
                                                        src={`https://flagcdn.com/24x18/${c.country.toLowerCase()}.png`}
                                                        alt={c.country}
                                                        width={20} height={15}
                                                        sx={{ borderRadius: '2px', display: 'block', flexShrink: 0 }}
                                                        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                                                    />
                                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                        {countryLabelByCode.get(c.country) ?? c.country}
                                                    </Typography>
                                                </Fragment>
                                            ))}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRouteOptions(null)}>Zrušiť</Button>
                </DialogActions>
            </Dialog>
        )}

        <ConfirmDialog
            open={!!confirmState}
            message={confirmState?.message ?? ''}
            danger
            onConfirm={() => confirmState?.onConfirm()}
            onCancel={() => setConfirmState(null)}
        />
    </>
    )
}

export default OrderDialog
