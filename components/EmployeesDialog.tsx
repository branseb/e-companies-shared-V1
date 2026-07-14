import { useState, type ReactNode } from 'react'
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControlLabel, IconButton, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead,
    TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { Add, Delete, Edit } from '@mui/icons-material'
import type { EmployeeRecord, EmployeeFormData, ForeignStravneRate } from '../types'
import { COUNTRY_OPTIONS, FUEL_TYPE_OPTIONS, getFuelTypeInfo } from '../constants'
import ConfirmDialog from './ConfirmDialog'

type EmpDialogProps = {
    employees: EmployeeRecord[]
    foreignCountries?: Record<string, ForeignStravneRate>
    onCreate: (data: EmployeeFormData) => Promise<void>
    onUpdate: (id: number, data: EmployeeFormData) => Promise<void>
    onDelete: (id: number) => Promise<void>
    onClose: () => void
}

const SectionLabel = ({ children }: { children: ReactNode }) => (
    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1.2, fontSize: 11 }}>
        {children}
    </Typography>
)

const emptyForm = () => ({ name: '', address: '', defaultLocation: '', defaultFuelConsumption: '', defaultFuelType: '', defaultEcv: '', isMobileWorker: false, rateKm: '', useCustomStravne: false, rateMeal5_12: '', rateMeal12_18: '', rateMeal18plus: '', foreign: {} as Record<string, string> })

