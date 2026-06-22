import { useState } from 'react'
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, Stack, TextField, Typography,
} from '@mui/material'
import { Add } from '@mui/icons-material'
import type { TravelPreferences } from '../types'

type Props = {
    preferences: TravelPreferences
    onSave: (prefs: TravelPreferences) => void
    onClose: () => void
}

const ChipList = ({
    items, onDelete, inputLabel, inputPlaceholder, onAdd,
}: {
    items: string[]
    onDelete: (i: number) => void
    inputLabel: string
    inputPlaceholder: string
    onAdd: (val: string) => void
}) => {
    const [input, setInput] = useState('')
    const handleAdd = () => {
        const v = input.trim()
        if (!v || items.includes(v)) return
        onAdd(v)
        setInput('')
    }
    return (
        <Box>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5, minHeight: 32 }}>
                {items.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', alignSelf: 'center' }}>
                        Žiadne vlastné hodnoty
                    </Typography>
                )}
                {items.map((item, i) => (
                    <Chip key={i} label={item} size="small" onDelete={() => onDelete(i)} />
                ))}
            </Stack>
            <Stack direction="row" sx={{ gap: 1 }}>
                <TextField
                    size="small" label={inputLabel} placeholder={inputPlaceholder}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                    sx={{ flex: 1 }}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button size="small" variant="outlined" startIcon={<Add />}
                    disabled={!input.trim() || items.includes(input.trim())}
                    onClick={handleAdd}>
                    Pridať
                </Button>
            </Stack>
        </Box>
    )
}

const PreferencesDialog = ({ preferences, onSave, onClose }: Props) => {
    const [prefs, setPrefs] = useState<TravelPreferences>({
        customPurposes: [...preferences.customPurposes],
        customPlaces:   [...preferences.customPlaces],
    })

    const updatePurposes = (customPurposes: string[]) => setPrefs(p => ({ ...p, customPurposes }))
    const updatePlaces   = (customPlaces: string[])   => setPrefs(p => ({ ...p, customPlaces }))

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Predvolby cestovných príkazov</DialogTitle>
            <DialogContent>
                <Stack sx={{ gap: 0, mt: 1 }}>
                    <Divider textAlign="left" sx={{ mb: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            Vlastné účely cesty
                        </Typography>
                    </Divider>
                    <ChipList
                        items={prefs.customPurposes}
                        onDelete={i => updatePurposes(prefs.customPurposes.filter((_, j) => j !== i))}
                        onAdd={v => updatePurposes([...prefs.customPurposes, v])}
                        inputLabel="Nový účel"
                        inputPlaceholder="napr. Servisná obhliadka"
                    />

                    <Divider textAlign="left" sx={{ mt: 3, mb: 2 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            Vlastné miesta rokovania
                        </Typography>
                    </Divider>
                    <ChipList
                        items={prefs.customPlaces}
                        onDelete={i => updatePlaces(prefs.customPlaces.filter((_, j) => j !== i))}
                        onAdd={v => updatePlaces([...prefs.customPlaces, v])}
                        inputLabel="Nové miesto"
                        inputPlaceholder="napr. Senec, areál zákazníka"
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Zrušiť</Button>
                <Button variant="contained" onClick={() => { onSave(prefs); onClose() }}>Uložiť</Button>
            </DialogActions>
        </Dialog>
    )
}

export default PreferencesDialog
