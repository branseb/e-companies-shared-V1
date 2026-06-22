import { useState } from 'react'
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead,
    TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import type { StravneRatesEntry, CompanyRateConfig } from '../types'
import { COUNTRY_OPTIONS } from '../constants'

type RatesDialogProps = {
    onClose: () => void
    companyRates?: CompanyRateConfig | null
    onSave: (rates: CompanyRateConfig) => void
    legalEntry?: StravneRatesEntry | null
}

const RatesDialog = ({ onClose, companyRates, onSave, legalEntry }: RatesDialogProps) => {
    const [tab, setTab] = useState<'legal' | 'company'>('legal')
    const [company, setCompany] = useState<CompanyRateConfig>(companyRates ?? {})

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
                            {!legalEntry ? (
                                <Typography sx={{ color: 'text.secondary' }}>Sadzby sa načítavajú…</Typography>
                            ) : (
                                <>
                                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Chip size="small" label={`platné od ${legalEntry.validFrom}`} color="primary" />
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            Sadzby sú spravované centrálne a aktualizujú sa automaticky.
                                        </Typography>
                                    </Stack>

                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                            Tuzemsko (SR) — EUR
                                        </Typography>
                                        <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                                            {[
                                                { label: '5–12 hod.', value: legalEntry.sk_5 },
                                                { label: '12–18 hod.', value: legalEntry.sk_12 },
                                                { label: '18+ hod.', value: legalEntry.sk_18 },
                                            ].map(({ label, value }) => (
                                                <TextField key={label} label={label} size="small" sx={{ width: 140 }}
                                                    value={value} slotProps={{ input: { readOnly: true } }} />
                                            ))}
                                            <TextField label="Amortizácia (€/km)" size="small" sx={{ width: 160 }}
                                                value={legalEntry.amortizationRate ?? '—'} slotProps={{ input: { readOnly: true } }} />
                                        </Stack>
                                    </Box>

                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                                            Krátenie za bezplatné stravovanie
                                        </Typography>
                                        <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                                            {[
                                                { label: 'Raňajky', value: `${(legalEntry.meals.ranajky * 100).toFixed(0)} %` },
                                                { label: 'Obed', value: `${(legalEntry.meals.obed * 100).toFixed(0)} %` },
                                                { label: 'Večera', value: `${(legalEntry.meals.vecera * 100).toFixed(0)} %` },
                                            ].map(({ label, value }) => (
                                                <TextField key={label} label={label} size="small" sx={{ width: 120 }}
                                                    value={value} slotProps={{ input: { readOnly: true } }} />
                                            ))}
                                        </Stack>
                                    </Box>

                                    {Object.keys(legalEntry.foreign).length > 0 && (
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
                                                    {Object.entries(legalEntry.foreign).map(([code, fr]) => {
                                                        const label = COUNTRY_OPTIONS.find(c => c.code === code)?.label ?? fr.label ?? code
                                                        return (
                                                            <TableRow key={code}>
                                                                <TableCell>{label}</TableCell>
                                                                <TableCell sx={{ color: 'text.secondary' }}>{fr.currency}</TableCell>
                                                                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                                    {fr.rate_12 ? (fr.rate_12 * 0.25).toFixed(2) : '—'}
                                                                </TableCell>
                                                                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                                                                    {fr.rate_12 ? (fr.rate_12 * 0.5).toFixed(2) : '—'}
                                                                </TableCell>
                                                                <TableCell sx={{ fontWeight: 500 }}>{fr.rate_12 || '—'}</TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
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
                                            placeholder={legalEntry?.amortizationRate ? String(legalEntry.amortizationRate) : '0.313'}
                                            value={company.kmRate ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, kmRate: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná sadzba"
                                        />
                                        <TextField
                                            label="Stravné 5–12 hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={legalEntry?.sk_5 ? String(legalEntry.sk_5) : 'zákonná'}
                                            value={company.meal5_12 ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal5_12: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                        <TextField
                                            label="Stravné 12–18 hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={legalEntry?.sk_12 ? String(legalEntry.sk_12) : 'zákonná'}
                                            value={company.meal12_18 ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal12_18: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                        <TextField
                                            label="Stravné 18+ hod."
                                            type="number" size="small" sx={{ width: 160 }}
                                            placeholder={legalEntry?.sk_18 ? String(legalEntry.sk_18) : 'zákonná'}
                                            value={company.meal18plus ?? ''}
                                            onChange={e => setCompany(c => ({ ...c, meal18plus: e.target.value ? Number(e.target.value) : null }))}
                                            helperText="Prázdne = zákonná"
                                        />
                                    </Stack>

                                    {legalEntry && Object.keys(legalEntry.foreign).length > 0 && (
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                                                Zahraničné stravné — firemné prepisy (prázdne = zákonná sadzba)
                                            </Typography>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Krajina</TableCell>
                                                        <TableCell sx={{ width: 60 }}>Mena</TableCell>
                                                        <TableCell sx={{ width: 130 }}>Firemná sadzba (12+ hod.)</TableCell>
                                                        <TableCell sx={{ width: 90, color: 'text.secondary', fontSize: 12 }}>Zákonná</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {Object.entries(legalEntry.foreign).map(([code, fr]) => {
                                                        const label = COUNTRY_OPTIONS.find(c => c.code === code)?.label ?? fr.label ?? code
                                                        return (
                                                            <TableRow key={code}>
                                                                <TableCell>{label}</TableCell>
                                                                <TableCell sx={{ color: 'text.secondary' }}>{fr.currency}</TableCell>
                                                                <TableCell sx={{ p: 0.5 }}>
                                                                    <Tooltip title="Prázdne = zákonná sadzba" placement="top">
                                                                        <TextField
                                                                            type="number" size="small" fullWidth
                                                                            placeholder={fr.rate_12 ? String(fr.rate_12) : '—'}
                                                                            value={company.foreign?.[code] ?? ''}
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
                                    )}
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
