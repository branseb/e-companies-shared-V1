import { useState } from 'react'
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, Stack, TextField, Typography,
} from '@mui/material'
import { Add, Delete, Edit } from '@mui/icons-material'
import type { EmployeeRecord } from '../types'

type EmpDialogProps = {
    employees: EmployeeRecord[]
    onCreate: (data: { name: string; address?: string; defaultLocation?: string; defaultFuelConsumption?: number; defaultEcv?: string }) => Promise<void>
    onUpdate: (id: number, data: { name: string; address?: string; defaultLocation?: string; defaultFuelConsumption?: number; defaultEcv?: string }) => Promise<void>
    onDelete: (id: number) => Promise<void>
    onClose: () => void
}

const EmployeesDialog = ({ employees, onCreate, onUpdate, onDelete, onClose }: EmpDialogProps) => {
    const [editing, setEditing] = useState<EmployeeRecord | null>(null)
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState({ name: '', address: '', defaultLocation: '', defaultFuelConsumption: '', defaultEcv: '' })
    const [saving, setSaving] = useState(false)

    const openAdd = () => { setEditing(null); setForm({ name: '', address: '', defaultLocation: '', defaultFuelConsumption: '', defaultEcv: '' }); setAdding(true) }
    const openEdit = (e: EmployeeRecord) => { setEditing(e); setForm({ name: e.name, address: e.address ?? '', defaultLocation: e.defaultLocation ?? '', defaultFuelConsumption: e.defaultFuelConsumption != null ? String(e.defaultFuelConsumption) : '', defaultEcv: e.defaultEcv ?? '' }); setAdding(true) }
    const cancel = () => { setAdding(false); setEditing(null) }

    const handleSave = async () => {
        if (!form.name.trim()) return
        setSaving(true)
        try {
            const data = {
                name: form.name.trim(),
                address: form.address.trim() || undefined,
                defaultLocation: form.defaultLocation.trim() || undefined,
                defaultFuelConsumption: form.defaultFuelConsumption ? Number(form.defaultFuelConsumption) : undefined,
                defaultEcv: form.defaultEcv.trim().toUpperCase() || undefined,
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
                                {(emp.address || emp.defaultLocation || emp.defaultFuelConsumption != null || emp.defaultEcv) && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {[
                                            emp.address,
                                            emp.defaultLocation ? `📍 ${emp.defaultLocation}` : '',
                                            emp.defaultFuelConsumption != null ? `⛽ ${emp.defaultFuelConsumption} l/100km` : '',
                                            emp.defaultEcv ? `🚗 ${emp.defaultEcv}` : '',
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
                            <TextField label="Predvolená spotreba (l/100km)" type="number" size="small" fullWidth
                                slotProps={{ htmlInput: { step: 0.1 } }}
                                value={form.defaultFuelConsumption}
                                onChange={e => setForm(f => ({ ...f, defaultFuelConsumption: e.target.value }))} />
                            <TextField label="EČV (evidenčné číslo vozidla)" size="small" fullWidth
                                placeholder="napr. BA123AB"
                                value={form.defaultEcv}
                                onChange={e => setForm(f => ({ ...f, defaultEcv: e.target.value.toUpperCase() }))} />
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
