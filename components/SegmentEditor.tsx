import { useState } from 'react'
import {
    Alert, Box, Button, IconButton, ListItemIcon, Menu, MenuItem, Paper, Stack, TextField, Tooltip,
} from '@mui/material'
import { Add, ArrowDownward, ArrowUpward, Delete, MoreVert, Receipt } from '@mui/icons-material'
import type { TripSegment, StravneRates, CountryOption } from '../types'
import { TRANSPORT_OPTIONS, EXPENSE_TYPES } from '../constants'
import { calcSegStravne, getRatesForDate } from '../helpers'
import { emptySegment } from '../helpers'
import TimePickerField from './TimePickerField'
import CountryAutocomplete from './CountryAutocomplete'

type ExpenseEntry = { type: string; amount: number; currency: string }

type ExpensesBlockProps = {
    i: number
    seg: TripSegment
    allCountries: CountryOption[]
    onUpdate: (i: number, expenses: ExpenseEntry[]) => void
    vreckoveLimit?: number
    vreckoveLimitCur?: string
    exchangeRates?: Record<string, number> | null
}

const ExpensesBlock = ({ i, seg, allCountries, onUpdate, vreckoveLimit, vreckoveLimitCur, exchangeRates }: ExpensesBlockProps) => (
    <Box sx={{ pl: { xs: 1, sm: 5 }, pr: 1, py: 0.5, bgcolor: 'action.hover' }}>
        <Stack sx={{ gap: 0.5 }}>
            {(seg.expenses ?? []).map((exp, ei) => {
                const isVreckove = exp.type === 'vreckove'
                const hasLimit = isVreckove && vreckoveLimit != null && vreckoveLimit > 0
                const expCur = exp.currency || 'EUR'
                const limitCur = vreckoveLimitCur || 'EUR'
                const fmtLim = (n: number) => limitCur === 'EUR' ? `${n.toFixed(2)} €` : `${n.toFixed(2)} ${limitCur}`

                let overLimit = false
                let helperText: string | undefined

                if (hasLimit) {
                    if (expCur === limitCur) {
                        overLimit = exp.amount > vreckoveLimit!
                        helperText = overLimit
                            ? `Nadlimit! Max. ${fmtLim(vreckoveLimit!)} → zdaniteľný príjem`
                            : `Max. bez dane: ${fmtLim(vreckoveLimit!)} (40 % diét)`
                    } else if (limitCur === 'EUR' && expCur !== 'EUR') {
                        const rate = exchangeRates?.[expCur]
                        if (rate && rate > 0) {
                            overLimit = exp.amount / rate > vreckoveLimit!
                            const limitInExpCur = +(vreckoveLimit! * rate).toFixed(2)
                            helperText = overLimit
                                ? `Nadlimit! Max. ≈ ${limitInExpCur.toFixed(2)} ${expCur} (${vreckoveLimit!.toFixed(2)} €) → zdaniteľný príjem`
                                : `Max. bez dane: ≈ ${limitInExpCur.toFixed(2)} ${expCur} (${vreckoveLimit!.toFixed(2)} €, 40 % diét)`
                        } else {
                            helperText = `Max. bez dane: ${vreckoveLimit!.toFixed(2)} € — nastav kurz ${expCur}/EUR`
                        }
                    } else {
                        helperText = `Max. bez dane: ${fmtLim(vreckoveLimit!)} (40 % diét)`
                    }
                }

                return (
                    <Stack key={ei} direction="row" sx={{ gap: 0.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <TextField select size="small" sx={{ width: 160 }} label="Typ"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.type || 'cestovne'}
                            onChange={e => onUpdate(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, type: e.target.value } : x))}>
                            {EXPENSE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </TextField>
                        <TextField type="number" size="small" sx={{ width: 120 }} label="Suma"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.amount || ''}
                            error={overLimit}
                            helperText={helperText}
                            onChange={e => onUpdate(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, amount: Number(e.target.value) } : x))} />
                        <TextField size="small" sx={{ width: 68 }} label="Mena"
                            slotProps={{ inputLabel: { shrink: true } }}
                            value={exp.currency}
                            onChange={e => onUpdate(i, (seg.expenses ?? []).map((x, j) => j === ei ? { ...x, currency: e.target.value.toUpperCase() } : x))} />
                        <IconButton size="small" color="error" sx={{ mt: 0.5 }}
                            onClick={() => onUpdate(i, (seg.expenses ?? []).filter((_, j) => j !== ei))}>
                            <Delete fontSize="small" />
                        </IconButton>
                    </Stack>
                )
            })}
            <Button size="small" startIcon={<Add />} sx={{ alignSelf: 'flex-start' }}
                onClick={() => {
                    const c = allCountries.find(o => o.code === (seg.country ?? 'SK'))?.currency ?? 'EUR'
                    onUpdate(i, [...(seg.expenses ?? []), { type: 'cestovne', amount: 0, currency: c }])
                }}>
                Pridať výdavok
            </Button>
        </Stack>
    </Box>
)

