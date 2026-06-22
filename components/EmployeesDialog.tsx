import { useState } from 'react'
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, Stack, TextField, Typography,
} from '@mui/material'
import { Add, Delete, Edit } from '@mui/icons-material'
import type { EmployeeRecord, EmployeeFormData } from '../types'

type EmpDialogProps = {
    employees: EmployeeRecord[]
    onCreate: (data: EmployeeFormData) => Promise<void>
    onUpdate: (id: number, data: EmployeeFormData) => Promise<void>
    onDelete: (id: number) => Promise<void>
    onClose: () => void
}

const emptyForm = () => ({ name: '', address: '', defaultLocation: '', defaultFuelConsumption: '', defaultIsElectric: false, defaultEcv: '', rateKm: '', rateMeal5_12: '', rateMeal12_18: '', rateMeal18plus: '' })

const EmployeesDialog = ({ employees, onCreate, onUpdate, onDelete, onClose }: EmpDialogProps) => {
    const [editing, setEditing] = useState<EmployeeRecord | null>(null)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState(emptyForm())
    const [saving, setSaving] = useState(false)

    const openAdd = () => { setEditing(null); setForm(emptyForm()); setAdding(true) }
    const openEdit = (e: EmployeeRecord) => {
        setEditing(e)
        setForm({
            name: e.name,
            address: e.address ?? '',
            defaultLocation: e.defaultLocation ?? '',
            defaultFuelConsumption: e.defaultFuelConsumption != null ? String(e.defaultFuelConsumption) : '',
            defaultIsElectric: !!e.defaultIsElectric,
            defaultEcv: e.defaultEcv ?? '',
            rateKm: e.rateKm != null ? String(e.rateKm) : '',
            rateMeal5_12: e.rateMeal5_12 != null ? String(e.rateMeal5_12) : '',
            rateMeal12_18: e.rateMeal12_18 != null ? String(e.rateMeal12_18) : '',
            rateMeal18plus: e.rateMeal18plus != null ? String(e.rateMeal18plus) : '',
        })
        setAdding(true)
    }
    const cancel = () => { setAdding(false); setEditing(null) }

    const handleSave = async () => {
        if (!form.name.trim()) return
        setSaving(true)
        try {
            const data: EmployeeFormData = {
                name: form.name.trim(),
                address: form.address.trim() || undefined,
                defaultLocation: form.defaultLocation.trim() || undefined,
                defaultFuelConsumption: form.defaultFuelConsumption ? Number(form.defaultFuelConsumption) : undefined,
                defaultIsElectric: form.defaultIsElectric || undefined,
                defaultEcv: form.defaultEcv.trim().toUpperCase() || undefined,
                rateKm: form.rateKm ? Number(form.rateKm) : null,
                rateMeal5_12: form.rateMeal5_12 ? Number(form.rateMeal5_12) : null,
                rateMeal12_18: form.rateMeal12_18 ? Number(form.rateMeal12_18) : null,
                rateMeal18plus: form.rateMeal18plus ? Number(form.rateMeal18plus) : null,
            }
            if (editing) await onUpdate(editing.id, data)
            else         await onCreate(data)
            cancel()
        } finally { setSaving(false) }
    }

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
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
                                {(emp.address || emp.defaultLocation || emp.defaultFuelConsumption != null || emp.defaultEcv || emp.rateKm != null) && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {[
                                            emp.address,
                                            emp.defaultLocation ? `📍 ${emp.defaultLocation}` : '',
                                            emp.defaultFuelConsumption != null ? `${emp.defaultIsElectric ? '⚡' : '⛽'} ${emp.defaultFuelConsumption} ${emp.defaultIsElectric ? 'kWh/100km' : 'l/100km'}` : '',
                                            emp.defaultEcv ? `🚗 ${emp.defaultEcv}` : '',
                                            emp.rateKm != null ? `💶 ${emp.rateKm} €/km` : '',
                                        ].filter(Boolean).join(' · ')}
                                    </Typography>
                                )}
                            </Box>
                            <IconButton size="small" onClick={() => openEdit(emp)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" color="error" onClick={() => onDelete(emp.id)}><Delete fontSize="small" /></IconButton>
                        </Stack>
                    ))}

                    {adding && (
                        <Stack sx={{ gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                            <Typography variant="subtitle2">{editing ? 'Upraviť zamestnanca' : 'Nový zamestnanec'}</Typography>
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
                            <TextField
                                label={form.defaultIsElectric ? 'Predvolená spotreba (kWh/100km)' : 'Predvolená spotreba (l/100km)'}
                                type="number" size="small" fullWidth
                                slotProps={{ htmlInput: { step: 0.1 } }}
                                value={form.defaultFuelConsumption}
                                onChange={e => setForm(f => ({ ...f, defaultFuelConsumption: e.target.value }))} />
                            <FormControlLabel
                                control={<Checkbox size="small" checked={form.defaultIsElectric}
                                    onChange={e => setForm(f => ({ ...f, defaultIsElectric: e.target.checked }))} />}
                                label="Elektromobil" />
                            <TextField label="EČV (evidenčné číslo vozidla)" size="small" fullWidth
                                placeholder="napr. BA123AB"
                                value={form.defaultEcv}
                                onChange={e => setForm(f => ({ ...f, defaultEcv: e.target.value.toUpperCase() }))} />
                            <TextField
                                label="Individuálna sadzba km (EUR/km)"
                                type="number" size="small" fullWidth
                                slotProps={{ htmlInput: { step: 0.001 } }}
                                placeholder="prázdne = firemná / zákonná"
                                value={form.rateKm}
                                helperText="Napr. 0.25 — prepíše firemnú aj zákonnú sadzbu"
                                onChange={e => setForm(f => ({ ...f, rateKm: e.target.value }))} />
                            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>
                                Individuálne stravné (prázdne = firemná / zákonná sadzba)
                            </Typography>
                            <Stack direction="row" sx={{ gap: 1 }}>
                                <TextField
                                    label="Stravné 5–12 hod. (€)"
                                    type="number" size="small" fullWidth
                                    slotProps={{ htmlInput: { step: 0.01 } }}
                                    placeholder="zákonná"
                                    value={form.rateMeal5_12}
                                    onChange={e => setForm(f => ({ ...f, rateMeal5_12: e.target.value }))} />
                                <TextField
                                    label="Stravné 12–18 hod. (€)"
                                    type="number" size="small" fullWidth
                                    slotProps={{ htmlInput: { step: 0.01 } }}
                                    placeholder="zákonná"
                                    value={form.rateMeal12_18}
                                    onChange={e => setForm(f => ({ ...f, rateMeal12_18: e.target.value }))} />
                                <TextField
                                    label="Stravné 18+ hod. (€)"
                                    type="number" size="small" fullWidth
                                    slotProps={{ htmlInput: { step: 0.01 } }}
                                    placeholder="zákonná"
                                    value={form.rateMeal18plus}
                                    onChange={e => setForm(f => ({ ...f, rateMeal18plus: e.target.value }))} />
                            </Stack>
                            <Stack direction="row" sx={{ gap: 1 }}>
                                <Button size="small" onClick={cancel} disabled={saving}>Zrušiť</Button>
                                <Button size="small" variant="contained" onClick={handleSave}
                                    disabled={saving || !form.name.trim()}>
                                    {saving ? 'Ukladám…' : 'Uložiť'}
                                </Button>
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {!adding && (
                    <Button startIcon={<Add />} size="small" onClick={openAdd}>Pridať zamestnanca</Button>
                )}
                <Button onClick={onClose}>Zavrieť</Button>
            </DialogActions>
        </Dialog>
    )
}

export default EmployeesDialog
