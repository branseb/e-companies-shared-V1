import { useState } from 'react'
import {
    Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip,
} from '@mui/material'
import { Add, ArrowDownward, ArrowUpward, Delete, Receipt } from '@mui/icons-material'
import type { TripSegment, StravneRates, CountryOption } from '../types'
import { TRANSPORT_OPTIONS, EXPENSE_TYPES, COUNTRY_OPTIONS } from '../constants'
import { calcSegStravne, getRatesForDate } from '../helpers'
import { emptySegment } from '../helpers'

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
                    onClick={() => {
                        const c = COUNTRY_OPTIONS.find(o => o.code === (seg.country ?? 'SK'))?.currency ?? 'EUR'
                        updateExpenses(i, [...(seg.expenses ?? []), { type: 'cestovne', amount: 0, currency: c }])
                    }}>
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
                            <TextField select size="small" sx={{ width: 90 }} label="Krajina"
                                slotProps={{ inputLabel: { shrink: true } }}
                                value={seg.country ?? defaultCountry}
                                onChange={e => update(i, 'country', e.target.value)}>
                                {allCountries.map(c => (
                                    <MenuItem key={c.code} value={c.code}>{c.code}</MenuItem>
                                ))}
                            </TextField>
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

export default SegmentEditor
