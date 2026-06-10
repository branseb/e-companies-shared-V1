import { useMemo, useState } from 'react'
import {
    Autocomplete, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import type { TravelOrderInput, Trip, TripSegment, StravneRates, EmployeeRecord } from '../types'
import { TRANSPORT_OPTIONS, STATUS_OPTIONS } from '../constants'
import {
    calcFuelCost, calcAmortization, calcDailyStravne,
    getRatesForDate, getAllCountries,
    emptyTrip, fmtDate, calcSegStravne,
} from '../helpers'
import FormSection from './FormSection'
import SegmentEditor from './SegmentEditor'

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

    const foreignCurrencies = useMemo(() => {
        const countries = [...new Set(
            (form.trips ?? []).flatMap(t => t.segments)
                .map(s => s.country ?? 'SK')
                .filter(c => c !== 'SK')
        )]
        const allCtry = getAllCountries(ratesHistory)
        const curs = countries.map(c => allCtry.find(o => o.code === c)?.currency ?? 'EUR').filter(c => c !== 'EUR')
        return [...new Set(curs)]
    }, [form.trips, ratesHistory])

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
        const bp      = ctry.borderPrefix

        const mkSeg = (date: string, from: string, fromTime: string, to: string, toTime = '', segCountry = 'SK'): TripSegment =>
            ({ date, fromPlace: from, fromTime, toPlace: to, toTime, transport: trans, km: null, stravne: null, country: segCountry, nbsDate: null })

        const midDays: string[] = []
        const d0 = new Date(depDate), d1 = new Date(retDate)
        const dayDiff = Math.round((d1.getTime() - d0.getTime()) / 86_400_000)
        for (let d = 1; d < dayDiff; d++) {
            const nd = new Date(d0)
            nd.setDate(nd.getDate() + d)
            midDays.push(nd.toISOString().split('T')[0])
        }
        const midCtry = foreign ? ctry.code : 'SK'
        const midSegs: TripSegment[] = midDays.map(date => mkSeg(date, dest, '00:00', dest, '00:00', midCtry))

        const overnight = dayDiff >= 1
        const arrToTime   = overnight ? '00:00' : ''
        const retFromTime = overnight ? '00:00' : ''

        const segs: TripSegment[] = foreign ? [
            mkSeg(depDate, depLoc,         depTime,      `hr. SK-${bp}`, '',          'SK'),
            mkSeg(depDate, `hr. SK-${bp}`, '',            dest,          arrToTime,   ctry.code),
            ...midSegs,
            mkSeg(retDate, dest,           retFromTime,  `hr. ${bp}-SK`, '',          ctry.code),
            mkSeg(retDate, `hr. ${bp}-SK`, '',            retLoc,        '',          'SK'),
        ] : [
            mkSeg(depDate, depLoc, depTime,    dest,   arrToTime, 'SK'),
            ...midSegs,
            mkSeg(retDate, dest,   retFromTime, retLoc, '', 'SK'),
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

    const addTrip = () => {
        const loc = employees.find(e => e.name === form.employee)?.defaultLocation ?? ''
        const trips0 = form.trips ?? []
        const lastTrip = trips0[trips0.length - 1]
        const date = lastTrip?.returnDate || form.departureDate || new Date().toISOString().split('T')[0]
        const trip = emptyTrip(date, form.transportType ?? 'car')
        if (loc) { trip.departureLocation = loc; trip.returnLocation = loc }
        set('trips', [...(form.trips ?? []), trip])
    }

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
                                } else {
                                    set('transportType', 'company_car')
                                }
                                set('ecv', val.defaultEcv ?? '')
                            }
                        }}
                        renderInput={params => (
                            <TextField {...params} label="Meno a priezvisko" required size="small" fullWidth />
                        )}
                    />
                    <TextField label="Bydlisko" fullWidth size="small"
                        value={form.employeeAddress ?? ''}
                        onChange={e => set('employeeAddress', e.target.value)} />

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

                                {trip.destination && trip.departureDate && trip.returnDate && (
                                    <Button size="small" variant="outlined"
                                        sx={{ alignSelf: 'flex-start' }}
                                        onClick={() => {
                                            if (trip.segments.length > 0 && !window.confirm('Prepočítať úseky? Existujúce úseky budú nahradené.')) return
                                            generateTripSegments(ti)
                                        }}>
                                        {trip.segments.length === 0 ? 'Vygenerovať úseky (tam + pobyt + späť)' : 'Prepočítať úseky'}
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
                        <TextField label="EČV (evidenčné číslo vozidla)" size="small" sx={{ width: 200 }}
                            value={form.ecv ?? ''}
                            onChange={e => set('ecv', e.target.value.toUpperCase())} />
                    )}
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

                    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
                            Poskytnuté bezplatne:
                        </Typography>
                        {(['freeRanajky', 'freeObed', 'freeVecera'] as const).map(field => (
                            <FormControlLabel key={field}
                                control={
                                    <Checkbox size="small"
                                        checked={!!form[field]}
                                        onChange={e => set(field, e.target.checked)} />
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

                    {foreignCurrencies.length > 0 && (
                        <Stack sx={{ gap: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Kurz NBS — vyplň pre meny, ktoré chceš prepočítať na EUR (ostatné zostanú v pôvodnej mene)
                            </Typography>
                            <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
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
                                checked={!!form.includeAccounting}
                                onChange={e => set('includeAccounting', e.target.checked)} />
                        }
                        label="Zahrnúť vyúčtovanie do PDF"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox size="small"
                                checked={!!form.includeAdminFields}
                                onChange={e => set('includeAdminFields', e.target.checked)} />
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

export default OrderDialog
