import { useState } from 'react'
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControlLabel, IconButton, Stack, Switch, Table, TableBody, TableCell, TableHead,
    TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import type { StravneRates, StravneRatesEntry, CompanyRateConfig } from '../types'
import { COUNTRY_OPTIONS, AMORTIZATION_RATE, DEFAULT_ENTRY } from '../constants'
import { fmtDate } from '../helpers'

type RatesDialogProps = {
    history: StravneRates
    onSave: (history: StravneRates) => void
    onClose: () => void
    companyRates?: CompanyRateConfig | null
    onCompanyRatesSave?: (rates: CompanyRateConfig) => void
}

const newEntry = (): StravneRatesEntry => ({
    ...DEFAULT_ENTRY,
    validFrom: new Date().toISOString().split('T')[0],
})

const RatesDialog = ({ history, onSave, onClose, companyRates, onCompanyRatesSave }: RatesDialogProps) => {
    const [company, setCompany] = useState<CompanyRateConfig>(companyRates ?? {})
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
            <DialogTitle>Sadzby stravného</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 0, mt: 1 }}>

                    <Divider textAlign="left" sx={{ mb: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            Firemné sadzby
                        </Typography>
                    </Divider>
                    <Stack sx={{ gap: 1.5, px: 0.5, pb: 3 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={!company.useLegalRates}
                                    onChange={e => setCompany(c => ({ ...c, useLegalRates: !e.target.checked }))}
                                />
                            }
                            label={
                                <Typography variant="body2">
                                    Použiť firemné sadzby
                                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                                        (ak vypnuté, použijú sa zákonné sadzby pre všetkých bez vlastného prepisu)
                                    </Typography>
                                </Typography>
                            }
                        />
                        {!company.useLegalRates && (
                            <Stack sx={{ gap: 2 }}>
                                <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                                    <TextField
                                        label="Sadzba km (EUR/km)"
                                        type="number" size="small" sx={{ width: 180 }}
                                        slotProps={{ htmlInput: { step: 0.001 } }}
                                        placeholder="0.313 (zákonná)"
                                        value={company.kmRate ?? ''}
                                        onChange={e => setCompany(c => ({ ...c, kmRate: e.target.value ? Number(e.target.value) : null }))}
                                        helperText="Prázdne = zákonná sadzba"
                                    />
                                    <TextField
                                        label="Stravné 5–12 hod."
                                        type="number" size="small" sx={{ width: 160 }}
                                        placeholder="zákonná"
                                        value={company.meal5_12 ?? ''}
                                        onChange={e => setCompany(c => ({ ...c, meal5_12: e.target.value ? Number(e.target.value) : null }))}
                                    />
                                    <TextField
                                        label="Stravné 12–18 hod."
                                        type="number" size="small" sx={{ width: 160 }}
                                        placeholder="zákonná"
                                        value={company.meal12_18 ?? ''}
                                        onChange={e => setCompany(c => ({ ...c, meal12_18: e.target.value ? Number(e.target.value) : null }))}
                                    />
                                    <TextField
                                        label="Stravné 18+ hod."
                                        type="number" size="small" sx={{ width: 160 }}
                                        placeholder="zákonná"
                                        value={company.meal18plus ?? ''}
                                        onChange={e => setCompany(c => ({ ...c, meal18plus: e.target.value ? Number(e.target.value) : null }))}
                                    />
                                </Stack>

                                <Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                                        Zahraničné stravné — firemné prepisy (prázdne = zákonná sadzba)
                                    </Typography>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Krajina</TableCell>
                                                <TableCell sx={{ width: 60 }}>Mena</TableCell>
                                                <TableCell sx={{ width: 130 }}>Plná sadzba (12+ hod.)</TableCell>
                                                <TableCell sx={{ width: 90, color: 'text.secondary', fontSize: 12 }}>Zákonná</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {active && Object.entries(active.foreign).map(([code, fr]) => {
                                                const base = COUNTRY_OPTIONS.find(c => c.code === code)
                                                const label = base?.label ?? fr.label ?? code
                                                const companyVal = company.foreign?.[code]
                                                return (
                                                    <TableRow key={code}>
                                                        <TableCell>{label}</TableCell>
                                                        <TableCell sx={{ color: 'text.secondary' }}>{fr.currency}</TableCell>
                                                        <TableCell sx={{ p: 0.5 }}>
                                                            <Tooltip title="Prázdne = zákonná sadzba" placement="top">
                                                                <TextField
                                                                    type="number" size="small" fullWidth
                                                                    placeholder={fr.rate_12 ? String(fr.rate_12) : '—'}
                                                                    value={companyVal ?? ''}
                                                                    onChange={e => setCompany(c => ({
                                                                        ...c,
                                                                        foreign: {
                                                                            ...c.foreign,
                                                                            [code]: e.target.value ? Number(e.target.value) : null,
                                                                        },
                                                                    }))}
                                                                />
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                            {fr.rate_12 || '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </Box>
                            </Stack>
                        )}
                    </Stack>

                    <Divider textAlign="left" sx={{ mb: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            Zákonné sadzby stravného (po obdobiach)
                        </Typography>
                    </Divider>
                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', pb: 2 }}>
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
                            <Divider textAlign="left" sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Platnosť
                                </Typography>
                            </Divider>
                            <Box sx={{ px: 0.5, pb: 2 }}>
                                <TextField label="Platné od" type="date" size="small" sx={{ width: 160 }}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    value={active.validFrom}
                                    onChange={e => updateActive({ validFrom: e.target.value })} />
                            </Box>

                            <Divider textAlign="left" sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Tuzemsko (SR) — EUR
                                </Typography>
                            </Divider>
                            <Stack direction="row" sx={{ gap: 1.5, px: 0.5, pb: 3 }}>
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

                            <Divider textAlign="left" sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Krátenie za bezplatné stravovanie
                                </Typography>
                            </Divider>
                            <Stack direction="row" sx={{ gap: 1.5, px: 0.5, pb: 3 }}>
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

                            <Divider textAlign="left" sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Amortizácia vozidla
                                </Typography>
                            </Divider>
                            <Stack direction="row" sx={{ gap: 1.5, px: 0.5, pb: 3, alignItems: 'center' }}>
                                <TextField label="Sadzba (EUR/km)" type="number" size="small" sx={{ width: 180 }}
                                    slotProps={{ htmlInput: { step: 0.001 } }}
                                    value={active.amortizationRate ?? AMORTIZATION_RATE}
                                    onChange={e => updateActive({ amortizationRate: e.target.value ? Number(e.target.value) : AMORTIZATION_RATE })} />
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    zákon č. 283/2002 Z.z.
                                </Typography>
                            </Stack>

                            <Divider textAlign="left" sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Zahraničie
                                </Typography>
                            </Divider>
                            <Box sx={{ px: 0.5 }}>
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
                <Button variant="contained" onClick={() => {
                    onSave(entries)
                    onCompanyRatesSave?.(company)
                    onClose()
                }}>Uložiť</Button>
            </DialogActions>
        </Dialog>
    )
}

export default RatesDialog