const EmployeesDialog = ({ employees, foreignCountries, onCreate, onUpdate, onDelete, onClose }: EmpDialogProps) => {
    const [editing, setEditing] = useState<EmployeeRecord | null>(null)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState(emptyForm())
    const [saving, setSaving] = useState(false)
    const [confirmState, setConfirmState] = useState<{ message: string; danger?: boolean; onConfirm: () => void } | null>(null)

    const openAdd = () => { setEditing(null); setForm(emptyForm()); setAdding(true) }
    const openEdit = (e: EmployeeRecord) => {
        setEditing(e)
        setForm({
            name: e.name,
            address: e.address ?? '',
            defaultLocation: e.defaultLocation ?? '',
            defaultFuelConsumption: e.defaultFuelConsumption != null ? String(e.defaultFuelConsumption) : '',
            defaultFuelType: e.defaultFuelType ?? (e.defaultIsElectric ? 'electric' : ''),
            defaultEcv: e.defaultEcv ?? '',
            isMobileWorker: !!e.isMobileWorker,
            rateKm: e.rateKm != null ? String(e.rateKm) : '',
            useCustomStravne: e.rateMeal5_12 != null || e.rateMeal12_18 != null || e.rateMeal18plus != null ||
                Object.values(e.foreign ?? {}).some(v => v != null),
            rateMeal5_12: e.rateMeal5_12 != null ? String(e.rateMeal5_12) : '',
            rateMeal12_18: e.rateMeal12_18 != null ? String(e.rateMeal12_18) : '',
            rateMeal18plus: e.rateMeal18plus != null ? String(e.rateMeal18plus) : '',
            foreign: Object.fromEntries(
                Object.entries(e.foreign ?? {}).map(([k, v]) => [k, v != null ? String(v) : ''])
            ),
        })
        setAdding(true)
    }
    const cancel = () => { setAdding(false); setEditing(null) }

    const handleSave = async () => {
        if (!form.name.trim()) return
        setSaving(true)
        try {
            const foreignData = form.useCustomStravne
                ? Object.fromEntries(Object.entries(form.foreign).map(([k, v]) => [k, v ? Number(v) : null]))
                : {}
            const data: EmployeeFormData = {
                name: form.name.trim(),
                address: form.address.trim() || undefined,
                defaultLocation: form.defaultLocation.trim() || undefined,
                defaultFuelConsumption: form.defaultFuelConsumption ? Number(form.defaultFuelConsumption) : undefined,
                defaultFuelType: form.defaultFuelType || undefined,
                defaultIsElectric: form.defaultFuelType === 'electric' || undefined,
                defaultEcv: form.defaultEcv.trim().toUpperCase() || undefined,
                isMobileWorker: form.isMobileWorker || undefined,
                rateKm: form.rateKm ? Number(form.rateKm) : null,
                rateMeal5_12: form.useCustomStravne && form.rateMeal5_12 ? Number(form.rateMeal5_12) : null,
                rateMeal12_18: form.useCustomStravne && form.rateMeal12_18 ? Number(form.rateMeal12_18) : null,
                rateMeal18plus: form.useCustomStravne && form.rateMeal18plus ? Number(form.rateMeal18plus) : null,
                foreign: Object.keys(foreignData).length ? foreignData : undefined,
            }
            if (editing) await onUpdate(editing.id, data)
            else         await onCreate(data)
            cancel()
        } finally { setSaving(false) }
    }

    const handleDialogClose = (_e: unknown, reason?: 'backdropClick' | 'escapeKeyDown') => {
        if (adding && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
            setConfirmState({
                message: 'Zavrieť bez uloženia? Rozrobený formulár zamestnanca sa stratí.',
                onConfirm: () => { cancel(); setConfirmState(null) },
            })
            return
        }
        onClose()
    }

    return (
        <>
        <Dialog open onClose={handleDialogClose} maxWidth="sm" fullWidth>
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
                                {(emp.address || emp.defaultLocation || emp.defaultFuelConsumption != null || emp.defaultEcv || emp.rateKm != null || emp.isMobileWorker) && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {[
                                            emp.address,
                                            emp.defaultLocation ? `📍 ${emp.defaultLocation}` : '',
                                            emp.defaultFuelConsumption != null ? `${emp.defaultFuelType === 'electric' ? '⚡' : '⛽'} ${emp.defaultFuelConsumption} ${getFuelTypeInfo(emp.defaultFuelType, emp.defaultIsElectric).consumptionUnit}` : '',
                                            emp.defaultEcv ? `🚗 ${emp.defaultEcv}` : '',
                                            emp.rateKm != null ? `💶 ${emp.rateKm} €/km` : '',
                                            emp.isMobileWorker ? '🚛 mobilný zamestnanec' : '',
                                        ].filter(Boolean).join(' · ')}
                                    </Typography>
                                )}
                            </Box>
                            <IconButton size="small" onClick={() => openEdit(emp)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" color="error"
                                onClick={() => setConfirmState({
                                    message: `Naozaj zmazať zamestnanca "${emp.name}"? Táto akcia sa nedá vrátiť späť.`,
                                    danger: true,
                                    onConfirm: () => { onDelete(emp.id); setConfirmState(null) },
                                })}>
                                <Delete fontSize="small" />
                            </IconButton>
                        </Stack>
                    ))}

                    {adding && (
                        <Stack sx={{ gap: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                            <Typography variant="subtitle2">{editing ? 'Upraviť zamestnanca' : 'Nový zamestnanec'}</Typography>

                            <Stack sx={{ gap: 1 }}>
                                <SectionLabel>Základné údaje</SectionLabel>
                                <TextField label="Meno a priezvisko" size="small" fullWidth required
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                <TextField label="Bydlisko" size="small" fullWidth
                                    value={form.address}
                                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                                <TextField label="Predvolené miesto odchodu/príchodu" size="small" fullWidth
                                    placeholder="napr. Košice"
                                    value={form.defaultLocation}
                                    onChange={e => setForm(f => ({ ...f, defaultLocation: e.target.value }))} />
                            </Stack>

                            <Divider />

                            <Stack sx={{ gap: 1 }}>
                                <SectionLabel>Vozidlo a palivo</SectionLabel>
                                <Stack direction="row" sx={{ gap: 1 }}>
                                    <TextField select label="Predvolený druh paliva" size="small" fullWidth
                                        value={form.defaultFuelType}
                                        onChange={e => setForm(f => ({ ...f, defaultFuelType: e.target.value }))}>
                                        <MenuItem value="">— nezadané —</MenuItem>
                                        {FUEL_TYPE_OPTIONS.map(o => (
                                            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        label={`Spotreba (${getFuelTypeInfo(form.defaultFuelType || undefined).consumptionUnit})`}
                                        type="number" size="small" fullWidth
                                        slotProps={{ htmlInput: { step: 0.1 } }}
                                        value={form.defaultFuelConsumption}
                                        onChange={e => setForm(f => ({ ...f, defaultFuelConsumption: e.target.value }))} />
                                </Stack>
                                <TextField label="EČV (evidenčné číslo vozidla)" size="small" fullWidth
                                    placeholder="napr. BA123AB"
                                    value={form.defaultEcv}
                                    onChange={e => setForm(f => ({ ...f, defaultEcv: e.target.value.toUpperCase() }))} />
                            </Stack>

                            <Divider />

                            <Stack sx={{ gap: 1 }}>
                                <SectionLabel>Sadzby a nároky</SectionLabel>
                                <Tooltip title="§ 1a Opatrenia MF SR č. 9/2026 — platia vyššie zahraničné sadzby pre 31 krajín EÚ a okolia od 30.1.2026" placement="right">
                                    <FormControlLabel
                                        control={
                                            <Switch size="small"
                                                checked={form.isMobileWorker}
                                                onChange={e => setForm(f => ({ ...f, isMobileWorker: e.target.checked }))} />
                                        }
                                        label={
                                            <Typography variant="body2">
                                                Mobilný zamestnanec v cestnej doprave
                                                <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                                                    (vodič — §1a)
                                                </Typography>
                                            </Typography>
                                        }
                                    />
                                </Tooltip>
                                <TextField
                                    label="Individuálna sadzba km (EUR/km)"
                                    type="number" size="small" fullWidth
                                    slotProps={{ htmlInput: { step: 0.001 } }}
                                    placeholder="prázdne = firemná / zákonná"
                                    value={form.rateKm}
                                    helperText="Napr. 0.25 — prepíše firemnú aj zákonnú sadzbu"
                                    onChange={e => setForm(f => ({ ...f, rateKm: e.target.value }))} />
                                <FormControlLabel
                                    control={
                                        <Switch size="small"
                                            checked={form.useCustomStravne}
                                            onChange={e => setForm(f => ({ ...f, useCustomStravne: e.target.checked }))} />
                                    }
                                    label={<Typography variant="body2">Individuálne stravné</Typography>}
                                />
                                {form.useCustomStravne && <>
                                <Stack direction="row" sx={{ gap: 1 }}>
                                    <TextField
                                        label="Stravné 5–12 hod. (€)"
                                        type="number" size="small" fullWidth
                                        slotProps={{ htmlInput: { step: 0.01 } }}
                                        placeholder="firemná / zákonná"
                                        value={form.rateMeal5_12}
                                        onChange={e => setForm(f => ({ ...f, rateMeal5_12: e.target.value }))} />
                                    <TextField
                                        label="Stravné 12–18 hod. (€)"
                                        type="number" size="small" fullWidth
                                        slotProps={{ htmlInput: { step: 0.01 } }}
                                        placeholder="firemná / zákonná"
                                        value={form.rateMeal12_18}
                                        onChange={e => setForm(f => ({ ...f, rateMeal12_18: e.target.value }))} />
                                    <TextField
                                        label="Stravné 18+ hod. (€)"
                                        type="number" size="small" fullWidth
                                        slotProps={{ htmlInput: { step: 0.01 } }}
                                        placeholder="firemná / zákonná"
                                        value={form.rateMeal18plus}
                                        onChange={e => setForm(f => ({ ...f, rateMeal18plus: e.target.value }))} />
                                </Stack>
                                {foreignCountries && Object.keys(foreignCountries).length > 0 && (
                                    <Box sx={{ mt: 0.5 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                                            Individuálne zahraničné stravné (prázdne = firemná / zákonná sadzba)
                                        </Typography>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Krajina</TableCell>
                                                    <TableCell sx={{ width: 55 }}>Mena</TableCell>
                                                    <TableCell sx={{ width: 130 }}>Sadzba (12+ hod.)</TableCell>
                                                    <TableCell sx={{ width: 80, color: 'text.secondary', fontSize: 12 }}>Ref.</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {Object.entries(foreignCountries).map(([code, fr]) => {
                                                    const label = COUNTRY_OPTIONS.find(c => c.code === code)?.label ?? fr.label ?? code
                                                    return (
                                                        <TableRow key={code}>
                                                            <TableCell sx={{ fontSize: 13 }}>{label}</TableCell>
                                                            <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{fr.currency}</TableCell>
                                                            <TableCell sx={{ p: 0.5 }}>
                                                                <Tooltip title="Prázdne = firemná / zákonná sadzba" placement="top">
                                                                    <TextField
                                                                        type="number" size="small" fullWidth
                                                                        placeholder={fr.rate_12 ? String(fr.rate_12) : '—'}
                                                                        value={form.foreign[code] ?? ''}
                                                                        onChange={e => setForm(f => ({
                                                                            ...f,
                                                                            foreign: { ...f.foreign, [code]: e.target.value },
                                                                        }))}
                                                                    />
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>
                                                                {fr.rate_12 || '—'}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                )}
                                </>}
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {!adding && (
                    <Button startIcon={<Add />} size="small" onClick={openAdd}>Pridať zamestnanca</Button>
                )}
                {adding ? (
                    <>
                        <Button size="small" onClick={cancel} disabled={saving}>Zrušiť</Button>
                        <Button size="small" variant="contained" onClick={handleSave}
                            disabled={saving || !form.name.trim()}>
                            {saving ? 'Ukladám…' : 'Uložiť'}
                        </Button>
                    </>
                ) : (
                    <Button onClick={onClose}>Zavrieť</Button>
                )}
            </DialogActions>
        </Dialog>
        <ConfirmDialog
            open={!!confirmState}
            message={confirmState?.message ?? ''}
            danger={confirmState?.danger}
            onConfirm={() => confirmState?.onConfirm()}
            onCancel={() => setConfirmState(null)}
        />
        </>
    )
}

export default EmployeesDialog
