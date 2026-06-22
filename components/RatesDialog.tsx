import { useState } from 'react'
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Stack, Switch, Table, TableBody, TableCell, TableHead,
    TableRow, TextField, Tooltip, Typography,
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
    const [company, setCompany] = useState<CompanyRateConfig>(companyRates ?? {})

    return (
        <Dialog open onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Firemné sadzby stravného</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 1.5, mt: 1 }}>
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
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Zrušiť</Button>
                <Button variant="contained" onClick={() => { onSave(company); onClose() }}>Uložiť</Button>
            </DialogActions>
        </Dialog>
    )
}

export default RatesDialog
