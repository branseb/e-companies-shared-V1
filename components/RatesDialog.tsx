import { useState } from 'react'
import {
    Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead,
    TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import type { StravneRates, StravneRatesEntry, CompanyRateConfig } from '../types'
import { fmtDate } from '../helpers'

type RatesDialogProps = {
    onClose: () => void
    companyRates?: CompanyRateConfig | null
    onSave: (rates: CompanyRateConfig) => void
    legalEntry?: StravneRatesEntry | null
    ratesHistory?: StravneRates | null
}

const RatesDialog = ({ onClose, companyRates, onSave, legalEntry, ratesHistory }: RatesDialogProps) => {
    const [tab, setTab] = useState<'legal' | 'company'>('legal')
    const [company, setCompany] = useState<CompanyRateConfig>(companyRates ?? {})

    const sorted = ratesHistory ? [...ratesHistory].sort((a, b) => b.validFrom.localeCompare(a.validFrom)) : null
    const [selIdx, setSelIdx] = useState(0)
    const entry: StravneRatesEntry | null | undefined = sorted ? sorted[selIdx] : legalEntry

    return (
        <Dialog open onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Sadzby stravného</DialogTitle>
            <DialogContent sx={{ px: 0, pt: 0 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tab label="Zákonné sadzby" value="legal" />
                    <Tab label="Firemné sadzby" value="company" />
                </Tabs>

                <Stack sx={{ gap: 2, px: 3 }}>

                    {tab === 'legal' && (
                        <>
                            {!entry ? (
                                <Typography sx={{ color: 'text.secondary' }}>Sadzby sa načítavajú…</Typography>
                            ) : (
                                <>
                                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {sorted && sorted.length > 1 ? (
                                            sorted.map((e, i) => (
                                                <Chip
                                                    key={e.validFrom}
                                                    size="small"
                                                    label={`od ${fmtDate(e.validFrom)}`}
                                                    color={i === selIdx ? 'primary' : 'default'}
                                                    variant={i === selIdx ? 'filled' : 'outlined'}
                                                    onClick={() => setSelIdx(i)}
                                                    sx={{ cursor: 'pointer' }}
                                                />
                                            ))
                                        ) : (
                                            <Chip size="small" label={`platné od ${fmtDate(entry.validFrom)}`} color="primary" />
                                        )}
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            Sadzby sú spravované centrálne a aktualizujú sa automaticky.
                                        </Typography>
                                    </Stack>

                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                            Tuzemsko (SR) — EUR
                                        </Typography>
                                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                                            {[
                                                { label: '5–12 hod.', value: `${entry.sk_5} EUR` },
                                                { label: '12–18 hod.', value: `${entry.sk_12} EUR` },
                                                { label: '18+ hod.', value: `${entry.sk_18} EUR` },
                                                { label: 'Amortizácia', value: `${entry.amortizationRate ?? '—'} EUR/km` },
                                            ].map(({ label, value }) => (
                                                <Box key={label} sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, minWidth: 110 }}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>{label}</Typography>
                                                    <Typography sx={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </Box>

                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                            Krátenie za bezplatné stravovanie
                                        </Typography>
                                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                                            {[
                                                { label: 'Raňajky', value: `${(entry.meals.ranajky * 100).toFixed(0)} %` },
                                                { label: 'Obed', value: `${(entry.meals.obed * 100).toFixed(0)} %` },
                                                { label: 'Večera', value: `${(entry.meals.vecera * 100).toFixed(0)} %` },
                                            ].map(({ label, value }) => (
                                                <Box key={label} sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, minWidth: 90 }}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>{label}</Typography>
                                                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{value}</Typography>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </Box>

                                    {Object.keys(entry.foreign).length > 0 && (
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                                Zahraničné stravné (plná sadzba — 12+ hod.)
                                            </Typography>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Krajina</TableCell>
                                                        <TableCell sx={{ width: 60 }}>Mena</TableCell>
                                                        <TableCell sx={{ width: 90 }}>0–6 hod.</TableCell>
                                                        <TableCell sx={{ width: 90 }}>6–12 hod.</TableCell>
                                                        <TableCell sx={{ width: 110 }}>12+ hod.</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {Object.entries(entry.foreign)
                                                        .filter(([code]) => code !== 'OTHER')
                                                        .map(([code, fr]) => (
                                                            <TableRow key={code}>
                                                                <TableCell>{fr.label ?? code}</TableCell>
                                                                <TableCell sx={{ color: 'text.secondary' }}>{fr.currency}</TableCell>
                                                                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                                    {fr.rate_12 ? (fr.rate_12 * 0.25).toFixed(2) : '—'}
                                                                </TableCell>
                                                                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                                    {fr.rate_12 ? (fr.rate_12 * 0.5).toFixed(2) : '—'}
                                                                </TableCell>
                                                                <TableCell sx={{ fontWeight: 500 }}>{fr.rate_12 || '—'}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                </TableBody>
                                            </Table>
                                        </Box>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {tab === 'company' && (
                        <Stack sx={{ gap: 2 }}>
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
                                            (ak vypnuté, použijú sa zákonné sadzby pre všetkých)
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
                                            placeholder={entry?.amortizationRate ? String(entry.amortizationRate) : '0.313'}
                                            value={company.kmRate ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, kmRate: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná sadzba"
                                        />
                                        <TextField
                                            label="Stravné 5–12 hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={entry?.sk_5 ? String(entry.sk_5) : 'zákonná'}
                                            value={company.meal5_12 ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal5_12: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                        <TextField
                                            label="Stravné 12–18 hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={entry?.sk_12 ? String(entry.sk_12) : 'zákonná'}
                                            value={company.meal12_18 ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal12_18: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                        <TextField
                                            label="Stravné 18+ hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={entry?.sk_18 ? String(entry.sk_18) : 'zákonná'}
                                            value={company.meal18plus ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal18plus: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                    </Stack>

                                    {entry && Object.keys(entry.foreign).length > 0 && (() => {
                                        const overrides = Object.entries(company.foreign ?? {}).filter(([, v]) => v != null) as [string, number][]
                                        const overrideCodes = new Set(overrides.map(([c]) => c))
                                        const available = Object.entries(entry.foreign)
                                            .filter(([code]) => code !== 'OTHER' && !overrideCodes.has(code))
                                            .map(([code, fr]) => ({ code, label: fr.label ?? code }))
                                            .sort((a, b) => a.label.localeCompare(b.label, 'sk'))
                                        return (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                                                    Zahraničné stravné — firemné prepisy
                                                </Typography>
                                                {overrides.length > 0 && (
                                                    <Table size="small" sx={{ mb: 1 }}>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>Krajina</TableCell>
                                                                <TableCell sx={{ width: 60 }}>Mena</TableCell>
                                                                <TableCell sx={{ width: 130 }}>Firemná (12+ hod.)</TableCell>
                                                                <TableCell sx={{ width: 80, color: 'text.secondary', fontSize: 12 }}>Zákonná</TableCell>
                                                                <TableCell sx={{ width: 40 }} />
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {overrides.map(([code, val]) => {
                                                                const fr = entry.foreign[code]
                                                                return (
                                                                    <TableRow key={code}>
                                                                        <TableCell>{fr?.label ?? code}</TableCell>
                                                                        <TableCell sx={{ color: 'text.secondary' }}>{fr?.currency}</TableCell>
                                                                        <TableCell sx={{ p: 0.5 }}>
                                                                            <TextField
                                                                                type="number" size="small" fullWidth
                                                                                value={val ?? ''}
                                                                                onChange={e => setCompany(c => ({
                                                                                    ...c,
                                                                                    foreign: { ...c.foreign, [code]: e.target.value ? Number(e.target.value) : null },
                                                                                }))}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{fr?.rate_12 || '—'}</TableCell>
                                                                        <TableCell sx={{ p: 0.5 }}>
                                                                            <IconButton size="small" onClick={() => setCompany(c => {
                                                                                const f = { ...c.foreign }
                                                                                delete f[code]
                                                                                return { ...c, foreign: f }
                                                                            })}>
                                                                                <Delete fontSize="small" />
                                                                            </IconButton>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                )}
                                                <Autocomplete
                                                    options={available}
                                                    getOptionLabel={o => o.label}
                                                    size="small"
                                                    sx={{ maxWidth: 320 }}
                                                    value={null}
                                                    inputValue=""
                                                    onChange={(_, opt) => {
                                                        if (!opt) return
                                                        setCompany(c => ({
                                                            ...c,
                                                            foreign: { ...c.foreign, [opt.code]: entry.foreign[opt.code]?.rate_12 ?? null },
                                                        }))
                                                    }}
                                                    renderInput={params => (
                                                        <TextField {...params} label="Pridať prepis krajiny" slotProps={{ input: { ...params.slotProps?.input, startAdornment: <Add fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} /> } }} />
                                                    )}
                                                />
                                            </Box>
                                        )
                                    })()}
                                </Stack>
                            )}
                        </Stack>
                    )}

                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Zrušiť</Button>
                {tab === 'company' && (
                    <Button variant="contained" onClick={() => { onSave(company); onClose() }}>Uložiť</Button>
                )}
            </DialogActions>
        </Dialog>
    )
}

export default RatesDialog