type SegEditorProps = {
    segments: TripSegment[]
    tripDate: string
    transport: string
    defaultCountry: string
    ratesHistory: StravneRates
    allCountries: CountryOption[]
    onChange: (segs: TripSegment[]) => void
    vreckoveLimit?: number
    vreckoveLimitCur?: string
    exchangeRates?: Record<string, number> | null
}

const SegmentEditor = ({ segments, tripDate, transport, defaultCountry, ratesHistory, allCountries, onChange, vreckoveLimit, vreckoveLimitCur, exchangeRates }: SegEditorProps) => {
    const [expandedExp, setExpandedExp] = useState<Set<number>>(new Set())
    const [menuAnchor, setMenuAnchor] = useState<{ i: number; el: HTMLElement } | null>(null)
    const segRates = (date: string) => getRatesForDate(ratesHistory, date || tripDate)
    const segCtry = (seg: TripSegment) => seg.country ?? defaultCountry

    const update = (i: number, field: keyof TripSegment, value: TripSegment[typeof field]) => {
        const s = [...segments]
        s[i] = { ...s[i], [field]: value }
        if (field === 'toTime' && s[i + 1] && s[i + 1].fromPlace === s[i].toPlace && s[i + 1].date === s[i].date) {
            s[i + 1] = { ...s[i + 1], fromTime: value as string }
            s[i + 1] = { ...s[i + 1], stravne: calcSegStravne(s[i + 1].fromTime, s[i + 1].toTime, segCtry(s[i + 1]), segRates(s[i + 1].date)) }
        }
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

    return (
        <Stack sx={{ gap: 1.5 }}>
            {segments.map((seg, i) => (
                <Paper key={i} variant="outlined" sx={{ p: { xs: 1.5, sm: 1 }, bgcolor: i % 2 === 1 ? 'action.hover' : undefined }}>
                    <Stack sx={{
                        gap: 1,
                        '& .MuiOutlinedInput-input': {
                            py: { xs: '8.5px', sm: '16.5px' },
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                        },
                        '& .MuiInputLabel-root': {
                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        },
                        '& .MuiSelect-select': {
                            py: { xs: '8.5px', sm: '16.5px' },
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                        },
                        '& .MuiAutocomplete-root .MuiOutlinedInput-root': {
                            py: { xs: '0px', sm: '9px' },
                        },
                    }}>

                        {/* Riadok 1: Dátum + Doprava + Akcie */}
                        <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                            <TextField type="date" label="Dátum" sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.date}
                                onChange={e => update(i, 'date', e.target.value)} />
                            <TextField select label="Doprava" sx={{ width: { xs: 100, sm: 90 } }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.transport}
                                onChange={e => update(i, 'transport', e.target.value)}>
                                {TRANSPORT_OPTIONS.map(o => (
                                    <MenuItem key={o.value} value={o.value}>{o.short}</MenuItem>
                                ))}
                            </TextField>

                            {/* Desktop: všetky 3 tlačidlá */}
                            <Stack direction="row" sx={{ display: { xs: 'none', sm: 'flex' } }}>
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
                            </Stack>

                            {/* Mobile: MoreVert menu */}
                            <IconButton
                                size="small"
                                sx={{ display: { xs: 'flex', sm: 'none' } }}
                                color={seg.expenses?.length ? 'primary' : 'default'}
                                onClick={e => setMenuAnchor({ i, el: e.currentTarget })}>
                                <MoreVert fontSize="small" />
                            </IconButton>

                            <IconButton size="small" color="error" onClick={() => remove(i)}>
                                <Delete fontSize="small" />
                            </IconButton>
                        </Stack>

                        {/* MoreVert menu pre mobile */}
                        <Menu
                            open={menuAnchor?.i === i}
                            anchorEl={menuAnchor?.el}
                            onClose={() => setMenuAnchor(null)}>
                            <MenuItem disabled={i === 0} onClick={() => { move(i, -1); setMenuAnchor(null) }}>
                                <ListItemIcon><ArrowUpward fontSize="small" /></ListItemIcon>
                                Posunúť hore
                            </MenuItem>
                            <MenuItem disabled={i === segments.length - 1} onClick={() => { move(i, 1); setMenuAnchor(null) }}>
                                <ListItemIcon><ArrowDownward fontSize="small" /></ListItemIcon>
                                Posunúť dole
                            </MenuItem>
                            <MenuItem onClick={() => { toggleExp(i); setMenuAnchor(null) }}>
                                <ListItemIcon>
                                    <Receipt fontSize="small" color={seg.expenses?.length ? 'primary' : 'inherit'} />
                                </ListItemIcon>
                                Výdavky{seg.expenses?.length ? ` (${seg.expenses.length})` : ''}
                            </MenuItem>
                        </Menu>

                        {/* Riadok 2: Odchod z + Čas od */}
                        <Stack direction="row" sx={{ gap: 1 }}>
                            <TextField label="Odchod z" sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.fromPlace}
                                onChange={e => update(i, 'fromPlace', e.target.value)} />
                            <TimePickerField label="Čas od" sx={{ width: { xs: 92, sm: 130 } }}
                                value={seg.fromTime}
                                onChange={v => update(i, 'fromTime', v)} />
                        </Stack>

                        {/* Riadok 3: Príchod do + Čas do */}
                        <Stack direction="row" sx={{ gap: 1 }}>
                            <TextField label="Príchod do" sx={{ flex: 1 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.toPlace}
                                onChange={e => update(i, 'toPlace', e.target.value)} />
                            <TimePickerField label="Čas do" sx={{ width: { xs: 92, sm: 130 } }}
                                value={seg.toTime}
                                onChange={v => update(i, 'toTime', v)} />
                        </Stack>

                        {/* Riadok 4: km + Krajina */}
                        <Stack direction="row" sx={{ gap: 1 }}>
                            <TextField type="number" sx={{ flex: 1 }} label="km"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.km ?? ''}
                                onChange={e => update(i, 'km', e.target.value ? Number(e.target.value) : null)} />
                            <CountryAutocomplete
                                size="medium"
                                sx={{ width: 170 }}
                                value={seg.country ?? defaultCountry}
                                allCountries={allCountries}
                                onChange={v => update(i, 'country', v)}
                            />
                        </Stack>

                        {(() => {
                            const country = seg.country ?? defaultCountry
                            if (country === 'SK') return null
                            const entry = segRates(seg.date)
                            const fr = entry.foreign[country]
                            if (fr && fr.rate_12 > 0) return null
                            return (
                                <Alert severity="warning" sx={{ py: 0, px: 1, fontSize: 11 }}>
                                    Sadzba stravného pre <strong>{country}</strong> nie je nastavená.
                                    Nastavte ju v <em>Sadzby stravného</em>.
                                </Alert>
                            )
                        })()}
                    </Stack>
                    {expandedExp.has(i) && <ExpensesBlock i={i} seg={seg} allCountries={allCountries} onUpdate={updateExpenses} vreckoveLimit={vreckoveLimit} vreckoveLimitCur={vreckoveLimitCur} exchangeRates={exchangeRates} />}
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

export default SegmentEditor
