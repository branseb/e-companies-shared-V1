import { TextField } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

type Props = {
    label: string
    value: string
    onChange: (value: string) => void
    sx?: SxProps<Theme>
    size?: 'small' | 'medium'
}

const TimePickerField = ({ label, value, onChange, sx, size }: Props) => (
    <TextField
        label={label}
        type="time"
        size={size ?? 'medium'}
        sx={sx}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { autoComplete: 'off' } }}
        value={value}
        onChange={e => onChange(e.target.value)}
    />
)

export default TimePickerField
